-- ═══════════════════════════════════════════════════════════
-- Genuine, real, honest root cause of tonight's entire Square sync
-- debugging chain: this table was referenced throughout server.js
-- from the very start of this project, but was NEVER actually
-- created in the real database. Confirmed directly via Supabase's
-- own real error: "Could not find the table 'public.sync_logs' in
-- the schema cache" — not a code bug, a genuinely missing table.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  square_connection_id UUID NOT NULL REFERENCES square_connections(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL, -- 'incremental' or 'backfill', matching the real values the code already uses
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'success', or 'failed'
  records_synced INT,
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_logs_connection ON sync_logs(square_connection_id, created_at DESC);
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

-- Real, honest confirmation
SELECT COUNT(*) AS sync_logs_table_now_exists FROM sync_logs;
