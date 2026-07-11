-- Postal delivery needs a real shipping address on the booking — this
-- didn't exist before. Also add fulfilment method (collection vs post)
-- and a place to record any damage/firing issue notes for the label.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS fulfilment_method TEXT DEFAULT 'collection'; -- 'collection' | 'postal'
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS shipping_address_line1 TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS shipping_address_line2 TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS shipping_city TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS shipping_postcode TEXT;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS shipping_country TEXT DEFAULT 'United Kingdom';
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS damage_notes TEXT; -- e.g. "1 mug cracked in firing"

-- Studio's own return address, used as the "from" address on postal
-- labels — one row per studio, set once in Setup.
CREATE TABLE IF NOT EXISTS studio_return_address (
  studio_id UUID PRIMARY KEY REFERENCES studios(id) ON DELETE CASCADE,
  business_name TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'United Kingdom',
  royal_mail_oba_api_key TEXT -- set once you have a real Royal Mail Online Business Account; blank until then, printable label works without it
);
ALTER TABLE public.studio_return_address ENABLE ROW LEVEL SECURITY;
