'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, Loader, MapPin, XCircle } from 'lucide-react';

interface Booking {
  booking_code: string;
  customer_name: string;
}

interface Piece {
  id: string;
  piece_type: string | null;
  description: string | null;
  booking_id: string | null;
}

interface FindResult {
  piece_description: string;
  found: boolean;
  confidence: 'high' | 'medium' | 'low';
  x_pct: number | null;
  y_pct: number | null;
  reasoning: string | null;
}

// Real, more tractable version of the same problem Shelf Sweep tried and
// abandoned four times: instead of describing a whole messy shelf and
// guessing whose everything is, this is one constrained question -- given
// ONE known piece (its real description, since real reference photos
// mostly don't exist yet), does it appear in THIS narrower table/tray
// photo, and roughly where.
export default function FindOnTablePage() {
  const [bookingCode, setBookingCode] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [selectedPiece, setSelectedPiece] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FindResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setBookings((Array.isArray(d) ? d : []).slice(0, 60)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!bookingCode) { setPieces([]); return; }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/by-stage`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const all: Piece[] = Object.values(d.by_stage || {}).flat() as Piece[];
        setPieces(all.filter((p) => p.booking_id === bookingCode));
      })
      .catch(() => {});
  }, [bookingCode]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !selectedPiece) return;
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('photo', f);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${selectedPiece}/find-on-table`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not check the photo');
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Find on Table</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Pick a booking and piece, then photograph the table or tray you think it&apos;s on — a much narrower search than the whole shelf.
      </p>

      <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
        Uses Google Gemini (a separate paid AI, not the one used elsewhere in this app) for real pixel-level detection — roughly £0.003–0.005 per photo, logged into the same running AI cost total.
      </div>

      <select
        value={bookingCode}
        onChange={(e) => { setBookingCode(e.target.value); setSelectedPiece(''); setResult(null); setPreview(null); }}
        style={{ width: '100%', padding: '0.55rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.88rem', marginBottom: '0.6rem' }}
      >
        <option value="">Choose a booking...</option>
        {bookings.map((b) => (
          <option key={b.booking_code} value={b.booking_code}>{b.customer_name}</option>
        ))}
      </select>

      {bookingCode && (
        <select
          value={selectedPiece}
          onChange={(e) => { setSelectedPiece(e.target.value); setResult(null); setPreview(null); }}
          style={{ width: '100%', padding: '0.55rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.88rem', marginBottom: '0.9rem' }}
        >
          <option value="">Choose a piece...</option>
          {pieces.map((p) => (
            <option key={p.id} value={p.id}>{p.description || p.piece_type || 'Piece'}</option>
          ))}
          {pieces.length === 0 && <option value="" disabled>No pieces logged for this booking yet</option>}
        </select>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={!selectedPiece}
        style={{ width: '100%', padding: '1.2rem', border: '2px dashed #ccc', borderRadius: '8px', backgroundColor: 'white', cursor: selectedPiece ? 'pointer' : 'not-allowed', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', marginBottom: '1.25rem', opacity: selectedPiece ? 1 : 0.5 }}
      >
        <Camera size={26} color="var(--clay)" />
        <span style={{ color: '#666', fontSize: '0.85rem' }}>Photograph the table or tray</span>
      </button>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666', marginBottom: '1.25rem' }}>
          <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Checking...
        </div>
      )}

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1.25rem' }}>{error}</div>}

      {preview && (
        <div style={{ position: 'relative', width: '100%', marginBottom: '1rem' }}>
          <img src={preview} alt="Table" style={{ width: '100%', borderRadius: '8px', display: 'block' }} />
          {result?.found && result.x_pct != null && result.y_pct != null && (
            <div
              style={{
                position: 'absolute',
                left: `${result.x_pct}%`,
                top: `${result.y_pct}%`,
                transform: 'translate(-50%, -50%)',
                width: 44, height: 44,
                borderRadius: '50%',
                border: '3px solid #e0392b',
                boxShadow: '0 0 0 2px white, 0 2px 8px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      )}

      {result && (
        <div style={{ padding: '0.9rem', backgroundColor: result.found ? '#eafaf0' : '#f5f5f5', borderRadius: '8px' }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.9rem', color: result.found ? '#1a8a3c' : '#666' }}>
            {result.found ? <MapPin size={16} /> : <XCircle size={16} />}
            {result.found ? `Found — ${result.confidence} confidence` : 'Not found on this photo'}
          </p>
          {result.reasoning && <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.4rem' }}>{result.reasoning}</p>}
        </div>
      )}
    </motion.div>
  );
}
