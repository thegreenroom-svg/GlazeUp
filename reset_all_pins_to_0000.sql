-- Reset all staff PINs back to the shared demo PIN 0000, for Kiln Cafe
-- trial purposes. This clears any real individual PINs that may have
-- been set and gives everyone the same 0000 immediately — no need for
-- anyone to tap through the "set your PIN" flow again.

-- Clear any existing PINs first
DELETE FROM staff_pins
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3';

-- Set every active staff member's PIN to 0000
-- (hash below is the real SHA-256 of "0000", matching exactly how the app itself hashes PINs)
INSERT INTO staff_pins (studio_id, staff_member_id, pin_hash)
SELECT
  'fab8b2d2-27b5-47ec-8c56-268bbf821dc3',
  id,
  '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'
FROM staff_team
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
  AND active = true;

-- Confirm — should show one row per active staff member, all with the
-- same pin_hash above
SELECT st.name, st.role, sp.pin_hash
FROM staff_team st
JOIN staff_pins sp ON sp.staff_member_id = st.id
WHERE st.studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
ORDER BY st.name;
