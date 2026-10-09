'use client';

export const dynamic = 'force-dynamic';

// [9 Oct] OVERDUE COLLECTIONS. Who is past their collection date with
// pottery still here, longest first, with a phone number or email to
// chase them by. Clearing these is what keeps the shelves current.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { Loader, Phone, Mail } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Row {
  booking_code: string; customer_name: string; email: string | null; phone: string | null;
  painted: string; due: string; days_overdue: number; pieces: number; on_shelf: number; packed: number; postal: boolean;
}

export default function OverduePage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch(`${API}/api/spec/collections/overdue`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => setRows(d.overdue || [])).catch(() => setRows([]));
  }, []);

  return (
    <PageShell title="Overdue collections" subtitle="Past their collection date, pottery still here">
      {!rows && <p style={{ color: 'var(--stone)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}><Loader size={15} className="animate-spin" /> Loading</p>}
      {rows && rows.length === 0 && <p style={{ color: 'var(--stone)' }}>Nobody is overdue.</p>}
      {rows && rows.length > 0 && (
        <p style={{ color: 'var(--charcoal)', fontSize: 'var(--text-sm)', marginBottom: '0.7rem' }}>
          {rows.length} booking{rows.length === 1 ? '' : 's'}, {rows.reduce((s, r) => s + r.pieces, 0)} pieces waiting.
        </p>
      )}
      {(rows || []).map((r) => {
        const colour = r.days_overdue > 28 ? '#b03a2e' : r.days_overdue > 7 ? '#A8651A' : '#8a8178';
        return (
          <div key={r.booking_code} style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.7rem 0.85rem', marginBottom: '0.45rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline' }}>
              <button
                onClick={() => router.push(`/daily-cards?date=${r.painted.slice(0, 10)}&code=${encodeURIComponent(r.booking_code)}&open=1`)}
                style={{ background: 'none', border: 'none', padding: 0, fontWeight: 700, color: 'var(--charcoal)', fontSize: 'var(--text-md)', textAlign: 'left', cursor: 'pointer' }}
              >
                {r.customer_name}
              </button>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: colour, whiteSpace: 'nowrap' }}>{r.days_overdue} day{r.days_overdue === 1 ? '' : 's'} over</span>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: '#6b625a', marginTop: '0.15rem' }}>
              Due {new Date(`${r.due}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              {' · '}{r.pieces} piece{r.pieces === 1 ? '' : 's'}
              {r.packed ? ` · ${r.packed} packed` : r.on_shelf ? ` · ${r.on_shelf} on a shelf` : ''}
              {r.postal ? ' · posting' : ''}
            </p>
            {(r.phone || r.email) && (
              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                {r.phone && <a href={`tel:${r.phone}`} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--clay)', fontWeight: 600, fontSize: 'var(--text-sm)' }}><Phone size={13} /> {r.phone}</a>}
                {r.email && <a href={`mailto:${r.email}`} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--clay)', fontWeight: 600, fontSize: 'var(--text-sm)' }}><Mail size={13} /> Email</a>}
              </div>
            )}
          </div>
        );
      })}
    </PageShell>
  );
}
