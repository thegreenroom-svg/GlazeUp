-- Run this ONE query, all at once — genuinely gives you every real
-- check in a single result table, no risk of only seeing the last one.
SELECT check_name, result FROM (
  SELECT 1 AS ord, 'cleos_club_config table exists' AS check_name,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleos_club_config')::text AS result
  UNION ALL
  SELECT 2, 'cleos_club_sticker_types table exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleos_club_sticker_types')::text
  UNION ALL
  SELECT 3, 'cleos_club_stickers_earned table exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleos_club_stickers_earned')::text
  UNION ALL
  SELECT 4, 'cleos_club_rewards_earned table exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleos_club_rewards_earned')::text
  UNION ALL
  SELECT 5, 'seasonal sticker date columns exist',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cleos_club_sticker_types' AND column_name = 'available_from')::text
  UNION ALL
  SELECT 6, 'cleos_club_set_completion_bonuses table exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleos_club_set_completion_bonuses')::text
  UNION ALL
  SELECT 7, 'studio_addons table exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'studio_addons')::text
  UNION ALL
  SELECT 8, 'community_posts screening_status column exists',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'community_posts' AND column_name = 'screening_status')::text
  UNION ALL
  SELECT 9, 'HALLOWEEN sticker present',
    EXISTS (SELECT 1 FROM cleos_club_sticker_types WHERE code = 'cleo-halloween')::text
  UNION ALL
  SELECT 10, 'CHRISTMAS sticker present',
    EXISTS (SELECT 1 FROM cleos_club_sticker_types WHERE code = 'cleo-christmas')::text
) x ORDER BY ord;
