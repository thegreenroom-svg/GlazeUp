-- ═══════════════════════════════════════════════════════════════════
-- ADD_WHATSAPP.sql — 16 July 2026
-- ═══════════════════════════════════════════════════════════════════
-- Adds a WhatsApp number field to staff_team so Daisy can contact
-- staff directly from the app. Deep links only — no Business API,
-- no cost, no Meta approval. Just wa.me/<number>?text=<message>.
--
-- International format preferred: 447700900000 not 07700900000
-- but the app strips non-digits so either works.
--
-- Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE staff_team ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- VERIFY
SELECT 'whatsapp_number column' AS thing,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='staff_team' AND column_name='whatsapp_number')
  THEN 'ok' ELSE 'MISSING' END AS present;
