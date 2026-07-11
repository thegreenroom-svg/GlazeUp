-- ═══════════════════════════════════════════════════════════
-- STUDIO ADD-ON MARKETPLACE — a genuine, real revenue structure for
-- premium features sold on top of the base plan, extending the exact
-- pattern already proven with Cleo's Club (real paywall confirmation,
-- real enable/disable, real Platform Revenue tracking).
--
-- Real add-ons, matching features already built in this app:
--   'cleos_club'      — kids' sticker loyalty (already has its own
--                        cleos_club_config table — this generic table
--                        is for everything ELSE, Cleo's Club keeps its
--                        existing dedicated one since it has extra
--                        fields like reward_every_n_visits)
--   'ai_piece_finder' — Piece Matching, Whole-Tray Scan, Find My Piece
--                        (the AI recognition features)
--   'piece_catalogue' — customer-facing stock browsing + pre-glaze
--                        reservations
--   'club_pages'      — worldwide social feed access
--   'royal_mail'       — automatic postal label generation (once a
--                        studio has their own Royal Mail account
--                        connected, this add-on is what unlocks it
--                        being used automatically vs manually)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  addon_key TEXT NOT NULL, -- 'cleos_club' | 'ai_piece_finder' | 'piece_catalogue' | 'club_pages' | 'royal_mail'
  enabled BOOLEAN DEFAULT false,
  monthly_price_cents INT NOT NULL,
  enabled_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(studio_id, addon_key)
);
ALTER TABLE public.studio_addons ENABLE ROW LEVEL SECURITY;

-- Real per-month revenue log for add-ons — this is what Platform
-- Revenue will sum for the genuine "add-on revenue" figure, same
-- pattern as MRR from the base plans.
CREATE TABLE IF NOT EXISTS addon_revenue_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  addon_key TEXT NOT NULL,
  amount_cents INT NOT NULL,
  billed_for_month DATE NOT NULL, -- first of the month this charge is for
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.addon_revenue_log ENABLE ROW LEVEL SECURITY;
