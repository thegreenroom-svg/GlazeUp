-- ═══════════════════════════════════════════════════════════
-- STOCK SHAPE RECOGNITION — tied to the real Square catalogue
--
-- Corrects an earlier suggestion this same night that pointed at
-- bisque_shapes — checked properly this time and that table is dead,
-- touched by zero server code. The real, live catalogue is Square's
-- own (/api/square/catalog), which has name and price per item but
-- NO photo at all. This is the actual gap.
--
-- One row per physical shape line as staff photograph it in — an
-- elephant, Mug Design #4, a jug — linked to the real Square item
-- by its id (Square stays the single source of truth for name and
-- price; this table only ever adds the photo and its fingerprint).
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS stock_shape_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  square_item_id TEXT NOT NULL,        -- matches the id Square's catalog already returns
  photo_url TEXT NOT NULL,
  photo_phash TEXT,                    -- same on-device dHash as pieces/pottery_pieces
  photographed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  photographed_by UUID
);
CREATE INDEX IF NOT EXISTS idx_stock_shape_studio ON stock_shape_photos(studio_id);
CREATE INDEX IF NOT EXISTS idx_stock_shape_item ON stock_shape_photos(studio_id, square_item_id);
ALTER TABLE public.stock_shape_photos ENABLE ROW LEVEL SECURITY;

-- Also the real fix for "which customers bought this shape" — points
-- at Square's own item id, not the dead bisque_shapes table.
ALTER TABLE pottery_pieces ADD COLUMN IF NOT EXISTS square_item_id TEXT;
CREATE INDEX IF NOT EXISTS idx_pieces_square_item ON pottery_pieces(square_item_id);
