-- ═══════════════════════════════════════════════════════════
-- THE LEARNING ENGINE
--
-- No model, no API, no cost. Every suggestion in here is
-- derived by plain arithmetic over tables the app already
-- fills in as staff use it. Nothing is invented, nothing is
-- guessed, and nothing applies itself without a human tap.
--
-- Depends on: staff_task_usage (already live), staff_home_screens.
-- ═══════════════════════════════════════════════════════════

-- Ordered navigation events. staff_task_usage counts WHAT gets
-- opened; this records WHAT FOLLOWS WHAT, which is where the
-- real workflow lives ("Painting → Drinks, every time").
-- Deliberately thin: two tab names, a timestamp, nothing else.
CREATE TABLE IF NOT EXISTS staff_task_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_member_id UUID NOT NULL,
  from_tab TEXT NOT NULL,
  to_tab TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transitions_studio
  ON staff_task_transitions(studio_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transitions_pair
  ON staff_task_transitions(studio_id, staff_member_id, from_tab, to_tab);
ALTER TABLE public.staff_task_transitions ENABLE ROW LEVEL SECURITY;

-- What the engine has worked out, and what happened to it.
-- This is the dev diary: Claude reads pending//dismissed rows at
-- the start of a session and turns the code-shaped ones into real
-- changes. The data-shaped ones apply in-app on approval.
CREATE TABLE IF NOT EXISTS studio_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,

  -- 'layout'  = applies itself on approval (tile order, promotion)
  -- 'code'    = needs a deploy; Claude picks these up next session
  kind TEXT NOT NULL CHECK (kind IN ('layout','code')),

  -- who it's about; null = whole studio
  staff_member_id UUID,

  -- Plain English, shown to staff as-is. No model wrote this —
  -- it is a sentence assembled from counted numbers.
  headline TEXT NOT NULL,
  detail TEXT,

  -- The arithmetic behind it, kept so a suggestion can always be
  -- challenged: {"sample":142,"share":0.81,"days":21}
  evidence JSONB NOT NULL DEFAULT '{}',

  -- What to do if approved, for kind='layout'
  -- e.g. {"action":"promote","tab":"drinks"}
  action JSONB,

  -- 0..1. Below the threshold it is never shown.
  confidence NUMERIC NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','dismissed','shipped')),
  -- Dismissals are the most valuable signal in the table: they are
  -- the studio telling the engine it was wrong. Never re-raise a
  -- suggestion that has been dismissed twice.
  dismiss_count INT NOT NULL DEFAULT 0,

  -- One live suggestion per idea. Re-running the engine updates
  -- the evidence rather than piling up duplicates.
  dedupe_key TEXT NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE(studio_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_suggestions_pending
  ON studio_suggestions(studio_id, status, confidence DESC);
ALTER TABLE public.studio_suggestions ENABLE ROW LEVEL SECURITY;
