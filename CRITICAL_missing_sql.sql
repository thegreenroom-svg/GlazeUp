-- CRITICAL — run this before using the app for real. Without this column,
-- every Square booking sync will fail completely (not just the room
-- labelling — the whole sync), since the code inserts a space_name field
-- that was never added to the real bookings table.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS space_name TEXT;
