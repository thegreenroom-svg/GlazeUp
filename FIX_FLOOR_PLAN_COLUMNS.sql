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
