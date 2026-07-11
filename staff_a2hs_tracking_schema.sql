-- Genuine per-person tracking of whether each staff member has
-- actually completed the "add app to home screen" onboarding step —
-- not a per-device flag (which wouldn't distinguish between different
-- people sharing a tablet), a real record tied to the actual person.
ALTER TABLE staff_team ADD COLUMN IF NOT EXISTS home_screen_added_at TIMESTAMPTZ;
