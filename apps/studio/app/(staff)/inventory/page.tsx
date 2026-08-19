'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { PageShell } from '@/components/PageShell';
import { Search, Package } from 'lucide-react';

interface BisqueItem {
  item_name: string;
  category: string | null;
  price_cents: number | null;
}

// Real bisque stock, from the genuinely-populated Square catalog
// (square_items) -- NOT customers' painted pieces, which is what this
// page used to show by mistake. Per Daisy: "the girls look it up... if
// people want a Z or a letter A, they'll go and look on quickly before
// they check the stock room."
export default function InventoryPage() {
  const [items, setItems] = useState<BisqueItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (category) params.set('category', category);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/inventory/bisque?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setItems(d.items || []);
        if ((d.categories || []).length) setCategories(d.categories);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, category]);

  // Debounced so typing a search doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <PageShell title="Bisque Stock">
      
      <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        What we carry, straight from the Square catalogue. Search before checking the stock room.
      </p>

      <div style={{ position: 'relative', marginBottom: '0.7rem' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search — e.g. letter A, mug, vase"
          style={{ width: '100%', padding: '0.65rem 0.7rem 0.65rem 2.2rem', border: '1px solid #ddd', borderRadius: 8, fontSize: '0.9rem', color: '#333', backgroundColor: 'white', boxSizing: 'border-box' }}
        />
      </div>

      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        style={{ width: '100%', padding: '0.6rem 0.7rem', border: '1px solid #ddd', borderRadius: 8, fontSize: '0.88rem', marginBottom: '1.1rem', color: '#333', backgroundColor: 'white' }}
      >
        <option value="">All bisque categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c.replace(/^PB /, '')}</option>
        ))}
      </select>

      {loading && <p style={{ color: '#999', fontSize: '0.85rem' }}>Loading...</p>}

      {!loading && items.length === 0 && (
        <p style={{ color: '#999', fontSize: '0.9rem' }}>Nothing matching that.</p>
      )}

      {!loading && items.length > 0 && (
        <>
          <p style={{ fontSize: '0.75rem', color: '#999', marginBottom: '0.5rem' }}>{items.length} item{items.length === 1 ? '' : 's'}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {items.map((it, i) => (
              <div key={`${it.item_name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.65rem 0.8rem', backgroundColor: 'white', borderRadius: 10, boxShadow: '0 1px 4px rgba(43,39,36,0.07)' }}>
                <Package size={16} color="var(--clay)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--charcoal)' }}>{it.item_name}</p>
                  {it.category && <p style={{ fontSize: '0.72rem', color: '#999' }}>{it.category.replace(/^PB /, '')}</p>}
                </div>
                {it.price_cents != null && (
                  <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--clay)', flexShrink: 0 }}>
                    £{(it.price_cents / 100).toFixed(2)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
