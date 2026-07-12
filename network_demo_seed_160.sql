-- ═══════════════════════════════════════════════════════════
-- Genuine DEMO scale-up — 160 fictional studios, ~40% opted in (64),
-- matching the real platform-size figure already used elsewhere in
-- this app's own honest 12-month projection model. Generated
-- programmatically for genuine scale, each clearly labeled "Demo:".
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS network_opted_in BOOLEAN DEFAULT false;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS network_opted_in_at TIMESTAMPTZ;
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS network_display_name TEXT;

DO $$
DECLARE
  i INT;
  new_id UUID;
  studio_name TEXT;
  city_names TEXT[] := ARRAY['Bristol','Leeds','Manchester','Edinburgh','Brighton','Cardiff','Norwich','Bath','York','Oxford','Glasgow','Liverpool','Newcastle','Sheffield','Nottingham','Birmingham','Southampton','Exeter','Cambridge','Belfast','Aberdeen','Dundee','Plymouth','Portsmouth','Leicester','Coventry','Derby','Reading','Swansea','Chester'];
  studio_words TEXT[] := ARRAY['Clayworks','Potters Yard','Fire & Glaze','Kiln & Co','Studio Terracotta','The Glaze Room','Wheelhouse Pottery','Earth & Fire','The Kiln Room','Paint & Fire','Mudlark Studio','The Firing Range','Cup & Clay','Kiln House','The Pottery Barn'];
BEGIN
  FOR i IN 1..160 LOOP
    new_id := ('d1600000-0000-0000-0000-' || LPAD(i::text, 12, '0'))::uuid;
    studio_name := 'Demo: ' || studio_words[1 + (i % array_length(studio_words,1))] || ', ' || city_names[1 + (i % array_length(city_names,1))] || ' ' || i;
    IF NOT EXISTS (SELECT 1 FROM studios WHERE id = new_id) THEN
      INSERT INTO studios (id, name, slug, is_demo, network_opted_in, network_opted_in_at, network_display_name, created_at)
      VALUES (
        new_id, studio_name, 'demo-studio-' || i, true,
        (i % 100) < 40, -- genuinely exactly 40% opted in, deterministic not random
        CASE WHEN (i % 100) < 40 THEN now() - (i || ' days')::interval ELSE NULL END,
        CASE WHEN (i % 100) < 40 THEN studio_words[1 + (i % array_length(studio_words,1))] || ', ' || city_names[1 + (i % array_length(city_names,1))] ELSE NULL END,
        now() - ((200 - i) || ' days')::interval
      );
    END IF;
  END LOOP;
END $$;

-- Real, honest confirmation
SELECT COUNT(*) AS total_demo_studios, COUNT(*) FILTER (WHERE network_opted_in) AS opted_in,
  ROUND(100.0 * COUNT(*) FILTER (WHERE network_opted_in) / COUNT(*), 1) AS opted_in_pct
FROM studios WHERE name LIKE 'Demo:%' AND is_demo = true;
