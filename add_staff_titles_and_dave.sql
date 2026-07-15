-- ═══════════════════════════════════════════════════════════
-- REAL STAFF ROLES + REMOVE DAVE FROM THE PICKER
--
-- Dave (barista) is no longer relevant — set inactive, not deleted,
-- so his shift/timesheet history stays intact and this is reversible.
-- /api/staff/team-for-login already filters on active = true, so
-- this alone removes him from the picker.
--
-- Also updates real role titles to match what was confirmed tonight,
-- so the picker's role line is correct whether it's reading the real
-- team or the offline fallback.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════

UPDATE staff_team SET active = false
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name ILIKE 'Dave%' AND name NOT ILIKE 'David%';

UPDATE staff_team SET role = 'General Manager'
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name ILIKE 'Daisy%';

UPDATE staff_team SET role = 'Studio Executive'
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name ILIKE 'Jenny%';

UPDATE staff_team SET role = 'Co-Director'
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name ILIKE 'David%';

UPDATE staff_team SET role = 'Studio Assistant'
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name ILIKE 'Lucy%';

-- What the picker will show after this runs:
SELECT name, role, active FROM staff_team
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
ORDER BY active DESC, name;
