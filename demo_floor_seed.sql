-- ═══════════════════════════════════════════════════════════
-- DEMO FLOOR PLAN SEED — fictional bookings for the floor plan demo
-- Main Studio: Table 1 (3 people), Table 4 (2 people), Table 5A (2 people)
-- Lounge: Table 6 (Women's Institute, party of 5)
-- The Vault: Hen do (12 people, Prosecco)
-- ═══════════════════════════════════════════════════════════

-- Ensure Table 5A exists as a split variant
INSERT INTO studio_tables (studio_id, name, room, capacity, sort_order)
SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 5A', 'Main Studio', 2, 55
WHERE NOT EXISTS (SELECT 1 FROM studio_tables WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'Table 5A');

-- Demo bookings — all starting about 45 minutes ago so session is active
-- Table 1 — Main Studio, 3 people, painting stage
INSERT INTO bookings (studio_id, booking_code, customer_name, table_number, num_people, status, current_stage, session_start)
VALUES ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-T1', 'Sarah & Friends', 'Table 1', 3, 'active', 'engagement', NOW() - INTERVAL '45 minutes')
ON CONFLICT (booking_code) DO UPDATE SET current_stage = 'engagement', session_start = NOW() - INTERVAL '45 minutes';

-- Table 4 — Main Studio, 2 people, booking stage (just sat down)
INSERT INTO bookings (studio_id, booking_code, customer_name, table_number, num_people, status, current_stage, session_start)
VALUES ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-T4', 'James & Emma', 'Table 4', 2, 'active', 'booking', NOW() - INTERVAL '10 minutes')
ON CONFLICT (booking_code) DO UPDATE SET current_stage = 'booking', session_start = NOW() - INTERVAL '10 minutes';

-- Table 5A — Main Studio split, 2 people, completion stage
INSERT INTO bookings (studio_id, booking_code, customer_name, table_number, num_people, status, current_stage, session_start)
VALUES ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-T5A', 'The Hendersons', 'Table 5A', 2, 'active', 'completion', NOW() - INTERVAL '75 minutes')
ON CONFLICT (booking_code) DO UPDATE SET current_stage = 'completion', session_start = NOW() - INTERVAL '75 minutes';

-- Table 6 — Lounge, Women's Institute party of 5
INSERT INTO bookings (studio_id, booking_code, customer_name, table_number, num_people, status, current_stage, session_start)
VALUES ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-WI', 'Women''s Institute', 'Table 6', 5, 'active', 'engagement', NOW() - INTERVAL '30 minutes')
ON CONFLICT (booking_code) DO UPDATE SET current_stage = 'engagement', session_start = NOW() - INTERVAL '30 minutes';

-- The Vault — Hen do, 12 people, Prosecco
INSERT INTO bookings (studio_id, booking_code, customer_name, table_number, num_people, status, current_stage, session_start)
VALUES ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'Sophie''s Hen Do 🥂', 'The Vault', 12, 'active', 'engagement', NOW() - INTERVAL '20 minutes')
ON CONFLICT (booking_code) DO UPDATE SET current_stage = 'engagement', session_start = NOW() - INTERVAL '20 minutes';

-- Seed some table items for the hen do (Prosecco bottles and glasses)
DELETE FROM table_session_items WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND booking_code = 'DEMO-HEN';
INSERT INTO table_session_items (studio_id, booking_code, item_type, item_label, pos_x, pos_y) VALUES
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_bottle', 'Prosecco', 50, 30),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_glass', 'Glass 1', 25, 55),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_glass', 'Glass 2', 35, 55),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_glass', 'Glass 3', 45, 55),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_glass', 'Glass 4', 55, 55),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_glass', 'Glass 5', 65, 55),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_glass', 'Glass 6', 75, 55),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'cake_slice', 'Cake', 80, 30);

-- Flow checks for hen do — some already ticked
INSERT INTO booking_flow_checks (studio_id, booking_code, stage, check_key, completed, completed_by)
VALUES
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'booking', 'table_set_up', true, 'Ruby'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'booking', 'greeted', true, 'Ruby'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'booking', 'drinks_offered', true, 'Ruby'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-WI', 'booking', 'table_set_up', true, 'Daisy'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-WI', 'booking', 'greeted', true, 'Daisy')
ON CONFLICT (studio_id, booking_code, stage, check_key) DO NOTHING;
