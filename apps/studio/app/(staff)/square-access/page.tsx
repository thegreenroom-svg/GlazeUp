'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { PageShell } from '@/components/PageShell';
import { Check, X } from 'lucide-react';

// Table sync has now failed twice for two different reasons -- a limit Square
// rejects, then a scope Square never granted -- and each diagnosis cost a
// round trip of button, screenshot, guess. This turns that into a fact on a
// screen. Read-only: every probe is a GET or a search with a limit of one.

interface Probe { label: string; needs: string; ok: boolean; code?: string; detail?: string }
interface Result {
  token_expired: boolean;
  table_names_available: boolean;
  missing_scopes: string[];
  results: Probe[];
  error?: string;
}

export default function SquareAccessPage() {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/diagnostics/square-access`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run the check');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <PageShell title="Square access" subtitle="What this app is allowed to read">
      {loading && <p style={{ fontSize: '0.85rem', color: '#888' }}>Checking...</p>}
      {error && <p style={{ fontSize: '0.85rem', color: '#c0392b' }}>{error}</p>}

      {data && !loading && (
        <>
          {data.token_expired && (
            <p style={{ fontSize: '0.85rem', color: '#c0392b', marginBottom: '0.75rem' }}>
              The Square connection has expired — it needs reconnecting.
            </p>
          )}

          {/* The headline answers the question that keeps coming up, rather
              than making someone read six rows to work it out. */}
          <div style={{
            padding: '0.8rem', borderRadius: 10, marginBottom: '1rem',
            backgroundColor: data.table_names_available ? '#F1F8F1' : '#FFF6E8',
            border: `1px solid ${data.table_names_available ? '#9CC79C' : '#F0C987'}`,
          }}>
            <p style={{ fontSize: '0.88rem', fontWeight: 700, color: data.table_names_available ? '#2E7D32' : '#7A5B00' }}>
              {data.table_names_available
                ? 'Table names can be read — Sync tables should work'
                : 'Table names cannot be read'}
            </p>
            {!data.table_names_available && (
              <p style={{ fontSize: '0.78rem', color: '#7A5B00', marginTop: '0.2rem' }}>
                Square hasn&apos;t granted this app the permission. That needs re-authorising in Square — no code change will fix it.
              </p>
            )}
          </div>

          {data.results.map((r) => (
            <div key={r.label} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.6rem 0', borderBottom: '1px solid #f2f2f2' }}>
              {r.ok
                ? <Check size={16} style={{ color: '#2E7D32', flexShrink: 0, marginTop: 2 }} />
                : <X size={16} style={{ color: '#C0392B', flexShrink: 0, marginTop: 2 }} />}
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.84rem', fontWeight: 600 }}>{r.label}</p>
                <p style={{ fontSize: '0.72rem', color: '#888' }}>{r.needs}</p>
                {r.detail && (
                  <p style={{ fontSize: '0.74rem', color: r.ok ? '#666' : '#C0392B', marginTop: '0.15rem' }}>{r.detail}</p>
                )}
              </div>
            </div>
          ))}

          <button
            onClick={load}
            style={{ marginTop: '1rem', padding: '0.5rem 0.85rem', borderRadius: 8, border: '1px solid #ddd', background: 'white', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Check again
          </button>
        </>
      )}
    </PageShell>
  );
}
