'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Loader, CheckCircle2, AlertTriangle } from 'lucide-react';

interface BackfillStatus {
  running: boolean;
  done: boolean;
  recovered: number;
  not_found: number;
  errored: number;
  total: number;
  checked: number;
  errors: { booking_code: string; error: string }[];
  startedError: string | null;
}

export default function BackfillPartySizesPage() {
  const [status, setStatus] = useState<BackfillStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = () => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/backfill-party-sizes/status`);
        const data: BackfillStatus = await res.json();
        setStatus(data);
        if (data.done && pollRef.current) {
          clearInterval(pollRef.current);
        }
      } catch {
        // A single missed poll isn't fatal -- it just tries again in 2s.
        // Only stop polling on the job actually reporting done.
      }
    }, 2000);
  };

  const run = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/backfill-party-sizes`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start');
      setStatus({ running: true, done: false, recovered: 0, not_found: 0, errored: 0, total: 0, checked: 0, errors: [], startedError: null });
      poll();
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setStarting(false);
    }
  };

  const pct = status && status.total > 0 ? Math.round((status.checked / status.total) * 100) : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '520px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Recover Party Sizes</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Runs the real recovery (verified on Tom Ashton&apos;s booking) across every real booking missing a party size. Runs in the background now — checks in every 2 seconds, so a dropped connection on your end won&apos;t lose the run.
      </p>

      {!status && (
        <button
          onClick={run}
          disabled={starting}
          style={{ width: '100%', padding: '1rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '10px', fontSize: '1.05rem', fontWeight: 700, cursor: starting ? 'not-allowed' : 'pointer', opacity: starting ? 0.7 : 1 }}
        >
          {starting ? 'Starting...' : 'Run the real backfill'}
        </button>
      )}

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {status && !status.done && (
        <div style={{ padding: '1.2rem', backgroundColor: '#fdf6e3', borderRadius: '10px', color: '#8a6a20' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.7rem' }}>
            <Loader size={20} /> Running in the background — {status.checked} of {status.total || '?'} checked
          </div>
          {status.total > 0 && (
            <div style={{ height: 8, backgroundColor: '#f0e0b0', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#e0a020', transition: 'width 0.3s' }} />
            </div>
          )}
          <p style={{ fontSize: '0.78rem', marginTop: '0.5rem' }}>Feel free to leave this page — it keeps running on the server either way.</p>
        </div>
      )}

      {status && status.done && (
        <>
          {status.startedError ? (
            <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <AlertTriangle size={18} /> {status.startedError}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '1.2rem', backgroundColor: '#eafaf0', borderRadius: '10px', color: '#1a8a3c', marginBottom: '1rem' }}>
              <CheckCircle2 size={22} />
              <div>
                <p style={{ fontWeight: 700 }}>Done</p>
                <p style={{ fontSize: '0.85rem' }}>{status.recovered} recovered · {status.not_found} had nothing to recover · {status.errored} errored · {status.total} checked</p>
              </div>
            </div>
          )}

          {status.errors.length > 0 && (
            <div style={{ padding: '0.9rem', backgroundColor: '#fdf6e3', borderRadius: '8px', fontSize: '0.82rem' }}>
              <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>First {status.errors.length} real errors:</p>
              {status.errors.map((e, i) => (
                <p key={i} style={{ color: '#8a6a20', marginBottom: '0.2rem' }}>{e.booking_code}: {e.error}</p>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
