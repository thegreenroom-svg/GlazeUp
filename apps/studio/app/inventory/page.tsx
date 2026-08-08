'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { motion } from 'framer-motion';
import { Package, AlertCircle, CheckCircle } from 'lucide-react';

interface InventoryStats {
  total_pieces: number;
  pieces_in_progress: number;
  pieces_completed: number;
  pieces_ready_pickup: number;
  recent_pieces: any[];
}

export default function InventoryPage() {
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = useSupabaseClient();

  useEffect(() => {
    fetchInventoryStats();
  }, []);

  const fetchInventoryStats = async () => {
    try {
      setLoading(true);
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookings`, {
        headers: {
          'Authorization': `Bearer ${token || ''}`,
        },
      });

      if (response.ok) {
        const bookings = await response.json();
        
        // Calculate stats from bookings
        const stats: InventoryStats = {
          total_pieces: bookings.length,
          pieces_in_progress: bookings.filter((b: any) => b.status === 'in_progress').length,
          pieces_completed: bookings.filter((b: any) => b.status === 'completed').length,
          pieces_ready_pickup: bookings.filter((b: any) => b.status === 'ready_for_pickup').length,
          recent_pieces: bookings.slice(0, 5),
        };
        setStats(stats);
      } else {
        setError('Failed to fetch inventory data');
      }
    } catch (err) {
      setError('Error loading inventory');
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) => (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: '1.5rem',
        backgroundColor: 'white',
        border: `2px solid ${color}`,
        borderRadius: '8px',
        textAlign: 'center',
      }}
    >
      <Icon size={32} color={color} style={{ marginBottom: '0.5rem', marginLeft: 'auto', marginRight: 'auto' }} />
      <p style={{ color: '#666', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{label}</p>
      <h3 style={{ fontSize: '2rem', fontWeight: 'bold', color }}>{value}</h3>
    </motion.div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '2rem' }}>Inventory</h1>

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '2rem' }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p>Loading inventory data...</p>
        </div>
      ) : stats ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <StatCard icon={Package} label="Total Pieces" value={stats.total_pieces} color="#0066cc" />
            <StatCard icon={AlertCircle} label="In Progress" value={stats.pieces_in_progress} color="#ff9900" />
            <StatCard icon={CheckCircle} label="Completed" value={stats.pieces_completed} color="#00aa00" />
            <StatCard icon={Package} label="Ready for Pickup" value={stats.pieces_ready_pickup} color="#6600cc" />
          </div>

          <div style={{ backgroundColor: 'white', borderRadius: '8px', padding: '1.5rem', border: '1px solid #ddd' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Recent Pieces</h2>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #ddd' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600' }}>Customer</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600' }}>Party Size</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600' }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: '600' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_pieces.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: '#999' }}>
                        No recent pieces
                      </td>
                    </tr>
                  ) : (
                    stats.recent_pieces.map((piece: any) => (
                      <tr key={piece.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '0.75rem' }}>{piece.customer_name || 'Unknown'}</td>
                        <td style={{ padding: '0.75rem' }}>{piece.party_size}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.75rem',
                              backgroundColor: '#f0f0f0',
                              borderRadius: '9999px',
                              fontSize: '0.75rem',
                              textTransform: 'capitalize',
                            }}
                          >
                            {piece.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem' }}>{new Date(piece.scheduled_at).toLocaleDateString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </motion.div>
  );
}
