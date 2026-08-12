/**
 * GlazeUp Phase 3 Till Tables
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Add these to your Supabase schema
 */

-- Till sessions (tracks split bill config + current state)
CREATE TABLE till_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL,
  booking_code TEXT NOT NULL UNIQUE,
  is_split BOOLEAN DEFAULT false,
  people JSONB NOT NULL, -- [{id, name, collection: 'collection'|'postal'|'mixed', postalAddress}]
  status TEXT DEFAULT 'active', -- 'active', 'completed', 'paid'
  payment_method TEXT, -- 'cash', 'card', 'split'
  payments_by_person JSONB, -- {personId: {method, amount}}
  split_bill_started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT till_sessions_studio_fk FOREIGN KEY (studio_id) REFERENCES studios(id)
);

CREATE INDEX till_sessions_booking_code_idx ON till_sessions(booking_code);
CREATE INDEX till_sessions_studio_id_idx ON till_sessions(studio_id);
CREATE INDEX till_sessions_status_idx ON till_sessions(status);

-- Till items (items added to till, with per-person assignment)
CREATE TABLE till_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL,
  booking_code TEXT NOT NULL,
  person_id TEXT NOT NULL, -- References people[].id from till_sessions
  item_name TEXT NOT NULL,
  item_price DECIMAL(8,2) NOT NULL,
  estimated_weight INTEGER DEFAULT 500, -- grams (for postal calc)
  added_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT till_items_studio_fk FOREIGN KEY (studio_id) REFERENCES studios(id)
);

CREATE INDEX till_items_booking_code_idx ON till_items(booking_code);
CREATE INDEX till_items_person_id_idx ON till_items(person_id);
CREATE INDEX till_items_studio_id_idx ON till_items(studio_id);

-- Postal shipments (tracks Royal Mail labels + tracking)
CREATE TABLE postal_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL,
  booking_code TEXT NOT NULL,
  person_id TEXT NOT NULL,
  person_name TEXT NOT NULL,
  destination_postcode TEXT NOT NULL,
  service_type TEXT NOT NULL, -- 'royal_mail_24', 'royal_mail_48', 'special_delivery'
  service_name TEXT,
  weight_grams INTEGER,
  cost_pence INTEGER, -- stored as pence for precision
  royal_mail_tracking_number TEXT,
  label_pdf_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  CONSTRAINT postal_shipments_studio_fk FOREIGN KEY (studio_id) REFERENCES studios(id)
);

CREATE INDEX postal_shipments_booking_code_idx ON postal_shipments(booking_code);
CREATE INDEX postal_shipments_tracking_idx ON postal_shipments(royal_mail_tracking_number);

-- RLS Policies
ALTER TABLE till_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE till_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE postal_shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "till_sessions_studio_access" ON till_sessions
  FOR ALL USING (studio_id = (SELECT studio_id FROM studios WHERE id = studio_id));

CREATE POLICY "till_items_studio_access" ON till_items
  FOR ALL USING (studio_id = (SELECT studio_id FROM studios WHERE id = studio_id));

CREATE POLICY "postal_shipments_studio_access" ON postal_shipments
  FOR ALL USING (studio_id = (SELECT studio_id FROM studios WHERE id = studio_id));
