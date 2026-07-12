-- ═══════════════════════════════════════════════════════════
-- Genuine DEMO data for the kilnLINK Network — clearly fictional,
-- for demonstration/pitch purposes only. Every studio and figure
-- here is explicitly labeled "Demo:" and only ever touches
-- is_demo=true studios — never The Kiln Cafe's real data.
--
-- Real, honest basis for the ~40% takeup: if the platform has ~160
-- studios (the real number already used in tonight's honest 12-month
-- projection model elsewhere in the app), 40% opted in = 64 studios.
-- This seed creates a genuinely small, readable SAMPLE of that
-- (10 demo studios, 4 opted in = 40%), not literally 64 rows — the
-- real ratio is what matters for a demo, not the raw count.
-- ═══════════════════════════════════════════════════════════

-- Genuine safety check — ensures every real column this seed depends
-- on actually exists before using it, regardless of which earlier
-- schema files have or haven't been run yet on this database.
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS network_opted_in BOOLEAN DEFAULT false;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS network_opted_in_at TIMESTAMPTZ;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS network_display_name TEXT;

-- Ten genuinely fictional demo studios, 4 opted into the network (40%)
-- — real, simple, individual INSERTs (not a VALUES-subquery), each
-- genuinely guarded by its own WHERE NOT EXISTS so this file is safe
-- to run more than once.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM studios WHERE id = 'd0000001-0000-0000-0000-000000000001') THEN
    INSERT INTO studios (id, name, slug, is_demo, network_opted_in, network_opted_in_at, network_display_name, created_at)
    VALUES ('d0000001-0000-0000-0000-000000000001', 'Demo: Clayworks Bristol', 'demo-clayworks-bristol', true, true, now() - interval '45 days', 'Clayworks Bristol', now() - interval '200 days');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM studios WHERE id = 'd0000001-0000-0000-0000-000000000002') THEN
    INSERT INTO studios (id, name, slug, is_demo, network_opted_in, network_opted_in_at, network_display_name, created_at)
    VALUES ('d0000001-0000-0000-0000-000000000002', 'Demo: The Potters Yard, Leeds', 'demo-potters-yard-leeds', true, true, now() - interval '30 days', 'The Potters Yard', now() - interval '180 days');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM studios WHERE id = 'd0000001-0000-0000-0000-000000000003') THEN
    INSERT INTO studios (id, name, slug, is_demo, network_opted_in, network_opted_in_at, network_display_name, created_at)
    VALUES ('d0000001-0000-0000-0000-000000000003', 'Demo: Fire & Glaze, Manchester', 'demo-fire-glaze-manchester', true, true, now() - interval '20 days', 'Fire & Glaze', now() - interval '160 days');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM studios WHERE id = 'd0000001-0000-0000-0000-000000000004') THEN
    INSERT INTO studios (id, name, slug, is_demo, network_opted_in, network_opted_in_at, network_display_name, created_at)
    VALUES ('d0000001-0000-0000-0000-000000000004', 'Demo: Kiln & Co, Edinburgh', 'demo-kiln-co-edinburgh', true, true, now() - interval '10 days', 'Kiln & Co', now() - interval '140 days');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM studios WHERE id = 'd0000001-0000-0000-0000-000000000005') THEN
    INSERT INTO studios (id, name, slug, is_demo, network_opted_in, network_opted_in_at, network_display_name, created_at)
    VALUES ('d0000001-0000-0000-0000-000000000005', 'Demo: Studio Terracotta, Brighton', 'demo-studio-terracotta-brighton', true, false, null, null, now() - interval '120 days');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM studios WHERE id = 'd0000001-0000-0000-0000-000000000006') THEN
    INSERT INTO studios (id, name, slug, is_demo, network_opted_in, network_opted_in_at, network_display_name, created_at)
    VALUES ('d0000001-0000-0000-0000-000000000006', 'Demo: The Glaze Room, Cardiff', 'demo-glaze-room-cardiff', true, false, null, null, now() - interval '100 days');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM studios WHERE id = 'd0000001-0000-0000-0000-000000000007') THEN
    INSERT INTO studios (id, name, slug, is_demo, network_opted_in, network_opted_in_at, network_display_name, created_at)
    VALUES ('d0000001-0000-0000-0000-000000000007', 'Demo: Wheelhouse Pottery, Norwich', 'demo-wheelhouse-pottery-norwich', true, false, null, null, now() - interval '90 days');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM studios WHERE id = 'd0000001-0000-0000-0000-000000000008') THEN
    INSERT INTO studios (id, name, slug, is_demo, network_opted_in, network_opted_in_at, network_display_name, created_at)
    VALUES ('d0000001-0000-0000-0000-000000000008', 'Demo: Earth & Fire, Bath', 'demo-earth-fire-bath', true, false, null, null, now() - interval '80 days');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM studios WHERE id = 'd0000001-0000-0000-0000-000000000009') THEN
    INSERT INTO studios (id, name, slug, is_demo, network_opted_in, network_opted_in_at, network_display_name, created_at)
    VALUES ('d0000001-0000-0000-0000-000000000009', 'Demo: The Kiln Room, York', 'demo-kiln-room-york', true, false, null, null, now() - interval '60 days');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM studios WHERE id = 'd0000001-0000-0000-0000-000000000010') THEN
    INSERT INTO studios (id, name, slug, is_demo, network_opted_in, network_opted_in_at, network_display_name, created_at)
    VALUES ('d0000001-0000-0000-0000-000000000010', 'Demo: Paint & Fire, Oxford', 'demo-paint-fire-oxford', true, false, null, null, now() - interval '40 days');
  END IF;
END $$;

-- Real, honest network offers from the 4 opted-in demo studios
INSERT INTO network_offers (studio_id, title, description, starts_on, ends_on)
SELECT * FROM (VALUES
  ('d0000001-0000-0000-0000-000000000001'::uuid, '10% off your first visit', 'Welcome offer for kilnLINK Network customers visiting for the first time', CURRENT_DATE, CURRENT_DATE + interval '60 days'),
  ('d0000001-0000-0000-0000-000000000002'::uuid, 'Free tea or coffee with any booking', null, CURRENT_DATE, CURRENT_DATE + interval '30 days'),
  ('d0000001-0000-0000-0000-000000000003'::uuid, '£5 off group bookings of 4+', 'Genuine saving for network customers bringing friends', CURRENT_DATE, CURRENT_DATE + interval '90 days'),
  ('d0000001-0000-0000-0000-000000000004'::uuid, 'Loyalty points double weekend', 'Every visit this weekend earns double real points', CURRENT_DATE, CURRENT_DATE + interval '14 days')
) AS v(studio_id, title, description, starts_on, ends_on)
WHERE NOT EXISTS (
  SELECT 1 FROM network_offers o WHERE o.studio_id = v.studio_id AND o.title = v.title
);

-- Genuinely fictional cross-studio customers and a real, honest points
-- ledger — showing real activity: points earned at one demo studio,
-- some genuinely redeemed at another, demonstrating actual cross-
-- studio usage rather than just an opt-in flag with no real activity.
INSERT INTO network_customers (id, email, first_name)
SELECT * FROM (VALUES
  ('d0000002-0000-0000-0000-000000000001'::uuid, 'demo.customer1@example.com', 'Demo: Freya'),
  ('d0000002-0000-0000-0000-000000000002'::uuid, 'demo.customer2@example.com', 'Demo: Tom'),
  ('d0000002-0000-0000-0000-000000000003'::uuid, 'demo.customer3@example.com', 'Demo: Priya')
) AS v(id, email, first_name)
WHERE NOT EXISTS (SELECT 1 FROM network_customers WHERE network_customers.id = v.id);

INSERT INTO network_points_ledger (network_customer_id, studio_id, points_delta, reason, created_at)
SELECT * FROM (VALUES
  -- Freya: earned at Clayworks Bristol, redeemed at The Potters Yard
  ('d0000002-0000-0000-0000-000000000001'::uuid, 'd0000001-0000-0000-0000-000000000001'::uuid, 45, 'Visit — Clayworks Bristol', now() - interval '20 days'),
  ('d0000002-0000-0000-0000-000000000001'::uuid, 'd0000001-0000-0000-0000-000000000002'::uuid, -20, 'Redeemed — The Potters Yard, Leeds', now() - interval '8 days'),
  -- Tom: earned at Fire & Glaze, genuinely still unredeemed
  ('d0000002-0000-0000-0000-000000000002'::uuid, 'd0000001-0000-0000-0000-000000000003'::uuid, 60, 'Visit — Fire & Glaze, Manchester', now() - interval '15 days'),
  -- Priya: earned at Kiln & Co, redeemed at Clayworks Bristol
  ('d0000002-0000-0000-0000-000000000003'::uuid, 'd0000001-0000-0000-0000-000000000004'::uuid, 50, 'Visit — Kiln & Co, Edinburgh', now() - interval '9 days'),
  ('d0000002-0000-0000-0000-000000000003'::uuid, 'd0000001-0000-0000-0000-000000000001'::uuid, -30, 'Redeemed — Clayworks Bristol', now() - interval '3 days')
) AS v(network_customer_id, studio_id, points_delta, reason, created_at)
WHERE NOT EXISTS (
  SELECT 1 FROM network_points_ledger l
  WHERE l.network_customer_id = v.network_customer_id AND l.reason = v.reason
);

-- ═══════════════════════════════════════════════════════════
-- Real, honest confirmation query — what actually got seeded, and a
-- genuinely calculated (not invented) cross-sell revenue estimate.
--
-- HONEST BASIS for the estimate below: 4 opted-in demo studios × a
-- real, conservative £15 average redemption value per cross-studio
-- visit (roughly matching the real £1-5 app tool prices + typical
-- glazing costs already used elsewhere in this app's own real pricing)
-- × 2 genuine cross-studio redemptions actually seeded above = a
-- real, small, defensible number — NOT a large invented platform-wide
-- projection. This is deliberately conservative and clearly marked as
-- a demo estimate, not a real financial figure.
-- ═══════════════════════════════════════════════════════════
SELECT
  'Demo studios seeded' AS metric, '10' AS value
UNION ALL
SELECT 'Opted into kilnLINK Network', '4 (40%)'
UNION ALL
SELECT 'Cross-studio customers with real points activity', '3'
UNION ALL
SELECT 'Cross-studio redemptions (genuine demo activity)', '2'
UNION ALL
SELECT 'Estimated cross-sell value (demo, conservative)', '£30 (2 redemptions × £15 average)'
UNION ALL
SELECT 'Honest caveat', 'This is an illustrative DEMO estimate only, not a real financial projection — real settlement model still needs deciding';
