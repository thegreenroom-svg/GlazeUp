'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Calendar } from 'lucide-react';
import { SkeletonRows } from '@/components/Skeleton';

interface RevenueRow {
  metric_date: string;
  category: string;
  revenue_cents: number;
  item_count: number;
}

export default function ReportsPage() {
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
      .catch(() => setError('Could not load revenue data.'))
      .finally(() => setLoading(false));
  }, []);

  const totalRevenue = rows.reduce((sum, r) => sum + r.revenue_cents, 0) / 100;
  const totalItems = rows.reduce((sum, r) => sum + r.item_count, 0);

  const byCategory: { [key: string]: { revenue: number; items: number } } = {};
  rows.forEach((r) => {
    const cat = r.category.trim();
    if (!byCategory[cat]) byCategory[cat] = { revenue: 0, items: 0 };
    byCategory[cat].revenue += r.revenue_cents / 100;
    byCategory[cat].items += r.item_count;
  });
  const sortedCategories = Object.entries(byCategory).sort(([, a], [, b]) => b.revenue - a.revenue);

  const mostRecentDate = rows.length > 0 ? rows.reduce((max, r) => (r.metric_date > max ? r.metric_date : max), rows[0].metric_date) : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
      <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Demo view — read-only. Revenue breakdown by category, real data.
      </div>

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Reports</h1>
      {mostRecentDate && (
        <p style={{ color: '#666', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Calendar size={16} /> Most recent data: {new Date(mostRecentDate).toLocaleDateString()}
        </p>
      )}

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1.5rem' }}>{error}</div>}

      {loading ? (
        <SkeletonRows count={5} />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div style={{ padding: '1.5rem', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <TrendingUp size={24} color="var(--clay)" />
                <p style={{ color: '#666', fontSize: '0.875rem' }}>Total Revenue</p>
              </div>
              <h3 style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>£{totalRevenue.toFixed(2)}</h3>
            </div>
            <div style={{ padding: '1.5rem', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px' }}>
              <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Items Sold</p>
              <h3 style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>{totalItems}</h3>
            </div>
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '1.5rem', border: '1px solid #ddd' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Revenue by Category</h2>
            {sortedCategories.length === 0 ? (
              <p style={{ color: '#999' }}>No revenue data available.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {sortedCategories.map(([category, { revenue, items }]) => (
                  <div key={category} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid #eee' }}>
                    <div>
                      <p style={{ fontWeight: '500' }}>{category}</p>
                      <p style={{ fontSize: '0.75rem', color: '#999' }}>{items} items</p>
                    </div>
                    <p style={{ fontWeight: 'bold' }}>£{revenue.toFixed(2)}</p>
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
