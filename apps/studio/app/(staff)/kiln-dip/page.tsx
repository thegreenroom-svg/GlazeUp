'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Flame, Search, Check } from 'lucide-react';

interface PackedPiece {
  id: string;
  booking_id: string;
  piece_type: string;
  status: string;
  created_at: string;
}

// Real dip-glaze transition step, per Daisy's described kiln pipeline:
// pieces go into a box for underglaze dip, then each piece's card gets
// looked up here (typed/selected for now -- real camera QR scanning
// would need a library like @zxing/browser added, separate follow-up
// work, not stubbed here as if it exists). Confirming moves status from
// 'packed' to 'dipped_waiting_firing' and sets the real firing date,
// which auto-calculates collection date as firing date + 2 days on the
// real booking if the piece's booking reference matches one.
export default function KilnDipPage() {
  const [bookingRef, setBookingRef] = useState('');
  const [pieces, setPieces] = useState<PackedPiece[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firingDate, setFiringDate] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ transitioned: number; collection_date: string; bookings_updated: string[]; unmatched_booking_refs: string[] } | null>(null);

  const lookup = async () => {
    const ref = bookingRef.trim();
    if (!ref) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setPieces([]);
    setSelected(new Set());
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/packed-pieces?booking=${encodeURIComponent(ref)}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Could not look up pieces.'); return; }
      setPieces(d.pieces || []);
      setSelected(new Set((d.pieces || []).map((p: PackedPiece) => p.id)));
      if (!d.pieces?.length) setError('No packed pieces found for that booking reference.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirm = async () => {
    if (selected.size === 0 || !firingDate) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/dip-transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_ids: Array.from(selected), firing_date: firingDate }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Could not confirm transition.'); return; }
      setResult(d);
      setPieces((prev) => prev.filter((p) => !selected.has(p.id)));
      setSelected(new Set());
    } catch {
      setError('Could not reach the server.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Flame size={22} color="var(--clay)" /> Kiln — Dip & Fire
      </h1>
      <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        Look up the booking on the card, confirm which packed pieces went in the box, set the real firing date. Collection date is worked out automatically (firing date + 2 days).
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="text"
          value={bookingRef}
          onChange={(e) => setBookingRef(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
          placeholder="Booking code or name on the card"
          style={{ flex: 1, padding: '0.6rem 0.8rem', borderRadius: 8, border: '1px solid #ddd', fontSize: '0.9rem' }}
        />
        <button
          onClick={lookup}
          disabled={loading || !bookingRef.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
        >
          <Search size={15} /> {loading ? '...' : 'Look up'}
        </button>
      </div>

      {error && <div style={{ padding: '0.8rem', backgroundColor: '#fee', color: '#c33', borderRadius: 8, marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</div>}

      {result && (
        <div style={{ padding: '1rem', backgroundColor: '#e8f5e9', border: '1px solid #66bb6a', borderRadius: 8, marginBottom: '1.25rem' }}>
          <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.3rem' }}>
            <Check size={16} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
            {result.transitioned} piece{result.transitioned === 1 ? '' : 's'} moved to dipped, waiting for firing
          </p>
          <p style={{ fontSize: '0.8rem', color: '#333' }}>Collection date set: {new Date(result.collection_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          {result.unmatched_booking_refs.length > 0 && (
            <p style={{ fontSize: '0.75rem', color: '#8a5a00', marginTop: '0.3rem' }}>
              No real booking matched "{result.unmatched_booking_refs.join(', ')}" -- pieces updated, but no collection date could be attached anywhere.
            </p>
          )}
        </div>
      )}

      {pieces.length > 0 && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {pieces.map((p) => (
              <button
                key={p.id}
                onClick={() => toggle(p.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 0.9rem',
                  borderRadius: 8, border: selected.has(p.id) ? '2px solid var(--clay)' : '1px solid #ddd',
                  backgroundColor: selected.has(p.id) ? 'var(--clay-light, #f5e6d3)' : 'white', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid var(--clay)', backgroundColor: selected.has(p.id) ? 'var(--clay)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selected.has(p.id) && <Check size={12} color="white" />}
                </div>
                <span style={{ fontSize: '0.85rem' }}>{p.piece_type}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '1rem' }}>
            <label style={{ fontSize: '0.85rem', color: '#666' }}>Firing date</label>
            <input
              type="date"
              value={firingDate}
              onChange={(e) => setFiringDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              style={{ padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.85rem' }}
            />
          </div>

          <button
            onClick={confirm}
            disabled={confirming || selected.size === 0 || !firingDate}
            style={{ width: '100%', padding: '0.8rem', borderRadius: 8, border: 'none', backgroundColor: selected.size && firingDate ? 'var(--clay)' : '#ccc', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: selected.size && firingDate ? 'pointer' : 'default' }}
          >
            {confirming ? 'Saving...' : `Confirm ${selected.size} piece${selected.size === 1 ? '' : 's'} dipped & waiting for firing`}
          </button>
        </>
      )}
    </div>
  );
}
