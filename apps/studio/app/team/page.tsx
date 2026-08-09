'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { SkeletonGrid } from '@/components/Skeleton';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  active: boolean;
}

export default function TeamPage() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/team`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setTeam)
      .catch(() => setError('Could not load team.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
      <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Demo view — read-only.
      </div>

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '2rem' }}>Team</h1>

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <SkeletonGrid count={4} />
      ) : team.length === 0 ? (
        <p style={{ color: '#999' }}>No team members found.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
          {team.map((m) => (
            <div key={m.id} style={{ padding: '1.25rem', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', opacity: m.active ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#eef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={20} color="#0066cc" />
                </div>
                <div>
                  <p style={{ fontWeight: '600' }}>{m.name}</p>
                  <p style={{ fontSize: '0.8rem', color: '#666' }}>{m.role}</p>
                </div>
              </div>
              {!m.active && <span style={{ fontSize: '0.7rem', color: '#999' }}>Inactive</span>}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
