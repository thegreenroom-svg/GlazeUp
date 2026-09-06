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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={field} aria-label="From date" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={field} aria-label="To date" />
        </div>
        <button
          onClick={run}
          disabled={busy}
          style={{ minHeight: 48, borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', opacity: busy ? 0.6 : 1 }}
        >
          <Search size={17} /> {busy ? 'Searching…' : 'Search'}
        </button>
        <p style={{ fontSize: 'var(--text-xs)', color: '#777', margin: 0 }}>
          A name on its own searches every booking. Dates on their own show a whole day or week.
        </p>
      </div>

      {results && results.length === 0 && (
        <p style={{ fontSize: 'var(--text-sm)', color: '#777' }}>Nothing matched that.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {(results || []).map((b) => (
          <button
            key={b.booking_code}
            onClick={() => router.push(`/packing?code=${encodeURIComponent(b.booking_code)}`)}
            style={{ textAlign: 'left', background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.7rem 0.8rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 'var(--text-md)', fontWeight: 700, margin: 0 }}>{b.customer_name}</p>
              <p style={{ fontSize: 'var(--text-xs)', color: '#777', margin: '0.15rem 0 0' }}>
                {new Date(b.session_start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                {' · '}
                {new Date(b.session_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                {b.table_number ? ` · Table ${b.table_number}` : ''}
              </p>
              {b.collection_date && (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--clay)', fontWeight: 600, margin: '0.15rem 0 0' }}>
                  Collect {new Date(b.collection_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </p>
              )}
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              <span style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--clay)' }}>
                {b.pieces} piece{b.pieces === 1 ? '' : 's'}
              </span>
              {/* The question behind most searches. Said plainly either way. */}
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: b.with_photo ? '#2E7D32' : '#A6761D', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                <Camera size={11} /> {b.with_photo ? `${b.with_photo} with photo` : 'no photo'}
              </span>
            </div>
          </button>
        ))}
      </div>
    </PageShell>
  );
}
