'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PageHeader, StatusBlock } from '@/components/PageStatus';

interface Analytics {
  totals: { pieces: number; bookings: number; kiln_sessions: number; bookings_with_pieces: number };
  avg_pieces_per_booking: number;
  kiln_utilisation_pct: number;
  busiest_day: { day: string; bookings: number } | null;
  busiest_hour: { hour: number; bookings: number } | null;
  by_weekday: Record<string, number>;
  by_hour: Record<string, number>;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/analytics`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load analytics.'))
      .finally(() => setLoading(false));
  }, []);

  const maxWeekday = data ? Math.max(...WEEKDAYS.map((d) => data.by_weekday[d] || 0), 1) : 1;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '1.5rem 1.25rem', maxWidth: '700px', margin: '0 auto' }}>
      <PageHeader title="Analytics" subtitle="Worked out from real bookings, pieces and firings." />

      <StatusBlock loading={loading} error={error} />

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Pieces per booking', value: data.avg_pieces_per_booking.toFixed(1) },
              { label: 'Kiln utilisation', value: `${data.kiln_utilisation_pct}%` },
              { label: 'Total pieces', value: data.totals.pieces.toLocaleString() },
              { label: 'Total bookings', value: data.totals.bookings.toLocaleString() },
            ].map((s) => (
              <div key={s.label} style={{ padding: '1rem', backgroundColor: 'white', border: '1px solid #eee', borderRadius: '8px' }}>
                <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--clay)' }}>{s.value}</p>
                <p style={{ fontSize: '0.75rem', color: '#999' }}>{s.label}</p>
              </div>
            ))}
          </div>

          {(data.busiest_day || data.busiest_hour) && (
            <div style={{ padding: '0.9rem', backgroundColor: '#fdf6f8', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              {data.busiest_day && (
                <p><strong>{data.busiest_day.day}</strong> is your busiest day ({data.busiest_day.bookings} bookings).</p>
              )}
              {data.busiest_hour && (
                <p style={{ marginTop: '0.3rem' }}>
                  Peak start time is around <strong>{String(data.busiest_hour.hour).padStart(2, '0')}:00</strong>.
                </p>
              )}
            </div>
          )}

          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.7rem' }}>Bookings by day</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {WEEKDAYS.map((d) => {
              const v = data.by_weekday[d] || 0;
              return (
                <div key={d} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ width: '5.5rem', fontSize: '0.8rem', color: '#666' }}>{d.slice(0, 3)}</span>
                  <div style={{ flex: 1, height: '18px', backgroundColor: '#f2f2f2', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${(v / maxWeekday) * 100}%`, height: '100%', backgroundColor: 'var(--clay)' }} />
                  </div>
                  <span style={{ width: '2.5rem', textAlign: 'right', fontSize: '0.8rem', fontWeight: 600 }}>{v}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </motion.div>
  );
}
