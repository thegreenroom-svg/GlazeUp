-- ═══════════════════════════════════════════════════════════
-- kilnLINK — FULL WORKFLOW DEMO SEED
-- Populates the whole pipeline so you can log in (as Jenny, or anyone)
-- and walk through every stage: painted & waiting, batch queued for
-- the kiln, batch fired and ready for packing/piece-matching.
--
-- Uses The Kiln Cafe's real studio ID. Genuinely safe to run — all
-- demo bookings/pieces are clearly named "(Demo)" so they're easy to
-- find and delete afterward if you want a clean slate again.
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
  v_studio_id UUID := 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3';
  v_booking_a UUID; -- "painted, waiting to be submitted for dip/kiln" group
  v_booking_b UUID; -- "queued, waiting to go through the kiln" group
  v_booking_c UUID; -- "fired, out of the kiln, ready for packing" group
  v_kiln_session_b UUID;
  v_kiln_session_c UUID;
  v_piece_id UUID;
BEGIN

  -- ── Booking A: 20 pieces already painted, waiting (not yet submitted) ──
  INSERT INTO bookings (studio_id, booking_code, customer_name, customer_email, table_number, session_start, session_end, party_size, notes)
  VALUES (v_studio_id, 'demo-booking-a', 'The Ramsey Family (Demo)', 'demo@example.com', 'Table 4', now() - interval '2 hours', now() - interval '30 minutes', 5, 'Large family group — 5 people, several pieces each')
  RETURNING id INTO v_booking_a;

  -- 20 painted pieces, still with staff/customer, not yet sent to dip/kiln
  FOR i IN 1..20 LOOP
    INSERT INTO pottery_pieces (studio_id, booking_id, piece_type, is_complete, outstanding_balance, status, notes)
    VALUES (
      v_studio_id, 'demo-booking-a',
      (ARRAY['Mug', 'Bowl', 'Small Vase', 'Animal Figurine', 'Plate', 'Trinket Box'])[1 + floor(random() * 6)::int],
      true, 0, 'ready_for_dip',
      'Demo piece ' || i
    );
  END LOOP;

  -- ── Booking B: a batch queued, waiting to go through the kiln ──
  INSERT INTO bookings (studio_id, booking_code, customer_name, customer_email, table_number, session_start, session_end, party_size)
  VALUES (v_studio_id, 'demo-booking-b', 'Priya Shah (Demo)', 'demo2@example.com', 'Table 2', now() - interval '1 day', now() - interval '1 day' + interval '90 minutes', 2)
  RETURNING id INTO v_booking_b;

  INSERT INTO kiln_sessions (studio_id, label, status, batch_code)
  VALUES (v_studio_id, 'Demo Firing — Queued', 'loading', 'KILN-DEMO-QUEUED')
  RETURNING id INTO v_kiln_session_b;

  FOR i IN 1..6 LOOP
    INSERT INTO pottery_pieces (studio_id, booking_id, piece_type, is_complete, outstanding_balance, status, kiln_session_id, notes)
    VALUES (
      v_studio_id, 'demo-booking-b',
      (ARRAY['Mug', 'Bowl', 'Coaster Set'])[1 + floor(random() * 3)::int],
      true, 0, 'dipped', v_kiln_session_b,
      'Demo piece — queued for kiln'
    );
  END LOOP;

  -- ── Booking C: fired, out of the kiln, ready for packing —
  -- this is the group to actually test Piece Matching / Whole-Tray Scan
  -- with. Deliberately seeded WITHOUT reference photos — for a genuine
  -- test at home with real objects (a wine bottle etc), the reference
  -- photos need to be real photos YOU take through the actual
  -- Completion step, not meaningless placeholder graphics. Go to
  -- Daily Bookings -> Completion -> Individual Piece Photos, select
  -- "Oakfield Primary School Group (Demo)", and photograph your own
  -- test objects there first — THEN the Piece Matching / Whole-Tray
  -- Scan test against them will be genuinely meaningful. ──
  INSERT INTO bookings (studio_id, booking_code, customer_name, customer_email, table_number, session_start, session_end, party_size)
  VALUES (v_studio_id, 'demo-booking-c', 'Oakfield Primary School Group (Demo)', 'demo3@example.com', 'The Vault', now() - interval '12 days', now() - interval '12 days' + interval '2 hours', 8)
  RETURNING id INTO v_booking_c;

  INSERT INTO kiln_sessions (studio_id, label, status, batch_code, fired_at)
  VALUES (v_studio_id, 'Demo Firing — Fired', 'fired', 'KILN-DEMO-FIRED', now() - interval '2 days')
  RETURNING id INTO v_kiln_session_c;

  FOR i IN 1..5 LOOP
    INSERT INTO pottery_pieces (studio_id, booking_id, piece_type, is_complete, outstanding_balance, status, kiln_session_id, notes)
    VALUES (
      v_studio_id, 'demo-booking-c',
      (ARRAY['Mug', 'Bowl', 'Small Vase', 'Animal Figurine', 'Plate'])[i],
      true, 0, 'fired', v_kiln_session_c,
      'Demo piece ' || i || ' — photograph this with a real object at home to give it a reference photo, then test matching'
    );
  END LOOP;

  RAISE NOTICE 'Demo pipeline seeded.';
  RAISE NOTICE 'Booking A (painted, waiting): demo-booking-a — 20 pieces';
  RAISE NOTICE 'Booking B (queued for kiln): demo-booking-b — 6 pieces, batch code KILN-DEMO-QUEUED';
  RAISE NOTICE 'Booking C (fired, ready for packing/matching): demo-booking-c — 5 pieces, NO reference photos yet';
  RAISE NOTICE 'To test matching: go to Completion -> Individual Piece Photos -> select demo-booking-c -> photograph 5 real objects (your wine bottle etc) as the reference photos -> THEN go to Piece Matching or Whole-Tray Scan and test against them for real.';

END $$;
