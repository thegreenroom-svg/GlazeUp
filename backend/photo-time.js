// [9 Oct] When was a table photo actually taken?
//
// The iPad Shortcut sends taken_at, but what arrives has never parsed, so
// every photo was stamped with its upload time -- yesterday's tables sent
// this morning looked like they were taken this morning. The camera writes
// the real time into the photo itself (EXIF DateTimeOriginal), so that is
// read first. The Shortcut's own text is tried next, in the formats iOS
// produces. Upload time is the last resort.

// EXIF times are local wall-clock with no zone. The studio is in London.
function londonToUtc(y, mo, d, h, mi, s) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const asLondon = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'Europe/London' })).getTime();
  const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(guess - (asLondon - asUtc));
}

export function exifTakenAt(buf) {
  try {
    if (!buf || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
    let p = 2;
    while (p + 4 < buf.length) {
      if (buf[p] !== 0xff) return null;
      const marker = buf[p + 1];
      const len = buf.readUInt16BE(p + 2);
      if (marker === 0xe1 && buf.toString('ascii', p + 4, p + 10) === 'Exif\0\0') {
        const t = p + 10;
        const le = buf.toString('ascii', t, t + 2) === 'II';
        const u16 = (o) => (le ? buf.readUInt16LE(t + o) : buf.readUInt16BE(t + o));
        const u32 = (o) => (le ? buf.readUInt32LE(t + o) : buf.readUInt32BE(t + o));
        const readIfd = (off) => {
          const n = u16(off), out = {};
          for (let i = 0; i < n; i++) {
            const e = off + 2 + i * 12;
            out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), value: u32(e + 8) };
          }
          return out;
        };
        const ifd0 = readIfd(u32(4));
        const ascii = (ent) => (ent && ent.type === 2 ? buf.toString('ascii', t + ent.value, t + ent.value + ent.count).replace(/\0.*$/, '') : null);
        let str = null;
        if (ifd0[0x8769]) {
          const sub = readIfd(ifd0[0x8769].value);
          str = ascii(sub[0x9003]) || ascii(sub[0x9004]);
        }
        str = str || ascii(ifd0[0x0132]);
        const m = str && str.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
        if (!m) return null;
        const d = londonToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]);
        return isNaN(d) ? null : d;
      }
      if (marker === 0xda) return null; // image data starts; no EXIF
      p += 2 + len;
    }
  } catch { /* unreadable EXIF is just no EXIF */ }
  return null;
}

// [10 Oct] The same camera time, read from an EXIF block on its own --
// what sharp's metadata() hands back for any format, HEIC included,
// without decoding the picture. Lets the server spot a resent photo
// before spending any memory converting it. The block is wrapped in a
// minimal JPEG APP1 segment so the reader above does the work.
export function exifBlockTakenAt(exif) {
  try {
    if (!exif || exif.length < 8) return null;
    // Find where the TIFF data starts. JPEG blocks begin "Exif\0\0"; HEIC
    // blocks can carry a 4-byte offset first. Look in the first 32 bytes.
    let tiff = -1;
    for (let i = 0; i < Math.min(32, exif.length - 4); i++) {
      const sig = exif.toString('latin1', i, i + 4);
      if (sig === 'MM\0*' || sig === 'II*\0') { tiff = i; break; }
    }
    if (tiff < 0) return null;
    const body = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), exif.subarray(tiff)]);
    if (body.length + 2 > 0xffff) return null;
    const len = Buffer.alloc(2); len.writeUInt16BE(body.length + 2);
    return exifTakenAt(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, body]));
  } catch { return null; }
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

// iOS Shortcuts date text: "9 Oct 2026 at 15:20", "9 October 2026, 15:20:11",
// "09/10/2026, 15:20", "2026-10-09 15:20:11", or a proper ISO string.
export function shortcutTakenAt(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) { const d = new Date(s); return isNaN(d) ? null : d; }
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return londonToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0));
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:,|\s+at)?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  const mo = m && (MONTHS[m[2].slice(0, 4).toLowerCase()] || MONTHS[m[2].slice(0, 3).toLowerCase()]);
  if (mo) {
    let h = +m[4];
    if (m[7]) h = (h % 12) + (/pm/i.test(m[7]) ? 12 : 0);
    return londonToUtc(+m[3], mo, +m[1], h, +m[5], +(m[6] || 0));
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return londonToUtc(+m[3], +m[2], +m[1], +m[4], +m[5], +(m[6] || 0));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// The time a photo was taken, and where that came from. A time in the
// future, or more than 60 days back, is not believed.
export function photoTakenAt(buf, raw, now = new Date(), exifBlock = null) {
  const ok = (d) => d && !isNaN(d) && d.getTime() <= now.getTime() + 10 * 60000 && d.getTime() > now.getTime() - 60 * 86400000;
  const e = exifTakenAt(buf) || exifBlockTakenAt(exifBlock);
  if (ok(e)) return { at: e, from: 'camera' };
  const s = shortcutTakenAt(raw);
  if (ok(s)) return { at: s, from: 'shortcut' };
  return { at: now, from: 'upload' };
}

