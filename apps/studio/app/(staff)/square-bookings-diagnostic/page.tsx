'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface SummaryBooking {
  id: string;
  status: string;
  start_at: string;
  customer_id: string | null;
  customer_note: string | null;
  seller_note: string | null;
  segment_count: number;
}

// Purely investigative -- see the note in backend/spec-routes-2.js on
// registerSquareBookingsDiagnosticRoute. Answers the real open question:
// how does this business's actual Square Appointments booking widget
// encode party size (and anything else needed) for a real table booking?
// Square Appointments has no native 'party size' field, so this shows the
// true raw shape rather than guessing -- not linked from any nav menu,
// reached directly by URL while we look at real data together.
export default function SquareBookingsDiagnosticPage() {
  const [summary, setSummary] = useState<SummaryBooking[]>([]);
  const [sampleRaw, setSampleRaw] = useState<any[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [bookingCount, setBookingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [pulledAt, setPulledAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDiagnostic(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/square-diagnostic`);
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || 'Could not load');
        setDiagnostic(d.diagnostic || null);
        setSummary([]);
        setSampleRaw([]);
        return;
      }
      setSummary(d.all_bookings_summary || []);
      setSampleRaw(d.sample_raw || []);
      setLocationId(d.location_id || null);
      setBookingCount(d.booking_count || 0);
      setPulledAt(d.pulled_at || null);
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.3rem' }}>Square Appointments — Bookings Diagnostic</h1>
      <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Real bookings from Square Appointments, from 9 Aug (the last known real sync) onward. Read-only.
        The question this answers: how is party size (and anything else needed) actually encoded on a real booking?
      </p>

      <button
        onClick={load}
        disabled={loading}
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '1.25rem' }}
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Loading...' : 'Refresh'}
      </button>

      {pulledAt && !loading && (
        <p style={{ color: '#999', fontSize: '0.75rem', marginBottom: '1rem' }}>
          Pulled {new Date(pulledAt).toLocaleTimeString()} · location {locationId || '—'} · {bookingCount} booking{bookingCount === 1 ? '' : 's'}
        </p>
      )}

      {error && (
        <div style={{ padding: '0.9rem', backgroundColor: '#fee', color: '#c33', borderRadius: '6px', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <AlertCircle size={18} /> {error}
          </div>
          {diagnostic && (
            <div style={{ marginTop: '0.7rem', paddingTop: '0.7rem', borderTop: '1px solid #f0c0c0' }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 700 }}>Failed at step: {diagnostic.step}</p>
              <p style={{ fontSize: '0.78rem' }}>Real HTTP status: {diagnostic.status} {diagnostic.statusText}</p>
              {diagnostic.url && <p style={{ fontSize: '0.72rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>{diagnostic.url}</p>}
              {diagnostic.body && (
                <pre style={{ fontSize: '0.7rem', marginTop: '0.5rem', padding: '0.6rem', backgroundColor: '#fff', borderRadius: '4px', overflowX: 'auto' }}>
                  {JSON.stringify(diagnostic.body, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      {!loading && !error && summary.length === 0 && (
        <p style={{ color: '#999' }}>No real Square Appointments bookings found in this window.</p>
      )}

      {!loading && summary.length > 0 && (
        <>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.6rem' }}>All bookings (summary)</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {summary.map((b) => (
              <div key={b.id} style={{ padding: '0.7rem 0.9rem', border: '1px solid #ddd', borderRadius: '8px', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>{new Date(b.start_at).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ color: '#666' }}>{b.status}</span>
                </div>
                <p style={{ color: '#999', fontFamily: 'monospace', fontSize: '0.7rem', marginTop: '0.2rem' }}>{b.id}</p>
                <p style={{ color: '#555', marginTop: '0.2rem' }}>{b.segment_count} segment{b.segment_count === 1 ? '' : 's'}</p>
                {b.customer_note && <p style={{ color: '#8a5a00', marginTop: '0.2rem' }}><strong>customer_note:</strong> {b.customer_note}</p>}
                {b.seller_note && <p style={{ color: '#8a5a00', marginTop: '0.2rem' }}><strong>seller_note:</strong> {b.seller_note}</p>}
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.6rem' }}>Full raw shape (first {sampleRaw.length})</h2>
          <p style={{ color: '#999', fontSize: '0.78rem', marginBottom: '0.7rem' }}>Completely unprocessed -- tap to expand a booking and see everything Square actually sent back.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {sampleRaw.map((b) => (
              <div key={b.id} style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
                <button
                  onClick={() => toggle(b.id)}
                  style={{ width: '100%', textAlign: 'left', padding: '0.7rem 0.9rem', background: 'white', border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  {expanded.has(b.id) ? '▼' : '▶'} {b.customer_name_resolved || '(no name resolved)'} — {new Date(b.start_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </button>
                {expanded.has(b.id) && (
                  <pre style={{ margin: 0, padding: '0.9rem', backgroundColor: '#f7f7f5', fontSize: '0.72rem', overflowX: 'auto', borderTop: '1px solid #eee' }}>
                    {JSON.stringify(b, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
