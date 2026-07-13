-- Add Cleo (placeholder "CEO" — company joke, baby, not a real access
-- role) and Dave (general staff test account, no special access) as
-- real staff members. Neither is added to PLATFORM_REVENUE_ACCESS in
-- the code — that stays locked to David, Jenny, Daisy only, confirmed
-- unchanged.

-- staff_team has no date_of_birth field yet — adding it properly so
-- Cleo's real birthday can be recorded honestly, not faked.
ALTER TABLE staff_team ADD COLUMN IF NOT EXISTS date_of_birth DATE;

INSERT INTO staff_team (studio_id, name, role, active, date_of_birth)
VALUES
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Cleo', 'CEO', true, '2025-06-26'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Dave', 'Studio Assistant', true, NULL);

-- Give both the shared demo PIN 0000, same as everyone else right now
-- (hash is the real SHA-256 of "0000", matching the app's own hashing)
INSERT INTO staff_pins (studio_id, staff_member_id, pin_hash)
SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', id, '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'
FROM staff_team
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name IN ('Cleo', 'Dave');

-- Confirm
SELECT name, role, active, date_of_birth FROM staff_team
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name IN ('Cleo', 'Dave');
