'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Booking {
  id: string;
  customer_name: string;
  customer_email: string | null;
  party_size: number | null;
  status: string;
  session_start: string;
  session_end: string;
  room: string | null;
  current_stage: string;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setBookings)
      .catch(() => setError('Could not load bookings.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
      <div
        style={{
          padding: '0.75rem 1rem',
          backgroundColor: '#fff8e1',
          border: '1px solid #ffca28',
          borderRadius: '4px',
          marginBottom: '1.5rem',
          fontSize: '0.875rem',
        }}
      >
        Demo view — read-only.
      </div>

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '2rem' }}>Bookings</h1>

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <p style={{ color: '#666' }}>Loading...</p>
      ) : bookings.length === 0 ? (
        <p style={{ color: '#999' }}>No bookings found.</p>
      ) : (
        <div style={{ overflowX: 'auto', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd', backgroundColor: '#f9f9f9' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Customer</th>
                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Session</th>
                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Room</th>
                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Stage</th>
                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.75rem' }}>{b.customer_name}</td>
                  <td style={{ padding: '0.75rem' }}>{new Date(b.session_start).toLocaleString()}</td>
                  <td style={{ padding: '0.75rem' }}>{b.room || '—'}</td>
                  <td style={{ padding: '0.75rem', textTransform: 'capitalize' }}>{b.current_stage}</td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{ padding: '0.25rem 0.75rem', backgroundColor: '#eef', borderRadius: '9999px', fontSize: '0.75rem', textTransform: 'capitalize' }}>
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
