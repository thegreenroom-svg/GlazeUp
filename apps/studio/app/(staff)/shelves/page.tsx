'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Loader, Layers } from 'lucide-react';

// Daisy: "check all the photographs of all the shelves that are on file
// and make a composite page, a scrollable set of shelves with all of the
// itemised numbers on there with descriptions... then you can see them
// all if they're all on different shelves straight away, instead of
// going through and losing that photo again in the next one."
//
// The problem this solves is losing your place. Opening one shelf photo
// closed the last one, so comparing shelves meant remembering what you
// had just seen. A continuous scroll holds them all at once.
//
// Every photo annotates itself from the sweep that produced it, so an
// older shelf still shows what was found on it -- pieces only remember
// their MOST RECENT position, which would have made older photos blank.

const PIECE_COLOURS = ['#C0392B', '#27853F', '#2E6FB7', '#B8791F', '#6C3FA8', '#0F8F86'];

interface MatchedDetail {
  piece_id: string;
  piece_type: string | null;
  description: string | null;
  box: { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number } | null;
  booking_code: string;
  customer_name: string;
}

interface Sweep {
  id: string;
  photo_url: string;
  created_at: string;
  succeeded: boolean;
  matches_found: number | null;
  candidates_checked: number | null;
  matched_details: MatchedDetail[] | null;
}

export default function ShelvesPage() {
  const router = useRouter();
  const [sweeps, setSweeps] = useState<Sweep[] | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/shelf/sweeps`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSweeps(d?.sweeps || []))
      .catch(() => setSweeps([]));
  }, []);

  return (
    <PageShell title="Shelves" subtitle="Every shelf photographed, most recent first">
      {sweeps === null && (
        <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-base)', color: 'var(--muted)' }}>
          <Loader size={16} className="animate-spin" /> Loading…
        </p>
      )}

      {sweeps?.length === 0 && (
        <EmptyState
          icon={<Layers size={24} />}
          title="No shelf photos yet"
          hint="Photograph a shelf from Packing and it'll appear here, with every piece it recognised marked on it."
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
        {sweeps?.map((sw) => {
          const details = (sw.matched_details || []).filter((d) => d.box);
          return (
            <div key={sw.id}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--charcoal)' }}>
                  {new Date(sw.created_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: sw.succeeded ? 'var(--muted)' : 'var(--warning)' }}>
                  {sw.succeeded ? `${sw.matches_found ?? 0} found` : 'check failed'}
                </span>
              </div>

              <div style={{ position: 'relative' }}>
                <img src={sw.photo_url} alt="" style={{ width: '100%', borderRadius: 'var(--radius-md)', display: 'block' }} />
                {details.map((d, i) => d.box && (
                  <div
                    key={d.piece_id}
                    style={{
                      position: 'absolute',
                      left: `${d.box.left_pct}%`,
                      top: `${d.box.top_pct}%`,
                      width: `${d.box.right_pct - d.box.left_pct}%`,
                      height: `${d.box.bottom_pct - d.box.top_pct}%`,
                      border: `3px solid ${PIECE_COLOURS[i % 6]}`,
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                      pointerEvents: 'none',
                    }}
                  >
                    <span style={{ position: 'absolute', top: -9, left: -9, width: 20, height: 20, borderRadius: 'var(--radius-full)', backgroundColor: PIECE_COLOURS[i % 6], color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px white' }}>
                      {i + 1}
                    </span>
                  </div>
                ))}
              </div>

              {/* The list under each photo is what makes this worth
                  scrolling -- a box alone tells you something is there,
                  the description tells you whose it is and what to
                  reach for. */}
              {details.length > 0 ? (
                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {details.map((d, i) => (
                    <button
                      key={d.piece_id}
                      onClick={() => router.push(`/packing?code=${encodeURIComponent(d.booking_code)}`)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', textAlign: 'left', border: 'none', background: 'none', padding: '0.2rem 0', cursor: 'pointer' }}
                    >
                      <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 'var(--radius-full)', backgroundColor: PIECE_COLOURS[i % 6], color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {i + 1}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--charcoal)' }}>{d.customer_name}</span>
                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}> · {d.description || d.piece_type || 'Piece'}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: '0.4rem' }}>
                  {sw.succeeded ? 'Nothing was recognised on this shelf.' : 'This check failed, so nothing is marked.'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}
