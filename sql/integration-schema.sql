-- ═══════════════════════════════════════════════════════════════
-- GlazeUp · Integration Schema
-- Run this to add Square/Stripe integration tables to your Supabase
-- ═══════════════════════════════════════════════════════════════

-- ── Square Connection (OAuth tokens, sync status) ──
CREATE TABLE square_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  square_access_token TEXT NOT NULL,
  square_refresh_token TEXT,
  square_merchant_id TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  next_sync_at TIMESTAMPTZ DEFAULT now(),
  sync_status TEXT DEFAULT 'idle' CHECK (sync_status IN ('idle', 'syncing', 'error')),
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(studio_id)
);

CREATE INDEX idx_square_studio ON square_connections(studio_id);

-- ── Sync Logs (for monitoring/debugging) ──
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  square_connection_id UUID NOT NULL REFERENCES square_connections(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL CHECK (sync_type IN ('full', 'incremental', 'customers', 'transactions')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  records_synced INT DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sync_logs_connection ON sync_logs(square_connection_id);
CREATE INDEX idx_sync_logs_created ON sync_logs(created_at);

-- ── Stripe Subscription (billing) ──
CREATE TABLE stripe_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE UNIQUE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,                        -- 'starter', 'professional', 'enterprise'
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'paused')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_stripe_studio ON stripe_subscriptions(studio_id);
CREATE INDEX idx_stripe_subscription ON stripe_subscriptions(stripe_subscription_id);

-- ── Analytics Cache (pre-computed from Square data) ──
CREATE TABLE analytics_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,                    -- 'daily_revenue', 'weekly_revenue', 'top_items', 'repeat_customers', 'peak_hours'
  metric_date DATE NOT NULL,
  metric_value JSONB,                           -- flexible: {revenue: 120.50, transactions: 5, customers: 3} etc
  cached_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(studio_id, metric_type, metric_date)
);

CREATE INDEX idx_analytics_studio ON analytics_cache(studio_id);
CREATE INDEX idx_analytics_date ON analytics_cache(metric_date);

-- ── Customer Activity (which customers used the app) ──
CREATE TABLE customer_app_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  square_customer_id TEXT,                      -- can be null if anonymous
  app_session_id TEXT NOT NULL,
  tab_used TEXT NOT NULL CHECK (tab_used IN ('colours', 'preview', 'print')),
  design_id UUID REFERENCES designs(id),
  glaze_matched_to TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_studio ON customer_app_activity(studio_id);
CREATE INDEX idx_activity_square_customer ON customer_app_activity(square_customer_id);
CREATE INDEX idx_activity_created ON customer_app_activity(created_at);

-- ── Bookings (from Square, with customer info pre-captured) ──
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  square_booking_id TEXT UNIQUE NOT NULL,           -- from Square Bookings API
  booking_code TEXT NOT NULL,                       -- e.g. "booking-20260705-table3" for QR
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  table_number TEXT,
  session_start TIMESTAMPTZ,
  session_end TIMESTAMPTZ,
  party_size INT,
  notes TEXT,
  synced_from_square TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bookings_studio ON bookings(studio_id);
CREATE INDEX idx_bookings_square_id ON bookings(square_booking_id);
CREATE INDEX idx_bookings_booking_code ON bookings(booking_code);
CREATE INDEX idx_bookings_customer_name ON bookings(studio_id, customer_name);
CREATE INDEX idx_bookings_session_start ON bookings(session_start);

-- ── Customers (loyalty card foundation) ──
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  loyalty_points INT DEFAULT 0,
  tier TEXT DEFAULT 'bronze' CHECK (tier IN ('bronze', 'silver', 'gold', 'platinum')),
  total_pieces_painted INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_customers_studio ON customers(studio_id);
CREATE INDEX idx_customers_email ON customers(studio_id, email);
CREATE INDEX idx_customers_phone ON customers(studio_id, phone);

-- ── Pottery Pieces (updated with customer link) ──
CREATE TABLE pottery_pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  booking_id TEXT,                              -- from Square booking or session ID
  piece_type TEXT NOT NULL,                     -- 'mug', 'plate', 'bowl', 'tile', etc.
  is_complete BOOLEAN DEFAULT true,             -- true = ready for dip, false = incomplete
  outstanding_balance DECIMAL(10,2) DEFAULT 0, -- amount due to complete work
  status TEXT DEFAULT 'ready_for_dip' CHECK (status IN ('ready_for_dip', 'dipping', 'dipped', 'in_kiln', 'fired', 'ready_for_pickup', 'picked_up')),
  notes TEXT,                                   -- special instructions
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pieces_studio ON pottery_pieces(studio_id);
CREATE INDEX idx_pieces_customer ON pottery_pieces(customer_id);
CREATE INDEX idx_pieces_booking ON pottery_pieces(booking_id);
CREATE INDEX idx_pieces_status ON pottery_pieces(status);
CREATE INDEX idx_pieces_created ON pottery_pieces(created_at);

-- ── Loyalty Transactions (future: track points earned/spent) ──
CREATE TABLE loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  piece_id UUID REFERENCES pottery_pieces(id) ON DELETE SET NULL,
  points_earned INT DEFAULT 0,
  points_spent INT DEFAULT 0,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('paint', 'reward', 'redemption', 'adjustment')),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_loyalty_studio ON loyalty_transactions(studio_id);
CREATE INDEX idx_loyalty_customer ON loyalty_transactions(customer_id);
CREATE INDEX idx_loyalty_created ON loyalty_transactions(created_at);

-- ── Sync API Keys (for scheduled syncs to authenticate) ──
CREATE TABLE sync_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  api_key TEXT UNIQUE NOT NULL,                 -- random generated key
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(studio_id)
);

-- ── Row Level Security ──
ALTER TABLE square_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_app_activity ENABLE ROW LEVEL SECURITY;

-- Studio staff can see their own Square/Stripe data
CREATE POLICY "Square connections by studio" ON square_connections
  FOR ALL USING (studio_id = (auth.jwt()->>'studio_id')::uuid);

CREATE POLICY "Stripe subscriptions by studio" ON stripe_subscriptions
  FOR ALL USING (studio_id = (auth.jwt()->>'studio_id')::uuid);

CREATE POLICY "Analytics by studio" ON analytics_cache
  FOR SELECT USING (studio_id = (auth.jwt()->>'studio_id')::uuid);

CREATE POLICY "Activity by studio" ON customer_app_activity
  FOR SELECT USING (studio_id = (auth.jwt()->>'studio_id')::uuid);

-- Customers can log their app usage (no auth required)
CREATE POLICY "Customers can log activity" ON customer_app_activity
  FOR INSERT WITH CHECK (true);
