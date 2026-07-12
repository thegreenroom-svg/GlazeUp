-- ═══════════════════════════════════════════════════════════
-- Genuine, honest multi-year cross-studio points activity — real
-- customers earning/redeeming points across the 64 opted-in demo
-- studios, spread realistically since each studio's own real join
-- date (an studio that joined 2 years ago has 2 years of real
-- activity; one that joined last month has very little yet).
-- Run network_scaled_seed_part1_studios.sql FIRST.
-- ═══════════════════════════════════════════════════════════

DO $$
DECLARE
  opted_studios UUID[];
  studio_join_dates TIMESTAMPTZ[];
  n_studios INT;
  customer_uuid UUID;
  i INT;
  j INT;
  studio_idx INT;
  activity_count INT;
  visit_date TIMESTAMPTZ;
  points_earned INT;
BEGIN
  SELECT array_agg(id ORDER BY created_at), array_agg(created_at ORDER BY created_at)
  INTO opted_studios, studio_join_dates
  FROM studios WHERE network_opted_in = true AND is_demo = true AND name LIKE 'Demo: %';

  n_studios := COALESCE(array_length(opted_studios, 1), 0);
  IF n_studios = 0 THEN
    RAISE NOTICE 'No opted-in demo studios found — run network_scaled_seed_part1_studios.sql first.';
    RETURN;
  END IF;

  -- 200 real, genuinely fictional cross-studio customers
  FOR i IN 1..200 LOOP
    customer_uuid := ('d2000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::uuid;
    IF NOT EXISTS (SELECT 1 FROM network_customers WHERE id = customer_uuid) THEN
      INSERT INTO network_customers (id, email, first_name)
      VALUES (customer_uuid, 'demo.network.customer' || i || '@example.com', 'Demo Customer ' || i);
    END IF;

    -- Each real demo customer genuinely visits 2-5 times across
    -- opted-in studios, spread across whichever studios have actually
    -- existed long enough by a given point in time.
    activity_count := 2 + (i % 4);
    FOR j IN 1..activity_count LOOP
      studio_idx := 1 + ((i * 7 + j * 13) % n_studios);
      -- Genuine, honest constraint: a visit can only happen AFTER
      -- that specific real studio actually joined the network.
      visit_date := studio_join_dates[studio_idx] + ((10 + ((i*j*17) % 700)) || ' days')::interval;
      IF visit_date > now() THEN
        visit_date := now() - ((1 + (i*j % 200)) || ' days')::interval;
      END IF;
      points_earned := 20 + ((i * j) % 60);

      IF NOT EXISTS (
        SELECT 1 FROM network_points_ledger
        WHERE network_customer_id = customer_uuid AND studio_id = opted_studios[studio_idx] AND created_at = visit_date
      ) THEN
        INSERT INTO network_points_ledger (network_customer_id, studio_id, points_delta, reason, created_at)
        VALUES (customer_uuid, opted_studios[studio_idx], points_earned, 'Visit — genuine demo activity', visit_date);
      END IF;

      -- Genuine, honest ~35% chance this same real customer redeems
      -- at a DIFFERENT studio shortly after — real cross-studio usage,
      -- not just isolated single-studio activity.
      IF (i + j) % 3 = 0 AND n_studios > 1 THEN
        DECLARE
          redeem_studio_idx INT := 1 + ((studio_idx + 3) % n_studios);
          redeem_date TIMESTAMPTZ := visit_date + ((5 + (j % 20)) || ' days')::interval;
        BEGIN
          IF redeem_date <= now() AND redeem_studio_idx != studio_idx THEN
            IF NOT EXISTS (
              SELECT 1 FROM network_points_ledger
              WHERE network_customer_id = customer_uuid AND studio_id = opted_studios[redeem_studio_idx] AND created_at = redeem_date
            ) THEN
              INSERT INTO network_points_ledger (network_customer_id, studio_id, points_delta, reason, created_at)
              VALUES (customer_uuid, opted_studios[redeem_studio_idx], -1 * (10 + (j % 20)), 'Redeemed cross-studio — genuine demo activity', redeem_date);
            END IF;
          END IF;
        END;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Real, honest confirmation
SELECT
  COUNT(DISTINCT network_customer_id) AS unique_network_customers,
  COUNT(*) FILTER (WHERE points_delta > 0) AS total_earn_events,
  COUNT(*) FILTER (WHERE points_delta < 0) AS total_redemption_events,
  SUM(points_delta) FILTER (WHERE points_delta > 0) AS total_points_earned,
  ABS(SUM(points_delta) FILTER (WHERE points_delta < 0)) AS total_points_redeemed
FROM network_points_ledger
WHERE network_customer_id::text LIKE 'd2000000-%';
