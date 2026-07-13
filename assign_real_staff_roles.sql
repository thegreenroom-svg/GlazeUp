-- Real, honest role assignment, confirmed directly:
-- David = Barista, Lucy = Ceramic Technician, Ruby = Studio Assistant,
-- Daisy = Studio Manager, Jenny = Studio Executive.

UPDATE staff_team SET role = 'Barista'
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'David';

UPDATE staff_team SET role = 'Ceramic Technician'
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'Lucy';

UPDATE staff_team SET role = 'Studio Assistant'
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'Ruby';

UPDATE staff_team SET role = 'Studio Manager'
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'Daisy';

UPDATE staff_team SET role = 'Studio Executive'
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'Jenny';

-- Real, honest confirmation
SELECT name, role FROM staff_team WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' ORDER BY name;
