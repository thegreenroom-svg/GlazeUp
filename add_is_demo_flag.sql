-- Add a genuine, reliable flag distinguishing seeded demo studios from
-- real ones — the code currently has no column-based way to tell them
-- apart (only a "(Demo)" naming convention in old seed data, which is
-- fragile). This is what the new simulated-activity job will use to
-- make sure it NEVER touches The Kiln Cafe's real data.
ALTER TABLE public.studios ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- Mark every existing seeded studio as demo (anything with "(Demo)" in
-- the name, matching the original seeding convention), and explicitly
-- confirm The Kiln Cafe is NOT flagged as demo.
UPDATE public.studios SET is_demo = true WHERE name ILIKE '%(Demo)%';
UPDATE public.studios SET is_demo = false WHERE id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3';

-- Confirm — check the counts look right before the simulation job goes live
SELECT is_demo, COUNT(*) FROM public.studios GROUP BY is_demo;
