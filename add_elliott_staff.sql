-- Add Elliott as a genuine real staff member, PIN 0000 (same as
-- everyone else on the demo), and give him the same real director-
-- level access as David, Jenny, and Daisy.

INSERT INTO staff_team (studio_id, name, role, active)
VALUES ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Elliott', 'Director', true);

-- Same real shared demo PIN 0000, same SHA-256 hash already proven
-- working for the rest of the team tonight
INSERT INTO staff_pins (studio_id, staff_member_id, pin_hash)
SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', id, '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'
FROM staff_team
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'Elliott';

-- Confirm
SELECT name, role, active FROM staff_team
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'Elliott';
