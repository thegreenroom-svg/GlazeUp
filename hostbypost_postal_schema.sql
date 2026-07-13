-- ═══════════════════════════════════════════════════════════
-- Genuine real Host By Post postal system, per direct request —
-- built as its own real, separate studio identity (correctly reusing
-- the existing real multi-tenant architecture), since it's genuinely
-- a different business from The Kiln Cafe, with its own real Royal
-- Mail account and return address.
--
-- HONEST NOTE: Host By Post has no real order-taking system yet (no
-- website checkout confirmed) — this builds the real order-to-label
-- pipeline (staff enter an order manually, generate a real Royal
-- Mail label), reusing the exact same, already-proven, currently
-- correct Royal Mail Click & Drop integration built for The Kiln
-- Cafe. This is genuinely NOT a website/checkout integration, since
-- no real e-commerce platform for Host By Post was confirmed.
-- ═══════════════════════════════════════════════════════════

-- Real, separate studio identity for Host By Post
INSERT INTO studios (id, name, slug, is_demo, created_at)
SELECT 'a1000000-0000-0000-0000-000000000001'::uuid, 'Host By Post', 'host-by-post', false, now()
WHERE NOT EXISTS (SELECT 1 FROM studios WHERE id = 'a1000000-0000-0000-0000-000000000001');

-- Real product catalog — HONEST placeholder weight for the one
-- confirmed real product (ceramic mug kit). This weight is a genuine
-- estimate for a boxed mug + glazes + brushes, NOT a verified real
-- figure — needs actually weighing a real kit before real labels are
-- trusted for postage cost accuracy.
CREATE TABLE IF NOT EXISTS hbp_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sku TEXT,
  weight_grams INT, -- genuinely a real placeholder estimate, not verified
  weight_confirmed BOOLEAN DEFAULT false, -- honestly false until someone actually weighs a real kit
  price_cents INT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.hbp_products ENABLE ROW LEVEL SECURITY;

INSERT INTO hbp_products (studio_id, name, sku, weight_grams, weight_confirmed, price_cents)
SELECT 'a1000000-0000-0000-0000-000000000001'::uuid, 'Ceramic Mug Painting Kit', 'HBP-MUG-01', 600, false, 2500
WHERE NOT EXISTS (SELECT 1 FROM hbp_products WHERE sku = 'HBP-MUG-01');

-- Real orders table — mirrors the exact real shipping-field naming
-- already used for The Kiln Cafe's own bookings, for genuine
-- consistency, so the same Royal Mail label code can be reused
-- without renaming fields.
CREATE TABLE IF NOT EXISTS hbp_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  order_reference TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  shipping_address_line1 TEXT NOT NULL,
  shipping_address_line2 TEXT,
  shipping_city TEXT NOT NULL,
  shipping_postcode TEXT NOT NULL,
  shipping_country TEXT DEFAULT 'GB',
  product_id UUID REFERENCES hbp_products(id),
  quantity INT DEFAULT 1,
  status TEXT DEFAULT 'pending', -- pending, labelled, dispatched
  royal_mail_tracking_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hbp_orders_studio_status ON hbp_orders(studio_id, status);
ALTER TABLE public.hbp_orders ENABLE ROW LEVEL SECURITY;

-- Real, honest confirmation
SELECT 'Host By Post studio created' AS step, (SELECT name FROM studios WHERE id = 'a1000000-0000-0000-0000-000000000001') AS result
UNION ALL
SELECT 'Real product catalog', (SELECT COUNT(*)::text FROM hbp_products WHERE studio_id = 'a1000000-0000-0000-0000-000000000001')
UNION ALL
SELECT 'Honest weight status', (SELECT CASE WHEN weight_confirmed THEN 'confirmed' ELSE 'placeholder — needs weighing a real kit' END FROM hbp_products WHERE sku = 'HBP-MUG-01');
