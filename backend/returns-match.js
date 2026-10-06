// [6 Oct] Which returns-shelf pieces belong to which booking's customer.
//
// Daisy: "how will the app know to flag a return booking needs these
// pieces?" It used to match on exact name only, so "Sarah Robertson" and
// "sarah  robertson " matched but a different spelling, or mum booking
// for her, did not. Now: same email (when both have one) OR same name,
// with spacing and case ignored.
//
// Only pieces from a booking on or before this one count -- a piece sent
// back next month does not belong on today's card.

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

export async function returnsWaitingFor(supabase, studioId, bookings) {
  const out = {};
  if (!bookings?.length) return out;

  const { data: returns } = await supabase
    .from('pottery_pieces')
    .select('id, booking_id, piece_type, return_reason, reference_photo_url, photo_box, status')
    .eq('studio_id', studioId)
    .not('returned_at', 'is', null)
    // 'back_painting' = fetched off the shelf for a later visit.
    .not('status', 'in', '(collected,back_painting)')
    .neq('archived', true)
    .limit(1000);
  if (!returns?.length) return out;

  const codes = [...new Set(returns.map((r) => r.booking_id))];
  const { data: owners } = await supabase
    .from('bookings')
    .select('booking_code, customer_name, customer_email, session_start')
    .eq('studio_id', studioId)
    .in('booking_code', codes);
  const owner = {};
  (owners || []).forEach((o) => { owner[o.booking_code] = o; });

  for (const b of bookings) {
    const bn = norm(b.customer_name);
    const be = norm(b.customer_email);
    const items = [];
    for (const r of returns) {
      const o = owner[r.booking_id];
      if (!o) continue;
      if (o.session_start && b.session_start && o.session_start > b.session_start) continue;
      const oe = norm(o.customer_email);
      const sameEmail = !!be && !!oe && be === oe;
      const sameName = !!bn && bn === norm(o.customer_name);
      if (!sameEmail && !sameName) continue;
      items.push({
        id: r.id,
        from_booking: r.booking_id,
        own: r.booking_id === b.booking_code,
        piece_type: r.piece_type || 'a piece',
        reason: r.return_reason || null,
        photo: r.reference_photo_url || null,
        box: r.photo_box || null,
      });
    }
    if (items.length) out[b.booking_code] = items;
  }
  return out;
}
