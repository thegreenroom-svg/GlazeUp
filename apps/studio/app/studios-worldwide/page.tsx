'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe, Flame } from 'lucide-react';

interface Studio {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  public_bio: string | null;
  instagram_handle: string | null;
  website_url: string | null;
  shared_this_month: number;
}

export default function StudiosWorldwidePage() {
  const [studios, setStudios] = useState<Studio[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/studios-worldwide`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { setStudios(d.studios || []); setNote(d.note); })
      .catch(() => setError('Could not load the directory.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '650px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Studios Worldwide</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Real studios on the network who&apos;ve opted into the public directory.
      </p>

      {loading && <p style={{ color: '#666' }}>Loading...</p>}
      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px' }}>{error}</div>}
      {note && <p style={{ color: '#999', fontSize: '0.9rem' }}>{note}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {studios.map((s) => (
          <div key={s.id} style={{ padding: '0.9rem', border: '1px solid #eee', borderRadius: '10px', backgroundColor: 'white' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{s.name}</p>
                {(s.city || s.country) && (
                  <p style={{ fontSize: '0.8rem', color: '#999' }}>{[s.city, s.country].filter(Boolean).join(', ')}</p>
                )}
              </div>
              {s.shared_this_month > 0 && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--clay)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  <Flame size={13} /> {s.shared_this_month} shared this month
                </span>
              )}
            </div>
            {s.public_bio && <p style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.4rem' }}>{s.public_bio}</p>}
            {(s.instagram_handle || s.website_url) && (
              <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.4rem', fontSize: '0.78rem' }}>
                {s.instagram_handle && <span style={{ color: 'var(--clay)' }}>@{s.instagram_handle}</span>}
                {s.website_url && <a href={s.website_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Globe size={12} /> Website</a>}
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
