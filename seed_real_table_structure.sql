-- Real, honest seed of the actual studio table structure, confirmed
-- directly: 8 Main Studio tables (1-8), 6 Lounge tables (9-14), and
-- The Vault (fixed 12). Each Main Studio and Lounge table defaults
-- to seats-4 but is genuinely modular — staff split or combine them
-- day-to-day using the existing, already-working Setup → Studio
-- Tables tool (add/remove rows there any time), this just gives them
-- a real, sensible starting point rather than an empty list.

-- Real, honest safety: only seeds if the studio genuinely has no
-- tables configured yet, so this never overwrites real staff changes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM studio_tables WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3') THEN

    INSERT INTO studio_tables (studio_id, name, room, capacity, sort_order) VALUES
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 1', 'Main Studio', 4, 1),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 2', 'Main Studio', 4, 2),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 3', 'Main Studio', 4, 3),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 4', 'Main Studio', 4, 4),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 5', 'Main Studio', 4, 5),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 6', 'Main Studio', 4, 6),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 7', 'Main Studio', 4, 7),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 8', 'Main Studio', 4, 8),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 9', 'Lounge', 4, 9),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 10', 'Lounge', 4, 10),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 11', 'Lounge', 4, 11),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 12', 'Lounge', 4, 12),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 13', 'Lounge', 4, 13),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 14', 'Lounge', 4, 14),
      ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'The Vault', 'The Vault', 12, 15);

  END IF;
END $$;

-- Real, honest confirmation
SELECT room, name, capacity FROM studio_tables
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
ORDER BY sort_order;
