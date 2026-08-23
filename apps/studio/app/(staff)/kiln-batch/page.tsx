'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import QRCode from 'qrcode';
import { Flame, Check, Printer } from 'lucide-react';

// Daisy: "Out of kiln actions... maybe we have a master QR for the collection
// date."
//
// The right unit, and not the obvious one. Pottery is fired and shelved as a
// BATCH sharing a collection date, so the natural action is "this whole
// trolley is out" -- not forty individual taps, which is the kind of job that
// quietly stops being done on a busy Saturday.
//
// Two modes on one page:
//   no ?date  -> every batch, each with a printable QR to tape to its shelf
//   ?date=X   -> where that QR lands: what's in the batch, and one button

interface Batch {
  date: string;
  pieces: number;
  out: number;
  on_hold: number;
  bookings: number;
  all_out: boolean;
  days_until: number;
}

interface BatchDetail {
  date: string;
  bookings: { booking_code: string; customer_name: string; pieces: number }[];
  piece_count: number;
  already_out: number;
  on_hold: number;
  moved_to?: string;
  moved_bookings?: number;
}

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export default function KilnBatchesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const date = searchParams.get('date');

  const [batches, setBatches] = useState<Batch[]>([]);
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  // Kiln operator controls. A kiln breaking is the ordinary case, not the
  // exception -- and when it does, every booking on that shelf moves
  // together. But sometimes only ONE piece slips (a crack, a refire), and
  // that booking alone needs a different date. Both, from the same screen.
  const [moveTo, setMoveTo] = useState('');
  const [moving, setMoving] = useState(false);
  const [moveNote, setMoveNote] = useState<string | null>(null);
  const [movingOne, setMovingOne] = useState<string | null>(null);
  const [detailQr, setDetailQr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (date) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/batch/${date}`);
        if (!res.ok) throw new Error(`Could not load that batch (${res.status})`);
        setDetail(await res.json());
      } else {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/batches`);
        if (!res.ok) throw new Error(`Could not load the batches (${res.status})`);
        const d = await res.json();
        setBatches(d.batches || []);
        // One QR per batch, generated locally -- no round trip, and it keeps
        // working if the network drops halfway through a print run.
        const map: Record<string, string> = {};
        for (const b of d.batches || []) {
          map[b.date] = await QRCode.toDataURL(`${window.location.origin}/kiln-batch?date=${b.date}`, { width: 220, margin: 1 });
        }
        setQrs(map);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!date) { setDetailQr(null); return; }
    QRCode.toDataURL(`${window.location.origin}/kiln-batch?date=${date}`, { width: 260, margin: 1 })
      .then(setDetailQr).catch(() => setDetailQr(null));
  }, [date]);

  const moveBatch = async () => {
    if (!date || !moveTo) return;
    setMoving(true); setMoveNote(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/batch/${date}/move`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_date: moveTo }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not move the batch');
      // Straight to the new batch, because the next thing anyone does after
      // moving a shelf is print its new sticker.
      router.push(`/kiln-batch?date=${moveTo}`);
    } catch (e) {
      setMoveNote(e instanceof Error ? e.message : 'Could not move the batch');
      setMoving(false);
    }
  };

  const moveOne = async (code: string) => {
    if (!moveTo) { setMoveNote('Pick the new date first.'); return; }
    setMovingOne(code); setMoveNote(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${code}/collection-date`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection_date: moveTo }),
      });
      if (!res.ok) throw new Error('Could not move that booking');
      setMoveNote(`That booking alone moved to ${fmtDate(moveTo)}. The rest of the batch is unchanged.`);
      await load();
    } catch (e) {
      setMoveNote(e instanceof Error ? e.message : 'Could not move that booking');
    } finally { setMovingOne(null); }
  };

  const markOut = async () => {
    if (!date) return;
    setMarking(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/batch/${date}/out`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not mark the batch out');
      setDone(d.moved);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark the batch out');
    } finally {
      setMarking(false);
    }
  };

  // ---------- Where the QR lands ----------
  if (date) {
    const remaining = detail ? detail.piece_count - detail.already_out : 0;
    return (
      <PageShell title="Out of the kiln" subtitle={fmtDate(date)}>
        {loading && <p style={{ fontSize: '0.85rem', color: '#888' }}>Loading the batch...</p>}
        {error && <p style={{ fontSize: '0.85rem', color: '#c0392b' }}>{error}</p>}

        {/* A card taped to a trolley outlives the date printed on it. If
            this batch has moved, the scan says where it went instead of
            reporting an empty shelf, which would read as the app losing a
            trolley of pottery. */}
        {detail?.moved_to && (
          <div style={{ padding: '0.9rem', borderRadius: 10, backgroundColor: '#FFF6E8', border: '1px solid #F0C987', marginBottom: '0.9rem' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#7A5B00' }}>This batch moved to {fmtDate(detail.moved_to)}</p>
            <p style={{ fontSize: '0.78rem', color: '#7A5B00', marginTop: '0.2rem' }}>
              {detail.moved_bookings} booking{detail.moved_bookings === 1 ? '' : 's'} went with it. The sticker on this shelf is out of date.
            </p>
            <button onClick={() => router.push(`/kiln-batch?date=${detail.moved_to}`)} style={{ marginTop: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: 8, border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
              Open the new batch and reprint
            </button>
          </div>
        )}

        {detail && !detail.moved_to && (
          <>
            {done !== null && (
              <div style={{ padding: '0.8rem', borderRadius: 8, backgroundColor: '#F1F8F1', border: '1px solid #9CC79C', marginBottom: '0.9rem' }}>
                <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#2E7D32' }}>
                  {done} piece{done === 1 ? '' : 's'} marked out of the kiln
                </p>
                <button onClick={() => router.push('/packing')} style={{ marginTop: '0.4rem', background: 'none', border: 'none', padding: 0, color: 'var(--clay)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                  Go and pack them →
                </button>
              </div>
            )}

            <p style={{ fontSize: '0.95rem', fontWeight: 700 }}>
              {detail.piece_count} piece{detail.piece_count === 1 ? '' : 's'} · {detail.bookings.length} booking{detail.bookings.length === 1 ? '' : 's'}
            </p>
            <p style={{ fontSize: '0.78rem', color: '#777', marginTop: '0.2rem' }}>
              {detail.already_out} already out
              {detail.on_hold > 0 && ` · ${detail.on_hold} on hold, not in this firing`}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', margin: '0.9rem 0' }}>
              {detail.bookings.map((b) => (
                <div key={b.booking_code} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.65rem', border: '1px solid #eee', borderRadius: 7, background: 'white' }}>
                  <button onClick={() => router.push(`/bookings?code=${b.booking_code}`)} style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                    <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600 }}>{b.customer_name}</span>
                    <span style={{ fontSize: '0.75rem', color: '#777' }}>{b.pieces} piece{b.pieces === 1 ? '' : 's'}</span>
                  </button>
                  {/* Just this one. A single cracked piece needing a refire
                      shouldn't drag the whole shelf's promise with it. */}
                  <button
                    onClick={() => moveOne(b.booking_code)}
                    disabled={movingOne === b.booking_code}
                    style={{ flexShrink: 0, padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid #ddd', background: 'white', color: 'var(--clay)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    {movingOne === b.booking_code ? '...' : 'Move just this'}
                  </button>
                </div>
              ))}
            </div>

            {/* Confirmed, not instant. A QR taped to a shelf gets scanned by
                accident, and this moves every piece in the batch -- so it
                shows what it's about to touch and waits to be told. */}
            {remaining > 0 ? (
              <button
                onClick={markOut}
                disabled={marking}
                style={{ width: '100%', padding: '0.9rem', borderRadius: 10, border: 'none', backgroundColor: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', opacity: marking ? 0.6 : 1 }}
              >
                {marking ? 'Marking...' : `Mark all ${remaining} out of the kiln`}
              </button>
            ) : (
              <p style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', fontWeight: 600, color: '#2E7D32' }}>
                <Check size={17} /> This whole batch is already out
              </p>
            )}

            {/* Move the shelf. Every booking promised this date moves
                together, because they are one physical shelf -- packing,
                collections and the day view all read the same field, so
                one write moves all of them and there is no second place to
                remember. The studio's default for NEW bookings is
                deliberately left alone: a kiln breaking today says nothing
                about what a session three weeks out should be promised. */}
            <div className="no-print" style={{ marginTop: '1.1rem', paddingTop: '0.9rem', borderTop: '1px solid #eee' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.15rem' }}>Kiln delayed?</p>
              <p style={{ fontSize: '0.74rem', color: '#777', marginBottom: '0.5rem' }}>
                Moves every booking on this shelf. New bookings keep the studio&apos;s usual date.
              </p>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="date"
                  value={moveTo}
                  onChange={(e) => setMoveTo(e.target.value)}
                  style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid #ddd', fontSize: '0.82rem' }}
                />
                <button
                  onClick={moveBatch}
                  disabled={!moveTo || moving}
                  style={{ padding: '0.5rem 0.8rem', borderRadius: 8, border: 'none', background: moveTo ? 'var(--clay)' : '#eee', color: moveTo ? 'white' : '#aaa', fontWeight: 700, fontSize: '0.8rem', cursor: moveTo ? 'pointer' : 'not-allowed' }}
                >
                  {moving ? 'Moving...' : `Move all ${detail.bookings.length}`}
                </button>
              </div>
              {moveNote && <p style={{ fontSize: '0.76rem', color: 'var(--clay)', marginTop: '0.45rem' }}>{moveNote}</p>}
            </div>

            {/* The sticker for this shelf, reprintable on the spot -- which
                is the whole point after a date change. */}
            {detailQr && (
              <div style={{ marginTop: '1.1rem', paddingTop: '0.9rem', borderTop: '1px solid #eee', textAlign: 'center', breakInside: 'avoid' }}>
                <p style={{ fontSize: '1rem', fontWeight: 700 }}>{fmtDate(date)}</p>
                <p style={{ fontSize: '0.75rem', color: '#777', marginBottom: '0.4rem' }}>
                  {detail.piece_count} piece{detail.piece_count === 1 ? '' : 's'} · {detail.bookings.length} booking{detail.bookings.length === 1 ? '' : 's'}
                </p>
                <img src={detailQr} alt="" style={{ width: 160, height: 160, margin: '0 auto', display: 'block' }} />
                <button onClick={() => window.print()} className="no-print" style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.8rem', borderRadius: 8, border: '1px solid #ddd', background: 'white', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                  <Printer size={14} /> Print this sticker
                </button>
              </div>
            )}
          </>
        )}
      </PageShell>
    );
  }

  // ---------- The batches, with their printable QRs ----------
  return (
    <PageShell title="Kiln batches" subtitle="One QR per collection date">
      <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.9rem' }}>
        Print a batch card and tape it to that shelf or trolley. Whoever unloads the kiln scans it and the whole batch is marked out.
      </p>
      <button onClick={() => window.print()} className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.8rem', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, marginBottom: '1rem' }}>
        <Printer size={15} /> Print all cards
      </button>

      {loading && <p style={{ fontSize: '0.85rem', color: '#888' }}>Loading...</p>}
      {error && <p style={{ fontSize: '0.85rem', color: '#c0392b' }}>{error}</p>}
      {!loading && !error && batches.length === 0 && (
        <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px dashed #ddd', borderRadius: 10 }}>
          <Flame size={24} style={{ color: '#ccc' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '0.5rem' }}>No batches yet</p>
          <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' }}>A batch appears once a booking has pieces and a collection date.</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
        {batches.map((b) => (
          <div key={b.date} style={{ border: `1px solid ${b.all_out ? '#CDE3CD' : '#eee'}`, borderRadius: 10, padding: '0.8rem', textAlign: 'center', backgroundColor: b.all_out ? '#F4F8F4' : 'white', breakInside: 'avoid' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: 700 }}>{fmtDate(b.date)}</p>
            <p style={{ fontSize: '0.75rem', color: '#777', marginBottom: '0.5rem' }}>
              {b.pieces} piece{b.pieces === 1 ? '' : 's'} · {b.bookings} booking{b.bookings === 1 ? '' : 's'}
              {b.on_hold > 0 ? ` · ${b.on_hold} on hold` : ''}
            </p>
            {qrs[b.date] && <img src={qrs[b.date]} alt="" style={{ width: 150, height: 150, margin: '0 auto', display: 'block' }} />}
            <p style={{ fontSize: '0.72rem', fontWeight: 700, marginTop: '0.4rem', color: b.all_out ? '#2E7D32' : 'var(--clay)' }}>
              {b.all_out ? 'All out of the kiln' : `${b.out}/${b.pieces} out`}
            </p>
            <button
              onClick={() => router.push(`/kiln-batch?date=${b.date}`)}
              className="no-print"
              style={{ marginTop: '0.4rem', background: 'none', border: 'none', padding: 0, color: 'var(--clay)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
            >
              Open without scanning →
            </button>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
