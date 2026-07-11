-- ═══════════════════════════════════════════════════════════
-- CLEO'S CLUB — a genuine kids' loyalty sub-brand built on top of the
-- existing visit_count tracking. Collect a virtual sticker each visit,
-- board fills up, every 5th visit unlocks a reward. Designed as a real
-- licensable feature: studios on the platform can enable it as a paid
-- upgrade to their monthly subscription — Cleo's Club becomes a
-- recognisable kids' brand across every participating studio, not
-- studio-specific branding.
-- ═══════════════════════════════════════════════════════════

-- Per-studio toggle and configuration — this is the actual upsell/
-- upgrade unit. enabled=false by default; a studio opts in (and pays
-- for) Cleo's Club as an add-on to their plan.
CREATE TABLE IF NOT EXISTS cleos_club_config (
  studio_id UUID PRIMARY KEY REFERENCES studios(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT false,
  reward_every_n_visits INT DEFAULT 5,
  reward_description TEXT DEFAULT 'Free small piece + a drink',
  monthly_addon_price_cents INT DEFAULT 1500, -- what the studio pays extra per month for this feature
  enabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.cleos_club_config ENABLE ROW LEVEL SECURITY;

-- Real sticker types — a starter set, easy to add more later. Each
-- customer's board fills with whichever stickers they've earned.
CREATE TABLE IF NOT EXISTS cleos_club_sticker_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- e.g. 'cleo-wave', 'cleo-paintbrush'
  name TEXT NOT NULL,
  emoji TEXT NOT NULL, -- simple emoji/icon representation for now
  rarity TEXT DEFAULT 'common' -- 'common' | 'rare' | 'special' — for future variety/excitement
);

-- One row per sticker a customer has actually earned
CREATE TABLE IF NOT EXISTS cleos_club_stickers_earned (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  sticker_type_id UUID REFERENCES cleos_club_sticker_types(id),
  visit_number INT NOT NULL, -- which visit earned this (1st, 2nd, 3rd...)
  earned_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.cleos_club_stickers_earned ENABLE ROW LEVEL SECURITY;

-- Rewards unlocked (every Nth visit) and whether claimed yet
CREATE TABLE IF NOT EXISTS cleos_club_rewards_earned (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  visit_number INT NOT NULL,
  reward_description TEXT NOT NULL,
  claimed BOOLEAN DEFAULT false,
  claimed_at TIMESTAMPTZ,
  earned_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.cleos_club_rewards_earned ENABLE ROW LEVEL SECURITY;

-- Seed a genuine starter set of sticker types
INSERT INTO cleos_club_sticker_types (code, name, emoji, rarity) VALUES
  ('cleo-wave', 'Cleo Says Hi', '👋', 'common'),
  ('cleo-paintbrush', 'Cleo Paints', '🖌️', 'common'),
  ('cleo-mug', 'Cleo''s Mug', '☕', 'common'),
  ('cleo-star', 'Cleo Star', '⭐', 'rare'),
  ('cleo-crown', 'Little CEO', '👑', 'special')
ON CONFLICT (code) DO NOTHING;
