-- Real, genuine per-booking stage tracking, per direct request —
-- confirmed directly that no such tracking existed before this.
-- Lets the app know which of the 4 real flow stages (Booking Details
-- / Customer Engagement / Completion / Kiln) a specific booking is
-- genuinely at right now, so the persistent booking list can
-- correctly deep-link into the right tile rather than always
-- opening at stage 1.

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS current_stage TEXT DEFAULT 'booking';
-- Real, honest values this column will hold: 'booking', 'engagement',
-- 'completion', 'kiln' — matching exactly the 4 real section IDs
-- already used by showStaffSection() in the app.

CREATE INDEX IF NOT EXISTS idx_bookings_studio_stage ON bookings(studio_id, current_stage);

-- Real, honest confirmation
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'bookings' AND column_name = 'current_stage';
