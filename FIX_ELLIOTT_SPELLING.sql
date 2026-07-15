-- ═══════════════════════════════════════════════════════════════════
-- FIX_ELLIOTT_SPELLING.sql — 15 July 2026
-- Studio fab8b2d2-27b5-47ec-8c56-268bbf821dc3 (The Kiln Cafe)
--
-- Elliott is a director. TWO t's. Daisy: "the Elliot with the one t is
-- still there... he doesn't exist."
--
-- WHY THIS MATTERS BEYOND TIDINESS: director access is a first-name
-- check, server-side, across six endpoints:
--     PLATFORM_REVENUE_ACCESS_NAMES.includes(firstName)   // 'elliott'
-- A staff_team row spelled "Elliot" does not match 'elliott', so he is
-- silently locked out of Platform Revenue AND /api/analytics/dashboard
-- — the takings figures — while appearing to be on the list. The list
-- and the row have to agree exactly. Same failure mode as the Dave /
-- David confusion, which sent the co-director to the barista page.
--
-- Safe to re-run. Look before you leap: run step 1 on its own first.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. LOOK FIRST. What is actually in there? ──
SELECT id, name, role, active FROM staff_team
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name ILIKE 'elliot%'
 ORDER BY name;

-- ── 2. Correct the spelling ──
-- Only touches a row that is genuinely one-t. If step 1 showed TWO rows
-- (an "Elliot" AND an "Elliott") stop here and tell Claude — that is a
-- duplicate person, not a typo, and merging shift history is not
-- something to guess at.
UPDATE staff_team
   SET name = 'Elliott'
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name = 'Elliot';

-- ── 3. Make sure he is a director and active ──
UPDATE staff_team
   SET role = 'Co-Director', active = true
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name = 'Elliott';

-- ── 4. Cleo — she vanished from the picker when the API started working ──
-- She is in the client's DEMO_STAFF fallback but not in the real
-- staff_team. While /api/staff/team-for-login was hanging, the picker
-- fell back to DEMO_STAFF and she appeared. Now the real team loads and
-- she does not. Nothing broke — the app got honest. This puts her in the
-- real team, with the same role the fallback gave her.
INSERT INTO staff_team (studio_id, name, role, active)
SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Cleo', 'Chief Taster', true
 WHERE NOT EXISTS (
   SELECT 1 FROM staff_team
    WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'Cleo');

-- ── VERIFY ──
SELECT name, role, active FROM staff_team
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND active = true
 ORDER BY name;
