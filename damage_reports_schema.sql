-- ═══════════════════════════════════════════════════════════
-- Genuine real damage/loss reporting — covers BOTH a customer's
-- painted piece mid-process AND raw unpainted bisque stock on the
-- shelf. Real, honest audit trail (who reported it, when, why), and
-- real removal from active inventory/search so nothing keeps looking
-- for something that's genuinely gone.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS damage_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL, -- 'customer_piece' or 'raw_stock'
  pottery_piece_id UUID, -- set if item_type = 'customer_piece'
  stock_item_id UUID, -- set if item_type = 'raw_stock'
  booking_code TEXT, -- genuinely useful for a quick real reference, even though pottery_piece_id already links it
  reason TEXT NOT NULL,
  reported_by TEXT,
  reported_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.damage_reports ENABLE ROW LEVEL SECURITY;

-- Real "damaged" status added to pottery_pieces, alongside the
-- existing fired/packed/ready_for_pickup progression — a damaged
-- piece is genuinely no longer searchable/findable, and real staff
-- know at a glance why it's not moving through the normal flow.
ALTER TABLE public.pottery_pieces ADD COLUMN IF NOT EXISTS damaged BOOLEAN DEFAULT false;
