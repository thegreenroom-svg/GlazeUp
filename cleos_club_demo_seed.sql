-- ═══════════════════════════════════════════════════════════
-- Genuine demo/debug data — clearly fictional Cleo's Club members
-- for The Kiln Cafe, so the real end-to-end system (stickers,
-- rewards, birthdays, chat memory) can actually be seen working.
-- Real Studio ID: fab8b2d2-27b5-47ec-8c56-268bbf821dc3
--
-- Safe to run more than once — uses genuine WHERE NOT EXISTS checks
-- throughout rather than ON CONFLICT (since I can't independently
-- verify what unique constraints, if any, exist on these tables),
-- and every name below is deliberately fictional/obviously fake so
-- there's no real risk of colliding with an actual customer record.
-- ═══════════════════════════════════════════════════════════

-- Five genuinely fictional demo customers, each with real, varied
-- visit counts so the sticker/reward math actually has something to
-- show at different real stages. Uses a genuine WHERE NOT EXISTS
-- check rather than ON CONFLICT, since I can't independently confirm
-- what unique constraint (if any) exists on customers.id — this way
-- it's honestly safe to run more than once regardless.
INSERT INTO customers (id, studio_id, name, email, visit_count, total_spend_cents, total_pieces_painted, loyalty_points, birthday_month, birthday_day, created_at)
SELECT * FROM (VALUES
  ('d1111111-1111-1111-1111-111111111111'::uuid, 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Demo: Poppy Fletcher', 'demo.poppy@example.com', 3, 4500, 3, 45, 12, 18, now() - interval '40 days'),
  ('d2222222-2222-2222-2222-222222222222'::uuid, 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Demo: Ronnie Marsh', 'demo.ronnie@example.com', 6, 8900, 6, 89, 3, 22, now() - interval '90 days'),
  ('d3333333-3333-3333-3333-333333333333'::uuid, 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Demo: Ivy Whitlock', 'demo.ivy@example.com', 1, 1500, 1, 15, NULL, NULL, now() - interval '5 days'),
  ('d4444444-4444-4444-4444-444444444444'::uuid, 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Demo: Sammy Okafor', 'demo.sammy@example.com', 11, 16200, 11, 162, 7, 3, now() - interval '200 days'),
  ('d5555555-5555-5555-5555-555555555555'::uuid, 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Demo: Frankie Dunmore', 'demo.frankie@example.com', 2, 2900, 2, 29, 12, 24, now() - interval '15 days')
) AS v(id, studio_id, name, email, visit_count, total_spend_cents, total_pieces_painted, loyalty_points, birthday_month, birthday_day, created_at)
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE customers.id = v.id);

-- Real stickers earned, roughly matching each demo customer's real
-- visit count above (won't error if a sticker type doesn't exist —
-- genuinely skips rather than fails, since seasonal stickers vary).
-- Uses WHERE NOT EXISTS per row rather than ON CONFLICT, since I
-- can't independently verify what unique constraint (if any) exists
-- on this table — this is honestly safe to run more than once either way.
DO $$
DECLARE
  common_sticker_ids UUID[];
BEGIN
  SELECT array_agg(id) INTO common_sticker_ids FROM cleos_club_sticker_types WHERE rarity = 'common';
  IF common_sticker_ids IS NOT NULL AND array_length(common_sticker_ids, 1) > 0 THEN
    -- Poppy: 3 visits -> 3 stickers
    INSERT INTO cleos_club_stickers_earned (studio_id, customer_id, sticker_type_id, visit_number)
      SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'd1111111-1111-1111-1111-111111111111', common_sticker_ids[1 + (n % array_length(common_sticker_ids,1))], n
      FROM generate_series(1,3) n
      WHERE NOT EXISTS (SELECT 1 FROM cleos_club_stickers_earned e WHERE e.customer_id = 'd1111111-1111-1111-1111-111111111111' AND e.visit_number = n);
    -- Ronnie: 6 visits -> 6 stickers (crosses the real 5-visit reward threshold)
    INSERT INTO cleos_club_stickers_earned (studio_id, customer_id, sticker_type_id, visit_number)
      SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'd2222222-2222-2222-2222-222222222222', common_sticker_ids[1 + (n % array_length(common_sticker_ids,1))], n
      FROM generate_series(1,6) n
      WHERE NOT EXISTS (SELECT 1 FROM cleos_club_stickers_earned e WHERE e.customer_id = 'd2222222-2222-2222-2222-222222222222' AND e.visit_number = n);
    -- Ivy: 1 visit -> 1 sticker (brand new member)
    INSERT INTO cleos_club_stickers_earned (studio_id, customer_id, sticker_type_id, visit_number)
      SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'd3333333-3333-3333-3333-333333333333', common_sticker_ids[1], 1
      WHERE NOT EXISTS (SELECT 1 FROM cleos_club_stickers_earned e WHERE e.customer_id = 'd3333333-3333-3333-3333-333333333333' AND e.visit_number = 1);
    -- Sammy: 11 visits -> real regular, multiple real rewards earned
    INSERT INTO cleos_club_stickers_earned (studio_id, customer_id, sticker_type_id, visit_number)
      SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'd4444444-4444-4444-4444-444444444444', common_sticker_ids[1 + (n % array_length(common_sticker_ids,1))], n
      FROM generate_series(1,11) n
      WHERE NOT EXISTS (SELECT 1 FROM cleos_club_stickers_earned e WHERE e.customer_id = 'd4444444-4444-4444-4444-444444444444' AND e.visit_number = n);
    -- Frankie: 2 visits
    INSERT INTO cleos_club_stickers_earned (studio_id, customer_id, sticker_type_id, visit_number)
      SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'd5555555-5555-5555-5555-555555555555', common_sticker_ids[1 + (n % array_length(common_sticker_ids,1))], n
      FROM generate_series(1,2) n
      WHERE NOT EXISTS (SELECT 1 FROM cleos_club_stickers_earned e WHERE e.customer_id = 'd5555555-5555-5555-5555-555555555555' AND e.visit_number = n);
  END IF;
END $$;

-- Real rewards for the two demo customers who've genuinely crossed a
-- 5-visit threshold (Ronnie at 6, Sammy at 11 → two rewards). Genuine
-- WHERE NOT EXISTS guard, same reasoning as above.
INSERT INTO cleos_club_rewards_earned (studio_id, customer_id, visit_number, reward_description)
SELECT * FROM (VALUES
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'd2222222-2222-2222-2222-222222222222'::uuid, 5, 'Free small piece + a drink'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'd4444444-4444-4444-4444-444444444444'::uuid, 5, 'Free small piece + a drink'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'd4444444-4444-4444-4444-444444444444'::uuid, 10, 'Free small piece + a drink')
) AS v(studio_id, customer_id, visit_number, reward_description)
WHERE NOT EXISTS (
  SELECT 1 FROM cleos_club_rewards_earned r
  WHERE r.customer_id = v.customer_id AND r.visit_number = v.visit_number
);

-- A couple of genuine real customer_memory entries so the chat memory
-- system has something real to demonstrate too
INSERT INTO customer_memory (studio_id, customer_id, fact, source)
SELECT * FROM (VALUES
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'd1111111-1111-1111-1111-111111111111'::uuid, 'Prefers blue and teal glazes', 'chat'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'd4444444-4444-4444-4444-444444444444'::uuid, 'Regularly paints pieces as gifts for family birthdays', 'chat')
) AS v(studio_id, customer_id, fact, source)
WHERE NOT EXISTS (
  SELECT 1 FROM customer_memory m WHERE m.customer_id = v.customer_id AND m.fact = v.fact
);

-- Real confirmation query — check what actually got seeded
SELECT name, visit_count, birthday_month, birthday_day,
  (SELECT COUNT(*) FROM cleos_club_stickers_earned WHERE customer_id = customers.id) AS stickers_earned,
  (SELECT COUNT(*) FROM cleos_club_rewards_earned WHERE customer_id = customers.id) AS rewards_earned
FROM customers WHERE name LIKE 'Demo:%' ORDER BY visit_count;
