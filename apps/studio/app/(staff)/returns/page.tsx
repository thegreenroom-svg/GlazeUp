'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { PieceThumb } from '@/components/PieceBoxes';
import { Loader, RotateCcw, Undo2, Check } from 'lucide-react';

// Daisy: a piece can be marked as returning on the table photo, which takes
// it off that collection date and puts it on the returns shelf.
//
// This is the other half of that. Without somewhere to read them back out, a
// return is recorded and then invisible -- which is worse than not recording
// it, because staff believe it has been dealt with.
//
// Deliberately one flat list, newest first, rather than grouped by booking.
// A returns shelf is a physical shelf you walk to; what you need standing in
// front of it is "what is on here and why", not a tidy hierarchy.

const B = {
  page: 'var(--ivory)',
  text: 'var(--charcoal)',
  stone: 'var(--stone)',
  clay: 'var(--clay)',
  sand: 'var(--sand)',
};

interface ReturnRow {
  id: string;
  booking_id: string | null;
  customer_name: string | null;
  collection_date: string | null;
  piece_type: string | null;
  description: string | null;
  reference_photo_url: string | null;
  photo_box: { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number } | null;
  returned_at: string;
  return_reason: string | null;
  returned_by: string | null;
  settled: boolean;
}

function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function ReturnsPage() {
  const [rows, setRows] = useState<ReturnRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/returns`, { cache: 'no-store' });
      const d = await r.json();
      setRows(d.returns || []);
    } catch {
      setRows([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Marked by mistake on a busy floor. One tap to reverse, or people stop
  // trusting the button and mark nothing at all.
  const undo = async (id: string) => {
    setBusy(id);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/returns/${id}/undo`, { method: 'POST' });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const open = (rows || []).filter((r) => !r.settled);
  const done = (rows || []).filter((r) => r.settled);

  return (
    <PageShell title="Returns shelf" subtitle="Pieces sent back, and why">
      {rows === null && (
        <p style={{ color: B.stone, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Loader size={15} className="animate-spin" /> Loading
        </p>
      )}

      {rows !== null && rows.length === 0 && (
        <EmptyState
          icon={<RotateCcw size={22} />}
          title="Nothing on the returns shelf"
          hint="Pieces marked as returning on the table photo, or at packing, show up here with the reason they went back."
        />
      )}

      {open.length > 0 && (
        <>
          <p style={{ color: B.text, fontWeight: 700, marginBottom: '0.6rem' }}>
            {open.length} waiting
          </p>
          {open.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex', gap: '0.7rem', alignItems: 'flex-start',
                padding: '0.75rem 0.8rem', marginBottom: '0.5rem',
                borderRadius: 'var(--radius-md)', backgroundColor: '#fff',
                border: `1px solid ${B.sand}`,
              }}
            >
              <PieceThumb url={r.reference_photo_url} box={r.photo_box} size={52} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: B.text, fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                  {r.customer_name || r.booking_id || 'Unknown booking'}
                </p>
                <p style={{ color: B.stone, fontSize: 'var(--text-xs)' }}>
                  {r.piece_type || 'Piece'}{r.description ? ` — ${r.description}` : ''}
                </p>
                {/* The reason is the whole point of the shelf. Without it a
                    returned piece is just a piece in the wrong place. */}
                <p style={{
                  color: '#a8651a', fontSize: 'var(--text-xs)', fontWeight: 600,
                  marginTop: '0.25rem',
                }}>
                  {r.return_reason || 'No reason given'}
                </p>
                <p style={{ color: B.stone, fontSize: 'var(--text-xs)', marginTop: '0.15rem' }}>
                  Sent back {when(r.returned_at)}
                  {r.returned_by ? ` by ${r.returned_by}` : ''}
                  {r.collection_date ? ` · was due ${new Date(r.collection_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                </p>
              </div>
              <button
                onClick={() => undo(r.id)}
                disabled={busy === r.id}
                title="Put it back on its collection date"
                style={{
                  flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.35rem 0.6rem', borderRadius: 999, fontSize: 'var(--text-xs)',
                  fontWeight: 700, border: `1px solid ${B.stone}`, backgroundColor: 'transparent',
                  color: B.stone, opacity: busy === r.id ? 0.5 : 1,
                }}
              >
                <Undo2 size={13} /> Undo
              </button>
            </div>
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <p style={{ color: B.stone, fontWeight: 700, margin: '1.3rem 0 0.6rem' }}>
            {done.length} settled
          </p>
          {done.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex', gap: '0.6rem', alignItems: 'center',
                padding: '0.55rem 0.7rem', marginBottom: '0.35rem',
                borderRadius: 'var(--radius-md)', backgroundColor: B.sand + '30',
              }}
            >
              <Check size={15} color="#3d7a4a" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: B.text, fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                  {r.customer_name || r.booking_id} — {r.piece_type || 'piece'}
                </p>
                <p style={{ color: B.stone, fontSize: 'var(--text-xs)' }}>
                  {r.return_reason || 'No reason given'} · {when(r.returned_at)}
                </p>
              </div>
            </div>
          ))}
        </>
      )}
    </PageShell>
  );
}
