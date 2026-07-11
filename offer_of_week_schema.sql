-- Genuine "Offer of the Week" — a real, admin-editable highlighted
-- offer shown in Cleo's space on the customer app. Separate from the
-- ongoing sticker/reward system (that's per-visit progress; this is a
-- single rotating highlight, like a real weekly special).
CREATE TABLE IF NOT EXISTS cleos_club_offer_of_week (
  studio_id UUID PRIMARY KEY REFERENCES studios(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  emoji TEXT DEFAULT '🎁',
  active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.cleos_club_offer_of_week ENABLE ROW LEVEL SECURITY;
