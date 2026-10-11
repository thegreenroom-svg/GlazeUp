'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { PieceThumb } from '@/components/PieceBoxes';
import { Row, Chip } from '@/components/Row';
import { Section } from '@/components/Toolbar';
import { Loader, RotateCcw, Undo2 } from 'lucide-react';

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

  // [6 Oct] Coming in soon with pieces waiting: get them out before the
  // customer arrives, not only if someone opens the right card.
  const [due, setDue] = useState<any[] | null>(null);
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/returns/due?days=2`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => setDue(d.due || [])).catch(() => setDue([]));
  }, []);

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
    // [11 Oct] Arrived at from Collect and from the daily cards, so Back
    // goes to Collect rather than making you pick out of the menu again.
    <PageShell title="Returns shelf" subtitle="Unfinished pieces, waiting for their painter" back="/collect">
      {rows === null && (
        <p style={{ color: B.stone, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Loader size={15} className="animate-spin" /> Loading
        </p>
      )}

      {/* [11 Oct] This was a tinted panel with its own bold heading inside
          it. The heading is a section heading now, with the count in it, and
          the tint has gone -- it stays at the top because it is the most
          urgent thing on the page, not because it was shouting. The strip of
          thumbnails stays: it is what you carry to the shelf. */}
      {!!due?.length && (
        <>
          <Section tone="warn" n={due.length}>Get these out, coming in soon</Section>
          {due.map((d) => (
            <div key={d.booking_code} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', background: 'white', border: '1px solid #e8c48a', borderRadius: 'var(--radius-md)', padding: '0.5rem 0.6rem', marginBottom: '0.45rem' }}>
              <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                {d.pieces.slice(0, 4).map((p: any) => (
                  <PieceThumb key={p.id} url={p.photo} box={p.box} size={40} ring="#A8651A" />
                ))}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 700, color: B.text }}>{d.customer_name}</p>
                <p style={{ fontSize: 'var(--text-sm)', color: '#7a6a58' }}>
                  {new Date(d.session_start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
                  {new Date(d.session_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  {' · '}{d.pieces.length} piece{d.pieces.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          ))}
        </>
      )}

      {rows !== null && rows.length === 0 && (
        <EmptyState
          icon={<RotateCcw size={22} />}
          title="Nothing on the returns shelf"
          hint="Pieces marked as returning on the table photo show up here until the customer comes back to finish them."
        />
      )}

      {/* [11 Oct] "4 waiting" on its own line above the list, and a
          hand-rolled card with four stacked lines of text in it. The count
          is in the heading now and each piece is the shared row: thumbnail,
          who it belongs to, what it is, and the rest as small chips. The
          Undo button is passed through as the row's action exactly as it
          was, so it keeps its own disabled state while a tap is in flight. */}
      {open.length > 0 && (
        <>
          <Section n={open.length}>Waiting</Section>
          {open.map((r) => (
            <Row
              key={r.id}
              photo={r.reference_photo_url}
              box={r.photo_box}
              title={r.customer_name || r.booking_id || 'Unknown booking'}
              detail={`${r.piece_type || 'Piece'}${r.description ? ` — ${r.description}` : ''}`}
              chips={
                <>
                  {/* The reason is the whole point of the shelf. Without it a
                      returned piece is just a piece in the wrong place. */}
                  <Chip tone="post">{r.return_reason || 'Coming back to finish'}</Chip>
                  <Chip>
                    since {when(r.returned_at)}
                    {r.returned_by ? ` by ${r.returned_by}` : ''}
                  </Chip>
                  {r.collection_date && (
                    <Chip>was due {new Date(r.collection_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Chip>
                  )}
                </>
              }
              action={
                <button
                  onClick={() => undo(r.id)}
                  disabled={busy === r.id}
                  title="Put it back on its collection date"
                  style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.3rem',
                    minHeight: 36, padding: '0 0.6rem', borderRadius: 999, fontSize: 'var(--text-xs)',
                    fontWeight: 700, border: `1px solid ${B.stone}`, backgroundColor: 'transparent',
                    color: B.stone, opacity: busy === r.id ? 0.5 : 1,
                  }}
                >
                  <Undo2 size={13} /> Undo
                </button>
              }
            />
          ))}
        </>
      )}

      {done.length > 0 && (
        <>
          <Section n={done.length}>Settled</Section>
          {done.map((r) => (
            // Green tint says settled, so the tick that used to sit in front
            // of every one of these is doing nothing the row does not say.
            <Row
              key={r.id}
              tone="done"
              title={`${r.customer_name || r.booking_id} — ${r.piece_type || 'piece'}`}
              detail={`${r.return_reason || 'Coming back to finish'} · ${when(r.returned_at)}`}
            />
          ))}
        </>
      )}
    </PageShell>
  );
}
