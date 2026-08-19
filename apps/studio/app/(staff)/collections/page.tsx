'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PageHeader, StatusBlock } from '@/components/PageStatus';

interface Piece {
  id: string;
  piece_type: string | null;
  status: string | null;
  description: string | null;
  reference_photo_url: string | null;
  created_at: string;
}

interface Collection {
  name: string;
  pieces: Piece[];
  piece_count: number;
  first: string;
  last: string;
}

export default function CollectionsPage() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/collections`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCollections(d.collections || []))
      .catch(() => setError('Could not load collections.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '1.5rem 1.25rem', maxWidth: '700px', margin: '0 auto' }}>
      <PageHeader title="Collections" subtitle="Everything a customer has made here, across every visit." />

      <StatusBlock loading={loading} error={error} />

      {!loading && !error && collections.length === 0 && (
        <p style={{ color: '#999', fontSize: '0.9rem' }}>No collections yet.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {collections.map((c) => {
          const isOpen = open === c.name;
          const multiVisit = c.first.slice(0, 10) !== c.last.slice(0, 10);
          return (
            <div key={c.name} style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden', backgroundColor: 'white' }}>
              <button
                onClick={() => setOpen(isOpen ? null : c.name)}
                style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem 1rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <div>
                  <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{c.name}</p>
                  <p style={{ fontSize: '0.75rem', color: '#999' }}>
                    {multiVisit
                      ? `${new Date(c.first).toLocaleDateString()} – ${new Date(c.last).toLocaleDateString()}`
                      : new Date(c.last).toLocaleDateString()}
                  </p>
                </div>
                <span style={{ padding: '0.15rem 0.6rem', borderRadius: '999px', backgroundColor: 'var(--clay)', color: 'white', fontSize: '0.8rem', fontWeight: 600 }}>
                  {c.piece_count}
                </span>
              </button>

              {isOpen && (
                <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid #f0f0f0' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem', marginTop: '0.7rem' }}>
                    {c.pieces.map((p) => (
                      <div key={p.id} style={{ border: '1px solid #f2f2f2', borderRadius: '6px', overflow: 'hidden' }}>
                        {p.reference_photo_url ? (
                          <img src={p.reference_photo_url} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <div style={{ height: 90, backgroundColor: '#f7f7f7' }} />
                        )}
                        <div style={{ padding: '0.4rem' }}>
                          <p style={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.description || p.piece_type || 'Piece'}
                          </p>
                          <p style={{ fontSize: '0.68rem', color: '#999', textTransform: 'capitalize' }}>
                            {(p.status || '').replace(/_/g, ' ')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
