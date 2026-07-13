-- ═══════════════════════════════════════════════════════════
-- UPDATE TABLE CAPACITIES — confirmed room specs
-- Main Studio: Tables 1-8, standard session (stays as is)
-- The Vault: up to 14 as one group
-- Lounge: modular 2s and 4s, max 12 combined
-- ═══════════════════════════════════════════════════════════

-- The Vault — correct capacity to 14
UPDATE studio_tables
SET capacity = 14
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
  AND name = 'The Vault';

-- Lounge tables — each table stays as 2 or 4, max combined 12
-- (no schema change needed, the modular grouping is handled in the UI)
-- But confirm room capacity note in the table record
UPDATE studio_tables
SET capacity = 4
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
  AND room = 'Lounge';

-- Add a booking_type column to bookings if not present
-- standard = 90 min, all_day = Thursday painting day, group = Vault/party
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_type TEXT DEFAULT 'standard';
-- standard | all_day | group

-- Mark the demo hen do as a group booking
UPDATE bookings
SET booking_type = 'group'
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
  AND booking_code = 'DEMO-HEN';

-- Mark the WI as a group booking
UPDATE bookings
SET booking_type = 'group'
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
  AND booking_code = 'DEMO-WI';

-- Confirm
SELECT name, room, capacity FROM studio_tables
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
ORDER BY sort_order;
