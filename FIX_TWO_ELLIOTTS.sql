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
-- ⚠️  SUPERSEDES FIX_ELLIOTT_SPELLING.sql (and section 4 of
-- RUN_ALL_FOUR.sql). That file set his role to 'Co-Director', which was
-- wrong. If you have already run it, this corrects the role. Run this
-- one AFTER it, or instead of it. No harm either way.
--
-- ROLE AND ACCESS ARE TWO DIFFERENT THINGS, and conflating them is what
-- caused three revisions of this in one evening:
--   • ROLE   — 'Marketing & Host By Post Manager'. Set below. It is his
--              job title and it shows in the login picker.
--   • ACCESS — he DOES see everything the directors see. That lives in
--              code (PLATFORM_REVENUE_ACCESS), is already pushed, and is
--              deliberately NOT derived from his role. Nothing in this
--              file grants or removes it.
-- Changing his job title must never change what he can see. It doesn't.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. LOOK FIRST. Run this alone and read it. ──
-- Deliberately depends on NOTHING but staff_team.
--
-- The first version of this file counted shifts and holidays per row, to
-- keep whichever Elliott had the real history. It failed outright:
--     ERROR: relation "staff_shifts" does not exist
-- Because there is no staff_shifts table. I invented the name and did
-- not check — the same mistake this project has been paying for all
-- week, made by me, in the file meant to clean up after it.
--
-- The real timesheet table is staff_timesheet. But that resolves the
-- worry rather than complicating it: with no staff_shifts, there is no
-- shift history split across the two rows to protect. So the duplicate
-- can be judged on age alone, and the oldest row — the one people have
-- actually been using — is the one that stays.
SELECT id, name, role, active, created_at
  FROM staff_team
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name ILIKE 'elliot%'
 ORDER BY created_at;

-- ── 2. Set the real name and role on BOTH rows, so it is right either way ──
-- The name MUST end up exactly 'Elliott', two t's: the access check in
-- code is a first-name string compare, so 'Elliot' silently locks him
-- out of the takings dashboard while looking correct everywhere else.
-- The role is his job title only — it grants nothing.
-- This also overwrites the 'Co-Director' that FIX_ELLIOTT_SPELLING.sql
-- set, which was wrong.
UPDATE staff_team
   SET name = 'Elliott',
       role = 'Marketing & Host By Post Manager'
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name ILIKE 'elliot%';

-- ── 3. Deactivate the duplicate, keep the oldest ──
-- Reversible: set active = true to bring any row back. Nothing is
-- deleted. team-for-login filters on active = true, so this alone
-- clears him from the picker.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS keep_rank
    FROM staff_team
   WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
     AND name ILIKE 'elliot%'
)
UPDATE staff_team
   SET active = false
 WHERE id IN (SELECT id FROM ranked WHERE keep_rank > 1);

-- ── VERIFY — expect exactly ONE active Elliott, Marketing & HBP Manager ──
SELECT name, role, active
  FROM staff_team
 WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
   AND name ILIKE 'elliot%'
 ORDER BY active DESC;
