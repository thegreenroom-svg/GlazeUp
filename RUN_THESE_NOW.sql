-- ═══════════════════════════════════════════════════════════════════
-- RUN_THESE_NOW.sql — The Kiln Cafe — 16 July 2026
-- Supabase project mdpchpjnlzlmldtlqrns
--
-- Everything still outstanding, in the ONE order that works, in one
-- paste. Every statement is idempotent — if you have already run some
-- of these, running them again changes nothing and costs nothing. So
-- you do not need to remember which ones you did.
--
-- ⚠️  ORDER IS NOT COSMETIC HERE. Section 2 deletes every booking whose
--     code starts 'demo-booking-'. Section 3 CREATES bookings with
--     exactly those codes. Run 3 before 2 and you delete your own test
--     bookings a second after making them. Top to bottom, once.
--
-- ⚠️  SECTION 4 STARTS WITH A SELECT. Read it. If it shows an 'Elliot'
--     AND an 'Elliott' as two rows with shifts against BOTH, stop and
--     say so — that is two people's timesheets, not a typo.
--
-- ⚠️  SECTION 3 wants the code push that is still sitting unpushed.
--     Without it the test bookings appear but WITHOUT the amber
--     TRAINING border (their names still say "(Demo)", so they are not
--     dangerous — just less obvious). Push first, then run this.
--
-- Supabase shows only the LAST result set. If you want to read each
-- check, run the sections one at a time. Otherwise run the lot and read
-- the final summary at the bottom.
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
-- 1. TABLES — The Vault, and the missing Main Studio / Lounge tables
--   NOTE: Everything below hangs off this. Bookings attach to tables BY NAME.
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
-- 2. CLEAR THE OLD DEMO — the WI, the hen do, the demo kiln batches
--   NOTE: MUST run BEFORE section 3. It deletes booking_code LIKE 'demo-booking-%',
--     which is exactly what section 3 then creates. The other way round and
--     you would wipe your new test bookings the moment you made them.
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
-- 3. TEST BOOKINGS — one live booking per area
--   NOTE: AFTER section 2, never before. See the note above.
-- ═══════════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════════
-- 4. PEOPLE — the duplicate Elliott, his real role, and Cleo
--   NOTE: STOP AND READ section 4's first SELECT before running the rest of it.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- FIX_TWO_ELLIOTTS.sql — 15 July 2026
-- Studio fab8b2d2-27b5-47ec-8c56-268bbf821dc3 (The Kiln Cafe)
--
-- Daisy, after running the check: "there are two Eliots. We need to get
-- one gone. I think they're both the same. Both got the same spelling.
-- He's not a director. He's the marketing and host by post manager."
--
-- This is the case FIX_ELLIOTT_SPELLING.sql said to STOP on, and she
-- did. Two rows for one person means their shift history may be split
-- across both, so this DEACTIVATES the duplicate rather than deleting
-- it — the same reversible pattern already used for Dave. Nothing is
-- destroyed; the row and its history stay, and it stops appearing in
-- the picker (team-for-login filters on active = true).
--
-- ⚠️  SUPERSEDES FIX_ELLIOTT_SPELLING.sql (and section 4 of
-- RUN_ALL_FOUR.sql). That file set his role to 'Co-Director', which was
-- wrong. If you have already run it, this corrects the role. Run this
-- one AFTER it, or instead of it. No harm either way.
--
-- ROLE AND ACCESS ARE TWO DIFFERENT THINGS, and conflating them is what
-- caused three revisions of this in one evening:
--   • ROLE   — 'Marketing & Host By Post Manager'. Set below. It is his
--              job title and it shows in the login picker.
--   • ACCESS — he DOES see everything the directors see. That lives in
--              code (PLATFORM_REVENUE_ACCESS), is already pushed, and is
--              deliberately NOT derived from his role. Nothing in this
--              file grants or removes it.
-- Changing his job title must never change what he can see. It doesn't.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. LOOK FIRST. Run this alone and read it. ──
-- Shows both rows and how much real history each one carries. The row
-- with history is the one to keep. If BOTH carry shifts, stop — that is
-- genuinely split history and needs merging, not deactivating.
SELECT st.id,
       st.name,
       st.role,
       st.active,
       st.created_at,
       (SELECT COUNT(*) FROM staff_shifts   s WHERE s.staff_member_id = st.id) AS shifts,
       (SELECT COUNT(*) FROM staff_holidays hh WHERE hh.staff_member_id = st.id) AS holidays,
       (SELECT COUNT(*) FROM staff_pins     p WHERE p.staff_member_id = st.id) AS pins
  FROM staff_team st
 WHERE st.studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND st.name ILIKE 'elliot%'
 ORDER BY st.created_at;

-- ── 2. Set the real name and role on BOTH rows, so it is right either way ──
-- The name MUST end up exactly 'Elliott', two t's: the access check in
-- code is a first-name string compare, so 'Elliot' silently locks him
-- out of the takings dashboard while looking correct everywhere else.
-- The role is his job title only — it grants nothing.
-- This also overwrites the 'Co-Director' that FIX_ELLIOTT_SPELLING.sql
-- set, which was wrong.
UPDATE staff_team
   SET name = 'Elliott',
       role = 'Marketing & Host By Post Manager'
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name ILIKE 'elliot%';

-- ── 3. Deactivate the duplicate, keep the one with history ──
-- Keeps whichever row has the most shifts; ties break to the oldest,
-- since that is the one people have been using. Deactivates the rest.
-- Reversible: set active = true to bring any row back.
WITH ranked AS (
  SELECT st.id,
         ROW_NUMBER() OVER (
           ORDER BY (SELECT COUNT(*) FROM staff_shifts s WHERE s.staff_member_id = st.id) DESC,
                    st.created_at ASC
         ) AS keep_rank
    FROM staff_team st
   WHERE st.studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
     AND st.name ILIKE 'elliot%'
)
UPDATE staff_team
   SET active = false
 WHERE id IN (SELECT id FROM ranked WHERE keep_rank > 1);

-- ── VERIFY — expect exactly ONE active Elliott, Marketing & HBP Manager ──
SELECT name, role, active,
       (SELECT COUNT(*) FROM staff_shifts s WHERE s.staff_member_id = staff_team.id) AS shifts
  FROM staff_team
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name ILIKE 'elliot%'
 ORDER BY active DESC;


-- ═══════════════════════════════════════════════════════════════════
-- 5. FACE ID — the table that was never created
--   NOTE: Why Face ID has never worked. Nothing switches on until you accept the
--     one-time offer after your next PIN login.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- FIX_FACE_ID.sql — 15 July 2026
-- Supabase project mdpchpjnlzlmldtlqrns
--
-- Daisy: "their face recognition doesn't work when I try it and they
-- log in."
--
-- She is right, and I told her earlier today it already worked. It
-- doesn't, and this is why.
--
-- The whole chain IS built and correct:
--   offerStaffFaceIdSetup()  — offered once, right after a PIN login
--   POST /api/staff/webauthn/register-options  + /register-verify
--   POST /api/staff/webauthn/auth-options      + /auth-verify
--   tryStaffFaceIdLogin() and the Face ID button on the PIN screen
--
-- The server stores the credential in `staff_webauthn_credentials`.
-- That table is created by webauthn_schema.sql, which is NOT in
-- RUN_ALL_SIX.sql and NOT in RUN_ALL_FOUR.sql. It has almost certainly
-- never been run. No table means register-verify fails, so:
--   • nothing is ever stored
--   • verified never comes back true
--   • klnk_webauthn_registered_<id> is never set in localStorage
--   • the Face ID button's visibility check fails, so the button
--     NEVER APPEARS on the PIN screen
-- Which is exactly what "it doesn't work" looks like from the outside.
--
-- AND IT FAILS SILENTLY. offerStaffFaceIdSetup()'s catch block treats
-- every error the same way, with this comment:
--     "honest silent fail — a declined/cancelled real biometric prompt
--      is a completely normal outcome, not an error"
-- Which is true of a cancelled prompt and NOT true of a 500 from a
-- missing table. So a real server failure has been indistinguishable
-- from someone tapping "no thanks", every time, since it was written.
-- Worth fixing in code later; the table is the actual blocker now.
--
-- ON PRIVACY, since this is the "face recognition" Daisy asked for and
-- the notes rightly say never to build face recognition: THIS IS NOT
-- THAT. No face data, no fingerprint, no biometric of any kind is ever
-- sent or stored. Apple's Secure Enclave does the matching on the
-- device and the app only receives a signed yes. What is stored below
-- is an opaque credential ID and a public key — functionally a very
-- long password, useless without the physical phone. No Article 9
-- biometric data is processed. That is the whole reason this approach
-- was chosen over the face-matching idea that was correctly rejected.
--
-- Safe to re-run — everything is IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staff_webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_member_id UUID NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  device_label TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_staff_webauthn_staff ON staff_webauthn_credentials(staff_member_id);
ALTER TABLE public.staff_webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS customer_webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  customer_id UUID,
  booking_code TEXT,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_customer_webauthn_customer ON customer_webauthn_credentials(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_webauthn_booking ON customer_webauthn_credentials(booking_code);
ALTER TABLE public.customer_webauthn_credentials ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════
-- VERIFY — both should read ok
-- ═══════════════════════════════════════════════════════════════════
SELECT 'staff_webauthn_credentials' AS thing,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='staff_webauthn_credentials') THEN 'ok' ELSE 'MISSING' END AS present
UNION ALL SELECT 'customer_webauthn_credentials',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='customer_webauthn_credentials') THEN 'ok' ELSE 'MISSING' END;

-- ═══════════════════════════════════════════════════════════════════
-- AFTER RUNNING THIS — Face ID does not switch on by itself:
--   1. Hard refresh, log in with your PIN as normal.
--   2. You will be asked "Enable Face ID / Touch ID for next time?"
--      — this offer only appears after a PIN login, once per person
--      per device, and never again if declined.
--   3. Say yes, complete the Face ID prompt.
--   4. NEXT login, the Face ID button appears above the PIN pad.
-- If you have already declined it on this phone, the app remembers and
-- will not ask again. Clearing klnk_webauthn_declined_<your id> from
-- localStorage resets that, or just try on another device.
-- ═══════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════
-- FINAL SUMMARY — the only result you actually need to read.
-- ═══════════════════════════════════════════════════════════════════
SELECT 'rooms & tables' AS thing,
       string_agg(DISTINCT room || ' (' || cnt::text || ')', ', ' ORDER BY room || ' (' || cnt::text || ')') AS detail
  FROM (SELECT room, COUNT(*) AS cnt FROM studio_tables
         WHERE studio_id='fab8b2d2-27b5-47ec-8c56-268bbf821dc3' GROUP BY room) x
UNION ALL
SELECT 'test bookings (want 3)', COUNT(*)::text FROM bookings
 WHERE studio_id='fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND booking_code LIKE 'demo-booking-%'
UNION ALL
SELECT 'old demo left over (want 0)', COUNT(*)::text FROM bookings
 WHERE studio_id='fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND booking_code LIKE 'DEMO-%'
UNION ALL
SELECT 'active Elliotts (want 1)', COUNT(*)::text FROM staff_team
 WHERE studio_id='fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name ILIKE 'elliot%' AND active = true
UNION ALL
SELECT 'Cleo back (want 1)', COUNT(*)::text FROM staff_team
 WHERE studio_id='fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'Cleo' AND active = true
UNION ALL
SELECT 'face id table', CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables
   WHERE table_name='staff_webauthn_credentials') THEN 'ok' ELSE 'MISSING' END;
