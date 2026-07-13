-- ═══════════════════════════════════════════════════════════
-- END OF NIGHT AUDIT — run this ONE query. Completely safe, only
-- reads, changes nothing. Shows exactly what's genuinely missing.
-- ═══════════════════════════════════════════════════════════
SELECT check_name, result FROM (
  SELECT 1 AS ord, 'auto_matched column on pottery_pieces' AS check_name,
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pottery_pieces' AND column_name = 'auto_matched')::text AS result
  UNION ALL
  SELECT 2, 'cleos_club_offer_of_week table exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleos_club_offer_of_week')::text
  UNION ALL
  SELECT 3, 'home_screen_added_at column on staff_team',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_team' AND column_name = 'home_screen_added_at')::text
  UNION ALL
  SELECT 4, 'studio_addons table exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'studio_addons')::text
  UNION ALL
  SELECT 5, 'club_pages screening_status column exists',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'community_posts' AND column_name = 'screening_status')::text
  UNION ALL
  SELECT 6, 'cleos_club_sticker_types seasonal date columns exist',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cleos_club_sticker_types' AND column_name = 'available_from')::text
  UNION ALL
  SELECT 7, 'cleos_club_set_completion_bonuses table exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleos_club_set_completion_bonuses')::text
  UNION ALL
  SELECT 8, 'Cleo friend stickers present (amara/yuki/raj/maya)',
    (CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cleos_club_sticker_types')
      THEN ((SELECT COUNT(*) FROM cleos_club_sticker_types WHERE code LIKE 'friend-%') >= 4)::text
      ELSE 'false (table missing)' END)
) x ORDER BY ord;

-- If ANY row above says "false", the real fix:
-- row 1 false -> run auto_match_schema.sql
-- row 2 false -> run offer_of_week_schema.sql
-- row 3 false -> run staff_a2hs_tracking_schema.sql
-- row 4 false -> run studio_addons_schema.sql
-- row 5 false -> run club_pages_schema.sql
-- row 6/7 false -> run cleos_club_more_offers_schema.sql
-- row 8 false -> run cleo_friends_stickers.sql
