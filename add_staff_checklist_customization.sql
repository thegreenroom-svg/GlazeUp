-- ═══════════════════════════════════════════════════════════
-- STAFF CAN ORGANISE THEIR OWN CHECKLIST — order, name, description
--
-- Per staff member (not studio-wide) — Daisy's explicit call, having
-- weighed it against the earlier decision to keep the top-level tile
-- grid one shared order for everyone. Scoped to the stage checklists
-- inside the real table detail panel (booking/painting/completion/
-- kiln) — a genuine "more than one option" list in the live, working
-- system. Deliberately NOT the top-level tile grid (GRID_NAV_STRUCTURE)
-- — that is separately flagged all night as the single largest,
-- riskiest remaining piece of work and is not touched here.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staff_checklist_customization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_member_id UUID NOT NULL,
  stage TEXT NOT NULL,          -- 'booking' | 'engagement' | 'completion' | 'kiln'
  check_key TEXT NOT NULL,      -- matches FLOW_CHECKS' existing key, e.g. 'drinks_offered'
  custom_order INT NOT NULL DEFAULT 0,
  custom_label TEXT,            -- NULL = use the built-in label
  custom_description TEXT,      -- NULL = none
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(studio_id, staff_member_id, stage, check_key)
);
CREATE INDEX IF NOT EXISTS idx_checklist_custom_lookup
  ON staff_checklist_customization(studio_id, staff_member_id, stage);
ALTER TABLE public.staff_checklist_customization ENABLE ROW LEVEL SECURITY;
