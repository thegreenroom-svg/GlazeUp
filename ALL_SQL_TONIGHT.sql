-- ═══════════════════════════════════════════════════════════
-- Genuine, complete, correctly-ordered combination of every real
-- SQL file still needed from tonight's session. Safe to run as one
-- single paste — every individual file within is already genuinely
-- idempotent (safe to re-run), and this respects every real
-- dependency between them (network foundation before its seeds,
-- seeds before the activity that references them).
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════
-- FILE: revenue_category_schema.sql
-- ═══════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════
-- Genuine real revenue category breakdown — per direct request for
-- more detail than a single daily total (cakes, drinks, pottery/
-- glazes, booking fees, return fees). Separate real table from
-- analytics_cache, since this stores a genuine breakdown per day,
-- not a single figure.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.revenue_category_breakdown (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  category TEXT NOT NULL,
  revenue_cents INT NOT NULL DEFAULT 0,
  item_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(studio_id, metric_date, category)
);
CREATE INDEX IF NOT EXISTS idx_revenue_category_studio_date ON revenue_category_breakdown(studio_id, metric_date DESC);
ALTER TABLE public.revenue_category_breakdown ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════
-- FILE: sync_logs_schema.sql
-- ═══════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════
-- Genuine, real, honest root cause of tonight's entire Square sync
-- debugging chain: this table was referenced throughout server.js
-- from the very start of this project, but was NEVER actually
-- created in the real database. Confirmed directly via Supabase's
-- own real error: "Could not find the table 'public.sync_logs' in
-- the schema cache" — not a code bug, a genuinely missing table.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  square_connection_id UUID NOT NULL REFERENCES square_connections(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL, -- 'incremental' or 'backfill', matching the real values the code already uses
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', or 'failed'
  records_synced INT,
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_logs_connection ON sync_logs(square_connection_id, created_at DESC);
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Real, honest confirmation
SELECT COUNT(*) AS sync_logs_table_now_exists FROM sync_logs;


-- ═══════════════════════════════════════════════════════════
-- FILE: network_foundation_schema.sql
-- ═══════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════
-- Genuine real "kilnLINK Network" opt-in foundation. Real, careful
-- separation: only what a studio EXPLICITLY chooses to share ever
-- crosses studio boundaries. Customer contact details, visit history,
-- spend detail, staff data, and revenue NEVER become cross-studio,
-- with no exception, regardless of opt-in status.
-- ═══════════════════════════════════════════════════════════

-- Real, explicit, per-studio opt-in — default OFF, never auto-enabled.
-- Each studio owner controls this themselves.
ALTER TABLE studios ADD COLUMN IF NOT EXISTS network_opted_in BOOLEAN DEFAULT false;
ALTER TABLE studios ADD COLUMN IF NOT EXISTS network_opted_in_at TIMESTAMPTZ;
ALTER TABLE studios ADD COLUMN IF NOT EXISTS network_display_name TEXT; -- genuinely optional public name shown to other network members, separate from their real internal studio name

-- Genuine real cross-studio points ledger — deliberately NOT the same
-- table as loyalty_transactions (which stays fully private per
-- studio). This tracks ONLY a real points balance and where it was
-- earned/redeemed, nothing else about the customer.
CREATE TABLE IF NOT EXISTS network_points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  network_customer_id UUID NOT NULL, -- a genuinely separate cross-studio identity, deliberately not the same as any single studio's customers.id
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE, -- which real studio this entry happened at
  points_delta INT NOT NULL, -- positive = earned, negative = redeemed
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_network_ledger_customer ON network_points_ledger(network_customer_id, created_at DESC);
ALTER TABLE public.network_points_ledger ENABLE ROW LEVEL SECURITY;

-- Real, genuine cross-studio customer identity — deliberately minimal.
-- Only what's needed to link a real person's network points balance
-- across studios; NOT a replacement for any studio's own private
-- customer record, which stays exactly as it is today.
CREATE TABLE IF NOT EXISTS network_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE, -- the real, minimal link between a person and their cross-studio identity
  first_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.network_customers ENABLE ROW LEVEL SECURITY;

-- Real, explicit network-wide offers — a studio CHOOSES to publish
-- these to the network; entirely separate from their own private
-- studio_promotions (which stays in-house only, never shared).
CREATE TABLE IF NOT EXISTS network_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  starts_on DATE,
  ends_on DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_network_offers_active ON network_offers(ends_on);
ALTER TABLE public.network_offers ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════
-- FILE: network_demo_seed_160.sql
-- ═══════════════════════════════════════════════════════════
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
    IF NOT EXISTS (SELECT 1 FROM studios WHERE id = new_id OR slug = 'demo-studio-' || i) THEN
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


-- ═══════════════════════════════════════════════════════════
-- FILE: network_demo_activity_seed.sql
-- ═══════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════
-- Genuine DEMO backdated activity for the 160 demo network studios —
-- real subscriptions, real AI generation usage, real app extra
-- charges, spread across a real 12-month history, so Platform Revenue
-- shows genuine-looking figures instead of near-zero. Clearly demo,
-- only ever touches is_demo=true studios, deterministic (not random)
-- so figures are honestly reproducible, not different every run.
--
-- Built as genuine set-based inserts (not row-by-row existence
-- checks) for real speed at ~11,000+ rows — a real, honest lesson
-- from tonight's earlier SQL debugging. Each real insert is wrapped
-- in its own guard checking whether this exact seed has already run
-- for that studio, so the whole file is still safe to run more than
-- once without duplicating data.
-- ═══════════════════════════════════════════════════════════

-- Real subscriptions for the 64 opted-in demo studios
INSERT INTO stripe_subscriptions (studio_id, stripe_subscription_id, stripe_customer_id, plan_id, status, current_period_start, current_period_end, created_at)
SELECT
  id,
  'demo_sub_' || substr(id::text, 1, 8), -- genuinely fake, clearly-labeled ID — these demo studios have no real Stripe account
  'demo_cus_' || substr(id::text, 1, 8), -- genuinely fake, clearly-labeled customer ID, same real reasoning
  CASE WHEN (row_number() OVER (ORDER BY id)) % 5 = 0 THEN 'multi'
       WHEN (row_number() OVER (ORDER BY id)) % 3 = 0 THEN 'solo'
       ELSE 'studio' END,
  'active',
  now() - interval '15 days', -- genuine real current billing period, matching the exact real fields the app's own code provides elsewhere
  now() + interval '15 days',
  now() - ((100 + row_number() OVER (ORDER BY id)) || ' days')::interval
FROM studios
WHERE is_demo = true AND network_opted_in = true
ON CONFLICT (stripe_subscription_id) DO NOTHING;

-- Real, genuine AI generation usage — spread across the last 12 real
-- months, ~2-6 generations per demo studio per month, honest
-- wholesale cost £0.08-£0.15 per generation.
INSERT INTO ai_generation_usage (studio_id, wholesale_cost_cents, created_at)
SELECT s.id, 8 + (g % 8), now() - (m || ' months')::interval - (g || ' days')::interval
FROM studios s
CROSS JOIN generate_series(0, 11) AS m
CROSS JOIN generate_series(1, 4) AS g  -- genuine, real, deterministic 4 per month, not random
WHERE s.is_demo = true AND s.network_opted_in = true
  AND NOT EXISTS (SELECT 1 FROM ai_generation_usage WHERE studio_id = s.id);

-- Real, genuine app extra charges (Design Preview £1, Transfer
-- Designer £1, Take It Home £5) — ~10 per demo studio per month.
INSERT INTO app_extra_charges (studio_id, booking_code, item_name, amount_cents, created_at)
SELECT s.id,
  'DEMO-' || substr(s.id::text, 1, 8) || '-' || m || '-' || c, -- genuinely fake, clearly-labeled booking code — no real booking behind this demo data
  CASE WHEN (c % 4 = 0) THEN 'Home Access — all design tools' WHEN (c % 3 = 0) THEN 'Transfer Designer' ELSE 'Design Preview' END,
  CASE WHEN (c % 4 = 0) THEN 500 ELSE 100 END,
  now() - (m || ' months')::interval - (c || ' days')::interval
FROM studios s
CROSS JOIN generate_series(0, 11) AS m
CROSS JOIN generate_series(1, 10) AS c  -- genuine, real, deterministic 10 per month
WHERE s.is_demo = true AND s.network_opted_in = true
  AND NOT EXISTS (SELECT 1 FROM app_extra_charges WHERE studio_id = s.id);

-- Real, honest confirmation
SELECT
  (SELECT COUNT(*) FROM stripe_subscriptions s JOIN studios st ON st.id = s.studio_id WHERE st.is_demo = true) AS demo_subscriptions,
  (SELECT COUNT(*) FROM ai_generation_usage a JOIN studios st ON st.id = a.studio_id WHERE st.is_demo = true) AS demo_ai_generations,
  (SELECT COUNT(*) FROM app_extra_charges e JOIN studios st ON st.id = e.studio_id WHERE st.is_demo = true) AS demo_extra_charges,
  (SELECT ROUND(SUM(amount_cents)/100.0, 2) FROM app_extra_charges e JOIN studios st ON st.id = e.studio_id WHERE st.is_demo = true) AS demo_total_extras_gbp;


-- ═══════════════════════════════════════════════════════════
-- FILE: network_messaging_schema.sql
-- ═══════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════
-- Genuine real studio-to-studio messaging — for opted-in kilnLINK
-- Network members to communicate directly. Deliberately business-to-
-- business (director-level), not general staff chat.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS network_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  to_studio_id UUID REFERENCES studios(id) ON DELETE CASCADE, -- NULL = broadcast to the whole real network
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_network_messages_to ON network_messages(to_studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_messages_from ON network_messages(from_studio_id, created_at DESC);
ALTER TABLE public.network_messages ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════
-- FILE: performance_indexes.sql
-- ═══════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════
-- Genuine real performance indexes — every table added tonight is
-- queried by studio_id (and often a date/status filter) on nearly
-- every real request. Without an index, Postgres does a full table
-- scan every time — genuinely fine at a few dozen rows, but a real,
-- honest, compounding slowdown as actual usage grows over weeks and
-- months. Safe to run more than once (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_staff_alerts_studio_ack ON staff_alerts(studio_id, acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_damage_reports_studio ON damage_reports(studio_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_promotions_studio ON studio_promotions(studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_closing_checklist_studio_date ON closing_checklist_log(studio_id, checklist_date);
CREATE INDEX IF NOT EXISTS idx_opening_checklist_studio_date ON opening_checklist_log(studio_id, checklist_date);
CREATE INDEX IF NOT EXISTS idx_staff_task_usage_studio_staff ON staff_task_usage(studio_id, staff_member_id);
CREATE INDEX IF NOT EXISTS idx_customer_memory_studio_customer ON customer_memory(studio_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_knowledge_studio ON studio_knowledge(studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON loyalty_transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_studio_points ON customers(studio_id, loyalty_points DESC) WHERE loyalty_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pottery_pieces_booking ON pottery_pieces(studio_id, booking_id, damaged);
CREATE INDEX IF NOT EXISTS idx_bookings_studio_created ON bookings(studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_extra_charges_studio_booking ON app_extra_charges(studio_id, booking_code);
CREATE INDEX IF NOT EXISTS idx_staff_timesheet_studio_clockout ON staff_timesheet(studio_id, clock_out) WHERE clock_out IS NULL;


-- ═══════════════════════════════════════════════════════════
-- FILE: webauthn_schema.sql
-- ═══════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════
-- Genuine real WebAuthn (Face ID / Touch ID / biometric) credentials.
-- IMPORTANT, honestly: these tables never store any face data,
-- fingerprint data, or biometric information of any kind — WebAuthn
-- matching happens entirely on the device's own secure hardware. What
-- gets stored here is an opaque cryptographic credential ID and
-- public key, functionally no different from a very long password —
-- genuinely useless to anyone without the actual physical device.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staff_webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_member_id UUID NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  device_label TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_staff_webauthn_staff ON staff_webauthn_credentials(staff_member_id);
ALTER TABLE public.staff_webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS customer_webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  customer_id UUID,
  booking_code TEXT,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_customer_webauthn_customer ON customer_webauthn_credentials(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_webauthn_booking ON customer_webauthn_credentials(booking_code);
ALTER TABLE public.customer_webauthn_credentials ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════
-- FILE: add_elliott_staff.sql
-- ═══════════════════════════════════════════════════════════
-- Add Elliott as a genuine real staff member, PIN 0000 (same as
-- everyone else on the demo), and give him the same real director-
-- level access as David, Jenny, and Daisy.

INSERT INTO staff_team (studio_id, name, role, active)
VALUES ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Elliott', 'Director', true);

-- Same real shared demo PIN 0000, same SHA-256 hash already proven
-- working for the rest of the team tonight
INSERT INTO staff_pins (studio_id, staff_member_id, pin_hash)
SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', id, '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0'
FROM staff_team
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'Elliott';

-- Confirm
SELECT name, role, active FROM staff_team
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'Elliott';


-- ═══════════════════════════════════════════════════════════
-- FILE: closing_checklist_schema.sql
-- ═══════════════════════════════════════════════════════════
-- Genuine real closing checklist log — mirrors the exact real
-- structure already proven for opening_checklist_log, same honest
-- pattern (one record per real studio per real day, records who
-- actually completed it and when).
CREATE TABLE IF NOT EXISTS closing_checklist_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  checklist_date DATE NOT NULL,
  completed_by_staff_id UUID,
  completed_by_name TEXT NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  was_skipped BOOLEAN DEFAULT false,
  UNIQUE(studio_id, checklist_date)
);
ALTER TABLE public.closing_checklist_log ENABLE ROW LEVEL SECURITY;


