'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Receipt } from 'lucide-react';

interface Order {
  id: string;
  item_type: string;
  item_name: string;
  quantity: number;
  unit_price_cents: number;
  notes: string | null;
}

interface TableSession {
  id: string;
  table_number: string;
  status: string;
  number_of_places: number;
  created_at: string;
  orders: Order[];
}

export default function TillPage() {
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/till`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setSessions)
      .catch(() => setError('Could not load till.'))
      .finally(() => setLoading(false));
  }, []);

  const sessionTotal = (session: TableSession) =>
    session.orders.reduce((sum, o) => sum + (o.unit_price_cents * o.quantity) / 100, 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
      <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Demo view — read-only. Live table sessions and orders.
      </div>

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '2rem' }}>Till</h1>

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <p style={{ color: '#666' }}>Loading...</p>
      ) : sessions.length === 0 ? (
        <p style={{ color: '#999' }}>No table sessions found.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {sessions.map((s) => (
            <div key={s.id} style={{ backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ fontWeight: 'bold' }}>Table {s.table_number}</h3>
                <span style={{ padding: '0.2rem 0.7rem', backgroundColor: '#eef', borderRadius: '9999px', fontSize: '0.75rem', textTransform: 'capitalize' }}>{s.status}</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.75rem' }}>{s.number_of_places} places</p>

              {s.orders.length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#999' }}>No items ordered yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
                  {s.orders.map((o) => (
                    <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span>{o.quantity}× {o.item_name}</span>
                      <span>£{((o.unit_price_cents * o.quantity) / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ paddingTop: '0.6rem', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#666' }}>
                  <Receipt size={14} /> <span style={{ fontSize: '0.8rem' }}>Total</span>
                </div>
                <span style={{ fontWeight: 'bold' }}>£{sessionTotal(s).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
