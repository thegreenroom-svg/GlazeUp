-- ═══════════════════════════════════════════════════════════
-- Genuine real studio-to-studio messaging — for opted-in kilnLINK
-- Network members to communicate directly. Deliberately business-to-
-- business (director-level), not general staff chat.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS network_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  to_studio_id UUID REFERENCES studios(id) ON DELETE CASCADE, -- NULL = broadcast to the whole real network
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_network_messages_to ON network_messages(to_studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_messages_from ON network_messages(from_studio_id, created_at DESC);
ALTER TABLE public.network_messages ENABLE ROW LEVEL SECURITY;
