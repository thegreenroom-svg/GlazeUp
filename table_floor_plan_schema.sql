-- ═══════════════════════════════════════════════════════════
-- LIVE TABLE FLOOR PLAN — booking assignments, table items,
-- chair layouts, and flow checklist state.
-- ═══════════════════════════════════════════════════════════

-- Which staff member is handling which booking right now.
-- Multiple staff can be on the same booking (e.g. during handover).
-- primary_handler = the one whose home screen it anchors to.
CREATE TABLE IF NOT EXISTS booking_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  booking_code TEXT NOT NULL,
  staff_member_id UUID NOT NULL REFERENCES staff_team(id) ON DELETE CASCADE,
  staff_name TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT true,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  released_at TIMESTAMPTZ,
  UNIQUE(studio_id, booking_code, staff_member_id)
);
CREATE INDEX IF NOT EXISTS idx_booking_assignments_staff
  ON booking_assignments(studio_id, staff_member_id) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_booking_assignments_booking
  ON booking_assignments(studio_id, booking_code) WHERE released_at IS NULL;
ALTER TABLE booking_assignments ENABLE ROW LEVEL SECURITY;

-- Draggable items on a table during a session.
-- Each item has a type (placemat, drink, cake, bottle, glasses, etc)
-- and a position (x/y as 0-100 percentage of the table canvas).
CREATE TABLE IF NOT EXISTS table_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  booking_code TEXT NOT NULL,
  item_type TEXT NOT NULL,
  -- placemat, drink_cup, cake_slice, prosecco_bottle, prosecco_glass,
  -- coffee_cup, water_jug, paint_brush, firing_bag, piece_ready
  item_label TEXT,
  pos_x FLOAT DEFAULT 50,
  pos_y FLOAT DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_table_session_items_booking
  ON table_session_items(studio_id, booking_code);
ALTER TABLE table_session_items ENABLE ROW LEVEL SECURITY;

-- Chair positions per table — saved so the layout persists
-- between sessions on the same table. Booking-specific items reset;
-- the physical chair arrangement stays.
CREATE TABLE IF NOT EXISTS table_chair_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  chairs JSONB NOT NULL DEFAULT '[]',
  -- array of {id, x, y, occupied} objects
  split_position FLOAT DEFAULT 50,
  -- where the divider sits (0-100% across the table width)
  is_split BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(studio_id, table_name)
);
ALTER TABLE table_chair_layouts ENABLE ROW LEVEL SECURITY;

-- Per-booking flow checklist — simple tap-to-complete items
-- that track what's been done for each table/booking.
CREATE TABLE IF NOT EXISTS booking_flow_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  booking_code TEXT NOT NULL,
  stage TEXT NOT NULL,
  -- booking, painting, completion, kiln
  check_key TEXT NOT NULL,
  -- table_set_up, greeted, drinks_offered, photos_taken, bill_ready, table_cleared
  completed BOOLEAN DEFAULT false,
  completed_by TEXT,
  completed_at TIMESTAMPTZ,
  UNIQUE(studio_id, booking_code, stage, check_key)
);
CREATE INDEX IF NOT EXISTS idx_booking_flow_checks_booking
  ON booking_flow_checks(studio_id, booking_code);
ALTER TABLE booking_flow_checks ENABLE ROW LEVEL SECURITY;
