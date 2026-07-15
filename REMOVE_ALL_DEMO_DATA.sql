-- ═══════════════════════════════════════════════════════════════════
-- REMOVE_ALL_DEMO_DATA.sql — 15 July 2026
--
-- Per direct request: cut the demo out of the floor plan route entirely.
-- Studio fab8b2d2-27b5-47ec-8c56-268bbf821dc3 (The Kiln Cafe).
--
-- DATA ONLY. No code changes. Fully reversible — re-run demo_floor_seed.sql
-- and demo_workflow_seed.sql to put it all back for staff training.
--
-- There are TWO separate demo seeds and they mark rows DIFFERENTLY, which
-- is why this needs saying out loud:
--
--   demo_workflow_seed.sql  -> booking_code 'demo-booking-*', "(Demo)" in
--                              the customer name. The client DOES spot these
--                              and draws an amber "TRAINING — TAP TO CLEAR"
--                              pill on them.
--
--   demo_floor_seed.sql     -> booking_code 'DEMO-T1', 'DEMO-WI' etc, and
--                              customer names like "Women's Institute" and
--                              "Sophie's Hen Do" with NO marker at all.
--                              The client's check is
--                                /\(Demo\)/.test(customer_name) ||
--                                /^demo-booking-/.test(booking_code)
--                              and 'DEMO-WI' matches NEITHER. So these five
--                              render as REAL bookings, with no pill, and
--                              DELETE /api/bookings/:code/seed refuses them
--                              ("Only seeded demo bookings (demo-booking-*)
--                              can be cleared this way"). They cannot be
--                              removed from inside the app at all. Hence SQL.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. demo_floor_seed.sql — the five unmarked ones on the floor plan ──
DELETE FROM booking_flow_checks
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND booking_code IN ('DEMO-T1','DEMO-T4','DEMO-T5A','DEMO-WI','DEMO-HEN');

DELETE FROM table_session_items
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND booking_code IN ('DEMO-T1','DEMO-T4','DEMO-T5A','DEMO-WI','DEMO-HEN');

DELETE FROM bookings
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND booking_code IN ('DEMO-T1','DEMO-T4','DEMO-T5A','DEMO-WI','DEMO-HEN');

-- ── 2. demo_workflow_seed.sql — the marked ones (pieces first, FK order) ──
DELETE FROM pottery_pieces
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND booking_id IN (
     SELECT booking_code FROM bookings
      WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
        AND (booking_code LIKE 'demo-booking-%' OR customer_name LIKE '%(Demo)%'));

DELETE FROM bookings
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND (booking_code LIKE 'demo-booking-%' OR customer_name LIKE '%(Demo)%');

-- ── 3. The demo kiln batches — these drive the red overnight-check modal ──
DELETE FROM pottery_pieces
 WHERE kiln_session_id IN (
   SELECT id FROM kiln_sessions
    WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
      AND batch_code LIKE 'KILN-DEMO-%');

DELETE FROM kiln_sessions
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND batch_code LIKE 'KILN-DEMO-%';

-- ═══════════════════════════════════════════════════════════════════
-- VERIFY — every count should be 0. studio_tables is NOT touched:
-- the tables are your real furniture, only the fake customers go.
-- ═══════════════════════════════════════════════════════════════════
SELECT 'demo floor bookings' AS thing, COUNT(*) AS remaining FROM bookings
 WHERE studio_id='fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND booking_code LIKE 'DEMO-%'
UNION ALL SELECT 'demo workflow bookings', COUNT(*) FROM bookings
 WHERE studio_id='fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND (booking_code LIKE 'demo-booking-%' OR customer_name LIKE '%(Demo)%')
UNION ALL SELECT 'demo kiln batches', COUNT(*) FROM kiln_sessions
 WHERE studio_id='fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND batch_code LIKE 'KILN-DEMO-%'
UNION ALL SELECT 'real studio_tables (should NOT be 0)', COUNT(*) FROM studio_tables
 WHERE studio_id='fab8b2d2-27b5-47ec-8c56-268bbf821dc3';
