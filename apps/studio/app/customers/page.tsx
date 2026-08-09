'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone } from 'lucide-react';
import { SkeletonGrid } from '@/components/Skeleton';

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  tier: string;
  loyalty_points: number;
  visit_count: number;
  total_spend_cents: number;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/customers`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setCustomers)
      .catch(() => setError('Could not load customers.'))
      .finally(() => setLoading(false));
  }, []);

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').toLowerCase().includes(search.toLowerCase())
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

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '1rem' }}>Customers</h1>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, email, or phone..."
        style={{ width: '100%', maxWidth: '400px', padding: '0.6rem 0.9rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '1.5rem', fontSize: '0.9rem', boxSizing: 'border-box' }}
      />

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <SkeletonGrid count={6} />
      ) : filteredCustomers.length === 0 ? (
        <p style={{ color: '#999' }}>{customers.length === 0 ? 'No customers found.' : 'No customers match your search.'}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {filteredCustomers.map((c) => (
            <div key={c.id} style={{ padding: '1.5rem', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px' }}>
              <h3 style={{ fontWeight: 'bold', fontSize: '1.125rem', marginBottom: '0.75rem' }}>{c.name}</h3>
              {c.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: '#666', fontSize: '0.875rem' }}>
                  <Mail size={14} /> {c.email}
                </div>
              )}
              {c.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#666', fontSize: '0.875rem' }}>
                  <Phone size={14} /> {c.phone}
                </div>
              )}
              <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                <span style={{ textTransform: 'capitalize' }}>{c.tier} tier</span>
                <span>{c.visit_count} visits</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
