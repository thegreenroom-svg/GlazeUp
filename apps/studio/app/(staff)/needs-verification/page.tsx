'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface FlaggedBooking {
  booking_code: string;
  customer_name: string;
  table_number: string | null;
  session_start: string;
  notes: string;
}

// Real, read-only list of bookings imported on 9 Aug from a photo of a
// diary, where the date/time couldn't be read with full confidence.
// GET only -- no "mark verified" action here on purpose. Verifying a
// booking's real date/time is a judgement call for a person with the
// actual records, not something this app should silently resolve.
export default function NeedsVerificationPage() {
  const [bookings, setBookings] = useState<FlaggedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/needs-verification`);
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || 'Could not load');
        setBookings([]);
        return;
      }
      setBookings(d.bookings || []);
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date();

  return (
    <div style={{ padding: '1.5rem', maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.3rem' }}>Bookings Needing Verification</h1>
      <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Entered on 9 Aug from a photo of a diary, not typed in directly — the date or time
        on these couldn't be read with full confidence. Check each against the real
        records and correct on the Bookings page if needed. Read-only here; nothing
        gets cleared automatically.
      </p>

      <button
        onClick={load}
        disabled={loading}
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '1.25rem' }}
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Loading...' : 'Refresh'}
      </button>

      {error && (
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.9rem', backgroundColor: '#fee', color: '#c33', borderRadius: '6px', marginBottom: '1.25rem' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {!loading && !error && (
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {bookings.length} booking{bookings.length === 1 ? '' : 's'} still flagged.
        </p>
      )}

      {!loading && !error && bookings.length === 0 && (
        <p style={{ color: '#999' }}>None flagged — all clear.</p>
      )}

      {!loading && bookings.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {bookings.map((b) => {
            const start = new Date(b.session_start);
            const upcoming = start > now;
            return (
              <div key={b.booking_code} style={{ padding: '0.9rem', border: `1px solid ${upcoming ? '#e0c060' : '#ddd'}`, backgroundColor: upcoming ? '#fffdf5' : 'white', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <span style={{ fontWeight: 700 }}>{b.customer_name}</span>
                  {upcoming && <span style={{ fontSize: '0.7rem', color: '#8a5a00', fontWeight: 700 }}>UPCOMING</span>}
                </div>
                <p style={{ fontSize: '0.85rem', color: '#333' }}>
                  {start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' · '}
                  {start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  {b.table_number ? ` · Table ${b.table_number}` : ''}
                </p>
                <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '0.3rem' }}>{b.notes}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                  <p style={{ fontSize: '0.7rem', color: '#bbb', fontFamily: 'monospace' }}>{b.booking_code}</p>
                  <a href={`/bookings?code=${b.booking_code}`} style={{ fontSize: '0.75rem', color: 'var(--clay)', fontWeight: 600, textDecoration: 'none' }}>
                    Open booking →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
