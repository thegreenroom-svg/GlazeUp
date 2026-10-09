// [9 Oct] TABLE VISION -- the cheap, exact checks on a table photo,
// before (and instead of) asking the AI.
//
// Daisy, after a list of ideas: "Do all." Two of them live here:
//
// 1. THE QR CODE ON THE CARD. Every printed card carries a QR code that
//    links to /floor?code=<booking code>. When the card is on the table
//    in the photo, reading it names the booking outright: no chalk
//    handwriting, no name matching, no AI. The read only works if the
//    code is big enough in the shot, so the card's area (found by the AI
//    read that happens anyway) is cut out at full resolution and
//    enlarged first, then the whole photo is tried in overlapping tiles.
//
// 2. A RULER. The chalk tag and the printed card are the same size on
//    every table, so a piece's size can be given relative to them.
//    Sizes are the weakest part of recognising a shape (Large Tile
//    against Large tile, Small against Large rectangle vase), and a
//    measurement settles most of those. The card is a known 4 x 6 inch
//    print, so against the card we know centimetres. The tag's size is
//    not known, so against the tag a piece is measured in "tags", and
//    each shape learns its usual size in tags from the pieces already
//    confirmed. No calibration needed, and it gets better every day.

import jsQR from 'jsqr';

export const CARD_LONG_CM = 15.24; // 6 inches, the printed card's long side

// The booking code inside whatever the QR says. Cards link to
// /floor?code=booking-YYYYMMDD-xxxxxxxx; a bare code is accepted too.
export function bookingCodeFromQr(text) {
  const s = String(text || '');
  const m = s.match(/[?&]code=([^&#\s]+)/);
  const raw = m ? decodeURIComponent(m[1]) : s.trim();
  return /^booking-\d{8}-[a-z0-9]+$/i.test(raw) ? raw : null;
}

async function tryDecode(sharp, img, maxSide) {
  const { data, info } = await sharp(img)
    .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: false })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const hit = jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), info.width, info.height, { inversionAttempts: 'attemptBoth' });
  return hit ? bookingCodeFromQr(hit.data) : null;
}

// box: { left_pct, top_pct, right_pct, bottom_pct } of the card, or null.
// Returns a booking code or null. Never throws.
export async function readCardQr(sharp, photo, box) {
  try {
    const upright = await sharp(photo).rotate().toBuffer();
    const { width: W, height: H } = await sharp(upright).metadata();
    if (!W || !H) return null;
    const crop = async (l, t, r, b) => {
      const left = Math.max(0, Math.floor(l * W)), top = Math.max(0, Math.floor(t * H));
      const width = Math.max(16, Math.min(Math.floor((r - l) * W), W - left));
      const height = Math.max(16, Math.min(Math.floor((b - t) * H), H - top));
      return sharp(upright).extract({ left, top, width, height }).toBuffer();
    };
    // The card first, generously padded: the QR sits in its corner.
    if (box) {
      const pad = 6;
      const region = await crop((box.left_pct - pad) / 100, (box.top_pct - pad) / 100, (box.right_pct + pad) / 100, (box.bottom_pct + pad) / 100);
      for (const side of [1400, 2200, 900]) {
        const code = await tryDecode(sharp, region, side);
        if (code) return code;
      }
    }
    // Then the whole photo, then a 3 x 3 grid of overlapping tiles.
    const whole = await tryDecode(sharp, upright, 2000);
    if (whole) return whole;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const tile = await crop(c * 0.3, r * 0.3, c * 0.3 + 0.4, r * 0.3 + 0.4);
        const code = await tryDecode(sharp, tile, 1400);
        if (code) return code;
      }
    }
  } catch { /* an unreadable photo is just no QR */ }
  return null;
}

// Long side of a percentage box, in pixels of the upright photo.
function longSide(box, W, H) {
  if (!box) return 0;
  const w = Math.abs(box.right_pct - box.left_pct) / 100 * W;
  const h = Math.abs(box.bottom_pct - box.top_pct) / 100 * H;
  return Math.max(w, h);
}

// The piece's size against the reference on the same photo.
// ref: { kind: 'card'|'tag', box }. Returns { size_ref, size_rel, size_cm }
// or null when there is nothing to measure against.
export function measure(pieceBox, ref, W, H) {
  if (!pieceBox || !ref?.box || !W || !H) return null;
  const p = longSide(pieceBox, W, H), r = longSide(ref.box, W, H);
  if (!p || !r || r < 12) return null;
  const rel = p / r;
  if (!isFinite(rel) || rel <= 0 || rel > 12) return null;
  return {
    size_ref: ref.kind,
    size_rel: Math.round(rel * 1000) / 1000,
    size_cm: ref.kind === 'card' ? Math.round(rel * CARD_LONG_CM * 10) / 10 : null,
  };
}

const median = (xs) => {
  const a = xs.filter((x) => isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// What each shape usually measures, learned from confirmed pieces:
// rows [{ square_item_id, size_ref, size_rel, size_cm }]. Returns
// Map id -> { tag: rel|null, cm: cm|null, n }.
export function learnSizes(rows) {
  const by = new Map();
  for (const r of rows || []) {
    if (!r.square_item_id) continue;
    const e = by.get(r.square_item_id) || { tags: [], cms: [] };
    if (r.size_ref === 'tag' && r.size_rel) e.tags.push(Number(r.size_rel));
    if (r.size_cm) e.cms.push(Number(r.size_cm));
    by.set(r.square_item_id, e);
  }
  const out = new Map();
  for (const [id, e] of by) out.set(id, { tag: median(e.tags), cm: median(e.cms), n: e.tags.length + e.cms.length });
  return out;
}

// A size written into a shape's name, e.g. "Squatty Pumpkin 9.5cm" or
// "Xmas Tree Plate 28.5cm".
export function cmFromName(name) {
  const m = String(name || '').match(/(\d+(?:\.\d+)?)\s*cm\b/i);
  return m ? Number(m[1]) : null;
}

// How well a measured piece fits a shape's known size: 1 = spot on,
// 0 = way off, null = cannot say. Tolerant, because a photo taken at an
// angle shortens things.
export function sizeFit(piece, known) {
  if (!piece || !known) return null;
  let ratio = null;
  if (piece.size_ref === 'tag' && piece.size_rel && known.tag) ratio = piece.size_rel / known.tag;
  else if (piece.size_cm && known.cm) ratio = piece.size_cm / known.cm;
  if (!ratio) return null;
  const off = Math.abs(Math.log(ratio));
  return Math.max(0, 1 - off / Math.log(1.8));
}

// Words a person would use for it, in plain cm or tags, for the AI prompt.
export function sizeWords(m) {
  if (!m) return '';
  if (m.size_cm) return `about ${Math.round(m.size_cm)} cm on its longest side`;
  if (m.size_ref === 'tag' && m.size_rel) return `about ${m.size_rel.toFixed(1)} times the length of the chalk tag on its longest side`;
  return '';
}
