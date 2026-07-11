-- Genuine, real per-staff-member usage counts for dashboard tabs —
-- feeds honest shortcut suggestions in Cleo's chat once a real
-- pattern emerges (not a vague "AI learns everything" claim, an
-- actual counted table).
CREATE TABLE IF NOT EXISTS staff_task_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_member_id UUID NOT NULL,
  tab_name TEXT NOT NULL,
  use_count INT DEFAULT 1,
  last_used_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(studio_id, staff_member_id, tab_name)
);
ALTER TABLE public.staff_task_usage ENABLE ROW LEVEL SECURITY;
