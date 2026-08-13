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
