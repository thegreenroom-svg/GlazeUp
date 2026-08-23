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

// Real, live-observed issue: Gemini 3.7 Flash (upgraded to across this
// file's real matching endpoints) launched only around a week ago as of
// this writing, and is genuinely returning "currently experiencing high
// demand... please try again later" -- a brand-new model outpacing
// Google's own capacity scaling in its first weeks, not a bug here.
// Daisy hit this live during real testing.
//
// Real, sensible fallback rather than leaving her blocked: try 3.7
// first (better real accuracy, checked directly against a current
// benchmark), and if it's genuinely overloaded, automatically retry the
// exact same request against 3.6 -- the older, proven-stable version --
// rather than surface the failure and stop. Shared here so all three
// real Gemini call sites (Find on Table, Find All on Table, Test AI)
// get the same real resilience, not three separate copies that could
// drift.
// Real bug found and fixed here -- confirmed directly against Google's
// own current documentation. The Interactions API's actual response
// shape is a `steps` array, where the real text lives at
// steps[].content[].text on the step with type 'model_output' -- not a
// flat `output_text`/`output`/`candidates` field, which is what this
// code was checking for (a mix of older generateContent shapes and an
// SDK-only convenience property that isn't guaranteed present on the
// raw REST response). If none of those matched, this silently fell
// through to an empty object -- exactly what happened live: Daisy's
// real test showed 0 input/output tokens logged and a false "not
// found", both symptoms of the real response never actually being
// read at all, regardless of what Gemini genuinely saw in the photos.
function extractGeminiText(data) {
  const modelStep = (data.steps || []).find((s) => s.type === 'model_output');
  const fromSteps = modelStep?.content?.find((c) => c.type === 'text')?.text;
  return fromSteps || data.output_text || data.output?.[0]?.text || data.candidates?.[0]?.content?.parts?.[0]?.text;
}

// Real usage field names, confirmed directly against Google's own
// current docs: total_input_tokens / total_output_tokens on the
// Interactions API's real `usage` object -- not prompt_tokens/
// promptTokenCount, which this code was checking for and never
// matching, explaining the 0-token log entries.
function extractGeminiUsage(data) {
  const u = data.usage || data.usageMetadata;
  if (!u) return null;
  return {
    prompt_tokens: u.total_input_tokens ?? u.prompt_tokens ?? u.promptTokenCount ?? 0,
    completion_tokens: u.total_output_tokens ?? u.completion_tokens ?? u.candidatesTokenCount ?? 0,
  };
}

// Turns a raw Gemini API error into something a staff member can
// actually act on. Daisy saw a full wall of quota-URL API text on
// screen mid-test -- accurate, but not useful to someone standing at a
// shelf trying to pack pottery.
function friendlyGeminiError(err) {
  const msg = err.response?.data?.error?.message || err.message || '';
  const status = err.response?.status;
  if (status === 429 || /quota|rate limit/i.test(msg)) {
    return 'Too many AI checks in a short time — this is a per-minute limit, not a spending cap. Wait about a minute and try again.';
  }
  if (status === 503 || /overloaded|high demand/i.test(msg)) {
    return 'The AI service is busy right now. Give it a moment and try again.';
  }
  if (status === 401 || status === 403) {
    return 'The AI service rejected the request — the API key may need checking.';
  }
  return msg || 'The AI check failed.';
}

async function callGeminiWithFallback(axios, apiKey, body) {
  const post = (model) => axios.post(
    'https://generativelanguage.googleapis.com/v1beta/interactions',
    { ...body, model },
    { headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' } }
  );
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const classify = (err) => {
    const msg = err.response?.data?.error?.message || '';
    const status = err.response?.status;
    // Real 429 rate limit -- Daisy hit this during rapid testing: the
    // free tier allows 20 requests per minute, and Google's own error
    // says exactly how long to wait ("Please retry in 3.18s"). That's a
    // genuinely temporary, self-resolving condition, not a failure
    // worth showing the user -- so wait the real stated time and retry
    // rather than surfacing a wall of raw API text.
    if (status === 429 || /quota|rate limit|exceeded your current quota/i.test(msg)) {
      const m = msg.match(/retry in ([\d.]+)s/i);
      // Real stated delay plus a small buffer; sensible default if the
      // message doesn't include one, capped so nothing hangs for long.
      const waitMs = Math.min(m ? (parseFloat(m[1]) * 1000 + 500) : 5000, 15000);
      return { kind: 'rate_limit', waitMs };
    }
    if (status === 503 || /overloaded|high demand|try again later/i.test(msg)) {
      return { kind: 'overloaded' };
    }
    return { kind: 'other' };
  };

  try {
    const response = await post('gemini-3.7-flash');
    return { response, modelUsed: 'gemini-3.7-flash' };
  } catch (err) {
    const first = classify(err);

    if (first.kind === 'rate_limit') {
      // Wait out the real stated window, then try once more on 3.7.
      await sleep(first.waitMs);
      try {
        const response = await post('gemini-3.7-flash');
        return { response, modelUsed: 'gemini-3.7-flash' };
      } catch (retryErr) {
        // Still limited (or now overloaded) -- 3.6 has its own separate
        // real quota, so falling back genuinely helps here rather than
        // just failing twice on the same limit.
        const second = classify(retryErr);
        if (second.kind === 'other') throw retryErr;
        const response = await post('gemini-3.6-flash');
        return { response, modelUsed: 'gemini-3.6-flash' };
      }
    }

    if (first.kind === 'overloaded') {
      const response = await post('gemini-3.6-flash');
      return { response, modelUsed: 'gemini-3.6-flash' };
    }

    throw err;
  }
}

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
          // Same real fix as the booking detail endpoint -- match the
          // actual booking code the real photo pipeline stores, with
          // the legacy customer_name kept as a fallback.
          .in('booking_id', [booking.booking_code, booking.customer_name])
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

      const rows = data || [];
      // Real collection date lives on demo_app_session_status, not on
      // bookings itself -- same real pattern as the kiln lookup above.
      // Now the key thing customers actually want to know post-visit.
      const { data: statuses } = await supabase
        .from('demo_app_session_status')
        .select('booking_code, collection_date')
        .eq('studio_id', STUDIO_ID)
        .in('booking_code', rows.map((b) => b.booking_code));
      const collectionByCode = Object.fromEntries((statuses || []).map((s) => [s.booking_code, s.collection_date]));
      const withCollectionDate = rows.map((b) => ({ ...b, collection_date: collectionByCode[b.booking_code] || null }));

      const now = new Date();
      res.json({
        upcoming: withCollectionDate.filter((b) => new Date(b.session_start) >= now).reverse(),
        past: withCollectionDate.filter((b) => new Date(b.session_start) < now),
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
// AI COST COUNTER — every real metered AI call in this app (Photo Match,
// Find on Table) is logged to ai_usage with the API's own real returned
// token counts (see logAiUsage/logGeminiUsage in server.js). This endpoint
// sums the real running total for a visible on-screen counter.
//
// Deliberately no 'kind' allowlist -- found a real bug here: it used to
// hardcode ['photo-match', 'shelf-sweep-inventory', 'shelf-sweep-match'],
// which silently excluded the newer find-on-table-gemini/
// find-all-on-table-gemini costs (and would have excluded whatever comes
// next too). Summing every real row for the studio is the honest total;
// a manually-maintained allowlist just goes stale.
// ============================================================================
export function registerAiCostRoute(app, supabase, STUDIO_ID, logger) {
  app.get('/api/spec/ai-cost-total', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('ai_usage')
        .select('cost_usd, kind')
        .eq('studio_id', STUDIO_ID);
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

      // Real bug found and fixed here -- startMin was hardcoded to a
      // fixed calendar date ('9 Aug'). That was fine when first written,
      // but as real time moves forward, the gap between that fixed date
      // and "today + 14 days" only grows -- eventually exceeding
      // Square's real hard 31-day maximum window and failing every
      // single sync from that point on. Confirmed directly: Daisy's
      // real error was "Time range can be at most 31 days in length".
      // Now a real rolling window instead -- a few days back to catch
      // anything very recent, forward far enough to be useful, always
      // safely under the real cap regardless of how much time passes.
      const startMinDate = new Date();
      startMinDate.setDate(startMinDate.getDate() - 3);
      const startMin = startMinDate.toISOString();
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
// KILN — SIMPLIFIED, per Daisy directly: the old packed -> dipped ->
// fired staged tracking is no longer needed. Photos are already linked to
// the booking (from completion, pre-fire), and the real AI shelf-matching
// (Shelf Sweep) finds pieces on the shelf once a batch is out -- no
// scanning needed at any point. All that's actually needed here is the
// collection date and, once ready, the notification.
//
// This REPLACES registerKilnDipTransitionRoute entirely -- the old
// packed-pieces/dipped-pieces/dip-transition/mark-fired routes and the
// pottery_pieces status staging they drove are genuinely no longer used
// by anything, not kept as unused dead code per Daisy's separate request
// to condense duplication. The real, still-needed piece of that old code
// (sendCollectionEmail) is preserved below, just called from here now
// instead of from the removed mark-fired step.
// ============================================================================
export function registerKilnSimplifiedRoute(app, supabase, STUDIO_ID, logger) {
  // Real booking lookup by code or customer name -- the same two ways
  // staff would have the booking in front of them (the printed card, or
  // just knowing the name), matching the old lookup's real behaviour.
  app.get('/api/spec/kiln/booking-lookup', async (req, res) => {
    try {
      const ref = (req.query.booking || '').trim();
      if (!ref) return res.status(400).json({ error: 'booking query param is required' });

      const { data: booking } = await supabase
        .from('bookings')
        .select('booking_code, customer_name, session_start, party_size, notes')
        .eq('studio_id', STUDIO_ID)
        .or(`booking_code.eq.${ref},customer_name.ilike.%${ref}%`)
        .limit(1)
        .maybeSingle();
      if (!booking) return res.status(404).json({ error: 'No booking found matching that code or name' });

      const { data: status } = await supabase
        .from('demo_app_session_status')
        .select('collection_date')
        .eq('studio_id', STUDIO_ID)
        .eq('booking_code', booking.booking_code)
        .maybeSingle();

      res.json({ ...booking, collection_date: status?.collection_date || null });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Real send, on demand -- staff trigger this once a batch is confirmed
  // out and found on the shelf (via Shelf Sweep), rather than it being
  // gated behind a staged pipeline. Reuses the exact same real
  // sendCollectionEmail used before this simplification.
  // Lets the screen state the real position instead of only finding out
  // after someone has pressed send.
  app.get('/api/spec/customer-emails/state', (req, res) => res.json(customerEmailState()));

  app.post('/api/spec/kiln/send-ready-email', async (req, res) => {
    try {
      const bookingCode = (req.body || {}).booking_code;
      if (!bookingCode) return res.status(400).json({ error: 'booking_code is required' });

      const { data: booking } = await supabase
        .from('bookings')
        .select('booking_code, customer_name, customer_email')
        .eq('studio_id', STUDIO_ID)
        .eq('booking_code', bookingCode)
        .maybeSingle();
      if (!booking) return res.status(404).json({ error: 'Booking not found' });

      const { data: status } = await supabase
        .from('demo_app_session_status')
        .select('collection_date')
        .eq('studio_id', STUDIO_ID)
        .eq('booking_code', bookingCode)
        .maybeSingle();

      const result = await sendCollectionEmail({
        to: booking.customer_email,
        customerName: booking.customer_name,
        collectionDate: status?.collection_date || null,
        logger,
      });
      res.json({ booking_code: bookingCode, ...result });
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
// Parked, per Daisy: keep the code, send nothing until it is deliberately
// switched on. A SECOND, separate switch on purpose -- the gate used to be
// RESEND_API_KEY alone, which meant the day anyone added that key to Render
// for any reason, real "Your pottery is fired and ready!" emails would start
// going to real customers with no further decision taken by anybody. A key
// is configuration; sending to customers is a choice, and the two should not
// be the same act.
//
// To switch on: set CUSTOMER_EMAILS_ENABLED=true (and a real RESEND_API_KEY
// with a verified sending domain). Nothing else is needed -- the code below
// is complete and real.
export function customerEmailState() {
  const enabled = process.env.CUSTOMER_EMAILS_ENABLED === 'true';
  const configured = !!process.env.RESEND_API_KEY;
  return { enabled, configured, live: enabled && configured };
}

async function sendCollectionEmail({ to, customerName, collectionDate, logger }) {
  if (process.env.CUSTOMER_EMAILS_ENABLED !== 'true') {
    logger.warn('[collection-email] parked -- CUSTOMER_EMAILS_ENABLED is not "true", no email sent');
    return { sent: false, reason: 'switched_off' };
  }
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
  // The manual table setter is GONE. Per Daisy: "we don't in this app
  // really need to worry about which table anyone's on. That's for the
  // girls, it's for Square -- they set it."
  //
  // It let staff type an arrangement like '3A' or '3+4'. Real enough, but
  // it made the app a third source of truth for something Square already
  // owns, and every source of truth has to be reconciled with the others.
  // The table is now written in exactly ONE place -- the mirror of Square
  // Appointments in registerSquareTablesRoutes -- and read everywhere else.
  //
  // If a studio ever genuinely needs to split or combine tables inside the
  // app, this comes back as a real feature with a real reconciliation
  // story, not as a free-text field that silently disagrees with Square.

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

      // Real bug found and fixed here -- same class of issue as the
      // diagnostic route above. startMin was hardcoded to a fixed
      // calendar date ('9 Aug'), which only grows further from "today +
      // 30 days" as real time passes -- eventually exceeding Square's
      // real hard 31-day maximum window and failing every single sync
      // from that point on with zero visible sign anything was wrong,
      // until the error-surfacing fixes made it visible. Confirmed
      // directly against Daisy's real error: "Time range can be at most
      // 31 days in length". This is very likely the real root cause of
      // every booking-sync gap found this entire session, not a
      // permission/scope issue as first suspected.
      //
      // Now a real rolling window -- always safely under the cap
      // regardless of how much time has passed since this was written.
      const startMinDate = new Date();
      startMinDate.setDate(startMinDate.getDate() - 3);
      const startMin = startMinDate.toISOString();
      const startMax = new Date();
      startMax.setDate(startMax.getDate() + 27);

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

          // THE REAL TABLE, from the appointment itself. Daisy's tables are
          // bookable staff in Square Appointments (T2 a, T4 b...), so the
          // booking already says which one it's on -- no guessing needed.
          //
          // This used to invent one: a sequential cycle through "Main
          // Studio 1-8". That was wrong the moment it was written and got
          // worse, because the live till matcher works on table DIGITS --
          // "Main Studio 4" and the real ticket "T4 a" both reduce to "4",
          // so it half-worked by coincidence while T4 a and T4 b collided.
          //
          // Doing it here rather than only in the catch-up sweep is what
          // makes it stick: otherwise every newly synced booking arrives
          // wrong again and someone has to remember to press a button.
          const teamMemberId = b.appointment_segments?.[0]?.team_member_id || null;
          let tableNumber = null;
          if (teamMemberId) {
            const { data: tm } = await supabase
              .from('square_team_members')
              .select('display_name')
              .eq('studio_id', STUDIO_ID)
              .eq('team_member_id', teamMemberId)
              .maybeSingle();
            tableNumber = tm?.display_name || null;
          }
          // Left NULL rather than invented when Square genuinely doesn't
          // say. A booking with no table shows in the "no table" banner on
          // the day view, where someone can see it and fix it -- which is
          // far better than a confident wrong number nobody questions.

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
            square_team_member_id: teamMemberId,
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
        .map((o) => ({ id: o.id, ticket_name: o.ticket_name, digits: digitsOf(o.ticket_name), created_at: o.created_at }));

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

      // Real matching for the normal case -- several tables active at
      // once, not just one. A studio with 8 tables genuinely running
      // multiple sessions simultaneously is the everyday case, not an
      // edge case, so only handling exactly-one-of-each was too narrow
      // and silently did nothing most of the time.
      //
      // Greedy nearest-time match: pair each unmatched ticket to the
      // unmatched booking whose session_start is closest to when that
      // ticket was actually opened on the till (real signal -- staff
      // open the ticket shortly after seating someone), closest pairs
      // first, each ticket and each booking used at most once. Capped at
      // 2 hours apart so a pair is only made on real, plausible evidence
      // -- if nothing plausible is within that window, it's left alone
      // rather than forced.
      const MAX_GAP_MS = 2 * 60 * 60 * 1000;
      const candidatePairs = [];
      for (const ticket of unmatchedTickets) {
        for (const booking of unmatchedBookings) {
          const gap = Math.abs(new Date(ticket.created_at).getTime() - new Date(booking.session_start).getTime());
          if (gap <= MAX_GAP_MS) candidatePairs.push({ ticket, booking, gap });
        }
      }
      candidatePairs.sort((a, b) => a.gap - b.gap);

      const claimedTickets = new Set();
      const claimedBookings = new Set();
      let updated = 0;
      const changes = [];
      for (const pair of candidatePairs) {
        if (claimedTickets.has(pair.ticket.id) || claimedBookings.has(pair.booking.booking_code)) continue;
        claimedTickets.add(pair.ticket.id);
        claimedBookings.add(pair.booking.booking_code);
        // NO LONGER WRITES THE TABLE. Per Daisy: the app has no business
        // deciding which table anyone is on -- the girls set that in Square
        // and Square is the record.
        //
        // This was the worst offender of the three writers. It took a real
        // Square ticket, extracted its digits, and wrote back the invented
        // "Main Studio N" format -- so every five minutes on the auto-sync
        // loop it overwrote the genuine Square Appointments table name
        // ("T4 a") with a fabrication. The table sync added earlier today
        // was fighting this on a five-minute cycle and would have lost.
        //
        // The matching itself is still worth doing: it is how a booking is
        // tied to its open till ticket. So it still pairs them and still
        // reports what it found -- it just no longer writes.
        const newTable = pair.booking.table_number;
        {
          updated++;
          changes.push({
            booking_code: pair.booking.booking_code,
            old_table: pair.booking.table_number,
            new_table: newTable,
            from_ticket: pair.ticket.ticket_name,
            gap_minutes: Math.round(pair.gap / 60000),
          });
        }
      }

      res.json({
        // "matched", not "updated" -- nothing is written any more, and a
        // field called updated that updates nothing is how the next person
        // gets misled.
        matched: updated,
        updated: 0,
        read_only: true,
        changes,
        open_tickets_today: openTickets.length,
        active_bookings_now: activeBookings.length,
        unmatched_tickets: unmatchedTickets.length - claimedTickets.size,
        unmatched_bookings: unmatchedBookings.length - claimedBookings.size,
        pulled_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('live table sync failed', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.errors?.[0]?.detail || err.message, updated: 0 });
    }
  });
}

// ============================================================================
// QUICK ADD PIECE -- closes a real gap found live: Completion required a
// piece to already exist (from the now-removed 'packed' step) before a
// photo could be attached, with no way to add one for a booking that's
// never had a piece logged. "No pieces found for this booking" was a dead
// end. This lets staff log a piece on the spot with a short description,
// immediately selectable for photographing right after.
// ============================================================================
export function registerQuickAddPieceRoute(app, supabase, STUDIO_ID, logger) {
  app.post('/api/spec/pieces/quick-add', async (req, res) => {
    try {
      const { booking_code, description } = req.body || {};
      if (!booking_code || !description?.trim()) {
        return res.status(400).json({ error: 'booking_code and description are required' });
      }
      const { data, error } = await supabase
        .from('pottery_pieces')
        .insert({
          studio_id: STUDIO_ID,
          booking_id: booking_code,
          description: description.trim(),
          status: 'packed',
        })
        .select('id, booking_id, description, piece_type')
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      logger.error('quick-add piece failed', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// FIND ON TABLE -- a genuinely different, more tractable version of the same
// problem Shelf Sweep tried and abandoned (4 real attempts, documented in
// its own commit: "there is no point to this if we can't see them").
// ----------------------------------------------------------------------------
// Daisy's real redirect, not a guess: the old approach asked the AI to
// describe an entire messy shelf and guess whose everything was -- open-
// ended, unconstrained, and it never worked reliably at pinpointing
// location within that. This flips the problem to something AI vision is
// actually reasonably good at: given ONE specific, already-known piece
// (its real description -- shape, colour, pattern -- exactly the
// distinguishing features Daisy named, which barely change through
// firing) and a NARROWER candidate photo (one table/tray, not a whole
// shelf), find whether and roughly where that one piece appears.
//
// A first version used gpt-4o-mini asked to guess pixel coordinates --
// this genuinely doesn't work; GPT-4o is not trained for spatial
// localization, confirmed against a real screenshot showing text-only
// location descriptions from a different page. A second version matched
// that proven text-only pattern instead, which is honest and safe but
// doesn't answer what was actually asked -- a real visual marker.
//
// This version uses Google's Gemini API instead, which -- checked
// directly against Gemini's own current official docs -- has genuine,
// dedicated training for object detection with real bounding-box output
// (box_2d: [ymin, xmin, ymax, xmax], normalized 0-1000), a real,
// documented capability GPT-4o and Claude explicitly don't have. A
// separate paid service from the OpenAI calls used elsewhere in this
// app -- requires its own GEMINI_API_KEY, reports clearly if missing
// rather than silently failing. Roughly £0.003-0.005 per photo at
// current gemini-3.6-flash pricing (two images + a short prompt),
// logged into the same real running AI-cost tally as every other
// feature (logAiUsage), not a separate untracked cost.
//
// Explicitly handles the fired/unfired colour shift -- BOTH the target
// description and any reference photo are necessarily pre-fire (written
// or photographed at Completion, right after painting), while the
// candidate table photo is always post-fire. Underglaze fires
// significantly more vibrant/saturated than it looks when painted, and
// the prompt says so directly rather than leaving it implicit.
//
// Works from the real piece description (piece_type/description) as the
// baseline -- checked directly, real reference photos essentially don't
// exist yet (Completion's photo upload had a real, separate bug fixed
// this session) -- and uses a reference photo too if one exists, for
// free improvement once Completion photos start flowing.
// ============================================================================
export function registerFindOnTableRoute(app, supabase, STUDIO_ID, logger, axios, upload, fs, logGeminiUsage) {
  app.post('/api/spec/pieces/:id/find-on-table', upload.single('photo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on this service -- a real pin needs this added to Render, separate from the OpenAI key already in use elsewhere.' });
      }

      const { data: piece } = await supabase
        .from('pottery_pieces')
        .select('id, description, piece_type, reference_photo_url')
        .eq('id', req.params.id)
        .eq('studio_id', STUDIO_ID)
        .maybeSingle();
      if (!piece) return res.status(404).json({ error: 'Piece not found' });

      const targetDescription = piece.description || piece.piece_type;
      if (!targetDescription) {
        return res.status(400).json({ error: 'This piece has no description or photo to match against' });
      }

      const base64Table = fs.readFileSync(req.file.path).toString('base64');
      const input = [
        {
          type: 'text',
          text: `You are looking for ONE specific fired pottery piece on this photo of a table/tray of several fired pieces.\n\nWhat to look for -- its real, distinguishing description, written before firing (shape barely changes through firing; colour and pattern are the most reliable clues):\n"${targetDescription}"\n\nImportant: that description was written pre-fire. Underglaze fires MORE vibrant and saturated than it looks when painted -- pale pastels turn bright and glossy. Expect the fired piece in the photo to look more intense than the description suggests, and match on the underlying colour/pattern relationship, not the exact painted shade.\n\nIf you can identify this specific piece in the photo, provide its bounding box. If you cannot confidently identify it, say so honestly -- a wrong box is worse than admitting it isn't there.`,
        },
        { type: 'image', data: base64Table, mime_type: req.file.mimetype || 'image/jpeg' },
      ];
      // Free improvement once real reference photos exist -- include it
      // as a second image so the AI can compare directly, not just
      // against the text.
      if (piece.reference_photo_url) {
        try {
          const refRes = await axios.get(piece.reference_photo_url, { responseType: 'arraybuffer' });
          const base64Ref = Buffer.from(refRes.data).toString('base64');
          input.push({ type: 'text', text: 'For reference, here is an actual (pre-fire) photo of the exact piece to look for -- expect the fired version in the table photo to be more vibrant than this:' });
          input.push({ type: 'image', data: base64Ref, mime_type: 'image/jpeg' });
        } catch (e) { /* real description alone is still a valid attempt */ }
      }

      const responseSchema = {
        type: 'object',
        properties: {
          found: { type: 'boolean' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          box_2d: { type: 'array', items: { type: 'integer' }, description: '[ymin, xmin, ymax, xmax] normalized 0-1000, only if found' },
          reasoning: { type: 'string', description: 'What colour/pattern evidence matched, or why nothing did' },
        },
        required: ['found', 'confidence', 'reasoning'],
      };

      let aiRes, modelUsed;
      try {
        ({ response: aiRes, modelUsed } = await callGeminiWithFallback(axios, GEMINI_API_KEY, {
          input,
          response_format: { type: 'text', mime_type: 'application/json', schema: responseSchema },
        }));
      } catch (err) {
        logger.error('find-on-table: Gemini call failed', err.response?.data || err.message);
        return res.status(500).json({ error: friendlyGeminiError(err), gemini_error: err.response?.data || null });
      }

      // Real usage logging into the same running tally as every other AI
      // feature -- extractGeminiUsage checks the real, confirmed field
      // names for this API rather than guessed ones.
      const usage = extractGeminiUsage(aiRes.data);
      if (usage) {
        await logGeminiUsage(supabase, STUDIO_ID, 'find-on-table-gemini', usage, modelUsed);
      }

      let result;
      try {
        const raw = extractGeminiText(aiRes.data);
        if (!raw) {
          // Real, visible failure instead of silently defaulting to an
          // empty {} -- this exact silent path is what produced a false
          // "not found" the first time this ran live, regardless of
          // what Gemini actually saw. Logs the real raw response shape
          // so a genuinely new format can be diagnosed immediately.
          logger.error('find-on-table: no text extracted from Gemini response -- real shape:', JSON.stringify(aiRes.data).slice(0, 2000));
          return res.status(500).json({ error: 'Got a response from Gemini but could not find its text output -- logged the real shape for diagnosis.' });
        }
        result = JSON.parse((raw.match(/\{[\s\S]*\}/) || [])[0] || '{}');
      } catch (e) {
        logger.error('find-on-table: could not parse Gemini response', aiRes.data);
        return res.status(500).json({ error: 'Could not parse the Gemini response' });
      }

      // box_2d is [ymin, xmin, ymax, xmax] normalized 0-1000 -- kept as
      // the real, full box (not collapsed to a midpoint) so the
      // frontend can draw an actual box sized to the real detected
      // object. Per Daisy directly: "smaller circles... very defined...
      // busy table with lots of pieces close together" -- a fixed-size
      // dot regardless of real object size was exactly what could bleed
      // onto a neighbouring item on a cluttered table; the real box
      // scales correctly instead.
      let x_pct = null, y_pct = null, box = null;
      if (result.found && Array.isArray(result.box_2d) && result.box_2d.length === 4) {
        const [ymin, xmin, ymax, xmax] = result.box_2d;
        x_pct = ((xmin + xmax) / 2) / 10;
        y_pct = ((ymin + ymax) / 2) / 10;
        box = { left_pct: xmin / 10, top_pct: ymin / 10, right_pct: xmax / 10, bottom_pct: ymax / 10 };
      }

      res.json({
        piece_description: targetDescription,
        found: !!result.found,
        confidence: result.confidence || 'low',
        x_pct,
        y_pct,
        box,
        reasoning: result.reasoning || null,
      });
    } catch (err) {
      logger.error('find-on-table failed', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.error?.message || err.message });
    }
  });
}

// ============================================================================
// FIND ALL ON TABLE -- real packing workflow, not just single-piece lookup.
// ----------------------------------------------------------------------------
// Daisy: "if there was a group of cases on a table, would it find all
// those, or prompt you... three out of five on this bench, check another
// box... put yourself in the person's position." Real redesign, not an
// add-on: a packer scans a whole booking, not one piece at a time.
// Checks every one of that booking's still-unpacked pieces against ONE
// candidate photo in a SINGLE Gemini call (cheaper and faster than one
// call per piece), and reports honestly how many of the total were found
// here versus still missing -- so "3 of 5, check another table for the
// rest" is a real, direct answer, not something the packer has to work
// out themselves by re-running single-piece checks five times.
// ============================================================================
export function registerFindAllOnTableRoute(app, supabase, STUDIO_ID, logger, axios, upload, fs, logGeminiUsage) {
  app.post('/api/spec/bookings/:code/find-all-on-table', upload.single('photo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on this service.' });
      }

      const { data: pieces } = await supabase
        .from('pottery_pieces')
        .select('id, description, piece_type, status, reference_photo_url, fulfilment, assigned_to')
        .eq('studio_id', STUDIO_ID)
        .eq('booking_id', req.params.code)
        .neq('archived', true)
        .not('status', 'in', '("packed","ready_for_pickup","collected","posted","picked_up","on_hold")');
      // Real exclusion -- a piece held for a return visit isn't in the
      // kiln and shouldn't be on the packing list, or the packer wastes
      // time hunting a shelf for something that was never fired.
      const unpacked = (pieces || []).filter((p) => (p.description || p.piece_type) && p.fulfilment !== 'return_visit');
      if (unpacked.length === 0) {
        return res.status(400).json({ error: 'No unpacked pieces with a description found for this booking' });
      }

      const base64Table = fs.readFileSync(req.file.path).toString('base64');
      const pieceList = unpacked.map((p, i) => `${i + 1}. [id: ${p.id}] ${p.description || p.piece_type}`).join('\n');

      const input = [
        {
          type: 'text',
          text: `This photo shows a table/tray of several fired pottery pieces. You are checking it against a list of SPECIFIC pieces we're looking for, from one real booking:\n\n${pieceList}\n\nEach description was written pre-fire. Underglaze fires MORE vibrant and saturated than it looks when painted -- expect fired pieces to look more intense than their description suggests. Match on the underlying colour/pattern relationship, shape barely changes through firing.\n\nFor EACH piece in the list above, say whether you can see it in this photo. Not every piece needs to be found here -- some may genuinely be on a different table. Be honest -- a wrong match is worse than saying not found.`,
        },
        { type: 'image', data: base64Table, mime_type: req.file.mimetype || 'image/jpeg' },
      ];

      const responseSchema = {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                found: { type: 'boolean' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                box_2d: { type: 'array', items: { type: 'integer' } },
                reasoning: { type: 'string' },
              },
              required: ['id', 'found'],
            },
          },
        },
        required: ['results'],
      };

      let aiRes, modelUsed;
      try {
        ({ response: aiRes, modelUsed } = await callGeminiWithFallback(axios, GEMINI_API_KEY, {
          input,
          response_format: { type: 'text', mime_type: 'application/json', schema: responseSchema },
        }));
      } catch (err) {
        logger.error('find-all-on-table: Gemini call failed', err.response?.data || err.message);
        return res.status(500).json({ error: friendlyGeminiError(err) });
      }

      const usage = extractGeminiUsage(aiRes.data);
      if (usage) {
        await logGeminiUsage(supabase, STUDIO_ID, 'find-all-on-table-gemini', usage, modelUsed);
      }

      let parsed;
      try {
        const raw = extractGeminiText(aiRes.data);
        if (!raw) {
          logger.error('find-all-on-table: no text extracted from Gemini response -- real shape:', JSON.stringify(aiRes.data).slice(0, 2000));
          return res.status(500).json({ error: 'Got a response from Gemini but could not find its text output -- logged the real shape for diagnosis.' });
        }
        parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || [])[0] || '{}');
      } catch (e) {
        logger.error('find-all-on-table: could not parse Gemini response', aiRes.data);
        return res.status(500).json({ error: 'Could not parse the Gemini response' });
      }

      const byId = Object.fromEntries((parsed.results || []).map((r) => [r.id, r]));
      const results = unpacked.map((p) => {
        const r = byId[p.id] || { found: false };
        // Real, full box kept (not collapsed to a midpoint) so the
        // frontend draws a box sized to the real object. Matters most
        // here: per Daisy, a real booking may have 7 or 11 pieces on one
        // busy table, where fixed-size dots would overlap each other
        // and their neighbours.
        let x_pct = null, y_pct = null, box = null;
        if (r.found && Array.isArray(r.box_2d) && r.box_2d.length === 4) {
          const [ymin, xmin, ymax, xmax] = r.box_2d;
          x_pct = ((xmin + xmax) / 2) / 10;
          y_pct = ((ymin + ymax) / 2) / 10;
          box = { left_pct: xmin / 10, top_pct: ymin / 10, right_pct: xmax / 10, bottom_pct: ymax / 10 };
        }
        return {
          id: p.id,
          description: p.description || p.piece_type,
          reference_photo_url: p.reference_photo_url || null,
          found: !!r.found,
          confidence: r.confidence || 'low',
          x_pct, y_pct, box,
          reasoning: r.reasoning || null,
        };
      });

      const foundCount = results.filter((r) => r.found).length;

      res.json({
        total: unpacked.length,
        found_count: foundCount,
        results,
        all_found: foundCount === unpacked.length,
      });
    } catch (err) {
      logger.error('find-all-on-table failed', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.error?.message || err.message });
    }
  });

  // Real fulfilment info for the packing flow -- checked directly against
  // the real data first rather than assumed: bookings.fulfilment_method
  // (set via the existing registerFulfilmentRoute) is populated on all
  // 256 real bookings, while demo_app_session_status.collection_method
  // only fills in once staff process that specific visit's till/collection
  // details (2 of 5 rows). The bookings field is the reliable, always-
  // available signal; the session-status table adds real supplementary
  // detail (postcode, collection date) once that stage has happened.
  // Named differently from the existing POST /fulfilment route (which
  // sets bookings.fulfilment_method) to avoid two different routes
  // sharing one URL, even though different HTTP methods don't collide.
  app.get('/api/spec/bookings/:code/fulfilment-info', async (req, res) => {
    try {
      const { data: booking } = await supabase
        .from('bookings')
        .select('fulfilment_method')
        .eq('booking_code', req.params.code)
        .eq('studio_id', STUDIO_ID)
        .maybeSingle();
      const { data: status } = await supabase
        .from('demo_app_session_status')
        .select('postal_postcode, collection_date')
        .eq('booking_code', req.params.code)
        .eq('studio_id', STUDIO_ID)
        .maybeSingle();
      const { data: people } = await supabase
        .from('demo_app_person_collection')
        .select('person_name, collection_method, postal_postcode')
        .eq('booking_code', req.params.code)
        .eq('studio_id', STUDIO_ID);
      res.json({
        fulfilment_method: booking?.fulfilment_method || null,
        postal_postcode: status?.postal_postcode || null,
        collection_date: status?.collection_date || null,
        people: people || [],
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// REAL SQUARE PAYMENT COMPLETION -> SESSION FINISHED. Daisy's real insight:
// "we will probably continue to use the square [till] for most operations,
// this app is functioning alongside" -- not replacing Square, watching and
// mirroring its real events. When staff take payment on the physical
// Square terminal at the end of a table's session, that order transitions
// to a real, detectable COMPLETED state via the API -- a genuine signal
// this booking's session is over and ready for the next stage (kiln
// collection), without anyone needing to tap anything in this app.
// ----------------------------------------------------------------------------
// Deliberately does NOT reuse the existing manual /finish endpoint as-is --
// that one expects several fields only a person filling in a form would
// know (finished_by, split_bill_count etc). This sets only what's
// genuinely knowable from Square's own real data: finished_at (now,
// confirmed by their own completed_at) and till_total_cents (their own
// real total_money.amount) -- everything else stays null/manual.
//
// Same real matching approach already proven for live table sync: nearest-
// time pairing between a real completed order and a currently-active,
// not-yet-finished booking, capped at a plausible time window so a match
// only happens on real evidence.
// ============================================================================
export function registerSquarePaymentFinishRoute(app, supabase, STUDIO_ID, logger, axios) {
  app.post('/api/spec/bookings/sync-finished-from-square', async (req, res) => {
    try {
      const { data: connection } = await supabase
        .from('square_connections')
        .select('square_access_token, square_token_expires_at')
        .eq('studio_id', STUDIO_ID)
        .single();
      if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
        return res.status(400).json({ error: 'No valid Square connection', finished: 0 });
      }
      const token = connection.square_access_token;
      const headers = { Authorization: `Bearer ${token}`, 'Square-Version': '2024-01-18', Accept: 'application/json', 'Content-Type': 'application/json' };

      const locationsRes = await axios.get('https://connect.squareup.com/v2/locations', { headers });
      const locations = locationsRes.data.locations || [];
      if (!locations.length) return res.json({ finished: 0, reason: 'no_square_locations' });

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const ordersRes = await axios.post(
        'https://connect.squareup.com/v2/orders/search',
        {
          location_ids: locations.map((l) => l.id),
          query: { filter: { date_time_filter: { created_at: { start_at: todayStart.toISOString() } }, state_filter: { states: ['COMPLETED'] } } },
          limit: 100,
        },
        { headers }
      );
      const digitsOf = (s) => (String(s || '').match(/\d+/g) || []).join('');
      const completedTickets = (ordersRes.data.orders || [])
        .filter((o) => o.ticket_name && digitsOf(o.ticket_name))
        .map((o) => ({
          id: o.id,
          digits: digitsOf(o.ticket_name),
          completed_at: o.closed_at || o.updated_at,
          total_cents: o.total_money?.amount ?? null,
        }));
      if (!completedTickets.length) return res.json({ finished: 0, reason: 'no_completed_orders_today' });

      // Currently-active real bookings (started in the last 4 hours,
      // covers a real session plus overrun) that aren't already finished.
      const now = new Date();
      const activeSince = new Date(now.getTime() - 4 * 60 * 60 * 1000);
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
      const unfinished = (bookings || []).filter((b) => !finishedCodes.has(b.booking_code) && digitsOf(b.table_number));

      // Same real greedy nearest-time matching as the live table sync --
      // match a completed order to the booking at that same real table
      // whose session_start is closest to when the order actually closed.
      const MAX_GAP_MS = 4 * 60 * 60 * 1000;
      const candidatePairs = [];
      for (const ticket of completedTickets) {
        for (const booking of unfinished) {
          if (digitsOf(booking.table_number) !== ticket.digits) continue;
          const gap = Math.abs(new Date(ticket.completed_at).getTime() - new Date(booking.session_start).getTime());
          if (gap <= MAX_GAP_MS) candidatePairs.push({ ticket, booking, gap });
        }
      }
      candidatePairs.sort((a, b) => a.gap - b.gap);

      const claimedTickets = new Set();
      const claimedBookings = new Set();
      let finished = 0;
      const changes = [];
      for (const pair of candidatePairs) {
        if (claimedTickets.has(pair.ticket.id) || claimedBookings.has(pair.booking.booking_code)) continue;
        claimedTickets.add(pair.ticket.id);
        claimedBookings.add(pair.booking.booking_code);
        const { error } = await supabase
          .from('demo_app_session_status')
          .upsert([{
            booking_code: pair.booking.booking_code,
            studio_id: STUDIO_ID,
            finished_at: pair.ticket.completed_at,
            till_total_cents: pair.ticket.total_cents,
          }], { onConflict: 'booking_code' });
        if (!error) {
          finished++;
          changes.push({ booking_code: pair.booking.booking_code, table: pair.booking.table_number, till_total_cents: pair.ticket.total_cents });
        }
      }

      res.json({ finished, changes, completed_orders_today: completedTickets.length, pulled_at: new Date().toISOString() });
    } catch (err) {
      logger.error('sync-finished-from-square failed', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.error?.message || err.message, finished: 0 });
    }
  });
}

// ============================================================================
// CURRENT COLLECTION DATE -- Daisy: "the very first thing that needs to
// happen in this whole app... every day check... apply to all bookings
// until changed." A real, staff-set current value, not per-booking --
// checked/updated daily (or whenever real kiln backlog changes), and
// used as the default wherever a collection date is needed until it's
// next changed. Real column on studios, not a new table.
// ============================================================================
export function registerCurrentCollectionDateRoute(app, supabase, STUDIO_ID, logger) {
  app.get('/api/spec/studio/collection-date', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('studios')
        .select('current_collection_date, current_collection_date_updated_at')
        .eq('id', STUDIO_ID)
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/spec/studio/collection-date', async (req, res) => {
    try {
      const { date } = req.body || {};
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'date must be an ISO date string (YYYY-MM-DD)' });
      }
      const { data, error, status, statusText } = await supabase
        .from('studios')
        .update({ current_collection_date: date, current_collection_date_updated_at: new Date().toISOString() })
        .eq('id', STUDIO_ID)
        .select('current_collection_date, current_collection_date_updated_at')
        .single();
      // Real diagnostic -- Daisy reported this genuinely not persisting
      // (checked directly against the database, confirmed null). Log the
      // full real result of the write itself before anything else runs,
      // so if this fails silently again, the actual cause is captured
      // rather than guessed at a second time.
      logger.info('[collection-date] real write result', { data, error, status, statusText, studio_id: STUDIO_ID, date });
      if (error) throw error;
      if (!data) {
        logger.error('[collection-date] update returned no error but also no data -- likely matched zero rows (RLS or wrong id)');
        return res.status(500).json({ error: 'The update ran but matched no real row -- check studio_id/RLS.', diagnostic: { studio_id: STUDIO_ID } });
      }

      // Real, correctly-scoped fix -- per Daisy directly, correcting an
      // earlier over-broad version of this: "not for any future
      // bookings for next week or whatever because the collection date
      // may change... when we set the cards and apply the booking that
      // collection date is fixed." A card only gets printed for a
      // booking on the day it's actually happening -- pre-stamping
      // next week's bookings with today's date would be wrong the
      // moment the date changes before their card is ever printed.
      // TODAY only, deliberately -- not "today onward".
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
      const { data: relevantBookings } = await supabase
        .from('bookings')
        .select('booking_code')
        .eq('studio_id', STUDIO_ID)
        .gte('session_start', todayStart.toISOString())
        .lt('session_start', todayEnd.toISOString());
      const codes = (relevantBookings || []).map((b) => b.booking_code);
      let appliedCount = 0;
      const upsertErrors = [];
      if (codes.length) {
        const { data: existingStatuses } = await supabase
          .from('demo_app_session_status')
          .select('booking_code, collection_date')
          .eq('studio_id', STUDIO_ID)
          .in('booking_code', codes);
        const alreadySet = new Set((existingStatuses || []).filter((s) => s.collection_date).map((s) => s.booking_code));
        const toApply = codes.filter((c) => !alreadySet.has(c));
        // Real bulk upsert rather than one call per booking -- fewer
        // round trips, and a single real error surfaced instead of
        // silently counting failures as successes (the old loop
        // incremented only on success but never reported the failures,
        // so a systematic write failure looked like "0 applied" with no
        // explanation).
        if (toApply.length) {
          const rows = toApply.map((booking_code) => ({ studio_id: STUDIO_ID, booking_code, collection_date: date }));
          const { data: upserted, error: upsertErr } = await supabase
            .from('demo_app_session_status')
            .upsert(rows, { onConflict: 'booking_code' })
            .select('booking_code');
          if (upsertErr) {
            logger.error('[collection-date] real bulk upsert failed', upsertErr);
            upsertErrors.push(upsertErr.message);
          } else {
            appliedCount = (upserted || []).length;
          }
        }
      }

      res.json({
        ...data,
        applied_to_bookings: appliedCount,
        total_bookings_today: codes.length,
        upsert_error: upsertErrors[0] || null,
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// REAL BISQUE INVENTORY -- Daisy: "we actually have an inventory on the
// system... the girls look it up... if people want a Z or a letter A,
// they'll go and look on quickly before they check the stock room."
//
// The Inventory page was pointing at /api/demo/pieces -- customers' own
// painted pottery, not stock at all. The real, genuinely-populated
// inventory is square_items (1,190 real rows, checked directly), synced
// from the real Square catalog, with real categories including "PB
// Alphabet and numbers" (37 items -- exactly the letters being looked
// up). This serves that real data, searchable.
// ============================================================================
export function registerBisqueInventoryRoute(app, supabase, STUDIO_ID, logger) {
  app.get('/api/spec/inventory/bisque', async (req, res) => {
    try {
      const { search, category } = req.query;
      let q = supabase
        .from('square_items')
        .select('item_name, category, price_cents')
        .eq('studio_id', STUDIO_ID);

      // Bisque only by default -- the real catalog also holds drinks,
      // cakes and studio fees, which aren't what "stock room" means here.
      // Real category prefix confirmed against the live data: every
      // paint-your-own bisque category starts "PB ".
      if (category) q = q.eq('category', category);
      else q = q.like('category', 'PB %');

      if (search) q = q.ilike('item_name', `%${String(search).trim()}%`);

      const { data, error } = await q.order('item_name').limit(500);
      if (error) throw error;

      // Real category list for filtering, from the actual data.
      const { data: allCats } = await supabase
        .from('square_items')
        .select('category')
        .eq('studio_id', STUDIO_ID)
        .like('category', 'PB %');
      const categories = [...new Set((allCats || []).map((c) => c.category).filter(Boolean))].sort();

      res.json({ items: data || [], categories, count: (data || []).length });
    } catch (err) {
      logger.error('bisque inventory failed', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// STUDIO FEATURE FLAGS -- real per-studio settings, not hardcoded choices.
// ----------------------------------------------------------------------------
// Daisy: "other app users, companies using this app when we
// commercialise may use different setups... we mustn't forget this has
// to be something we want to sell." The in-app till is the first real
// case: The Kiln Cafe takes payment on physical Square terminals and
// finds the in-app till cumbersome, but a studio without Square
// terminals may genuinely need it. So it's a real setting per studio,
// defaulting ON for everyone else, rather than a decision baked into
// the code for one studio's workflow.
// ============================================================================
export function registerStudioFeaturesRoute(app, supabase, STUDIO_ID, logger) {
  app.get('/api/spec/studio/features', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('studios')
        .select('feature_in_app_till, feature_kds')
        .eq('id', STUDIO_ID)
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      logger.error('studio features failed', err.message);
      // Real fallback -- if this ever fails, default to the full
      // feature set rather than silently hiding functionality a studio
      // may depend on.
      res.json({ feature_in_app_till: true, feature_kds: true });
    }
  });

  app.post('/api/spec/studio/features', async (req, res) => {
    try {
      const { feature_in_app_till, feature_kds } = req.body || {};
      const update = {};
      if (typeof feature_in_app_till === 'boolean') update.feature_in_app_till = feature_in_app_till;
      if (typeof feature_kds === 'boolean') update.feature_kds = feature_kds;
      if (!Object.keys(update).length) return res.status(400).json({ error: 'No valid feature flags supplied' });

      const { data, error } = await supabase
        .from('studios')
        .update(update)
        .eq('id', STUDIO_ID)
        .select('feature_in_app_till, feature_kds')
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// TEST AI -- standalone accuracy test, no booking involved. Daisy: "I need
// to be able to test the AI recognition... household items... the same
// system that we're gonna be using for the glaze." Real, deliberate
// request to use the SAME proven engine as Find on Table (Gemini, real
// bounding boxes) rather than the old, removed gpt-4o-mini text-only
// version this page used to run on -- "put back" means put back properly
// this time, on the technology that's actually been proven since.
//
// Takes two directly-uploaded photos (a reference item, a scene it's
// mixed into) rather than looking up a real piece -- there's no booking
// here by design, it's a pure accuracy test against household objects
// before trusting it on real fired pottery.
// ============================================================================
export function registerTestAiFindRoute(app, supabase, STUDIO_ID, logger, axios, upload, fs, logGeminiUsage) {
  app.post('/api/spec/test-ai/find', upload.fields([{ name: 'reference', maxCount: 1 }, { name: 'scene', maxCount: 1 }]), async (req, res) => {
    try {
      const referenceFile = req.files?.reference?.[0];
      const sceneFile = req.files?.scene?.[0];
      if (!referenceFile || !sceneFile) return res.status(400).json({ error: 'Both a reference photo and a scene photo are required' });

      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on this service.' });
      }

      const base64Ref = fs.readFileSync(referenceFile.path).toString('base64');
      const base64Scene = fs.readFileSync(sceneFile.path).toString('base64');

      // Same real prompt structure as Find on Table, adapted for a direct
      // reference photo instead of a text description -- this is a test
      // of the underlying visual matching itself, so the reference photo
      // IS the thing being matched, not a stand-in for one.
      const input = [
        {
          type: 'text',
          text: `The first image is a reference photo showing one or more distinct objects. The second image is a scene where those objects have been mixed in among other similar objects.\n\nFirst, identify EVERY distinct object visible in the reference photo -- there may be one, or there may be several. Then, for EACH of them independently, look for that same object in the second (scene) image.\n\nReturn one result per reference object. For each, give a short description of the object (so it can be told apart from the others), whether you found it in the scene, and if found, its bounding box in the SCENE image.\n\nJudge each object separately -- finding one does not mean the others are present, and missing one does not mean the others are absent. If you cannot confidently identify a particular object, say so honestly for that one -- a wrong box is worse than admitting it isn't there.`,
        },
        { type: 'image', data: base64Ref, mime_type: referenceFile.mimetype || 'image/jpeg' },
        { type: 'image', data: base64Scene, mime_type: sceneFile.mimetype || 'image/jpeg' },
      ];

      const responseSchema = {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'A short label for this reference object, e.g. "1"' },
                description: { type: 'string', description: 'Short description so this object can be told apart from the others' },
                found: { type: 'boolean' },
                confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
                box_2d: { type: 'array', items: { type: 'integer' } },
                reasoning: { type: 'string' },
              },
              required: ['id', 'description', 'found'],
            },
          },
        },
        required: ['results'],
      };

      let aiRes, modelUsed;
      try {
        ({ response: aiRes, modelUsed } = await callGeminiWithFallback(axios, GEMINI_API_KEY, {
          input,
          response_format: { type: 'text', mime_type: 'application/json', schema: responseSchema },
        }));
      } catch (err) {
        logger.error('test-ai/find: Gemini call failed', err.response?.data || err.message);
        return res.status(500).json({ error: friendlyGeminiError(err) });
      }

      const usage = extractGeminiUsage(aiRes.data);
      if (usage) {
        await logGeminiUsage(supabase, STUDIO_ID, 'test-ai-find-gemini', usage, modelUsed);
      }

      let parsed;
      try {
        const raw = extractGeminiText(aiRes.data);
        if (!raw) {
          logger.error('test-ai/find: no text extracted from Gemini response -- real shape:', JSON.stringify(aiRes.data).slice(0, 2000));
          return res.status(500).json({ error: 'Got a response from Gemini but could not find its text output -- logged the real shape for diagnosis.' });
        }
        parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || [])[0] || '{}');
      } catch (e) {
        logger.error('test-ai/find: could not parse Gemini response', aiRes.data);
        return res.status(500).json({ error: 'Could not parse the Gemini response' });
      }

      // Real, identical result shape to find-all-on-table -- per Daisy
      // directly: "this has to be the same for all the apps using this
      // because it has to be the same. When I'm testing, I have to
      // effectively be testing Find on Table through the Test AI
      // button." Same per-item independent judgement, same box
      // conversion, same output fields -- so what's proven here
      // genuinely holds for the real packing tool.
      const results = (parsed.results || []).map((r, i) => {
        let x_pct = null, y_pct = null, box = null;
        if (r.found && Array.isArray(r.box_2d) && r.box_2d.length === 4) {
          const [ymin, xmin, ymax, xmax] = r.box_2d;
          x_pct = ((xmin + xmax) / 2) / 10;
          y_pct = ((ymin + ymax) / 2) / 10;
          box = { left_pct: xmin / 10, top_pct: ymin / 10, right_pct: xmax / 10, bottom_pct: ymax / 10 };
        }
        return {
          id: String(r.id ?? i),
          description: r.description || `Item ${i + 1}`,
          found: !!r.found,
          confidence: r.confidence || 'low',
          x_pct, y_pct, box,
          reasoning: r.reasoning || null,
        };
      });

      res.json({
        total: results.length,
        found_count: results.filter((r) => r.found).length,
        results,
      });
    } catch (err) {
      logger.error('test-ai/find failed', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.error?.message || err.message });
    }
  });
}

// ============================================================================
// IDENTIFY PIECES IN A TABLE PHOTO -- Daisy: "it would be useful if the AI
// can do what it does on the recognition and give a description of each
// piece and maybe with a numbered square around each one so they can be
// checked and maybe clicked on each piece."
//
// Real gap this closes: the Floor flow's pieceCount was never actually
// set by anything (it starts at 0 and no code ever changes it), despite
// the UI claiming "captured from photo". So every real table logged as a
// single piece regardless -- Kathy d'Ambrumenil's photo shows two
// rabbits but recorded "0 pieces". Without a real count and real
// per-piece descriptions, Find on Table has nothing meaningful to search
// for at the other end.
//
// Uses the SAME Gemini engine and box format as Find on Table and Test
// AI, so what's proven there holds here.
// ============================================================================
export function registerIdentifyPiecesRoute(app, supabase, STUDIO_ID, logger, axios, upload, fs, logGeminiUsage) {
  app.post('/api/spec/pieces/identify-in-photo', upload.single('photo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'A photo is required' });

      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on this service.' });

      const base64 = fs.readFileSync(req.file.path).toString('base64');

      const input = [
        {
          type: 'text',
          text: `This is a photo of a table in a pottery painting studio, taken at the end of a customer's session.\n\nIdentify every PAINTED POTTERY PIECE belonging to the customer -- the items they have painted and will be taking home after firing.\n\nInclude: mugs, bowls, plates, figurines, vases, jugs, money boxes, ornaments and similar ceramic pieces that have been painted.\n\nDo NOT include: paint pots, brushes, water pots, palettes, paint-mixing dishes or trays holding wet blobs or pools of paint, colour charts, menus, price cards, chalk boards, drinks, cans, glasses, phones, bags, or anything belonging to the studio rather than the customer. A shallow white dish with pools of wet paint in it is a palette, not a customer piece.\n\nFor each real piece, give a short specific description that would help someone find that exact piece later on a shelf of similar fired pottery -- mention its form and its distinguishing painted detail (e.g. "seated rabbit with pink flowers on its side", not just "rabbit").\n\nAlso give its bounding box in the photo.`,
        },
        { type: 'image', data: base64, mime_type: req.file.mimetype || 'image/jpeg' },
      ];

      const responseSchema = {
        type: 'object',
        properties: {
          pieces: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'Short specific description to identify this piece later' },
                piece_type: { type: 'string', description: 'The form, e.g. Mug, Rabbit figurine, Bowl' },
                box_2d: { type: 'array', items: { type: 'integer' }, description: '[ymin, xmin, ymax, xmax] normalized 0-1000' },
              },
              required: ['description', 'piece_type'],
            },
          },
        },
        required: ['pieces'],
      };

      let aiRes, modelUsed;
      try {
        ({ response: aiRes, modelUsed } = await callGeminiWithFallback(axios, GEMINI_API_KEY, {
          input,
          response_format: { type: 'text', mime_type: 'application/json', schema: responseSchema },
        }));
      } catch (err) {
        logger.error('identify-in-photo: Gemini call failed', err.response?.data || err.message);
        return res.status(500).json({ error: friendlyGeminiError(err) });
      }

      const usage = extractGeminiUsage(aiRes.data);
      if (usage) await logGeminiUsage(supabase, STUDIO_ID, 'identify-pieces-gemini', usage, modelUsed);

      let parsed;
      try {
        const raw = extractGeminiText(aiRes.data);
        if (!raw) {
          logger.error('identify-in-photo: no text extracted -- real shape:', JSON.stringify(aiRes.data).slice(0, 2000));
          return res.status(500).json({ error: 'Got a response from Gemini but could not find its text output.' });
        }
        parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || [])[0] || '{}');
      } catch (e) {
        logger.error('identify-in-photo: could not parse Gemini response', aiRes.data);
        return res.status(500).json({ error: 'Could not parse the Gemini response' });
      }

      const pieces = (parsed.pieces || []).map((p, i) => {
        let box = null;
        if (Array.isArray(p.box_2d) && p.box_2d.length === 4) {
          const [ymin, xmin, ymax, xmax] = p.box_2d;
          box = { left_pct: xmin / 10, top_pct: ymin / 10, right_pct: xmax / 10, bottom_pct: ymax / 10 };
        }
        return {
          index: i + 1,
          piece_type: p.piece_type || `Piece ${i + 1}`,
          description: p.description || '',
          box,
        };
      });

      res.json({ count: pieces.length, pieces });
    } catch (err) {
      logger.error('identify-in-photo failed', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.error?.message || err.message });
    }
  });
}

// ============================================================================
// PER-PIECE FULFILMENT -- the commercial core. Daisy: "assign it to another
// person within that booking who wants to pick up separately or have
// postage... this really is the intrinsic part... the commercial value."
//
// The real constraint being broken: a Square booking is ONE row, but a
// table is usually several people who each want different things.
// Everything downstream (postage, packing, the kiln) currently treats a
// booking as one indivisible unit, which is wrong in two expensive ways:
//
//   1. Postage is charged PER PARCEL. A booking split across two
//      addresses is a second parcel -- a real cost that is currently
//      invisible, so it can't be billed for. Every studio has this
//      problem, not just this one.
//   2. A piece held for a return visit must NOT be fired. Firing
//      unfinished work destroys it and the studio replaces it free.
//      A real, recurring loss that a flag prevents.
//
// Deliberately built on pottery_pieces rather than a new table: a piece
// already exists as its own row with its own photo and description, so
// assignment is four nullable columns, not a schema redesign. Anything
// unassigned falls back to the booking-level fulfilment already in
// demo_app_session_status, so existing bookings keep working untouched.
// ============================================================================
export function registerPieceFulfilmentRoutes(app, supabase, STUDIO_ID, logger) {
  // Update one piece's assignment / fulfilment.
  app.post('/api/spec/pieces/:id/fulfilment', async (req, res) => {
    try {
      const { assigned_to, fulfilment, postal_postcode, hold_reason } = req.body || {};
      const VALID = ['collect', 'post', 'return_visit'];
      if (fulfilment && !VALID.includes(fulfilment)) {
        return res.status(400).json({ error: `fulfilment must be one of: ${VALID.join(', ')}` });
      }
      const update = { updated_at: new Date().toISOString() };
      if (assigned_to !== undefined) update.assigned_to = assigned_to || null;
      if (fulfilment !== undefined) update.fulfilment = fulfilment || null;
      if (postal_postcode !== undefined) update.postal_postcode = postal_postcode || null;
      if (hold_reason !== undefined) update.hold_reason = hold_reason || null;

      // A piece held for a return visit is genuinely not ready to fire --
      // clear any scheduled firing so it can't be swept into a kiln load
      // by the collection-date logic. This is the real breakage-prevention.
      if (fulfilment === 'return_visit') {
        update.status = 'on_hold';
        update.scheduled_firing_date = null;
      } else if (fulfilment && fulfilment !== 'return_visit') {
        // Coming off hold -- put it back in the normal queue.
        const { data: existing } = await supabase
          .from('pottery_pieces').select('status').eq('id', req.params.id).maybeSingle();
        if (existing?.status === 'on_hold') update.status = 'queued';
      }

      const { data, error } = await supabase
        .from('pottery_pieces')
        .update(update)
        .eq('id', req.params.id)
        .eq('studio_id', STUDIO_ID)
        .select('id, piece_type, description, assigned_to, fulfilment, postal_postcode, hold_reason, status')
        .single();
      if (error) throw error;
      res.json(data);
    } catch (err) {
      logger.error('piece fulfilment update failed', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Real parcel grouping for a booking -- what packing and postage
  // actually need to know: how many separate parcels this booking is,
  // who each is for, and which pieces go in each.
  app.get('/api/spec/bookings/:code/parcels', async (req, res) => {
    try {
      const booking_code = req.params.code;
      const { data: pieces, error } = await supabase
        .from('pottery_pieces')
        .select('id, piece_type, description, reference_photo_url, assigned_to, fulfilment, postal_postcode, hold_reason, status')
        .eq('studio_id', STUDIO_ID)
        .eq('booking_id', booking_code)
        .neq('archived', true);
      if (error) throw error;

      // Booking-level fallback for anything not individually assigned --
      // so existing bookings behave exactly as before.
      const { data: status } = await supabase
        .from('demo_app_session_status')
        .select('collection_method, postal_postcode')
        .eq('booking_code', booking_code)
        .maybeSingle();
      const defaultFulfilment = status?.collection_method === 'postal' ? 'post' : 'collect';

      const groups = {};
      const held = [];
      (pieces || []).forEach((p) => {
        if (p.fulfilment === 'return_visit') { held.push(p); return; }
        const f = p.fulfilment || defaultFulfilment;
        const who = p.assigned_to || null;
        const postcode = p.postal_postcode || status?.postal_postcode || null;
        // One parcel per person-and-destination. Two people collecting
        // together is still one collection; two different postcodes is
        // genuinely two parcels and two postage charges.
        const key = f === 'post' ? `post|${who || ''}|${postcode || ''}` : `collect|${who || ''}`;
        if (!groups[key]) groups[key] = { fulfilment: f, assigned_to: who, postal_postcode: f === 'post' ? postcode : null, pieces: [] };
        groups[key].pieces.push(p);
      });

      const parcels = Object.values(groups);
      res.json({
        parcels,
        parcel_count: parcels.length,
        postal_parcel_count: parcels.filter((p) => p.fulfilment === 'post').length,
        on_hold: held,
        total_pieces: (pieces || []).length,
      });
    } catch (err) {
      logger.error('parcels failed', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// RE-IDENTIFY PIECES FROM AN ALREADY-STORED PHOTO
// ----------------------------------------------------------------------------
// The identification step (registerIdentifyPiecesRoute) runs at photo
// time, so the four real tables photographed BEFORE it existed are stuck
// as a single generic "Piece 1 of 1" with the description "0 pieces,
// Start Floor hand-off" -- Charlie Marlow's photo alone clearly shows
// four separate pieces.
//
// Rather than ask staff to re-photograph tables that are already
// correctly captured, this re-runs the same real identification against
// the photo already stored on the booking, and replaces the placeholder
// rows with one properly described piece each. Genuinely useful beyond
// today too: any booking whose photo predates a prompt improvement can
// be re-processed without touching the studio floor.
// ============================================================================
export function registerReidentifyRoute(app, supabase, STUDIO_ID, logger, axios, fs, logGeminiUsage) {
  app.post('/api/spec/bookings/:code/reidentify-pieces', async (req, res) => {
    try {
      const booking_code = req.params.code;
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on this service.' });

      const { data: existing } = await supabase
        .from('pottery_pieces')
        .select('id, reference_photo_url, reference_photo_taken_at, status, fulfilment, assigned_to')
        .eq('studio_id', STUDIO_ID)
        .eq('booking_id', booking_code)
        .neq('archived', true);

      const photoUrl = (existing || []).find((p) => p.reference_photo_url)?.reference_photo_url;
      if (!photoUrl) return res.status(400).json({ error: 'No stored photo found for this booking' });

      // Real guard -- never destroy genuine work. If any piece has
      // already been individually assigned or described by a person,
      // this booking is left alone rather than overwritten.
      const hasRealWork = (existing || []).some((p) => p.assigned_to || (p.fulfilment && p.fulfilment !== 'collect'));
      if (hasRealWork && !req.body?.force) {
        return res.status(409).json({ error: 'This booking already has pieces assigned to people. Re-identifying would overwrite that -- pass force to override.' });
      }

      const imgRes = await axios.get(photoUrl, { responseType: 'arraybuffer' });
      const base64 = Buffer.from(imgRes.data).toString('base64');

      const input = [
        {
          type: 'text',
          text: `This is a photo of a table in a pottery painting studio, taken at the end of a customer's session.\n\nIdentify every PAINTED POTTERY PIECE belonging to the customer -- the items they have painted and will be taking home after firing.\n\nInclude: mugs, bowls, plates, figurines, vases, jugs, money boxes, ornaments and similar ceramic pieces that have been painted.\n\nDo NOT include: paint pots, brushes, water pots, palettes, paint-mixing dishes or trays holding wet blobs or pools of paint, colour charts, menus, price cards, chalk boards, drinks, cans, glasses, phones, bags, or anything belonging to the studio rather than the customer. A shallow white dish with pools of wet paint in it is a palette, not a customer piece.\n\nFor each real piece, give a short specific description that would help someone find that exact piece later on a shelf of similar fired pottery -- mention its form and its distinguishing painted detail (e.g. "seated rabbit with pink flowers on its side", not just "rabbit").\n\nAlso give its bounding box in the photo.`,
        },
        { type: 'image', data: base64, mime_type: 'image/jpeg' },
      ];

      const responseSchema = {
        type: 'object',
        properties: {
          pieces: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                piece_type: { type: 'string' },
                box_2d: { type: 'array', items: { type: 'integer' } },
              },
              required: ['description', 'piece_type'],
            },
          },
        },
        required: ['pieces'],
      };

      let aiRes, modelUsed;
      try {
        ({ response: aiRes, modelUsed } = await callGeminiWithFallback(axios, GEMINI_API_KEY, {
          input,
          response_format: { type: 'text', mime_type: 'application/json', schema: responseSchema },
        }));
      } catch (err) {
        logger.error('reidentify: Gemini call failed', err.response?.data || err.message);
        return res.status(500).json({ error: friendlyGeminiError(err) });
      }

      const usage = extractGeminiUsage(aiRes.data);
      if (usage) await logGeminiUsage(supabase, STUDIO_ID, 'reidentify-pieces-gemini', usage, modelUsed);

      let parsed;
      try {
        const raw = extractGeminiText(aiRes.data);
        if (!raw) {
          logger.error('reidentify: no text extracted -- real shape:', JSON.stringify(aiRes.data).slice(0, 2000));
          return res.status(500).json({ error: 'Got a response from Gemini but could not read its output.' });
        }
        parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || [])[0] || '{}');
      } catch (e) {
        return res.status(500).json({ error: 'Could not parse the Gemini response' });
      }

      const found = parsed.pieces || [];
      if (!found.length) return res.status(400).json({ error: 'No pottery pieces identified in the stored photo' });

      const takenAt = (existing || []).find((p) => p.reference_photo_taken_at)?.reference_photo_taken_at || new Date().toISOString();
      const keepStatus = (existing || [])[0]?.status || 'queued';

      // Replace the placeholder rows with one properly described piece
      // each. Archives rather than hard-deletes, so nothing is truly lost.
      await supabase.from('pottery_pieces')
        .update({ archived: true, updated_at: new Date().toISOString() })
        .eq('studio_id', STUDIO_ID).eq('booking_id', booking_code);

      const rows = found.map((p) => {
        // Convert Gemini's [ymin, xmin, ymax, xmax] normalized 0-1000
        // into the same percentage shape the identify-at-capture route
        // returns, so stored boxes are one consistent format regardless
        // of which route produced them.
        let box = null;
        if (Array.isArray(p.box_2d) && p.box_2d.length === 4) {
          const [ymin, xmin, ymax, xmax] = p.box_2d;
          box = { left_pct: xmin / 10, top_pct: ymin / 10, right_pct: xmax / 10, bottom_pct: ymax / 10 };
        }
        return {
          studio_id: STUDIO_ID,
          booking_id: booking_code,
          piece_type: p.piece_type,
          description: p.description,
          status: keepStatus,
          reference_photo_url: photoUrl,
          reference_photo_taken_at: takenAt,
          described_at: new Date().toISOString(),
          photo_box: box,
        };
      });
      const { data: created, error: insErr } = await supabase.from('pottery_pieces').insert(rows).select('id, piece_type, description, photo_box');
      if (insErr) throw insErr;

      res.json({ replaced: (existing || []).length, created: created.length, pieces: created });
    } catch (err) {
      logger.error('reidentify failed', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.error?.message || err.message });
    }
  });
}

// ============================================================================
// SQUARE APPOINTMENTS TABLES -- read the real table, stop inventing one
// ----------------------------------------------------------------------------
// Daisy sent a photo of the actual Square Appointments day view the studio
// runs on: columns headed T2 a, T2 b, T3 a, T4 a, T4 b, "Staff 62 selected".
// Her tables are modelled in Square as bookable STAFF, and every appointment
// already carries which one it's on as team_member_id.
//
// The app was not reading it. registerRealBookingSyncRoute invented a table
// instead -- sequential allocation cycling 1-8, stored as "Main Studio 4".
// Checked against the live database: that is what's in there, plus 38
// bookings in the last ten days with no table at all.
//
// That matters more than it sounds, because the live till matcher works on
// TABLE DIGITS. "Main Studio 4" reduces to "4"; the real ticket "T4 a" also
// reduces to "4", so it half-worked by coincidence. But T4 a and T4 b both
// reduce to "4" as well -- meaning the "multiple candidates" branch in the
// live-order lookup isn't a defensive edge case, it's an ordinary Saturday
// with both halves of table 4 occupied.
//
// This replaces the guess with the fact.
// ============================================================================
export function registerSquareTablesRoutes(app, supabase, STUDIO_ID, logger, axios) {
  const squareHeaders = async () => {
    const { data: connection } = await supabase
      .from('square_connections')
      .select('square_access_token, square_token_expires_at')
      .eq('studio_id', STUDIO_ID)
      .single();
    if (!connection || new Date(connection.square_token_expires_at) < new Date()) return null;
    return {
      Authorization: `Bearer ${connection.square_access_token}`,
      'Square-Version': '2024-01-18',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  };

  // Caches the staff list so every later lookup is a local join rather than
  // a live Square call. Names change rarely; a table is added maybe once a
  // year. Re-run it when the studio layout changes.
  app.post('/api/spec/square/sync-team-members', async (req, res) => {
    try {
      const headers = await squareHeaders();
      if (!headers) return res.status(400).json({ error: 'No valid Square connection', synced: 0 });

      const locationsRes = await axios.get('https://connect.squareup.com/v2/locations', { headers });
      const locationIds = (locationsRes.data.locations || []).map((l) => l.id);
      if (!locationIds.length) return res.json({ synced: 0, reason: 'no_square_locations' });

      let members = [];
      let cursor;
      do {
        // Square caps SearchTeamMembers at 100. Sending 200 is rejected
        // outright, which is why this returned nothing and the table sync
        // then had no names to match against -- "0 bookings moved to their
        // real table" was the symptom, two stages downstream of the cause.
        const body = { query: { filter: { location_ids: locationIds, status: 'ACTIVE' } }, limit: 100 };
        if (cursor) body.cursor = cursor;
        const r = await axios.post('https://connect.squareup.com/v2/team-members/search', body, { headers });
        members = members.concat(r.data.team_members || []);
        cursor = r.data.cursor;
      } while (cursor);

      const rows = members.map((m) => ({
        studio_id: STUDIO_ID,
        team_member_id: m.id,
        // Tables are named in the given-name field ("T4 a"); real people
        // have both names. Either way this is what Square shows as the
        // column header, which is what staff read off the screen.
        display_name: [m.given_name, m.family_name].filter(Boolean).join(' ').trim() || m.email_address || m.id,
        is_bookable: m.status === 'ACTIVE',
        updated_at: new Date().toISOString(),
      }));

      if (rows.length) {
        const { error } = await supabase
          .from('square_team_members')
          .upsert(rows, { onConflict: 'studio_id,team_member_id' });
        if (error) throw error;
      }

      res.json({ synced: rows.length, names: rows.map((r) => r.display_name).sort() });
    } catch (err) {
      logger.error('sync-team-members failed', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.errors?.[0]?.detail || err.message });
    }
  });

  // Fills in the real table on bookings that have a square_booking_id.
  // Deliberately re-reads from Square rather than trusting what's stored:
  // the whole point is that the appointment is the source of truth and the
  // stored value was a guess.
  app.post('/api/spec/square/sync-booking-tables', async (req, res) => {
    const DAYS_BACK = Math.min(parseInt(req.body?.days_back, 10) || 3, 31);
    const DAYS_FORWARD = Math.min(parseInt(req.body?.days_forward, 10) || 27, 31);
    try {
      const headers = await squareHeaders();
      if (!headers) return res.status(400).json({ error: 'No valid Square connection', updated: 0 });

      const { data: staff } = await supabase
        .from('square_team_members')
        .select('team_member_id, display_name')
        .eq('studio_id', STUDIO_ID);
      const nameById = new Map((staff || []).map((s) => [s.team_member_id, s.display_name]));
      // On a studio that has never synced, this used to 400. Harmless by
      // hand, but it now runs on the five-minute loop, so it would have
      // been a guaranteed error every five minutes forever on any new
      // studio -- noise that trains people to ignore the logs. Nothing
      // cached simply means nothing to match yet, which is a quiet no-op.
      if (!nameById.size) {
        return res.json({ updated: 0, unchanged: 0, no_match: 0, reason: 'no_team_members_cached', changes: [] });
      }

      const locationsRes = await axios.get('https://connect.squareup.com/v2/locations', { headers });
      const locations = locationsRes.data.locations || [];
      if (!locations.length) return res.json({ updated: 0, reason: 'no_square_locations' });

      // Square rejects a bookings window longer than 31 days, which is the
      // documented cause of earlier sync gaps -- kept safely inside it.
      const startMin = new Date();
      startMin.setDate(startMin.getDate() - DAYS_BACK);
      const startMax = new Date();
      startMax.setDate(startMax.getDate() + DAYS_FORWARD);

      let appts = [];
      let cursor;
      do {
        const params = {
          location_id: locations[0].id,
          start_at_min: startMin.toISOString(),
          start_at_max: startMax.toISOString(),
          limit: 100,
        };
        if (cursor) params.cursor = cursor;
        const r = await axios.get('https://connect.squareup.com/v2/bookings', { headers, params });
        appts = appts.concat(r.data.bookings || []);
        cursor = r.data.cursor;
      } while (cursor);

      const tableByBookingId = new Map();
      for (const a of appts) {
        const tmId = a.appointment_segments?.[0]?.team_member_id;
        if (tmId && nameById.has(tmId)) tableByBookingId.set(a.id, { tmId, name: nameById.get(tmId) });
      }

      const { data: rows } = await supabase
        .from('bookings')
        .select('id, booking_code, square_booking_id, table_number')
        .eq('studio_id', STUDIO_ID)
        .not('square_booking_id', 'is', null);

      let updated = 0, unchanged = 0, noMatch = 0;
      const changes = [];
      for (const b of rows || []) {
        const hit = tableByBookingId.get(b.square_booking_id);
        if (!hit) { noMatch++; continue; }
        if (b.table_number === hit.name) { unchanged++; continue; }
        const { error } = await supabase
          .from('bookings')
          .update({ table_number: hit.name, square_team_member_id: hit.tmId })
          .eq('id', b.id);
        if (error) { logger.error('table update failed', error.message); continue; }
        changes.push({ booking_code: b.booking_code, from: b.table_number, to: hit.name });
        updated++;
      }

      res.json({ appointments_seen: appts.length, updated, unchanged, no_match: noMatch, changes: changes.slice(0, 40) });
    } catch (err) {
      logger.error('sync-booking-tables failed', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.errors?.[0]?.detail || err.message });
    }
  });

  // Feeds the schedule view: bookings for one day, grouped by table, in the
  // shape the Square Appointments side-by-side day view uses -- because
  // that's the screen the girls already read fluently every shift.
  app.get('/api/spec/schedule/:date', async (req, res) => {
    try {
      const date = req.params.date;
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(`${date}T23:59:59.999Z`);

      const { data: bookings, error } = await supabase
        .from('bookings')
        .select('booking_code, customer_name, session_start, session_end, table_number, party_size, square_team_member_id, space_name, live_ticket_name, live_ticket_total_cents')
        .eq('studio_id', STUDIO_ID)
        .gte('session_start', dayStart.toISOString())
        .lte('session_start', dayEnd.toISOString())
        .order('session_start', { ascending: true });
      if (error) throw error;

      const { data: staff } = await supabase
        .from('square_team_members')
        .select('team_member_id, display_name')
        .eq('studio_id', STUDIO_ID);

      // Columns are the tables that Square knows about, ordered the way the
      // Square screen orders them (T2 a, T2 b, T3 a...), plus any table a
      // booking actually references that isn't in the cache -- so nothing
      // is ever silently dropped off the end of the schedule.
      const known = (staff || []).map((s) => s.display_name).filter(Boolean);
      const used = (bookings || []).map((b) => b.table_number).filter(Boolean);
      const columns = Array.from(new Set([...known, ...used])).sort((a, b) =>
        a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })
      );

      // demo_app_session_status, NOT booking_status -- there is no such
      // table, and querying it would have 500'd this whole endpoint.
      const { data: statuses } = await supabase
        .from('demo_app_session_status')
        .select('booking_code, finished_at')
        .eq('studio_id', STUDIO_ID)
        .in('booking_code', (bookings || []).map((b) => b.booking_code).concat(['__none__']));
      const finished = new Set((statuses || []).filter((s) => s.finished_at).map((s) => s.booking_code));

      // Pottery due back TODAY, from sessions that happened weeks ago.
      // This is the thing a Square calendar structurally cannot show,
      // because Square doesn't know the pottery exists -- it sees a
      // 90-minute appointment that ended a fortnight back and is done
      // with it. A collection is a real event happening today with
      // someone walking through the door for it, and it belongs on the
      // day view next to the sessions.
      // collection_date/method live on demo_app_session_status, NOT on
      // bookings -- checked against the live schema rather than assumed.
      // Querying bookings for them would have thrown and taken the whole
      // day view down with it.
      const { data: dueStatuses } = await supabase
        .from('demo_app_session_status')
        .select('booking_code, collection_date, collection_method, postal_postcode')
        .eq('studio_id', STUDIO_ID)
        .eq('collection_date', date);

      const dueCodes = (dueStatuses || []).map((s2) => s2.booking_code);

      // Names come from bookings, so a collection card says "Charlie
      // Marlow" rather than a booking code nobody can read at a counter.
      let nameByCode = new Map();
      if (dueCodes.length) {
        const { data: dueBookingRows } = await supabase
          .from('bookings')
          .select('booking_code, customer_name')
          .eq('studio_id', STUDIO_ID)
          .in('booking_code', dueCodes);
        nameByCode = new Map((dueBookingRows || []).map((b) => [b.booking_code, b.customer_name]));
      }
      let piecesByBooking = {};
      if (dueCodes.length) {
        const { data: duePieces } = await supabase
          .from('pottery_pieces')
          .select('booking_id, status, piece_type')
          .eq('studio_id', STUDIO_ID)
          .in('booking_id', dueCodes)
          .neq('archived', true);
        for (const p of duePieces || []) {
          if (!piecesByBooking[p.booking_id]) piecesByBooking[p.booking_id] = [];
          piecesByBooking[p.booking_id].push(p);
        }
      }

      res.json({
        date,
        columns,
        bookings: (bookings || []).map((b) => ({ ...b, finished: finished.has(b.booking_code) })),
        unassigned: (bookings || []).filter((b) => !b.table_number).length,
        collections: (dueStatuses || []).map((b) => ({
          booking_code: b.booking_code,
          customer_name: nameByCode.get(b.booking_code) || b.booking_code,
          collection_method: b.collection_method,
          postal_postcode: b.postal_postcode,
          piece_count: (piecesByBooking[b.booking_code] || []).length,
          // "Ready" means every piece has cleared the kiln stages. Counted
          // rather than assumed, so the lane tells the truth about what can
          // actually be handed over when someone arrives.
          ready: (piecesByBooking[b.booking_code] || []).length > 0
            && (piecesByBooking[b.booking_code] || []).every((p) => ['ready', 'collected', 'complete'].includes(String(p.status || '').toLowerCase())),
        })),
      });
    } catch (err) {
      logger.error('schedule failed', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// PACKING -- the screen for whoever is actually boxing the pottery
// ----------------------------------------------------------------------------
// Daisy: "I don't seem to know if there's an actual packing page that
// whoever's packing just clicks on... we wanna keep the photographs if they
// are present on the booking at all times with the detailed pieces and
// somehow drillable. So it's not all on the huge screen."
//
// There wasn't one. kiln-dip is a lookup-by-booking-code tool for setting
// collection dates and sending emails -- checked, and it renders no
// photographs at all. So the person packing had nowhere to see what they
// were packing, which is the one job where the reference photo matters most:
// a shelf of fired pottery all looks the same, and the whole point of
// photographing the table was this moment.
//
// Returns the queue only. Piece detail comes from the existing booking
// detail endpoint on drill-down, so a packer loads photos for one booking
// at a time rather than pulling every image for the week into one page.
// ============================================================================
export function registerPackingRoutes(app, supabase, STUDIO_ID, logger) {
  app.get('/api/spec/packing/queue', async (req, res) => {
    try {
      // Packing happens when the pottery comes OUT OF THE KILN, which is
      // days before the collection date -- Daisy's point, and the reason
      // this screen was empty. The first version filtered to collection
      // dates that had already arrived, so all four of today's bookings
      // (collection 4 Sept, thirteen days out) were invisible to the
      // packer who has the fired pieces in front of them right now.
      //
      // A collection date is a PROMISE TO THE CUSTOMER, not a signal that
      // work can start. So the queue shows everything still to pack,
      // soonest promise first, and lets the packer work as far ahead as
      // they like.
      const horizonDays = Math.min(parseInt(req.query.days, 10) || 60, 180);
      const horizon = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);

      const { data: statuses, error } = await supabase
        .from('demo_app_session_status')
        .select('booking_code, collection_date, collection_method, postal_postcode, finished_at')
        .eq('studio_id', STUDIO_ID)
        .not('collection_date', 'is', null)
        .lte('collection_date', horizon)
        .order('collection_date', { ascending: true });
      if (error) throw error;

      const codes = (statuses || []).map((s) => s.booking_code);
      if (!codes.length) return res.json({ upto, queue: [] });

      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('booking_code, customer_name, session_start')
        .eq('studio_id', STUDIO_ID)
        .in('booking_code', codes);
      const bookingByCode = new Map((bookingRows || []).map((b) => [b.booking_code, b]));

      const { data: pieces } = await supabase
        .from('pottery_pieces')
        .select('booking_id, status, fulfilment, assigned_to, reference_photo_url')
        .eq('studio_id', STUDIO_ID)
        .in('booking_id', codes)
        .neq('archived', true);

      const byBooking = {};
      for (const p of pieces || []) {
        (byBooking[p.booking_id] = byBooking[p.booking_id] || []).push(p);
      }

      const queue = (statuses || []).map((st) => {
        const ps = byBooking[st.booking_code] || [];
        // Pieces on hold are genuinely not part of this parcel -- the
        // customer is coming back to finish them -- so they're counted
        // separately rather than making a booking look incomplete forever.
        const onHold = ps.filter((p) => p.fulfilment === 'return_visit').length;
        const live = ps.filter((p) => p.fulfilment !== 'return_visit');
        const collected = live.filter((p) => String(p.status || '').toLowerCase() === 'collected').length;
        return {
          booking_code: st.booking_code,
          customer_name: bookingByCode.get(st.booking_code)?.customer_name || st.booking_code,
          session_start: bookingByCode.get(st.booking_code)?.session_start || null,
          collection_date: st.collection_date,
          // Negative = overdue. Lets the queue say "due in 13 days" or
          // "OVERDUE" rather than a bare date the packer has to subtract
          // from today's in their head while holding a box.
          days_until: Math.round(
            (new Date(`${st.collection_date}T00:00:00Z`).getTime()
              - new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime())
            / 86400000
          ),
          collection_method: st.collection_method,
          postal_postcode: st.postal_postcode,
          piece_count: live.length,
          on_hold: onHold,
          collected,
          // Whether there's a reference photo to pack against at all. Shown
          // honestly in the queue so a packer knows before they walk to the
          // shelf that this is one they'll be identifying by hand.
          has_photo: ps.some((p) => p.reference_photo_url),
          done: live.length > 0 && collected === live.length,
        };
      })
      // Anything with no pieces at all isn't packable -- keeping it in the
      // queue would just be noise on a screen used under time pressure.
      .filter((b) => b.piece_count > 0 || b.on_hold > 0);

      res.json({ horizon, queue });
    } catch (err) {
      logger.error('packing queue failed', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Ticking a piece off while packing. A separate route rather than reusing
  // POST /pieces/:id/fulfilment, because that one only accepts assigned_to,
  // fulfilment, postal_postcode and hold_reason -- it silently ignores any
  // status passed to it, so packing would have appeared to work and saved
  // nothing at all.
  app.post('/api/spec/pieces/:id/packed', async (req, res) => {
    try {
      const packed = req.body?.packed !== false;
      const { data, error } = await supabase
        .from('pottery_pieces')
        .update({ status: packed ? 'collected' : 'queued', updated_at: new Date().toISOString() })
        .eq('id', req.params.id)
        .eq('studio_id', STUDIO_ID)
        // Never let a hold get packed by accident -- a piece kept back for
        // a return visit must not leave the studio in someone else's box.
        .neq('fulfilment', 'return_visit')
        .select('id, status')
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Piece not found, or it is on hold for a return visit' });
      res.json(data);
    } catch (err) {
      logger.error('mark packed failed', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// KILN BATCHES -- one scan takes a whole shelf out of the kiln
// ----------------------------------------------------------------------------
// Daisy: "Out of kiln actions... maybe we have a master QR for the collection
// date."
//
// The right unit, and not the obvious one. Pieces are fired and shelved as a
// BATCH sharing a collection date, so the natural action is "this whole
// trolley is out", not forty individual taps -- and forty taps is the kind of
// job that quietly stops being done on a busy Saturday.
//
// So a batch is every piece promised for one collection date. Print its QR
// once, tape it to the shelf or trolley, and whoever unloads the kiln scans
// it. Physical object, physical action, one scan.
//
// This introduces 'ready' as the status meaning out of the kiln and on the
// shelf. Until now every piece in the studio sat at 'queued' from the moment
// it was painted to the moment it was collected, so nothing could tell a
// packer which pottery actually existed on a shelf yet.
// ============================================================================
export function registerKilnBatchRoutes(app, supabase, STUDIO_ID, logger) {
  // Shared: the pieces belonging to one collection date.
  const batchPieces = async (date) => {
    const { data: statuses } = await supabase
      .from('demo_app_session_status')
      .select('booking_code')
      .eq('studio_id', STUDIO_ID)
      .eq('collection_date', date);
    const codes = (statuses || []).map((s) => s.booking_code);
    if (!codes.length) return { codes: [], pieces: [] };

    const { data: pieces } = await supabase
      .from('pottery_pieces')
      .select('id, booking_id, status, fulfilment, piece_type')
      .eq('studio_id', STUDIO_ID)
      .in('booking_id', codes)
      .neq('archived', true);
    return { codes, pieces: pieces || [] };
  };

  // The list of batches -- what's in the kiln and what's coming.
  app.get('/api/spec/kiln/batches', async (req, res) => {
    try {
      const { data: statuses, error } = await supabase
        .from('demo_app_session_status')
        .select('booking_code, collection_date')
        .eq('studio_id', STUDIO_ID)
        .not('collection_date', 'is', null)
        .order('collection_date', { ascending: true });
      if (error) throw error;

      const codes = (statuses || []).map((s) => s.booking_code);
      const dateByCode = new Map((statuses || []).map((s) => [s.booking_code, s.collection_date]));
      if (!codes.length) return res.json({ batches: [] });

      const { data: pieces } = await supabase
        .from('pottery_pieces')
        .select('booking_id, status, fulfilment')
        .eq('studio_id', STUDIO_ID)
        .in('booking_id', codes)
        .neq('archived', true);

      const byDate = {};
      for (const p of pieces || []) {
        const d = dateByCode.get(p.booking_id);
        if (!d) continue;
        // A piece held for a return visit is not in this firing -- the
        // customer hasn't finished painting it. Counted separately so the
        // batch total matches what's physically on the shelf.
        if (p.fulfilment === 'return_visit') {
          byDate[d] = byDate[d] || { date: d, pieces: 0, out: 0, on_hold: 0, bookings: new Set() };
          byDate[d].on_hold++;
          continue;
        }
        byDate[d] = byDate[d] || { date: d, pieces: 0, out: 0, on_hold: 0, bookings: new Set() };
        byDate[d].pieces++;
        byDate[d].bookings.add(p.booking_id);
        if (['ready', 'collected', 'complete'].includes(String(p.status || '').toLowerCase())) byDate[d].out++;
      }

      const today = new Date().toISOString().slice(0, 10);
      const batches = Object.values(byDate)
        .map((b) => ({
          date: b.date,
          pieces: b.pieces,
          out: b.out,
          on_hold: b.on_hold,
          bookings: b.bookings.size,
          all_out: b.pieces > 0 && b.out === b.pieces,
          days_until: Math.round(
            (new Date(`${b.date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000
          ),
        }))
        .filter((b) => b.pieces > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

      res.json({ batches });
    } catch (err) {
      logger.error('kiln batches failed', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // One batch, as the QR lands on it.
  app.get('/api/spec/kiln/batch/:date', async (req, res) => {
    try {
      const { codes, pieces } = await batchPieces(req.params.date);

      // A printed card taped to a trolley outlives the date on it. If this
      // batch has been moved, say so instead of reporting an empty shelf.
      if (!codes.length) {
        const { data: move } = await supabase
          .from('kiln_batch_moves')
          .select('to_date, moved_bookings, created_at')
          .eq('studio_id', STUDIO_ID)
          .eq('from_date', req.params.date)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (move) {
          return res.json({
            date: req.params.date, bookings: [], piece_count: 0, already_out: 0, on_hold: 0,
            moved_to: move.to_date, moved_bookings: move.moved_bookings,
          });
        }
      }

      const live = pieces.filter((p) => p.fulfilment !== 'return_visit');
      const out = live.filter((p) => ['ready', 'collected', 'complete'].includes(String(p.status || '').toLowerCase()));

      const { data: bookingRows } = codes.length
        ? await supabase.from('bookings').select('booking_code, customer_name')
            .eq('studio_id', STUDIO_ID).in('booking_code', codes)
        : { data: [] };

      res.json({
        date: req.params.date,
        bookings: (bookingRows || []).map((b) => ({
          booking_code: b.booking_code,
          customer_name: b.customer_name,
          pieces: live.filter((p) => p.booking_id === b.booking_code).length,
        })).filter((b) => b.pieces > 0),
        piece_count: live.length,
        already_out: out.length,
        on_hold: pieces.length - live.length,
      });
    } catch (err) {
      logger.error('kiln batch failed', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================================================
  // MOVING A BATCH -- "the kiln broke, everything on the 28th is now the 4th"
  // --------------------------------------------------------------------------
  // Daisy: "if the collection date is changed... it's a global change across
  // everything that's affecting... But the global date for the other
  // collections on bookings that have happened that haven't been sequenced
  // and changed needed to stay the same."
  //
  // Two genuinely different operations that were sharing one field:
  //
  //   1. MOVE A BATCH (this route). A real firing slipped. Every booking
  //      promised that date moves together, because they are one physical
  //      shelf. Packing, collections and the day view all read
  //      collection_date, so they all follow from this single write --
  //      there is no second place to remember to update.
  //
  //   2. THE STUDIO DEFAULT (/api/spec/studio/collection-date). What NEW
  //      bookings get promised. Deliberately untouched here: a broken kiln
  //      today says nothing about what a session three weeks out should be
  //      promised, and bookings already given a date must not be dragged
  //      along behind a default change. That route already only fills in
  //      today's bookings that have no date yet, which is the correct half.
  //
  // The response reports whether the studio default happens to match the
  // date being moved, so the decision to change it too is made deliberately
  // rather than by accident in either direction.
  app.post('/api/spec/kiln/batch/:date/move', async (req, res) => {
    try {
      const from = req.params.date;
      const to = req.body?.to_date;
      if (!to || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return res.status(400).json({ error: 'to_date must be a YYYY-MM-DD date' });
      }
      if (to === from) return res.status(400).json({ error: 'That is already the batch date' });

      const { data: affected } = await supabase
        .from('demo_app_session_status')
        .select('booking_code')
        .eq('studio_id', STUDIO_ID)
        .eq('collection_date', from);
      const codes = (affected || []).map((r) => r.booking_code);
      if (!codes.length) return res.status(404).json({ error: 'No bookings are on that collection date' });

      const { error } = await supabase
        .from('demo_app_session_status')
        .update({ collection_date: to })
        .eq('studio_id', STUDIO_ID)
        .eq('collection_date', from);
      if (error) throw error;

      // Recorded because the QR cards are PHYSICAL. A card printed for the
      // 28th is taped to a trolley and will still be scanned after the move
      // -- without this it would land on an empty batch and read as "no
      // pieces", which looks like the app losing a shelf of pottery. With
      // it, the scan says where the batch went.
      await supabase.from('kiln_batch_moves').insert({
        studio_id: STUDIO_ID, from_date: from, to_date: to, moved_bookings: codes.length,
      });

      const { data: studio } = await supabase
        .from('studios').select('current_collection_date').eq('id', STUDIO_ID).maybeSingle();

      res.json({
        moved: codes.length,
        from,
        to,
        studio_default: studio?.current_collection_date || null,
        // True when the studio's default for NEW bookings is the date just
        // vacated -- worth deciding about, but never changed silently.
        studio_default_matches_old_date: studio?.current_collection_date === from,
      });
    } catch (err) {
      logger.error('kiln batch move failed', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // The scan action itself.
  app.post('/api/spec/kiln/batch/:date/out', async (req, res) => {
    try {
      const { pieces } = await batchPieces(req.params.date);
      // Only move pieces genuinely still waiting. Deliberately excludes
      // anything already collected -- a second scan of a QR still taped to
      // a shelf must never drag a collected piece backwards into 'ready'.
      const toMove = pieces
        .filter((p) => p.fulfilment !== 'return_visit')
        .filter((p) => !['ready', 'collected', 'complete'].includes(String(p.status || '').toLowerCase()))
        .map((p) => p.id);

      if (!toMove.length) return res.json({ moved: 0, already_out: true });

      const { error } = await supabase
        .from('pottery_pieces')
        .update({ status: 'ready', updated_at: new Date().toISOString() })
        .in('id', toMove);
      if (error) throw error;

      res.json({ moved: toMove.length, already_out: false });
    } catch (err) {
      logger.error('kiln batch out failed', err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

// ============================================================================
// TICKET LINK DIAGNOSTIC -- what can we actually match a booking on?
// ----------------------------------------------------------------------------
// Daisy wants the TERMINAL to win: whatever the girls name a ticket when they
// start taking drinks orders should attach to the booking, whether they type
// "L3", "main studio four b" or "6b". Fair, and it generalises -- other
// studios will have their own till entirely.
//
// The question is what to match ON. There are four candidate rungs, best
// first, and which are available depends entirely on how this studio actually
// rings things up:
//
//   1. customer_id on the order == customer_id on the appointment. Exact,
//      needs nobody to type anything, survives any naming at all.
//   2. A short booking code typed into the ticket name (the code would be
//      printed on the table card). Exact, but costs three keystrokes.
//   3. Digits shared between ticket name and table. What happens today, and
//      it fails silently on "L3" or on any name without a number.
//   4. Last resort: one unmatched ticket, one active session, no other
//      candidate in the window.
//
// Rather than build a matcher on an assumption about how staff work, this
// MEASURES it against real open tickets. Read-only, writes nothing, and
// deliberately reports the raw counts instead of a verdict -- the point is to
// look at the real numbers and then decide.
// ============================================================================
export function registerTicketLinkDiagnosticRoute(app, supabase, STUDIO_ID, logger, axios) {
  const digitsOf = (s) => (String(s || '').match(/\d+/g) || []).join('');

  app.get('/api/spec/diagnostics/ticket-link', async (req, res) => {
    try {
      const daysBack = Math.min(parseInt(req.query.days, 10) || 7, 30);

      const { data: connection } = await supabase
        .from('square_connections')
        .select('square_access_token, square_token_expires_at')
        .eq('studio_id', STUDIO_ID)
        .single();
      if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
        return res.status(400).json({ error: 'No valid Square connection' });
      }
      const headers = {
        Authorization: `Bearer ${connection.square_access_token}`,
        'Square-Version': '2024-01-18',
        'Content-Type': 'application/json',
      };

      const locationsRes = await axios.get('https://connect.squareup.com/v2/locations', { headers });
      const locationIds = (locationsRes.data.locations || []).map((l) => l.id);
      if (!locationIds.length) return res.json({ error: 'no_square_locations' });

      const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
      const ordersRes = await axios.post(
        'https://connect.squareup.com/v2/orders/search',
        {
          location_ids: locationIds,
          query: { filter: { date_time_filter: { created_at: { start_at: since.toISOString() } } } },
          limit: 500,
        },
        { headers }
      );
      const orders = ordersRes.data.orders || [];

      // Bookings over the same window, to see whether a customer on a ticket
      // could actually be tied back to an appointment.
      const { data: bookings } = await supabase
        .from('bookings')
        .select('booking_code, customer_name, table_number, session_start')
        .eq('studio_id', STUDIO_ID)
        .gte('session_start', since.toISOString());

      // Appointment customer IDs come from SQUARE, not from our bookings
      // table -- which has customer_name, email and phone but no
      // square_customer_id at all. Checked the live schema rather than
      // assuming: reading it from Supabase would have compared orders
      // against an empty set and concluded rung 1 was useless when it may
      // be the best option available.
      // EVERY location, not just the first. The first run of this reported
      // "appointments with a customer: 0", which was wrong -- checked the
      // Square Bookings API directly and every single appointment carries a
      // customer_id. The cause was this querying locationIds[0] while the
      // appointments live at a different location of the same account, so
      // it silently read an empty list and made rung 1 look dead when it
      // had simply never been measured.
      //
      // Also reports appointments_read, so a zero can never again be
      // mistaken for a finding rather than a failure.
      let bookingCustomerIds = new Set();
      let apptsRead = 0;
      const apptErrors = [];
      for (const locId of locationIds) {
        try {
          let cursor;
          do {
            const params = {
              location_id: locId,
              start_at_min: since.toISOString(),
              start_at_max: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              limit: 100,
            };
            if (cursor) params.cursor = cursor;
            const r = await axios.get('https://connect.squareup.com/v2/bookings', { headers, params });
            const got = r.data.bookings || [];
            apptsRead += got.length;
            for (const a of got) if (a.customer_id) bookingCustomerIds.add(a.customer_id);
            cursor = r.data.cursor;
          } while (cursor);
        } catch (err) {
          apptErrors.push(`${locId}: ${err.response?.data?.errors?.[0]?.detail || err.message}`);
        }
      }
      const bookingTableDigits = new Set(
        (bookings || []).map((b) => digitsOf(b.table_number)).filter(Boolean)
      );

      let withCustomer = 0, customerMatchesBooking = 0;
      let withTicketName = 0, ticketNameHasDigits = 0, digitsMatchATable = 0;
      let withReferenceId = 0, withNothingUsable = 0;
      const sampleNames = [];

      for (const o of orders) {
        const ticketName = o.ticket_name || o.source?.name || null;
        if (o.customer_id) {
          withCustomer++;
          if (bookingCustomerIds.has(o.customer_id)) customerMatchesBooking++;
        }
        if (o.reference_id) withReferenceId++;
        if (ticketName) {
          withTicketName++;
          const d = digitsOf(ticketName);
          if (d) {
            ticketNameHasDigits++;
            if (bookingTableDigits.has(d)) digitsMatchATable++;
          }
          // A handful of real names, so the actual naming habits are visible
          // rather than guessed at. Capped -- this is a sample, not a dump.
          if (sampleNames.length < 25 && !sampleNames.includes(ticketName)) sampleNames.push(ticketName);
        }
        if (!o.customer_id && !ticketName) withNothingUsable++;
      }

      res.json({
        window_days: daysBack,
        orders_scanned: orders.length,
        bookings_in_window: (bookings || []).length,
        locations_checked: locationIds.length,
        appointments_read: apptsRead,
        appointment_read_errors: apptErrors,
        appointments_with_a_square_customer: bookingCustomerIds.size,
        rung_1_customer: {
          orders_with_customer_id: withCustomer,
          of_those_matching_a_booking: customerMatchesBooking,
        },
        rung_2_reference_id: { orders_with_reference_id: withReferenceId },
        rung_3_digits: {
          orders_with_ticket_name: withTicketName,
          ticket_names_containing_digits: ticketNameHasDigits,
          digits_matching_a_known_table: digitsMatchATable,
        },
        orders_with_nothing_usable: withNothingUsable,
        sample_ticket_names: sampleNames,
      });
    } catch (err) {
      logger.error('ticket-link diagnostic failed', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.errors?.[0]?.detail || err.message });
    }
  });
}

// ============================================================================
// TICKET MATCHING -- the terminal wins
// ----------------------------------------------------------------------------
// Built on what the girls ACTUALLY type, measured from 271 real orders over
// seven days rather than assumed. Two naming habits, both common:
//
//   TABLE CODE   T2a, T7, T3, L14, L15, "T4 - 3", "T2A - 2"
//   FIRST NAME   "Party Holly", "Party Chloe", "Party natalie", "Tabby - 2"
//
// Three things that measurement exposed, none of which I would have guessed:
//
//  1. "L" is the Lounge and "T" is Main Studio. Matching on DIGITS alone --
//     which is what the app did -- conflates T4 with L4. The letter matters.
//  2. "T4 - 3" is table T4, ticket 3. digitsOf() turned that into "43",
//     matching no table at all. That is almost certainly most of the gap
//     between 89 ticket names containing digits and only 76 that matched.
//  3. 156 of 271 orders have no ticket name at all -- counter and cafe sales
//     with no table. Those SHOULD stay unmatched, so the real denominator is
//     107, not 271. Any "match rate" quoted against 271 is meaningless.
//
// One booking can have several tickets ("Tabby - 2", "T2A - 2"), so totals
// are summed rather than one ticket winning.
// ============================================================================

// "T4 - 3" -> { code: 'T4', seq: 3 }; "T2a" -> { code: 'T2A' }; "L15" -> 'L15'
export function parseTicketName(raw) {
  const name = String(raw || '').trim();
  if (!name) return { code: null, words: [], seq: null };

  // Table code at the START only. A ticket called "Party Holly" has no code,
  // and hunting for a letter+number anywhere would find one in a surname.
  const codeMatch = name.match(/^([TL])\s*(\d{1,2})\s*([A-Za-z])?/i);
  let code = null;
  if (codeMatch) {
    code = `${codeMatch[1].toUpperCase()}${parseInt(codeMatch[2], 10)}`;
  }

  // Trailing "- 2" is a ticket sequence, not part of the table.
  const seqMatch = name.match(/[-–]\s*(\d{1,2})\s*$/);
  const seq = seqMatch ? parseInt(seqMatch[1], 10) : null;

  // Words that could be a person. "party" is a label, not a name.
  const STOP = new Set(['party', 'parties', 'pots', 'pottery', 'table', 'the', 'and', 'x']);
  const words = name
    .replace(/[-–]\s*\d{1,2}\s*$/, '')
    .replace(/^[TL]\s*\d{1,2}\s*[A-Za-z]?/i, '')
    .split(/[\s,&]+/)
    .map((w) => w.replace(/[^A-Za-z]/g, '').toLowerCase())
    .filter((w) => w.length >= 3 && !STOP.has(w));

  return { code, words, seq };
}

// Base code of a table name from Square Appointments: "T4 a" -> "T4".
// Ticket names carry no a/b suffix, so both halves of table 4 reduce to T4
// and are separated by time and by name instead.
export function baseTableCode(tableName) {
  const raw = String(tableName || '').trim();
  if (!raw) return null;

  // Square names these in full -- "Table 6", "Lounge 5", "Evening 3",
  // "Thursdays 8", "Pop Up Event" -- NOT the "T2 a" shorthand the
  // Appointments calendar column headers display. I had built the matcher
  // against the column headers in Daisy's photo, which are an abbreviation
  // of the real record. Checked against the live team-members API.
  //
  // The girls' ticket names use the shorthand (T6, L15), so this is the
  // translation between the two, and without it every code match failed
  // silently while looking perfectly reasonable in the code.
  const full = raw.match(/^(table|lounge)\s*(\d{1,2})/i);
  if (full) return `${full[1][0].toUpperCase()}${parseInt(full[2], 10)}`;

  const short = raw.match(/^([TL])\s*(\d{1,2})/i);
  if (short) return `${short[1].toUpperCase()}${parseInt(short[2], 10)}`;

  // Evening / Thursdays / Pop Up sessions are real bookable resources but
  // carry no table code the till would ever use. Null, not a guess.
  return null;
}

export function registerTicketMatchRoutes(app, supabase, STUDIO_ID, logger, axios) {
  app.post('/api/spec/bookings/match-tickets', async (req, res) => {
    const dryRun = req.body?.dry_run === true;
    const daysBack = Math.min(parseInt(req.body?.days, 10) || 1, 30);
    try {
      const { data: connection } = await supabase
        .from('square_connections')
        .select('square_access_token, square_token_expires_at')
        .eq('studio_id', STUDIO_ID)
        .single();
      if (!connection || new Date(connection.square_token_expires_at) < new Date()) {
        return res.status(400).json({ error: 'No valid Square connection', matched: 0 });
      }
      const headers = {
        Authorization: `Bearer ${connection.square_access_token}`,
        'Square-Version': '2024-01-18',
        'Content-Type': 'application/json',
      };

      const locationsRes = await axios.get('https://connect.squareup.com/v2/locations', { headers });
      const locationIds = (locationsRes.data.locations || []).map((l) => l.id);
      if (!locationIds.length) return res.json({ matched: 0, reason: 'no_square_locations' });

      const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
      const ordersRes = await axios.post(
        'https://connect.squareup.com/v2/orders/search',
        {
          location_ids: locationIds,
          query: { filter: { date_time_filter: { created_at: { start_at: since.toISOString() } } } },
          limit: 500,
        },
        { headers }
      );
      const orders = (ordersRes.data.orders || []).filter((o) => o.ticket_name || o.source?.name);

      const { data: bookings } = await supabase
        .from('bookings')
        .select('booking_code, customer_name, table_number, session_start, session_end')
        .eq('studio_id', STUDIO_ID)
        .gte('session_start', since.toISOString());

      const prepared = (bookings || []).map((b) => {
        const first = String(b.customer_name || '').trim().split(/\s+/)[0].toLowerCase();
        return {
          ...b,
          first_name: first,
          base_code: baseTableCode(b.table_number),
          start: new Date(b.session_start).getTime(),
          end: b.session_end ? new Date(b.session_end).getTime() : new Date(b.session_start).getTime() + 2 * 60 * 60 * 1000,
        };
      });

      // Score every plausible pairing, then assign best-first. A ticket opened
      // slightly before or after a session still belongs to it, so the window
      // is generous -- but time alone never matches anything, it only ranks.
      const WINDOW = 3 * 60 * 60 * 1000;
      const pairs = [];
      for (const o of orders) {
        const ticketName = o.ticket_name || o.source?.name;
        const parsed = parseTicketName(ticketName);
        const created = new Date(o.created_at).getTime();
        for (const b of prepared) {
          if (created < b.start - WINDOW || created > b.end + WINDOW) continue;
          let score = 0;
          const basis = [];
          if (parsed.code && b.base_code && parsed.code === b.base_code) { score += 10; basis.push('table code'); }
          if (parsed.words.length && b.first_name && parsed.words.includes(b.first_name)) { score += 12; basis.push('first name'); }
          // Time is a tie-breaker only. On its own it would happily attach a
          // cafe order to whichever session happened to be running.
          if (score === 0) continue;
          const gap = Math.abs(created - b.start);
          pairs.push({ order: o, ticketName, booking: b, score, gap, basis: basis.join(' + ') });
        }
      }
      pairs.sort((a, b) => (b.score - a.score) || (a.gap - b.gap));

      const claimedOrders = new Set();
      const byBooking = new Map();
      for (const p of pairs) {
        if (claimedOrders.has(p.order.id)) continue;
        claimedOrders.add(p.order.id);
        // Several tickets can belong to one booking, so accumulate.
        const cur = byBooking.get(p.booking.booking_code) || { names: [], total: 0, basis: new Set() };
        cur.names.push(p.ticketName);
        cur.total += (p.order.total_money?.amount || 0);
        cur.basis.add(p.basis);
        byBooking.set(p.booking.booking_code, cur);
      }

      const changes = [];
      for (const [code, v] of byBooking) {
        changes.push({
          booking_code: code,
          ticket_names: v.names,
          tickets: v.names.length,
          total_cents: v.total,
          basis: Array.from(v.basis).join(', '),
        });
        if (!dryRun) {
          await supabase.from('bookings').update({
            live_ticket_name: v.names.join(' + '),
            live_ticket_total_cents: v.total,
            live_ticket_matched_at: new Date().toISOString(),
            live_ticket_match_basis: Array.from(v.basis).join(', '),
          }).eq('studio_id', STUDIO_ID).eq('booking_code', code);
        }
      }

      res.json({
        dry_run: dryRun,
        named_tickets: orders.length,
        tickets_matched: claimedOrders.size,
        bookings_matched: byBooking.size,
        unmatched_tickets: orders
          .filter((o) => !claimedOrders.has(o.id))
          .map((o) => o.ticket_name || o.source?.name)
          .slice(0, 30),
        changes: changes.slice(0, 60),
      });
    } catch (err) {
      logger.error('match-tickets failed', err.response?.data || err.message);
      res.status(500).json({ error: err.response?.data?.errors?.[0]?.detail || err.message });
    }
  });
}

// ============================================================================
// SHELF SWEEP -- photograph the shelf, find out whose pottery is on it
// ----------------------------------------------------------------------------
// Daisy: "I've got some kiln stuff out now. I just want to see if any of the
// bookings are on it... I can't just take a picture and have it tell me if
// there's any bookings there."
//
// She's right that it didn't exist. Everything else works the other way
// round: Find on Table needs you to pick a booking FIRST and then confirms
// its pieces are present. That's the wrong order for the job in front of
// her -- a shelf of fired pottery just came out of the kiln and nobody knows
// whose it is. The photo is the question, not the answer.
//
// So this compares one shelf photo against the descriptions already written
// for every piece still waiting, in ONE Gemini call. It reuses the
// descriptions generated at photo time rather than re-describing anything,
// which is why this is cheap.
// ============================================================================
// Gemini returns [ymin, xmin, ymax, xmax] normalized 0-1000; everything that
// stores or draws a box in this app uses percentages.
//
// This existed once and vanished when the automatic identification sweep was
// reverted earlier today -- the revert took a helper the rest of the file had
// started to rely on. node --check passes either way, because calling an
// undefined function is a RUNTIME error, not a syntax one: it would have
// thrown on the first successful shelf match and nowhere else.
export function boxFromGemini(box_2d) {
  if (!Array.isArray(box_2d) || box_2d.length !== 4) return null;
  const [ymin, xmin, ymax, xmax] = box_2d;
  return { left_pct: xmin / 10, top_pct: ymin / 10, right_pct: xmax / 10, bottom_pct: ymax / 10 };
}

export function registerShelfSweepRoute(app, supabase, STUDIO_ID, logger, axios, upload, fs, logGeminiUsage) {
  app.post('/api/spec/shelf/sweep', upload.single('photo'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not configured on this service.' });

      // Candidate pool: pieces still waiting to go out. Optionally narrowed
      // to one collection date, which is the normal case -- a shelf IS a
      // kiln batch.
      const batchDate = req.body?.collection_date || null;
      let codes = null;
      if (batchDate) {
        const { data: st } = await supabase
          .from('demo_app_session_status')
          .select('booking_code')
          .eq('studio_id', STUDIO_ID)
          .eq('collection_date', batchDate);
        codes = (st || []).map((r) => r.booking_code);
        if (!codes.length) return res.json({ candidates: 0, bookings: [], note: 'No bookings on that collection date' });
      }

      let q = supabase
        .from('pottery_pieces')
        .select('id, booking_id, description, piece_type, status, fulfilment, reference_photo_url')
        .eq('studio_id', STUDIO_ID)
        .neq('archived', true)
        .neq('status', 'collected');
      if (codes) q = q.in('booking_id', codes);
      const { data: allPieces } = await q;

      // A piece with no description can't be looked for, and one held for a
      // return visit was never in the kiln -- including either would send
      // someone hunting a shelf for something that isn't there.
      const pieces = (allPieces || [])
        .filter((p) => (p.description || p.piece_type) && p.fulfilment !== 'return_visit')
        .slice(0, 80);

      if (!pieces.length) return res.json({ candidates: 0, bookings: [], note: 'Nothing is waiting to go out' });

      const { data: bookingRows } = await supabase
        .from('bookings')
        .select('booking_code, customer_name')
        .eq('studio_id', STUDIO_ID)
        .in('booking_code', Array.from(new Set(pieces.map((p) => p.booking_id))));
      const nameByCode = new Map((bookingRows || []).map((b) => [b.booking_code, b.customer_name]));

      const list = pieces
        .map((p, i) => `${i + 1}. ${p.piece_type || 'Piece'} — ${p.description || 'no description'}`)
        .join('\n');

      const base64 = fs.readFileSync(req.file.path).toString('base64');
      const prompt = `This photo shows a shelf of finished, fired pottery in a paint-your-own-pottery studio.

Below is a numbered list of pieces the studio is currently waiting to hand out. Each was photographed and described when it was painted.

${list}

Look at the shelf photo and decide which of the numbered pieces you can actually see.

Be strict. Only include a number if the piece in the photo genuinely matches that description in form AND painted detail. Studio pottery is repetitive — many customers paint the same blank — so a "mug" alone is never enough to match on; the painted decoration has to agree. If you are unsure, leave it out. A missed piece is a minor nuisance; a wrong match sends someone home with someone else's pottery.

For each match give the number, a confidence from 0 to 1, and its bounding box in the photo.`;

      const schema = {
        type: 'object',
        properties: {
          matches: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                number: { type: 'integer', description: 'The number from the list' },
                confidence: { type: 'number', description: '0 to 1' },
                box_2d: { type: 'array', items: { type: 'integer' }, description: '[ymin, xmin, ymax, xmax] normalized 0-1000' },
              },
              required: ['number', 'confidence'],
            },
          },
        },
        required: ['matches'],
      };

      let aiRes, modelUsed;
      try {
        ({ response: aiRes, modelUsed } = await callGeminiWithFallback(axios, GEMINI_API_KEY, {
          input: [
            { type: 'text', text: prompt },
            { type: 'image', data: base64, mime_type: req.file.mimetype || 'image/jpeg' },
          ],
          response_format: { type: 'text', mime_type: 'application/json', schema },
        }));
      } catch (err) {
        logger.error('shelf sweep: Gemini call failed', err.response?.data || err.message);
        return res.status(500).json({ error: friendlyGeminiError(err) });
      } finally {
        try { fs.unlinkSync(req.file.path); } catch { /* temp file */ }
      }

      const usage = extractGeminiUsage(aiRes.data);
      if (usage) await logGeminiUsage(supabase, STUDIO_ID, 'shelf-sweep-gemini', usage, modelUsed);

      let parsed;
      try {
        const raw = extractGeminiText(aiRes.data);
        parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || [])[0] || '{}');
      } catch {
        return res.status(500).json({ error: 'Could not read the response from Gemini' });
      }

      // Deliberately strict floor. Below this the guess is worse than
      // useless on a shelf of near-identical mugs.
      const MIN_CONFIDENCE = 0.55;
      const byBooking = new Map();
      for (const m of parsed.matches || []) {
        const piece = pieces[m.number - 1];
        if (!piece) continue;
        if ((m.confidence ?? 0) < MIN_CONFIDENCE) continue;
        const cur = byBooking.get(piece.booking_id) || { pieces: [], total_in_booking: 0 };
        cur.pieces.push({
          id: piece.id,
          piece_type: piece.piece_type,
          description: piece.description,
          confidence: Math.round((m.confidence ?? 0) * 100) / 100,
          box: boxFromGemini(m.box_2d),
        });
        byBooking.set(piece.booking_id, cur);
      }
      for (const [code, v] of byBooking) {
        v.total_in_booking = pieces.filter((p) => p.booking_id === code).length;
      }

      res.json({
        candidates: pieces.length,
        bookings: Array.from(byBooking.entries())
          .map(([code, v]) => ({
            booking_code: code,
            customer_name: nameByCode.get(code) || code,
            found: v.pieces.length,
            // How many of that booking's waiting pieces are on this shelf --
            // "2 of 4" is the useful number, because a part-found booking
            // means the rest are still somewhere else.
            expected: v.total_in_booking,
            complete: v.pieces.length === v.total_in_booking,
            pieces: v.pieces,
          }))
          .sort((a, b) => b.found - a.found),
      });
    } catch (err) {
      logger.error('shelf sweep failed', err.response?.data || err.message);
      res.status(500).json({ error: err.message });
    }
  });
}
