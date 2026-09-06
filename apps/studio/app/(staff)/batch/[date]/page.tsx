'use client';

// [6 Sep] THE SHELF STICKER LANDS HERE.
//
// Daisy: "everything from those dates after the last collection date up
// to when they're fired go into a shelf, and that shelf has a sticker
// with a QR code on it which contains all the bookings pieces... we
// need to make sure that everything is fine for the collection date."
//
// The batch is the collection date -- no new concept needed, every
// booking sharing one is one batch, and the sticker just encodes a
// date. Scanning it at the shelf answers the only question worth
// asking there: is anything missing.
//
// So it reports BY EXCEPTION. Bookings with a problem sort to the top;
// the complete ones collapse to a count. On collection morning nobody
// needs a list of what is fine.

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { PieceThumb, PIECE_COLOURS } from '@/components/PieceBoxes';
import { AlertTriangle, Check, Package } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Piece {
  id: string;
  piece_type: string | null;
  description: string | null;
  parts: number;
  parts_seen: number;
  damaged: boolean | null;
  packed: boolean;
  box: string | null;
  state: string;
  reference_photo_url: string | null;
  photo_box: { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number } | null;
}
interface Booking {
  booking_code: string;
  customer_name: string;
  collection_notes: string | null;
  pieces: Piece[];
  ready: boolean;
}
interface Stage {
  shelved_at: string | null;
  into_kiln_at: string | null;
  out_of_kiln_at: string | null;
  moved_by: string | null;
}
interface Batch {
  date: string;
  stage: Stage | null;
  bookings: Booking[];
  totals: { bookings: number; pieces: number; packed: number; missing: number; part_missing: number };
}

export default function BatchPage() {
  const params = useParams();
  const router = useRouter();
  const date = String(params?.date || '');
  const [batch, setBatch] = useState<Batch | null>(null);
  const [showReady, setShowReady] = useState(false);
  const [moving, setMoving] = useState(false);

  // [6 Sep] Daisy: "scan shelf stickers before glazing and firing and
  // let the app know off shelves and in kiln."
  //
  // One scan moves everything on this date at once. Whoever is doing it
  // has both hands full of greenware, so there is nothing to select and
  // nothing to count -- the batch is the unit, which is the whole
  // reason it is what the sticker carries.
  const move = async (stage: 'shelved' | 'kiln' | 'out', undo = false) => {
    setMoving(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/batch/${date}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, undo }),
      });
      const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/batch/${date}`);
      if (r.ok) setBatch(await r.json());
    } finally {
      setMoving(false);
    }
  };

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/batch/${date}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setBatch(d))
      .catch(() => {});
  }, [date]);

  const pretty = date ? new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '';

  if (!batch) return <PageShell title="Collection" subtitle={pretty}><p style={{ color: '#777' }}>Loading…</p></PageShell>;

  const t = batch.totals;
  const problems = batch.bookings.filter((b) => !b.ready);
  const ready = batch.bookings.filter((b) => b.ready);

  return (
    <PageShell title={`Collecting ${pretty}`} subtitle={`${t.bookings} bookings · ${t.pieces} pieces`}>
      {/* The headline is the exception count, not the total. A batch
          with nothing missing should say so in one line and stop. */}
      <div style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.9rem', marginBottom: '1rem' }}>
        {t.missing === 0 && t.part_missing === 0 ? (
          <p style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 700, color: '#2E7D32', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Check size={18} /> Everything for this date is accounted for
          </p>
        ) : (
          <>
            {t.part_missing > 0 && (
              <p style={{ margin: '0 0 0.3rem', fontSize: 'var(--text-base)', fontWeight: 700, color: '#C0392B', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 2 }} />
                {t.part_missing} piece{t.part_missing === 1 ? ' is' : 's are'} missing a part
              </p>
            )}
            {t.missing > 0 && (
              <p style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 700, color: '#A6761D' }}>
                {t.missing} piece{t.missing === 1 ? ' has' : 's have'} not been found on any shelf
              </p>
            )}
          </>
        )}
        {t.packed > 0 && (
          <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--text-sm)', color: '#777', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Package size={14} /> {t.packed} already packed
          </p>
        )}
      </div>

      {/* Where this batch is in the week. Only the next step is
          offered as an action -- an unfired batch cannot come out of a
          kiln it has not gone into, and offering that is how a wrong
          tap happens. Each done step can be undone, because scanning
          the wrong shelf's sticker is the commonest mistake and should
          cost one tap to put right. */}
      {(() => {
        const st = batch.stage;
        const steps: { key: 'shelved' | 'kiln' | 'out'; done: string | null; label: string; doneLabel: string }[] = [
          { key: 'shelved', done: st?.shelved_at ?? null, label: 'All on the shelves', doneLabel: 'On the shelves' },
          { key: 'kiln', done: st?.into_kiln_at ?? null, label: 'Off the shelves, into the kiln', doneLabel: 'In the kiln' },
          { key: 'out', done: st?.out_of_kiln_at ?? null, label: 'Out of the kiln', doneLabel: 'Out of the kiln' },
        ];
        const next = steps.find((x) => !x.done);
        return (
          <div style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.9rem', marginBottom: '1rem' }}>
            {steps.filter((x) => x.done).map((x) => (
              <p key={x.key} style={{ margin: '0 0 0.3rem', fontSize: 'var(--text-sm)', color: '#2E7D32', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Check size={15} /> {x.doneLabel}
                  <span style={{ fontWeight: 400, color: '#777' }}>
                    {new Date(x.done as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </span>
                <button onClick={() => move(x.key, true)} disabled={moving}
                  style={{ border: 'none', background: 'none', color: '#A6761D', fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer', padding: '0.2rem 0.3rem' }}>
                  undo
                </button>
              </p>
            ))}
            {next && (
              <button
                onClick={() => move(next.key)}
                disabled={moving}
                style={{ width: '100%', minHeight: 52, marginTop: steps.some((x) => x.done) ? '0.4rem' : 0, borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer' }}
              >
                {moving ? 'Saving…' : next.label}
              </button>
            )}
          </div>
        );
      })()}

      {problems.map((b) => (
        <div key={b.booking_code} style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.7rem', marginBottom: '0.6rem' }}>
          <button
            onClick={() => router.push(`/packing?code=${encodeURIComponent(b.booking_code)}`)}
            style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--charcoal)' }}
          >
            {b.customer_name}
          </button>
          {b.collection_notes && (
            <p style={{ fontSize: 'var(--text-xs)', color: '#C0392B', fontWeight: 600, margin: '0.2rem 0 0' }}>{b.collection_notes}</p>
          )}
          {b.pieces.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '0.45rem' }}>
              <PieceThumb url={p.reference_photo_url} box={p.photo_box} size={40} ring={PIECE_COLOURS[i % 6]} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--charcoal)', margin: 0 }}>
                  {p.description || p.piece_type}
                </p>
                <p style={{
                  fontSize: 'var(--text-xs)', fontWeight: 700, margin: '0.1rem 0 0',
                  color: p.state === 'part missing' ? '#C0392B' : p.state === 'not found yet' ? '#A6761D' : p.packed ? '#2E7D32' : '#777',
                }}>
                  {/* The specific failure Daisy described: the base goes
                      home, the lid stays on a kiln shelf, and nobody
                      finds out until the customer opens the box. */}
                  {p.state === 'part missing'
                    ? `${p.parts_seen} of ${p.parts} parts found — the rest is still somewhere`
                    : p.state}
                  {p.box ? ` · box ${p.box}` : ''}
                  {p.damaged ? ' · damaged' : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      ))}

      {ready.length > 0 && (
        <button
          onClick={() => setShowReady((v) => !v)}
          style={{ width: '100%', minHeight: 44, marginTop: '0.4rem', borderRadius: 'var(--radius-md)', border: '1px solid #ece5db', background: 'white', color: 'var(--clay)', fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer' }}
        >
          {showReady ? 'Hide' : `${ready.length} booking${ready.length === 1 ? '' : 's'} complete — show`}
        </button>
      )}

      {showReady && ready.map((b) => (
        <button
          key={b.booking_code}
          onClick={() => router.push(`/packing?code=${encodeURIComponent(b.booking_code)}`)}
          style={{ display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left', background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-sm)', padding: '0.55rem 0.7rem', marginTop: '0.4rem', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>{b.customer_name}</span>
          <span style={{ fontSize: 'var(--text-xs)', color: '#2E7D32', fontWeight: 700 }}>{b.pieces.length} ready</span>
        </button>
      ))}
    </PageShell>
  );
}
