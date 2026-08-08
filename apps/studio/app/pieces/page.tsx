'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { motion } from 'framer-motion';
import { Plus, Loader } from 'lucide-react';

interface Piece {
  id: string;
  customer_id: string;
  shape: string;
  glaze_color: string;
  status: string;
  created_at: string;
}

export default function PiecesPage() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ shape: '', glaze_color: '' });
  const supabase = useSupabaseClient();

  useEffect(() => {
    fetchPieces();
  }, []);

  const fetchPieces = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pieces`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setPieces(data);
      } else {
        setError('Failed to fetch pieces');
      }
    } catch (err) {
      setError('Error loading pieces');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePiece = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pieces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
        },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        setFormData({ shape: '', glaze_color: '' });
        setShowForm(false);
        fetchPieces();
      }
    } catch (err) {
      setError('Failed to create piece');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>Pieces</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#0066cc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <Plus size={20} /> New Piece
        </button>
      </div>

      {showForm && (
        <motion.form
          onSubmit={handleCreatePiece}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '1.5rem',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            marginBottom: '2rem',
            maxWidth: '400px',
          }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Shape</label>
            <input
              type="text"
              value={formData.shape}
              onChange={(e) => setFormData({ ...formData, shape: e.target.value })}
              placeholder="Bowl, mug, vase..."
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box',
              }}
              required
            />
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Glaze Color</label>
            <input
              type="text"
              value={formData.glaze_color}
              onChange={(e) => setFormData({ ...formData, glaze_color: e.target.value })}
              placeholder="Cobalt blue, terracotta..."
              style={{
                width: '100%',
                padding: '0.75rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                boxSizing: 'border-box',
              }}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" style={{ flex: 1, padding: '0.75rem', backgroundColor: '#0066cc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Create
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, padding: '0.75rem', backgroundColor: '#eee', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </motion.form>
      )}

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <Loader style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
          {pieces.length === 0 ? (
            <p style={{ color: '#666' }}>No pieces yet. Create one to get started!</p>
          ) : (
            pieces.map((piece) => (
              <motion.div
                key={piece.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  padding: '1rem',
                  backgroundColor: '#f9f9f9',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
              >
                <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{piece.shape}</h3>
                <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Glaze: {piece.glaze_color}</p>
                <p style={{ color: '#999', fontSize: '0.75rem' }}>Status: {piece.status}</p>
              </motion.div>
            ))
          )}
        </div>
      )}
    </motion.div>
  );
}
