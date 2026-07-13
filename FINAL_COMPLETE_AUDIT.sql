-- ═══════════════════════════════════════════════════════════
-- FINAL, COMPLETE AUDIT — covers every real schema addition from
-- tonight's entire session, in one single query. Completely safe,
-- read-only, changes nothing.
-- ═══════════════════════════════════════════════════════════
SELECT check_name, result FROM (
  SELECT 1 AS ord, 'damage_reports table exists' AS check_name,
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'damage_reports')::text AS result
  UNION ALL
  SELECT 2, 'pottery_pieces.damaged column exists',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pottery_pieces' AND column_name = 'damaged')::text
  UNION ALL
  SELECT 3, 'closing_checklist_log table exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'closing_checklist_log')::text
  UNION ALL
  SELECT 4, 'closing_checklist_log.was_skipped column exists',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'closing_checklist_log' AND column_name = 'was_skipped')::text
  UNION ALL
  SELECT 5, 'studio_promotions table exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'studio_promotions')::text
  UNION ALL
  SELECT 6, 'customers.birthday_month column exists',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'birthday_month')::text
  UNION ALL
  SELECT 7, 'customer_memory table exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_memory')::text
  UNION ALL
  SELECT 8, 'studio_knowledge table exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'studio_knowledge')::text
  UNION ALL
  SELECT 9, 'staff_task_usage table exists',
    EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'staff_task_usage')::text
  UNION ALL
  SELECT 10, 'pottery_pieces.auto_matched column exists',
    EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'pottery_pieces' AND column_name = 'auto_matched')::text
) x ORDER BY ord;

-- If ANY row says "false":
-- row 1-2  -> run damage_reports_schema.sql
-- row 3-4  -> run closing_checklist_schema.sql
-- row 5    -> run offer_of_week_schema.sql (studio_promotions is defined there? if not, check cleo_knowledge_expansion_schema.sql)
-- row 6    -> run cleo_knowledge_expansion_schema.sql
-- row 7    -> run cleo_memory_schema.sql
-- row 8    -> run cleo_memory_schema.sql
-- row 9    -> run staff_task_usage_schema.sql
-- row 10   -> run auto_match_schema.sql
