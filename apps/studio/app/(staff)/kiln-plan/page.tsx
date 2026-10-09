'use client';

export const dynamic = 'force-dynamic';

// [9 Oct] KILN PLAN. For each collection date: how many pieces are still
// to fire, how many are out of the kiln, how many packed. A date coming up
// with pieces still to fire shows red, so a batch at risk is seen while
// there is still time to fire it, not on collection day.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { Loader, ChevronDown, ChevronUp } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Group {
  date: string; days_left: number | null; to_fire: number; fired: number; packed: number;
  bookings: { booking_code: string; customer_name: string; session_start: string; to_fire: number; fired: number; packed: number }[];
}

export default function KilnPlanPage() {
  const router = useRouter();
  const [d, setD] = useState<{ groups: Group[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/spec/kiln/plan`, { cache: 'no-store' })
      .then((r) => r.json()).then(setD).catch(() => setD({ groups: [] }));
  }, []);

  const label = (g: Group) => (g.date === 'none'
    ? 'No collection date yet'
    : new Date(`${g.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }));
  const when = (n: number | null) => (n === null ? '' : n < 0 ? `${-n} day${n === -1 ? '' : 's'} ago` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

  return (
    <PageShell title="Kiln plan" subtitle="What still needs firing for each collection date">
      {!d && <p style={{ color: 'var(--stone)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}><Loader size={15} className="animate-spin" /> Loading</p>}
      {d && d.groups.length === 0 && <p style={{ color: 'var(--stone)' }}>Nothing waiting. Every recent piece is collected.</p>}
      {d?.groups.map((g) => {
        const total = g.to_fire + g.fired + g.packed;
        const risk = g.to_fire > 0 && g.days_left !== null && g.days_left <= 3;
        const colour = risk ? '#b03a2e' : g.to_fire ? '#A8651A' : '#3D7A4A';
        return (
          <div key={g.date} style={{ background: 'white', border: `1px solid ${risk ? '#b03a2e66' : '#ece5db'}`, borderRadius: 'var(--radius-md)', marginBottom: '0.6rem', overflow: 'hidden' }}>
            <button onClick={() => setOpen(open === g.date ? null : g.date)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '0.8rem 0.9rem', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 700, color: 'var(--charcoal)' }}>{label(g)}</span>
                <span style={{ fontSize: 'var(--text-xs)', color: colour, fontWeight: 700 }}>{when(g.days_left)}</span>
              </div>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: '#f1ece5', marginTop: '0.5rem' }}>
                <div style={{ width: `${(g.packed / total) * 100}%`, background: '#3D7A4A' }} />
                <div style={{ width: `${(g.fired / total) * 100}%`, background: '#8fb79a' }} />
                <div style={{ width: `${(g.to_fire / total) * 100}%`, background: colour }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.4rem', fontSize: 'var(--text-xs)', color: '#6b625a' }}>
                <span><strong style={{ color: colour }}>{g.to_fire} to fire</strong> · {g.fired} out of the kiln · {g.packed} packed</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{g.bookings.length} booking{g.bookings.length === 1 ? '' : 's'} {open === g.date ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
              </div>
            </button>
            {open === g.date && (
              <div style={{ borderTop: '1px solid #ece5db' }}>
                {g.bookings.map((b) => (
                  <button
                    key={b.booking_code}
                    onClick={() => router.push(`/daily-cards?date=${b.session_start.slice(0, 10)}&code=${encodeURIComponent(b.booking_code)}&open=1`)}
                    style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '0.5rem', padding: '0.55rem 0.9rem', background: 'none', border: 'none', borderBottom: '1px solid #f4efe8', textAlign: 'left', cursor: 'pointer', fontSize: 'var(--text-sm)' }}
                  >
                    <span style={{ color: 'var(--charcoal)' }}>{b.customer_name} <span style={{ color: 'var(--stone)', fontSize: 'var(--text-xs)' }}>{new Date(b.session_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></span>
                    <span style={{ fontSize: 'var(--text-xs)', color: b.to_fire ? '#A8651A' : '#3D7A4A', fontWeight: 600 }}>
                      {b.to_fire ? `${b.to_fire} to fire` : b.packed ? 'packed' : 'out of the kiln'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p style={{ color: 'var(--stone)', fontSize: 'var(--text-xs)', marginTop: '0.8rem', lineHeight: 1.5 }}>
        Red: pieces still to fire with collection three days away or less. A piece counts as out of the kiln once it is on a shelf.
      </p>
    </PageShell>
  );
}
