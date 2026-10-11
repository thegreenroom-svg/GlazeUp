'use client';

// [6 Sep] Daisy: "that's hard to find. If I wanted to go back and see a
// booking four weeks ago or, say, two weeks ago... I wanted to go find
// that booking easily."
//
// She was right that it was effectively impossible. Every list in the
// app was either today, or the most recent 250 bookings -- about a
// fortnight at current volume -- so a booking from four weeks ago could
// not be reached at all. This searches the whole history.
//
// It shows the photo count on the result, not just the name, because
// the question behind "find that booking" is almost always "did that
// one ever get photographed" -- answering it here saves opening each.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { Row, Chip } from '@/components/Row';
import { Count, Tool, Toolbar } from '@/components/Toolbar';
import { Search, Camera } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Result {
  booking_code: string;
  customer_name: string;
  session_start: string;
  collection_date: string | null;
  table_number: string | null;
  room: string | null;
  pieces: number;
  with_photo: number;
  collected: number;
}

export default function FindBookingPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [range, setRange] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!q.trim() && !from && !to) return;
    setBusy(true);
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set('q', q.trim());
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/search?${p}`);
      const d = await res.json();
      setResults(d.bookings || []);
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const lbl: React.CSSProperties = {
  display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600,
  color: '#8A7F74', marginBottom: '0.25rem',
};
const field = {
    width: '100%', minHeight: 44, padding: '0.6rem 0.7rem',
    borderRadius: 'var(--radius-md)', border: '1px solid #ece5db',
    fontSize: 'var(--text-base)', background: 'white', color: 'var(--charcoal)',
  } as const;

  return (
    <PageShell title="Find a booking" subtitle="Anywhere in the history, not just this week">
      <div style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.9rem', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="Customer name"
          style={field}
        />
        {/* Daisy: "I just want all the bookings with that date." One labelled
            date field does that. The second only appears if you ask for a
            range -- two unlabelled boxes read as one broken one. */}
        <div>
          <label style={lbl}>Date</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={field} aria-label="Date" />
        </div>
        {range ? (
          <div>
            <label style={lbl}>Up to</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={field} aria-label="Up to date" />
          </div>
        ) : (
          // [11 Oct] This was a bare text link with no padding, so the
          // tappable area was about twelve pixels high. It is a chip now,
          // which gets it to a thumb-sized target without taking any more
          // room than the line of text did.
          <Toolbar style={{ marginBottom: 0 }}>
            <Tool onClick={() => setRange(true)} tone="clay">Search a range instead</Tool>
          </Toolbar>
        )}
        <button
          onClick={run}
          disabled={busy}
          style={{ minHeight: 48, borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', opacity: busy ? 0.6 : 1 }}
        >
          <Search size={17} /> {busy ? 'Searching…' : 'Search'}
        </button>
        <p style={{ fontSize: 'var(--text-xs)', color: '#777', margin: 0 }}>
          A date on its own shows every booking that day, photos and all. A name on its own searches the whole history.
        </p>
      </div>

      {results && results.length === 0 && (
        <p style={{ fontSize: 'var(--text-sm)', color: '#777' }}>Nothing matched that.</p>
      )}

      {/* [11 Oct] How many matched, said once and quietly, where a count
          belongs. */}
      {!!results?.length && (
        <Toolbar>
          <Count>{results.length} {results.length === 1 ? 'booking' : 'bookings'}</Count>
        </Toolbar>
      )}

      {/* [11 Oct] Each result was a hand-rolled card with the name and dates
          down the left and the piece and photo counts floated right. It is
          the shared row now, the same shape as a result on Collect or the
          returns shelf, with the counts as small chips. The tap still goes
          to the same place. */}
      {(results || []).map((b) => (
        <Row
          key={b.booking_code}
          title={b.customer_name}
          detail={
            <>
              {new Date(b.session_start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              {' · '}
              {new Date(b.session_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              {b.table_number ? ` · Table ${b.table_number}` : ''}
            </>
          }
          chips={
            <>
              <Chip>{b.pieces} piece{b.pieces === 1 ? '' : 's'}</Chip>
              {b.collection_date && (
                <Chip tone="clay">
                  Collect {new Date(b.collection_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </Chip>
              )}
              {/* The question behind most searches. Said plainly either way. */}
              <Chip tone={b.with_photo ? 'good' : 'post'}>
                <Camera size={11} style={{ verticalAlign: '-1px' }} /> {b.with_photo ? `${b.with_photo} with photo` : 'no photo'}
              </Chip>
            </>
          }
          // [9 Oct] Straight to the card: pieces, photos, prices, where it all is, and Hand over.
          onClick={() => router.push(`/booking/${encodeURIComponent(b.booking_code)}`)}
        />
      ))}
    </PageShell>
  );
}
