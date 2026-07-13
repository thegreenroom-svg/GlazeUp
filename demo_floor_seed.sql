-- ═══════════════════════════════════════════════════════════
-- DEMO FLOOR PLAN SEED — fictional bookings
-- Uses party_size (the real column name)
-- ═══════════════════════════════════════════════════════════

INSERT INTO studio_tables (studio_id, name, room, capacity, sort_order)
SELECT 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'Table 5A', 'Main Studio', 2, 55
WHERE NOT EXISTS (
  SELECT 1 FROM studio_tables
  WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' AND name = 'Table 5A'
);

INSERT INTO bookings (studio_id, booking_code, customer_name, table_number, party_size, status, current_stage, session_start, booking_type)
VALUES
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-T1',  'Sarah & Friends',      'Table 1',   3,  'active', 'engagement', NOW() - INTERVAL '45 minutes', 'standard'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-T4',  'James & Emma',         'Table 4',   2,  'active', 'booking',    NOW() - INTERVAL '10 minutes', 'standard'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-T5A', 'The Hendersons',       'Table 5A',  2,  'active', 'completion', NOW() - INTERVAL '75 minutes', 'standard'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-WI',  'Women''s Institute',   'Table 6',   5,  'active', 'engagement', NOW() - INTERVAL '30 minutes', 'group'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'Sophie''s Hen Do',     'The Vault', 12, 'active', 'engagement', NOW() - INTERVAL '20 minutes', 'group')
ON CONFLICT (booking_code) DO UPDATE SET
  current_stage  = EXCLUDED.current_stage,
  session_start  = EXCLUDED.session_start,
  booking_type   = EXCLUDED.booking_type,
  party_size     = EXCLUDED.party_size;

DELETE FROM table_session_items
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
  AND booking_code IN ('DEMO-HEN', 'DEMO-WI', 'DEMO-T1', 'DEMO-T4', 'DEMO-T5A');

-- Hen do — Prosecco, glasses, cake
INSERT INTO table_session_items (studio_id, booking_code, item_type, item_label, pos_x, pos_y) VALUES
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_bottle', 'Prosecco', 50, 28),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_glass',  'Glass 1',  22, 58),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_glass',  'Glass 2',  33, 58),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_glass',  'Glass 3',  44, 58),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_glass',  'Glass 4',  56, 58),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_glass',  'Glass 5',  67, 58),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'prosecco_glass',  'Glass 6',  78, 58),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'cake_slice',      'Cake',     80, 28);

-- Women's Institute — teas and coffees
INSERT INTO table_session_items (studio_id, booking_code, item_type, item_label, pos_x, pos_y) VALUES
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-WI', 'tea_cup',    'Tea 1', 25, 55),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-WI', 'tea_cup',    'Tea 2', 40, 55),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-WI', 'coffee_cup', 'Coffee', 60, 55),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-WI', 'cake_slice', 'Cake',  75, 40);

-- Sarah & Friends — paints out, water jug
INSERT INTO table_session_items (studio_id, booking_code, item_type, item_label, pos_x, pos_y) VALUES
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-T1', 'paint_set',  'Paints', 50, 35),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-T1', 'water_jug',  'Water',  75, 50);

-- Flow checks — hen do 3/4 done, WI 2/4 done
DELETE FROM booking_flow_checks
WHERE studio_id = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3'
  AND booking_code IN ('DEMO-HEN', 'DEMO-WI');

INSERT INTO booking_flow_checks (studio_id, booking_code, stage, check_key, completed, completed_by) VALUES
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'booking', 'table_set_up',   true, 'Ruby'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'booking', 'greeted',        true, 'Ruby'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'booking', 'drinks_offered', true, 'Ruby'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-HEN', 'booking', 'pieces_selected',false,'Ruby'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-WI',  'booking', 'table_set_up',   true, 'Daisy'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-WI',  'booking', 'greeted',        true, 'Daisy'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-WI',  'booking', 'drinks_offered', false,'Daisy'),
  ('fab8b2d2-27b5-47ec-8c56-268bbf821dc3', 'DEMO-WI',  'booking', 'pieces_selected',false,'Daisy')
ON CONFLICT (studio_id, booking_code, stage, check_key) DO UPDATE SET
  completed = EXCLUDED.completed;
