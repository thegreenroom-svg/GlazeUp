-- ═══════════════════════════════════════════════════════════
-- CLUB PAGES — worldwide, customer-posted-directly feed of painted
-- pieces. Built as a new visibility tier on the existing
-- community_posts table (not a separate parallel system), since that
-- table already has real, working storage/likes/display infrastructure.
--
-- Genuinely different from the existing Community feed:
--   'studio'  — visible only within one studio (existing)
--   'global'  — staff-featured, pushed worldwide (existing)
--   'club'    — NEW: customer posts directly, goes worldwide
--               immediately, no staff approval — but does pass through
--               a basic automated screening check first (confirms it's
--               genuinely a pottery photo, flags anything inappropriate)
--               given this is unmoderated and worldwide.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS screening_status TEXT DEFAULT 'pending'; -- 'pending' | 'passed' | 'flagged'
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS screening_reason TEXT; -- AI's own explanation, for a genuine audit trail
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS screened_at TIMESTAMPTZ;

-- Real audit log of everything screened — lets you honestly see how
-- often the automated check is actually catching something, over time.
CREATE TABLE IF NOT EXISTS club_pages_screening_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE,
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  result TEXT NOT NULL, -- 'passed' | 'flagged'
  reasoning TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.club_pages_screening_log ENABLE ROW LEVEL SECURITY;
