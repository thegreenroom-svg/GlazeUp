'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PageHeader, StatusBlock } from '@/components/PageStatus';
import { AlertTriangle } from 'lucide-react';

interface Item {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  price_cents: number | null;
  image_url: string | null;
  stock_count: number | null;
}

interface Catalogue {
  items: Item[];
  by_category: Record<string, Item[]>;
  categories: string[];
  total: number;
  low_stock: Item[];
  out_of_stock_count: number;
}

export default function CataloguePage() {
  const [data, setData] = useState<Catalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<string>('all');

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/catalogue`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load the catalogue.'))
      .finally(() => setLoading(false));
  }, []);

  const shown = data ? (cat === 'all' ? data.items : data.by_category[cat] || []) : [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '700px' }}>
      <PageHeader title="Catalogue" subtitle="Bisque shapes available to paint, and what&apos;s left in stock." />

      <StatusBlock loading={loading} error={error} />

      {data && data.total === 0 && (
        <p style={{ color: '#999', fontSize: '0.9rem' }}>No catalogue items set up yet.</p>
      )}

      {data && data.total > 0 && (
        <>
          {data.low_stock.length > 0 && (
            <div style={{ padding: '0.8rem', backgroundColor: '#fdf6e3', borderRadius: '8px', marginBottom: '1.25rem' }}>
              <p style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                <AlertTriangle size={15} color="#b8860b" /> Running low
              </p>
              <p style={{ fontSize: '0.85rem', color: '#666' }}>
                {data.low_stock.map((i) => `${i.name} (${i.stock_count})`).join(', ')}
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
            {['all', ...data.categories].map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                style={{
                  padding: '0.35rem 0.7rem', borderRadius: '999px', border: 'none', cursor: 'pointer',
                  fontSize: '0.8rem', textTransform: 'capitalize',
                  backgroundColor: cat === c ? 'var(--clay)' : '#f0f0f0',
                  color: cat === c ? 'white' : '#444',
                }}
              >
                {c}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.7rem' }}>
            {shown.map((i) => (
              <div key={i.id} style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'white' }}>
                {i.image_url && (
                  <img src={i.image_url} alt={i.name} style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block' }} />
                )}
                <div style={{ padding: '0.6rem' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.85rem' }}>{i.name}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                    {i.price_cents != null && (
                      <span style={{ fontSize: '0.8rem' }}>£{(i.price_cents / 100).toFixed(2)}</span>
                    )}
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 600,
                      color: (i.stock_count ?? 0) === 0 ? '#c33' : (i.stock_count ?? 0) <= 3 ? '#b8860b' : '#1a8a3c',
                    }}>
                      {(i.stock_count ?? 0) === 0 ? 'out' : `${i.stock_count} left`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
