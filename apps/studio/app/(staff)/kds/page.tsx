'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Check, Clock } from 'lucide-react';

interface QueueItem {
  id: string;
  booking_code: string;
  item_name: string;
  category: string | null;
  quantity: number;
  created_at: string;
  customer_name: string | null;
  table_number: string | null;
  added_by: string | null;
}

export default function KdsPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kds-queue`);
      const d = res.ok ? await res.json() : { queue: [] };
      setQueue(d.queue || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Real KDS behaviour: keep checking for new orders without a manual refresh.
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const markPrepared = async (id: string) => {
    setPreparing((p) => new Set(p).add(id));
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/till-items/${id}/prepare`, { method: 'POST' });
      setQueue((q) => q.filter((i) => i.id !== id));
    } finally {
      setPreparing((p) => { const n = new Set(p); n.delete(id); return n; });
    }
  };

  const minutesAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '700px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>KDS</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Real drink, food and glaze requests placed by customers or staff from the table. Refreshes automatically.
      </p>

      {loading && <p style={{ color: '#666' }}>Loading...</p>}

      {!loading && queue.length === 0 && (
        <p style={{ color: '#999', fontSize: '0.9rem' }}>Nothing waiting — the kitchen is clear.</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
        {queue.map((item) => {
          const mins = minutesAgo(item.created_at);
          const urgent = mins >= 10;
          return (
            <div
              key={item.id}
              style={{
                padding: '1rem', borderRadius: '10px', backgroundColor: 'white',
                border: `2px solid ${urgent ? '#c33' : 'var(--stone)'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '1rem' }}>{item.quantity > 1 ? `${item.quantity}x ` : ''}{item.item_name}</p>
                  <p style={{ fontSize: '0.78rem', color: '#666' }}>
                    {item.customer_name || item.booking_code}{item.table_number ? ` · Table ${item.table_number}` : ''}
                    {item.added_by === 'customer-app' ? ' · self-ordered' : ' · staff'}
                  </p>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: urgent ? '#c33' : '#999', fontWeight: urgent ? 700 : 400, whiteSpace: 'nowrap' }}>
                  <Clock size={12} /> {mins}m
                </span>
              </div>
              <button
                onClick={() => markPrepared(item.id)}
                disabled={preparing.has(item.id)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: 'none', backgroundColor: 'var(--clay)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
              >
                <Check size={15} /> Made
              </button>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
