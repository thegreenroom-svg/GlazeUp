-- ═══════════════════════════════════════════════════════════
-- PERSONAL STAFF HOME SCREEN
-- Each staff member can have their own tile layout, saved to
-- Supabase so it follows them across any device in the studio.
-- Tiles are drawn from GRID_NAV_STRUCTURE on the client —
-- this table just stores the ordered list of tile IDs and
-- which sub-tiles have been promoted to the top level.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staff_home_screens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_member_id UUID NOT NULL REFERENCES staff_team(id) ON DELETE CASCADE,
  -- JSON array of group IDs in display order, e.g. ["bookings","pieces","team"]
  tile_order JSONB NOT NULL DEFAULT '[]',
  -- JSON array of sub-tile tab IDs promoted to the top level, e.g. ["staff","piecematch"]
  promoted_tiles JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(studio_id, staff_member_id)
);

ALTER TABLE staff_home_screens ENABLE ROW LEVEL SECURITY;

-- Index for fast lookup by staff member
CREATE INDEX IF NOT EXISTS idx_staff_home_screens_member
  ON staff_home_screens(studio_id, staff_member_id);
