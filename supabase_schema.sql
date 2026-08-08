-- GLAZEUP CORE DATABASE SCHEMA
-- PostgreSQL / Supabase
-- Designed for multi-studio SaaS with Row Level Security

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Studios (master record for each pottery studio installation)
CREATE TABLE studios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT,
  description TEXT,
  logo_url TEXT,
  website TEXT,
  
  -- Configuration
  table_count INT DEFAULT 10,
  seats_per_table INT DEFAULT 4,
  
  -- Stripe/Square integration
  square_account_id TEXT UNIQUE,
  square_location_id TEXT,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  
  CONSTRAINT valid_table_config CHECK (table_count > 0 AND seats_per_table > 0)
);

-- Users (Supabase Auth linked)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  studio_id UUID REFERENCES studios(id) ON DELETE RESTRICT,
  
  email TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  
  -- Role within studio
  role TEXT CHECK (role IN ('owner', 'manager', 'staff', 'artist')) DEFAULT 'staff',
  
  -- Customer vs staff
  is_customer BOOLEAN DEFAULT FALSE,
  
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_studio_email UNIQUE (studio_id, email)
);

-- Customers (subset of users who book/paint)
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  
  loyalty_points INT DEFAULT 0,
  total_visits INT DEFAULT 0,
  total_spent DECIMAL(10,2) DEFAULT 0,
  
  preferences JSONB DEFAULT '{}',
  last_visit TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Studio Tables (physical tables in the studio)
CREATE TABLE studio_tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  
  table_number INT NOT NULL,
  capacity INT NOT NULL,
  status TEXT CHECK (status IN ('available', 'occupied', 'maintenance')) DEFAULT 'available',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_table_number UNIQUE (studio_id, table_number)
);

-- Bookings (sessions where customers paint)
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  booking_type TEXT CHECK (booking_type IN ('walk-in', 'scheduled', 'party', 'workshop', 'private-event')) DEFAULT 'scheduled',
  
  scheduled_at TIMESTAMPTZ,
  checked_in_at TIMESTAMPTZ,
  duration_minutes INT DEFAULT 120,
  
  -- Attendee details
  party_size INT DEFAULT 1,
  notes TEXT,
  
  status TEXT CHECK (status IN ('pending', 'confirmed', 'checked-in', 'completed', 'cancelled')) DEFAULT 'confirmed',
  
  total_amount DECIMAL(10,2),
  payment_status TEXT CHECK (payment_status IN ('unpaid', 'paid', 'refunded')) DEFAULT 'unpaid',
  square_payment_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_studio_booking (studio_id),
  INDEX idx_customer_booking (customer_id),
  INDEX idx_booking_date (scheduled_at)
);

-- Inventory Items (paint, glazes, pottery blanks, etc.)
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  
  quantity_on_hand INT DEFAULT 0,
  quantity_reserved INT DEFAULT 0,
  reorder_level INT DEFAULT 10,
  
  cost_per_unit DECIMAL(10,2),
  selling_price DECIMAL(10,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_sku UNIQUE (studio_id, sku)
);

-- ============================================================================
-- CERAMIC PIECE TRACKING
-- ============================================================================

-- Ceramic Pieces (individual painted pots)
CREATE TABLE ceramic_pieces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  
  -- Piece identity
  piece_name TEXT,
  item_type TEXT,
  base_color TEXT,
  
  -- Lifecycle status
  status TEXT CHECK (status IN (
    'created', 'painted', 'drying', 'glazing', 'kiln_queue', 
    'firing', 'quality_check', 'ready_for_collection', 'collected', 'archived'
  )) DEFAULT 'created',
  
  -- Tracking
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  collected_at TIMESTAMPTZ,
  
  -- Piece history (immutable log of changes)
  history JSONB DEFAULT '[]',
  
  -- Notes and metadata
  staff_notes TEXT,
  quality_issues TEXT,
  
  CONSTRAINT valid_lifecycle CHECK (
    (status = 'created' AND collected_at IS NULL) OR
    (status IN ('painted', 'drying', 'glazing', 'kiln_queue', 'firing', 'quality_check', 'ready_for_collection') AND collected_at IS NULL) OR
    (status IN ('collected', 'archived') AND collected_at IS NOT NULL)
  ),
  
  INDEX idx_customer_pieces (customer_id),
  INDEX idx_booking_pieces (booking_id),
  INDEX idx_status (status)
);

-- Piece Photos (photos of painted pieces before/after kiln)
CREATE TABLE piece_photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  piece_id UUID NOT NULL REFERENCES ceramic_pieces(id) ON DELETE CASCADE,
  
  storage_path TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  thumbnail_url TEXT,
  
  -- Photo metadata
  taken_at TIMESTAMPTZ NOT NULL,
  stage TEXT CHECK (stage IN ('painted', 'kiln_ready', 'post_firing')) DEFAULT 'painted',
  
  -- AI/fingerprinting for piece matching
  fingerprint_vector VECTOR(384),
  fingerprint_json JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_piece_photos (piece_id)
);

-- Piece Designs (customer's design choices, AI suggestions)
CREATE TABLE piece_designs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  piece_id UUID NOT NULL REFERENCES ceramic_pieces(id) ON DELETE CASCADE,
  
  design_prompt TEXT,
  colors_chosen TEXT[],
  pattern_suggestions JSONB,
  
  ai_suggestions JSONB,
  ai_model TEXT,
  ai_cost DECIMAL(8,4),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- KILN & FIRING WORKFLOW
-- ============================================================================

-- Kiln Batches (firing runs)
CREATE TABLE kiln_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  
  batch_number INT NOT NULL,
  status TEXT CHECK (status IN ('planning', 'loading', 'firing', 'completed', 'unloaded')) DEFAULT 'planning',
  
  -- Timing
  scheduled_fire_at TIMESTAMPTZ,
  fired_at TIMESTAMPTZ,
  unloaded_at TIMESTAMPTZ,
  
  -- Capacity
  pieces_count INT DEFAULT 0,
  capacity INT DEFAULT 100,
  
  -- Temperature and program
  fire_temperature INT,
  firing_program TEXT,
  duration_hours INT,
  
  -- Notes
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_batch UNIQUE (studio_id, batch_number),
  INDEX idx_kiln_status (status)
);

-- Piece Kiln History (tracking each piece through kiln)
CREATE TABLE piece_kiln_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  piece_id UUID NOT NULL REFERENCES ceramic_pieces(id) ON DELETE CASCADE,
  kiln_batch_id UUID REFERENCES kiln_batches(id) ON DELETE SET NULL,
  
  status_at_entry TEXT,
  status_at_exit TEXT,
  
  added_to_batch_at TIMESTAMPTZ,
  fired_at TIMESTAMPTZ,
  unloaded_at TIMESTAMPTZ,
  
  quality_check_notes TEXT,
  quality_passed BOOLEAN,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- LOYALTY & REWARDS
-- ============================================================================

-- Reward Accounts (loyalty ledger per customer)
CREATE TABLE reward_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  current_balance INT DEFAULT 0,
  lifetime_earned INT DEFAULT 0,
  lifetime_redeemed INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_reward_account UNIQUE (studio_id, customer_id)
);

-- Reward Transactions (point activity)
CREATE TABLE reward_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  reward_account_id UUID NOT NULL REFERENCES reward_accounts(id) ON DELETE CASCADE,
  
  transaction_type TEXT CHECK (transaction_type IN ('earn', 'redeem', 'adjustment')) DEFAULT 'earn',
  amount INT NOT NULL,
  
  -- Activity that triggered transaction
  activity_type TEXT CHECK (activity_type IN ('visit', 'spending', 'referral', 'workshop', 'event', 'manual')) DEFAULT 'visit',
  related_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  
  description TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- NOTIFICATIONS & COMMUNICATION
-- ============================================================================

-- Notifications (to customers)
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT NOW()::uuid,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  notification_type TEXT CHECK (notification_type IN (
    'booking_confirmed', 'checked_in', 'kiln_ready', 'ready_for_collection', 
    'collected', 'reward_earned', 'event_reminder', 'offer'
  )) DEFAULT 'booking_confirmed',
  
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  
  related_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  related_piece_id UUID REFERENCES ceramic_pieces(id) ON DELETE SET NULL,
  
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_customer_notifications (customer_id, created_at DESC)
);

-- ============================================================================
-- AUDIT & LOGGING
-- ============================================================================

-- Audit Log (all mutations for compliance/debugging)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  
  changes JSONB,
  previous_values JSONB,
  
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  INDEX idx_audit_studio (studio_id, created_at DESC)
);

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE studios ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ceramic_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE piece_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE piece_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiln_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE piece_kiln_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reward_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can see their own studio's data
CREATE POLICY "users_see_own_studio" ON users
  FOR SELECT
  USING (auth.uid() = auth_id);

CREATE POLICY "customers_see_own_record" ON customers
  FOR SELECT
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "bookings_customer_visibility" ON bookings
  FOR SELECT
  USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  );

CREATE POLICY "pieces_customer_visibility" ON ceramic_pieces
  FOR SELECT
  USING (
    customer_id IN (SELECT id FROM customers WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  );

-- Staff can see all data for their studio
CREATE POLICY "staff_see_studio_data" ON bookings
  FOR SELECT
  USING (
    studio_id IN (SELECT studio_id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "staff_see_pieces" ON ceramic_pieces
  FOR SELECT
  USING (
    studio_id IN (SELECT studio_id FROM users WHERE auth_id = auth.uid())
  );

-- ============================================================================
-- INDEXES & PERFORMANCE
-- ============================================================================

CREATE INDEX idx_users_studio ON users(studio_id);
CREATE INDEX idx_customers_studio ON customers(studio_id);
CREATE INDEX idx_notifications_studio ON notifications(studio_id, is_read);
CREATE INDEX idx_kiln_batches_studio ON kiln_batches(studio_id, status);
CREATE INDEX idx_pieces_status_studio ON ceramic_pieces(studio_id, status);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Record piece lifecycle change
CREATE OR REPLACE FUNCTION record_piece_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status != OLD.status THEN
    NEW.history = NEW.history || jsonb_build_array(
      jsonb_build_object(
        'from', OLD.status,
        'to', NEW.status,
        'at', NOW(),
        'note', NEW.staff_notes
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER piece_status_trigger
BEFORE UPDATE ON ceramic_pieces
FOR EACH ROW
EXECUTE FUNCTION record_piece_status_change();

-- Auto-update customer stats when booking completed
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE customers
    SET total_visits = total_visits + 1,
        total_spent = total_spent + COALESCE(NEW.total_amount, 0),
        last_visit = NOW()
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER booking_completion_trigger
AFTER UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION update_customer_stats();
