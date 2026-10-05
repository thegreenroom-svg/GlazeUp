'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Loader, Check, AlertTriangle, Info } from 'lucide-react';

// Daisy: "never more if they split bill."
//
// That single fact is what makes this worth building. Several tickets on
// one booking add up, and nobody ever pays for fewer pieces than they
// carried to the table -- so the till is a floor, not a target, and the
// comparison only fails in one direction.
//
// Short means a piece was hidden behind another one in the photo. Caught
// tonight it is a thirty second fix. Caught in three weeks it is a phone
// call and a shrug.

const B = { text: 'var(--charcoal)', stone: 'var(--stone)', sand: 'var(--sand)' };

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

interface Row {
  booking_code: string; customer_name: string; session_start: string;
  paid: number; photographed: number; tickets: number; gap: number;
}

export default function PieceCheckPage() {
  const [d, setD] = useState<{ short: Row[]; over: Row[]; ok: number; checked: number } | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/piece-check`, { cache: 'no-store' })
      .then((r) => r.json())
      .then(setD)
      .catch(() => setD({ short: [], over: [], ok: 0, checked: 0 }));
  }, []);

  if (!d) return (
    <PageShell title="Everything accounted for?" subtitle="What was paid for against what was photographed">
      <p style={{ color: B.stone, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Loader size={15} className="animate-spin" /> Checking
      </p>
    </PageShell>
  );

  const row = (r: Row, short: boolean) => (
    <div key={r.booking_code} style={{
      display: 'flex', gap: '0.6rem', alignItems: 'center', backgroundColor: '#fff',
      border: `1px solid ${short ? '#E0A23C' : B.sand}`, borderRadius: 'var(--radius-md)',
      padding: '0.7rem 0.85rem', marginBottom: '0.45rem',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ color: B.text, fontWeight: 700, fontSize: 'var(--text-sm)' }}>{r.customer_name}</p>
        <p style={{ color: B.stone, fontSize: 'var(--text-xs)', marginTop: '0.12rem' }}>
          {when(r.session_start)} · paid for {r.paid}, photographed {r.photographed}
          {/* One ticket and short is the case most likely to be a split bill
              rung through as a walk-in, rather than a genuinely missing pot. */}
          {short && r.tickets === 1 ? ' · one ticket' : ''}
          {r.tickets > 1 ? ` · ${r.tickets} tickets` : ''}
        </p>
      </div>
      <span style={{
        flexShrink: 0, fontWeight: 800, fontSize: 'var(--text-sm)',
        color: short ? '#B0203C' : '#8A7680',
      }}>{r.gap > 0 ? '+' : ''}{r.gap}</span>
    </div>
  );

  return (
    <PageShell title="Everything accounted for?" subtitle="What was paid for against what was photographed">

      {d.short.length === 0 && d.over.length === 0 && (
        <EmptyState
          icon={<Check size={22} />}
          title="Nothing missing"
          hint={`${d.ok} of ${d.checked} tables match what was rung through the till.`}
        />
      )}

      {d.short.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.7rem' }}>
            <AlertTriangle size={17} color="#E0A23C" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ color: B.text, fontSize: 'var(--text-sm)', lineHeight: 1.5 }}>
              <b>{d.short.length} tables came up short.</b> They paid for more pieces than
              the photo found, so something was probably hidden behind something else.
              Worth a look while the table is still fresh.
            </p>
          </div>
          {d.short.map((r) => row(r, true))}
        </>
      )}

      {d.over.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', margin: '1.2rem 0 0.6rem' }}>
            <Info size={16} color={B.stone} style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ color: B.stone, fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
              {d.over.length} found more than were paid for. Usually one piece counted twice,
              or somebody else&apos;s pot on the table. Not urgent.
            </p>
          </div>
          {d.over.map((r) => row(r, false))}
        </>
      )}

      {(d.short.length > 0 || d.over.length > 0) && (
        <p style={{ color: B.stone, fontSize: 'var(--text-xs)', marginTop: '1rem', lineHeight: 1.5 }}>
          {d.ok} of {d.checked} tables matched exactly. A split bill rung through as a
          walk-in rather than against the booking will show here as a shortfall even
          when nothing is missing, so check the ticket count before chasing one.
        </p>
      )}
    </PageShell>
  );
}
