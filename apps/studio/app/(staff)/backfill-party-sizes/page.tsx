'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader, CheckCircle2, AlertTriangle } from 'lucide-react';

interface BackfillResult {
  recovered: number;
  not_found: number;
  errored: number;
  total: number;
  errors: { booking_code: string; error: string }[];
}

export default function BackfillPartySizesPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/backfill-party-sizes`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '520px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Recover Party Sizes</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Runs the real recovery (verified on Tom Ashton&apos;s booking) across every real booking missing a party size. Real Square lookups, ~275 of them, paced — takes about 40 seconds.
      </p>

      {!result && !running && (
        <button
          onClick={run}
          style={{ width: '100%', padding: '1rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '10px', fontSize: '1.05rem', fontWeight: 700, cursor: 'pointer' }}
        >
          Run the real backfill
        </button>
      )}

      {running && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '1.2rem', backgroundColor: '#fdf6e3', borderRadius: '10px', color: '#8a6a20' }}>
          <Loader size={20} /> Working through ~275 real bookings — don&apos;t close this tab...
        </div>
      )}

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {result && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '1.2rem', backgroundColor: '#eafaf0', borderRadius: '10px', color: '#1a8a3c', marginBottom: '1rem' }}>
            <CheckCircle2 size={22} />
            <div>
              <p style={{ fontWeight: 700 }}>Done</p>
              <p style={{ fontSize: '0.85rem' }}>{result.recovered} recovered · {result.not_found} had nothing to recover · {result.errored} errored · {result.total} checked</p>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div style={{ padding: '0.9rem', backgroundColor: '#fdf6e3', borderRadius: '8px', fontSize: '0.82rem' }}>
              <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>First {result.errors.length} real errors:</p>
              {result.errors.map((e, i) => (
                <p key={i} style={{ color: '#8a6a20', marginBottom: '0.2rem' }}>{e.booking_code}: {e.error}</p>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
