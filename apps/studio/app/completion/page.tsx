'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { Camera, Check } from 'lucide-react';

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

export default function CompletionPage() {
  const [bookingCode, setBookingCode] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [selectedPiece, setSelectedPiece] = useState<string>('');
  const [photo, setPhoto] = useState<HTMLImageElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setBookings((Array.isArray(d) ? d : []).slice(0, 60)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!bookingCode) { setPieces([]); return; }
    const b = bookings.find((x) => x.booking_code === bookingCode);
    if (!b) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/by-stage`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        const all: Piece[] = Object.values(d.by_stage || {}).flat() as Piece[];
        setPieces(all.filter((p) => p.booking_id === b.customer_name));
      })
      .catch(() => {});
  }, [bookingCode, bookings]);

  const stamp = async () => {
    const c = canvasRef.current;
    if (!c || !photo) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const booking = bookings.find((b) => b.booking_code === bookingCode);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(photo, 0, 0, c.width, c.height);

    // Real, scannable QR -- the payload is the same /customer?booking=CODE
    // route used everywhere else, so scanning a stamped photo later opens
    // that customer's actual session.
    const qrSize = Math.round(c.width * 0.22);
    const qrDataUrl = await QRCode.toDataURL(
      `${window.location.origin}/customer?booking=${encodeURIComponent(bookingCode)}`,
      { margin: 1, width: qrSize }
    );
    const qrImg = new Image();
    await new Promise((resolve) => { qrImg.onload = resolve; qrImg.src = qrDataUrl; });

    const pad = c.width * 0.03;
    const captionH = qrSize * 0.22;
    // White backing so the QR (and its caption) reads against any background.
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(c.width - qrSize - pad * 2, c.height - qrSize - pad * 2 - captionH, qrSize + pad, qrSize + pad + captionH);
    ctx.fillStyle = '#2B2724';
    ctx.font = `700 ${Math.round(qrSize * 0.09)}px "Instrument Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Scan to order & track', c.width - qrSize / 2 - pad * 1.5, c.height - qrSize - pad * 2 - captionH + 4);
    ctx.textAlign = 'left';
    ctx.drawImage(qrImg, c.width - qrSize - pad * 1.5, c.height - qrSize - pad * 1.5, qrSize, qrSize);

    // Name + date banner along the bottom.
    const bannerH = c.height * 0.09;
    ctx.fillStyle = 'rgba(43,39,36,0.78)';
    ctx.fillRect(0, c.height - bannerH, c.width - qrSize - pad * 2, bannerH);
    ctx.fillStyle = '#F7F4EE';
    ctx.font = `600 ${Math.round(bannerH * 0.34)}px "Instrument Sans", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `${booking?.customer_name || 'Customer'}  ·  ${new Date().toLocaleDateString('en-GB')}`,
      pad,
      c.height - bannerH / 2
    );
  };

  useEffect(() => { stamp(); }, [photo, bookingCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const img = new Image();
    img.onload = () => {
      const c = canvasRef.current;
      if (c) {
        const maxW = 360;
        const scale = Math.min(1, maxW / img.width);
        c.width = img.width * scale;
        c.height = img.height * scale;
      }
      setPhoto(img);
    };
    img.src = URL.createObjectURL(f);
  };

  const save = async () => {
    const c = canvasRef.current;
    if (!c || !selectedPiece) return;
    setSaving(true);
    setError(null);
    try {
      const blob: Blob = await new Promise((resolve) => c.toBlob((b) => resolve(b!), 'image/jpeg', 0.9));
      const formData = new FormData();
      formData.append('photo', blob, 'completion.jpg');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${selectedPiece}/completion-photo`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Could not save the stamped photo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '520px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Completion</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Photograph a finished piece — it gets a real, scannable QR plus the customer&apos;s name and today&apos;s date stamped on.
      </p>

      <select
        value={bookingCode}
        onChange={(e) => { setBookingCode(e.target.value); setSelectedPiece(''); }}
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
          onChange={(e) => setSelectedPiece(e.target.value)}
          style={{ width: '100%', padding: '0.55rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.88rem', marginBottom: '0.9rem' }}
        >
          <option value="">Choose a piece...</option>
          {pieces.map((p) => (
            <option key={p.id} value={p.id}>{p.description || p.piece_type || 'Piece'}</option>
          ))}
          {pieces.length === 0 && <option value="" disabled>No pieces found for this booking</option>}
        </select>
      )}

      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={!bookingCode || !selectedPiece}
        style={{ width: '100%', padding: '1.2rem', border: '2px dashed #ccc', borderRadius: '8px', backgroundColor: 'white', cursor: bookingCode && selectedPiece ? 'pointer' : 'not-allowed', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', marginBottom: '0.9rem', opacity: bookingCode && selectedPiece ? 1 : 0.5 }}
      >
        <Camera size={26} color="var(--clay)" />
        <span style={{ color: '#666', fontSize: '0.85rem' }}>{photo ? 'Retake photo' : 'Photograph the piece'}</span>
      </button>

      <canvas ref={canvasRef} style={{ width: '100%', maxWidth: 360, borderRadius: '8px', display: photo ? 'block' : 'none', marginBottom: '0.9rem' }} />

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '0.9rem' }}>{error}</div>}

      {photo && (
        <button
          onClick={save}
          disabled={saving || saved}
          style={{ width: '100%', padding: '0.6rem', backgroundColor: saved ? '#1a8a3c' : 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
        >
          {saved ? <><Check size={16} /> Saved to this piece</> : saving ? 'Saving...' : 'Save stamped photo'}
        </button>
      )}
    </motion.div>
  );
}
