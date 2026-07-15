-- ═══════════════════════════════════════════════════════════
-- BOOKINGS NEED A ROOM
--
-- bookings.table_number is TEXT ("5A", "3") with no room beside
-- it. Main Studio and The Lounge both have a Table 1, 2, 3 and 4,
-- so a booking cannot say which room it is in. The floor plan was
-- left guessing — Main Studio first — which puts Lounge covers on
-- the wrong table on a busy Saturday.
--
-- This adds the missing column. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room TEXT;

-- Backfill what can be known for certain, and ONLY that.
--
-- '5A' and '7' and '8' exist only in Main Studio, so those are safe.
-- '1' to '6' are ambiguous — they exist in both Main Studio and The
-- Lounge — and are deliberately LEFT NULL rather than guessed. A null
-- room is honest; a wrong room is a member of staff walking to the
-- wrong table. The app falls back to its old guess for nulls, so
-- nothing breaks; it simply stops pretending to know.
UPDATE bookings SET room = 'Main Studio'
  WHERE room IS NULL AND TRIM(table_number) IN ('5A', '7', '8');

UPDATE bookings SET room = 'The Vault'
  WHERE room IS NULL AND TRIM(table_number) ILIKE 'group%';

-- Everything still null is genuinely ambiguous and needs a human, or
-- needs to be set correctly from now on at booking time.
CREATE INDEX IF NOT EXISTS idx_bookings_room_table
  ON bookings(studio_id, room, table_number);

-- What is left to resolve by hand:
SELECT
  COALESCE(room, '— UNKNOWN, needs setting —') AS room,
  table_number,
  COUNT(*) AS bookings
FROM bookings
GROUP BY room, table_number
ORDER BY room NULLS FIRST, table_number;
