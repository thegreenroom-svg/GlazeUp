-- Remove trial Dave (Studio Assistant test account — not David the Barista)
-- and duplicate Elliott from the staff picker.
-- Uses active = false rather than DELETE so historical data stays intact.

-- Remove trial Dave (Studio Assistant, added as test account)
UPDATE staff_team
SET active = false
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
  AND name = 'Dave'
  AND role = 'Studio Assistant';

-- Remove duplicate Elliott — keeps the one with Director role and PIN set,
-- removes any duplicate. If there are two Elliotts, this removes the one
-- without a PIN (the older/duplicate entry).
-- Run the SELECT first to check which to remove, then uncomment the UPDATE.
SELECT id, name, role, active, pin_hash IS NOT NULL as has_pin
FROM staff_team
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
  AND name ILIKE 'elliott';

-- Once you've confirmed which ID is the duplicate, run:
-- UPDATE staff_team SET active = false WHERE id = '<duplicate_id>';
