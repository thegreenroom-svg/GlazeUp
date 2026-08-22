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

        {detail && (
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
                <button
                  key={b.booking_code}
                  onClick={() => router.push(`/bookings?code=${b.booking_code}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.65rem', border: '1px solid #eee', borderRadius: 7, background: 'white', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{b.customer_name}</span>
                  <span style={{ fontSize: '0.75rem', color: '#777' }}>{b.pieces} piece{b.pieces === 1 ? '' : 's'}</span>
                </button>
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
