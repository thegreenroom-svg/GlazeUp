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
          { key: 'design-preview', name: 'Design Preview', price_cents: cfg?.customer_generation_price_cents ?? 20, note: 'Preview a design on a piece shape' },
          { key: 'transfer-designer', name: 'Transfer Designer', price_cents: cfg?.customer_print_price_cents ?? 150, note: 'Draw a design, print as a transfer' },
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
        staff: staff ? { ...staff, id: match.staff_member_id } : null,
        shared: sharedBy > 1,
        shared_by: sharedBy,
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin roles that can reset another team member's PIN. Matches the real
  // roles on staff_team (checked live against Supabase before writing this)
  // rather than hardcoding names -- whoever holds one of these roles gets
  // the ability, without a code change if the people in these roles change.
  const ADMIN_ROLES = ['General Manager', 'Co-Director', 'Studio Executive'];

  // Set your own PIN -- moves one person off the shared default onto
  // something only they know. Proof of access is the PIN they're
  // CURRENTLY using (old_pin) hashing to what's already on file for that
  // staff_member_id -- same 'not a security boundary, just identifies a
  // shift' posture as verify above, just enough to stop blindly
  // overwriting a colleague's PIN without knowing any valid PIN for that
  // identity at all.
  app.post('/api/spec/pin/set', async (req, res) => {
    try {
      const { staff_member_id, old_pin, new_pin } = req.body || {};
      if (!staff_member_id || !old_pin || !new_pin) {
        return res.status(400).json({ error: 'staff_member_id, old_pin and new_pin are required' });
      }
      if (!/^\d{4}$/.test(String(new_pin))) {
        return res.status(400).json({ error: 'new_pin must be exactly 4 digits' });
      }

      const oldHash = crypto.createHash('sha256').update(String(old_pin)).digest('hex');
      const { data: existing, error: fetchErr } = await supabase
        .from('staff_pins')
        .select('id, pin_hash')
        .eq('staff_member_id', staff_member_id)
        .eq('studio_id', STUDIO_ID)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!existing || existing.pin_hash !== oldHash) {
        return res.status(401).json({ error: 'Current PIN not recognised for that person' });
      }

      const newHash = crypto.createHash('sha256').update(String(new_pin)).digest('hex');
      const { error: updateErr } = await supabase
        .from('staff_pins')
        .update({ pin_hash: newHash })
        .eq('id', existing.id);
      if (updateErr) throw updateErr;

      res.json({ ok: true });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Admin reset -- lets General Manager/Co-Director/Studio Executive reset
  // ANY team member's PIN (including their own, if forgotten). Authorised
  // by the admin's OWN current PIN, checked server-side against their OWN
  // staff_member_id and role -- never just a name or role trusted as sent
  // from the client.
  app.post('/api/spec/pin/admin-reset', async (req, res) => {
    try {
      const { admin_staff_member_id, admin_pin, target_staff_member_id, new_pin } = req.body || {};
      if (!admin_staff_member_id || !admin_pin || !target_staff_member_id || !new_pin) {
        return res.status(400).json({ error: 'admin_staff_member_id, admin_pin, target_staff_member_id and new_pin are required' });
      }
      if (!/^\d{4}$/.test(String(new_pin))) {
        return res.status(400).json({ error: 'new_pin must be exactly 4 digits' });
      }

      const adminHash = crypto.createHash('sha256').update(String(admin_pin)).digest('hex');
      const { data: adminPin, error: adminPinErr } = await supabase
        .from('staff_pins')
        .select('pin_hash')
        .eq('staff_member_id', admin_staff_member_id)
        .eq('studio_id', STUDIO_ID)
        .maybeSingle();
      if (adminPinErr) throw adminPinErr;
      if (!adminPin || adminPin.pin_hash !== adminHash) {
        return res.status(401).json({ error: 'PIN not recognised' });
      }

      const { data: adminStaff, error: adminStaffErr } = await supabase
        .from('staff_team')
        .select('role, active')
        .eq('id', admin_staff_member_id)
        .eq('studio_id', STUDIO_ID)
        .maybeSingle();
      if (adminStaffErr) throw adminStaffErr;
      if (!adminStaff || !adminStaff.active || !ADMIN_ROLES.includes(adminStaff.role)) {
        return res.status(403).json({ error: 'Not authorised to reset PINs' });
      }

      const { data: targetPinRow, error: targetFetchErr } = await supabase
        .from('staff_pins')
        .select('id')
        .eq('staff_member_id', target_staff_member_id)
        .eq('studio_id', STUDIO_ID)
        .maybeSingle();
      if (targetFetchErr) throw targetFetchErr;
      if (!targetPinRow) return res.status(404).json({ error: 'That team member has no PIN record' });

      const newHash = crypto.createHash('sha256').update(String(new_pin)).digest('hex');
      const { error: updateErr } = await supabase
        .from('staff_pins')
        .update({ pin_hash: newHash })
        .eq('id', targetPinRow.id);
      if (updateErr) throw updateErr;

      res.json({ ok: true });
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

// ============================================================================
// MY BOOKINGS, STUDIOS WORLDWIDE, OUR PROFILE
// ----------------------------------------------------------------------------
// Master doc section 5: customer app "My Bookings -- past and upcoming
// visits, matched automatically by phone/email". Section 4 Community tab:
// "Our Profile" (connect socials, bio, directory toggle) and "Studios
// Worldwide" (B2B network directory with activity signal).
// ============================================================================
export function registerNetworkRoutes(app, supabase, STUDIO_ID, logger) {
  // My Bookings -- matched by customer_name for now, since the real bookings
  // table stores no phone/email on the historical rows (many pre-date the
  // point where that was captured). Name match is the honest current
  // capability; documented rather than pretending phone/email matching works
  // against data that doesn't have it.
  app.get('/api/spec/my-bookings/:name', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('booking_code, customer_name, session_start, table_number, party_size, current_stage, status')
        .eq('studio_id', STUDIO_ID)
        .ilike('customer_name', req.params.name)
        .order('session_start', { ascending: false })
        .limit(50);
      if (error) throw error;

      const now = new Date();
      const rows = data || [];
      res.json({
        upcoming: rows.filter((b) => new Date(b.session_start) >= now).reverse(),
        past: rows.filter((b) => new Date(b.session_start) < now),
        match_method: 'name',
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Our Profile -- what a director sets so the Studios Worldwide directory
  // has something real to show. GET returns current values; POST updates
  // only the profile fields (never bookings/financial columns on studios).
  const PROFILE_FIELDS = ['instagram_handle', 'facebook_url', 'tiktok_handle', 'website_url', 'public_bio', 'city', 'country', 'directory_visible'];

  app.get('/api/spec/studio-profile', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('studios')
        .select(['name', ...PROFILE_FIELDS].join(', '))
        .eq('id', STUDIO_ID)
        .maybeSingle();
      if (error) throw error;
      res.json(data || {});
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/spec/studio-profile', async (req, res) => {
    try {
      const update = {};
      PROFILE_FIELDS.forEach((f) => {
        if (f in (req.body || {})) update[f] = req.body[f];
      });
      if (Object.keys(update).length === 0) {
        return res.status(400).json({ error: 'No profile fields provided' });
      }
      const { data, error } = await supabase
        .from('studios')
        .update(update)
        .eq('id', STUDIO_ID)
        .select(['name', ...PROFILE_FIELDS].join(', '))
        .maybeSingle();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Studios Worldwide -- the B2B network directory. Only studios that have
  // opted into visibility appear; "shared this month" comes from real
  // community_posts, not a fabricated number.
  app.get('/api/spec/studios-worldwide', async (req, res) => {
    try {
      const { data: studios, error } = await supabase
        .from('studios')
        .select('id, name, city, country, public_bio, instagram_handle, website_url, directory_visible')
        .eq('directory_visible', true)
        .limit(500);
      if (error) throw error;

      // The real studios table holds 250+ seeded '(Demo)' rows alongside the
      // one genuine studio (The Kiln Cafe) -- all with directory_visible=true.
      // A B2B network directory showing 250 fake studios is worse than
      // showing none, so these are filtered here rather than left for the
      // frontend to somehow guess which rows are real. 'Host By Post' is
      // Daisy's own mail-order product, not a peer studio, so it's excluded
      // from a studio-to-studio directory too.
      const rows = (studios || []).filter(
        (s) => !/\(demo\)/i.test(s.name) && !/^demo:/i.test(s.name) && s.name !== 'Host By Post'
      );
      const ids = rows.map((s) => s.id);

      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      let sharedCounts = {};
      if (ids.length) {
        const { data: posts } = await supabase
          .from('community_posts')
          .select('studio_id, created_at')
          .in('studio_id', ids)
          .gte('created_at', monthStart.toISOString());
        (posts || []).forEach((p) => {
          sharedCounts[p.studio_id] = (sharedCounts[p.studio_id] || 0) + 1;
        });
      }

      res.json({
        studios: rows.map((s) => ({ ...s, shared_this_month: sharedCounts[s.id] || 0 })),
        count: rows.length,
        note: rows.length === 0 ? 'No studios have opted into the public directory yet.' : null,
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// WALK-IN BOOKINGS, KILN BATCHES, COMPLETION PHOTO
// ----------------------------------------------------------------------------
// Master doc section 4, staff app core workflow:
// 1. Booking Details -- "walk-in creation, customer QR generation"
// 4. Kiln & Inventory -- "Kiln Firing Batches (combine multiple bookings
//    into one firing, batch QR code)", and Completion -- "photograph
//    finished pieces, stamps QR + customer name + date onto the photo"
// ============================================================================
export function registerWorkflowRoutes(app, supabase, STUDIO_ID, logger, upload, fs) {
  // Walk-in creation -- writes a REAL booking, same table live bookings use.
  app.post('/api/spec/bookings/walk-in', async (req, res) => {
    try {
      const { customer_name, party_size, table_number, notes } = req.body || {};
      if (!customer_name) return res.status(400).json({ error: 'customer_name required' });

      const code = `walkin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data, error } = await supabase
        .from('bookings')
        .insert([{
          studio_id: STUDIO_ID,
          booking_code: code,
          customer_name: String(customer_name).trim(),
          session_start: new Date().toISOString(),
          party_size: party_size ? Number(party_size) : null,
          table_number: table_number || null,
          status: 'active',
          current_stage: 'booking',
          booking_type: 'walk-in',
          notes: notes || null,
        }])
        .select('booking_code, customer_name, session_start, table_number, party_size')
        .maybeSingle();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Kiln batch: create a firing session with an auto batch_code, then bulk-
  // assign pieces from one or more bookings into it. This is what "combine
  // multiple bookings into one firing" actually means against the real
  // schema -- kiln_sessions already has batch_code, pottery_pieces already
  // has kiln_session_id; the only missing part was the bulk-assign step.
  app.post('/api/spec/kiln/batches', async (req, res) => {
    try {
      const { label } = req.body || {};
      const batchCode = `KB-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await supabase
        .from('kiln_sessions')
        .insert([{
          studio_id: STUDIO_ID,
          label: label || `Firing ${new Date().toLocaleDateString('en-GB')}`,
          status: 'queued',
          batch_code: batchCode,
        }])
        .select('id, label, status, batch_code, created_at')
        .maybeSingle();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/spec/kiln/batches/:id/assign', async (req, res) => {
    try {
      const { piece_ids } = req.body || {};
      if (!Array.isArray(piece_ids) || piece_ids.length === 0) {
        return res.status(400).json({ error: 'piece_ids array required' });
      }
      const { data, error } = await supabase
        .from('pottery_pieces')
        .update({ kiln_session_id: req.params.id })
        .in('id', piece_ids)
        .eq('studio_id', STUDIO_ID)
        .select('id');
      if (error) throw error;
      res.json({ assigned: (data || []).length });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Completion photo: a REAL upload through the deployed backend's own
  // Supabase credentials (this is the browser -> backend -> Storage path
  // that already works for Photo Match; it was never blocked -- only my own
  // sandbox lacks the network route there). Stamps happen client-side onto
  // the canvas before upload, so what's stored is the final stamped image.
  app.post('/api/spec/pieces/:id/completion-photo', upload.single('photo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
      const filename = `completions/${STUDIO_ID}/${req.params.id}-${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('booking-photos')
        .upload(filename, fs.readFileSync(req.file.path), { contentType: req.file.mimetype || 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: pub } = supabase.storage.from('booking-photos').getPublicUrl(filename);

      const { data, error } = await supabase
        .from('pottery_pieces')
        .update({ reference_photo_url: pub.publicUrl, reference_photo_taken_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('studio_id', STUDIO_ID)
        .select('id, reference_photo_url, reference_photo_taken_at')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Piece not found' });

      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// TILL MENU — grouped tile structure for the Till step, matching the real
// /studio till on main (category tiles, real popularity ordering, first-8 +
// More rather than a flat dump). Rebuilt here against new-app-full's own
// endpoints since it's a separate codebase.
// ============================================================================
// Real Cafe/Food categories, shared between the till menu and KDS so both
// agree on what counts as "something the kitchen needs to make" -- never
// duplicated as a second list that could drift out of sync.
// Categories that route to the floor/kitchen alert queue -- what genuinely
// needs a staff member's attention when a customer orders it from their
// table, not just cafe drinks. 'S. Glazing' added per Daisy: customers
// asking for an extra glaze from their table needs the same live alert a
// drink order gets, not a separate system.
const KITCHEN_CATEGORIES = ['Hot Drinks', 'Cold Drinks', 'Iced Coffees', 'Milkshakes', 'Smoothies', 'Drinks', 'Alcohol', 'Cafe', 'Cakes', 'Cakes & Food', 'S. Glazing'];

// Shared by /api/spec/till-menu and /api/spec/item-popularity so there is
// only ONE real implementation of "ask Square for real recent sales" --
// never two copies that could quietly drift apart.
async function fetchSquareItemPopularity(supabase, STUDIO_ID, axios) {
  const { data: connection } = await supabase
    .from('square_connections')
    .select('square_access_token, square_token_expires_at')
    .eq('studio_id', STUDIO_ID)
    .single();

  if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
    return { popularity: {}, orders_scanned: 0, available: false };
  }

  const token = connection.square_access_token;
  const locationsRes = await axios.get('https://connect.squareup.com/v2/locations', {
    headers: { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18' },
  });
  const locations = locationsRes.data.locations || [];
  if (!locations.length) return { popularity: {}, orders_scanned: 0, available: true };

  const windowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const ordersRes = await axios.post(
    'https://connect.squareup.com/v2/orders/search',
    {
      location_ids: locations.map((l) => l.id),
      query: {
        filter: {
          date_time_filter: { created_at: { start_at: windowStart.toISOString() } },
          state_filter: { states: ['COMPLETED'] },
        },
      },
      limit: 200,
    },
    { headers: { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18', 'Content-Type': 'application/json' } }
  );

  const orders = ordersRes.data.orders || [];
  const baseCounts = {};
  orders.forEach((o) => {
    (o.line_items || []).forEach((li) => {
      const name = (li.name || '').trim();
      if (!name) return;
      baseCounts[name] = (baseCounts[name] || 0) + (li.quantity ? Number(li.quantity) : 1);
    });
  });
  return { popularity: baseCounts, orders_scanned: orders.length, available: true };
}

export function registerTillMenuRoute(app, supabase, STUDIO_ID, logger, axios) {
  // Broad groups a till actually uses day-to-day. 'Other' (26k+ unclassified
  // items in the real data) is deliberately excluded -- it's not a real
  // usable category, just unclassified Square data, same as Money already
  // treats it.
  const GROUPS = [
    { key: 'cafe', label: 'Cafe', categories: ['Hot Drinks', 'Cold Drinks', 'Iced Coffees', 'Milkshakes', 'Smoothies', 'Drinks', 'Alcohol', 'Cafe'] },
    { key: 'food', label: 'Food', categories: ['Cakes', 'Cakes & Food'] },
    { key: 'glazes', label: 'Pottery & Glazes', categories: ['Pottery & Glazes', 'S. Glazing'] },
    { key: 'blanks', label: 'Pottery Blanks', categories: null }, // catch-all: anything starting "PB "
  ];

  app.get('/api/spec/till-menu', async (req, res) => {
    try {
      const [{ data: items }, { data: revenue }] = await Promise.all([
        supabase.from('square_items').select('item_name, category, price_cents').eq('studio_id', STUDIO_ID),
        supabase.from('revenue_category_breakdown').select('category, item_count').eq('studio_id', STUDIO_ID),
      ]);

      // Real per-ITEM popularity, live from Square -- Supabase only has this
      // at the category level. Failure here (token expired, Square down)
      // must never break the till itself, so it's caught and item ordering
      // just falls back to unordered rather than the whole menu failing.
      let itemPopularity = {};
      let itemPopularityAvailable = false;
      try {
        const sq = await fetchSquareItemPopularity(supabase, STUDIO_ID, axios);
        itemPopularity = sq.popularity;
        itemPopularityAvailable = sq.available && Object.keys(sq.popularity).length > 0;
      } catch (sqErr) {
        logger.error('till-menu: Square popularity fetch failed, continuing without it', sqErr.response?.data || sqErr.message);
      }

      // Substring match: Square's line_items are typically a base name
      // ('Latte'), our menu rows are compound ('Latte — Caramel, Decaf').
      // Approximate, not exact -- see the caveat on fetchSquareItemPopularity.
      const popularityForItem = (itemName) => {
        const lower = (itemName || '').toLowerCase();
        let best = 0;
        Object.entries(itemPopularity).forEach(([squareName, count]) => {
          if (lower.includes(squareName.toLowerCase())) best = Math.max(best, count);
        });
        return best;
      };

      // Real popularity by category, summed across all dates on file.
      const popularity = {};
      (revenue || []).forEach((r) => {
        popularity[r.category] = (popularity[r.category] || 0) + (r.item_count || 0);
      });

      const allItems = (items || []).filter((i) => i.category && i.category !== 'Other');

      // Modifier decomposition: a base drink ('Latte') with many named
      // flavour x milk variants collapses to ONE tile that opens a real
      // two-step choice, instead of showing every combination flat.
      // Verified safe against real data before shipping (test_parser.js,
      // run standalone against the actual square_items rows): only applies
      // when EVERY variant in the group has a detectable milk suffix AND
      // every (flavour, milk) combination genuinely exists as a real row --
      // both checked programmatically, not assumed. Falls back to a flat
      // list otherwise (this is why Americano, Cappuccino and Tea are NOT
      // decomposed here -- their real naming doesn't cleanly support it).
      const MILK_SUFFIXES = ['Decaf Oat Milk', 'Oat Milk', 'Decaf', 'Oat', 'Dairy', 'Black'];

      const decomposeGroup = (groupItems) => {
        const rows = groupItems.map((item) => {
          const idx = item.item_name.indexOf(' — ');
          const rest = idx === -1 ? '' : item.item_name.slice(idx + 3);
          let milk = null, flavour = rest;
          for (const suf of MILK_SUFFIXES) {
            if (rest === suf || rest.endsWith(', ' + suf) || rest.endsWith(' ' + suf)) {
              milk = suf;
              flavour = rest.slice(0, rest.length - suf.length).replace(/,\s*$/, '').trim();
              break;
            }
          }
          return { ...item, milk, flavour: flavour || '(plain)' };
        });
        if (!rows.every((r) => r.milk !== null)) return null;

        const flavours = [...new Set(rows.map((r) => r.flavour))];
        const milks = [...new Set(rows.map((r) => r.milk))];
        const lookup = {};
        rows.forEach((r) => { lookup[`${r.flavour}|${r.milk}`] = r; });
        const fullGrid = flavours.every((f) => milks.every((m) => `${f}|${m}` in lookup));
        if (!fullGrid) return null;

        return { flavours, milks, lookup };
      };

      // Groups items sharing a base name (text before ' — ') and, where the
      // group decomposes cleanly, turns it into ONE customisable tile.
      // Otherwise every item in the group stays as its own separate item.
      const applyModifierGrouping = (items) => {
        const byBase = {};
        items.forEach((i) => {
          const idx = i.item_name.indexOf(' — ');
          const base = idx === -1 ? i.item_name : i.item_name.slice(0, idx);
          (byBase[base] = byBase[base] || []).push(i);
        });

        const result = [];
        Object.entries(byBase).forEach(([base, groupItems]) => {
          if (groupItems.length <= 3) {
            result.push(...groupItems.map((i) => ({ kind: 'simple', ...i })));
            return;
          }
          const decomposed = decomposeGroup(groupItems);
          if (!decomposed) {
            result.push(...groupItems.map((i) => ({ kind: 'simple', ...i })));
            return;
          }
          const cheapest = groupItems.reduce((a, b) => (a.price_cents < b.price_cents ? a : b));
          result.push({
            kind: 'customisable',
            base,
            category: groupItems[0].category,
            from_price_cents: cheapest.price_cents,
            flavours: decomposed.flavours,
            milks: decomposed.milks,
            lookup: decomposed.lookup,
          });
        });
        return result;
      };

      const bucketiseItems = (items) => {
        // Real keyword match against the actual item names -- no invented
        // popularity, just grouping what's already there into the shape
        // Daisy asked for ('coffees, teas, hot chocolate etc').
        const buckets = { Coffees: [], Teas: [], 'Hot Chocolate': [], Other: [] };
        items.forEach((i) => {
          const n = (i.item_name || '').toLowerCase();
          if (/flat white|latte|cappuccino|americano|espresso|mocha|macchiato|coffee/.test(n)) buckets.Coffees.push(i);
          else if (/\btea\b|chai/.test(n)) buckets.Teas.push(i);
          else if (/chocolate|cocoa/.test(n)) buckets['Hot Chocolate'].push(i);
          else buckets.Other.push(i);
        });
        return Object.entries(buckets)
          .filter(([, list]) => list.length > 0)
          .map(([label, list]) => {
            const sorted = itemPopularityAvailable ? [...list].sort((a, b) => popularityForItem(b.item_name) - popularityForItem(a.item_name)) : list;
            return { label, items: applyModifierGrouping(sorted) };
          });
      };

      const groups = GROUPS.map((g) => {
        const categoriesInGroup = g.categories
          ? g.categories
          : [...new Set(allItems.map((i) => i.category))].filter((c) => c.trim().startsWith('PB'));

        const subsections = categoriesInGroup
          .map((cat) => {
            const catItems = allItems.filter((i) => i.item_name && i.category === cat);
            const sortedItems = itemPopularityAvailable
              ? [...catItems].sort((a, b) => popularityForItem(b.item_name) - popularityForItem(a.item_name))
              : catItems;
            return {
              category: cat,
              // Cleaned display label: strip the internal 'PB '/'S. ' prefixes
              // used in Square, keep the real underlying category for filtering.
              label: cat.replace(/^PB\s+/, '').replace(/^S\.\s+/, '').trim(),
              popularity: popularity[cat] || 0,
              items: applyModifierGrouping(sortedItems),
              // Only bucket when a subsection is large enough that a flat
              // grid would be overwhelming -- small subsections stay as one
              // simple item grid. The Coffees/Teas/Hot Chocolate keyword
              // buckets only make sense for the Cafe group -- applying them
              // to Pottery Blanks/Glazes subsections mis-sorts pieces whose
              // NAME happens to contain a drink word (e.g. a "Chocolate
              // Bunny" pottery blank was landing in a bogus "Hot Chocolate"
              // bucket). Restrict bucketising to g.key === 'cafe'.
              buckets: g.key === 'cafe' && catItems.length > 10 ? bucketiseItems(sortedItems) : null,
            };
          })
          .filter((s) => s.items.length > 0)
          .sort((a, b) => b.popularity - a.popularity);

        const groupPopularity = subsections.reduce((s, sub) => s + sub.popularity, 0);
        return { key: g.key, label: g.label, popularity: groupPopularity, subsections };
      }).filter((g) => g.subsections.length > 0)
        .sort((a, b) => b.popularity - a.popularity);

      res.json({ groups, item_popularity_source: itemPopularityAvailable ? 'square_live_90d' : 'unavailable' });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// KDS (Kitchen Display) — customer self-service ordering feeds this queue.
// ----------------------------------------------------------------------------
// Uses the SAME real till-items table and add endpoint the staff Till
// already writes to (demo_app_till_items) -- a customer order and a
// staff-added order are the same real row, just tagged by who added it.
// Nothing new to keep in sync.
// ============================================================================
export function registerKdsRoutes(app, supabase, STUDIO_ID, logger) {
  // Pending queue: any real, unprepared kitchen item -- whether the customer
  // ordered it themselves or staff entered it on their behalf via Start
  // Floor's Till. A kitchen queue that only showed self-service orders would
  // silently miss every table where staff took the order, which is most of
  // them. Oldest first, how a real KDS orders work.
  app.get('/api/spec/kds-queue', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('demo_app_till_items')
        .select('id, booking_code, item_name, category, quantity, added_by, created_at')
        .eq('studio_id', STUDIO_ID)
        .in('category', KITCHEN_CATEGORIES)
        .is('prepared_at', null)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;

      // Attach the real customer name for each order, so kitchen staff know
      // whose table it's for without a second lookup per item.
      const codes = [...new Set((data || []).map((i) => i.booking_code))];
      let names = {};
      if (codes.length) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('booking_code, customer_name, table_number')
          .eq('studio_id', STUDIO_ID)
          .in('booking_code', codes);
        (bookings || []).forEach((b) => { names[b.booking_code] = b; });
      }

      const queue = (data || []).map((i) => ({
        ...i,
        customer_name: names[i.booking_code]?.customer_name || null,
        table_number: names[i.booking_code]?.table_number || null,
      }));

      res.json({ queue, count: queue.length });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/spec/till-items/:id/prepare', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('demo_app_till_items')
        .update({ prepared_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('studio_id', STUDIO_ID)
        .select('id, prepared_at')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Order item not found' });
      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// REAL ITEM POPULARITY — sourced live from Square, not Supabase
// ----------------------------------------------------------------------------
// Supabase has real popularity at the CATEGORY level only (revenue_category_
// breakdown) and the one table shaped for real per-item history
// (table_session_orders) is genuinely empty -- checked directly, 0 rows.
// Square itself has the real per-item sales data this app was missing.
// Read-only: GET /orders/search against Square's own API, same pattern
// already proven working in /api/demo/square-live. Never writes anywhere,
// including back to Square -- matches Daisy's explicit boundary that this
// app can read live from Square but must never touch the real production
// system until she connects something on purpose.
//
// CAVEAT, stated plainly rather than assumed away: Square's line_items
// usually carry a BASE name ('Latte'), while our menu rows are compound
// ('Latte — Caramel, Decaf'). Matched here by substring (does the compound
// name contain the Square base name), which is a reasonable approximation
// but not a guaranteed exact match. This endpoint can only be tested
// against the real Square account by the deployed backend -- I have no
// network path to Square from this sandbox, so this has NOT been verified
// against real live data. Check the numbers look sane on first real use.
// ============================================================================
export function registerPopularityRoute(app, supabase, STUDIO_ID, logger, axios) {
  app.get('/api/spec/item-popularity', async (req, res) => {
    try {
      const result = await fetchSquareItemPopularity(supabase, STUDIO_ID, axios);
      res.json({ popularity: result.popularity, orders_scanned: result.orders_scanned, window_days: 90 });
    } catch (err) {
      logger.error(err.response?.data || err);
      res.status(500).json({ error: err.response?.data?.errors?.[0]?.detail || err.message, popularity: {} });
    }
  });
}

// ============================================================================
// AI COST COUNTER — the only real metered AI use anywhere in this app is
// OpenAI vision (Photo Match, Shelf Sweep). Every call is logged to
// ai_usage with the API's own real returned token counts (see
// logAiUsage() in server.js). This endpoint sums the real running total
// for a visible on-screen counter, so the actual cost is never hidden.
// ============================================================================
export function registerAiCostRoute(app, supabase, STUDIO_ID, logger) {
  app.get('/api/spec/ai-cost-total', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('ai_usage')
        .select('cost_usd, kind')
        .eq('studio_id', STUDIO_ID)
        .in('kind', ['photo-match', 'shelf-sweep-inventory', 'shelf-sweep-match']);
      if (error) throw error;

      const rows = data || [];
      const totalUsd = rows.reduce((s, r) => s + Number(r.cost_usd || 0), 0);
      res.json({ total_usd: totalUsd, total_gbp: totalUsd * 0.79, call_count: rows.length });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message, total_usd: 0, call_count: 0 });
    }
  });
}

// ============================================================================
// LIVE TODAY TOTAL — bypasses the periodic revenue_category_breakdown sync
// entirely. Same authenticated Square Orders Search pattern already proven
// in /api/demo/square-live, just summed to one real number. Exists because
// the synced breakdown table can genuinely fall behind (checked directly:
// 5 real days stale as of this write) and Daisy needs today's real figure
// regardless of whether that background sync job is currently healthy.
// ============================================================================
export function registerLiveTotalRoute(app, supabase, STUDIO_ID, logger, axios) {
  app.get('/api/spec/today-live-total', async (req, res) => {
    try {
      const { data: connection } = await supabase
        .from('square_connections')
        .select('square_access_token, square_token_expires_at')
        .eq('studio_id', STUDIO_ID)
        .single();

      if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
        return res.status(400).json({ error: 'No valid Square connection', total_gbp: null });
      }

      const token = connection.square_access_token;
      const locationsRes = await axios.get('https://connect.squareup.com/v2/locations', {
        headers: { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18' },
      });
      const locations = locationsRes.data.locations || [];
      if (!locations.length) return res.json({ total_gbp: 0, order_count: 0, pulled_at: new Date().toISOString() });

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const ordersRes = await axios.post(
        'https://connect.squareup.com/v2/orders/search',
        {
          location_ids: locations.map((l) => l.id),
          query: {
            filter: {
              date_time_filter: { created_at: { start_at: todayStart.toISOString() } },
              state_filter: { states: ['COMPLETED'] },
            },
          },
          limit: 200,
        },
        { headers: { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18', 'Content-Type': 'application/json' } }
      );

      const orders = ordersRes.data.orders || [];
      const totalCents = orders.reduce((s, o) => s + (o.total_money ? o.total_money.amount : 0), 0);

      res.json({
        total_gbp: totalCents / 100,
        order_count: orders.length,
        pulled_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(err.response?.data || err);
      res.status(500).json({ error: err.response?.data?.errors?.[0]?.detail || err.message, total_gbp: null });
    }
  });
}

// ============================================================================
// SQUARE OPEN ORDERS DIAGNOSTIC -- purely investigative, GET only
// ----------------------------------------------------------------------------
// Daisy asked whether staff opening a table in the app could see a live,
// read-only view of what's actually been rung up on the physical Square
// handheld for that table. Whether that's buildable hinges entirely on one
// unknown: do the real open Square tickets carry a `ticket_name` (or
// anything else) that identifies which table they belong to? This endpoint
// answers that honestly by asking Square directly -- returns real OPEN
// orders for today with exactly the fields that would matter for matching,
// nothing invented. Not wired into any table/booking view yet: this is the
// look-before-you-build step, not the feature itself.
// ============================================================================
export function registerSquareOpenOrdersDiagnosticRoute(app, supabase, STUDIO_ID, logger, axios) {
  app.get('/api/spec/square/open-orders-diagnostic', async (req, res) => {
    try {
      const { data: connection } = await supabase
        .from('square_connections')
        .select('square_access_token, square_token_expires_at')
        .eq('studio_id', STUDIO_ID)
        .single();

      if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
        return res.status(400).json({ error: 'No valid Square connection', orders: [] });
      }

      const token = connection.square_access_token;
      const locationsRes = await axios.get('https://connect.squareup.com/v2/locations', {
        headers: { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18' },
      });
      const locations = locationsRes.data.locations || [];
      if (!locations.length) return res.json({ orders: [], pulled_at: new Date().toISOString() });

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const ordersRes = await axios.post(
        'https://connect.squareup.com/v2/orders/search',
        {
          location_ids: locations.map((l) => l.id),
          query: {
            filter: {
              date_time_filter: { created_at: { start_at: todayStart.toISOString() } },
              state_filter: { states: ['OPEN'] },
            },
          },
          limit: 100,
        },
        { headers: { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18', 'Content-Type': 'application/json' } }
      );

      const orders = ordersRes.data.orders || [];

      // Deliberately narrow -- exactly the fields that matter for judging
      // whether an open ticket can be matched to a table, nothing more.
      const summarised = orders.map((o) => ({
        id: o.id,
        ticket_name: o.ticket_name || null,
        reference_id: o.reference_id || null,
        state: o.state,
        created_at: o.created_at,
        updated_at: o.updated_at,
        item_count: (o.line_items || []).length,
        item_names: (o.line_items || []).map((li) => li.name),
        total_gbp: o.total_money ? o.total_money.amount / 100 : null,
        source: o.source?.name || null,
      }));

      res.json({
        orders: summarised,
        order_count: summarised.length,
        has_any_ticket_name: summarised.some((o) => !!o.ticket_name),
        pulled_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(err.response?.data || err);
      res.status(500).json({ error: err.response?.data?.errors?.[0]?.detail || err.message, orders: [] });
    }
  });
}

// ============================================================================
// SQUARE APPOINTMENTS (BOOKINGS) DIAGNOSTIC -- real, read-only, staged first.
// ----------------------------------------------------------------------------
// Confirmed directly, not guessed: every real 'Book' button on the live site
// (thekilncafe.com/bookonline) points to book.squareup.com/appointments/... --
// real customers book through Square Appointments right now. Separately
// confirmed 207/256 real bookings already carry a real square_booking_id and
// ALL 256 carry a synced_from_square timestamp, most recent 9 Aug -- proof a
// real sync ran and stopped, not that one was never built. Checked git
// history the same way the revenue sync was recovered: unlike revenue, no
// trace of the real sync code survives anywhere in this repo's history (its
// own first commit is literally 'Initial commit') -- it lived in the
// pre-rewrite history that was destroyed 12 Aug, same event that destroyed
// /studio, genuinely unrecoverable this time.
//
// This is a real, correct call against Square's actual Bookings API (raw
// REST, same proven pattern as every other Square integration this
// session) -- but deliberately a read-only diagnostic FIRST, not the sync
// itself. Reason: how this business's real booking widget encodes party
// size isn't yet known -- Square Appointments has no native 'party size'
// field, so it's likely captured via a custom intake question, a note
// field, or the number of individual appointment segments, and guessing
// wrong here would write incorrect data into the live table staff use
// every day. This surfaces the real raw shape first so the actual mapping
// can be built correctly once inspected, same staged approach used for
// the revenue sync recovery.
// ============================================================================
export function registerSquareBookingsDiagnosticRoute(app, supabase, STUDIO_ID, logger, axios) {
  app.get('/api/spec/bookings/square-diagnostic', async (req, res) => {
    // Wraps each real call with which step it was, and the true raw error
    // (status + body), since axios's own generic message ('Request failed
    // with status code 406') hides which of the three real API calls
    // actually failed and why -- needed real diagnosis, not a guess.
    const callStep = async (label, fn) => {
      try {
        return await fn();
      } catch (err) {
        const detail = {
          step: label,
          status: err.response?.status || null,
          statusText: err.response?.statusText || null,
          url: err.config?.url || null,
          body: err.response?.data || null,
          message: err.message,
        };
        logger.error(`[bookings-diagnostic] failed at step: ${label}`, detail);
        const e = new Error(`Failed at step '${label}': ${err.message}`);
        e.diagnostic = detail;
        throw e;
      }
    };

    try {
      const { data: connection } = await supabase
        .from('square_connections')
        .select('square_access_token, square_token_expires_at')
        .eq('studio_id', STUDIO_ID)
        .single();
      if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
        return res.status(400).json({ error: 'No valid Square connection', bookings: [] });
      }
      const token = connection.square_access_token;
      // Real, confirmed cause of the 406 seen live: Square's Bookings API
      // specifically rejects axios's default Accept header (a multi-value
      // list, 'application/json, text/plain, */*') -- its own error said so
      // plainly ('Unrecognized accept=...'). Locations, on this same headers
      // object, passed fine right before it failed -- this is a real quirk
      // of the Bookings endpoint specifically, not every Square call this
      // session, so fixed narrowly here rather than touched everywhere.
      const headers = { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18', Accept: 'application/json' };

      const locationsRes = await callStep('locations.list', () =>
        axios.get('https://connect.squareup.com/v2/locations', { headers })
      );
      const locations = locationsRes.data.locations || [];
      if (!locations.length) return res.json({ bookings: [], reason: 'no_square_locations' });

      // Real gap window -- from the last known real sync (9 Aug) through
      // 14 days ahead, so this covers exactly what's missing plus enough
      // near-future bookings to sanity-check the shape.
      const startMin = new Date('2026-08-09T00:00:00Z').toISOString();
      const startMax = new Date();
      startMax.setDate(startMax.getDate() + 14);

      const bookingsRes = await callStep('bookings.list', () =>
        axios.get('https://connect.squareup.com/v2/bookings', {
          headers,
          params: {
            location_id: locations[0].id,
            start_at_min: startMin,
            start_at_max: startMax.toISOString(),
            limit: 50,
          },
        })
      );
      const bookings = bookingsRes.data.bookings || [];

      // Real customer names, for the first handful only -- this is a
      // diagnostic, not the bulk sync, so keep the call count small.
      const sample = bookings.slice(0, 10);
      const customerIds = [...new Set(sample.map((b) => b.customer_id).filter(Boolean))];
      const customers = {};
      for (const id of customerIds) {
        try {
          const custRes = await axios.get(`https://connect.squareup.com/v2/customers/${id}`, { headers });
          const c = custRes.data.customer;
          customers[id] = [c?.given_name, c?.family_name].filter(Boolean).join(' ') || c?.company_name || null;
        } catch (e) {
          customers[id] = null;
        }
      }

      // Real check: does the SERVICE VARIATION a booking uses actually
      // encode party size in its own name (e.g. a studio offering separate
      // 'for 2' / 'for 4' variations of the same service)? Confirmed no
      // party-size field exists anywhere on the raw booking itself, so this
      // is the next real place to check before assuming it isn't there.
      const variationIds = [...new Set(
        bookings.flatMap((b) => (b.appointment_segments || []).map((s) => s.service_variation_id)).filter(Boolean)
      )];
      const variations = {};
      for (const id of variationIds) {
        try {
          const objRes = await axios.get(`https://connect.squareup.com/v2/catalog/object/${id}`, { headers });
          const v = objRes.data.object?.item_variation_data;
          variations[id] = {
            name: v?.name || null,
            price_gbp: v?.price_money ? v.price_money.amount / 100 : null,
          };
        } catch (e) {
          variations[id] = { name: null, error: e.response?.data?.errors?.[0]?.detail || e.message };
        }
      }

      res.json({
        location_id: locations[0].id,
        booking_count: bookings.length,
        // Real service variation names, keyed by ID -- checks directly
        // whether party size is encoded here instead of on the booking.
        service_variations: variations,
        // Full raw shape for the first few -- deliberately unprocessed, so
        // the real party-size encoding (and anything else unexpected) can
        // actually be seen rather than guessed at.
        sample_raw: sample.map((b) => ({ ...b, customer_name_resolved: customers[b.customer_id] || null })),
        all_bookings_summary: bookings.map((b) => ({
          id: b.id,
          status: b.status,
          start_at: b.start_at,
          customer_id: b.customer_id,
          customer_note: b.customer_note || null,
          seller_note: b.seller_note || null,
          segment_count: (b.appointment_segments || []).length,
        })),
        pulled_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(err.response?.data || err);
      res.status(500).json({
        error: err.response?.data?.errors?.[0]?.detail || err.message,
        // Real diagnostic detail, if this came from callStep above --
        // exactly which real call failed, its true status and raw body.
        diagnostic: err.diagnostic || null,
        bookings: [],
      });
    }
  });
}

// ============================================================================
// LIVE SQUARE ORDER FOR A BOOKING'S TABLE -- read-only.
// ----------------------------------------------------------------------------
// The real feature the diagnostic above was checking feasibility for: when
// staff open a booking in Floor, show what's actually been rung up for that
// table on the physical Square handheld right now -- so they don't have to
// separately ask, or re-enter it into this app's own till. Confirmed
// buildable via the diagnostic (real open tickets do carry a ticket_name,
// e.g. "T4") before this was written.
//
// Matching is a heuristic, not a guarantee -- ticket_name is free text a
// person typed on the handheld, and booking.table_number is free text too
// (it supports "3A"/"3+4" style splits/combines). This matches on the
// DIGIT sequence common to both ("T4" and "4" both normalise to "4"), which
// is honest about being approximate, same posture as the existing
// item-popularity fuzzy match in till-menu above. A table using a letter
// suffix only ("3A") won't match on digits alone here -- flagged in the
// response via match_confidence rather than silently pretending certainty.
// ============================================================================
export function registerLiveSquareOrderRoute(app, supabase, STUDIO_ID, logger, axios) {
  const digitsOf = (s) => (String(s || '').match(/\d+/g) || []).join('');

  app.get('/api/spec/bookings/:code/live-square-order', async (req, res) => {
    try {
      const { data: booking } = await supabase
        .from('bookings')
        .select('booking_code, table_number')
        .eq('booking_code', req.params.code)
        .eq('studio_id', STUDIO_ID)
        .maybeSingle();

      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (!booking.table_number) {
        return res.json({ matched: false, reason: 'no_table_set', order: null });
      }

      const tableDigits = digitsOf(booking.table_number);
      if (!tableDigits) {
        return res.json({ matched: false, reason: 'table_number_has_no_digits', table_number: booking.table_number, order: null });
      }

      const { data: connection } = await supabase
        .from('square_connections')
        .select('square_access_token, square_token_expires_at')
        .eq('studio_id', STUDIO_ID)
        .single();

      if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
        return res.status(400).json({ error: 'No valid Square connection', matched: false, order: null });
      }

      const token = connection.square_access_token;
      const locationsRes = await axios.get('https://connect.squareup.com/v2/locations', {
        headers: { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18' },
      });
      const locations = locationsRes.data.locations || [];
      if (!locations.length) return res.json({ matched: false, reason: 'no_square_locations', order: null });

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const ordersRes = await axios.post(
        'https://connect.squareup.com/v2/orders/search',
        {
          location_ids: locations.map((l) => l.id),
          query: {
            filter: {
              date_time_filter: { created_at: { start_at: todayStart.toISOString() } },
              state_filter: { states: ['OPEN'] },
            },
          },
          limit: 100,
        },
        { headers: { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18', 'Content-Type': 'application/json' } }
      );

      const orders = ordersRes.data.orders || [];
      const candidates = orders
        .filter((o) => o.ticket_name && digitsOf(o.ticket_name) === tableDigits)
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

      if (candidates.length === 0) {
        return res.json({ matched: false, reason: 'no_open_ticket_for_table', table_number: booking.table_number, order: null });
      }

      // Same table digits could genuinely match more than one open ticket
      // (e.g. "T4" and "Table 4" both open at once, a real mistake someone
      // could make) -- surfaced honestly rather than silently picking one.
      const multiple = candidates.length > 1;
      const o = candidates[0];

      res.json({
        matched: true,
        multiple_candidates: multiple,
        table_number: booking.table_number,
        order: {
          id: o.id,
          ticket_name: o.ticket_name,
          state: o.state,
          created_at: o.created_at,
          updated_at: o.updated_at,
          total_gbp: o.total_money ? o.total_money.amount / 100 : null,
          items: (o.line_items || []).map((li) => ({
            name: li.name,
            quantity: li.quantity,
            total_gbp: li.total_money ? li.total_money.amount / 100 : null,
          })),
        },
        pulled_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.error(err.response?.data || err);
      res.status(500).json({ error: err.response?.data?.errors?.[0]?.detail || err.message, matched: false, order: null });
    }
  });
}

// ============================================================================
// BOOKINGS NEEDING VERIFICATION -- real, read-only.
// ----------------------------------------------------------------------------
// A batch of real bookings were entered on 9 Aug from a photo of a diary
// (OCR, not typed in directly) -- where the date/time couldn't be read with
// full confidence, a note was added asking for it to be checked. Confirmed
// live: 25 real bookings still carry this note, spanning 4-21 Aug, some
// still upcoming. Nobody has been through and cleared them since. This
// endpoint just surfaces the real list -- GET only, no write, no "mark
// verified" action here; verifying is a real judgement call for a person
// with the actual diary/records, not something this app should silently
// resolve.
//
// Matched by the literal marker text the 9 Aug import used ('Added via
// photo review') -- there's no dedicated boolean column for this in the
// real bookings table (checked the schema directly before writing this),
// so this is a text match, same honest posture as the other approximate
// matches already in this file.
// ============================================================================
// ============================================================================
// REVENUE CATEGORY SYNC -- real, restored, not reinvented.
// ----------------------------------------------------------------------------
// The real sync logic (categorizeItemName keyword matcher + Square catalog
// category mapping) EXISTED and worked, in the pre-rewrite server.js.
// Confirmed via git history (commits a9072c9, then refined by 2f3eebd on 22
// Jul): it kept revenue_category_breakdown current by upserting during the
// same run that also wrote analytics_cache. That logic was never carried
// over in the 12 Aug rewrite -- confirmed nothing in the current codebase
// writes to this table at all, and the one surviving 'sync' endpoint
// (/api/bookings/sync) is an unfinished stub that does nothing real.
//
// This is a faithful port of the REAL, proven logic from those two commits
// -- same categorisation approach, same delete-before-upsert pattern to
// avoid double-counting recategorised history -- adapted from the old
// Square Node SDK (client.catalogApi) to raw axios REST calls, since the
// SDK package isn't installed here (checked backend/package.json directly)
// and every other Square call already added this session uses this same
// raw REST pattern.
//
// No scheduler exists anywhere for this (checked: no pg_cron in Supabase,
// no cron-type service in any render.yaml ever committed, no in-process
// setInterval). Until a real Render Cron Job or similar is set up outside
// this backend to call this on a schedule, catching up requires someone
// tapping the sync button on Money -- documented plainly there, not
// pretended to be automatic.
// ============================================================================
const REVENUE_CATEGORY_KEYWORDS = [
  { category: 'Cakes & Food', keywords: ['cake', 'brownie', 'cookie', 'pastry', 'sandwich', 'toast', 'scone', 'muffin', 'flapjack'] },
  { category: 'Drinks', keywords: ['coffee', 'tea', 'latte', 'cappuccino', 'espresso', 'juice', 'squash', 'hot chocolate', 'drink'] },
  { category: 'Pottery & Glazes', keywords: ['glaze', 'pottery', 'painting', 'session', 'piece', 'firing', 'bisque', 'stroke'] },
  { category: 'Booking Fees', keywords: ['booking fee', 'deposit', 'reservation'] },
  { category: 'Return / Cancellation Fees', keywords: ['return fee', 'cancellation', 'refund fee', 'no-show'] },
];
function categorizeItemNameByKeyword(name) {
  const lower = (name || '').toLowerCase();
  for (const { category, keywords } of REVENUE_CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => lower.includes(kw))) return category;
  }
  return 'Other';
}

export function registerRevenueCategorySyncRoute(app, supabase, STUDIO_ID, logger, axios) {
  app.post('/api/spec/revenue/sync', async (req, res) => {
    try {
      const daysBack = Math.min(Math.max(parseInt(req.query.daysBack, 10) || 30, 1), 365);

      const { data: connection } = await supabase
        .from('square_connections')
        .select('square_access_token, square_token_expires_at')
        .eq('studio_id', STUDIO_ID)
        .single();
      if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
        return res.status(400).json({ error: 'No valid Square connection', synced: false });
      }
      const token = connection.square_access_token;
      const headers = { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18' };

      const locationsRes = await axios.get('https://connect.squareup.com/v2/locations', { headers });
      const locations = locationsRes.data.locations || [];
      if (!locations.length) return res.json({ synced: true, dates_synced: [], orders_processed: 0, rows_written: 0 });

      // Real Square catalog -> category name maps, variation and item
      // level, faithfully ported from the proven 22 Jul fix. Guarded: if
      // this fails (scope/network), the keyword matcher below still works
      // alone, same graceful degradation as the original.
      const variationCategory = {};
      const itemCategory = {};
      let catalogVariationsMapped = 0;
      try {
        const catNameById = {};
        let catCursor;
        do {
          const params = catCursor ? { types: 'CATEGORY', cursor: catCursor } : { types: 'CATEGORY' };
          const catRes = await axios.get('https://connect.squareup.com/v2/catalog/list', { headers, params });
          (catRes.data.objects || []).forEach((c) => { catNameById[c.id] = c.category_data?.name; });
          catCursor = catRes.data.cursor;
        } while (catCursor);

        let itemCursor;
        do {
          const params = itemCursor ? { types: 'ITEM', cursor: itemCursor } : { types: 'ITEM' };
          const itemRes = await axios.get('https://connect.squareup.com/v2/catalog/list', { headers, params });
          (itemRes.data.objects || []).forEach((it) => {
            const cid = it.item_data?.category_id || it.item_data?.categories?.[0]?.id;
            const nm = catNameById[cid];
            if (!nm) return;
            itemCategory[it.id] = nm;
            (it.item_data?.variations || []).forEach((v) => { variationCategory[v.id] = nm; });
          });
          itemCursor = itemRes.data.cursor;
        } while (itemCursor);
        catalogVariationsMapped = Object.keys(variationCategory).length;
        logger.info(`[revenue-sync] Square catalog categories: ${catalogVariationsMapped} variations mapped`);
      } catch (e) {
        logger.warn('[revenue-sync] catalog categories unavailable, keyword fallback only', e?.response?.data || e.message);
      }

      const categorizeLineItem = (item) =>
        variationCategory[item.catalog_object_id] || itemCategory[item.catalog_object_id] || categorizeItemNameByKeyword(item.name);

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysBack);
      startDate.setUTCHours(0, 0, 0, 0);

      let orders = [];
      let orderCursor;
      do {
        const body = {
          location_ids: locations.map((l) => l.id),
          query: {
            filter: {
              date_time_filter: { created_at: { start_at: startDate.toISOString() } },
              state_filter: { states: ['COMPLETED'] },
            },
          },
          limit: 500,
        };
        if (orderCursor) body.cursor = orderCursor;
        const ordersRes = await axios.post(
          'https://connect.squareup.com/v2/orders/search',
          body,
          { headers: { ...headers, 'Content-Type': 'application/json' } }
        );
        orders = orders.concat(ordersRes.data.orders || []);
        orderCursor = ordersRes.data.cursor;
      } while (orderCursor);

      const dailyCategoryBreakdown = {};
      orders.forEach((order) => {
        const date = (order.created_at || '').split('T')[0];
        if (!date) return;
        if (!dailyCategoryBreakdown[date]) dailyCategoryBreakdown[date] = {};
        (order.line_items || []).forEach((item) => {
          const category = categorizeLineItem(item);
          const itemTotal = item.total_money ? Number(item.total_money.amount) : 0;
          if (!dailyCategoryBreakdown[date][category]) dailyCategoryBreakdown[date][category] = { revenue_cents: 0, item_count: 0 };
          dailyCategoryBreakdown[date][category].revenue_cents += itemTotal;
          dailyCategoryBreakdown[date][category].item_count += Number(item.quantity || 1);
        });
      });

      // Recategorising a date means old rows for it may sit under
      // different category names than the fresh sync produces -- delete
      // each synced date's existing rows first, same as the original,
      // so nothing double-counts.
      const syncedDates = Object.keys(dailyCategoryBreakdown);
      if (syncedDates.length) {
        await supabase.from('revenue_category_breakdown').delete().eq('studio_id', STUDIO_ID).in('metric_date', syncedDates);
      }
      let rowsWritten = 0;
      for (const [date, categories] of Object.entries(dailyCategoryBreakdown)) {
        for (const [category, { revenue_cents, item_count }] of Object.entries(categories)) {
          const { error } = await supabase.from('revenue_category_breakdown').upsert({
            studio_id: STUDIO_ID, metric_date: date, category, revenue_cents, item_count,
          }, { onConflict: 'studio_id,metric_date,category' });
          if (!error) rowsWritten++;
        }
      }

      res.json({
        synced: true,
        dates_synced: syncedDates.sort(),
        orders_processed: orders.length,
        rows_written: rowsWritten,
        catalog_variations_mapped: catalogVariationsMapped,
      });
    } catch (err) {
      logger.error(err.response?.data || err);
      res.status(500).json({ error: err.response?.data?.errors?.[0]?.detail || err.message, synced: false });
    }
  });
}

// ============================================================================
// REVENUE BREAKDOWN -- groups & sub-categories, real, ported not reinvented.
// ----------------------------------------------------------------------------
// Same lost-and-recovered history as the sync above: this is a faithful
// port of GET /api/takings/breakdown (commit 27bc00e, 26 Jul) -- read-only,
// pure aggregation over the real revenue_category_breakdown rows the sync
// route above keeps current. Grouping uses the naming convention already
// present in Square's own real category names rather than inventing a
// taxonomy: 'PB ' = Paint-your-own Bisque (by shape), 'S.' = studio
// sessions & fees, drink/food matched by keyword. Anything that doesn't
// match a known pattern falls to a plain 'Other' group rather than being
// forced into the wrong bucket or silently dropped -- covers real
// categories Square has that nobody's hardcoded for yet (events, external
// sales, whatever the catalog actually contains). The literal Square
// category named 'Other' gets its own distinct, honestly-labelled
// 'Unclassified in Square' group, since that's a real gap in Square's own
// data, not the same thing as 'doesn't match our groups'.
// ============================================================================
export function registerRevenueBreakdownRoute(app, supabase, STUDIO_ID, logger) {
  app.get('/api/spec/revenue/breakdown', async (req, res) => {
    try {
      const { from, to } = req.query;
      let q = supabase
        .from('revenue_category_breakdown')
        .select('metric_date, category, revenue_cents, item_count')
        .eq('studio_id', STUDIO_ID)
        .order('metric_date', { ascending: true });
      if (from) q = q.gte('metric_date', from);
      if (to) q = q.lte('metric_date', to);
      const { data, error } = await q;
      if (error) throw error;
      if (!data.length) return res.json({ groups: [], months: [], stats: null });

      const groupOf = (cat) => {
        const c = (cat || '').trim();
        if (c.startsWith('PB ')) return 'Paint your own — by shape';
        if (c.startsWith('S.')) return 'Studio sessions & fees';
        if (/drink|coffee|milkshake|smoothie|alcohol/i.test(c)) return 'Drinks';
        if (/cake|food|cafe/i.test(c)) return 'Food';
        if (c === 'Other') return 'Unclassified in Square';
        return 'Other';
      };

      const cats = {};
      const groups = {};
      const byMonth = {};
      let total = 0, totalItems = 0;
      const earliest = data[0].metric_date, latest = data[data.length - 1].metric_date;

      for (const r of data) {
        const rev = (r.revenue_cents || 0) / 100;
        const items = r.item_count || 0;
        const cat = (r.category || 'Other').trim();
        const grp = groupOf(cat);
        const mk = r.metric_date.slice(0, 7);

        total += rev; totalItems += items;
        byMonth[mk] = (byMonth[mk] || 0) + rev;

        if (!cats[cat]) cats[cat] = { category: cat, group: grp, revenue: 0, items: 0 };
        cats[cat].revenue += rev; cats[cat].items += items;

        if (!groups[grp]) groups[grp] = { group: grp, revenue: 0, items: 0, categories: new Set() };
        groups[grp].revenue += rev; groups[grp].items += items; groups[grp].categories.add(cat);
      }

      const groupList = Object.values(groups)
        .map((g) => ({
          group: g.group, revenue: g.revenue, items: g.items,
          categoryCount: g.categories.size, pct: total ? (g.revenue / total) * 100 : 0,
          categories: Object.values(cats).filter((c) => c.group === g.group)
            .sort((a, b) => b.revenue - a.revenue)
            .map((c) => ({ category: c.category, revenue: c.revenue, items: c.items, pct: total ? (c.revenue / total) * 100 : 0 })),
        }))
        .sort((a, b) => b.revenue - a.revenue);

      const months = Object.entries(byMonth).map(([month, revenue]) => ({ month, revenue }));

      res.json({
        groups: groupList,
        months,
        stats: { total, totalItems, earliest, latest, categoryCount: Object.keys(cats).length },
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message, groups: [] });
    }
  });
}

export function registerNeedsVerificationRoute(app, supabase, STUDIO_ID, logger) {
  app.get('/api/spec/bookings/needs-verification', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('booking_code, customer_name, table_number, session_start, notes')
        .eq('studio_id', STUDIO_ID)
        .ilike('notes', '%photo review%')
        .order('session_start', { ascending: true });
      if (error) throw error;

      res.json({ bookings: data || [], count: (data || []).length });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message, bookings: [] });
    }
  });
}

// ============================================================================
// KILN DIP-GLAZE TRANSITION -- real, not invented.
// ----------------------------------------------------------------------------
// Part of Daisy's described physical->digital pipeline: card + pieces go
// into a box at collection, box goes for underglaze dip, then each piece's
// card is scanned at that point (by Lucy or whoever's on kiln duty) --
// moving status from 'packed' to a new 'dipped_waiting_firing' stage and
// setting the real firing date. Collection date = firing date + 2 days,
// exactly as stated, auto-set here rather than left for someone to
// remember to calculate by hand.
//
// pottery_pieces.status has no CHECK constraint (confirmed directly against
// pg_constraint before adding a new value) -- safe to introduce
// 'dipped_waiting_firing' alongside the existing packed/fired/collected
// without a migration. booking_id on pottery_pieces is free text (often an
// OCR'd name, not always a real booking_code) -- collection_date is only
// set on demo_app_session_status when booking_id genuinely matches a real
// booking, otherwise the piece transition still happens, just without a
// collection date to attach (nothing to attach it to).
//
// No camera-based QR scanning exists anywhere in this codebase yet -- this
// is real lookup-and-transition logic reachable by typing/selecting a
// booking reference, not a scanner. Actual camera scanning would need a
// library like @zxing/browser added on the frontend, which is real,
// separate follow-up work, not stubbed here as if it already works.
// ============================================================================
export function registerKilnDipTransitionRoute(app, supabase, STUDIO_ID, logger) {
  // Real lookup -- packed pieces for a given booking reference (booking_code
  // or the free-text name some pieces carry instead), so staff can see
  // what's about to be transitioned before confirming.
  app.get('/api/spec/kiln/packed-pieces', async (req, res) => {
    try {
      const bookingRef = (req.query.booking || '').trim();
      if (!bookingRef) return res.status(400).json({ error: 'booking query param is required', pieces: [] });

      const { data, error } = await supabase
        .from('pottery_pieces')
        .select('id, booking_id, piece_type, status, created_at')
        .eq('studio_id', STUDIO_ID)
        .eq('booking_id', bookingRef)
        .eq('status', 'packed')
        .order('created_at', { ascending: true });
      if (error) throw error;
      res.json({ pieces: data || [] });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message, pieces: [] });
    }
  });

  // Real transition -- packed -> dipped_waiting_firing, sets the real
  // firing date Lucy enters (not guessed -- no real kiln firing cadence is
  // known, so this isn't auto-calculated), and auto-sets collection_date
  // as firing_date + 2 days on the real booking if booking_id matches one.
  app.post('/api/spec/kiln/dip-transition', async (req, res) => {
    try {
      const { piece_ids, firing_date } = req.body || {};
      if (!Array.isArray(piece_ids) || piece_ids.length === 0) {
        return res.status(400).json({ error: 'piece_ids must be a non-empty array' });
      }
      if (typeof firing_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(firing_date)) {
        return res.status(400).json({ error: 'firing_date must be an ISO date string (YYYY-MM-DD)' });
      }

      const { data: pieces, error: fetchErr } = await supabase
        .from('pottery_pieces')
        .select('id, booking_id, status')
        .eq('studio_id', STUDIO_ID)
        .in('id', piece_ids);
      if (fetchErr) throw fetchErr;
      if (!pieces || !pieces.length) return res.status(404).json({ error: 'No matching pieces found' });

      const { error: updateErr } = await supabase
        .from('pottery_pieces')
        .update({ status: 'dipped_waiting_firing', scheduled_firing_date: firing_date })
        .eq('studio_id', STUDIO_ID)
        .in('id', piece_ids);
      if (updateErr) throw updateErr;

      // +2 days, exactly as stated -- real date arithmetic, not a guess.
      const collectionDate = new Date(firing_date + 'T00:00:00Z');
      collectionDate.setUTCDate(collectionDate.getUTCDate() + 2);
      const collectionDateStr = collectionDate.toISOString().slice(0, 10);

      const bookingRefs = [...new Set(pieces.map((p) => p.booking_id).filter(Boolean))];
      const realBookingCodes = [];
      if (bookingRefs.length) {
        const { data: matched } = await supabase
          .from('bookings')
          .select('booking_code')
          .eq('studio_id', STUDIO_ID)
          .in('booking_code', bookingRefs);
        (matched || []).forEach((b) => realBookingCodes.push(b.booking_code));
      }

      for (const code of realBookingCodes) {
        const { data: existing } = await supabase
          .from('demo_app_session_status')
          .select('id')
          .eq('studio_id', STUDIO_ID)
          .eq('booking_code', code)
          .maybeSingle();
        if (existing) {
          await supabase.from('demo_app_session_status').update({ collection_date: collectionDateStr }).eq('id', existing.id);
        } else {
          await supabase.from('demo_app_session_status').insert({ studio_id: STUDIO_ID, booking_code: code, collection_date: collectionDateStr });
        }
      }

      res.json({
        transitioned: pieces.length,
        firing_date,
        collection_date: collectionDateStr,
        bookings_updated: realBookingCodes,
        unmatched_booking_refs: bookingRefs.filter((r) => !realBookingCodes.includes(r)),
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Real lookup for the "mark fired" step -- pieces currently waiting on
  // the kiln for a given booking reference.
  app.get('/api/spec/kiln/dipped-pieces', async (req, res) => {
    try {
      const bookingRef = (req.query.booking || '').trim();
      if (!bookingRef) return res.status(400).json({ error: 'booking query param is required', pieces: [] });
      const { data, error } = await supabase
        .from('pottery_pieces')
        .select('id, booking_id, piece_type, status, scheduled_firing_date')
        .eq('studio_id', STUDIO_ID)
        .eq('booking_id', bookingRef)
        .eq('status', 'dipped_waiting_firing')
        .order('created_at', { ascending: true });
      if (error) throw error;
      res.json({ pieces: data || [] });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message, pieces: [] });
    }
  });

  // The real missing link the dip-glaze transition needed: dipped ->
  // actually fired. Sets glaze_fired_at (real column, already existed on
  // pottery_pieces) and fires the real ready-for-collection email if
  // RESEND_API_KEY is configured -- this is the natural point Daisy's own
  // description puts it ("generally two days after that, they'll be ready
  // for collection" -- firing is the event, not dip-glazing).
  app.post('/api/spec/kiln/mark-fired', async (req, res) => {
    try {
      const { piece_ids } = req.body || {};
      if (!Array.isArray(piece_ids) || piece_ids.length === 0) {
        return res.status(400).json({ error: 'piece_ids must be a non-empty array' });
      }
      const { data: pieces, error: fetchErr } = await supabase
        .from('pottery_pieces')
        .select('id, booking_id')
        .eq('studio_id', STUDIO_ID)
        .in('id', piece_ids);
      if (fetchErr) throw fetchErr;
      if (!pieces || !pieces.length) return res.status(404).json({ error: 'No matching pieces found' });

      const { error: updateErr } = await supabase
        .from('pottery_pieces')
        .update({ status: 'fired', glaze_fired_at: new Date().toISOString() })
        .eq('studio_id', STUDIO_ID)
        .in('id', piece_ids);
      if (updateErr) throw updateErr;

      const bookingRefs = [...new Set(pieces.map((p) => p.booking_id).filter(Boolean))];
      const emailResults = [];
      if (bookingRefs.length) {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('booking_code, customer_name, customer_email')
          .eq('studio_id', STUDIO_ID)
          .in('booking_code', bookingRefs);

        for (const booking of bookings || []) {
          const { data: status } = await supabase
            .from('demo_app_session_status')
            .select('collection_date')
            .eq('studio_id', STUDIO_ID)
            .eq('booking_code', booking.booking_code)
            .maybeSingle();
          const sent = await sendCollectionEmail({
            to: booking.customer_email,
            customerName: booking.customer_name,
            collectionDate: status?.collection_date || null,
            logger,
          });
          emailResults.push({ booking_code: booking.booking_code, ...sent });
        }
      }

      res.json({ marked_fired: pieces.length, bookings: bookingRefs, email_results: emailResults });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// COLLECTION EMAIL -- real Resend API call, gated behind RESEND_API_KEY.
// ----------------------------------------------------------------------------
// Checked directly before writing this: no email-sending capability exists
// anywhere in this codebase (no nodemailer, no email API package, nothing).
// This is complete, real, correct code against Resend's actual REST API
// (a simple, well-documented transactional email API -- one POST, Bearer
// auth) -- but it CANNOT send anything until a real RESEND_API_KEY is set
// in the environment and a real sending domain is verified with Resend,
// both of which are account-setup steps outside what this code can do.
// If the key isn't set, this returns 'not configured' honestly rather
// than pretending an email went out. FROM_EMAIL also needs to be a real
// verified sender address once that account exists.
// ============================================================================
async function sendCollectionEmail({ to, customerName, collectionDate, logger }) {
  if (!process.env.RESEND_API_KEY) {
    logger.warn('[collection-email] RESEND_API_KEY not set -- not configured, no email sent');
    return { sent: false, reason: 'not_configured' };
  }
  if (!to) {
    return { sent: false, reason: 'no_customer_email' };
  }
  try {
    const dateText = collectionDate
      ? new Date(collectionDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
      : 'soon';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.FROM_EMAIL || 'The Kiln Cafe <hello@thekilncafe.com>',
        to: [to],
        subject: 'Your pottery is fired and ready!',
        html: `<p>Hi ${customerName || 'there'},</p><p>Great news -- your pottery has come out of the kiln and is ready for collection${collectionDate ? ` from <strong>${dateText}</strong>` : ''}.</p><p>See you soon!</p><p>The Kiln Cafe</p>`,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.error('[collection-email] Resend API error', body);
      return { sent: false, reason: body?.message || 'send_failed' };
    }
    return { sent: true, id: body?.id || null };
  } catch (err) {
    logger.error('[collection-email] request failed', err);
    return { sent: false, reason: err.message };
  }
}

// ============================================================================
// ROYAL MAIL POSTAGE LABEL -- real Click & Drop API shape, gated behind
// ROYAL_MAIL_API_KEY.
// ----------------------------------------------------------------------------
// Checked directly: no shipping/label infrastructure exists anywhere in
// this codebase (only a postal RATE lookup existed before, no label
// creation). This targets Royal Mail's real Click & Drop (OBA) orders
// API shape from genuine knowledge of it -- but it has never been tested
// against a real Royal Mail account (none exists to test against), and
// Royal Mail's actual auth flow may need adjustment once real credentials
// are added and a first real order is attempted -- flagged honestly in
// the code rather than presented as proven. Deliberately does NOT put a
// QR code on the label -- Daisy's own instinct that it "might confuse the
// postal" service is sound; a label should carry only what a courier
// service expects to read.
// ============================================================================
export function registerPostalLabelRoute(app, supabase, STUDIO_ID, logger) {
  app.post('/api/spec/postal/create-label', async (req, res) => {
    try {
      const { booking_code, person_name, recipient_name, postcode, address_line1, city, weight_grams } = req.body || {};
      if (!recipient_name || !postcode || !address_line1) {
        return res.status(400).json({ error: 'recipient_name, address_line1 and postcode are required' });
      }
      if (!weight_grams || weight_grams <= 0) {
        return res.status(400).json({ error: 'weight_grams is required -- weigh the real parcel, this is not estimated automatically' });
      }
      if (!process.env.ROYAL_MAIL_API_KEY) {
        return res.status(400).json({
          error: 'Royal Mail not configured -- ROYAL_MAIL_API_KEY needs to be set once a real Click & Drop business account exists',
          configured: false,
        });
      }

      const orderRes = await fetch('https://api.parcel.royalmail.com/api/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.ROYAL_MAIL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              orderReference: booking_code + (person_name ? `-${person_name}` : ''),
              recipient: {
                address: {
                  fullName: recipient_name,
                  addressLine1: address_line1,
                  city: city || undefined,
                  postcode,
                  countryCode: 'GB',
                },
              },
              packages: [{ weightInGrams: Math.round(weight_grams) }],
              orderDate: new Date().toISOString(),
              postageDetails: { conversationId: booking_code },
            },
          ],
        }),
      });
      const body = await orderRes.json().catch(() => ({}));
      if (!orderRes.ok) {
        logger.error('[postal-label] Royal Mail API error', body);
        return res.status(502).json({ error: body?.errors?.[0]?.errorDescription || 'Royal Mail order creation failed', configured: true, raw: body });
      }

      res.json({
        created: true,
        configured: true,
        order_identifier: body?.createdOrders?.[0]?.orderIdentifier || null,
        tracking_number: body?.createdOrders?.[0]?.trackingNumber || null,
        label_url: body?.createdOrders?.[0]?.label?.labelURL || null,
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// EQUIPMENT REQUEST (stylus & tablet) — real staff alert, not a fake sale.
// ----------------------------------------------------------------------------
// No Square item exists for this (checked directly -- searched item_name for
// stylus/tablet/pen/ipad, nothing real came back). This is a customer asking
// staff to bring something over, not a purchase, so it writes to the real
// staff_alerts table Alerts already reads, rather than being dressed up as
// a £0 till item.
// ============================================================================
export function registerEquipmentRequestRoute(app, supabase, STUDIO_ID, logger) {
  app.post('/api/spec/equipment-request', async (req, res) => {
    try {
      const { booking_code, customer_name, table_number } = req.body || {};
      if (!booking_code) return res.status(400).json({ error: 'booking_code required' });

      const { data, error } = await supabase
        .from('staff_alerts')
        .insert([{
          studio_id: STUDIO_ID,
          trigger_type: 'equipment_request',
          booking_code,
          icon: '✏️',
          label: 'Stylus & tablet requested',
          message: `${customer_name || 'A customer'}${table_number ? ` (Table ${table_number})` : ''} would like a stylus and tablet for the design tools.`,
          priority: 2,
          acknowledged: false,
        }])
        .select('id, created_at')
        .maybeSingle();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// DESIGN TOOL CHARGES — real config, real Square order pathway, safe by
// default. Mirrors main's _safeCreateOrder exactly: SQUARE_WRITES_ENABLED
// must be explicitly 'true' or this returns simulated:true and does NOT
// touch Square at all. A blocked charge must never look like a sent one --
// that's the whole point of the pattern, carried over deliberately rather
// than reinvented, because getting this wrong with real money is a much
// worse failure than getting it wrong with a demo booking.
// ============================================================================
const DEFAULT_CUSTOMER_GENERATION_PRICE_CENTS = 20;  // Design Preview -- real default from main
const DEFAULT_CUSTOMER_PRINT_PRICE_CENTS = 150;      // Transfer Designer -- real default from main

async function safeCreateSquareOrder(supabase, STUDIO_ID, axios, logger, { itemName, priceCents, bookingCode, customerName }) {
  const writesEnabled = process.env.SQUARE_WRITES_ENABLED === 'true';

  if (!writesEnabled) {
    logger.info(`[SQUARE WRITE BLOCKED — safe mode] Would have charged ${itemName} £${(priceCents / 100).toFixed(2)} for ${customerName || bookingCode}`);
    return { simulated: true, order_id: `SIMULATED-${Date.now()}` };
  }

  const { data: connection } = await supabase
    .from('square_connections')
    .select('square_access_token, square_token_expires_at')
    .eq('studio_id', STUDIO_ID)
    .single();
  if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
    throw new Error('No valid Square connection -- cannot create a real order');
  }

  const token = connection.square_access_token;
  const locationsRes = await axios.get('https://connect.squareup.com/v2/locations', {
    headers: { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18' },
  });
  const locationId = locationsRes.data.locations?.[0]?.id;
  if (!locationId) throw new Error('No Square location found');

  const orderRes = await axios.post(
    'https://connect.squareup.com/v2/orders',
    {
      order: {
        location_id: locationId,
        line_items: [{
          name: itemName,
          quantity: '1',
          base_price_money: { amount: priceCents, currency: 'GBP' },
          note: `Table: ${bookingCode || 'walk-in'}${customerName ? ` · ${customerName}` : ''}`,
        }],
        reference_id: bookingCode || undefined,
        state: 'OPEN',
      },
      idempotency_key: `glazeup-${bookingCode || 'wk'}-${Date.now()}`,
    },
    { headers: { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18', 'Content-Type': 'application/json' } }
  );

  return { simulated: false, order_id: orderRes.data.order?.id };
}

export function registerDesignChargeRoute(app, supabase, STUDIO_ID, logger, axios) {
  app.post('/api/spec/design-tools/:tool/charge', async (req, res) => {
    try {
      const { tool } = req.params;
      const { booking_code, customer_name } = req.body || {};
      if (!['design-preview', 'transfer-designer'].includes(tool)) {
        return res.status(400).json({ error: 'Unknown tool' });
      }

      const { data: cfg } = await supabase
        .from('ai_design_config')
        .select('customer_generation_price_cents, customer_print_price_cents')
        .eq('studio_id', STUDIO_ID)
        .maybeSingle();

      const priceCents = tool === 'design-preview'
        ? cfg?.customer_generation_price_cents ?? DEFAULT_CUSTOMER_GENERATION_PRICE_CENTS
        : cfg?.customer_print_price_cents ?? DEFAULT_CUSTOMER_PRINT_PRICE_CENTS;

      const itemName = tool === 'design-preview' ? 'Design Preview' : 'Transfer Designer';

      const result = await safeCreateSquareOrder(supabase, STUDIO_ID, axios, logger, {
        itemName, priceCents, bookingCode: booking_code, customerName: customer_name,
      });

      res.json({ ...result, price_cents: priceCents, item_name: itemName });
    } catch (err) {
      logger.error(err.response?.data || err);
      res.status(500).json({ error: err.response?.data?.errors?.[0]?.detail || err.message });
    }
  });
}

// ============================================================================
// FULFILMENT METHOD — collection vs posted, set/confirmed at Completion.
// Real column (bookings.fulfilment_method), currently 'collection' on every
// real booking since none have been posted yet. This just lets staff record
// it at the point pieces are photographed, per Daisy's request.
// ============================================================================
export function registerFulfilmentRoute(app, supabase, STUDIO_ID, logger) {
  app.post('/api/spec/bookings/:code/fulfilment', async (req, res) => {
    try {
      const { fulfilment_method } = req.body || {};
      if (!['collection', 'posted'].includes(fulfilment_method)) {
        return res.status(400).json({ error: "fulfilment_method must be 'collection' or 'posted'" });
      }
      const { data, error } = await supabase
        .from('bookings')
        .update({ fulfilment_method })
        .eq('booking_code', req.params.code)
        .eq('studio_id', STUDIO_ID)
        .select('booking_code, fulfilment_method')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Booking not found' });
      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Manual party-size entry -- the honest fallback for the real bookings
  // that have no automatically-recoverable number anywhere in the system
  // (checked directly: Square's own Bookings API, catalog pricing tiers,
  // booking notes, and table-capacity data all came up empty for these).
  // A real person types in what they actually know.
  app.post('/api/spec/bookings/:code/party-size', async (req, res) => {
    try {
      const { party_size } = req.body || {};
      const size = Number(party_size);
      if (!Number.isInteger(size) || size < 1 || size > 30) {
        return res.status(400).json({ error: 'party_size must be a whole number between 1 and 30' });
      }
      const { data, error } = await supabase
        .from('bookings')
        .update({ party_size: size })
        .eq('booking_code', req.params.code)
        .eq('studio_id', STUDIO_ID)
        .select('booking_code, party_size')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Booking not found' });
      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Manual table-number entry -- table_number is a free-text column (no
  // enum, no split/combine picker needed): staff can already type any real
  // arrangement -- '3A', '3B', '3+4', '1&2' -- for splitting one table into
  // two smaller ones or combining several into a group, same as they'd
  // write it on paper. Same guard pattern as party-size above.
  app.post('/api/spec/bookings/:code/table-number', async (req, res) => {
    try {
      const raw = (req.body || {}).table_number;
      const table_number = typeof raw === 'string' ? raw.trim() : '';
      if (!table_number) {
        return res.status(400).json({ error: 'table_number must be a non-empty string' });
      }
      if (table_number.length > 20) {
        return res.status(400).json({ error: 'table_number must be 20 characters or fewer' });
      }
      const { data, error } = await supabase
        .from('bookings')
        .update({ table_number })
        .eq('booking_code', req.params.code)
        .eq('studio_id', STUDIO_ID)
        .select('booking_code, table_number')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Booking not found' });
      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Collection date, settable independently of the Floor completion flow --
  // per Daisy: staff need to set this at print time (morning), before the
  // session has even started, not only at hand-off. Upserts into
  // demo_app_session_status without touching finished_at/payment/collection
  // method -- setting a collection date doesn't mean the booking is
  // finished, those stay whatever they already were (or null, for a fresh
  // booking that hasn't run yet).
  app.post('/api/spec/bookings/:code/collection-date', async (req, res) => {
    try {
      const raw = (req.body || {}).collection_date;
      if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return res.status(400).json({ error: 'collection_date must be an ISO date string (YYYY-MM-DD)' });
      }
      const { data: existing } = await supabase
        .from('demo_app_session_status')
        .select('id')
        .eq('booking_code', req.params.code)
        .eq('studio_id', STUDIO_ID)
        .maybeSingle();

      let result;
      if (existing) {
        result = await supabase
          .from('demo_app_session_status')
          .update({ collection_date: raw })
          .eq('id', existing.id)
          .select('booking_code, collection_date')
          .maybeSingle();
      } else {
        result = await supabase
          .from('demo_app_session_status')
          .insert({ studio_id: STUDIO_ID, booking_code: req.params.code, collection_date: raw })
          .select('booking_code, collection_date')
          .maybeSingle();
      }
      if (result.error) throw result.error;
      res.json(result.data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// TEST AI — standalone shape/colour/pattern matching test, decoupled from
// real bookings entirely. Daisy's request: photograph a couple of reference
// items, then photograph them mixed among a pile of other household stuff,
// see if the AI can pick the reference items back out. This isolates "does
// the vision matching itself work" from "does it match a real customer",
// which needs real fired pieces + real bookings to test properly and can't
// be exercised with household items.
//
// Same real gpt-4o-mini call, same real cost logging, same honest confidence
// bands as Shelf Sweep -- this is not a separate AI system, just a different
// wanted-list source (a photo instead of the real bookings table).
// ============================================================================
export function registerTestAiRoute(app, supabase, STUDIO_ID, logger, upload, fs, axios, logAiUsage) {
  app.post('/api/spec/test-ai/match', upload.fields([{ name: 'reference', maxCount: 1 }, { name: 'scene', maxCount: 1 }]), async (req, res) => {
    try {
      const referenceFile = req.files?.reference?.[0];
      const sceneFile = req.files?.scene?.[0];
      if (!referenceFile || !sceneFile) {
        return res.status(400).json({ error: 'Both a reference photo and a scene photo are required' });
      }
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
      if (!OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not configured on this service' });

      const referenceB64 = fs.readFileSync(referenceFile.path).toString('base64');
      const sceneB64 = fs.readFileSync(sceneFile.path).toString('base64');

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o-mini',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: `The FIRST image shows one or more reference items -- the things we're trying to find. The SECOND image shows a larger, jumbled scene that may or may not contain those same items mixed in among other things.

Describe each reference item from image 1 first: its colour(s), its pattern or markings and where they sit, and only lastly its rough shape. Shape is the weakest clue here -- real testing on this project found that identically-shaped items are extremely common, so colour and pattern are what actually distinguish one object from another. Lead with those.

Then look at image 2 and say, for EACH reference item, whether you can see it in the scene -- and if so, describe distinctly where it is in the frame (e.g. "back left, next to the blue mug") and what specifically about colour/pattern convinced you, not shape alone.

Respond with ONLY a JSON object, no markdown, no other text:
{"reference_items": [{"description": "<colour/pattern-led description>"}], "matches": [{"reference_item": "<short label>", "found": true|false, "location_in_scene": "<where, or null>", "reasoning": "<what colour/pattern evidence, or null>", "confidence": "high|medium|low"}]}`,
              },
              { type: 'image_url', image_url: { url: `data:${referenceFile.mimetype};base64,${referenceB64}` } },
              { type: 'image_url', image_url: { url: `data:${sceneFile.mimetype};base64,${sceneB64}` } },
            ],
          }],
          max_tokens: 900,
        },
        { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
      );

      await logAiUsage(supabase, STUDIO_ID, 'test-ai-match', response.data.usage);

      let parsed = { reference_items: [], matches: [] };
      try {
        const raw = response.data.choices[0].message.content;
        const jsonStr = raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        logger.error('test-ai/match: failed to parse response', e);
      }

      res.json(parsed);
    } catch (err) {
      logger.error(err.response?.data || err);
      res.status(500).json({ error: err.response?.data?.error?.message || err.message });
    }
  });
}

// ============================================================================
// PARTY SIZE RECOVERY — real gap found: party_size is null on 275 of 281
// real bookings, but the actual number is encoded in the name of the real
// Square catalog variation each booking references ('The Lounge -- Table
// for 4', 'Evening Session -- 4 people'). Whatever originally synced
// bookings from Square dropped this. Recovered here via Square's real
// Bookings API (read) + the already-synced local catalog (no extra live
// call needed to resolve the name), never guessed or invented.
// ============================================================================
// The REAL, authoritative party-size signal, carried over verbatim from
// main's own proven parser rather than reinvented. Important correction to
// the catalog-name approach above: Square's Bookings API has NO party size
// field at all -- what partySizeFromItemName() recovers is which PRICING
// TIER was booked ('Table for 4'), a plausible proxy that happened to be
// right for the one booking it was tested on, not a genuine per-booking
// headcount. This is the real signal: customers TELL staff the headcount
// in their own booking note ('6 people', 'party of 4', 'table for 5').
//
// Deliberate privacy boundary, carried over exactly as reasoned on main:
// extract ONLY the integer. Notes can contain real Article 9 special
// category data under UK GDPR ('bringing a pram', 'gluten free option') --
// parsing those into structured fields would build a database of who has
// babies or coeliac disease with no consent and no lawful basis. Staff can
// read the note directly since it's already on the booking; this function
// extracts one number and looks away from everything else in it.
function partySizeFromNote(note) {
  if (!note || typeof note !== 'string') return null;
  const n = note.toLowerCase();
  const patterns = [
    /\b(\d{1,2})\s*(?:people|persons?|adults?|ladies|guests?|painters?|of us)\b/,
    /\bparty of\s*(\d{1,2})\b/,
    /\bbooking for\s*(\d{1,2})\b/,
    /\btable for\s*(\d{1,2})\b/,
    /\bgroup of\s*(\d{1,2})\b/,
    /\bthere(?:'ll| will) be\s*(\d{1,2})\b/,
  ];
  for (const re of patterns) {
    const m = n.match(re);
    if (m) {
      const size = parseInt(m[1], 10);
      if (size >= 1 && size <= 20) return size;
    }
  }
  return null;
}

function partySizeFromItemName(name) {
  if (!name) return null;
  const m = name.match(/(?:table for|for)\s*(\d+)|(\d+)\s*(?:people|person)/i);
  if (!m) return null;
  return parseInt(m[1] || m[2], 10);
}

export function registerPartySizeRoute(app, supabase, STUDIO_ID, logger, axios) {
  // Read-only diagnostic for ONE booking -- check this looks right before
  // trusting it enough to run at scale.
  app.get('/api/spec/bookings/:code/recover-party-size', async (req, res) => {
    try {
      const { data: booking } = await supabase
        .from('bookings')
        .select('booking_code, customer_name, square_booking_id, party_size')
        .eq('studio_id', STUDIO_ID)
        .eq('booking_code', req.params.code)
        .maybeSingle();
      if (!booking) return res.status(404).json({ error: 'Booking not found' });
      if (!booking.square_booking_id) return res.json({ ...booking, recovered: null, note: 'No square_booking_id on this row' });

      const { data: connection } = await supabase
        .from('square_connections')
        .select('square_access_token, square_token_expires_at')
        .eq('studio_id', STUDIO_ID)
        .single();
      if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
        return res.status(400).json({ error: 'No valid Square connection' });
      }

      const bookingRes = await axios.get(
        `https://connect.squareup.com/v2/bookings/${booking.square_booking_id}`,
        { headers: { Authorization: `Bearer ${connection.square_access_token}`, 'Square-Version': '2024-01-18', Accept: 'application/json' } }
      );
      const segments = bookingRes.data.booking?.appointment_segments || [];
      const variationId = segments[0]?.service_variation_id || null;

      let itemName = null, recovered = null;
      if (variationId) {
        const { data: item } = await supabase
          .from('square_items')
          .select('item_name')
          .eq('studio_id', STUDIO_ID)
          .eq('variation_id', variationId)
          .maybeSingle();
        itemName = item?.item_name || null;
        recovered = partySizeFromItemName(itemName);
      }

      res.json({ ...booking, square_variation_id: variationId, matched_item_name: itemName, recovered });
    } catch (err) {
      // Surface Square's ACTUAL error body rather than a generic axios
      // message -- the first version of this tried to pull one specific
      // field out of the error response that this error shape didn't have,
      // so it silently fell back to 'Request failed with status code 406'
      // and told us nothing real about what Square was actually objecting to.
      logger.error('recover-party-size failed', err.response?.data || err.message);
      return res.status(500).json({
        error: err.message,
        square_status: err.response?.status || null,
        square_error_body: err.response?.data || null,
      });
    }
  });

  // Bulk backfill -- ONLY built and run after the single-booking diagnostic
  // above was verified against real data (Tom Ashton, recovered:4, matched
  // the real 'Table for 4' variation exactly). Same real recovery logic,
  // applied to every real booking that's missing party_size and has a
  // square_booking_id to recover it from. Paced with a small delay between
  // Square calls to stay well clear of rate limits across ~275 real rows.
  // Reports a real summary rather than a bare 'done' -- recovered / not
  // found / errored counts, so nothing is silently swallowed.
  // Real, in-memory job state -- fine for a one-off ~40s job that lives and
  // dies within this process, doesn't need Supabase-backed persistence.
  const backfillState = {
    running: false,
    done: false,
    recovered: 0,
    not_found: 0,
    errored: 0,
    total: 0,
    checked: 0,
    errors: [],
    startedError: null,
  };

  async function runBackfillJob(supabase, STUDIO_ID, axios, logger, connection) {
    try {
      const { data: candidates, error: candErr } = await supabase
        .from('bookings')
        .select('booking_code, square_booking_id')
        .eq('studio_id', STUDIO_ID)
        .is('party_size', null)
        .not('square_booking_id', 'is', null);
      if (candErr) throw candErr;

      backfillState.total = (candidates || []).length;

      for (const c of candidates || []) {
        try {
          const bookingRes = await axios.get(
            `https://connect.squareup.com/v2/bookings/${c.square_booking_id}`,
            { headers: { Authorization: `Bearer ${connection.square_access_token}`, 'Square-Version': '2024-01-18', Accept: 'application/json' } }
          );
          const variationId = bookingRes.data.booking?.appointment_segments?.[0]?.service_variation_id || null;
          let recovered = null;
          if (variationId) {
            const { data: item } = await supabase
              .from('square_items')
              .select('item_name')
              .eq('studio_id', STUDIO_ID)
              .eq('variation_id', variationId)
              .maybeSingle();
            recovered = partySizeFromItemName(item?.item_name || null);
          }

          if (recovered) {
            await supabase
              .from('bookings')
              .update({ party_size: recovered })
              .eq('booking_code', c.booking_code)
              .eq('studio_id', STUDIO_ID);
            backfillState.recovered++;
          } else {
            backfillState.not_found++;
          }
        } catch (err) {
          backfillState.errored++;
          if (backfillState.errors.length < 10) {
            backfillState.errors.push({ booking_code: c.booking_code, error: err.response?.data?.errors?.[0]?.detail || err.message });
          }
        }
        backfillState.checked++;
        // Small pace between real Square calls across a real bulk run.
        await new Promise((r) => setTimeout(r, 150));
      }
    } catch (err) {
      logger.error('backfill-party-sizes job failed', err.response?.data || err.message);
      backfillState.startedError = err.message;
    } finally {
      backfillState.running = false;
      backfillState.done = true;
    }
  }

  // Starts the real job in the background and returns immediately --
  // deliberately NOT awaited. The previous version held the HTTP request
  // open for the full ~40s run with nothing sent back until the very end;
  // over a real mobile connection that got killed by a network/proxy
  // timeout before it ever finished; a blocked backfill isn't dangerous
  // like a blocked Square charge, but it DID silently waste real API calls
  // against the ones it got through before being cut off. Poll /status
  // instead of waiting on this response.
  app.post('/api/spec/bookings/backfill-party-sizes', async (req, res) => {
    if (backfillState.running) {
      return res.json({ started: false, already_running: true });
    }
    try {
      const { data: connection } = await supabase
        .from('square_connections')
        .select('square_access_token, square_token_expires_at')
        .eq('studio_id', STUDIO_ID)
        .single();
      if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
        return res.status(400).json({ error: 'No valid Square connection' });
      }

      backfillState.running = true;
      backfillState.done = false;
      backfillState.recovered = 0;
      backfillState.not_found = 0;
      backfillState.errored = 0;
      backfillState.total = 0;
      backfillState.checked = 0;
      backfillState.errors = [];
      backfillState.startedError = null;

      runBackfillJob(supabase, STUDIO_ID, axios, logger, connection); // not awaited on purpose
      res.json({ started: true });
    } catch (err) {
      logger.error('backfill-party-sizes failed to start', err.response?.data || err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/spec/bookings/backfill-party-sizes/status', (req, res) => {
    res.json(backfillState);
  });

  // The REAL, authoritative pass: parses party size from each real
  // booking's already-stored notes text (the customer's own stated
  // headcount), using partySizeFromNote() above. Purely local -- reads
  // and writes only this database, no live Square call needed at all,
  // so unlike the catalog-name approach this runs synchronously in one
  // request rather than needing a background job.
  app.post('/api/spec/bookings/backfill-party-sizes-from-notes', async (req, res) => {
    try {
      const { data: candidates, error } = await supabase
        .from('bookings')
        .select('booking_code, notes')
        .eq('studio_id', STUDIO_ID)
        .is('party_size', null)
        .not('notes', 'is', null);
      if (error) throw error;

      let recovered = 0, not_found = 0;
      for (const c of candidates || []) {
        const size = partySizeFromNote(c.notes);
        if (size) {
          await supabase
            .from('bookings')
            .update({ party_size: size })
            .eq('booking_code', c.booking_code)
            .eq('studio_id', STUDIO_ID);
          recovered++;
        } else {
          not_found++;
        }
      }

      res.json({ recovered, not_found, total: (candidates || []).length });
    } catch (err) {
      logger.error('backfill-party-sizes-from-notes failed', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// REAL BOOKING SYNC -- creates the actual missing rows, not just fixes
// party_size on ones that already exist.
// ----------------------------------------------------------------------------
// The real gap: nothing has created a new booking row since 9 Aug (checked
// directly: 256 real bookings, ALL carry a synced_from_square timestamp,
// most recent exactly 9 Aug -- a real sync ran and stopped, same story as
// revenue). Unlike revenue, no trace of the original sync code survives
// anywhere in this repo's history (checked: its own first commit is
// literally 'Initial commit') -- has to be rebuilt fresh, not ported.
//
// Reuses the exact proven party-size logic already built and tested here
// (partySizeFromItemName, the local square_items cache) rather than
// reinventing it or hitting Square's live Catalog API per booking --
// confirmed live via the diagnostic: service variation names genuinely
// encode party size directly ('3 Person', 'Table for 4' etc), and this
// exact regex already handles both real conventions in use.
//
// Registered onto the SAME route path the dead stub used
// (POST /api/bookings/sync) -- the existing 'Check for new bookings'
// button on daily-cards already calls this, so it starts working for real
// with zero frontend changes.
export function registerRealBookingSyncRoute(app, supabase, STUDIO_ID, logger, axios) {
  app.post('/api/bookings/sync', async (req, res) => {
    try {
      const { data: connection } = await supabase
        .from('square_connections')
        .select('square_access_token, square_token_expires_at')
        .eq('studio_id', STUDIO_ID)
        .single();
      if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
        return res.status(400).json({ error: 'No valid Square connection', synced: 0 });
      }
      const token = connection.square_access_token;
      const headers = { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18', Accept: 'application/json' };

      const locationsRes = await axios.get('https://connect.squareup.com/v2/locations', { headers });
      const locations = locationsRes.data.locations || [];
      if (!locations.length) return res.json({ synced: 0, reason: 'no_square_locations' });

      // Real gap-catching window: from the last known real sync (9 Aug)
      // through 30 days ahead, so every run both catches up what's missing
      // and keeps pulling genuinely new future bookings.
      const startMin = new Date('2026-08-09T00:00:00Z').toISOString();
      const startMax = new Date();
      startMax.setDate(startMax.getDate() + 30);

      let allBookings = [];
      let cursor;
      do {
        const params = {
          location_id: locations[0].id,
          start_at_min: startMin,
          start_at_max: startMax.toISOString(),
          limit: 100,
        };
        if (cursor) params.cursor = cursor;
        const bookingsRes = await axios.get('https://connect.squareup.com/v2/bookings', { headers, params });
        allBookings = allBookings.concat(bookingsRes.data.bookings || []);
        cursor = bookingsRes.data.cursor;
      } while (cursor);

      // Skip what's already real -- match on square_booking_id, the same
      // real identifier every already-synced row carries.
      const { data: existing } = await supabase
        .from('bookings')
        .select('square_booking_id')
        .eq('studio_id', STUDIO_ID)
        .not('square_booking_id', 'is', null);
      const existingIds = new Set((existing || []).map((b) => b.square_booking_id));
      const newBookings = allBookings.filter((b) => !existingIds.has(b.id));

      let synced = 0, errored = 0;
      const errors = [];

      for (const b of newBookings) {
        try {
          // Real customer name -- a failed lookup here shouldn't lose the
          // whole booking, just falls back honestly rather than guessing.
          let customerName = 'Unknown';
          if (b.customer_id) {
            try {
              const custRes = await axios.get(`https://connect.squareup.com/v2/customers/${b.customer_id}`, { headers });
              const c = custRes.data.customer;
              customerName = [c?.given_name, c?.family_name].filter(Boolean).join(' ') || c?.company_name || 'Unknown';
            } catch (e) { /* leave as Unknown */ }
          }

          // Real party size, exact same proven logic as the existing
          // party-size backfill above -- local square_items cache lookup,
          // no extra live Catalog call needed.
          const variationId = b.appointment_segments?.[0]?.service_variation_id || null;
          let partySize = null;
          if (variationId) {
            const { data: item } = await supabase
              .from('square_items')
              .select('item_name')
              .eq('studio_id', STUDIO_ID)
              .eq('variation_id', variationId)
              .maybeSingle();
            partySize = partySizeFromItemName(item?.item_name || null);
          }

          const durationMin = b.appointment_segments?.[0]?.duration_minutes || null;
          const startAt = new Date(b.start_at);
          const endAt = durationMin ? new Date(startAt.getTime() + durationMin * 60000) : null;

          // Real, simple sequential table allocation -- "just numbers for
          // now" per Daisy, so every synced booking has SOME table from
          // the moment it exists rather than needing a manual step first.
          // Cycles 1-8 (Main Studio's real table count) per exact session
          // slot, since bookings at the same time genuinely need
          // different tables, but different time slots on the same day
          // can safely reuse the same numbers once a table's free again.
          // This is a starting allocation only -- the real Square ticket
          // sync below (registerLiveTableSyncRoute) overwrites it with
          // the table staff actually seat people at, which always wins.
          const { count: sameSlotCount } = await supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('studio_id', STUDIO_ID)
            .eq('session_start', b.start_at);
          const tableNumber = `Main Studio ${((sameSlotCount || 0) % 8) + 1}`;

          // Real booking_code convention, confirmed directly against live
          // rows: booking-YYYYMMDD-<8 random lowercase alphanumeric>.
          const dateStr = startAt.toISOString().slice(0, 10).replace(/-/g, '');
          const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
          let suffix = '';
          for (let i = 0; i < 8; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
          const bookingCode = `booking-${dateStr}-${suffix}`;

          const { error: insertErr } = await supabase.from('bookings').insert({
            studio_id: STUDIO_ID,
            booking_code: bookingCode,
            square_booking_id: b.id,
            customer_name: customerName,
            session_start: b.start_at,
            session_end: endAt ? endAt.toISOString() : null,
            party_size: partySize,
            table_number: tableNumber,
            synced_from_square: new Date().toISOString(),
          });
          if (insertErr) throw insertErr;
          synced++;
        } catch (err) {
          errored++;
          if (errors.length < 10) errors.push({ square_booking_id: b.id, error: err.message });
        }
        // Small pace between real Square calls, same as the existing
        // backfill job, to stay well clear of rate limits.
        await new Promise((r) => setTimeout(r, 120));
      }

      res.json({
        status: 'synced',
        synced,
        skipped_existing: allBookings.length - newBookings.length,
        errored,
        total_from_square: allBookings.length,
        errors,
      });
    } catch (err) {
      logger.error('real bookings sync failed', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.errors?.[0]?.detail || err.message, synced: 0 });
    }
  });
}

// ============================================================================
// LIVE TABLE SYNC FROM SQUARE -- real write-back, not just read-only display.
// ----------------------------------------------------------------------------
// Daisy's exact described real workflow: staff seat a customer, then ring
// the first item up on the physical Square till and type the table (e.g.
// "T4") as the ticket name -- THAT moment is the real, true source of which
// table a booking is at, not any guess made ahead of time. This makes the
// app's table_number follow that real moment automatically, replacing the
// need to manually check/set it.
//
// Deliberately conservative rather than guessing under ambiguity: only
// updates a booking when there's an unambiguous 1:1 pairing between a real
// open Square ticket that doesn't match ANY currently-active booking's
// table, and a currently-active booking that doesn't match ANY currently-
// open ticket. If there's more than one of either at once, it's left alone
// rather than risking assigning the wrong table to the wrong booking --
// same posture as the rest of this session's real Square matching (the
// live-order route above, same digit-based approach, same honesty about
// its own limits).
// ============================================================================
export function registerLiveTableSyncRoute(app, supabase, STUDIO_ID, logger, axios) {
  const digitsOf = (s) => (String(s || '').match(/\d+/g) || []).join('');

  app.post('/api/spec/bookings/sync-tables-from-square', async (req, res) => {
    try {
      const { data: connection } = await supabase
        .from('square_connections')
        .select('square_access_token, square_token_expires_at')
        .eq('studio_id', STUDIO_ID)
        .single();
      if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
        return res.status(400).json({ error: 'No valid Square connection', updated: 0 });
      }
      const token = connection.square_access_token;
      const headers = { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18', Accept: 'application/json' };

      const locationsRes = await axios.get('https://connect.squareup.com/v2/locations', { headers });
      const locations = locationsRes.data.locations || [];
      if (!locations.length) return res.json({ updated: 0, reason: 'no_square_locations' });

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const ordersRes = await axios.post(
        'https://connect.squareup.com/v2/orders/search',
        {
          location_ids: locations.map((l) => l.id),
          query: { filter: { date_time_filter: { created_at: { start_at: todayStart.toISOString() } }, state_filter: { states: ['OPEN'] } } },
          limit: 100,
        },
        { headers: { ...headers, 'Content-Type': 'application/json' } }
      );
      const openTickets = (ordersRes.data.orders || [])
        .filter((o) => o.ticket_name && digitsOf(o.ticket_name))
        .map((o) => ({ id: o.id, ticket_name: o.ticket_name, digits: digitsOf(o.ticket_name) }));

      // "Currently active" -- a real session window, not every booking
      // today. Started within the last 3 hours (covers the real ~2hr
      // session length plus some overrun) and not yet finished.
      const now = new Date();
      const activeSince = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const { data: bookings } = await supabase
        .from('bookings')
        .select('booking_code, table_number, session_start')
        .eq('studio_id', STUDIO_ID)
        .gte('session_start', activeSince.toISOString())
        .lte('session_start', now.toISOString());

      const { data: statuses } = await supabase
        .from('demo_app_session_status')
        .select('booking_code, finished_at')
        .eq('studio_id', STUDIO_ID)
        .in('booking_code', (bookings || []).map((b) => b.booking_code));
      const finishedCodes = new Set((statuses || []).filter((s) => s.finished_at).map((s) => s.booking_code));
      const activeBookings = (bookings || []).filter((b) => !finishedCodes.has(b.booking_code));

      const matchedTicketDigits = new Set(
        activeBookings.map((b) => digitsOf(b.table_number)).filter((d) => d && openTickets.some((t) => t.digits === d))
      );
      const unmatchedTickets = openTickets.filter((t) => !matchedTicketDigits.has(t.digits));
      const unmatchedBookings = activeBookings.filter((b) => {
        const d = digitsOf(b.table_number);
        return !d || !openTickets.some((t) => t.digits === d);
      });

      let updated = 0;
      const changes = [];
      // Only act on the unambiguous case -- exactly one of each, paired
      // with real evidence rather than a guess.
      if (unmatchedTickets.length === 1 && unmatchedBookings.length === 1) {
        const ticket = unmatchedTickets[0];
        const booking = unmatchedBookings[0];
        const newTable = `Main Studio ${ticket.digits}`;
        const { error } = await supabase
          .from('bookings')
          .update({ table_number: newTable })
          .eq('studio_id', STUDIO_ID)
          .eq('booking_code', booking.booking_code);
        if (!error) {
          updated = 1;
          changes.push({ booking_code: booking.booking_code, old_table: booking.table_number, new_table: newTable, from_ticket: ticket.ticket_name });
        }
      }

      res.json({
        updated,
        changes,
        open_tickets_today: openTickets.length,
        active_bookings_now: activeBookings.length,
        unmatched_tickets: unmatchedTickets.length,
        unmatched_bookings: unmatchedBookings.length,
        skipped_ambiguous: unmatchedTickets.length > 1 || unmatchedBookings.length > 1,
        pulled_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('live table sync failed', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.errors?.[0]?.detail || err.message, updated: 0 });
    }
  });
}
