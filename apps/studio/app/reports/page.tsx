'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Calendar } from 'lucide-react';

interface Booking {
  id: string;
  status: string;
  session_start: string;
  current_stage: string;
}

export default function ReportsPage() {
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
      .catch(() => setError('Could not load reports.'))
      .finally(() => setLoading(false));
  }, []);

  const stageCounts: { [key: string]: number } = {};
  bookings.forEach((b) => {
    stageCounts[b.current_stage] = (stageCounts[b.current_stage] || 0) + 1;
  });

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
        Demo view — read-only. Showing your most recent 50 bookings.
      </div>

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '2rem' }}>Reports</h1>

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <p style={{ color: '#666' }}>Loading...</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ padding: '1.5rem', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <BarChart3 size={24} color="#0066cc" />
                <p style={{ color: '#666', fontSize: '0.875rem' }}>Bookings Shown</p>
              </div>
              <h3 style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>{bookings.length}</h3>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '1.5rem', border: '1px solid #ddd' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>By Stage</h2>
            {Object.keys(stageCounts).length === 0 ? (
              <p style={{ color: '#999' }}>No data available.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {Object.entries(stageCounts).map(([stage, count]) => (
                  <div key={stage} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                    <span style={{ textTransform: 'capitalize' }}>{stage}</span>
                    <span style={{ fontWeight: '500' }}>{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}
