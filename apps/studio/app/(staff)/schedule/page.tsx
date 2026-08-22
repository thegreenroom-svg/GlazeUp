'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { ChevronLeft, ChevronRight, RefreshCw, AlertCircle, MapPin, Package, Flame, Printer, PoundSterling, Users, ShieldCheck, Palette } from 'lucide-react';

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
  table_number: string | null;
  party_size: number | null;
  space_name: string | null;
  finished: boolean;
}

// Same shortener the printed cards use, so a room is called the same thing
// on the screen and on the card in the customer's hand. 'The Vault -
// perfect for private parties!' -> 'Vault'.
function shortSpaceLabel(spaceName: string | null): string | null {
  if (!spaceName) return null;
  const s = spaceName.toLowerCase();
  if (s.includes('vault')) return 'Vault';
  if (s.includes('lounge')) return 'Lounge';
  if (s.includes('main studio')) return 'Main Studio';
  if (s.includes('evening')) return 'Evening Session';
  if (s.includes('thursdays')) return 'Thursdays';
  if (s.includes('wheel hire')) return 'Wheel Hire';
  if (s.includes('throwing taster')) return 'Throwing Taster';
  if (s.includes('kids party')) return 'Kids Party';
  if (s.includes('ultimate')) return 'Ultimate Party';
  if (s.includes('pop-up') || s.includes('pop up')) return 'Pop-Up';
  if (s.includes('grotto')) return 'Grotto';
  return null;
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

const HOUR_PX = 64;
const START_HOUR = 9;
const END_HOUR = 19;

// Same clay/sand palette as the rest of the app rather than Square's blue,
// so it reads as part of this product and not an embedded iframe.
const COL_W = 132;

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
  const [syncing, setSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);

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

  // Pulls the real table off each Square appointment. Two steps because the
  // staff list is cached separately -- it changes maybe once a year, the
  // bookings change hourly.
  const syncTables = async () => {
    setSyncing(true);
    setSyncNote(null);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/square/sync-team-members`, { method: 'POST' });
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/square/sync-booking-tables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Sync failed');
      setSyncNote(`${d.updated} booking${d.updated === 1 ? '' : 's'} moved to their real table${d.no_match ? `, ${d.no_match} with no matching appointment` : ''}`);
      await load();
    } catch (e) {
      setSyncNote(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

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
  const unassignedBookings = (data?.bookings || []).filter((b) => !b.table_number);

  return (
    <PageShell title="Schedule" subtitle="The day, table by table">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button onClick={() => shiftDay(-1)} style={navBtn}><ChevronLeft size={18} /></button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ padding: '0.4rem 0.6rem', borderRadius: 8, border: '1px solid #ddd', fontSize: '0.85rem' }}
        />
        <button onClick={() => shiftDay(1)} style={navBtn}><ChevronRight size={18} /></button>
        <button onClick={() => setDate(new Date().toISOString().slice(0, 10))} style={{ ...navBtn, width: 'auto', padding: '0 0.7rem', fontSize: '0.8rem' }}>
          Today
        </button>
        <button
          onClick={syncTables}
          disabled={syncing}
          style={{ ...navBtn, width: 'auto', padding: '0 0.7rem', fontSize: '0.8rem', opacity: syncing ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing' : 'Sync tables'}
        </button>
      </div>

      {syncNote && (
        <p style={{ fontSize: '0.78rem', color: 'var(--clay)', marginBottom: '0.6rem' }}>{syncNote}</p>
      )}

      {/* Bookings Square knows about but that have no table yet. Shown
          rather than hidden -- a session with no table is exactly the one
          that gets missed on a busy day. */}
      {unassignedBookings.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.6rem 0.75rem', borderRadius: 8, backgroundColor: '#FFF6E8', border: '1px solid #F0C987', marginBottom: '0.75rem' }}>
          <AlertCircle size={16} style={{ color: '#B8860B', flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#7A5B00' }}>
              {unassignedBookings.length} booking{unassignedBookings.length === 1 ? '' : 's'} with no table
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.35rem' }}>
              {unassignedBookings.map((b) => (
                <button
                  key={b.booking_code}
                  onClick={() => router.push(`/floor?code=${b.booking_code}`)}
                  style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: 999, border: '1px solid #E0B463', background: 'white', color: '#7A5B00', cursor: 'pointer' }}
                >
                  {b.customer_name} · {new Date(b.session_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  {shortSpaceLabel(b.space_name) ? ` · ${shortSpaceLabel(b.space_name)}` : ''}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {loading && <p style={{ fontSize: '0.85rem', color: '#888' }}>Loading the day...</p>}
      {error && <p style={{ fontSize: '0.85rem', color: '#c0392b' }}>{error}</p>}

      {!loading && !error && columns.length === 0 && (
        <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px dashed #ddd', borderRadius: 10 }}>
          <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--charcoal)' }}>No tables known yet</p>
          <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.3rem' }}>
            Tap Sync tables to pull them from Square Appointments.
          </p>
        </div>
      )}

      {!loading && columns.length > 0 && (
        // Horizontal scroll rather than squeezing every table onto a phone
        // screen: five columns at a legible width beats eight illegible
        // ones, and swiping sideways is exactly what Square does here too.
        <div style={{ display: 'flex', overflowX: 'auto', border: '1px solid #eee', borderRadius: 10, background: 'white' }}>
          <div style={{ flexShrink: 0, width: 46, borderRight: '1px solid #eee' }}>
            <div style={{ height: 34, borderBottom: '1px solid #eee' }} />
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_PX, fontSize: '0.68rem', color: '#999', padding: '0.2rem 0.3rem', borderBottom: '1px solid #f4f4f4', textAlign: 'right' }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {columns.map((col) => {
            const inCol = (data?.bookings || []).filter((b) => b.table_number === col);
            return (
              <div key={col} style={{ flexShrink: 0, width: COL_W, borderRight: '1px solid #f0f0f0', position: 'relative' }}>
                <div style={{ height: 34, borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--charcoal)', position: 'sticky', top: 0, background: 'white', zIndex: 2 }}>
                  {col}
                </div>
                <div style={{ position: 'relative', height: hours.length * HOUR_PX }}>
                  {hours.map((h, i) => (
                    <div key={h} style={{ position: 'absolute', top: i * HOUR_PX, left: 0, right: 0, height: HOUR_PX, borderBottom: '1px solid #f4f4f4' }} />
                  ))}
                  {inCol.map((b) => (
                    <button
                      key={b.booking_code}
                      // Mid-shift you want the till and the photo; after
                      // firing you want the pieces. The schedule already
                      // knows which of those a session is, so it sends you
                      // to the right one instead of making you pick.
                      onClick={() => router.push(b.finished ? `/bookings?code=${b.booking_code}` : `/floor?code=${b.booking_code}`)}
                      style={{
                        position: 'absolute',
                        top: topFor(b.session_start),
                        left: 3,
                        width: COL_W - 9,
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
                      {/* The room, from the Square service name. Worth
                          showing because table and room disagree until
                          tables are synced -- a Vault booking currently
                          reads as "Main Studio 14", which is nonsense that
                          would otherwise be invisible. */}
                      {shortSpaceLabel(b.space_name) && (
                        <span style={{ display: 'block', opacity: 0.75, fontStyle: 'italic' }}>{shortSpaceLabel(b.space_name)}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
