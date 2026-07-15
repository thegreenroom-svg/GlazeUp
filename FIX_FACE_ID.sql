-- ═══════════════════════════════════════════════════════════════════
-- FIX_FACE_ID.sql — 15 July 2026
-- Supabase project mdpchpjnlzlmldtlqrns
--
-- Daisy: "their face recognition doesn't work when I try it and they
-- log in."
--
-- She is right, and I told her earlier today it already worked. It
-- doesn't, and this is why.
--
-- The whole chain IS built and correct:
--   offerStaffFaceIdSetup()  — offered once, right after a PIN login
--   POST /api/staff/webauthn/register-options  + /register-verify
--   POST /api/staff/webauthn/auth-options      + /auth-verify
--   tryStaffFaceIdLogin() and the Face ID button on the PIN screen
--
-- The server stores the credential in `staff_webauthn_credentials`.
-- That table is created by webauthn_schema.sql, which is NOT in
-- RUN_ALL_SIX.sql and NOT in RUN_ALL_FOUR.sql. It has almost certainly
-- never been run. No table means register-verify fails, so:
--   • nothing is ever stored
--   • verified never comes back true
--   • klnk_webauthn_registered_<id> is never set in localStorage
--   • the Face ID button's visibility check fails, so the button
--     NEVER APPEARS on the PIN screen
-- Which is exactly what "it doesn't work" looks like from the outside.
--
-- AND IT FAILS SILENTLY. offerStaffFaceIdSetup()'s catch block treats
-- every error the same way, with this comment:
--     "honest silent fail — a declined/cancelled real biometric prompt
--      is a completely normal outcome, not an error"
-- Which is true of a cancelled prompt and NOT true of a 500 from a
-- missing table. So a real server failure has been indistinguishable
-- from someone tapping "no thanks", every time, since it was written.
-- Worth fixing in code later; the table is the actual blocker now.
--
-- ON PRIVACY, since this is the "face recognition" Daisy asked for and
-- the notes rightly say never to build face recognition: THIS IS NOT
-- THAT. No face data, no fingerprint, no biometric of any kind is ever
-- sent or stored. Apple's Secure Enclave does the matching on the
-- device and the app only receives a signed yes. What is stored below
-- is an opaque credential ID and a public key — functionally a very
-- long password, useless without the physical phone. No Article 9
-- biometric data is processed. That is the whole reason this approach
-- was chosen over the face-matching idea that was correctly rejected.
--
-- Safe to re-run — everything is IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════
-- VERIFY — both should read ok
-- ═══════════════════════════════════════════════════════════════════
SELECT 'staff_webauthn_credentials' AS thing,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='staff_webauthn_credentials') THEN 'ok' ELSE 'MISSING' END AS present
UNION ALL SELECT 'customer_webauthn_credentials',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='customer_webauthn_credentials') THEN 'ok' ELSE 'MISSING' END;

-- ═══════════════════════════════════════════════════════════════════
-- AFTER RUNNING THIS — Face ID does not switch on by itself:
--   1. Hard refresh, log in with your PIN as normal.
--   2. You will be asked "Enable Face ID / Touch ID for next time?"
--      — this offer only appears after a PIN login, once per person
--      per device, and never again if declined.
--   3. Say yes, complete the Face ID prompt.
--   4. NEXT login, the Face ID button appears above the PIN pad.
-- If you have already declined it on this phone, the app remembers and
-- will not ask again. Clearing klnk_webauthn_declined_<your id> from
-- localStorage resets that, or just try on another device.
-- ═══════════════════════════════════════════════════════════════════
