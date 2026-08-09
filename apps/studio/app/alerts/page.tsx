'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, CheckCircle } from 'lucide-react';
import { SkeletonRows } from '@/components/Skeleton';

interface Alert {
  id: string;
  trigger_type: string;
  label: string;
  message: string;
  priority: number;
  acknowledged: boolean;
  created_at: string;
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/alerts`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setAlerts)
      .catch(() => setError('Could not load alerts.'))
      .finally(() => setLoading(false));
  }, []);

  const priorityColor = (p: number) => (p >= 3 ? '#c33' : p === 2 ? '#ff9900' : '#0066cc');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
      <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Demo view — read-only.
      </div>

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '2rem' }}>Alerts</h1>

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <SkeletonRows count={4} />
      ) : alerts.length === 0 ? (
        <p style={{ color: '#999' }}>No alerts found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {alerts.map((a) => (
            <div
              key={a.id}
              style={{
                padding: '1rem',
                backgroundColor: 'white',
                border: `1px solid ${priorityColor(a.priority)}`,
                borderLeft: `4px solid ${priorityColor(a.priority)}`,
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <Bell size={18} color={priorityColor(a.priority)} style={{ marginTop: '0.15rem', flexShrink: 0 }} />
                <div>
                  <p style={{ fontWeight: '600', marginBottom: '0.25rem' }}>{a.label}</p>
                  <p style={{ color: '#666', fontSize: '0.875rem' }}>{a.message}</p>
                  <p style={{ color: '#999', fontSize: '0.75rem', marginTop: '0.4rem' }}>{new Date(a.created_at).toLocaleString()}</p>
                </div>
              </div>
              {a.acknowledged && <CheckCircle size={18} color="#00aa00" style={{ flexShrink: 0 }} />}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
