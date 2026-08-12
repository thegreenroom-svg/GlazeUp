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
  const [liveToday, setLiveToday] = useState<{ total_gbp: number; order_count: number; pulled_at: string } | null>(null);
  const [liveError, setLiveError] = useState(false);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/revenue`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setRows)
      .catch(() => setError('Could not load takings.'))
      .finally(() => setLoading(false));

    // Genuinely live, straight from Square -- the synced breakdown below can
    // fall behind (it has, checked directly: several real days at times),
    // so this bypasses that entirely for today's real figure.
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/today-live-total`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d) => (d.total_gbp === null ? setLiveError(true) : setLiveToday(d)))
      .catch(() => setLiveError(true));
  }, []);

  const byDate: { [key: string]: number } = {};
  rows.forEach((r) => {
    byDate[r.metric_date] = (byDate[r.metric_date] || 0) + r.revenue_cents / 100;
  });
  const sortedDates = Object.entries(byDate).sort(([a], [b]) => (a < b ? 1 : -1));
  const recentTotal = sortedDates.length > 0 ? sortedDates[0][1] : 0;
  const mostRecentDate = sortedDates.length > 0 ? sortedDates[0][0] : null;
  const daysStale = mostRecentDate
    ? Math.floor((Date.now() - new Date(mostRecentDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

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
          <div style={{ padding: '1.5rem', backgroundColor: 'white', border: '2px solid var(--clay)', borderRadius: '8px', marginBottom: '1rem', maxWidth: '300px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <PoundSterling size={20} color="var(--clay)" />
              <p style={{ color: '#666', fontSize: '0.875rem' }}>Today, live from Square</p>
            </div>
            {liveError ? (
              <p style={{ color: '#c33', fontSize: '0.85rem' }}>Could not reach Square right now.</p>
            ) : liveToday ? (
              <>
                <h2 style={{ fontSize: '2rem', fontWeight: 'bold' }}>£{liveToday.total_gbp.toFixed(2)}</h2>
                <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>
                  {liveToday.order_count} order{liveToday.order_count === 1 ? '' : 's'} · pulled {new Date(liveToday.pulled_at).toLocaleTimeString()}
                </p>
              </>
            ) : (
              <p style={{ color: '#999', fontSize: '0.85rem' }}>Loading...</p>
            )}
          </div>

          {mostRecentDate && (
            <div style={{ padding: '1.5rem', backgroundColor: 'white', border: `2px solid ${daysStale && daysStale > 1 ? '#e0a020' : '#00aa00'}`, borderRadius: '8px', marginBottom: '1.5rem', maxWidth: '300px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Calendar size={20} color={daysStale && daysStale > 1 ? '#e0a020' : '#00aa00'} />
                <p style={{ color: '#666', fontSize: '0.875rem' }}>Category breakdown, most recent synced day</p>
              </div>
              <h2 style={{ fontSize: '2rem', fontWeight: 'bold' }}>£{recentTotal.toFixed(2)}</h2>
              <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.25rem' }}>{new Date(mostRecentDate).toLocaleDateString()}</p>
              {daysStale !== null && daysStale > 1 && (
                <p style={{ fontSize: '0.75rem', color: '#e0a020', marginTop: '0.4rem', fontWeight: 600 }}>
                  ⚠ {daysStale} days behind — the category sync hasn't run recently. The figure above is real, live Square data instead.
                </p>
              )}
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
