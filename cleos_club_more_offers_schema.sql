-- ═══════════════════════════════════════════════════════════
-- CLEO'S CLUB — more kid offers, genuinely built on the existing
-- sticker/reward structure, not a disconnected new system.
-- ═══════════════════════════════════════════════════════════

-- Seasonal limited stickers — a sticker type only ever awarded within
-- a real date window (e.g. a Halloween sticker only available in
-- October). NULL on both = always available (the existing 5 starter
-- stickers stay this way).
ALTER TABLE public.cleos_club_sticker_types ADD COLUMN IF NOT EXISTS available_from DATE;
ALTER TABLE public.cleos_club_sticker_types ADD COLUMN IF NOT EXISTS available_until DATE;

-- Real seasonal starter set — genuinely time-limited, creates a real
-- reason to visit during a specific window, not just decoration.
INSERT INTO cleos_club_sticker_types (code, name, emoji, rarity, available_from, available_until) VALUES
  ('cleo-halloween', 'Spooky Cleo', '🎃', 'special', '2026-10-01', '2026-10-31'),
  ('cleo-christmas', 'Festive Cleo', '🎄', 'special', '2026-12-01', '2026-12-31'),
  ('cleo-summer', 'Sunny Cleo', '☀️', 'special', '2026-07-01', '2026-08-31'),
  ('cleo-easter', 'Egg-cellent Cleo', '🐣', 'special', '2026-03-15', '2026-04-15')
ON CONFLICT (code) DO NOTHING;

-- "Complete the Set" bonus reward — genuinely tracked so it's only
-- awarded once per customer, not re-triggered every time they still
-- have all the (always-available) stickers.
CREATE TABLE IF NOT EXISTS cleos_club_set_completion_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  awarded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(studio_id, customer_id)
);
ALTER TABLE public.cleos_club_set_completion_bonuses ENABLE ROW LEVEL SECURITY;
