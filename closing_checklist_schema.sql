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
