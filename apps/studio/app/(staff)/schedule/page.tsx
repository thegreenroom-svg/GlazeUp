'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { ChevronLeft, ChevronRight, MapPin, Camera, Package, Flame, Printer, PoundSterling, Users, ShieldCheck, Palette } from 'lucide-react';

// Deliberately mirrors the Square Appointments side-by-side day view --
// tables as columns, time down the side, sessions as blocks. Not for the
// sake of copying: it's the screen the studio already runs on every shift,
// so it needs no learning at all. Daisy: "if it emulates, even better
// because that's very, very easy for the girls to navigate."
//
// The difference is what happens on tap. Square shows the appointment; this
// opens what the studio actually needs mid-shift -- the pieces, the photo,
// who each one is for.

interface ScheduleBooking {
  booking_code: string;
  customer_name: string;
  session_start: string;
  session_end: string | null;
  room: string;
  party_size: number | null;
  space_name: string | null;
  live_ticket_name: string | null;
  live_ticket_total_cents: number | null;
  finished: boolean;
}


interface Collection {
  booking_code: string;
  customer_name: string;
  collection_method: string | null;
  postal_postcode: string | null;
  piece_count: number;
  ready: boolean;
}

interface ScheduleData {
  date: string;
  columns: string[];
  bookings: ScheduleBooking[];
  unassigned: number;
  collections: Collection[];
}

type PieceBox = { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number };

interface PanelPiece {
  id: string;
  piece_type: string | null;
  description: string | null;
  status: string | null;
  reference_photo_url: string | null;
  photo_box: PieceBox | null;
  assigned_to: string | null;
  fulfilment: string | null;
}

const PIECE_COLOURS = ['#e0392b', '#1a8a3c', '#2b6fe0', '#c77a0a', '#8b3ec7', '#0a9aa8'];

// Crops the shared table photo to one piece, same as the booking and packing
// screens. Every piece shares ONE photo, so without this the panel shows the
// same picture of the whole table on every row.
function cropStyle(url: string, box: PieceBox): React.CSSProperties {
  const w = box.right_pct - box.left_pct;
  const h = box.bottom_pct - box.top_pct;
  if (!(w > 0) || !(h > 0)) return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${(100 / w) * 100}% ${(100 / h) * 100}%`,
    backgroundPosition: `${w >= 100 ? 0 : (box.left_pct / (100 - w)) * 100}% ${h >= 100 ? 0 : (box.top_pct / (100 - h)) * 100}%`,
    backgroundRepeat: 'no-repeat',
  };
}

// Sessions that overlap in the same room have to sit SIDE BY SIDE, or they
// stack on top of each other and all but the last one vanish. That is exactly
// what happened when columns became rooms: a table-per-column layout never
// needed this, because two bookings at 10:00 were on two different tables and
// therefore in two different columns. Group them by room and eight concurrent
// sessions become one visible session.
//
// Standard interval-packing: walk sessions in start order, keep a cluster of
// everything that overlaps, and give each member a lane. Width is shared
// across the widest point of the cluster so nothing ever overlaps visually.
function layOut<T extends { session_start: string; session_end: string | null }>(items: T[]) {
  const withTimes = items
    .map((b) => ({
      b,
      start: new Date(b.session_start).getTime(),
      end: b.session_end
        ? new Date(b.session_end).getTime()
        : new Date(b.session_start).getTime() + 90 * 60 * 1000,
    }))
    .sort((x, y) => x.start - y.start);

  const out: { b: T; lane: number; lanes: number }[] = [];
  let cluster: typeof withTimes = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const laneEnds: number[] = [];
    const placed = cluster.map((it) => {
      let lane = laneEnds.findIndex((e) => e <= it.start);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.end); }
      else laneEnds[lane] = it.end;
      return { it, lane };
    });
    const lanes = laneEnds.length;
    for (const p of placed) out.push({ b: p.it.b, lane: p.lane, lanes });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const it of withTimes) {
    if (it.start >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  flush();
  return out;
}

const HOUR_PX = 64;
const START_HOUR = 9;
const END_HOUR = 19;

// Same clay/sand palette as the rest of the app rather than Square's blue,
// so it reads as part of this product and not an embedded iframe.
// Minimum room-column width, and the minimum a single session can shrink to
// before the column widens instead. 104px still fits a time, a first name and
// a party size, which is everything a block needs to be useful at a glance.
const COL_W = 220;
const LANE_MIN_W = 104;

// Per Daisy: "if it is a landing page, do we need all the other hidden
// stuff... little square tiles referencing those actions on this page so we
// can click through to everything from there. No huge menu page."
//
// One tile per JOB, not per page. The menu had 40 entries grouped six ways,
// which is a fine index and a poor landing pad -- you have to read it. These
// are the eight things someone actually walks up to this iPad to do that
// aren't "run a session", and a session is already the grid above.
//
// Deliberately eight and not fourteen: a tile grid stops being scannable at
// about that point and becomes a menu with bigger fonts, which is the thing
// being replaced. Everything else stays reachable through the menu, which is
// now genuinely the back door rather than the front.
const TILES: { label: string; href: string; icon: React.ReactNode }[] = [
  // Photo first, name unknown -- the way pottery actually turns up.
  { label: 'Whose is this?', href: '/photo-match', icon: <Camera size={18} /> },
  { label: 'Find a piece', href: '/find-on-table', icon: <MapPin size={18} /> },
  { label: 'Packing', href: '/packing', icon: <Package size={18} /> },
  { label: 'Kiln', href: '/kiln-batch', icon: <Flame size={18} /> },
  { label: 'All pieces', href: '/pieces', icon: <Palette size={18} /> },
  { label: 'Print cards', href: '/daily-cards', icon: <Printer size={18} /> },
  { label: 'Finance', href: '/money', icon: <PoundSterling size={18} /> },
  { label: 'Customers', href: '/customers', icon: <Users size={18} /> },
  { label: 'Admin', href: '/roles', icon: <ShieldCheck size={18} /> },
];

export default function SchedulePage() {
  const router = useRouter();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tapping a session opens a panel BESIDE the day rather than navigating
  // away. The common question mid-shift is "what's on table 4, how many
  // pieces, is it done" -- that's a glance, and on an interrupted Saturday
  // the real cost of a page navigation is losing your place in the day.
  // Anything deeper still gets a proper page.
  const [selected, setSelected] = useState<ScheduleBooking | null>(null);
  const [panelPieces, setPanelPieces] = useState<PanelPiece[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);

  // The studio runs on iPads and Android tablets, so side-by-side is the
  // case worth optimising: calendar left, detail right, both live. A phone
  // gets the panel stacked above the grid instead, because a 340px panel
  // next to a grid on a phone leaves a letterbox of each.
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const check = () => setWide(window.innerWidth >= 820);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/schedule/${date}`);
      if (!res.ok) throw new Error(`Could not load the schedule (${res.status})`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the schedule');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) { setPanelPieces([]); return; }
    let cancelled = false;
    setPanelLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${selected.booking_code}/detail`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setPanelPieces(d?.pieces || []); })
      .catch(() => { if (!cancelled) setPanelPieces([]); })
      .finally(() => { if (!cancelled) setPanelLoading(false); });
    // Guarded so a fast tap through three sessions can't land an earlier
    // booking's pieces in a later booking's panel.
    return () => { cancelled = true; };
  }, [selected]);

  const shiftDay = (n: number) => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + n);
    setDate(d.toISOString().slice(0, 10));
  };

  const topFor = (iso: string) => {
    const d = new Date(iso);
    const mins = (d.getHours() - START_HOUR) * 60 + d.getMinutes();
    return (mins / 60) * HOUR_PX;
  };

  const heightFor = (b: ScheduleBooking) => {
    if (!b.session_end) return HOUR_PX * 1.5;
    const mins = (new Date(b.session_end).getTime() - new Date(b.session_start).getTime()) / 60000;
    // Floor at 40px: a genuinely short session still needs to be readable
    // and tappable, and a 15-minute block would be neither.
    return Math.max(40, (mins / 60) * HOUR_PX);
  };

  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
  const columns = data?.columns || [];

  return (
    <PageShell title="Schedule" subtitle="The day, table by table">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button onClick={() => shiftDay(-1)} style={navBtn}><ChevronLeft size={18} /></button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          // Explicit colour AND background, not just border. A native
          // <input type="date"> keeps its own white box regardless of the
          // page's theme, so in dark mode this was inheriting the body's
          // pale text colour onto that white box and becoming unreadable --
          // exactly what Daisy saw at 21:08, evening, system dark mode on.
          // navBtn right next to it survived only because it already
          // hardcoded both colours; nothing here did.
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid #ddd', fontSize: '0.85rem', color: 'var(--charcoal)', backgroundColor: 'white' }}
        />
        <button onClick={() => shiftDay(1)} style={navBtn}><ChevronRight size={18} /></button>
        <button onClick={() => setDate(new Date().toISOString().slice(0, 10))} style={{ ...navBtn, width: 'auto', padding: '0 0.7rem', fontSize: '0.8rem' }}>
          Today
        </button>
      </div>

      {loading && <p style={{ fontSize: '0.85rem', color: '#888' }}>Loading the day...</p>}
      {error && <p style={{ fontSize: '0.85rem', color: '#c0392b' }}>{error}</p>}

      {!loading && !error && columns.length === 0 && (
        // Same root cause as the date input: --charcoal is a fixed dark
        // colour, not theme-aware, so this only stayed readable because
        // every other card on this page hardcodes a white background
        // under it. This one didn't -- on a day with zero bookings, in
        // dark mode, dark text would sit on the page's own dark
        // background and simply never appear.
        <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px dashed #ddd', borderRadius: 10, backgroundColor: 'white' }}>
          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--charcoal)' }}>Nothing booked</p>
          <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.3rem' }}>
            No sessions in the diary for this day.
          </p>
        </div>
      )}

      {/* Calendar and detail side by side on a tablet, stacked on a phone.
          The day stays on screen either way -- that's the whole point. */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
      {!loading && columns.length > 0 && (
        // Horizontal scroll rather than squeezing every table onto a phone
        // screen: five columns at a legible width beats eight illegible
        // ones, and swiping sideways is exactly what Square does here too.
        <div style={{ flex: 1, minWidth: 0, display: 'flex', overflowX: 'auto', border: '1px solid #eee', borderRadius: 10, background: 'white' }}>
          <div style={{ flexShrink: 0, width: 46, borderRight: '1px solid #eee' }}>
            <div style={{ height: 34, borderBottom: '1px solid #eee' }} />
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_PX, fontSize: '0.68rem', color: '#999', padding: '0.2rem 0.3rem', borderBottom: '1px solid #f4f4f4', textAlign: 'right' }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {columns.map((col) => {
            const inCol = layOut((data?.bookings || []).filter((b) => b.room === col));
            // A room column has to be wide enough for its busiest moment.
            // Today's real day peaks at 10 concurrent sessions in Main
            // Studio; at a fixed 220px that is 19px each -- present, but
            // unreadable. So the column grows with the load and the grid
            // scrolls sideways, which it already does.
            const maxLanes = Math.max(1, ...inCol.map((x) => x.lanes));
            const colW = Math.max(COL_W, maxLanes * LANE_MIN_W);
            return (
              <div key={col} style={{ flexShrink: 0, width: colW, borderRight: '1px solid #f0f0f0', position: 'relative' }}>
                <div style={{ height: 34, borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--charcoal)', position: 'sticky', top: 0, background: 'white', zIndex: 2 }}>
                  {col}
                </div>
                <div style={{ position: 'relative', height: hours.length * HOUR_PX }}>
                  {hours.map((h, i) => (
                    <div key={h} style={{ position: 'absolute', top: i * HOUR_PX, left: 0, right: 0, height: HOUR_PX, borderBottom: '1px solid #f4f4f4' }} />
                  ))}
                  {inCol.map(({ b, lane, lanes }) => (
                    <button
                      key={b.booking_code}
                      // Mid-shift you want the till and the photo; after
                      // firing you want the pieces. The schedule already
                      // knows which of those a session is, so it sends you
                      // to the right one instead of making you pick.
                      onClick={() => setSelected(b)}
                      style={{
                        position: 'absolute',
                        top: topFor(b.session_start),
                        // Each session gets its own lane within the room.
                        left: 3 + lane * ((colW - 6) / lanes),
                        width: (colW - 6) / lanes - 3,
                        height: heightFor(b),
                        // Finished sessions fade back so the eye lands on
                        // what still needs doing -- the actual question
                        // being asked of this screen mid-shift.
                        backgroundColor: b.finished ? '#EFEAE4' : 'var(--clay)',
                        color: b.finished ? '#8A8177' : 'white',
                        border: 'none',
                        borderRadius: 6,
                        padding: '0.3rem 0.35rem',
                        textAlign: 'left',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        fontSize: '0.68rem',
                        lineHeight: 1.25,
                      }}
                    >
                      <span style={{ fontWeight: 700, display: 'block' }}>
                        {new Date(b.session_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ display: 'block', fontWeight: 600 }}>{b.customer_name}</span>
                      {b.party_size ? <span style={{ display: 'block', opacity: 0.85 }}>{b.party_size} painting</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {selected && (
        <div style={wide ? {
          width: 330, flexShrink: 0,
          border: '1px solid #eee', borderRadius: 10, background: 'white',
          padding: '0.85rem',
          // Sticks alongside as you scroll the day on a tablet, so the
          // panel doesn't slide off while you're reading it.
          position: 'sticky', top: 12,
          maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto',
        } : {
          // On a phone this is a bottom sheet, not a block in the flow.
          // It previously stacked ABOVE the grid via column-reverse, so
          // tapping a session while scrolled into the afternoon opened the
          // panel off-screen above -- it looked like nothing happened at
          // all. Fixed to the bottom of the viewport, it's always where
          // the thumb just was.
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
          background: 'white', borderTop: '1px solid #ddd',
          borderTopLeftRadius: 14, borderTopRightRadius: 14,
          boxShadow: '0 -6px 24px rgba(0,0,0,0.16)',
          padding: '0.85rem 0.85rem 1.4rem',
          maxHeight: '62dvh', overflowY: 'auto',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
            <div>
              <p style={{ fontSize: '1rem', fontWeight: 700 }}>{selected.customer_name}</p>
              <p style={{ fontSize: '0.76rem', color: '#777' }}>
                {new Date(selected.session_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                {selected.room ? ` · ${selected.room}` : ''}
                {selected.party_size ? ` · ${selected.party_size} painting` : ''}
              </p>
              {/* What the girls actually called it on the till. Shown
                  alongside the appointment's table rather than instead of
                  it, because they answer different questions: the
                  appointment says where the party was booked, the ticket
                  says what the terminal is calling them right now. */}
              {selected.live_ticket_name && (
                <p style={{ fontSize: '0.74rem', color: 'var(--clay)', fontWeight: 600, marginTop: '0.15rem' }}>
                  Till: {selected.live_ticket_name}
                  {selected.live_ticket_total_cents ? ` · £${(selected.live_ticket_total_cents / 100).toFixed(2)}` : ''}
                </p>
              )}
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: '1.1rem', color: '#999', cursor: 'pointer', lineHeight: 1, padding: 0 }} aria-label="Close">×</button>
          </div>

          {/* The glance: which pieces, cropped to themselves. Anything
              deeper -- assignment, the full photo, re-identifying -- is a
              proper page, because a 330px column is the wrong place to do
              real work. */}
          <div style={{ marginTop: '0.7rem' }}>
            {panelLoading && <p style={{ fontSize: '0.78rem', color: '#888' }}>Loading pieces...</p>}
            {!panelLoading && panelPieces.length === 0 && (
              <p style={{ fontSize: '0.78rem', color: '#888' }}>No pieces recorded yet.</p>
            )}
            {panelPieces.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', padding: '0.3rem 0' }}>
                {p.reference_photo_url ? (
                  <div style={{
                    width: 42, height: 42, borderRadius: 5, flexShrink: 0,
                    border: `2px solid ${PIECE_COLOURS[i % 6]}`,
                    ...(p.photo_box ? cropStyle(p.reference_photo_url, p.photo_box)
                      : { backgroundImage: `url(${p.reference_photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }),
                  }} />
                ) : (
                  <div style={{ width: 42, height: 42, borderRadius: 5, flexShrink: 0, background: '#f7f7f7' }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '0.78rem', fontWeight: 600 }}>{p.piece_type || 'Piece'}</p>
                  {p.assigned_to && <p style={{ fontSize: '0.7rem', color: 'var(--clay)', fontWeight: 600 }}>For {p.assigned_to}</p>}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.75rem', paddingTop: '0.7rem', borderTop: '1px solid #f0f0f0' }}>
            {!selected.finished && (
              <button onClick={() => router.push(`/floor?code=${selected.booking_code}`)} style={panelBtn(true)}>Run session</button>
            )}
            <button onClick={() => router.push(`/bookings?code=${selected.booking_code}`)} style={panelBtn(false)}>Full booking</button>
            <button onClick={() => router.push(`/daily-cards?code=${selected.booking_code}&date=${selected.session_start.slice(0, 10)}`)} style={panelBtn(false)}>Card</button>
            {panelPieces.length > 0 && (
              <button onClick={() => router.push(`/packing?code=${selected.booking_code}`)} style={panelBtn(false)}>Pack</button>
            )}
          </div>
        </div>
      )}
      </div>

      {/* Collections due today. Deliberately BELOW the grid: sessions are
          the live thing, this is the second lane. But it's the reason
          this view beats the Square calendar it's modelled on -- Square
          sees an appointment that ended a fortnight ago and is done with
          it, and has no idea a customer is walking in today for a plate.
          Nothing else in the studio shows that alongside the day. */}
      {(data?.collections?.length ?? 0) > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#888', marginBottom: '0.5rem' }}>
            Due back today
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
            {(data?.collections || []).map((c) => (
              <button
                key={c.booking_code}
                onClick={() => router.push(`/bookings?code=${c.booking_code}`)}
                style={{
                  flexShrink: 0,
                  minWidth: 150,
                  textAlign: 'left',
                  padding: '0.55rem 0.65rem',
                  borderRadius: 8,
                  border: `1px solid ${c.ready ? '#9CC79C' : '#E4D8C8'}`,
                  backgroundColor: c.ready ? '#F1F8F1' : '#FBF7F1',
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--charcoal)' }}>{c.customer_name}</span>
                <span style={{ display: 'block', fontSize: '0.72rem', color: '#777' }}>
                  {c.piece_count} piece{c.piece_count === 1 ? '' : 's'}
                  {c.collection_method === 'postal' ? ' · posting' : ''}
                </span>
                <span style={{ display: 'block', fontSize: '0.7rem', fontWeight: 600, marginTop: '0.15rem', color: c.ready ? '#2E7D32' : '#A6761D' }}>
                  {c.ready ? 'Ready' : 'Not ready yet'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {/* Below the day and the collections, because the day is what you
          came for. Four across on a phone, eight across on the iPad. */}
      <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(78px, 1fr))', gap: '0.5rem' }}>
          {TILES.map((t) => (
            <button
              key={t.href}
              onClick={() => router.push(t.href)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '0.3rem', padding: '0.7rem 0.35rem', borderRadius: 10,
                border: '1px solid #eee', background: 'white', cursor: 'pointer',
                color: 'var(--charcoal)', fontSize: '0.7rem', fontWeight: 600, lineHeight: 1.2,
                textAlign: 'center', minHeight: 68,
              }}
            >
              <span style={{ color: 'var(--clay)' }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </PageShell>
  );
}

const navBtn: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: '1px solid #ddd',
  background: 'white',
  color: 'var(--charcoal)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const panelBtn = (primary: boolean): React.CSSProperties => ({
  padding: '0.4rem 0.65rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  borderRadius: 7,
  cursor: 'pointer',
  border: primary ? 'none' : '1px solid #ddd',
  backgroundColor: primary ? 'var(--clay)' : 'white',
  color: primary ? 'white' : 'var(--charcoal)',
});
