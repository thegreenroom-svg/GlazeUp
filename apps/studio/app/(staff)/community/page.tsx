'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PageHeader, StatusBlock } from '@/components/PageStatus';
import { Heart, Star } from 'lucide-react';

interface Post {
  id: string;
  piece_type: string | null;
  photo_url: string | null;
  caption: string | null;
  made_by: string;
  likes_count: number | null;
  created_at: string;
  is_featured: boolean | null;
}

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/community`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setPosts(d.posts || []))
      .catch(() => setError('Could not load the feed.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '1.5rem 1.25rem', maxWidth: '700px', margin: '0 auto' }}>
      <PageHeader title="Community" subtitle="Pieces customers have chosen to share. First names only." />

      <StatusBlock loading={loading} error={error} />

      {!loading && !error && posts.length === 0 && (
        <p style={{ color: '#999', fontSize: '0.9rem' }}>Nothing shared to the feed yet.</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {posts.map((p) => (
          <div key={p.id} style={{ border: '1px solid #eee', borderRadius: '10px', overflow: 'hidden', backgroundColor: 'white' }}>
            {p.photo_url && (
              <img src={p.photo_url} alt={p.caption || 'Shared piece'} style={{ width: '100%', maxHeight: '320px', objectFit: 'cover', display: 'block' }} />
            )}
            <div style={{ padding: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                <p style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  Made by {p.made_by}
                  {p.is_featured && <Star size={13} color="#E8A03C" fill="#E8A03C" />}
                </p>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8rem', color: '#999' }}>
                  <Heart size={13} /> {p.likes_count || 0}
                </span>
              </div>
              {p.caption && <p style={{ fontSize: '0.85rem', color: '#444' }}>{p.caption}</p>}
              {p.piece_type && <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.2rem' }}>{p.piece_type}</p>}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
