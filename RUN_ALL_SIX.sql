-- ═══════════════════════════════════════════════════════════
-- RUN ALL SIX — everything outstanding from 14/15 July 2026, one file.
--
-- ⚠️  Run in project  mdpchpjnlzlmldtlqrns  (check the browser URL
--     before pressing Run — this bit tonight before).
--
-- Order doesn't matter between these six; none depends on another.
-- Safe to run more than once — every statement is IF NOT EXISTS,
-- ADD COLUMN IF NOT EXISTS, or ON CONFLICT.
-- ═══════════════════════════════════════════════════════════


-- ── 1. Room column on bookings (Main Studio / Lounge / Vault) ──
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS room TEXT;
UPDATE bookings SET room = 'Main Studio'
  WHERE room IS NULL AND TRIM(table_number) IN ('5A', '7', '8');
UPDATE bookings SET room = 'The Vault'
  WHERE room IS NULL AND TRIM(table_number) ILIKE 'group%';
CREATE INDEX IF NOT EXISTS idx_bookings_room_table
  ON bookings(studio_id, room, table_number);


-- ── 2. The learning engine ──
CREATE TABLE IF NOT EXISTS staff_task_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_member_id UUID NOT NULL,
  from_tab TEXT NOT NULL,
  to_tab TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transitions_studio ON staff_task_transitions(studio_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transitions_pair ON staff_task_transitions(studio_id, staff_member_id, from_tab, to_tab);
ALTER TABLE public.staff_task_transitions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS studio_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('layout','code')),
  staff_member_id UUID,
  headline TEXT NOT NULL,
  detail TEXT,
  evidence JSONB NOT NULL DEFAULT '{}',
  action JSONB,
  confidence NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','dismissed','shipped')),
  dismiss_count INT NOT NULL DEFAULT 0,
  dedupe_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE(studio_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_suggestions_pending ON studio_suggestions(studio_id, status, confidence DESC);
ALTER TABLE public.studio_suggestions ENABLE ROW LEVEL SECURITY;


-- ── 3. On-device photo fingerprint (piece matching, no AI cost) ──
ALTER TABLE pottery_pieces ADD COLUMN IF NOT EXISTS photo_phash TEXT;
CREATE INDEX IF NOT EXISTS idx_pieces_phash ON pottery_pieces(studio_id, photo_phash) WHERE photo_phash IS NOT NULL;


-- ── 4. Stock shape recognition, tied to the real Square catalogue ──
CREATE TABLE IF NOT EXISTS stock_shape_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  square_item_id TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  photo_phash TEXT,
  photographed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  photographed_by UUID
);
CREATE INDEX IF NOT EXISTS idx_stock_shape_studio ON stock_shape_photos(studio_id);
CREATE INDEX IF NOT EXISTS idx_stock_shape_item ON stock_shape_photos(studio_id, square_item_id);
ALTER TABLE public.stock_shape_photos ENABLE ROW LEVEL SECURITY;

ALTER TABLE pottery_pieces ADD COLUMN IF NOT EXISTS square_item_id TEXT;
CREATE INDEX IF NOT EXISTS idx_pieces_square_item ON pottery_pieces(square_item_id);


-- ── 5. Per-staff checklist reordering, renaming, descriptions ──
CREATE TABLE IF NOT EXISTS staff_checklist_customization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_member_id UUID NOT NULL,
  stage TEXT NOT NULL,
  check_key TEXT NOT NULL,
  custom_order INT NOT NULL DEFAULT 0,
  custom_label TEXT,
  custom_description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(studio_id, staff_member_id, stage, check_key)
);
CREATE INDEX IF NOT EXISTS idx_checklist_custom_lookup
  ON staff_checklist_customization(studio_id, staff_member_id, stage);
ALTER TABLE public.staff_checklist_customization ENABLE ROW LEVEL SECURITY;


-- ── 6. Real staff titles + Dave deactivated ──
UPDATE staff_team SET active = false
  WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name ILIKE 'Dave%' AND name NOT ILIKE 'David%';
UPDATE staff_team SET role = 'General Manager'
  WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name ILIKE 'Daisy%';
UPDATE staff_team SET role = 'Studio Executive'
  WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name ILIKE 'Jenny%';
UPDATE staff_team SET role = 'Co-Director'
  WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name ILIKE 'David%';
UPDATE staff_team SET role = 'Studio Assistant'
  WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name ILIKE 'Lucy%';


-- ── DID IT ALL WORK? ──
SELECT 'bookings.room' AS thing,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='room')
  THEN '✓' ELSE '✗ MISSING' END AS result
UNION ALL SELECT 'staff_task_transitions', CASE WHEN to_regclass('public.staff_task_transitions') IS NOT NULL THEN '✓' ELSE '✗ MISSING' END
UNION ALL SELECT 'studio_suggestions', CASE WHEN to_regclass('public.studio_suggestions') IS NOT NULL THEN '✓' ELSE '✗ MISSING' END
UNION ALL SELECT 'pottery_pieces.photo_phash', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pottery_pieces' AND column_name='photo_phash') THEN '✓' ELSE '✗ MISSING' END
UNION ALL SELECT 'stock_shape_photos', CASE WHEN to_regclass('public.stock_shape_photos') IS NOT NULL THEN '✓' ELSE '✗ MISSING' END
UNION ALL SELECT 'pottery_pieces.square_item_id', CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pottery_pieces' AND column_name='square_item_id') THEN '✓' ELSE '✗ MISSING' END
UNION ALL SELECT 'staff_checklist_customization', CASE WHEN to_regclass('public.staff_checklist_customization') IS NOT NULL THEN '✓' ELSE '✗ MISSING' END
UNION ALL SELECT 'Dave deactivated', (SELECT CASE WHEN active THEN '✗ still active' ELSE '✓ inactive' END FROM staff_team WHERE studio_id='fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name ILIKE 'Dave%' AND name NOT ILIKE 'David%' LIMIT 1)
UNION ALL SELECT 'Daisy''s title', (SELECT role FROM staff_team WHERE studio_id='fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name ILIKE 'Daisy%' LIMIT 1);
