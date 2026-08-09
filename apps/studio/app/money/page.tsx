'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { PoundSterling, Calendar } from 'lucide-react';
import { SkeletonRows } from '@/components/Skeleton';

interface RevenueRow {
  metric_date: string;
  category: string;
  revenue_cents: number;
  item_count: number;
}

export default function MoneyPage() {
  const [rows, setRows] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/revenue`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setRows)
      .catch(() => setError('Could not load takings.'))
      .finally(() => setLoading(false));
  }, []);

  const byDate: { [key: string]: number } = {};
  rows.forEach((r) => {
    byDate[r.metric_date] = (byDate[r.metric_date] || 0) + r.revenue_cents / 100;
  });
  const sortedDates = Object.entries(byDate).sort(([a], [b]) => (a < b ? 1 : -1));
  const todayTotal = sortedDates.length > 0 ? sortedDates[0][1] : 0;
  const mostRecentDate = sortedDates.length > 0 ? sortedDates[0][0] : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
      <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Demo view — read-only.
      </div>

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '2rem' }}>Money</h1>

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1.5rem' }}>{error}</div>}

      {loading ? (
        <SkeletonRows count={5} />
      ) : (
        <>
          {mostRecentDate && (
            <div style={{ padding: '1.5rem', backgroundColor: 'white', border: '2px solid #00aa00', borderRadius: '8px', marginBottom: '1.5rem', maxWidth: '300px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <PoundSterling size={20} color="#00aa00" />
                <p style={{ color: '#666', fontSize: '0.875rem' }}>Most Recent Day's Takings</p>
              </div>
              <h2 style={{ fontSize: '2rem', fontWeight: 'bold' }}>£{todayTotal.toFixed(2)}</h2>
              <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>{new Date(mostRecentDate).toLocaleDateString()}</p>
            </div>
          )}

          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '1.5rem', border: '1px solid #ddd' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={20} /> Takings by Day
            </h2>
            {sortedDates.length === 0 ? (
              <p style={{ color: '#999' }}>No takings data available.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {sortedDates.map(([date, total]) => (
                  <div key={date} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #eee' }}>
                    <span>{new Date(date).toLocaleDateString()}</span>
                    <span style={{ fontWeight: '600' }}>£{total.toFixed(2)}</span>
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
