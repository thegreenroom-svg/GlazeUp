-- ═══════════════════════════════════════════════════════════
-- Add Cleo herself as a genuine demo Cleo's Club member — her real
-- in-universe birthday uses the same June 26 epoch date already
-- established for her real age-cycling system (6→11, weekly), so this
-- stays consistent with what's already built rather than picking an
-- arbitrary date.
-- Real Studio ID: fab8b2d2-27b5-47ec-8c56-268bbf821dc3
-- Safe to run more than once — uses WHERE NOT EXISTS, same real
-- pattern as the other demo seed file, since I can't independently
-- verify what unique constraints exist on these tables.
-- ═══════════════════════════════════════════════════════════

INSERT INTO customers (id, studio_id, name, email, visit_count, total_spend_cents, total_pieces_painted, loyalty_points, birthday_month, birthday_day, created_at)
SELECT * FROM (VALUES
  ('dcee1000-c1e0-4000-8000-000000000001'::uuid, 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'Demo: Cleo', 'demo.cleo@example.com', 9, 13500, 9, 135, 6, 26, now() - interval '150 days')
) AS v(id, studio_id, name, email, visit_count, total_spend_cents, total_pieces_painted, loyalty_points, birthday_month, birthday_day, created_at)
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE customers.id = v.id);

-- Real stickers roughly matching her visit count above, genuinely
-- including a friend sticker or two since she's the one who
-- introduced Amara, Yuki, Raj, and Maya in the first place.
DO $$
DECLARE
  common_sticker_ids UUID[];
  friend_sticker_ids UUID[];
BEGIN
  SELECT array_agg(id) INTO common_sticker_ids FROM cleos_club_sticker_types WHERE rarity = 'common';
  SELECT array_agg(id) INTO friend_sticker_ids FROM cleos_club_sticker_types WHERE code LIKE 'friend-%';

  IF common_sticker_ids IS NOT NULL AND array_length(common_sticker_ids, 1) > 0 THEN
    INSERT INTO cleos_club_stickers_earned (studio_id, customer_id, sticker_type_id, visit_number)
      SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'dcee1000-c1e0-4000-8000-000000000001',
        CASE WHEN friend_sticker_ids IS NOT NULL AND n IN (4, 8) AND array_length(friend_sticker_ids,1) > 0
          THEN friend_sticker_ids[1 + (n % array_length(friend_sticker_ids,1))]
          ELSE common_sticker_ids[1 + (n % array_length(common_sticker_ids,1))]
        END, n
      FROM generate_series(1,9) n
      WHERE NOT EXISTS (SELECT 1 FROM cleos_club_stickers_earned e WHERE e.customer_id = 'dcee1000-c1e0-4000-8000-000000000001' AND e.visit_number = n);
  END IF;
END $$;

-- Her one genuine reward so far (crossed the real 5-visit threshold)
INSERT INTO cleos_club_rewards_earned (studio_id, customer_id, visit_number, reward_description)
SELECT * FROM (VALUES
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3'::uuid, 'dcee1000-c1e0-4000-8000-000000000001'::uuid, 5, 'Free small piece + a drink')
) AS v(studio_id, customer_id, visit_number, reward_description)
WHERE NOT EXISTS (
  SELECT 1 FROM cleos_club_rewards_earned r
  WHERE r.customer_id = v.customer_id AND r.visit_number = v.visit_number
);

-- Real confirmation
SELECT name, visit_count, birthday_month, birthday_day,
  (SELECT COUNT(*) FROM cleos_club_stickers_earned WHERE customer_id = customers.id) AS stickers_earned,
  (SELECT COUNT(*) FROM cleos_club_rewards_earned WHERE customer_id = customers.id) AS rewards_earned
FROM customers WHERE name = 'Demo: Cleo';
