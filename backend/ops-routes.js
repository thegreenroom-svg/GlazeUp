// [9 Oct] OPS: knowing it works, and the screens that run the day.
//
// Daisy, after two lists of ideas (testing, and the app): "Do all."
//
//  - NIGHTLY REPORT CARD: what happened today, checked against the bills.
//  - MISSING-PHOTO ALERT: at 15:45 on open days, tables that finished with
//    no photo, or no iPad photos at all.
//  - TEST SET: shape recognition scored against pieces we know the answer
//    to, so a change can be measured before it is trusted.
//  - IPAD PING: the Shortcut says "I ran" even when there was nothing to
//    send, so a quiet iPad and a broken one can be told apart.
//  - QUICK CHECK: today's guessed shapes, one tap each to confirm.
//  - KILN PLAN: what still has to be fired for each collection date.
//  - OVERDUE: who is past their collection date, with how to reach them.
//  - READY EMAILS: once everything of a booking is out of the kiln, the
//    customer is told -- only while customer emails are switched on.
//
// Everything here reads Square-derived rows already in our database. Nothing
// is written to Square.

const GBP_PER_USD = 0.79;

const londonDay = (d = new Date()) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
// Midnight-to-midnight in London for a YYYY-MM-DD, as UTC ISO strings.
function dayBounds(day) {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = (t) => {
    const london = new Date(new Date(t).toLocaleString('en-US', { timeZone: 'Europe/London' })).getTime();
    const utc = new Date(new Date(t).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    return london - utc;
  };
  const start = guess - offset(guess);
  const end = start + 24 * 3600 * 1000;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}

const isWheel = (b) => (typeof b.wheel === 'boolean' ? b.wheel : /wheel|throwing/i.test(b.space_name || ''));
const isReal = (b) => b.booking_type !== 'test' && !/cancel/i.test(b.status || '');
const OPEN_DAYS = new Set([0, 3, 4, 5, 6]); // Sun, Wed-Sat (Daisy: open Wednesday to Sunday)

export function registerOpsRoutes(app, supabase, STUDIO_ID, logger, deps = {}) {
  const { sendCollectionEmail, customerEmailState, heartbeat } = deps;

  async function studioCollectionDate() {
    const { data } = await supabase.from('studios').select('current_collection_date').eq('id', STUDIO_ID).maybeSingle();
    return data?.current_collection_date || null;
  }
  async function statusDates(codes) {
    const out = {};
    for (let i = 0; i < codes.length; i += 200) {
      const { data } = await supabase.from('demo_app_session_status').select('booking_code, collection_date')
        .eq('studio_id', STUDIO_ID).in('booking_code', codes.slice(i, i + 200));
      (data || []).forEach((s) => { if (s.collection_date) out[s.booking_code] = s.collection_date; });
    }
    return out;
  }
  async function piecesFor(codes, cols) {
    const out = [];
    for (let i = 0; i < codes.length; i += 200) {
      const { data } = await supabase.from('pottery_pieces').select(cols)
        .eq('studio_id', STUDIO_ID).not('archived', 'is', true).in('booking_id', codes.slice(i, i + 200));
      out.push(...(data || []));
    }
    return out;
  }
  async function catalogPrices(ids) {
    const out = {};
    const list = [...new Set(ids.filter(Boolean))];
    for (let i = 0; i < list.length; i += 200) {
      const { data } = await supabase.from('piece_catalogue').select('square_item_id, name, price_cents, price_min_cents')
        .eq('studio_id', STUDIO_ID).in('square_item_id', list.slice(i, i + 200));
      (data || []).forEach((c) => { out[c.square_item_id] = c; });
    }
    return out;
  }

  // ---- NIGHTLY REPORT CARD ---------------------------------------------
  async function report(day) {
    const { start, end } = dayBounds(day);
    const { data: bk } = await supabase.from('bookings')
      .select('booking_code, customer_name, session_start, session_end, space_name, wheel, status, booking_type, till_pottery, party_size')
      .eq('studio_id', STUDIO_ID).gte('session_start', start).lt('session_start', end);
    const bookings = (bk || []).filter(isReal);
    const painting = bookings.filter((b) => !isWheel(b) && b.status !== 'no_show');
    const codes = bookings.map((b) => b.booking_code);
    const pieces = codes.length ? await piecesFor(codes, 'id, booking_id, reference_photo_url, square_item_id, shape_confirmed, shape_confirmed_by, shape_confidence') : [];
    const byBooking = new Map();
    pieces.forEach((p) => { if (!byBooking.has(p.booking_id)) byBooking.set(p.booking_id, []); byBooking.get(p.booking_id).push(p); });
    const photographed = painting.filter((b) => (byBooking.get(b.booking_code) || []).some((p) => p.reference_photo_url));
    const noPhoto = painting.filter((b) => !photographed.includes(b));
    const short = photographed.filter((b) => (b.party_size || 0) > (byBooking.get(b.booking_code) || []).length);

    const prices = await catalogPrices(pieces.map((p) => p.square_item_id));
    let confirmedByPerson = 0, confirmedByTill = 0, guesses = 0, unknown = 0, handmade = 0, valueCents = 0, billCents = 0;
    for (const b of bookings) {
      const bill = new Map();
      (Array.isArray(b.till_pottery) ? b.till_pottery : []).forEach((r) => {
        if (!r?.square_item_id) return;
        const a = bill.get(r.square_item_id) || [];
        for (let i = 0; i < (r.qty || 1); i++) a.push(r.cents || 0);
        bill.set(r.square_item_id, a);
      });
      for (const p of byBooking.get(b.booking_code) || []) {
        if (!p.square_item_id) { if (p.shape_confirmed) handmade++; else unknown++; continue; }
        const charged = bill.get(p.square_item_id)?.shift();
        if (charged) { billCents += charged; valueCents += charged; } else {
          const c = prices[p.square_item_id];
          valueCents += c?.price_min_cents || c?.price_cents || 0;
        }
        if (p.shape_confirmed && p.shape_confirmed_by === 'till') confirmedByTill++;
        else if (p.shape_confirmed) confirmedByPerson++;
        else guesses++;
      }
    }
    const { data: oc } = await supabase.from('shape_outcomes').select('correct, confirmed_by')
      .eq('studio_id', STUDIO_ID).gte('created_at', start).lt('created_at', end);
    const scored = (oc || []).filter((o) => o.correct !== null);
    const { data: usage } = await supabase.from('ai_usage').select('cost_usd')
      .eq('studio_id', STUDIO_ID).gte('created_at', start).lt('created_at', end);
    const aiGbp = (usage || []).reduce((s, r) => s + Number(r.cost_usd || 0), 0) * GBP_PER_USD;
    const { count: photosIn } = await supabase.from('backfill_photos').select('id', { count: 'exact', head: true })
      .eq('studio_id', STUDIO_ID).gte('created_at', start).lt('created_at', end);

    return {
      day,
      bookings: bookings.length,
      painting_tables: painting.length,
      wheel: bookings.filter(isWheel).length,
      photographed: photographed.length,
      no_photo: noPhoto.map((b) => b.customer_name),
      fewer_pieces_than_seats: short.map((b) => b.customer_name),
      photos_received: photosIn || 0,
      pieces: pieces.length,
      confirmed_by_till: confirmedByTill,
      confirmed_by_person: confirmedByPerson,
      guesses,
      unknown,
      handmade,
      pottery_value_gbp: Math.round(valueCents) / 100,
      of_which_from_bills_gbp: Math.round(billCents) / 100,
      ai_checked: scored.length,
      ai_right: scored.filter((o) => o.correct).length,
      ai_cost_gbp: Math.round(aiGbp * 100) / 100,
    };
  }
  const reportText = (r) => [
    `GlazeUp, ${r.day}`,
    `${r.photographed} of ${r.painting_tables} painting tables photographed${r.wheel ? `, ${r.wheel} wheel` : ''}.`,
    r.no_photo.length ? `No photo: ${r.no_photo.join(', ')}.` : 'Every painting table has a photo.',
    r.fewer_pieces_than_seats.length ? `Fewer pieces than seats: ${r.fewer_pieces_than_seats.join(', ')}.` : '',
    `${r.pieces} pieces: ${r.confirmed_by_till} confirmed by the till, ${r.confirmed_by_person} by staff, ${r.guesses} guesses, ${r.unknown} unknown.`,
    r.ai_checked ? `Recognition checked ${r.ai_checked} times today, right ${r.ai_right}.` : '',
    `Pottery about £${r.pottery_value_gbp.toFixed(2)} (£${r.of_which_from_bills_gbp.toFixed(2)} from bills). AI cost £${r.ai_cost_gbp.toFixed(2)}.`,
  ].filter(Boolean).join('\n');

  // Owner's own address, set in Render as REPORT_EMAIL. Never a customer.
  async function emailOwner(subject, text) {
    const to = process.env.REPORT_EMAIL, key = process.env.RESEND_API_KEY;
    if (!to || !key) return { sent: false, reason: !to ? 'no REPORT_EMAIL' : 'no RESEND_API_KEY' };
    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: process.env.FROM_EMAIL || 'GlazeUp <onboarding@resend.dev>', to: [to], subject, text }),
      });
      return { sent: r.ok, status: r.status };
    } catch (e) { return { sent: false, reason: e.message }; }
  }

  app.get('/api/spec/report/daily', async (req, res) => {
    try { res.json(await report(String(req.query.day || londonDay()))); }
    catch (err) { logger.error('[report] failed', err.message); res.status(500).json({ error: err.message }); }
  });
  app.post('/api/spec/report/daily/run', async (req, res) => {
    try {
      const day = String(req.body?.day || londonDay());
      const r = await report(day);
      await supabase.from('daily_reports').upsert({ studio_id: STUDIO_ID, day, report: r, created_at: new Date().toISOString() }, { onConflict: 'studio_id,day' });
      const email = r.bookings ? await emailOwner(`GlazeUp report ${day}`, reportText(r)) : { sent: false, reason: 'no bookings' };
      res.json({ ...r, email });
    } catch (err) { logger.error('[report] run failed', err.message); res.status(500).json({ error: err.message }); }
  });
  app.get('/api/spec/report/recent', async (req, res) => {
    try {
      const { data } = await supabase.from('daily_reports').select('day, report')
        .eq('studio_id', STUDIO_ID).order('day', { ascending: false }).limit(14);
      res.json({ reports: (data || []).map((r) => r.report) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ---- MISSING-PHOTO ALERT ---------------------------------------------
  app.post('/api/spec/alerts/photos/run', async (req, res) => {
    try {
      const day = londonDay();
      const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
      if (!OPEN_DAYS.has(dow) && !req.body?.force) return res.json({ skipped: 'closed today' });
      // Scheduled every 15 minutes through the afternoon in UTC; acts from
      // 15:45 London time, whatever the clocks are doing.
      const hm = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false });
      if (hm < '15:45' && !req.body?.force) return res.json({ skipped: `not yet (${hm})` });
      const r = await report(day);
      const now = Date.now();
      const { start, end } = dayBounds(day);
      const { data: bk } = await supabase.from('bookings')
        .select('booking_code, customer_name, session_start, session_end, space_name, wheel, status, booking_type')
        .eq('studio_id', STUDIO_ID).gte('session_start', start).lt('session_start', end);
      const ended = (bk || []).filter(isReal).filter((b) => !isWheel(b) && b.status !== 'no_show')
        .filter((b) => (b.session_end ? new Date(b.session_end).getTime() : new Date(b.session_start).getTime() + 2 * 3600000) < now);
      const endedNames = new Set(ended.map((b) => b.customer_name));
      const missing = r.no_photo.filter((n) => endedNames.has(n));
      const alerts = [];
      if (ended.length && r.photos_received === 0) {
        alerts.push({ kind: 'no-ipad-photos', message: `No photos from the iPad today, with ${ended.length} painting table${ended.length === 1 ? '' : 's'} finished. Check the iPad is on and the Shortcut ran.` });
      } else if (missing.length) {
        alerts.push({ kind: 'missing-photos', message: `${missing.length} finished table${missing.length === 1 ? '' : 's'} with no photo: ${missing.join(', ')}.`, detail: { names: missing } });
      }
      for (const a of alerts) {
        const { data: had } = await supabase.from('ops_alerts').select('id, message, dismissed_at')
          .eq('studio_id', STUDIO_ID).eq('kind', a.kind).eq('day', day).maybeSingle();
        if (had && had.message === a.message) continue; // already said, and still true
        if (had) await supabase.from('ops_alerts').update({ message: a.message, detail: a.detail || null }).eq('id', had.id);
        else await supabase.from('ops_alerts').insert({ studio_id: STUDIO_ID, day, kind: a.kind, message: a.message, detail: a.detail || null });
        // Emailed once per day per kind; later changes update the banner only.
        if (!had) await emailOwner(`GlazeUp: ${a.kind === 'no-ipad-photos' ? 'no iPad photos today' : 'tables with no photo'}`, a.message);
      }
      res.json({ day, alerts });
    } catch (err) { logger.error('[alerts] failed', err.message); res.status(500).json({ error: err.message }); }
  });
  app.get('/api/spec/alerts', async (req, res) => {
    try {
      const since = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
      const { data } = await supabase.from('ops_alerts').select('id, kind, day, message, created_at')
        .eq('studio_id', STUDIO_ID).is('dismissed_at', null).gte('day', since).order('created_at', { ascending: false });
      res.json({ alerts: data || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  app.post('/api/spec/alerts/:id/dismiss', async (req, res) => {
    try {
      await supabase.from('ops_alerts').update({ dismissed_at: new Date().toISOString() }).eq('id', req.params.id).eq('studio_id', STUDIO_ID);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ---- IPAD PING --------------------------------------------------------
  // Same studio key as the photo upload. Add one "Get contents of URL"
  // step to the Shortcut that POSTs here, before the photo loop.
  app.post('/api/spec/ipad/ping', async (req, res) => {
    try {
      const { data } = await supabase.from('studio_markers').select('detail').eq('studio_id', STUDIO_ID).eq('key', 'ipad-ingest').maybeSingle();
      const token = data?.detail?.token;
      const sent = String(req.body?.token || req.query?.token || req.get('x-studio-key') || '');
      if (!token || sent !== token) return res.status(401).json({ error: 'Studio key missing or wrong.' });
      if (heartbeat) await heartbeat.ok('ipad-ping');
      res.json({ ok: true, at: new Date().toISOString() });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ---- QUICK CHECK ------------------------------------------------------
  // Guessed shapes (recognised, not settled) and unknown pieces, newest
  // first, with their options, for one-tap confirming.
  app.get('/api/spec/shapes/guesses', async (req, res) => {
    try {
      const days = Math.min(parseInt(req.query.days, 10) || 14, 60);
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data: ps } = await supabase.from('pottery_pieces')
        .select('id, booking_id, piece_type, description, square_item_id, shape_candidates, shape_confidence, created_at')
        .eq('studio_id', STUDIO_ID).not('archived', 'is', true).not('shape_confirmed', 'is', true)
        .not('reference_photo_url', 'is', null).not('photo_box', 'is', null)
        .gte('created_at', since).order('created_at', { ascending: false }).limit(120);
      const pieces = ps || [];
      const codes = [...new Set(pieces.map((p) => p.booking_id))];
      const names = {};
      for (let i = 0; i < codes.length; i += 200) {
        const { data: b } = await supabase.from('bookings').select('booking_code, customer_name, session_start, booking_type')
          .eq('studio_id', STUDIO_ID).in('booking_code', codes.slice(i, i + 200));
        (b || []).forEach((x) => { names[x.booking_code] = x; });
      }
      const ids = [];
      pieces.forEach((p) => { if (p.square_item_id) ids.push(p.square_item_id); (p.shape_candidates || []).forEach((c) => c?.square_item_id && ids.push(c.square_item_id)); });
      const cat = await catalogPrices(ids);
      const shape = (id, name) => (id ? { square_item_id: id, name: cat[id]?.name || name || 'Shape', price_cents: cat[id]?.price_cents || 0 } : null);
      res.json({
        pieces: pieces.filter((p) => names[p.booking_id] && names[p.booking_id].booking_type !== 'test').map((p) => {
          const guess = shape(p.square_item_id);
          const opts = (p.shape_candidates || []).map((c) => shape(c?.square_item_id, c?.name)).filter(Boolean)
            .filter((o) => !guess || o.square_item_id !== guess.square_item_id).slice(0, 5);
          return {
            id: p.id, booking_code: p.booking_id, customer_name: names[p.booking_id].customer_name,
            session_start: names[p.booking_id].session_start, piece_type: p.piece_type, description: p.description,
            guess, options: opts, confidence: p.shape_confidence,
          };
        }),
      });
    } catch (err) { logger.error('[quick-check] failed', err.message); res.status(500).json({ error: err.message }); }
  });

  // ---- KILN PLAN --------------------------------------------------------
  const stageOf = (p) => {
    if (p.status === 'collected') return 'collected';
    if (p.packed_at) return 'packed';
    if (p.returned_at) return 'returns';
    if (p.status === 'ready' || p.shelf_id) return 'fired';
    return 'to_fire';
  };
  app.get('/api/spec/kiln/plan', async (req, res) => {
    try {
      const studioDate = await studioCollectionDate();
      const since = new Date(Date.now() - 45 * 86400000).toISOString();
      const { data: bk } = await supabase.from('bookings')
        .select('booking_code, customer_name, session_start, collection_date, collected_at, booking_type, status, space_name, wheel')
        .eq('studio_id', STUDIO_ID).gte('session_start', since).is('collected_at', null);
      const bookings = (bk || []).filter(isReal);
      const codes = bookings.map((b) => b.booking_code);
      const sd = await statusDates(codes);
      const pieces = codes.length ? await piecesFor(codes, 'id, booking_id, status, shelf_id, packed_at, returned_at, piece_type') : [];
      const groups = new Map();
      for (const b of bookings) {
        const ps = pieces.filter((p) => p.booking_id === b.booking_code && stageOf(p) !== 'collected' && stageOf(p) !== 'returns');
        if (!ps.length) continue;
        const date = (sd[b.booking_code] || b.collection_date || (studioDate && b.session_start.slice(0, 10) < studioDate ? studioDate : null) || 'none').slice(0, 10);
        const g = groups.get(date) || { date, to_fire: 0, fired: 0, packed: 0, bookings: [] };
        const c = { to_fire: 0, fired: 0, packed: 0 };
        ps.forEach((p) => { c[stageOf(p)]++; });
        g.to_fire += c.to_fire; g.fired += c.fired; g.packed += c.packed;
        g.bookings.push({ booking_code: b.booking_code, customer_name: b.customer_name, session_start: b.session_start, ...c });
        groups.set(date, g);
      }
      const today = londonDay();
      const out = [...groups.values()].sort((a, b) => (a.date === 'none' ? 1 : b.date === 'none' ? -1 : a.date.localeCompare(b.date)))
        .map((g) => ({ ...g, days_left: g.date === 'none' ? null : Math.round((new Date(`${g.date}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000) }));
      res.json({ today, studio_collection_date: studioDate, groups: out });
    } catch (err) { logger.error('[kiln-plan] failed', err.message); res.status(500).json({ error: err.message }); }
  });

  // ---- KILN SHELVES BY COLLECTION DATE ---------------------------------
  // [10 Oct] Daisy: "there's got to be a section kiln... for Lucy or
  // whoever's packing the kilns and dip glazing... handwrite a date for
  // collection on the shelf that items to be dip glazed and fired next
  // for the collection date need to be placed on... always the option to
  // add new shelf and new collection dates if that booking says so."
  //
  // One shelf per collection date. Each carries the pieces that go on it
  // (with their photo, so they can be found on the painting racks), and
  // where that shelf is: filling, on the shelf, dipped and in the kiln,
  // out. Dates with nothing left to fire drop off; they belong to packing.
  // Empty shelves added by hand stay listed until they are used or past.
  app.get('/api/spec/kiln/shelves-by-date', async (req, res) => {
    try {
      const today = londonDay();
      const studioDate = await studioCollectionDate();
      const since = new Date(Date.now() - 45 * 86400000).toISOString();
      const { data: bk } = await supabase.from('bookings')
        .select('booking_code, customer_name, session_start, collection_date, collected_at, booking_type, status, collection_notes, fulfilment_method')
        .eq('studio_id', STUDIO_ID).gte('session_start', since).is('collected_at', null);
      const bookings = (bk || []).filter(isReal);
      const codes = bookings.map((b) => b.booking_code);
      const sd = await statusDates(codes);
      const pieces = codes.length
        ? await piecesFor(codes, 'id, booking_id, status, shelf_id, packed_at, returned_at, piece_type, description, reference_photo_url, photo_box, parts, left_out_at, left_out_in_kiln_at')
        : [];
      const { data: stages } = await supabase.from('collection_batches')
        .select('collection_date, shelved_at, dipped_at, into_kiln_at, out_of_kiln_at, moved_by, kilns, fire_program, plan_fire_date')
        .eq('studio_id', STUDIO_ID).gte('collection_date', new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10));
      const stageBy = new Map((stages || []).map((s) => [String(s.collection_date).slice(0, 10), s]));

      const groups = new Map();
      const groupFor = (date) => {
        if (!groups.has(date)) groups.set(date, { date, stage: stageBy.get(date) || null, to_fire: 0, fired: 0, packed: 0, left_out: 0, left_out_in_kiln: 0, bookings: [] });
        return groups.get(date);
      };
      for (const b of bookings) {
        const ps = pieces.filter((p) => p.booking_id === b.booking_code && p.status !== 'damaged' && !['collected', 'returns'].includes(stageOf(p)));
        if (!ps.length) continue;
        const date = (sd[b.booking_code] || b.collection_date || (studioDate && b.session_start.slice(0, 10) < studioDate ? studioDate : null) || 'none').slice(0, 10);
        const g = groupFor(date);
        const c = { to_fire: 0, fired: 0, packed: 0 };
        ps.forEach((p) => { c[stageOf(p)]++; });
        g.to_fire += c.to_fire; g.fired += c.fired; g.packed += c.packed;
        ps.forEach((p) => { if (p.left_out_at) { g.left_out++; if (p.left_out_in_kiln_at) g.left_out_in_kiln++; } });
        g.bookings.push({
          booking_code: b.booking_code, customer_name: b.customer_name, session_start: b.session_start,
          notes: b.collection_notes || null, postal: b.fulfilment_method === 'postal', ...c,
          pieces: ps.map((p) => ({
            id: p.id, piece_type: p.piece_type, description: p.description, parts: p.parts || 1,
            reference_photo_url: p.reference_photo_url, photo_box: p.photo_box || null,
            stage: p.left_out_at && stageOf(p) === 'to_fire' ? (p.left_out_in_kiln_at ? 'left_out_in_kiln' : 'left_out') : stageOf(p),
          })),
        });
      }
      // Shelves added by hand for a date nobody is on yet.
      for (const [date, s] of stageBy) {
        if (date >= today && !s.out_of_kiln_at && !groups.has(date)) groupFor(date);
      }
      const out = [...groups.values()]
        // A shelf is the kiln's business until it is out and nothing is
        // left to fire. After that it is packing's.
        .filter((g) => g.to_fire > 0 || !g.stage?.out_of_kiln_at)
        .filter((g) => g.to_fire > 0 || g.bookings.length === 0 || g.date === 'none' || g.date >= today)
        .map((g) => ({
          ...g,
          bookings: g.bookings.sort((a, b) => String(a.session_start).localeCompare(String(b.session_start))),
          days_left: g.date === 'none' ? null : Math.round((new Date(`${g.date}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000),
        }))
        .sort((a, b) => (a.date === 'none' ? 1 : b.date === 'none' ? -1 : a.date.localeCompare(b.date)));
      res.json({ today, shelves: out });
    } catch (err) { logger.error('[kiln-shelves] failed', err.message); res.status(500).json({ error: err.message }); }
  });

  // [10 Oct] Daisy: "two kilns were filled on that collection date, but
  // 8 pieces had to be left out because they were too tall... left on a
  // shelf." Pieces left out stay on their date's shelf with their own
  // dip-and-fire, and are not marked fired when the main load comes out.
  app.post('/api/spec/kiln/left-out', async (req, res) => {
    try {
      const ids = (Array.isArray(req.body?.piece_ids) ? req.body.piece_ids : []).map(String).slice(0, 300);
      const undo = req.body?.undo === true;
      if (!ids.length) return res.json({ ok: true, updated: 0 });
      const patch = undo ? { left_out_at: null, left_out_in_kiln_at: null } : { left_out_at: new Date().toISOString(), left_out_in_kiln_at: null };
      const { data, error } = await supabase.from('pottery_pieces').update(patch)
        .eq('studio_id', STUDIO_ID).in('id', ids).neq('status', 'collected').select('id');
      if (error) throw error;
      res.json({ ok: true, updated: (data || []).length });
    } catch (err) { logger.error('[kiln-left-out] failed', err.message); res.status(500).json({ error: err.message }); }
  });

  // The left-out pieces' own firing: into the kiln, then out (ready to
  // pack, like any other piece out of the kiln).
  app.post('/api/spec/kiln/leftovers', async (req, res) => {
    try {
      const ids = (Array.isArray(req.body?.piece_ids) ? req.body.piece_ids : []).map(String).slice(0, 300);
      const stage = String(req.body?.stage || '');
      const undo = req.body?.undo === true;
      if (!ids.length || !['kiln', 'out'].includes(stage)) return res.status(400).json({ error: 'piece_ids and stage (kiln or out) needed' });
      const now = new Date().toISOString();
      let q;
      if (stage === 'kiln') {
        q = supabase.from('pottery_pieces').update({ left_out_in_kiln_at: undo ? null : now })
          .eq('studio_id', STUDIO_ID).in('id', ids).not('left_out_at', 'is', null);
      } else {
        q = supabase.from('pottery_pieces').update({ status: 'ready', left_out_at: null, left_out_in_kiln_at: null, updated_at: now })
          .eq('studio_id', STUDIO_ID).in('id', ids).not('left_out_in_kiln_at', 'is', null).neq('status', 'collected');
      }
      const { data, error } = await q.select('id');
      if (error) throw error;
      res.json({ ok: true, updated: (data || []).length });
    } catch (err) { logger.error('[kiln-leftovers] failed', err.message); res.status(500).json({ error: err.message }); }
  });

  // ---- ONE BOOKING, EVERYTHING ABOUT IT --------------------------------
  // [11 Oct] Daisy: "one booking page that everything links to." A booking's
  // story was spread across the cards, the kiln shelves, packing, backfill
  // and the till links. This gathers it: who and when, every piece with its
  // photo, shape, price and where it is now, the table photos, the tickets
  // that paid for it, its kiln shelf, the iPad photos read for it, a dated
  // timeline, and the customer's other visits.
  app.get('/api/spec/bookings/:code/page', async (req, res) => {
    try {
      const code = String(req.params.code || '');
      const { data: b } = await supabase.from('bookings').select('*').eq('studio_id', STUDIO_ID).eq('booking_code', code).maybeSingle();
      if (!b) return res.status(404).json({ error: 'No booking with that code' });
      const { data: day } = await supabase.from('demo_app_session_status')
        .select('collection_date, finished_at, finished_by, payment_method, collection_method, split_bill_count')
        .eq('studio_id', STUDIO_ID).eq('booking_code', code).maybeSingle();
      const collectDate = String(day?.collection_date || b.collection_date || '').slice(0, 10) || null;

      const { data: ps } = await supabase.from('pottery_pieces')
        .select('id, piece_type, description, status, parts, parts_seen, reference_photo_url, reference_photo_taken_at, photo_box, square_item_id, shape_confidence, shape_confirmed, shape_confirmed_by, packed_at, returned_at, left_out_at, left_out_in_kiln_at, last_seen_at, last_seen_box_number, shelf_id, damaged, archived, notes, fulfilment, size_cm, created_at')
        .eq('studio_id', STUDIO_ID).eq('booking_id', code).order('created_at', { ascending: true });
      const pieces = (ps || []).filter((p) => !p.archived);
      const ids = [...new Set(pieces.map((p) => p.square_item_id).filter(Boolean))];
      const cat = await catalogPrices(ids);
      const stageName = (p) => {
        if (p.damaged || p.status === 'damaged') return 'damaged';
        if (p.status === 'collected') return b.collected_at ? 'collected' : 'packed';
        if (p.packed_at) return 'packed';
        if (p.returned_at) return 'returns shelf';
        if (p.left_out_at) return p.left_out_in_kiln_at ? 'left out, now in the kiln' : 'left out, on the shelf';
        if (p.status === 'ready' || p.shelf_id) return 'out of the kiln';
        return 'waiting for the kiln';
      };
      const piecesOut = pieces.map((p) => {
        const handmade = p.shape_confirmed && !p.square_item_id;
        return {
          id: p.id, piece_type: p.piece_type, description: p.description, parts: p.parts || 1, parts_seen: p.parts_seen || 0,
          photo: p.reference_photo_url, box: p.photo_box || null, taken_at: p.reference_photo_taken_at,
          shape: p.square_item_id ? (cat[p.square_item_id]?.name || 'Shape') : handmade ? 'Handmade' : null,
          price_cents: p.square_item_id ? (cat[p.square_item_id]?.price_cents || 0) : 0,
          shape_sure: !!p.shape_confirmed, shape_how: p.shape_confirmed_by || p.shape_confidence || null,
          stage: stageName(p), box_number: p.last_seen_box_number || null, notes: p.notes || null, size_cm: p.size_cm || null,
          postal: p.fulfilment === 'post',
        };
      });
      const photos = [...new Set(pieces.map((p) => p.reference_photo_url).filter(Boolean))].map((url) => ({
        url, taken_at: pieces.find((p) => p.reference_photo_url === url)?.reference_photo_taken_at || null,
        pieces: piecesOut.map((p, i) => ({ ...p, n: i + 1 })).filter((p) => p.photo === url),
      }));

      const { data: tickets } = await supabase.from('till_ticket_links')
        .select('order_id, ticket_name, order_created_at, state, total_cents, pottery, basis, manual')
        .eq('studio_id', STUDIO_ID).eq('booking_code', code).order('order_created_at', { ascending: true });

      let shelf = null;
      if (collectDate) {
        const { data: st } = await supabase.from('collection_batches')
          .select('collection_date, shelved_at, dipped_at, into_kiln_at, out_of_kiln_at, kilns, fire_program, plan_fire_date')
          .eq('studio_id', STUDIO_ID).eq('collection_date', collectDate).maybeSingle();
        shelf = st || { collection_date: collectDate };
      }

      const { data: shots } = await supabase.from('backfill_photos')
        .select('id, created_at, taken_at, status, tag_name, pieces_created, error_message')
        .eq('studio_id', STUDIO_ID).eq('booking_code', code).order('taken_at', { ascending: true });

      // Other visits: same email, or same name when there is no email.
      let others = [];
      {
        let q = supabase.from('bookings').select('booking_code, customer_name, session_start, status, collected_at, booking_type')
          .eq('studio_id', STUDIO_ID).neq('booking_code', code).order('session_start', { ascending: false }).limit(12);
        q = b.customer_email ? q.eq('customer_email', b.customer_email) : q.eq('customer_name', b.customer_name);
        const { data: o } = await q;
        others = (o || []).filter(isReal);
      }

      const tl = [];
      const add = (at, what, who) => { if (at) tl.push({ at, what, who: who || null }); };
      add(b.created_at, 'Booked');
      add(b.arrived_at, 'Arrived');
      const firstPhoto = pieces.map((p) => p.reference_photo_taken_at).filter(Boolean).sort()[0];
      add(firstPhoto, `Table photographed, ${pieces.length} piece${pieces.length === 1 ? '' : 's'}`);
      (tickets || []).forEach((t) => add(t.order_created_at, `Ticket opened: ${t.ticket_name || 'unnamed'}`));
      add(day?.finished_at, 'Session finished', day?.finished_by);
      if (shelf) {
        add(shelf.shelved_at, `On the ${collectDate} kiln shelf`);
        add(shelf.dipped_at, 'Dipped in glaze');
        add(shelf.into_kiln_at, `Into the kiln${shelf.kilns?.length ? ` (${shelf.kilns.join(' + ')})` : ''}`);
        add(shelf.out_of_kiln_at, 'Out of the kiln');
      }
      const packedAt = pieces.map((p) => p.packed_at).filter(Boolean).sort().pop();
      add(packedAt, 'Packed');
      add(b.ready_email_sent_at, 'Told it is ready (email)');
      add(b.collected_at, 'Collected');
      tl.sort((x, y) => String(x.at).localeCompare(String(y.at)));

      const today = londonDay();
      res.json({
        booking: {
          booking_code: b.booking_code, customer_name: b.customer_name, email: b.customer_email || null, phone: b.customer_phone || null,
          session_start: b.session_start, session_end: b.session_end, space: b.space_name || b.room || null, table: b.table_number || null,
          party_size: b.party_size || null, notes: b.notes || null, collection_notes: b.collection_notes || null,
          status: b.status || null, booking_type: b.booking_type || null, wheel: !!b.wheel, postal: b.fulfilment_method === 'postal',
          shipping: b.fulfilment_method === 'postal' ? [b.shipping_address_line1, b.shipping_address_line2, b.shipping_city, b.shipping_postcode].filter(Boolean).join(', ') : null,
          arrived_at: b.arrived_at, collected_at: b.collected_at, ready_email_sent_at: b.ready_email_sent_at,
          collection_date: collectDate,
          days_to_collect: collectDate ? Math.round((new Date(`${collectDate}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000) : null,
          paid_piece_count: b.paid_piece_count, paid_ticket_count: b.paid_ticket_count, payment: day?.payment_method || null,
        },
        pieces: piecesOut,
        photos,
        total_cents: piecesOut.reduce((t, p) => t + (p.price_cents || 0), 0),
        tickets: (tickets || []).map((t) => ({
          ticket_name: t.ticket_name, at: t.order_created_at, state: t.state, total_cents: t.total_cents || 0,
          pottery: t.pottery || [], basis: t.manual ? 'by hand' : t.basis,
        })),
        shelf,
        backfill: shots || [],
        timeline: tl,
        others,
      });
    } catch (err) { logger.error('[booking-page] failed', err.message); res.status(500).json({ error: err.message }); }
  });

  // [10 Oct] The day the technician plans to fire a shelf (null clears it).
  // Only that column is written, so the shelf's stages are untouched.
  app.post('/api/spec/kiln/plan-date', async (req, res) => {
    try {
      const date = String(req.body?.date || '').slice(0, 10);
      const plan = req.body?.plan_fire_date ? String(req.body.plan_fire_date).slice(0, 10) : null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (plan && !/^\d{4}-\d{2}-\d{2}$/.test(plan))) return res.status(400).json({ error: 'Dates like 2026-10-17' });
      const { error } = await supabase.from('collection_batches')
        .upsert({ studio_id: STUDIO_ID, collection_date: date, plan_fire_date: plan }, { onConflict: 'studio_id,collection_date' });
      if (error) throw error;
      res.json({ ok: true });
    } catch (err) { logger.error('[kiln-plan-date] failed', err.message); res.status(500).json({ error: err.message }); }
  });

  // A new, empty shelf for a collection date. Never touches the stages of
  // a date that already has a row.
  app.post('/api/spec/kiln/shelf-dates', async (req, res) => {
    try {
      const date = String(req.body?.date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Pick a date' });
      const { error } = await supabase.from('collection_batches')
        .upsert({ studio_id: STUDIO_ID, collection_date: date }, { onConflict: 'studio_id,collection_date', ignoreDuplicates: true });
      if (error) throw error;
      res.json({ ok: true, date });
    } catch (err) { logger.error('[kiln-shelf-date] failed', err.message); res.status(500).json({ error: err.message }); }
  });

  // ---- COLLECT, ON ONE SCREEN ------------------------------------------
  // [11 Oct] Daisy: merge Packing, Collection, Overdue and the returns
  // shelf into one Collect screen. Every booking still holding pottery,
  // sorted into where it stands: hand over (packed, due), to pack (out of
  // the kiln), still in the kiln process (with a warning when its date is
  // close), and how many are waiting on the returns shelf.
  app.get('/api/spec/collect/board', async (req, res) => {
    try {
      const today = londonDay();
      const since = new Date(Date.now() - 180 * 86400000).toISOString();
      const { data: bk } = await supabase.from('bookings')
        .select('booking_code, customer_name, customer_phone, session_start, collection_date, collected_at, booking_type, status, fulfilment_method')
        .eq('studio_id', STUDIO_ID).gte('session_start', since).is('collected_at', null);
      const bookings = (bk || []).filter(isReal);
      const codes = bookings.map((b) => b.booking_code);
      const pieces = codes.length ? await piecesFor(codes, 'id, booking_id, status, shelf_id, packed_at, returned_at, fulfilment, damaged, last_seen_box_number, reference_photo_url, photo_box') : [];
      const sd = await statusDates(codes);
      const daysTo = (d) => Math.round((new Date(`${d}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000);
      const handOver = [], toPack = [], inKiln = [];
      let returnsWaiting = 0;
      for (const b of bookings) {
        const all = pieces.filter((p) => p.booking_id === b.booking_code && p.status !== 'collected');
        returnsWaiting += all.filter((p) => p.returned_at || p.fulfilment === 'return_visit').length;
        const live = all.filter((p) => !p.returned_at && p.fulfilment !== 'return_visit' && !p.damaged && p.status !== 'damaged');
        if (!live.length) continue;
        const due = String(sd[b.booking_code] || b.collection_date || '').slice(0, 10) || null;
        const packed = live.filter((p) => p.packed_at).length;
        const out = live.filter((p) => p.packed_at || p.shelf_id || p.status === 'ready').length;
        const boxes = [...new Set(live.map((p) => p.last_seen_box_number).filter(Boolean))];
        const first = live.find((p) => p.reference_photo_url);
        const row = {
          booking_code: b.booking_code, customer_name: b.customer_name, phone: b.customer_phone || null,
          painted: b.session_start, due, days: due ? daysTo(due) : null,
          pieces: live.length, packed, out, boxes,
          postal: b.fulfilment_method === 'postal' || live.some((p) => p.fulfilment === 'post'),
          thumb: first ? { url: first.reference_photo_url, box: first.photo_box || null } : null,
        };
        if (packed === live.length) handOver.push(row);
        else if (out === live.length) toPack.push(row);
        else inKiln.push(row);
      }
      const byDue = (a, b) => String(a.due || '9999').localeCompare(String(b.due || '9999')) || String(a.painted || '').localeCompare(String(b.painted || ''));
      handOver.sort(byDue); toPack.sort(byDue); inKiln.sort(byDue);
      res.json({
        today,
        hand_over: handOver,
        to_pack: toPack,
        // Only the ones that need attention: due within two days (or past)
        // and not out of the kiln yet. The rest are just on their way.
        kiln_late: inKiln.filter((r) => r.days != null && r.days <= 2),
        in_kiln_count: inKiln.length,
        returns_waiting: returnsWaiting,
      });
    } catch (err) { logger.error('[collect-board] failed', err.message); res.status(500).json({ error: err.message }); }
  });

  // ---- NEEDS A LOOK: HOW MANY ------------------------------------------
  // [11 Oct] One list of things someone has to sort out. Counts only, cheap
  // enough for the menu badge; each section's own page has the detail.
  app.get('/api/spec/needs-a-look/counts', async (req, res) => {
    try {
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const [g, bf, other, settled, pc] = await Promise.all([
        supabase.from('pottery_pieces').select('id, booking_id', { count: 'exact' })
          .eq('studio_id', STUDIO_ID).not('archived', 'is', true).not('shape_confirmed', 'is', true)
          .not('reference_photo_url', 'is', null).not('photo_box', 'is', null).gte('created_at', since).limit(1),
        supabase.from('backfill_photos').select('id', { count: 'exact', head: true })
          .eq('studio_id', STUDIO_ID).in('status', ['unmatched', 'failed']),
        supabase.from('revenue_other_items').select('square_item_id').eq('studio_id', STUDIO_ID).eq('catalog_missing', true).limit(20000),
        supabase.from('square_category_overrides').select('square_item_id').eq('studio_id', STUDIO_ID).eq('guessed', false).limit(20000),
        supabase.from('bookings').select('booking_code, paid_piece_count').eq('studio_id', STUDIO_ID)
          .not('paid_piece_count', 'is', null).gt('paid_piece_count', 0).order('session_start', { ascending: false }).limit(400),
      ]);
      const done = new Set((settled.data || []).map((r) => r.square_item_id));
      const unknown = new Set((other.data || []).map((r) => r.square_item_id).filter((id) => id && !done.has(id))).size;
      let short = 0;
      const paid = pc.data || [];
      if (paid.length) {
        const found = new Map();
        const codes = paid.map((b) => b.booking_code);
        for (let i = 0; i < codes.length; i += 200) {
          const { data } = await supabase.from('pottery_pieces').select('booking_id').eq('studio_id', STUDIO_ID)
            .neq('archived', true).in('booking_id', codes.slice(i, i + 200));
          (data || []).forEach((p) => found.set(p.booking_id, (found.get(p.booking_id) || 0) + 1));
        }
        short = paid.filter((b) => (found.get(b.booking_code) || 0) < b.paid_piece_count).length;
      }
      const counts = { shapes: g.count || 0, backfill: bf.count || 0, unknown_items: unknown, short_pieces: short };
      res.json({ ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) });
    } catch (err) { logger.error('[needs-a-look] failed', err.message); res.status(500).json({ error: err.message }); }
  });

  // ---- OVERDUE ----------------------------------------------------------
  app.get('/api/spec/collections/overdue', async (req, res) => {
    try {
      const today = londonDay();
      const since = new Date(Date.now() - 180 * 86400000).toISOString();
      const { data: bk } = await supabase.from('bookings')
        .select('booking_code, customer_name, customer_email, customer_phone, session_start, collection_date, collected_at, booking_type, status, fulfilment_method')
        .eq('studio_id', STUDIO_ID).gte('session_start', since).is('collected_at', null);
      const bookings = (bk || []).filter(isReal);
      const sd = await statusDates(bookings.map((b) => b.booking_code));
      const due = bookings.map((b) => ({ ...b, due: (sd[b.booking_code] || b.collection_date || '').slice(0, 10) }))
        .filter((b) => b.due && b.due < today);
      const pieces = due.length ? await piecesFor(due.map((b) => b.booking_code), 'id, booking_id, status, shelf_id, packed_at, returned_at') : [];
      const out = due.map((b) => {
        const ps = pieces.filter((p) => p.booking_id === b.booking_code && p.status !== 'collected');
        return {
          booking_code: b.booking_code, customer_name: b.customer_name,
          email: b.customer_email || null, phone: b.customer_phone || null,
          painted: b.session_start, due: b.due, postal: b.fulfilment_method === 'postal',
          days_overdue: Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${b.due}T12:00:00Z`)) / 86400000),
          pieces: ps.length, on_shelf: ps.filter((p) => p.shelf_id).length, packed: ps.filter((p) => p.packed_at).length,
        };
      }).filter((b) => b.pieces > 0).sort((a, b) => b.days_overdue - a.days_overdue);
      res.json({ today, overdue: out });
    } catch (err) { logger.error('[overdue] failed', err.message); res.status(500).json({ error: err.message }); }
  });

  // ---- READY EMAILS -----------------------------------------------------
  // Every piece of a booking out of the kiln (on a shelf, ready or packed)
  // and the customer not told yet: tell them, once. Only while customer
  // emails are switched on (CUSTOMER_EMAILS_ENABLED=true and a Resend key);
  // otherwise this reports what it WOULD send and sends nothing.
  app.post('/api/spec/ready-emails/run', async (req, res) => {
    try {
      const state = customerEmailState ? customerEmailState() : { live: false };
      const since = new Date(Date.now() - 60 * 86400000).toISOString();
      const { data: bk } = await supabase.from('bookings')
        .select('booking_code, customer_name, customer_email, booking_type, status, collected_at, ready_email_sent_at, fulfilment_method')
        .eq('studio_id', STUDIO_ID).gte('session_start', since).is('collected_at', null).is('ready_email_sent_at', null)
        .not('customer_email', 'is', null);
      const bookings = (bk || []).filter(isReal).filter((b) => b.fulfilment_method !== 'postal');
      const codes = bookings.map((b) => b.booking_code);
      const pieces = codes.length ? await piecesFor(codes, 'booking_id, status, shelf_id, packed_at, returned_at, reference_photo_url, piece_type') : [];
      const sd = await statusDates(codes);
      const ready = bookings.filter((b) => {
        const ps = pieces.filter((p) => p.booking_id === b.booking_code && !p.returned_at);
        return ps.length && ps.every((p) => p.shelf_id || p.packed_at || p.status === 'ready');
      });
      const sent = [];
      if (state.live && sendCollectionEmail) {
        for (const b of ready.slice(0, 20)) {
          const ps = pieces.filter((p) => p.booking_id === b.booking_code);
          const photoUrls = [...new Set(ps.map((p) => p.reference_photo_url).filter((u) => u && u.startsWith('http')))].slice(0, 4);
          const r = await sendCollectionEmail({ to: b.customer_email, customerName: b.customer_name, collectionDate: sd[b.booking_code] || null, photoUrls, pieceCount: ps.length, logger });
          if (r?.sent) {
            await supabase.from('bookings').update({ ready_email_sent_at: new Date().toISOString() }).eq('studio_id', STUDIO_ID).eq('booking_code', b.booking_code);
            sent.push(b.customer_name);
          }
        }
      }
      res.json({ live: !!state.live, ready: ready.map((b) => b.customer_name), sent });
    } catch (err) { logger.error('[ready-emails] failed', err.message); res.status(500).json({ error: err.message }); }
  });

  // ---- TEST SET ----------------------------------------------------------
  // Pieces whose shape a person or the till has settled are the answer
  // key. Recognition is run on them fresh (nothing saved) and scored:
  // exact shape, right family (same shape, other size), or wrong.
  let benchRunning = false;
  app.post('/api/spec/shapes/benchmark', async (req, res) => {
    if (benchRunning) return res.json({ started: false, reason: 'already running' });
    const runner = app.locals.benchmarkShapes;
    if (!runner) return res.status(500).json({ error: 'recognition not loaded' });
    const n = Math.min(parseInt(req.body?.n, 10) || 30, 60);
    benchRunning = true;
    res.json({ started: true, pieces: n });
    try {
      const { data: gold } = await supabase.from('pottery_pieces')
        .select('id, booking_id, square_item_id, reference_photo_url, photo_box, piece_type, description, size_ref, size_rel, size_cm')
        .eq('studio_id', STUDIO_ID).eq('shape_confirmed', true).not('square_item_id', 'is', null)
        .not('reference_photo_url', 'is', null).not('photo_box', 'is', null)
        .order('updated_at', { ascending: false }).limit(n);
      const result = await runner(gold || []);
      await supabase.from('benchmark_runs').insert({
        studio_id: STUDIO_ID, pieces: result.pieces, exact: result.exact, family: result.family, none: result.none,
        detail: result.detail.slice(0, 60),
      });
      logger.info(`[benchmark] ${result.exact}/${result.pieces} exact, ${result.family} right family`);
    } catch (err) { logger.error('[benchmark] failed', err.message); }
    finally { benchRunning = false; }
  });
  app.get('/api/spec/shapes/benchmark', async (req, res) => {
    try {
      const { data } = await supabase.from('benchmark_runs').select('id, pieces, exact, family, none, created_at')
        .eq('studio_id', STUDIO_ID).order('created_at', { ascending: false }).limit(10);
      res.json({ running: benchRunning, runs: data || [] });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
}
