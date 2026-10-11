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
import { Row, Chip } from '@/components/Row';
import { Collapse, Tally, Tool, Toolbar } from '@/components/Toolbar';
import { Check } from 'lucide-react';

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
      .then((d) => {
        // [10 Oct] One label for the whole journey. Until the shelf is out of
        // the kiln, the kiln technician is the one scanning it, so it opens
        // that shelf on the Kiln page (shelf, dip, kiln, out). Out of the
        // kiln, it is collection's: this page.
        if (d && !d.stage?.out_of_kiln_at) { router.replace(`/kiln?date=${date}`); return; }
        if (d) setBatch(d);
      })
      .catch(() => {});
  }, [date, router]);

  const pretty = date ? new Date(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : '';

  if (!batch) return <PageShell title="Collection" subtitle={pretty}><p style={{ color: '#777' }}>Loading…</p></PageShell>;

  const t = batch.totals;
  const problems = batch.bookings.filter((b) => !b.ready);
  const ready = batch.bookings.filter((b) => b.ready);

  return (
    // [11 Oct] Arrived at by scanning a shelf sticker, and out of the kiln
    // it is collection's page, so Back goes to Collect rather than leaving
    // the hamburger as the only way off it.
    <PageShell title={`Collecting ${pretty}`} subtitle={`${t.bookings} bookings · ${t.pieces} pieces`} back="/collect">
      {/* The headline is the exception count, not the total. A batch
          with nothing missing should say so in one line and stop. */}
      {/* [11 Oct] It was a white panel holding up to three bold lines with
          their own icons, and then the stage panel under it, so the first
          booking with something wrong with it started two panels down. The
          counts are one line of words now and the clear case is one line of
          green. Nothing is said twice. */}
      {t.missing === 0 && t.part_missing === 0 && (
        <p style={{ margin: '0 0 0.6rem', fontSize: 'var(--text-base)', fontWeight: 700, color: '#2E7D32', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Check size={18} /> Everything for this date is accounted for
        </p>
      )}
      <Tally
        items={[
          { label: 'missing a part', n: t.part_missing, tone: 'late' },
          { label: 'not found on any shelf', n: t.missing, tone: 'warn' },
          { label: 'already packed', n: t.packed, tone: 'quiet' },
        ]}
      />

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
        const done = steps.filter((x) => x.done);
        return (
          <>
            {/* [11 Oct] You only reach this page once the shelf is out of
                the kiln, so these lines are always a finished history by
                the time anyone reads them -- three green ticks and three
                dates above the thing you actually scanned the sticker to
                find out. Folded, with every undo still a tap away. */}
            {done.length > 0 && (
              <Collapse summary="Shelf, kiln and out of the kiln" icon={<Check size={15} color="#2E7D32" />}>
                {done.map((x) => (
                  <p key={x.key} style={{ margin: '0 0 0.3rem', fontSize: 'var(--text-sm)', color: '#2E7D32', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Check size={15} /> {x.doneLabel}
                      <span style={{ fontWeight: 400, color: '#777' }}>
                        {new Date(x.done as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    </span>
                    <button onClick={() => move(x.key, true)} disabled={moving}
                      style={{ border: 'none', background: 'none', color: '#A6761D', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer', minHeight: 36, padding: '0 0.4rem' }}>
                      undo
                    </button>
                  </p>
                ))}
              </Collapse>
            )}
            {/* The next step stays out in the open: it is the one thing
                here that is an action rather than a record. */}
            {next && (
              <button
                onClick={() => move(next.key)}
                disabled={moving}
                style={{ width: '100%', minHeight: 52, marginBottom: '1rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer' }}
              >
                {moving ? 'Saving…' : next.label}
              </button>
            )}
          </>
        );
      })()}

      {/* [11 Oct] Each booking with a problem was a hand-rolled card whose
          name was its own small button. It is the shared row now, so the
          whole row is the target rather than the line of text, and the
          pieces sit inside it as they did. The collection note keeps its
          red because it is the one thing on here written by a person. */}
      {problems.map((b) => (
        <Row
          key={b.booking_code}
          title={b.customer_name}
          detail={b.collection_notes ? <span style={{ color: '#C0392B', fontWeight: 600 }}>{b.collection_notes}</span> : undefined}
          onClick={() => router.push(`/booking/${encodeURIComponent(b.booking_code)}`)}
        >
          {b.pieces.map((p, i) => (
            <span key={p.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginTop: '0.45rem' }}>
              <PieceThumb url={p.reference_photo_url} box={p.photo_box} size={40} ring={PIECE_COLOURS[i % 6]} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--charcoal)' }}>
                  {p.description || p.piece_type}
                </span>
                <span style={{
                  display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, marginTop: '0.1rem',
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
                </span>
              </span>
            </span>
          ))}
        </Row>
      ))}

      {/* [11 Oct] The "show the complete ones" toggle was a full width
          button. It is a chip, filled in while they are showing, and the
          complete bookings are shared rows tinted green. */}
      {ready.length > 0 && (
        <Toolbar style={{ marginTop: '0.6rem' }}>
          <Tool active={showReady} onClick={() => setShowReady((v) => !v)} tone="dark">
            {ready.length} booking{ready.length === 1 ? '' : 's'} complete
          </Tool>
        </Toolbar>
      )}

      {showReady && ready.map((b) => (
        <Row
          key={b.booking_code}
          tone="done"
          title={b.customer_name}
          chips={<Chip tone="good">{b.pieces.length} ready</Chip>}
          onClick={() => router.push(`/booking/${encodeURIComponent(b.booking_code)}`)}
        />
      ))}
    </PageShell>
  );
}
