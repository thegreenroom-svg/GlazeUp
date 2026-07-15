-- ═══════════════════════════════════════════════════════════════════
-- FIX_TWO_ELLIOTTS.sql — 15 July 2026
-- Studio fab8b2d2-27b5-47ec-8c56-268bbf821dc3 (The Kiln Cafe)
--
-- Daisy, after running the check: "there are two Eliots. We need to get
-- one gone. I think they're both the same. Both got the same spelling.
-- He's not a director. He's the marketing and host by post manager."
--
-- This is the case FIX_ELLIOTT_SPELLING.sql said to STOP on, and she
-- did. Two rows for one person means their shift history may be split
-- across both, so this DEACTIVATES the duplicate rather than deleting
-- it — the same reversible pattern already used for Dave. Nothing is
-- destroyed; the row and its history stay, and it stops appearing in
-- the picker (team-for-login filters on active = true).
--
-- His director access is removed IN CODE, not here — he is Marketing &
-- Host By Post Manager. That is a separate commit and already pushed.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. LOOK FIRST. Run this alone and read it. ──
-- Shows both rows and how much real history each one carries. The row
-- with history is the one to keep. If BOTH carry shifts, stop — that is
-- genuinely split history and needs merging, not deactivating.
SELECT st.id,
       st.name,
       st.role,
       st.active,
       st.created_at,
       (SELECT COUNT(*) FROM staff_shifts   s WHERE s.staff_member_id = st.id) AS shifts,
       (SELECT COUNT(*) FROM staff_holidays hh WHERE hh.staff_member_id = st.id) AS holidays,
       (SELECT COUNT(*) FROM staff_pins     p WHERE p.staff_member_id = st.id) AS pins
  FROM staff_team st
 WHERE st.studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND st.name ILIKE 'elliot%'
 ORDER BY st.created_at;

-- ── 2. Set the real role on BOTH rows, so it is right either way ──
UPDATE staff_team
   SET name = 'Elliott',
       role = 'Marketing & Host By Post Manager'
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name ILIKE 'elliot%';

-- ── 3. Deactivate the duplicate, keep the one with history ──
-- Keeps whichever row has the most shifts; ties break to the oldest,
-- since that is the one people have been using. Deactivates the rest.
-- Reversible: set active = true to bring any row back.
WITH ranked AS (
  SELECT st.id,
         ROW_NUMBER() OVER (
           ORDER BY (SELECT COUNT(*) FROM staff_shifts s WHERE s.staff_member_id = st.id) DESC,
                    st.created_at ASC
         ) AS keep_rank
    FROM staff_team st
   WHERE st.studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
     AND st.name ILIKE 'elliot%'
)
UPDATE staff_team
   SET active = false
 WHERE id IN (SELECT id FROM ranked WHERE keep_rank > 1);

-- ── VERIFY — expect exactly ONE active Elliott, Marketing & HBP Manager ──
SELECT name, role, active,
       (SELECT COUNT(*) FROM staff_shifts s WHERE s.staff_member_id = staff_team.id) AS shifts
  FROM staff_team
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name ILIKE 'elliot%'
 ORDER BY active DESC;
