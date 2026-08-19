'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PageHeader, StatusBlock } from '@/components/PageStatus';

interface Balance {
  key: string;
  earned: number;
  spent: number;
  balance: number;
  transactions: number;
}

interface Txn {
  id: string;
  booking_code: string | null;
  points_earned: number | null;
  points_spent: number | null;
  transaction_type: string | null;
  description: string | null;
  created_at: string;
}

interface Rule {
  event: string;
  points: number;
  note: string;
}

interface LoyaltyData {
  totals: { earned: number; spent: number; balance: number; transactions: number };
  balances: Balance[];
  recent: Txn[];
  rules: Rule[];
}

export default function LoyaltyPage() {
  const [data, setData] = useState<LoyaltyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/loyalty`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load loyalty data.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '1.5rem 1.25rem', maxWidth: '700px', margin: '0 auto' }}>
      <PageHeader title="Loyalty" subtitle="Earned through coming in and making things — not a subscription, and not money." />

      <StatusBlock loading={loading} error={error} />

      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Points earned', value: data.totals.earned },
              { label: 'Points spent', value: data.totals.spent },
              { label: 'Outstanding', value: data.totals.balance },
            ].map((s) => (
              <div key={s.label} style={{ padding: '0.9rem', backgroundColor: 'white', border: '1px solid #eee', borderRadius: '8px', textAlign: 'center' }}>
                <p style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--clay)' }}>{s.value.toLocaleString()}</p>
                <p style={{ fontSize: '0.7rem', color: '#999' }}>{s.label}</p>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.6rem' }}>How points are earned</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '1.5rem' }}>
            {data.rules.map((r) => (
              <div key={r.event} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.8rem', backgroundColor: '#fdf6f8', borderRadius: '6px' }}>
                <div>
                  <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>{r.event}</p>
                  <p style={{ fontSize: '0.75rem', color: '#999' }}>{r.note}</p>
                </div>
                <span style={{ fontWeight: 700, color: 'var(--clay)' }}>+{r.points}</span>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.6rem' }}>Top balances</h2>
          {data.balances.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#999', marginBottom: '1.5rem' }}>No loyalty activity recorded yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1.5rem' }}>
              {data.balances.slice(0, 15).map((b) => (
                <div key={b.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.7rem', backgroundColor: '#f9f9f9', borderRadius: '6px', fontSize: '0.85rem' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.key}</span>
                  <span style={{ fontWeight: 600 }}>{b.balance} pts</span>
                </div>
              ))}
            </div>
          )}

          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.6rem' }}>Recent activity</h2>
          {data.recent.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#999' }}>Nothing yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {data.recent.map((t) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.7rem', borderBottom: '1px solid #f2f2f2', fontSize: '0.85rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.description || t.transaction_type || 'Activity'}
                    </p>
                    <p style={{ fontSize: '0.7rem', color: '#999' }}>{new Date(t.created_at).toLocaleDateString()}</p>
                  </div>
                  <span style={{ fontWeight: 600, color: (t.points_earned || 0) > 0 ? '#1a8a3c' : '#c33', whiteSpace: 'nowrap' }}>
                    {(t.points_earned || 0) > 0 ? `+${t.points_earned}` : `-${t.points_spent || 0}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
