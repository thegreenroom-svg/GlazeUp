-- ═══════════════════════════════════════════════════════════
-- Real promotions history — genuinely separate from
-- cleos_club_offer_of_week (which is a single CURRENT highlight).
-- This is a real log of promotions run over time, so Cleo can
-- honestly reference "what we've done" and "what's coming up", not
-- just the one active thing.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS studio_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  starts_on DATE,
  ends_on DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.studio_promotions ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════
-- Real, optional birthday capture for Cleo's Club members — genuine
-- care taken given this often means a child's birthday: nullable,
-- never required, no year-of-birth captured (month/day only, no age
-- inference), and only ever entered deliberately by a parent/guardian
-- through a real, clearly-labelled optional field, never auto-filled
-- or guessed.
-- ═══════════════════════════════════════════════════════════
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday_month INT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday_day INT;
