-- ═══════════════════════════════════════════════════════════════════
-- FIX_ALERT_PRIORITY.sql — 16 July 2026
-- Studio fab8b2d2-27b5-47ec-8c56-268bbf821dc3 (The Kiln Cafe)
--
-- WHY THIS EXISTS, honestly: on 16 July I added `priority` to the
-- staff_alerts insert so Daisy's to-do list could sort by urgency, and
-- did not check the column existed. It doesn't. `staff_alerts` has no
-- CREATE TABLE anywhere in this repo — it was made outside version
-- control, like kiln_sessions — and `priority` appears in no SQL file.
--
-- Without this file, EVERY alert insert fails with
--     column "priority" of relation "staff_alerts" does not exist
-- and that breaks not just the new "Tell Daisy" tiles but the existing
-- handoff alerts too. The whole messaging system, silently, at once.
--
-- This is the THIRD time this exact bug has appeared in two days:
--   bookings.status  — code read a column nobody created (cost a week)
--   staff_shifts     — I wrote SQL against a table that never existed
--   staff_alerts.priority — this
-- Caught before shipping only because the SQL was checked rather than
-- assumed. The lesson is not "be careful", it is: grep for the column
-- before writing to it. It takes four seconds.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── The column the code now writes to ──
-- 1 = act now (something is blocked, cooling, or a customer is waiting)
-- 2 = act soon (someone is waiting on you)
-- 3 = for information
-- Default 3, so any alert written by older code is filed as information
-- rather than screaming at the top of someone's list.
ALTER TABLE staff_alerts ADD COLUMN IF NOT EXISTS priority SMALLINT DEFAULT 3;
UPDATE staff_alerts SET priority = 3 WHERE priority IS NULL;

-- ── The index the to-do list sorts on ──
-- GET /api/staff/alerts now filters ?role= and orders by priority then
-- created_at. Without this it is a full scan of the day's alerts on every
-- bell tap — fine today with a handful, not fine in a year.
CREATE INDEX IF NOT EXISTS idx_staff_alerts_todo
  ON staff_alerts (studio_id, next_role, acknowledged, priority, created_at);

-- ═══════════════════════════════════════════════════════════════════
-- VERIFY — both should read ok
-- ═══════════════════════════════════════════════════════════════════
SELECT 'staff_alerts.priority' AS thing,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='staff_alerts' AND column_name='priority') THEN 'ok' ELSE 'MISSING' END AS present
UNION ALL SELECT 'to-do index',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes
    WHERE indexname='idx_staff_alerts_todo') THEN 'ok' ELSE 'MISSING' END;
