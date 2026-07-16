-- ═══════════════════════════════════════════════════════════════════
-- SEED_ONE_BOOKING_PER_ROOM.sql — 16 July 2026
-- Studio fab8b2d2-27b5-47ec-8c56-268bbf821dc3 (The Kiln Cafe)
--
-- Daisy: "one table for each area as a test booking... so staff can
-- look at a typical booking on each area... a table which is live with
-- a red, take you through that booking."
--
-- RUN FIX_STUDIO_TABLES.sql FIRST. These bookings attach to Table 1,
-- Table 9 and The Vault by name, and if those tables don't exist the
-- bookings will sit in the data doing nothing visible.
--
-- ═══════════════════════════════════════════════════════════════════
-- WHY THIS IS SAFE WHEN YESTERDAY'S DEMO DATA WAS NOT
-- ═══════════════════════════════════════════════════════════════════
-- Yesterday demo bookings had to be deleted because nobody could tell
-- them from real ones. That was not bad luck — demo_floor_seed.sql used
-- codes like 'DEMO-WI' with customer names like "Women's Institute",
-- and the client's check is:
--
--     isSeedDemo = /\(Demo\)/.test(customer_name)
--               || /^demo-booking-/.test(booking_code)
--
-- 'DEMO-WI' matches NEITHER. So those rows rendered as genuine
-- bookings, with no warning, and DELETE /api/bookings/:code/seed
-- refused them ("Only seeded demo bookings (demo-booking-*) can be
-- cleared this way"). They were unmarked AND unremovable.
--
-- These use BOTH markers, deliberately:
--   • booking_code starts 'demo-booking-'  -> clearable from the app
--   • customer_name contains '(Demo)'      -> amber "TRAINING — TAP TO
--                                             CLEAR" pill on the tile
-- So every one of them announces itself on the floor plan, and any
-- member of staff can bin it with one tap. No SQL needed to undo this.
--
-- The other reason yesterday's seed looked odd: the floor plan matches
-- a booking to a table with `bookingByTable[t.name]`, so table_number
-- must equal the table's NAME EXACTLY. demo_floor_seed used '1' and
-- '5A' against tables called 'Table 1'. Never matched. These use the
-- real names.
--
-- Safe to re-run: deletes its own rows first, so you get one clean set.
-- ═══════════════════════════════════════════════════════════════════

-- ── Clear any previous run of THIS file (and nothing else) ──
DELETE FROM bookings
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND booking_code IN ('demo-booking-main', 'demo-booking-lounge', 'demo-booking-vault');

-- ── One live booking per room, starting earlier today ──
INSERT INTO bookings
  (studio_id, booking_code, customer_name, table_number, room,
   party_size, session_start, status, current_stage, booking_type)
VALUES
  -- Main Studio — a family of four, mid-paint. The everyday case.
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'demo-booking-main',
   'The Hartleys (Demo)', 'Table 1', 'Main Studio',
   4, date_trunc('day', now()) + interval '10 hours 30 minutes',
   'active', 'painting', 'walk-in'),

  -- Lounge — a quiet two. Different room, different shape of booking.
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'demo-booking-lounge',
   'Priya & Sam (Demo)', 'Table 9', 'Lounge',
   2, date_trunc('day', now()) + interval '11 hours 15 minutes',
   'active', 'painting', 'booking'),

  -- The Vault — a big group, the whole room as one table. This is the
  -- one worth showing staff: 12 people on a single 14-seat table.
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'demo-booking-vault',
   'Langport Book Club (Demo)', 'The Vault', 'The Vault',
   12, date_trunc('day', now()) + interval '13 hours',
   'active', 'painting', 'group');

-- ═══════════════════════════════════════════════════════════════════
-- VERIFY — three rows, each on a table that genuinely exists.
-- If `table_exists` is false for any row, the booking will not appear
-- on the floor plan: run FIX_STUDIO_TABLES.sql and re-run this.
-- ═══════════════════════════════════════════════════════════════════
SELECT b.room,
       b.table_number,
       b.customer_name,
       b.party_size,
       EXISTS (SELECT 1 FROM studio_tables st
                WHERE st.studio_id = b.studio_id AND st.name = b.table_number) AS table_exists
  FROM bookings b
 WHERE b.studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND b.booking_code LIKE 'demo-booking-%'
 ORDER BY b.room;

-- ═══════════════════════════════════════════════════════════════════
-- TO REMOVE THEM: don't. Tap the amber TRAINING pill on the tile.
-- That is the whole point of marking them properly. If you'd rather
-- do it in SQL anyway:
--   DELETE FROM bookings
--    WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
--      AND booking_code LIKE 'demo-booking-%';
-- ═══════════════════════════════════════════════════════════════════
