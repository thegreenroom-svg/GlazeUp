-- ═══════════════════════════════════════════════════════════════════
-- RUN_ALL_FOUR.sql — The Kiln Cafe — 15 July 2026
-- Supabase project mdpchpjnlzlmldtlqrns
--
-- All four of tonight's files, in order, in one paste.
-- Every statement is idempotent — safe to run more than once.
-- Nothing here touches a real booking or a real table.
--
-- ⚠️  TWO PLACES TO LOOK BEFORE YOU LEAP, both marked STOP AND READ:
--
--   • Section 2 renames tables called "1" and "10" to "Table 1" and
--     "Table 10" BEFORE inserting the confirmed set. Without that you
--     get two tiles for one real table.
--
--   • Section 4 corrects "Elliot" to "Elliott". If BOTH spellings
--     exist as separate rows, that is two people's shift history, not
--     a typo — stop and say so rather than running it.
--
-- Each section ends with its own verification SELECT. Supabase shows
-- the LAST result set, so if you want to read them all, run the
-- sections one at a time. Otherwise run the lot and check the final
-- table list at the bottom.
-- ═══════════════════════════════════════════════════════════════════



-- ═══════════════════════════════════════════════════════════════════
-- 1. COLUMNS — makes the floor plan load, and stops the kiln modal looping
-- (from FIX_FLOOR_PLAN_COLUMNS.sql)
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- FIX_FLOOR_PLAN_COLUMNS.sql — 15 July 2026
--
-- Run this in Supabase project mdpchpjnlzlmldtlqrns, after RUN_ALL_SIX.sql.
-- Safe to re-run: every statement is ADD COLUMN IF NOT EXISTS or a
-- guarded UPDATE. Nothing here drops or overwrites anything.
--
-- WHY: Render's logs, 15 July 2026, over and over:
--     /api/floor/active failed: column bookings.status does not exist
--     Error running morning kiln check: 42703 —
--       column kiln_sessions.morning_check_confirmed_at does not exist
--
-- This was NOT bookings.room (that theory was wrong, and RUN_ALL_SIX
-- already added room anyway). /api/floor/active selects
--   booking_code, customer_name, table_number, current_stage,
--   session_start, party_size, status, booking_type
-- and then filters .not('status','eq','cancelled'). `status` has never
-- existed: sql/integration-schema.sql never created it and no migration
-- in this repo ever added it. Every floor plan load has failed on it.
--
-- Found by diffing every bookings/kiln_sessions column the server code
-- reads against every column any SQL file in this repo creates, rather
-- than fixing the one column the error happened to name first and then
-- hitting the next one.
-- ═══════════════════════════════════════════════════════════════════

-- ── bookings.status — THE floor plan blocker ──
-- TEXT, not an enum: demo_floor_seed.sql already writes 'active', and
-- the only filter anywhere is `status <> 'cancelled'`.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
UPDATE bookings SET status = 'active' WHERE status IS NULL;

-- ── bookings.home_access_unlocked — also needed by code, created by nothing ──
-- Read at server.js:1759 and :6293, written at :1678. Would have been the
-- NEXT failure after status was fixed.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS home_access_unlocked BOOLEAN DEFAULT false;
UPDATE bookings SET home_access_unlocked = false WHERE home_access_unlocked IS NULL;

-- ── belt and braces ──
-- These ARE created by other files in this repo (booking_stage_tracking_schema.sql,
-- update_table_capacities.sql), but there is no record of those having been run
-- against this project. IF NOT EXISTS makes including them free.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'booking';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_type TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room TEXT;

-- ── kiln_sessions — the morning check cron, failing every 2 minutes ──
-- kiln_sessions has no CREATE TABLE anywhere in this repo, so it was made
-- outside it. Only the two genuinely missing columns are added here.
ALTER TABLE kiln_sessions ADD COLUMN IF NOT EXISTS morning_check_confirmed_at TIMESTAMPTZ;
ALTER TABLE kiln_sessions ADD COLUMN IF NOT EXISTS morning_check_confirmed_by TEXT;
-- Added after seeing the modal on a real device: confirm-fired-ok also writes
-- morning_check_result, and report-misfire writes misfire_notes. Missing either
-- makes the confirm fail, so the check can never be recorded — which is why the
-- overnight kiln modal reappears on every single load no matter what you tap.
ALTER TABLE kiln_sessions ADD COLUMN IF NOT EXISTS morning_check_result TEXT;
ALTER TABLE kiln_sessions ADD COLUMN IF NOT EXISTS misfire_notes TEXT;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFY — every row should read ✓
-- ═══════════════════════════════════════════════════════════════════
SELECT 'bookings.status' AS thing,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='status') THEN '✓' ELSE '✗ MISSING' END AS present
UNION ALL SELECT 'bookings.home_access_unlocked', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='home_access_unlocked') THEN '✓' ELSE '✗ MISSING' END
UNION ALL SELECT 'bookings.current_stage', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='current_stage') THEN '✓' ELSE '✗ MISSING' END
UNION ALL SELECT 'bookings.booking_type', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='booking_type') THEN '✓' ELSE '✗ MISSING' END
UNION ALL SELECT 'bookings.room', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='room') THEN '✓' ELSE '✗ MISSING' END
UNION ALL SELECT 'kiln_sessions.morning_check_confirmed_at', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kiln_sessions' AND column_name='morning_check_confirmed_at') THEN '✓' ELSE '✗ MISSING' END
UNION ALL SELECT 'kiln_sessions.morning_check_confirmed_by', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kiln_sessions' AND column_name='morning_check_confirmed_by') THEN '✓' ELSE '✗ MISSING' END
UNION ALL SELECT 'kiln_sessions.morning_check_result', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kiln_sessions' AND column_name='morning_check_result') THEN '✓' ELSE '✗ MISSING' END
UNION ALL SELECT 'kiln_sessions.misfire_notes', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='kiln_sessions' AND column_name='misfire_notes') THEN '✓' ELSE '✗ MISSING' END;


-- ═══════════════════════════════════════════════════════════════════
-- 2. TABLES — The Vault, and the missing Main Studio / Lounge tables
-- (from FIX_STUDIO_TABLES.sql)
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- FIX_STUDIO_TABLES.sql — 15 July 2026
-- Studio fab8b2d2-27b5-47ec-8c56-268bbf821dc3 (The Kiln Cafe)
--
-- Daisy: "there's only two areas. We need the lounge, the main studio,
-- and the vault. You've got all that detail."
--
-- She's right — it's been in the repo the whole time, in
-- seed_real_table_structure.sql, described there as "confirmed
-- directly": 8 Main Studio tables, 6 Lounge tables, and The Vault.
--
-- WHY IT NEVER RAN. That file is wrapped in:
--     IF NOT EXISTS (SELECT 1 FROM studio_tables WHERE studio_id = ...)
-- i.e. it only seeds a studio with ZERO tables. Three had already been
-- added by hand ("1", "10", "Table 5A"), so the guard blocked all
-- fifteen — silently, and forever. A safety rail that locked the gate.
--
-- The floor plan reads rooms straight from studio_tables, which is why
-- there is no Vault on screen: there is no Vault in the table.
--
-- This file is additive and re-runnable. It never deletes a table.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. LOOK FIRST. Run this on its own. ──
SELECT room, name, capacity, sort_order FROM studio_tables
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
 ORDER BY sort_order, name;

-- ── 2. Normalise the hand-typed names ──
-- The floor plan currently shows a table called "1" and one called "10".
-- The confirmed structure calls them "Table 1" and "Table 10". Without
-- this, step 3 would ADD a "Table 1" alongside the existing "1" and you
-- would have two tiles for one real table. This renames rather than
-- duplicates. Only touches names that are a bare number.
UPDATE studio_tables
   SET name = 'Table ' || name
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name ~ '^[0-9]+$';

-- ── 3. Add every confirmed table that is still missing ──
-- Per-row NOT EXISTS, so anything already there is left exactly alone,
-- including its capacity if staff have already adjusted it.
INSERT INTO studio_tables (studio_id, name, room, capacity, sort_order)
SELECT * FROM (VALUES
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 1',   'Main Studio',  4,  1),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 2',   'Main Studio',  4,  2),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 3',   'Main Studio',  4,  3),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 4',   'Main Studio',  4,  4),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 5',   'Main Studio',  4,  5),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 6',   'Main Studio',  4,  6),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 7',   'Main Studio',  4,  7),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 8',   'Main Studio',  4,  8),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 9',   'Lounge',       4,  9),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 10',  'Lounge',       4, 10),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 11',  'Lounge',       4, 11),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 12',  'Lounge',       4, 12),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 13',  'Lounge',       4, 13),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Table 14',  'Lounge',       4, 14),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'The Vault', 'The Vault',   14, 15)
) AS confirmed(studio_id, name, room, capacity, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM studio_tables st
   WHERE st.studio_id = confirmed.studio_id AND st.name = confirmed.name);

-- The Vault is 14, not the 12 in seed_real_table_structure.sql —
-- update_table_capacities.sql corrects it to 14 ("The Vault: up to 14
-- as one group"), and that file is the later, confirmed word. Applied
-- here so it is right on first insert rather than needing a second pass.

-- ── 4. Room names — the floor plan Title Cases these at grouping now,
--       so "Lounge"/"lounge" can no longer split into two rooms on
--       screen. Tidying the data anyway so exports and SQL agree with
--       what staff see.
UPDATE studio_tables
   SET room = 'Main Studio'
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND lower(trim(room)) = 'main studio';
UPDATE studio_tables
   SET room = 'Lounge'
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND lower(trim(room)) = 'lounge';
UPDATE studio_tables
   SET room = 'The Vault'
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND lower(trim(room)) IN ('the vault','vault');

-- ── VERIFY — expect Lounge (6), Main Studio (8+), The Vault (1) ──
SELECT room, COUNT(*) AS tables, SUM(capacity) AS seats
  FROM studio_tables
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
 GROUP BY room ORDER BY room;

SELECT room, name, capacity FROM studio_tables
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
 ORDER BY sort_order, name;


-- ═══════════════════════════════════════════════════════════════════
-- 3. DEMO — clears the WI, the hen do, the demo kiln batches
-- (from REMOVE_ALL_DEMO_DATA.sql)
-- ═══════════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════════
-- 4. PEOPLE — Elliott's spelling and access, and Cleo back in the team
-- (from FIX_ELLIOTT_SPELLING.sql)
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- FIX_ELLIOTT_SPELLING.sql — 15 July 2026
-- Studio fab8b2d2-27b5-47ec-8c56-268bbf821dc3 (The Kiln Cafe)
--
-- Elliott is a director. TWO t's. Daisy: "the Elliot with the one t is
-- still there... he doesn't exist."
--
-- WHY THIS MATTERS BEYOND TIDINESS: director access is a first-name
-- check, server-side, across six endpoints:
--     PLATFORM_REVENUE_ACCESS_NAMES.includes(firstName)   // 'elliott'
-- A staff_team row spelled "Elliot" does not match 'elliott', so he is
-- silently locked out of Platform Revenue AND /api/analytics/dashboard
-- — the takings figures — while appearing to be on the list. The list
-- and the row have to agree exactly. Same failure mode as the Dave /
-- David confusion, which sent the co-director to the barista page.
--
-- Safe to re-run. Look before you leap: run step 1 on its own first.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. LOOK FIRST. What is actually in there? ──
SELECT id, name, role, active FROM staff_team
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name ILIKE 'elliot%'
 ORDER BY name;

-- ── 2. Correct the spelling ──
-- Only touches a row that is genuinely one-t. If step 1 showed TWO rows
-- (an "Elliot" AND an "Elliott") stop here and tell Claude — that is a
-- duplicate person, not a typo, and merging shift history is not
-- something to guess at.
UPDATE staff_team
   SET name = 'Elliott'
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name = 'Elliot';

-- ── 3. Make sure he is a director and active ──
UPDATE staff_team
   SET role = 'Co-Director', active = true
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name = 'Elliott';

-- ── 4. Cleo — she vanished from the picker when the API started working ──
-- She is in the client's DEMO_STAFF fallback but not in the real
-- staff_team. While /api/staff/team-for-login was hanging, the picker
-- fell back to DEMO_STAFF and she appeared. Now the real team loads and
-- she does not. Nothing broke — the app got honest. This puts her in the
-- real team, with the same role the fallback gave her.
INSERT INTO staff_team (studio_id, name, role, active)
SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Cleo', 'Chief Taster', true
 WHERE NOT EXISTS (
   SELECT 1 FROM staff_team
    WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'Cleo');

-- ── VERIFY ──
SELECT name, role, active FROM staff_team
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND active = true
 ORDER BY name;


-- ═══════════════════════════════════════════════════════════════════
-- FINAL CHECK — this is the one that matters.
-- Expect: Lounge 6 tables, Main Studio 8+, The Vault 1 (14 seats).
-- ═══════════════════════════════════════════════════════════════════
SELECT room, COUNT(*) AS tables, SUM(capacity) AS seats
  FROM studio_tables
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
 GROUP BY room ORDER BY room;
