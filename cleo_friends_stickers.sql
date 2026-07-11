-- Cleo's friends — genuine new collectible stickers, matching the
-- exact real structure already used for Cleo's own stickers. Each
-- friend has their own distinct personality (used in her chat
-- dialogue too, not just here) — a real cast, not filler.
INSERT INTO cleos_club_sticker_types (code, name, emoji, rarity) VALUES
  ('friend-amara', 'Amara the Builder', '🏗️', 'rare'),
  ('friend-yuki', 'Yuki the Perfectionist', '✨', 'rare'),
  ('friend-raj', 'Raj the Experimenter', '🧪', 'rare'),
  ('friend-maya', 'Maya the Storyteller', '📖', 'rare')
ON CONFLICT (code) DO NOTHING;
