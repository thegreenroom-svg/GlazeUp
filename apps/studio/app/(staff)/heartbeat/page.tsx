'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { PageShell } from '@/components/PageShell';
import { Loader, Check, AlertTriangle, CircleDashed } from 'lucide-react';

// Three jobs have stopped quietly so far: takings for 43 days, pieces for
// 27, the catalogue refresh this morning. Every one was found weeks late,
// by noticing a number that looked wrong.
//
// A job that fails loudly is a nuisance. A job that stops quietly is a
// liability, because everything downstream carries on working and carries
// on being wrong. This screen exists so that stops being possible.

const B = { text: 'var(--charcoal)', stone: 'var(--stone)', sand: 'var(--sand)' };

const PLAIN: Record<string, string> = {
  'revenue-sync': 'Takings from Square',
  'bookings-sync': 'Bookings from Square',
  'catalogue-refresh': 'The bisque catalogue',
  'shape-recognition': 'Working out shapes',
  'backfill-ingest': 'Photos from the iPad',
  'ticket-match': 'Matching tickets to bookings',
};

const ago = (m: number | null) => {
  if (m === null) return 'never';
  if (m < 2) return 'just now';
  if (m < 90) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hours ago`;
  return `${Math.round(h / 24)} days ago`;
};

interface Job {
  job: string; mins_ago: number | null; stale_after_mins: number;
  state: 'ok' | 'stale' | 'never'; last_error: string | null;
}

export default function HeartbeatPage() {
  const [d, setD] = useState<{ jobs: Job[]; stale: number; never: number } | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/heartbeat`, { cache: 'no-store' })
      .then((r) => r.json()).then(setD).catch(() => setD({ jobs: [], stale: 0, never: 0 }));
  }, []);

  if (!d) return (
    <PageShell title="Is everything running?" subtitle="The jobs that keep the numbers honest">
      <p style={{ color: B.stone, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Loader size={15} className="animate-spin" /> Checking
      </p>
    </PageShell>
  );

  return (
    <PageShell title="Is everything running?" subtitle="The jobs that keep the numbers honest">
      <p style={{ color: B.text, fontSize: 'var(--text-sm)', lineHeight: 1.55, marginBottom: '0.9rem' }}>
        {d.stale === 0 && d.never === 0
          ? 'Everything has run recently.'
          : `${d.stale} stopped, ${d.never} never run.`}
      </p>

      {d.jobs.map((j) => {
        const bad = j.state !== 'ok';
        const colour = j.state === 'ok' ? '#3D7A4A' : j.state === 'stale' ? '#B0203C' : '#9B8C85';
        return (
          <div key={j.job} style={{
            display: 'flex', gap: '0.6rem', alignItems: 'flex-start', backgroundColor: '#fff',
            border: `1px solid ${bad ? colour + '55' : B.sand}`, borderRadius: 'var(--radius-md)',
            padding: '0.7rem 0.85rem', marginBottom: '0.45rem',
          }}>
            {j.state === 'ok' ? <Check size={16} color={colour} style={{ flexShrink: 0, marginTop: 2 }} />
              : j.state === 'stale' ? <AlertTriangle size={16} color={colour} style={{ flexShrink: 0, marginTop: 2 }} />
              : <CircleDashed size={16} color={colour} style={{ flexShrink: 0, marginTop: 2 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: B.text, fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                {PLAIN[j.job] || j.job}
              </p>
              <p style={{ color: bad ? colour : B.stone, fontSize: 'var(--text-xs)', marginTop: '0.12rem' }}>
                {j.state === 'never'
                  ? 'has not run yet'
                  : `last worked ${ago(j.mins_ago)}`}
                {j.state === 'stale' ? ` · expected every ${Math.round(j.stale_after_mins / 60) || 1}h` : ''}
              </p>
              {j.last_error && (
                <p style={{ color: B.stone, fontSize: 'var(--text-xs)', marginTop: '0.25rem', lineHeight: 1.4 }}>
                  {j.last_error}
                </p>
              )}
            </div>
          </div>
        );
      })}

      <p style={{ color: B.stone, fontSize: 'var(--text-xs)', marginTop: '1rem', lineHeight: 1.5 }}>
        Never run usually means a job is not wired up yet, which is a different
        problem from one that has stopped. Render also sleeps an idle service,
        so a quiet night can show as a gap without anything being broken.
      </p>
    </PageShell>
  );
}
