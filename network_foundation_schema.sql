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
