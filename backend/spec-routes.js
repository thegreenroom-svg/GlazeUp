// ============================================================================
// SPEC FEATURE ROUTES
// ----------------------------------------------------------------------------
// Implements the master handover spec's Phase 2 / Phase 3 feature set against
// the REAL existing schema (loyalty_transactions, customer_memory,
// kiln_sessions, pottery_pieces, community_posts, marketplace_designs,
// studio_tables) -- none of these tables are new; they already exist and hold
// real Kiln Cafe data.
//
// Mounted from server.js before the 404 handler.
// ============================================================================

// Spec Phase 2: "Piece status tracking: painting -> dip -> kiln -> fired -> pickup"
// The real pottery_pieces.status column already uses these values plus some
// legacy ones, so the ladder is defined here as the single source of truth.
const PIECE_LIFECYCLE = [
  'painting',
  'ready_for_dip',
  'dipped',
  'kiln_queue',
  'firing',
  'fired',
  'packed',
  'ready_for_pickup',
  'collected',
];

// Statuses that mean "on its way home" -- durable definition carried over from
// the real app. Never test status === 'fired' directly; pieces legitimately sit
// at other waiting statuses.
const DONE_STATUSES = ['packed', 'ready_for_pickup', 'collected', 'posted', 'picked_up'];

export default function registerSpecRoutes(app, supabase, STUDIO_ID, logger, JUNK_BOOKING_LABELS = []) {
  const isRealPiece = (p) => !p.booking_id || !JUNK_BOOKING_LABELS.includes(p.booking_id);
  // --------------------------------------------------------------------------
  // PIECE LIFECYCLE (spec Phase 2)
  // --------------------------------------------------------------------------

  // The lifecycle ladder itself, so the UI never hardcodes it.
  app.get('/api/spec/lifecycle', (req, res) => {
    res.json({ stages: PIECE_LIFECYCLE, done_statuses: DONE_STATUSES });
  });

  // Pieces grouped by lifecycle stage -- the spec's "staff dashboard: pieces
  // awaiting dip, current kiln status, pieces ready for pickup".
  app.get('/api/spec/pieces/by-stage', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('pottery_pieces')
        .select('id, booking_id, piece_type, status, mark_code, reference_photo_url, description, created_at, kiln_session_id, damaged, archived')
        .eq('studio_id', STUDIO_ID)
        .neq('archived', true)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      // Test-run pieces are not real customer work -- exclude them or the
      // lifecycle board fills with broccoli and traffic cones from engine
      // testing, which is what a real screenshot showed.
      const real = (data || []).filter(isRealPiece);

      const byStage = {};
      PIECE_LIFECYCLE.forEach((s) => { byStage[s] = []; });
      byStage.other = [];

      real.forEach((p) => {
        const s = (p.status || '').toLowerCase();
        if (byStage[s]) byStage[s].push(p);
        else byStage.other.push(p);
      });

      const counts = {};
      Object.keys(byStage).forEach((k) => { counts[k] = byStage[k].length; });

      res.json({ stages: PIECE_LIFECYCLE, by_stage: byStage, counts, total: real.length });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // KILN SESSIONS (spec Phase 2: create session, add pieces, fire, complete)
  // --------------------------------------------------------------------------

  app.get('/api/spec/kiln/sessions', async (req, res) => {
    try {
      const { data: sessions, error } = await supabase
        .from('kiln_sessions')
        .select('id, label, status, batch_code, fired_at, created_at, morning_check_result, misfire_notes')
        .eq('studio_id', STUDIO_ID)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      // Piece count per session, so the UI can show "Kiln A - 12 pieces".
      const ids = (sessions || []).map((s) => s.id);
      let countsBySession = {};
      if (ids.length) {
        const { data: pieces } = await supabase
          .from('pottery_pieces')
          .select('id, kiln_session_id')
          .eq('studio_id', STUDIO_ID)
          .in('kiln_session_id', ids);
        (pieces || []).forEach((p) => {
          countsBySession[p.kiln_session_id] = (countsBySession[p.kiln_session_id] || 0) + 1;
        });
      }

      res.json((sessions || []).map((s) => ({ ...s, piece_count: countsBySession[s.id] || 0 })));
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // Pieces in one firing session, plus its utilisation figure.
  app.get('/api/spec/kiln/sessions/:id/pieces', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('pottery_pieces')
        .select('id, booking_id, piece_type, status, mark_code, reference_photo_url, description')
        .eq('studio_id', STUDIO_ID)
        .eq('kiln_session_id', req.params.id);
      if (error) throw error;
      res.json({ pieces: data || [], count: (data || []).length });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // LOYALTY (spec section 13: engagement-based, NOT subscription)
  // --------------------------------------------------------------------------
  // Points come from real loyalty_transactions rows. Deliberately no way to
  // buy points and no monetary value attached -- the spec is explicit that
  // loyalty is earned through genuine engagement and that demo loyalty cards
  // are not financial instruments.

  app.get('/api/spec/loyalty', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('loyalty_transactions')
        .select('id, customer_id, booking_code, points_earned, points_spent, transaction_type, description, spend_cents, created_at')
        .eq('studio_id', STUDIO_ID)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;

      const rows = data || [];
      const earned = rows.reduce((s, r) => s + (r.points_earned || 0), 0);
      const spent = rows.reduce((s, r) => s + (r.points_spent || 0), 0);

      // Group by customer so the UI can show a leaderboard / balance list.
      const byCustomer = {};
      rows.forEach((r) => {
        const key = r.booking_code || r.customer_id || 'unknown';
        if (!byCustomer[key]) byCustomer[key] = { key, earned: 0, spent: 0, transactions: 0 };
        byCustomer[key].earned += r.points_earned || 0;
        byCustomer[key].spent += r.points_spent || 0;
        byCustomer[key].transactions += 1;
      });

      const balances = Object.values(byCustomer)
        .map((c) => ({ ...c, balance: c.earned - c.spent }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 50);

      // Earning rules are shown in the UI so staff can explain them.
      const rules = [
        { event: 'Visit', points: 10, note: 'Every booked session' },
        { event: 'Piece painted', points: 5, note: 'Per finished piece' },
        { event: 'Workshop', points: 25, note: 'Attending a workshop' },
        { event: 'Referral', points: 50, note: 'A friend books their first session' },
      ];

      res.json({
        totals: { earned, spent, balance: earned - spent, transactions: rows.length },
        balances,
        recent: rows.slice(0, 25),
        rules,
        basis: 'engagement',
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // CUSTOMER NOTIFICATIONS (spec Phase 2)
  // --------------------------------------------------------------------------
  // "Your pottery is in the kiln" / "Your pieces are done!". Derived live from
  // real piece status rather than stored, so nothing can go stale or fire twice.

  app.get('/api/spec/notifications', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('pottery_pieces')
        .select('id, booking_id, piece_type, status, updated_at')
        .eq('studio_id', STUDIO_ID)
        .neq('archived', true)
        .in('status', ['firing', 'fired', 'ready_for_pickup', 'packed'])
        .order('updated_at', { ascending: false })
        .limit(300);
      if (error) throw error;

      const byBooking = {};
      (data || []).filter(isRealPiece).forEach((p) => {
        const b = p.booking_id || 'unknown';
        if (!byBooking[b]) byBooking[b] = { booking: b, firing: 0, ready: 0, updated_at: p.updated_at };
        if (p.status === 'firing') byBooking[b].firing += 1;
        else byBooking[b].ready += 1;
      });

      const notifications = Object.values(byBooking).map((b) => {
        if (b.ready > 0) {
          return {
            booking: b.booking,
            type: 'ready',
            headline: `${b.ready} piece${b.ready === 1 ? '' : 's'} ready to collect`,
            message: `Good news -- your pottery is out of the kiln and waiting for you.`,
            updated_at: b.updated_at,
          };
        }
        return {
          booking: b.booking,
          type: 'firing',
          headline: `${b.firing} piece${b.firing === 1 ? '' : 's'} in the kiln`,
          message: `Your pottery is firing now. We'll let you know the moment it's ready.`,
          updated_at: b.updated_at,
        };
      });

      res.json({ notifications, count: notifications.length });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // ANALYTICS (spec Phase 2 + 3)
  // --------------------------------------------------------------------------
  // "Average pieces per booking", "kiln utilisation", "peak times".

  app.get('/api/spec/analytics', async (req, res) => {
    try {
      const [{ data: pieces }, { data: bookings }, { data: sessions }] = await Promise.all([
        supabase.from('pottery_pieces').select('id, booking_id, status, kiln_session_id, created_at').eq('studio_id', STUDIO_ID).neq('archived', true).limit(2000),
        supabase.from('bookings').select('id, session_start, party_size').eq('studio_id', STUDIO_ID).limit(1000),
        supabase.from('kiln_sessions').select('id, status').eq('studio_id', STUDIO_ID).limit(200),
      ]);

      const p = (pieces || []).filter(isRealPiece);
      const b = bookings || [];
      const s = sessions || [];

      // Pieces per booking.
      const bookingsWithPieces = new Set(p.map((x) => x.booking_id).filter(Boolean));
      const avgPiecesPerBooking = bookingsWithPieces.size
        ? p.length / bookingsWithPieces.size
        : 0;

      // Peak booking times by weekday and hour, from real session_start values.
      const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const byWeekday = {};
      const byHour = {};
      b.forEach((x) => {
        if (!x.session_start) return;
        const d = new Date(x.session_start);
        const wd = weekdayNames[d.getUTCDay()];
        byWeekday[wd] = (byWeekday[wd] || 0) + 1;
        const h = d.getUTCHours();
        byHour[h] = (byHour[h] || 0) + 1;
      });

      const busiestDay = Object.entries(byWeekday).sort((a, c) => c[1] - a[1])[0] || null;
      const busiestHour = Object.entries(byHour).sort((a, c) => c[1] - a[1])[0] || null;

      // Kiln utilisation: how many pieces actually made it into a session.
      const assigned = p.filter((x) => x.kiln_session_id).length;
      const utilisation = p.length ? (assigned / p.length) * 100 : 0;

      res.json({
        totals: {
          pieces: p.length,
          bookings: b.length,
          kiln_sessions: s.length,
          bookings_with_pieces: bookingsWithPieces.size,
        },
        avg_pieces_per_booking: Number(avgPiecesPerBooking.toFixed(2)),
        kiln_utilisation_pct: Number(utilisation.toFixed(1)),
        busiest_day: busiestDay ? { day: busiestDay[0], bookings: busiestDay[1] } : null,
        busiest_hour: busiestHour ? { hour: Number(busiestHour[0]), bookings: busiestHour[1] } : null,
        by_weekday: byWeekday,
        by_hour: byHour,
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // COMMUNITY (spec: share to studio feed, "Made by [FirstName]")
  // --------------------------------------------------------------------------
  // Only screened + public posts are returned. First name only, per the spec's
  // branding rule -- never a full customer name on a public feed.

  app.get('/api/spec/community', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('community_posts')
        .select('id, piece_type, photo_url, caption, customer_display_name, likes_count, created_at, is_featured, visibility, screening_status')
        .eq('studio_id', STUDIO_ID)
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;

      const safe = (data || [])
        .filter((p) => p.visibility !== 'private' && p.screening_status !== 'rejected')
        .map((p) => ({
          ...p,
          // "Made by Daisy" -- first name only.
          made_by: (p.customer_display_name || '').trim().split(/\s+/)[0] || 'A customer',
          customer_display_name: undefined,
        }));

      res.json({ posts: safe, count: safe.length });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // MARKETPLACE (spec Phase 4, schema already exists)
  // --------------------------------------------------------------------------

  app.get('/api/spec/marketplace', async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('marketplace_designs')
        .select('id, title, description, price_cents, download_count, customer_display_name, created_at')
        .eq('studio_id', STUDIO_ID)
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      res.json({ designs: data || [], count: (data || []).length });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  // --------------------------------------------------------------------------
  // STUDIO / WHITE-LABEL CONFIG (spec section 20: multi-studio SaaS)
  // --------------------------------------------------------------------------
  // Everything a white-label tenant needs to brand the app. studio_id is never
  // hardcoded in the client -- it comes from here.

  app.get('/api/spec/studio-config', async (req, res) => {
    try {
      const [{ data: studio }, { data: tables }, { data: team }] = await Promise.all([
        supabase.from('studios').select('*').eq('id', STUDIO_ID).maybeSingle(),
        supabase.from('studio_tables').select('id, name, room, capacity, sort_order').eq('studio_id', STUDIO_ID).order('sort_order'),
        supabase.from('staff_team').select('name, role').eq('studio_id', STUDIO_ID).limit(50),
      ]);

      const t = tables || [];
      res.json({
        studio: studio || null,
        tables: t,
        table_count: t.length,
        total_seats: t.reduce((s, x) => s + (x.capacity || 0), 0),
        team_size: (team || []).length,
        // Spec section 17: staff permission roles.
        roles: ['owner', 'manager', 'staff', 'artist', 'customer'],
      });
    } catch (err) {
      logger.error(err);
      res.status(500).json({ error: err.message });
    }
  });
}
