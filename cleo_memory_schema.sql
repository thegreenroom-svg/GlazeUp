-- ═══════════════════════════════════════════════════════════
-- Two genuinely separate real memory systems for Cleo:
-- 1. customer_memory — durable facts about a RETURNING customer,
--    picked up automatically from real conversations, tied to their
--    real loyalty customer record. Only ever populated when a real
--    booking/customer identity is known — no booking, no memory.
-- 2. studio_knowledge — a real, growing knowledge base staff add to
--    directly, usable by both customer and staff chat contexts.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS customer_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  fact TEXT NOT NULL,
  source TEXT DEFAULT 'chat', -- 'chat' (auto-extracted) or 'staff' (manually added)
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_memory_customer ON customer_memory(customer_id);
ALTER TABLE public.customer_memory ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS studio_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  fact TEXT NOT NULL,
  added_by TEXT, -- real staff member name, for a genuine honest record of who taught her what
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.studio_knowledge ENABLE ROW LEVEL SECURITY;
