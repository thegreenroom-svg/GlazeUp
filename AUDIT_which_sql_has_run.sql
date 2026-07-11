-- ═══════════════════════════════════════════════════════════
-- GENUINE AUDIT — run this in Supabase SQL editor to see EXACTLY
-- which of the recent SQL files you've actually run, and which you
-- haven't. Completely safe — this only reads, never changes anything.
-- ═══════════════════════════════════════════════════════════

-- 1. Cleo's Club core tables (from cleos_club_schema.sql)
SELECT 'cleos_club_config table exists' AS check_name,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleos_club_config') AS result
UNION ALL
SELECT 'cleos_club_sticker_types table exists',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleos_club_sticker_types')
UNION ALL
SELECT 'cleos_club_stickers_earned table exists',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleos_club_stickers_earned')
UNION ALL
SELECT 'cleos_club_rewards_earned table exists',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleos_club_rewards_earned')

-- 2. More offers extension (from cleos_club_more_offers_schema.sql)
UNION ALL
SELECT 'seasonal sticker date columns exist',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cleos_club_sticker_types' AND column_name = 'available_from')
UNION ALL
SELECT 'cleos_club_set_completion_bonuses table exists',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleos_club_set_completion_bonuses')

-- 3. Add-on marketplace (from studio_addons_schema.sql)
UNION ALL
SELECT 'studio_addons table exists',
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'studio_addons')

-- 4. Club Pages screening (from club_pages_schema.sql)
UNION ALL
SELECT 'community_posts screening_status column exists',
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'community_posts' AND column_name = 'screening_status');

-- If any of the above say "false", the matching SQL file below still
-- needs to be run:
-- false on rows 1-4  -> run cleos_club_schema.sql
-- false on rows 5-6  -> run cleos_club_more_offers_schema.sql
-- false on row 7     -> run studio_addons_schema.sql
-- false on row 8     -> run club_pages_schema.sql

-- ── Real content check — how many seasonal stickers actually exist ──
SELECT code, name, available_from, available_until
FROM cleos_club_sticker_types
ORDER BY available_from NULLS FIRST;
