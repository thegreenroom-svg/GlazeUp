-- ═══════════════════════════════════════════════════════════════
-- GlazeUp · Database Schema
-- Run this in Supabase SQL Editor to set up the database
-- ═══════════════════════════════════════════════════════════════

-- ── Studios (the paying customers) ──
CREATE TABLE studios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,              -- URL-friendly name, e.g. 'the-kiln-cafe'
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  subscription_status TEXT DEFAULT 'trial' CHECK (subscription_status IN ('trial','active','past_due','cancelled')),
  trial_ends_at TIMESTAMPTZ DEFAULT (now() + interval '30 days'),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  settings JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_studios_slug ON studios(slug);

-- ── Studio branding (white-label config) ──
CREATE TABLE studio_branding (
  studio_id UUID PRIMARY KEY REFERENCES studios(id) ON DELETE CASCADE,
  logo_url TEXT,
  primary_colour TEXT DEFAULT '#b03a2e',
  secondary_colour TEXT DEFAULT '#faf4ef',
  accent_colour TEXT DEFAULT '#7a3a2e',
  text_colour TEXT DEFAULT '#3d1c12',
  font_display TEXT DEFAULT 'Georgia, serif',
  font_body TEXT DEFAULT 'system-ui, -apple-system, sans-serif',
  tagline TEXT DEFAULT 'Paint · Glaze · Create',
  footer_text TEXT,
  custom_css TEXT                          -- power users can add custom CSS
);

-- ── Glaze palettes ──
CREATE TABLE glaze_palettes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                      -- e.g. 'Stroke & Coat'
  brand TEXT,                              -- e.g. 'Mayco'
  is_default BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0
);

CREATE INDEX idx_palettes_studio ON glaze_palettes(studio_id);

-- ── Individual glazes ──
CREATE TABLE glazes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  palette_id UUID NOT NULL REFERENCES glaze_palettes(id) ON DELETE CASCADE,
  code TEXT,                               -- e.g. 'SC-74'
  name TEXT NOT NULL,                      -- e.g. 'Hot Tamale'
  hex_colour TEXT NOT NULL,                -- e.g. '#D94030'
  in_stock BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

CREATE INDEX idx_glazes_palette ON glazes(palette_id);

-- ── Bisque shapes ──
CREATE TABLE bisque_shapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  image_url TEXT,                          -- uploaded photo
  draw_type TEXT DEFAULT 'builtin',        -- 'builtin', 'uploaded', 'svg'
  draw_key TEXT,                           -- for built-in canvas shapes: 'mug', 'plate', etc.
  svg_data TEXT,                           -- for custom SVG outlines
  supplier TEXT,
  supplier_code TEXT,
  price DECIMAL(8,2),
  in_stock BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0
);

CREATE INDEX idx_shapes_studio ON bisque_shapes(studio_id);

-- ── Design categories ──
CREATE TABLE design_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID REFERENCES studios(id) ON DELETE CASCADE,  -- NULL = global/shared
  name TEXT NOT NULL,
  icon TEXT,                               -- emoji or icon class
  sort_order INT DEFAULT 0
);

-- ── Transfer designs ──
CREATE TABLE designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID REFERENCES studios(id) ON DELETE CASCADE,  -- NULL = global/shared
  category_id UUID REFERENCES design_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'builtin' CHECK (type IN ('builtin','svg','image')),
  draw_key TEXT,                           -- for built-in canvas designs
  svg_data TEXT,                           -- for SVG designs
  image_url TEXT,                          -- for uploaded image designs
  is_printable BOOLEAN DEFAULT true,
  tags TEXT[],                             -- for search/filter
  sort_order INT DEFAULT 0
);

CREATE INDEX idx_designs_studio ON designs(studio_id);
CREATE INDEX idx_designs_category ON designs(category_id);

-- ── Customer projects (saved previews) ──
CREATE TABLE customer_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_email TEXT,
  bisque_shape_id UUID REFERENCES bisque_shapes(id),
  bisque_photo_url TEXT,                   -- if they took a photo
  design_id UUID REFERENCES designs(id),
  overlay_state JSONB,                     -- position, scale, rotation, opacity
  colour_matches JSONB,                    -- saved colour match results
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_to_staff BOOLEAN DEFAULT false,
  staff_notes TEXT
);

CREATE INDEX idx_projects_studio ON customer_projects(studio_id);

-- ── Square integration ──
CREATE TABLE square_connections (
  studio_id UUID PRIMARY KEY REFERENCES studios(id) ON DELETE CASCADE,
  square_access_token TEXT NOT NULL,       -- encrypted in practice
  square_refresh_token TEXT,
  square_merchant_id TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT DEFAULT 'idle' CHECK (sync_status IN ('idle','syncing','error')),
  sync_error TEXT
);

-- ── Sync audit log ──
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  sync_type TEXT,                          -- 'transactions', 'customers', 'inventory'
  status TEXT CHECK (status IN ('success','error')),
  records_synced INT,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_synclogs_studio ON sync_logs(studio_id);

-- ── Cached analytics (pre-computed from Square data) ──
CREATE TABLE studio_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  metric_date DATE,
  total_revenue DECIMAL(10,2),
  transaction_count INT,
  app_users_count INT,                     -- customers who used GlazeUp
  popular_design_id UUID REFERENCES designs(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(studio_id, metric_date)
);

CREATE INDEX idx_analytics_studio ON studio_analytics(studio_id);
CREATE INDEX idx_analytics_date ON studio_analytics(metric_date);

-- ── Row Level Security (multi-tenant isolation) ──
ALTER TABLE studios ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE glaze_palettes ENABLE ROW LEVEL SECURITY;
ALTER TABLE glazes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bisque_shapes ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_projects ENABLE ROW LEVEL SECURITY;

-- Studio owners see only their own data
CREATE POLICY "Studios own data" ON studios
  FOR ALL USING (id = auth.jwt()->>'studio_id');

CREATE POLICY "Branding by studio" ON studio_branding
  FOR ALL USING (studio_id = (auth.jwt()->>'studio_id')::uuid);

CREATE POLICY "Palettes by studio" ON glaze_palettes
  FOR ALL USING (studio_id = (auth.jwt()->>'studio_id')::uuid);

CREATE POLICY "Glazes via palette" ON glazes
  FOR ALL USING (
    palette_id IN (SELECT id FROM glaze_palettes WHERE studio_id = (auth.jwt()->>'studio_id')::uuid)
  );

CREATE POLICY "Shapes by studio" ON bisque_shapes
  FOR ALL USING (studio_id = (auth.jwt()->>'studio_id')::uuid);

-- Designs: studio's own + global shared designs
CREATE POLICY "Designs by studio or global" ON designs
  FOR SELECT USING (
    studio_id IS NULL OR studio_id = (auth.jwt()->>'studio_id')::uuid
  );

CREATE POLICY "Designs manage own" ON designs
  FOR ALL USING (studio_id = (auth.jwt()->>'studio_id')::uuid);

-- Categories: studio's own + global
CREATE POLICY "Categories by studio or global" ON design_categories
  FOR SELECT USING (
    studio_id IS NULL OR studio_id = (auth.jwt()->>'studio_id')::uuid
  );

-- Customer projects: public insert (customers saving), studio read
CREATE POLICY "Projects by studio" ON customer_projects
  FOR SELECT USING (studio_id = (auth.jwt()->>'studio_id')::uuid);

-- Anonymous insert for customer-facing app
CREATE POLICY "Customers can save projects" ON customer_projects
  FOR INSERT WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════
-- SEED DATA: Default global design categories + designs
-- ═══════════════════════════════════════════════════════════════

INSERT INTO design_categories (id, studio_id, name, icon, sort_order) VALUES
  ('a0000001-0000-0000-0000-000000000001', NULL, 'Florals', '🌸', 1),
  ('a0000001-0000-0000-0000-000000000002', NULL, 'Geometric', '◆', 2),
  ('a0000001-0000-0000-0000-000000000003', NULL, 'Text', '✎', 3),
  ('a0000001-0000-0000-0000-000000000004', NULL, 'Nature', '🦋', 4),
  ('a0000001-0000-0000-0000-000000000005', NULL, 'Seasonal', '⭐', 5);
