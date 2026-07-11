-- ═══════════════════════════════════════════════════════════
-- FIND MY PIECE — lost/unclaimed piece registry
-- Replaces the handwritten "waiting to finish" / "waiting to be found"
-- notes with a genuine tracked system. Two real categories:
-- 'awaiting_collection' — piece is fine, just hasn't been picked up
-- 'unidentified' — piece exists but we genuinely don't know whose it is
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lost_pieces_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  piece_id UUID REFERENCES pottery_pieces(id) ON DELETE SET NULL, -- null if it's genuinely unidentified/unlinked to any known booking
  category TEXT NOT NULL DEFAULT 'unidentified', -- 'awaiting_collection' | 'unidentified'
  photo_url TEXT,
  description TEXT, -- e.g. "blue mug, floral pattern, found on shelf near kiln"
  found_location TEXT, -- e.g. "waiting to finish shelf", "back storeroom"
  reported_by UUID, -- staff member id who logged it
  status TEXT DEFAULT 'open', -- 'open' | 'resolved'
  resolved_at TIMESTAMPTZ,
  resolved_notes TEXT, -- e.g. "matched to booking X, customer notified"
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.lost_pieces_registry ENABLE ROW LEVEL SECURITY;

-- Log of every Find My Piece search — genuine audit trail, and useful
-- to see honestly how often this gets used and whether it's actually
-- finding things.
CREATE TABLE IF NOT EXISTS piece_search_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  searched_by UUID,
  search_photo_url TEXT,
  search_description TEXT,
  results_count INT DEFAULT 0,
  top_result_piece_id UUID,
  resolved BOOLEAN, -- did this search actually find the piece? null = not yet marked
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.piece_search_log ENABLE ROW LEVEL SECURITY;

-- Customer-uploaded photo of their own piece, taken on their own device
-- outside the app — genuinely different from the studio's own reference
-- photos, since this is evidence the CUSTOMER provides.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS customer_uploaded_photo_url TEXT;
