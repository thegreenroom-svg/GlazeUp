'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PageHeader, StatusBlock } from '@/components/PageStatus';
import { Flame, PackageCheck } from 'lucide-react';

interface Notification {
  booking: string;
  type: 'firing' | 'ready';
  headline: string;
  message: string;
  updated_at: string;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/notifications`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setItems(d.notifications || []))
      .catch(() => setError('Could not load notifications.'))
      .finally(() => setLoading(false));
  }, []);

  const ready = items.filter((i) => i.type === 'ready');
  const firing = items.filter((i) => i.type === 'firing');

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '650px' }}>
      <PageHeader title="Customer Notifications" subtitle="What each customer would be told right now, worked out live from where their pieces actually are." />

      <StatusBlock loading={loading} error={error} />

      {!loading && !error && items.length === 0 && (
        <p style={{ color: '#999', fontSize: '0.9rem' }}>Nothing to tell anyone right now — no pieces in the kiln or waiting.</p>
      )}

      {ready.length > 0 && (
        <>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <PackageCheck size={18} color="#1a8a3c" /> Ready to collect ({ready.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {ready.map((n) => (
              <div key={n.booking} style={{ padding: '0.8rem', backgroundColor: '#eafaf0', borderRadius: '8px' }}>
                <p style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.2rem' }}>{n.booking}</p>
                <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{n.headline}</p>
                <p style={{ fontSize: '0.85rem', color: '#444', marginTop: '0.2rem' }}>{n.message}</p>
                {/^booking-/.test(n.booking) && (
                  <a href={`/bookings?code=${n.booking}`} style={{ display: 'inline-block', marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--clay)', fontWeight: 600, textDecoration: 'none' }}>
                    Open booking →
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {firing.length > 0 && (
        <>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Flame size={18} color="#b8860b" /> In the kiln ({firing.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {firing.map((n) => (
              <div key={n.booking} style={{ padding: '0.8rem', backgroundColor: '#fdf6e3', borderRadius: '8px' }}>
                <p style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.2rem' }}>{n.booking}</p>
                <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>{n.headline}</p>
                <p style={{ fontSize: '0.85rem', color: '#444', marginTop: '0.2rem' }}>{n.message}</p>
                {/^booking-/.test(n.booking) && (
                  <a href={`/bookings?code=${n.booking}`} style={{ display: 'inline-block', marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--clay)', fontWeight: 600, textDecoration: 'none' }}>
                    Open booking →
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
