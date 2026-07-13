-- ═══════════════════════════════════════════════════════════
-- HOST BY POST — FULL POSTAL JOURNEY SCHEMA
-- Extends the existing hbp_orders table with the complete
-- multi-stage journey: kit out → return → fire → post back
-- → repeat for additional firings → complete.
-- ═══════════════════════════════════════════════════════════

-- Add journey columns to existing hbp_orders table
ALTER TABLE hbp_orders
  ADD COLUMN IF NOT EXISTS journey_stage TEXT DEFAULT 'pending',
  -- Stages: pending → kit_labelled → kit_dispatched →
  --         piece_received → firing → fired_dispatched →
  --         (piece_received_2 → firing_2 → fired_dispatched_2 →) ...
  --         complete
  ADD COLUMN IF NOT EXISTS firing_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS return_label_tracking TEXT,
  ADD COLUMN IF NOT EXISTS return_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fired_dispatched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS needs_additional_firing BOOLEAN DEFAULT false;

-- Journey events log — every stage transition recorded
-- so we have a full audit trail per order
CREATE TABLE IF NOT EXISTS hbp_journey_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES hbp_orders(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  notes TEXT,
  staff_name TEXT,
  tracking_number TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hbp_journey_events_order
  ON hbp_journey_events(order_id, created_at);

ALTER TABLE hbp_journey_events ENABLE ROW LEVEL SECURITY;

-- Migrate existing status values to journey_stage
UPDATE hbp_orders SET journey_stage = status WHERE journey_stage = 'pending' AND status != 'pending';
