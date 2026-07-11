-- Individual piece reference photo — captured at the same time as
-- the group completion photo, but one per piece, photographed next to
-- the booking's QR card. This is what the packer will later match
-- against when the pieces come out jumbled from the kiln.
ALTER TABLE public.pottery_pieces ADD COLUMN IF NOT EXISTS reference_photo_url TEXT;
ALTER TABLE public.pottery_pieces ADD COLUMN IF NOT EXISTS reference_photo_taken_at TIMESTAMPTZ;

-- Log of match attempts — every time a packer photographs a fired piece
-- to find its match, both for a genuine audit trail and so we can see
-- honestly how well this is working in practice (accuracy over time).
CREATE TABLE IF NOT EXISTS piece_match_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  booking_code TEXT NOT NULL,
  query_photo_url TEXT NOT NULL,
  suggested_piece_id UUID REFERENCES pottery_pieces(id) ON DELETE SET NULL,
  ai_reasoning TEXT,
  ai_confidence TEXT, -- 'high' | 'medium' | 'low' | 'no_match'
  all_candidates JSONB, -- full ranked list returned, for review
  packer_confirmed BOOLEAN, -- did the packer accept this suggestion? null = not yet responded
  packer_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.piece_match_attempts ENABLE ROW LEVEL SECURITY;
