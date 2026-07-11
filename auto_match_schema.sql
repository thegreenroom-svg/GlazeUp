-- Genuine real flag distinguishing pieces auto-assigned by AI (high
-- confidence, unambiguous, no human confirmation step) from pieces
-- confirmed by a real person via the normal Piece Matching flow.
-- Lets staff see honestly which pieces were auto-matched, and is what
-- the real undo endpoint checks/clears if a mistake needs correcting.
ALTER TABLE public.pottery_pieces ADD COLUMN IF NOT EXISTS auto_matched BOOLEAN DEFAULT false;
