// ============================================================================
// SPEC ROUTES PART 2 — COMMERCIAL + CUSTOMER-FACING
// ----------------------------------------------------------------------------
// Covers the remaining master-spec areas: Stripe subscription state, paid
// add-ons, the bisque piece catalogue, QR booking codes (spec Phase 3), and
// the customer-facing session view a QR scan lands on.
//
// All read the REAL existing schema. Nothing here creates a Stripe charge --
// STRIPE_SECRET_KEY on this service is a placeholder, so billing is reported,
// never initiated. That is deliberate: the spec wants billing visible in the
// admin surface, and taking real money from a demo app would be wrong.
// ============================================================================

// Spec pricing tiers (studios subscribe at GBP 29-79/month).
const PLANS = [
  { id: 'starter', name: 'Starter', price_cents: 2900, blurb: 'Single studio, core booking and piece tracking' },
  { id: 'studio', name: 'Studio', price_cents: 4900, blurb: 'Adds kiln workflow, loyalty and customer notifications' },
  { id: 'pro', name: 'Pro', price_cents: 7900, blurb: 'Adds AI piece matching, analytics and the design tools' },
];

export default function registerSpecRoutes2(app, supabase, STUDIO_ID, logger, JUNK_BOOKING_LABELS = []) {
  // --------------------------------------------------------------------------
  // BILLING (spec Phase 1: Stripe subscription billing)
  // --------------------------------------------------------------------------
  app.get('/api/spec/billing', async (req, res) => {
    try {
      const [{ data: sub }, { data: addons }, { data: aiUsage }] = await Promise.all([
        supabase.from('stripe_subscriptions').select('*').eq('studio_id', STUDIO_ID).maybeSingle(),
        supabase.from('studio_addons').select('addon_key, enabled, monthly_price_cents, enabled_at').eq('studio_id', STUDIO_ID),
        supabase.from('ai_usage').select('cost_usd, created_at').eq('studio_id', STUDIO_ID).limit(1000),
      ]);

      const enabledAddons = (addons || []).filter((a) => a.enabled);
      const addonMonthly = enabledAddons.reduce((s, a) => s + (a.monthly_price_cents || 0), 0);

      const plan = sub ? PLANS.find((p) => p.id === sub.plan_id) || null : null;
      const planMonthly = plan ? plan.price_cents : 0;

      // AI spend this calendar month -- the spec requires AI cost be controlled
      // and logged, so it is surfaced next to the subscription, not hidden.
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      // Column is cost_usd (numeric dollars), NOT cents -- verified against
      // the live schema. Converted here so the client only handles cents.
      const aiThisMonthUsd = (aiUsage || [])
        .filter((u) => u.created_at && new Date(u.created_at) >= monthStart)
        .reduce((s, u) => s + Number(u.cost_usd || 0), 0);
      const aiThisMonth = Math.round(aiThisMonthUsd * 100);

      res.json({
        plans: PLANS,
        subscription: sub || null,
        current_plan: plan,
        addons: addons || [],
        enabled_addons: enabledAddons,
        monthly_total_cents: planMonthly + addonMonthly,
        ai_spend_this_month_cents: aiThisMonth,
        billing_live: false,
        billing_note: 'Subscription state is read from Stripe records. This app never creates a charge.',
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // PIECE CATALOGUE (spec Phase 2: bisque in stock)
  // --------------------------------------------------------------------------
  app.get('/api/spec/catalogue', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('piece_catalogue')
        .select('id, name, category, description, price_cents, image_url, stock_count, height_cm, width_cm, active')
        .eq('studio_id', STUDIO_ID)
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;

      const rows = (data || []).filter((r) => r.active !== false);
      const byCategory = {};
      rows.forEach((r) => {
        const c = r.category || 'Uncategorised';
        if (!byCategory[c]) byCategory[c] = [];
        byCategory[c].push(r);
      });

      const lowStock = rows.filter((r) => (r.stock_count ?? 0) > 0 && (r.stock_count ?? 0) <= 3);
      const outOfStock = rows.filter((r) => (r.stock_count ?? 0) === 0);

      res.json({
        items: rows,
        by_category: byCategory,
        categories: Object.keys(byCategory),
        total: rows.length,
        low_stock: lowStock,
        out_of_stock_count: outOfStock.length,
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // QR BOOKING CODES (spec Phase 3)
  // --------------------------------------------------------------------------
  // The spec generates a QR per booking encoding /app?booking=CODE. No new
  // table is needed -- booking_code IS the payload, so the "QR code" is derived,
  // not stored. Avoids a booking_qr_codes table that could drift out of sync.
  app.get('/api/spec/bookings/:code/qr', async (req, res) => {
    try {
      const { data: booking, error } = await supabase
        .from('bookings')
        .select('booking_code, customer_name, session_start, table_number, party_size, current_stage')
        .eq('studio_id', STUDIO_ID)
        .eq('booking_code', req.params.code)
        .maybeSingle();
      if (error) throw error;
      if (!booking) return res.status(404).json({ error: 'Booking not found' });

      res.json({
        booking,
        // Client renders this to an actual QR image; the payload is the URL a
        // customer's phone camera opens.
        payload: `/customer?booking=${encodeURIComponent(booking.booking_code)}`,
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // CUSTOMER SESSION VIEW (spec Phase 3: what a QR scan lands on)
  // --------------------------------------------------------------------------
  // "Shows their table number, their order total, their pieces, their loyalty
  // points." Scoped strictly to one booking_code -- a scanned code can only
  // ever reach its own session, never browse other customers.
  app.get('/api/spec/customer/:code', async (req, res) => {
    try {
      const code = req.params.code;

      const { data: booking } = await supabase
        .from('bookings')
        .select('booking_code, customer_name, session_start, table_number, party_size, current_stage, status')
        .eq('studio_id', STUDIO_ID)
        .eq('booking_code', code)
        .maybeSingle();

      if (!booking) return res.status(404).json({ error: 'Booking not found' });

      const [{ data: pieces }, { data: loyalty }, { data: photos }] = await Promise.all([
        supabase.from('pottery_pieces')
          .select('id, piece_type, status, description, reference_photo_url, mark_code')
          .eq('studio_id', STUDIO_ID)
          .eq('booking_id', booking.customer_name)
          .neq('archived', true),
        supabase.from('loyalty_transactions')
          .select('points_earned, points_spent')
          .eq('studio_id', STUDIO_ID)
          .eq('booking_code', code),
        supabase.from('demo_app_photo_matches')
          .select('photo_url, ai_description, created_at')
          .eq('booking_code', code)
          .order('created_at', { ascending: false }),
      ]);

      const pts = (loyalty || []).reduce(
        (acc, r) => ({ earned: acc.earned + (r.points_earned || 0), spent: acc.spent + (r.points_spent || 0) }),
        { earned: 0, spent: 0 }
      );

      // Exclude test-run pieces so a customer never sees engine-test junk.
      const p = (pieces || []).filter((x) => !JUNK_BOOKING_LABELS.includes(booking.customer_name));
      const ready = p.filter((x) => ['fired', 'packed', 'ready_for_pickup'].includes((x.status || '').toLowerCase()));
      const inKiln = p.filter((x) => ['kiln_queue', 'firing'].includes((x.status || '').toLowerCase()));

      // First name only, matching the community feed rule.
      const firstName = (booking.customer_name || '').trim().split(/\s+/)[0] || 'there';

      res.json({
        greeting: `Hello ${firstName}`,
        booking,
        pieces: p,
        piece_count: p.length,
        ready_count: ready.length,
        in_kiln_count: inKiln.length,
        loyalty: { ...pts, balance: pts.earned - pts.spent },
        photos: photos || [],
        status_message: ready.length
          ? `${ready.length} piece${ready.length === 1 ? '' : 's'} ready to collect`
          : inKiln.length
            ? `${inKiln.length} piece${inKiln.length === 1 ? '' : 's'} firing now`
            : 'Nothing in the kiln right now',
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // DESIGN TOOL CONFIG (spec: Colour Picker free, Design Preview + Transfer £1)
  // --------------------------------------------------------------------------
  app.get('/api/spec/design-tools', async (req, res) => {
    try {
      const { data: cfg } = await supabase
        .from('ai_design_config')
        .select('enabled, customer_generation_price_cents, customer_print_price_cents')
        .eq('studio_id', STUDIO_ID)
        .maybeSingle();

      res.json({
        tools: [
          { key: 'colour-picker', name: 'Colour Picker', price_cents: 0, note: 'Free — match a glaze to a colour' },
          { key: 'design-preview', name: 'Design Preview', price_cents: cfg?.customer_generation_price_cents ?? 100, note: 'Preview a design on a piece shape' },
          { key: 'transfer-designer', name: 'Transfer Designer', price_cents: cfg?.customer_print_price_cents ?? 100, note: 'Draw a design, print as a transfer' },
        ],
        ai_enabled: cfg?.enabled ?? false,
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// STAFF PIN GATE
// ----------------------------------------------------------------------------
// A light "who's on shift" gate, not a security boundary. Deliberately honest
// about that: PINs are stored as unsalted SHA-256 and every staff member
// currently shares the same one, so this identifies a shift, not a person.
// Verification happens server-side so the hash never reaches the browser.
// ============================================================================
export function registerPinRoutes(app, supabase, STUDIO_ID, logger, crypto) {
  app.post('/api/spec/pin/verify', async (req, res) => {
    try {
      const { pin } = req.body || {};
      if (!pin) return res.status(400).json({ error: 'PIN required' });

      const hash = crypto.createHash('sha256').update(String(pin)).digest('hex');

      const { data: pins, error } = await supabase
        .from('staff_pins')
        .select('staff_member_id, pin_hash')
        .eq('studio_id', STUDIO_ID);
      if (error) throw error;

      const match = (pins || []).find((p) => p.pin_hash === hash);
      if (!match) return res.status(401).json({ ok: false, error: 'PIN not recognised' });

      const { data: staff } = await supabase
        .from('staff_team')
        .select('name, role')
        .eq('id', match.staff_member_id)
        .maybeSingle();

      // How many people share this PIN -- surfaced so the UI can be honest
      // rather than greeting one named person when the PIN is shared.
      const sharedBy = (pins || []).filter((p) => p.pin_hash === hash).length;

      res.json({
        ok: true,
        staff: staff || null,
        shared: sharedBy > 1,
        shared_by: sharedBy,
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// REMAINING SPEC GAPS: archive, manual descriptions, collections, listings
// ============================================================================
export function registerGapRoutes(app, supabase, STUDIO_ID, logger, JUNK_BOOKING_LABELS = []) {
  // --------------------------------------------------------------------------
  // ARCHIVE — remove-but-keep (spec: prefer archival over deletion)
  // --------------------------------------------------------------------------
  app.post('/api/spec/pieces/:id/archive', async (req, res) => {
    try {
      const { archived } = req.body || {};
      const { data, error } = await supabase
        .from('pottery_pieces')
        .update({ archived: archived !== false })
        .eq('id', req.params.id)
        .eq('studio_id', STUDIO_ID)
        .select('id, archived')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Piece not found' });
      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Archived pieces, so anything removed can always be found and restored.
  app.get('/api/spec/pieces/archived', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('pottery_pieces')
        .select('id, booking_id, piece_type, status, description, reference_photo_url, mark_code, updated_at')
        .eq('studio_id', STUDIO_ID)
        .eq('archived', true)
        .order('updated_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      res.json({ pieces: data || [], count: (data || []).length });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // MANUAL DESCRIPTION EDIT — AI writes, a human corrects
  // --------------------------------------------------------------------------
  app.post('/api/spec/pieces/:id/description', async (req, res) => {
    try {
      const { description } = req.body || {};
      if (typeof description !== 'string') {
        return res.status(400).json({ error: 'description required' });
      }
      const { data, error } = await supabase
        .from('pottery_pieces')
        .update({ description: description.trim(), described_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('studio_id', STUDIO_ID)
        .select('id, description, described_at')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Piece not found' });
      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // COLLECTIONS — a customer's pieces across every visit (spec section 12)
  // --------------------------------------------------------------------------
  // pottery_pieces.booking_id holds a customer NAME (free text), which is why
  // grouping is by name rather than by a customer_id -- customer_id is null
  // throughout the real data. Documented so this isn't "fixed" into a join
  // that would return nothing.
  app.get('/api/spec/collections', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('pottery_pieces')
        .select('id, booking_id, piece_type, status, description, reference_photo_url, created_at')
        .eq('studio_id', STUDIO_ID)
        .neq('archived', true)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;

      const real = (data || []).filter(
        (p) => p.booking_id && !JUNK_BOOKING_LABELS.includes(p.booking_id)
      );

      const byPerson = {};
      real.forEach((p) => {
        const k = p.booking_id;
        if (!byPerson[k]) byPerson[k] = { name: k, pieces: [], first: p.created_at, last: p.created_at };
        byPerson[k].pieces.push(p);
        if (p.created_at < byPerson[k].first) byPerson[k].first = p.created_at;
        if (p.created_at > byPerson[k].last) byPerson[k].last = p.created_at;
      });

      const collections = Object.values(byPerson)
        .map((c) => ({ ...c, piece_count: c.pieces.length }))
        .sort((a, b) => b.piece_count - a.piece_count);

      res.json({ collections, count: collections.length });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // MARKETPLACE LISTING — submitting a design, not just browsing
  // --------------------------------------------------------------------------
  app.post('/api/spec/marketplace', async (req, res) => {
    try {
      const { title, description, price_cents, customer_display_name, image_data } = req.body || {};
      if (!title) return res.status(400).json({ error: 'title required' });

      const { data, error } = await supabase
        .from('marketplace_designs')
        .insert([{
          studio_id: STUDIO_ID,
          title: String(title).slice(0, 120),
          description: description ? String(description).slice(0, 600) : null,
          price_cents: Number.isFinite(price_cents) ? price_cents : 0,
          // First name only, matching the community feed rule.
          customer_display_name: (customer_display_name || '').trim().split(/\s+/)[0] || null,
          image_data: image_data || null,
          download_count: 0,
        }])
        .select('id, title, price_cents, created_at')
        .maybeSingle();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}
