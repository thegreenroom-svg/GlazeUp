'use client';

export const dynamic = 'force-dynamic';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { PageHeader } from '@/components/PageStatus';

interface Booking {
  booking_code: string;
  customer_name: string;
  session_start: string;
  table_number: string | null;
  party_size: number | null;
  current_stage: string;
}

function MyBookingsInner() {
  const params = useSearchParams();
  const [name, setName] = useState(params.get('name') || '');
  const [data, setData] = useState<{ upcoming: Booking[]; past: Booking[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (n: string) => {
    if (!n.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/my-bookings/${encodeURIComponent(n.trim())}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError('Could not load bookings.');
    } finally {
      setLoading(false);
    }
  };

  const Row = ({ b }: { b: Booking }) => (
    <div style={{ padding: '0.7rem 0.9rem', border: '1px solid #eee', borderRadius: '8px', marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{new Date(b.session_start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
        <span style={{ fontSize: '0.75rem', color: 'var(--stone)', textTransform: 'capitalize' }}>{b.current_stage}</span>
      </div>
      <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.15rem' }}>
        {new Date(b.session_start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        {b.table_number ? ` · Table ${b.table_number}` : ''}
        {b.party_size ? ` · ${b.party_size} people` : ''}
      </p>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '520px' }}>
      <PageHeader title="My Bookings" subtitle="Past and upcoming visits." />

      <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
        Matched by name for now — the real booking data doesn&apos;t reliably carry phone or email on older rows, so name is the honest current match method.
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.5rem' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search(name)}
          placeholder="Your name"
          style={{ flex: 1, padding: '0.55rem 0.8rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem' }}
        />
        <button
          onClick={() => search(name)}
          style={{ padding: '0.55rem 0.9rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <Search size={15} /> Find
        </button>
      </div>

      {loading && <p style={{ color: '#666' }}>Looking...</p>}
      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px' }}>{error}</div>}

      {data && (
        <>
          {data.upcoming.length > 0 && (
            <>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Upcoming</h2>
              {data.upcoming.map((b) => <Row key={b.booking_code} b={b} />)}
            </>
          )}
          {data.past.length > 0 && (
            <>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginTop: '1rem', marginBottom: '0.5rem' }}>Past visits</h2>
              {data.past.map((b) => <Row key={b.booking_code} b={b} />)}
            </>
          )}
          {data.upcoming.length === 0 && data.past.length === 0 && (
            <p style={{ color: '#999', fontSize: '0.9rem' }}>No bookings found for that name.</p>
          )}
        </>
      )}
    </motion.div>
  );
}

export default function MyBookingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <MyBookingsInner />
    </Suspense>
  );
}
