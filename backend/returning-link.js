// [9 Oct] COMING BACK TO FINISH -- the earlier visit and its pieces.
//
// Daisy: the girls know who is returning from the Square booking notes
// ("We are coming to finish some pottery that we started in July. Nicola
// Patmore 30/7 yarn bowl", "1 to continue a previous project"). The card
// already shows the note; this finds the visit it refers to and the
// pieces left unfinished, with their photos, so whoever lays the table
// knows what to fetch off the hallway shelf.
//
// Which visit: one on a date the note mentions ("30/7") for someone the
// note names, else this customer's most recent earlier booking (same email
// or same name). Which pieces: from that visit, not collected, not fired,
// not packed -- an unfinished piece never moves on. If the note names the
// piece ("yarn bowl") the matching one is highlighted and listed first.

export const RETURNING_RE = /\b(finish(ing)?|unfinished|continu(e|ing)|carry(ing)? on|previous (project|visit|session|piece)|started (it|them|in|on|last)|come back to|coming back to|half[- ]?(done|painted|finished)|part[- ]?(done|painted)|left (it|them) (here|with you)|returns? shelf|(2nd|second) (painting )?(session|visit))\b/i;

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const STOP = new Set(['coming', 'finish', 'finishing', 'some', 'pottery', 'that', 'started', 'these', 'those', 'details', 'with', 'from', 'continue', 'previous', 'project', 'painting', 'items', 'staff', 'paid', 'people', 'person', 'back', 'last', 'time', 'thanks', 'thank', 'please', 'will', 'have', 'this', 'there', 'their', 'they', 'were', 'what', 'when', 'session', 'visit', 'piece', 'pieces', 'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);

// "30/7" or "30/07/26" in the note -> ISO dates on or before the booking.
function datesIn(note, before) {
  const out = [];
  const re = /\b(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/g;
  let m;
  while ((m = re.exec(note))) {
    const d = +m[1], mo = +m[2];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
    let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : before.getUTCFullYear();
    let iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!m[3] && new Date(iso) > before) iso = `${y - 1}-${iso.slice(5)}`;
    out.push(iso);
  }
  return out;
}

export async function earlierVisitFor(supabase, studioId, booking) {
  const note = String(booking.notes || '');
  if (!RETURNING_RE.test(note)) return null;
  const before = new Date(booking.session_start);
  const lower = note.toLowerCase();

  let chosen = null;
  const days = datesIn(note, before);
  if (days.length) {
    const { data: onDays } = await supabase.from('bookings')
      .select('booking_code, customer_name, customer_email, session_start')
      .eq('studio_id', studioId)
      .or(days.map((d) => `and(session_start.gte.${d}T00:00:00Z,session_start.lt.${d}T23:59:59Z)`).join(','))
      .limit(80);
    const named = (onDays || []).filter((b) => {
      if (b.booking_code === booking.booking_code) return false;
      const parts = norm(b.customer_name).split(' ').filter((w) => w.length >= 3);
      const sur = parts[parts.length - 1];
      return (sur && lower.includes(sur)) || norm(b.customer_name) === norm(booking.customer_name)
        || (b.customer_email && booking.customer_email && norm(b.customer_email) === norm(booking.customer_email));
    });
    if (named.length) chosen = named[0];
  }
  if (!chosen) {
    // Quoted, since names have spaces and PostgREST splits on commas.
    const q = (v) => `"${String(v || '').trim().replace(/["\\,()]/g, ' ')}"`;
    const ors = [`customer_name.ilike.${q(booking.customer_name)}`];
    if (booking.customer_email) ors.push(`customer_email.ilike.${q(booking.customer_email)}`);
    const { data: prev } = await supabase.from('bookings')
      .select('booking_code, customer_name, customer_email, session_start')
      .eq('studio_id', studioId)
      .lt('session_start', booking.session_start)
      .or(ors.join(','))
      .order('session_start', { ascending: false })
      .limit(1);
    chosen = (prev || [])[0] || null;
  }
  if (!chosen) return { booking: null, pieces: [] };

  const { data: ps } = await supabase.from('pottery_pieces')
    .select('id, piece_type, description, reference_photo_url, photo_box, status, shelf_id, packed_at, returned_at, square_item_id')
    .eq('studio_id', studioId)
    .eq('booking_id', chosen.booking_code)
    .not('archived', 'is', true);
  const words = [...new Set(lower.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
  const pieces = (ps || [])
    .filter((p) => p.returned_at || (!p.shelf_id && !p.packed_at && !['collected', 'ready', 'fired'].includes(p.status)))
    .map((p) => {
      const text = `${p.piece_type || ''} ${p.description || ''}`.toLowerCase();
      return {
        id: p.id, piece_type: p.piece_type || 'Piece', description: p.description || null,
        photo: p.reference_photo_url || null, box: p.photo_box || null, square_item_id: p.square_item_id || null,
        highlight: words.some((w) => text.includes(w)),
      };
    })
    .sort((a, b) => Number(b.highlight) - Number(a.highlight));
  return { booking: chosen, pieces };
}

// Once the returning visit's own table photo is in, an earlier piece that
// reappears on it (same recognised shape, or the same kind of piece) has
// been finished, so it stops showing as waiting. Archived, not deleted.
export async function closeContinued(supabase, studioId, logger) {
  const since = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase.from('bookings')
    .select('booking_code, customer_name, customer_email, session_start, notes')
    .eq('studio_id', studioId).gte('session_start', since).not('notes', 'is', null);
  let closed = 0;
  for (const b of (recent || []).filter((x) => RETURNING_RE.test(x.notes || ''))) {
    const { data: mine } = await supabase.from('pottery_pieces')
      .select('piece_type, square_item_id')
      .eq('studio_id', studioId).eq('booking_id', b.booking_code).not('archived', 'is', true);
    if (!mine?.length) continue;
    const found = await earlierVisitFor(supabase, studioId, b);
    if (!found?.pieces?.length) continue;
    const pool = mine.map((m) => ({ ...m, used: false }));
    for (const p of found.pieces) {
      const hit = pool.find((m) => !m.used && ((p.square_item_id && m.square_item_id === p.square_item_id)
        || (!p.square_item_id && norm(m.piece_type) === norm(p.piece_type))));
      if (!hit) continue;
      hit.used = true;
      const day = new Date(b.session_start).toISOString().slice(0, 10);
      await supabase.from('pottery_pieces').update({
        archived: true, status: 'continued', updated_at: new Date().toISOString(),
      }).eq('id', p.id).eq('studio_id', studioId);
      closed++;
      logger?.info?.(`[returns] piece ${p.id} continued on ${b.booking_code} (${day})`);
    }
  }
  return { closed };
}
