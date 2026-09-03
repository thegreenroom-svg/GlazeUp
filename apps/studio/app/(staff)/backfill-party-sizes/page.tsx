'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import { PageShell } from '@/components/PageShell';
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

  const [notesResult, setNotesResult] = useState<{ recovered: number; not_found: number; total: number } | null>(null);
  const [notesRunning, setNotesRunning] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  const runNotesPass = async () => {
    setNotesRunning(true);
    setNotesError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/backfill-party-sizes-from-notes`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setNotesResult(data);
    } catch (err: any) {
      setNotesError(err.message || 'Something went wrong.');
    } finally {
      setNotesRunning(false);
    }
  };

  const pct = status && status.total > 0 ? Math.round((status.checked / status.total) * 100) : 0;

  return (
    <PageShell title="Recover Party Sizes">
      

      <div style={{ padding: '0.9rem', backgroundColor: 'white', border: '1px solid #eee', borderRadius: '10px', marginBottom: '1.25rem' }}>
        <p style={{ fontWeight: 600, fontSize: 'var(--text-md)', marginBottom: '0.4rem' }}>Real, authoritative — from booking notes</p>
        <p style={{ color: '#666', fontSize: 'var(--text-base)', marginBottom: '0.8rem' }}>
          Customers often state a headcount directly in their booking note ({'"'}6 people{'"'}, {'"'}party of 4{'"'}). Purely local, no live Square call, runs in a couple of seconds.
        </p>
        <button
          onClick={runNotesPass}
          disabled={notesRunning}
          style={{ width: '100%', padding: '0.7rem', backgroundColor: '#1a8a3c', color: 'white', border: 'none', borderRadius: '8px', fontSize: 'var(--text-md)', fontWeight: 600, cursor: notesRunning ? 'not-allowed' : 'pointer', opacity: notesRunning ? 0.7 : 1 }}
        >
          {notesRunning ? 'Checking notes...' : 'Recover from notes'}
        </button>
        {notesError && <p style={{ color: '#c33', fontSize: 'var(--text-sm)', marginTop: '0.5rem' }}>{notesError}</p>}
        {notesResult && (
          <p style={{ color: '#1a8a3c', fontSize: 'var(--text-base)', marginTop: '0.6rem', fontWeight: 600 }}>
            {notesResult.recovered} recovered from {notesResult.total} real bookings with a note
          </p>
        )}
      </div>

      <p style={{ fontWeight: 600, fontSize: 'var(--text-md)', marginBottom: '0.3rem' }}>Fallback — from catalog pricing tier</p>
      <p style={{ color: '#666', fontSize: 'var(--text-md)', marginBottom: '1.25rem' }}>
        A weaker proxy (which priced table size was booked, not a real stated headcount) — worth running on whatever&apos;s left after the notes pass above. Real Square lookups, runs in the background, checks in every 2 seconds.
      </p>

      {!status && (
        <button
          onClick={run}
          disabled={starting}
          style={{ width: '100%', padding: '1rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '10px', fontSize: 'var(--text-lg)', fontWeight: 700, cursor: starting ? 'not-allowed' : 'pointer', opacity: starting ? 0.7 : 1 }}
        >
          {starting ? 'Starting...' : 'Run the catalog-tier fallback'}
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
            <div style={{ height: 8, backgroundColor: '#f0e0b0', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#e0a020', transition: 'width 0.3s' }} />
            </div>
          )}
          <p style={{ fontSize: 'var(--text-sm)', marginTop: '0.5rem' }}>Feel free to leave this page — it keeps running on the server either way.</p>
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
                <p style={{ fontSize: 'var(--text-base)' }}>{status.recovered} recovered · {status.not_found} had nothing to recover · {status.errored} errored · {status.total} checked</p>
              </div>
            </div>
          )}

          {status.errors.length > 0 && (
            <div style={{ padding: '0.9rem', backgroundColor: '#fdf6e3', borderRadius: '8px', fontSize: 'var(--text-sm)' }}>
              <p style={{ fontWeight: 600, marginBottom: '0.4rem' }}>First {status.errors.length} real errors:</p>
              {status.errors.map((e, i) => (
                <p key={i} style={{ color: '#8a6a20', marginBottom: '0.2rem' }}>{e.booking_code}: {e.error}</p>
              ))}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
