-- Add Clio (placeholder "CEO" — company joke, baby, not a real access
-- role) and Dave (general staff test account, no special access) as
-- real staff members. Neither is added to PLATFORM_REVENUE_ACCESS in
-- the code — that stays locked to David, Jenny, Daisy only, confirmed
-- unchanged.
INSERT INTO staff_team (studio_id, name, role, active)
VALUES
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Clio', 'CEO', true),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Dave', 'Studio Assistant', true);

-- Give both the shared demo PIN 0000, same as everyone else right now
-- (hash is the real SHA-256 of "0000", matching the app's own hashing)
INSERT INTO staff_pins (studio_id, staff_member_id, pin_hash)
SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', id, '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'
FROM staff_team
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name IN ('Clio', 'Dave');

-- Confirm
SELECT name, role, active FROM staff_team
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name IN ('Clio', 'Dave');
