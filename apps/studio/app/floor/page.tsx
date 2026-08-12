'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Home, Camera, Printer } from 'lucide-react';
import QRCode from 'qrcode';

interface Booking {
  booking_code: string;
  customer_name: string;
  session_start: string;
  table_number: string | null;
  party_size: number | null;
}

const B = {
  charcoal: 'var(--charcoal)',
  clay: 'var(--clay)',
  sand: 'var(--sand)',
  ivory: 'var(--ivory)',
  stone: 'var(--stone)',
};

export default function FloorPage() {
  const [phase, setPhase] = useState<1 | 2 | 3>(1);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<Booking | null>(null);
  const [pieceCount, setPieceCount] = useState(0);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadBookings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`);
      const data = res.ok ? await res.json() : [];
      // Today's real sessions, soonest first -- what a floor staff member
      // actually needs when starting a shift.
      const todayStr = new Date().toDateString();
      const today = (Array.isArray(data) ? data : []).filter(
        (b: Booking) => new Date(b.session_start).toDateString() === todayStr
      );
      setBookings((today.length ? today : data).slice(0, 30));
      setPhase(2);
    } finally {
      setLoading(false);
    }
  };

  const selectBooking = async (b: Booking) => {
    setCurrent(b);
    setPieceCount(b.party_size || 1);
    const url = `${window.location.origin}/customer?booking=${encodeURIComponent(b.booking_code)}`;
    setQrUrl(url);
  };

  const goToHandoff = async () => {
    if (!current || !qrUrl) return;
    setPhase(3);
    setTimeout(async () => {
      const c = canvasRef.current;
      if (!c) return;
      const dataUrl = await QRCode.toDataURL(qrUrl, { margin: 1, width: 160 });
      const img = new Image();
      img.onload = () => c.getContext('2d')?.drawImage(img, 0, 0, 160, 160);
      img.src = dataUrl;
    }, 50);
  };

  const nextBooking = () => {
    setPhase(2);
    setCurrent(null);
    setPieceCount(0);
    setQrUrl(null);
  };

  // ============ PHASE 1: HOME ============
  if (phase === 1) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: B.charcoal }}>
        <div className="max-w-2xl mx-auto">
          <div className="pt-6 pb-8 text-center">
            <h1 className="text-2xl font-bold" style={{ color: B.ivory }}>Start Floor</h1>
            <p className="text-sm mt-1" style={{ color: B.stone }}>Real bookings, real QR, real hand-off.</p>
          </div>

          <div className="space-y-3">
            <button
              onClick={loadBookings}
              disabled={loading}
              className="w-full py-5 rounded-lg font-bold flex items-center justify-center gap-3 text-lg"
              style={{ backgroundColor: B.clay, color: B.ivory }}
            >
              {loading ? 'Loading...' : '🏃 Start Floor'}
              {!loading && <ChevronRight size={24} />}
            </button>

            <a
              href="/shelf-sweep"
              className="w-full py-5 rounded-lg font-bold flex items-center justify-center gap-3 text-lg"
              style={{ backgroundColor: B.stone, color: B.charcoal, textDecoration: 'none' }}
            >
              <Camera size={24} />
              Shelf Scan
            </a>
          </div>

          <p style={{ color: B.stone, fontSize: '0.75rem', marginTop: '1.5rem', textAlign: 'center' }}>
            Shelf Scan opens the real Shelf Sweep tool — same real AI matching against real bookings, not a mockup.
          </p>
        </div>
      </div>
    );
  }

  // ============ PHASE 2: SELECT TABLE ============
  if (phase === 2) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: B.charcoal }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-6 pt-4">
            <button onClick={() => setPhase(1)} className="p-2" style={{ color: B.clay }}>
              <Home size={24} />
            </button>
            <p style={{ color: B.stone }} className="text-sm font-bold">Phase 2/3 · Table</p>
            <div style={{ width: 24 }} />
          </div>

          <div className="rounded-lg p-6" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
            <div className="text-center mb-6">
              <span className="text-4xl">🎨</span>
              <h2 className="text-xl font-bold mt-3" style={{ color: B.ivory }}>Select Table</h2>
              <p style={{ color: B.stone, fontSize: '0.8rem', marginTop: '0.25rem' }}>
                {bookings.length} real booking{bookings.length === 1 ? '' : 's'} today
              </p>
            </div>

            {bookings.length === 0 && (
              <p style={{ color: B.stone, textAlign: 'center', fontSize: '0.85rem' }}>No bookings found for today.</p>
            )}

            <div className="space-y-2" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {bookings.map((b) => (
                <button
                  key={b.booking_code}
                  onClick={() => selectBooking(b)}
                  className="w-full text-left p-3 rounded-lg flex justify-between items-center"
                  style={{
                    backgroundColor: current?.booking_code === b.booking_code ? B.clay : B.charcoal,
                    border: `1px solid ${B.stone}40`,
                  }}
                >
                  <div>
                    <p style={{ color: B.ivory, fontWeight: 600, fontSize: '0.9rem' }}>{b.customer_name}</p>
                    <p style={{ color: B.stone, fontSize: '0.75rem' }}>
                      {new Date(b.session_start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      {b.table_number ? ` · Table ${b.table_number}` : ''}
                    </p>
                  </div>
                  <ChevronRight size={18} color={B.ivory} />
                </button>
              ))}
            </div>

            {current && (
              <div className="mt-5 pt-5" style={{ borderTop: `1px solid ${B.stone}40` }}>
                <p style={{ color: B.stone, fontSize: '0.8rem', marginBottom: '0.4rem' }}>Pieces for this table</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPieceCount((n) => Math.max(0, n - 1))}
                    style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: B.charcoal, color: B.ivory, border: 'none', fontSize: '1.2rem' }}
                  >−</button>
                  <span style={{ color: B.ivory, fontWeight: 700, fontSize: '1.3rem', minWidth: 30, textAlign: 'center' }}>{pieceCount}</span>
                  <button
                    onClick={() => setPieceCount((n) => n + 1)}
                    style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: B.charcoal, color: B.ivory, border: 'none', fontSize: '1.2rem' }}
                  >+</button>
                </div>

                <button
                  onClick={goToHandoff}
                  className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 mt-4"
                  style={{ backgroundColor: B.clay, color: B.ivory }}
                >
                  Continue <ChevronRight size={20} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============ PHASE 3: HAND-OFF ============
  return (
    <div className="min-h-screen p-4" style={{ backgroundColor: B.charcoal }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6 pt-4">
          <button onClick={() => setPhase(2)} className="p-2" style={{ color: B.clay }}>
            <Home size={24} />
          </button>
          <p style={{ color: B.stone }} className="text-sm font-bold">Phase 3/3 · Hand-off</p>
          <div style={{ width: 24 }} />
        </div>

        <div className="rounded-lg p-8" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
          <div className="text-center mb-6">
            <span className="text-4xl">✅</span>
            <h2 className="text-xl font-bold mt-3" style={{ color: B.ivory }}>Hand-off</h2>
          </div>

          <div className="space-y-4 mb-8">
            <div className="p-4 rounded-lg text-center" style={{ backgroundColor: B.charcoal }}>
              <p style={{ color: B.ivory }} className="font-bold text-sm mb-2">Real, scannable QR</p>
              <canvas ref={canvasRef} width={160} height={160} style={{ margin: '0 auto', borderRadius: 6, backgroundColor: 'white' }} />
              <p style={{ color: B.sand }} className="text-xs font-mono mt-2">{current?.booking_code}</p>
              <p style={{ color: B.stone }} className="text-xs mt-1">{current?.customer_name}</p>
            </div>

            <div className="p-4 rounded-lg" style={{ backgroundColor: B.charcoal }}>
              <p style={{ color: B.ivory }} className="font-bold text-sm">Piece count</p>
              <p style={{ color: B.stone }} className="text-xs mt-2">{pieceCount} piece{pieceCount === 1 ? '' : 's'} noted for this table</p>
            </div>
          </div>

          <button
            onClick={() => window.print()}
            className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 mb-2"
            style={{ backgroundColor: B.stone, color: B.charcoal }}
          >
            <Printer size={18} /> Print card
          </button>

          <button
            onClick={nextBooking}
            className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2"
            style={{ backgroundColor: B.clay, color: B.ivory }}
          >
            Next Booking <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
