'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { Printer, RefreshCw, AlertCircle } from 'lucide-react';

interface Booking {
  booking_code: string;
  customer_name: string;
  session_start: string;
  table_number: string | null;
  party_size: number | null;
}

export default function DailyCardsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newSinceLoad, setNewSinceLoad] = useState<Booking[]>([]);
  const [cardDate, setCardDate] = useState(() => new Date().toISOString().slice(0, 10));
  const cardDateRef = useRef(cardDate);
  const knownCodes = useRef<Set<string>>(new Set());
  const firstLoadDone = useRef(false);

  useEffect(() => { cardDateRef.current = cardDate; }, [cardDate]);

  const load = useCallback(async (isFirstLoad: boolean) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`);
      const data = res.ok ? await res.json() : [];
      const dayStr = new Date(cardDateRef.current).toDateString();
      const today = (Array.isArray(data) ? data : [])
        .filter((b: Booking) => new Date(b.session_start).toDateString() === dayStr)
        .sort((a: Booking, b: Booking) => new Date(a.session_start).getTime() - new Date(b.session_start).getTime());

      if (isFirstLoad) {
        knownCodes.current = new Set(today.map((b: Booking) => b.booking_code));
        setBookings(today);
      } else {
        const fresh = today.filter((b: Booking) => !knownCodes.current.has(b.booking_code));
        if (fresh.length > 0) {
          setNewSinceLoad((prev) => {
            const codes = new Set(prev.map((p) => p.booking_code));
            return [...prev, ...fresh.filter((f: Booking) => !codes.has(f.booking_code))];
          });
        }
        setBookings(today);
      }

      // Real, scannable QR per booking -- same payload every other QR in the
      // app uses, so any of these cards works with the same /customer route.
      const urls: Record<string, string> = {};
      await Promise.all(
        today.map(async (b: Booking) => {
          urls[b.booking_code] = await QRCode.toDataURL(
            `${window.location.origin}/customer?booking=${encodeURIComponent(b.booking_code)}`,
            { margin: 1, width: 140 }
          );
        })
      );
      setQrUrls((prev) => ({ ...prev, ...urls }));
    } catch {
      setError('Could not load bookings for that day.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setNewSinceLoad([]);
    setQrUrls({});
    setLoading(true);
    load(true);
    firstLoadDone.current = true;
    // Real check for new bookings landing after the initial print run --
    // this is the 'update any further ones with an alert' Daisy asked for.
    // Resets whenever the chosen date changes, so 'new since load' always
    // means new for whichever day is currently on screen.
    const t = setInterval(() => load(false), 60000);
    return () => clearInterval(t);
  }, [load, cardDate]);

  const acceptNew = () => {
    setNewSinceLoad([]);
    knownCodes.current = new Set(bookings.map((b) => b.booking_code));
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '900px' }}>
      <div className="no-print">
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Print Booking Cards</h1>
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
          One real QR card per booking — scan to view the session, order drinks, or track pieces. Go forward or back to print ahead for a party or a busy day.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setCardDate((d) => new Date(new Date(d).getTime() - 86400000).toISOString().slice(0, 10))}
            style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            ← Prev day
          </button>
          <input
            type="date"
            value={cardDate}
            onChange={(e) => setCardDate(e.target.value)}
            style={{ padding: '0.5rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem' }}
          />
          <button
            onClick={() => setCardDate((d) => new Date(new Date(d).getTime() + 86400000).toISOString().slice(0, 10))}
            style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            Next day →
          </button>
          <button
            onClick={() => setCardDate(new Date().toISOString().slice(0, 10))}
            style={{ padding: '0.5rem 0.8rem', backgroundColor: cardDate === new Date().toISOString().slice(0, 10) ? 'var(--clay)' : '#f0f0f0', color: cardDate === new Date().toISOString().slice(0, 10) ? 'white' : '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Today
          </button>
          <button
            onClick={() => setCardDate((d) => new Date(new Date(d).getTime() + 7 * 86400000).toISOString().slice(0, 10))}
            style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            +1 week
          </button>
        </div>

        {loading && <p style={{ color: '#666' }}>Loading...</p>}
        {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

        {newSinceLoad.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.9rem', backgroundColor: '#fdf6e3', border: '1px solid #e0a020', borderRadius: '8px', marginBottom: '1.25rem' }}>
            <AlertCircle size={18} color="#e0a020" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                {newSinceLoad.length} new booking{newSinceLoad.length === 1 ? '' : 's'} since you loaded this page
              </p>
              <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.2rem' }}>
                {newSinceLoad.map((b) => b.customer_name).join(', ')} — marked below, print those too.
              </p>
            </div>
            <button onClick={acceptNew} style={{ background: 'none', border: 'none', color: '#e0a020', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Dismiss
            </button>
          </div>
        )}

        {!loading && bookings.length === 0 && (
          <p style={{ color: '#999', fontSize: '0.9rem' }}>No bookings found for {new Date(cardDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.</p>
        )}

        {bookings.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <button
              onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600 }}
            >
              <Printer size={16} /> Print all {bookings.length} cards
            </button>
            <button
              onClick={() => load(false)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              <RefreshCw size={14} /> Check for new bookings now
            </button>
          </div>
        )}
      </div>

      <div className="card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
        {bookings.map((b) => {
          const isNew = newSinceLoad.some((n) => n.booking_code === b.booking_code);
          return (
            <div
              key={b.booking_code}
              className="print-card"
              style={{
                padding: '1rem', borderRadius: '10px', backgroundColor: 'white', textAlign: 'center',
                border: isNew ? '2px solid #e0a020' : '1px solid #ddd',
              }}
            >
              {isNew && <p style={{ fontSize: '0.7rem', color: '#e0a020', fontWeight: 700, marginBottom: '0.3rem' }}>NEW</p>}
              {qrUrls[b.booking_code] ? (
                <img src={qrUrls[b.booking_code]} alt="" style={{ width: 120, height: 120, margin: '0 auto' }} />
              ) : (
                <div style={{ width: 120, height: 120, margin: '0 auto', backgroundColor: '#f0f0f0' }} />
              )}
              <p style={{ fontWeight: 700, fontSize: '1rem', marginTop: '0.6rem' }}>{b.customer_name}</p>
              <p style={{ fontSize: '0.8rem', color: '#666' }}>
                {new Date(b.session_start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                {b.table_number ? ` · Table ${b.table_number}` : ''}
              </p>
              <p style={{ fontSize: '0.7rem', color: '#aaa', fontFamily: 'monospace', marginTop: '0.3rem' }}>{b.booking_code}</p>
            </div>
          );
        })}
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          .card-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .print-card { break-inside: avoid; }
        }
      `}</style>
    </motion.div>
  );
}
