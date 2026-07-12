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
