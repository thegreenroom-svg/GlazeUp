-- ═══════════════════════════════════════════════════════════
-- Genuine real WebAuthn (Face ID / Touch ID / biometric) credentials.
-- IMPORTANT, honestly: these tables never store any face data,
-- fingerprint data, or biometric information of any kind — WebAuthn
-- matching happens entirely on the device's own secure hardware. What
-- gets stored here is an opaque cryptographic credential ID and
-- public key, functionally no different from a very long password —
-- genuinely useless to anyone without the actual physical device.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS staff_webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  staff_member_id UUID NOT NULL,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  device_label TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_staff_webauthn_staff ON staff_webauthn_credentials(staff_member_id);
ALTER TABLE public.staff_webauthn_credentials ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS customer_webauthn_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  customer_id UUID,
  booking_code TEXT,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_customer_webauthn_customer ON customer_webauthn_credentials(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_webauthn_booking ON customer_webauthn_credentials(booking_code);
ALTER TABLE public.customer_webauthn_credentials ENABLE ROW LEVEL SECURITY;
