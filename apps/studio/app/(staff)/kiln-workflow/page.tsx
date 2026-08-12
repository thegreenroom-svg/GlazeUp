'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { SkeletonGrid } from '@/components/Skeleton';

interface KilnSession {
  id: string;
  label: string | null;
  status: string;
  batch_code: string | null;
  fired_at: string | null;
  created_at: string;
  morning_check_result: string | null;
  morning_check_confirmed_at: string | null;
  misfire_notes: string | null;
}

export default function KilnWorkflowPage() {
  const [sessions, setSessions] = useState<KilnSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/kiln-sessions`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setSessions)
      .catch(() => setError('Could not load kiln sessions.'))
      .finally(() => setLoading(false));
  }, []);

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      loading: 'var(--clay)',
      firing: '#ff9900',
      fired: '#00aa00',
    };
    return colors[status] || '#999';
  };

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
        Demo view — read-only.
      </div>

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '2rem' }}>Kiln Workflow</h1>

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <SkeletonGrid count={4} />
      ) : sessions.length === 0 ? (
        <p style={{ color: '#999' }}>No kiln sessions found.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {sessions.map((s) => (
            <div key={s.id} style={{ padding: '1.5rem', backgroundColor: 'white', border: `2px solid ${getStatusColor(s.status)}`, borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <Flame size={18} color={getStatusColor(s.status)} />
                <h3 style={{ fontWeight: 'bold' }}>{s.label || s.batch_code || 'Untitled batch'}</h3>
              </div>
              {s.fired_at && <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Fired: {new Date(s.fired_at).toLocaleDateString()}</p>}
              {s.morning_check_result && (
                <p style={{ color: s.morning_check_result === 'ok' ? '#00aa00' : '#c33', fontSize: '0.875rem', marginBottom: '0.5rem', textTransform: 'capitalize' }}>
                  Morning check: {s.morning_check_result}
                </p>
              )}
              {s.misfire_notes && (
                <p style={{ padding: '0.5rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', fontSize: '0.8rem', marginBottom: '0.5rem' }}>{s.misfire_notes}</p>
              )}
              <div style={{ display: 'inline-block', padding: '0.25rem 0.75rem', backgroundColor: getStatusColor(s.status), color: 'white', borderRadius: '9999px', fontSize: '0.75rem', textTransform: 'capitalize' }}>
                {s.status}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
