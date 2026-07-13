-- ═══════════════════════════════════════════════════════════
-- Genuine real performance indexes — every table added tonight is
-- queried by studio_id (and often a date/status filter) on nearly
-- every real request. Without an index, Postgres does a full table
-- scan every time — genuinely fine at a few dozen rows, but a real,
-- honest, compounding slowdown as actual usage grows over weeks and
-- months. Safe to run more than once (IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_staff_alerts_studio_ack ON staff_alerts(studio_id, acknowledged, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_damage_reports_studio ON damage_reports(studio_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_promotions_studio ON studio_promotions(studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_closing_checklist_studio_date ON closing_checklist_log(studio_id, checklist_date);
CREATE INDEX IF NOT EXISTS idx_opening_checklist_studio_date ON opening_checklist_log(studio_id, checklist_date);
CREATE INDEX IF NOT EXISTS idx_staff_task_usage_studio_staff ON staff_task_usage(studio_id, staff_member_id);
CREATE INDEX IF NOT EXISTS idx_customer_memory_studio_customer ON customer_memory(studio_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_knowledge_studio ON studio_knowledge(studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON loyalty_transactions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_studio_points ON customers(studio_id, loyalty_points DESC) WHERE loyalty_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pottery_pieces_booking ON pottery_pieces(studio_id, booking_id, damaged);
CREATE INDEX IF NOT EXISTS idx_bookings_studio_created ON bookings(studio_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_extra_charges_studio_booking ON app_extra_charges(studio_id, booking_code);
CREATE INDEX IF NOT EXISTS idx_staff_timesheet_studio_clockout ON staff_timesheet(studio_id, clock_out) WHERE clock_out IS NULL;
