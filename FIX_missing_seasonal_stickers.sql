-- Confirmed from your real data: Halloween and Christmas stickers are
-- genuinely missing (Summer and Easter are already there). This adds
-- ONLY the two missing ones — safe to run even if they somehow already
-- exist, since ON CONFLICT means it won't duplicate or error.
INSERT INTO cleos_club_sticker_types (code, name, emoji, rarity, available_from, available_until) VALUES
  ('cleo-halloween', 'Spooky Cleo', '🎃', 'special', '2026-10-01', '2026-10-31'),
  ('cleo-christmas', 'Festive Cleo', '🎄', 'special', '2026-12-01', '2026-12-31')
ON CONFLICT (code) DO NOTHING;

-- Confirm all 4 seasonal stickers are now genuinely present
SELECT code, name, available_from, available_until
FROM cleos_club_sticker_types
WHERE available_from IS NOT NULL
ORDER BY available_from;
