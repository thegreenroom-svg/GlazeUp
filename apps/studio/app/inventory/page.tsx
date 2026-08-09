'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Package, AlertCircle, CheckCircle } from 'lucide-react';
import { SkeletonGrid } from '@/components/Skeleton';

interface Piece {
  id: string;
  piece_type: string;
  status: string;
  is_complete: boolean;
}

export default function InventoryPage() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/pieces`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setPieces)
      .catch(() => setError('Could not load inventory.'))
      .finally(() => setLoading(false));
  }, []);

  const inProgress = pieces.filter((p) => !p.is_complete).length;
  const complete = pieces.filter((p) => p.is_complete).length;

  const StatCard = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) => (
    <div style={{ padding: '1.5rem', backgroundColor: 'white', border: `2px solid ${color}`, borderRadius: '8px', textAlign: 'center' }}>
      <Icon size={32} color={color} style={{ margin: '0 auto 0.5rem' }} />
      <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{label}</p>
      <h3 style={{ fontSize: '2rem', fontWeight: 'bold', color }}>{value}</h3>
    </div>
  );

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

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '2rem' }}>Inventory</h1>

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <SkeletonGrid count={3} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <StatCard icon={Package} label="Total Pieces" value={pieces.length} color="#0066cc" />
          <StatCard icon={AlertCircle} label="In Progress" value={inProgress} color="#ff9900" />
          <StatCard icon={CheckCircle} label="Complete" value={complete} color="#00aa00" />
        </div>
      )}
    </motion.div>
  );
}
