-- Studios
CREATE TABLE IF NOT EXISTS studios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Staff
CREATE TABLE IF NOT EXISTS staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'staff',
  pin_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  booking_start TIMESTAMP NOT NULL,
  booking_end TIMESTAMP,
  space_name TEXT NOT NULL,
  num_people INTEGER NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'booked',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Pieces
CREATE TABLE IF NOT EXISTS pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id),
  booking_id UUID REFERENCES bookings(id),
  shape TEXT NOT NULL,
  colours TEXT NOT NULL,
  pattern TEXT,
  grid_position TEXT,
  photo_url TEXT,
  qr_code TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Shelf Scans
CREATE TABLE IF NOT EXISTS shelf_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id),
  photo_url TEXT NOT NULL,
  inventory JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Takings (Revenue)
CREATE TABLE IF NOT EXISTS takings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id),
  booking_id UUID REFERENCES bookings(id),
  amount_cents INTEGER NOT NULL,
  category TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Analytics Cache
CREATE TABLE IF NOT EXISTS analytics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id),
  daily_revenue JSONB,
  cache_date DATE NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Cleo's Club Config
CREATE TABLE IF NOT EXISTS cleos_club_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id),
  pricing_model TEXT DEFAULT 'flat',
  price_per_visit_cents INTEGER,
  price_percent_of_spend DECIMAL,
  minimum_monthly_cents INTEGER DEFAULT 30000,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bookings_studio ON bookings(studio_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_start);
CREATE INDEX IF NOT EXISTS idx_pieces_studio ON pieces(studio_id);
CREATE INDEX IF NOT EXISTS idx_pieces_booking ON pieces(booking_id);
CREATE INDEX IF NOT EXISTS idx_takings_studio ON takings(studio_id);
CREATE INDEX IF NOT EXISTS idx_staff_studio ON staff(studio_id);
