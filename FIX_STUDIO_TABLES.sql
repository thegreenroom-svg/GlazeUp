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
