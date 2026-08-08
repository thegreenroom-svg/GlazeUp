'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Piece {
  id: string;
  piece_type: string;
  status: string;
  is_complete: boolean;
  created_at: string;
  scheduled_firing_date: string | null;
}

export default function PiecesPage() {
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
      .catch(() => setError('Could not load pieces.'))
      .finally(() => setLoading(false));
  }, []);

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

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '2rem' }}>Pieces</h1>

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <p style={{ color: '#666' }}>Loading...</p>
      ) : pieces.length === 0 ? (
        <p style={{ color: '#999' }}>No pieces found.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
          {pieces.map((piece) => (
            <div key={piece.id} style={{ padding: '1rem', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px' }}>
              <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'capitalize' }}>{piece.piece_type}</h3>
              <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.25rem', textTransform: 'capitalize' }}>Status: {piece.status.replace(/_/g, ' ')}</p>
              <p style={{ color: '#999', fontSize: '0.75rem' }}>{new Date(piece.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
