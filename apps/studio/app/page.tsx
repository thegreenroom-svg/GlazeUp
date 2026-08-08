'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';

interface Booking {
  id: string;
  customer_name: string;
  party_size: number | null;
  status: string;
  session_start: string;
  room: string | null;
  current_stage: string;
}

interface Studio {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
}

export default function Dashboard() {
  const [studio, setStudio] = useState<Studio | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [studioRes, bookingsRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/studio`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`),
        ]);

        if (studioRes.ok) setStudio(await studioRes.json());
        if (bookingsRes.ok) setBookings(await bookingsRes.json());

        if (!studioRes.ok || !bookingsRes.ok) {
          setError('Some data failed to load.');
        }
      } catch (err) {
        setError('Could not reach the server.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
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
        Demo view — read-only. Showing real data for {studio?.name || 'your studio'}, nothing here can be edited.
      </div>

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
        {studio?.name || 'Dashboard'}
      </h1>
      {studio?.city && <p style={{ color: '#666', marginBottom: '2rem' }}>{studio.city}</p>}

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1.5rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#666' }}>Loading...</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ padding: '1.5rem', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', textAlign: 'center' }}>
              <Calendar size={28} color="#0066cc" style={{ margin: '0 auto 0.5rem' }} />
              <p style={{ color: '#666', fontSize: '0.875rem' }}>Recent Bookings</p>
              <h3 style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>{bookings.length}</h3>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Recent Bookings</h2>
            {bookings.length === 0 ? (
              <p style={{ color: '#999' }}>No bookings found.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {bookings.map((b) => (
                  <div key={b.id} style={{ padding: '0.75rem', backgroundColor: '#f9f9f9', borderRadius: '4px', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontWeight: '500' }}>{b.customer_name}</p>
                      <p style={{ fontSize: '0.75rem', color: '#999' }}>{new Date(b.session_start).toLocaleString()}</p>
                    </div>
                    <span
                      style={{
                        padding: '0.25rem 0.75rem',
                        backgroundColor: '#eef',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        alignSelf: 'center',
                        textTransform: 'capitalize',
                      }}
                    >
                      {b.status}
                    </span>
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
