'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { motion } from 'framer-motion';
import { Plus, Loader, Flame } from 'lucide-react';

interface KilnBatch {
  id: string;
  batch_name: string;
  status: string;
  scheduled_date: string;
  pieces_count: number;
  temperature: number;
}

export default function KilnWorkflowPage() {
  const [batches, setBatches] = useState<KilnBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ batch_name: '', scheduled_date: '', temperature: 1200 });
  const supabase = useSupabaseClient();

  useEffect(() => {
    fetchBatches();
  }, []);

  const fetchBatches = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/kiln-batches`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setBatches(data);
      } else {
        setError('Failed to fetch kiln batches');
      }
    } catch (err) {
      setError('Error loading kiln batches');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/kiln-batches`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
        },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        setFormData({ batch_name: '', scheduled_date: '', temperature: 1200 });
        setShowForm(false);
        fetchBatches();
      }
    } catch (err) {
      setError('Failed to create batch');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      scheduled: '#0066cc',
      firing: '#ff9900',
      cooling: '#ff6600',
      complete: '#00aa00',
    };
    return colors[status] || '#999';
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold' }}>Kiln Workflow</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#ff9900',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <Plus size={20} /> New Batch
        </button>
      </div>

      {showForm && (
        <motion.form
          onSubmit={handleCreateBatch}
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
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Batch Name</label>
            <input
              type="text"
              value={formData.batch_name}
              onChange={(e) => setFormData({ ...formData, batch_name: e.target.value })}
              placeholder="Batch A-001..."
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
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Scheduled Date</label>
            <input
              type="date"
              value={formData.scheduled_date}
              onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })}
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
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>Temperature (°C)</label>
            <input
              type="number"
              value={formData.temperature}
              onChange={(e) => setFormData({ ...formData, temperature: parseInt(e.target.value) })}
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
            <button type="submit" style={{ flex: 1, padding: '0.75rem', backgroundColor: '#ff9900', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {batches.length === 0 ? (
            <p style={{ color: '#666' }}>No kiln batches scheduled yet.</p>
          ) : (
            batches.map((batch) => (
              <motion.div
                key={batch.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  padding: '1.5rem',
                  backgroundColor: '#f9f9f9',
                  border: `2px solid ${getStatusColor(batch.status)}`,
                  borderRadius: '8px',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <Flame size={18} color={getStatusColor(batch.status)} />
                  <h3 style={{ fontWeight: 'bold' }}>{batch.batch_name}</h3>
                </div>
                <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Scheduled: {new Date(batch.scheduled_date).toLocaleDateString()}
                </p>
                <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Temperature: {batch.temperature}°C
                </p>
                <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Pieces: {batch.pieces_count}
                </p>
                <div
                  style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.75rem',
                    backgroundColor: getStatusColor(batch.status),
                    color: 'white',
                    borderRadius: '9999px',
                    fontSize: '0.75rem',
                    fontWeight: '500',
                    textTransform: 'capitalize',
                  }}
                >
                  {batch.status}
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}
    </motion.div>
  );
}
