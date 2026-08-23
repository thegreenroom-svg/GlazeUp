'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import QRCode from 'qrcode';
import { Flame, Check, Printer, Plus } from 'lucide-react';

// A batch is a SHELF, not a date. Per Daisy: the collection date is projected
// forward to the customer and doesn't belong in the app -- the second
// timestamp is the QR scan when the kiln comes out, the third is packing.
//
// Print a sticker and the shelf exists. Pieces join it when they come out of
// the kiln. Nothing to reschedule when a firing slips, because a shelf has no
// due date -- it just has pottery on it.

interface Shelf {
  id: string;
  label: string;
  created_at: string;
  out_of_kiln_at: string | null;
  pieces: number;
  packed: number;
  all_packed: boolean;
}

interface ShelfPiece {
  id: string;
  piece_type: string | null;
  description: string | null;
  status: string | null;
  fulfilment: string | null;
}

interface ShelfDetail {
  id: string;
  label: string;
  created_at: string;
  out_of_kiln_at: string | null;
  piece_count: number;
  bookings: { booking_code: string; customer_name: string; pieces: ShelfPiece[] }[];
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export default function KilnShelvesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = searchParams.get('id');

  const [shelves, setShelves] = useState<Shelf[]>([]);
  const [detail, setDetail] = useState<ShelfDetail | null>(null);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      if (id) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/shelves/${id}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || `Could not load that shelf (${res.status})`);
        setDetail(d);
        setQrs({ [d.id]: await QRCode.toDataURL(`${window.location.origin}/kiln-batch?id=${d.id}`, { width: 260, margin: 1 }) });
      } else {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/shelves`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || `Could not load the shelves (${res.status})`);
        setShelves(d.shelves || []);
        const map: Record<string, string> = {};
        for (const sh of d.shelves || []) {
          map[sh.id] = await QRCode.toDataURL(`${window.location.origin}/kiln-batch?id=${sh.id}`, { width: 220, margin: 1 });
        }
        setQrs(map);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const newShelf = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/shelves`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not create the shelf');
      router.push(`/kiln-batch?id=${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the shelf');
      setBusy(false);
    }
  };

  const markOut = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/shelves/${id}/out`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not mark the shelf out');
      setDone(d.moved);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark the shelf out');
    } finally { setBusy(false); }
  };

  // ---------- Where the QR lands ----------
  if (id) {
    const waiting = detail
      ? detail.bookings.flatMap((b) => b.pieces).filter((p) => !['ready', 'collected', 'complete'].includes(String(p.status || '').toLowerCase())).length
      : 0;
    return (
      <PageShell title="Kiln shelf" subtitle={detail?.label || ''}>
        <button onClick={() => router.push('/kiln-batch')} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--clay)', fontSize: '0.85rem', fontWeight: 600 }}>
          ← All shelves
        </button>

        {loading && <p style={{ fontSize: '0.85rem', color: '#888', marginTop: '0.75rem' }}>Loading...</p>}
        {error && <p style={{ fontSize: '0.85rem', color: '#c0392b', marginTop: '0.75rem' }}>{error}</p>}

        {detail && (
          <div style={{ marginTop: '0.75rem' }}>
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
              Shelf started {fmt(detail.created_at)}
              {detail.out_of_kiln_at ? ` · out of the kiln ${fmt(detail.out_of_kiln_at)}` : ''}
            </p>

            {detail.piece_count === 0 && (
              <div style={{ marginTop: '0.9rem', padding: '0.8rem', borderRadius: 8, backgroundColor: '#FBF7F1', border: '1px solid #E4D8C8' }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#7A5B00' }}>Nothing on this shelf yet</p>
                <p style={{ fontSize: '0.76rem', color: '#7A5B00', marginTop: '0.2rem' }}>
                  Print the sticker below and tape it on, then photograph the shelf from Packing to put pottery on it.
                </p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', margin: '0.9rem 0' }}>
              {detail.bookings.map((b) => (
                <button
                  key={b.booking_code}
                  onClick={() => router.push(`/packing?code=${b.booking_code}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.65rem', border: '1px solid #eee', borderRadius: 7, background: 'white', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: '0.84rem', fontWeight: 600 }}>{b.customer_name}</span>
                  <span style={{ fontSize: '0.75rem', color: '#777' }}>{b.pieces.length} piece{b.pieces.length === 1 ? '' : 's'}</span>
                </button>
              ))}
            </div>

            {/* Confirmed, never instant. A QR taped to a shelf gets scanned
                by accident, and this moves everything on it. */}
            {waiting > 0 ? (
              <button
                onClick={markOut}
                disabled={busy}
                style={{ width: '100%', padding: '0.9rem', borderRadius: 10, border: 'none', backgroundColor: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
              >
                {busy ? 'Marking...' : `Mark all ${waiting} out of the kiln`}
              </button>
            ) : detail.piece_count > 0 ? (
              <p style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', fontWeight: 600, color: '#2E7D32' }}>
                <Check size={17} /> Everything on this shelf is out
              </p>
            ) : null}

            <div style={{ marginTop: '1.1rem', paddingTop: '0.9rem', borderTop: '1px solid #eee', textAlign: 'center', breakInside: 'avoid' }}>
              <p style={{ fontSize: '1rem', fontWeight: 700 }}>{detail.label}</p>
              <p style={{ fontSize: '0.75rem', color: '#777', marginBottom: '0.4rem' }}>
                {detail.piece_count} piece{detail.piece_count === 1 ? '' : 's'}
              </p>
              {qrs[detail.id] && <img src={qrs[detail.id]} alt="" style={{ width: 170, height: 170, margin: '0 auto', display: 'block' }} />}
              <button onClick={() => window.print()} className="no-print" style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.8rem', borderRadius: 8, border: '1px solid #ddd', background: 'white', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                <Printer size={14} /> Print this sticker
              </button>
            </div>
          </div>
        )}
      </PageShell>
    );
  }

  // ---------- All shelves ----------
  return (
    <PageShell title="Kiln shelves" subtitle="One sticker per shelf">
      <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.75rem' }}>
        Start a shelf, print its sticker and tape it on. Whoever unloads the kiln scans it and the whole shelf is marked out.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }} className="no-print">
        <button onClick={newShelf} disabled={busy} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.85rem', borderRadius: 8, border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer' }}>
          <Plus size={15} /> Start a shelf
        </button>
        <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.85rem', borderRadius: 8, border: '1px solid #ddd', background: 'white', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
          <Printer size={15} /> Print all
        </button>
      </div>

      {loading && <p style={{ fontSize: '0.85rem', color: '#888' }}>Loading...</p>}
      {error && <p style={{ fontSize: '0.85rem', color: '#c0392b' }}>{error}</p>}
      {!loading && !error && shelves.length === 0 && (
        <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px dashed #ddd', borderRadius: 10 }}>
          <Flame size={24} style={{ color: '#ccc' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '0.5rem' }}>No shelves yet</p>
          <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' }}>Start one when you load the kiln.</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.75rem' }}>
        {shelves.map((sh) => (
          <div key={sh.id} style={{ border: `1px solid ${sh.all_packed ? '#CDE3CD' : '#eee'}`, borderRadius: 10, padding: '0.8rem', textAlign: 'center', backgroundColor: sh.all_packed ? '#F4F8F4' : 'white', breakInside: 'avoid' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: 700 }}>{sh.label}</p>
            <p style={{ fontSize: '0.75rem', color: '#777', marginBottom: '0.5rem' }}>
              {sh.pieces} piece{sh.pieces === 1 ? '' : 's'}
              {sh.out_of_kiln_at ? ' · out of the kiln' : ''}
            </p>
            {qrs[sh.id] && <img src={qrs[sh.id]} alt="" style={{ width: 150, height: 150, margin: '0 auto', display: 'block' }} />}
            <button
              onClick={() => router.push(`/kiln-batch?id=${sh.id}`)}
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
