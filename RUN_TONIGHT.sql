-- ═══════════════════════════════════════════════════════════
-- RUN TONIGHT — everything from 14 July 2026, in one file.
--
-- ⚠️  RUN THIS IN PROJECT  mdpchpjnlzlmldtlqrns  (GlazeUp)
--     The last few attempts went into the wrong Supabase project.
--     Check the browser URL says /project/mdpchpjnlzlmldtlqrns/
--     BEFORE you press Run.
--
-- Safe to run more than once. Nothing here deletes anything.
-- The last statement tells you whether it all worked.
-- ═══════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────
-- 1. BOOKINGS NEED A ROOM
--
-- bookings.table_number is TEXT ("5A", "3") with no room beside
-- it. Main Studio and The Lounge both have a Table 1, 2, 3 and 4,
-- so a booking cannot say which room it is in, and the floor plan
-- was left guessing — Main Studio first. A wrong room is a member
-- of staff walking to the wrong table.
-- ─────────────────────────────────────────────────────────

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room TEXT;

-- Backfill ONLY what is unambiguous. 5A, 7 and 8 exist in Main
-- Studio alone. Tables 1-6 exist in BOTH rooms and are deliberately
-- left NULL — a null room is honest, a wrong room is not.
UPDATE bookings SET room = 'Main Studio'
  WHERE room IS NULL AND TRIM(table_number) IN ('5A', '7', '8');

UPDATE bookings SET room = 'The Vault'
  WHERE room IS NULL AND TRIM(table_number) ILIKE 'group%';

CREATE INDEX IF NOT EXISTS idx_bookings_room_table
  ON bookings(studio_id, room, table_number);


-- ─────────────────────────────────────────────────────────
-- 2. THE LEARNING ENGINE
--
-- No model, no API, no cost. Plain arithmetic over tables the
-- app already fills in as staff use it. Nothing applies itself.
-- ─────────────────────────────────────────────────────────

-- What follows what. staff_task_usage already counts what gets
-- OPENED; this records the ORDERING, which is where the real
-- workflow lives ("Painting -> Drinks, every time").
CREATE TABLE IF NOT EXISTS staff_task_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_member_id UUID NOT NULL,
  from_tab TEXT NOT NULL,
  to_tab TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transitions_studio
  ON staff_task_transitions(studio_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transitions_pair
  ON staff_task_transitions(studio_id, staff_member_id, from_tab, to_tab);
ALTER TABLE public.staff_task_transitions ENABLE ROW LEVEL SECURITY;

-- What the engine worked out, and what happened to it.
CREATE TABLE IF NOT EXISTS studio_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('layout','code')),
  staff_member_id UUID,
  headline TEXT NOT NULL,
  detail TEXT,
  evidence JSONB NOT NULL DEFAULT '{}',
  action JSONB,
  confidence NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','dismissed','shipped')),
  dismiss_count INT NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE(studio_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_suggestions_pending
  ON studio_suggestions(studio_id, status, confidence DESC);
ALTER TABLE public.studio_suggestions ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────
-- 3. DID IT WORK?
-- ─────────────────────────────────────────────────────────

SELECT 'bookings.room column' AS thing,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'room'
  ) THEN '✓ there' ELSE '✗ MISSING' END AS result
UNION ALL
SELECT 'staff_task_transitions',
  CASE WHEN to_regclass('public.staff_task_transitions') IS NOT NULL
  THEN '✓ there' ELSE '✗ MISSING' END
UNION ALL
SELECT 'studio_suggestions',
  CASE WHEN to_regclass('public.studio_suggestions') IS NOT NULL
  THEN '✓ there' ELSE '✗ MISSING' END
UNION ALL
SELECT 'tab opens counted so far',
  COALESCE((SELECT SUM(use_count)::text FROM staff_task_usage), 'staff_task_usage MISSING')
UNION ALL
SELECT 'bookings still needing a room',
  (SELECT COUNT(*)::text FROM bookings WHERE room IS NULL AND table_number IS NOT NULL);
