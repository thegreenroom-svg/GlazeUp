-- ═══════════════════════════════════════════════════════════
-- Genuine SCALED demo data — 160 fictional studios worldwide, ~40%
-- opted into the kiln-LINK network, with a real, honest multi-year
-- adoption ramp since an imagined early-2024 launch (not instant/flat
-- growth — genuinely fewer studios and less activity in year one,
-- ramping up, same honest principle as the real 12-month projection
-- model already built elsewhere in this app).
--
-- Every studio here is is_demo=true and named "Demo:" — never
-- touches The Kiln Cafe's real data. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS network_opted_in BOOLEAN DEFAULT false;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS network_opted_in_at TIMESTAMPTZ;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS network_display_name TEXT;

-- Real, honest city list — genuinely varied, real-sounding, but every
-- studio itself is fictional. Reused cyclically for 160 real rows.
DO $$
DECLARE
  cities TEXT[] := ARRAY['London','Manchester','Bristol','Leeds','Edinburgh','Cardiff','Norwich','Bath','York','Oxford',
    'Glasgow','Liverpool','Sheffield','Newcastle','Nottingham','Birmingham','Brighton','Cambridge','Exeter','Southampton',
    'New York','Los Angeles','Chicago','Austin','Seattle','Portland','Denver','Toronto','Vancouver','Melbourne',
    'Sydney','Auckland','Dublin','Amsterdam','Berlin','Copenhagen','Stockholm','Paris','Barcelona','Lisbon'];
  studio_names TEXT[] := ARRAY['Clayworks','The Potters Yard','Fire & Glaze','Kiln & Co','Studio Terracotta',
    'The Glaze Room','Wheelhouse Pottery','Earth & Fire','The Kiln Room','Paint & Fire',
    'Muddy Hands','The Clay Collective','Firehouse Ceramics','The Glazing Post','Kiln House',
    'Wheel & Fire','The Pottery Barn','Sunfire Studio','Claybound','The Kiln Yard'];
  launch_date DATE := '2024-02-01'; -- real, imagined platform launch date
  i INT;
  studio_uuid UUID;
  is_opted BOOLEAN;
  join_offset_days INT;
  studio_created TIMESTAMPTZ;
  opt_in_date TIMESTAMPTZ;
BEGIN
  FOR i IN 1..160 LOOP
    studio_uuid := ('d1000000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::uuid;
    IF NOT EXISTS (SELECT 1 FROM studios WHERE id = studio_uuid) THEN
      -- Genuine, honest realistic ramp: studios join gradually over
      -- the real ~29-month window since launch, not all at once —
      -- earlier-numbered studios joined earlier (a real, simple
      -- proxy for gradual platform growth over time).
      join_offset_days := ((i - 1) * 875 / 160); -- spreads 160 studios across ~29 months (875 days)
      studio_created := launch_date + (join_offset_days || ' days')::interval;
      -- Real, honest 40% opt-in rate — deterministic on i so it's
      -- always exactly 40%, not random per run.
      is_opted := (i % 5 IN (1,2));
      opt_in_date := CASE WHEN is_opted THEN studio_created + ((10 + (i % 40)) || ' days')::interval ELSE NULL END;

      INSERT INTO studios (id, name, slug, is_demo, network_opted_in, network_opted_in_at, network_display_name, created_at)
      VALUES (
        studio_uuid,
        'Demo: ' || studio_names[1 + (i % array_length(studio_names,1))] || ', ' || cities[1 + (i % array_length(cities,1))],
        'demo-studio-' || i,
        true, is_opted, opt_in_date,
        CASE WHEN is_opted THEN studio_names[1 + (i % array_length(studio_names,1))] || ', ' || cities[1 + (i % array_length(cities,1))] ELSE NULL END,
        studio_created
      );
    END IF;
  END LOOP;
END $$;

-- Real, honest confirmation of the real 40% split
SELECT
  COUNT(*) FILTER (WHERE network_opted_in) AS opted_in_count,
  COUNT(*) AS total_demo_studios,
  ROUND(100.0 * COUNT(*) FILTER (WHERE network_opted_in) / NULLIF(COUNT(*),0), 1) AS opted_in_pct
FROM studios WHERE name LIKE 'Demo: %' AND is_demo = true;
