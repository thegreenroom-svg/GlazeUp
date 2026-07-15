-- ═══════════════════════════════════════════════════════════
-- IN-APP PHOTO RECOGNITION — no model, no API, computed on the
-- device. Adds a perceptual hash column so pieces can be matched
-- by pure pixel-pattern comparison (Hamming distance) instead of
-- always calling OpenAI. Additive and nullable — nothing existing
-- breaks if this hasn't run yet, and old pieces simply have no
-- hash until they're next photographed.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE pottery_pieces ADD COLUMN IF NOT EXISTS photo_phash TEXT;
CREATE INDEX IF NOT EXISTS idx_pieces_phash ON pottery_pieces(studio_id, photo_phash) WHERE photo_phash IS NOT NULL;
