'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface DiagOrder {
  id: string;
  ticket_name: string | null;
  reference_id: string | null;
  state: string;
  created_at: string;
  updated_at: string;
  item_count: number;
  item_names: string[];
  total_gbp: number | null;
  source: string | null;
}

// Purely investigative -- see the note in backend/spec-routes-2.js on
// registerSquareOpenOrdersDiagnosticRoute. Answers one question: do real
// open Square tickets carry anything (ticket_name especially) that would
// let a table/booking be matched to its live order? Not linked from any
// nav menu -- reached directly by URL while we look at real data together.
export default function SquareDiagnosticPage() {
  const [orders, setOrders] = useState<DiagOrder[]>([]);
  const [hasAnyTicketName, setHasAnyTicketName] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pulledAt, setPulledAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/square/open-orders-diagnostic`);
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || 'Could not load');
        setOrders([]);
        return;
      }
      setOrders(d.orders || []);
      setHasAnyTicketName(!!d.has_any_ticket_name);
      setPulledAt(d.pulled_at || null);
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.3rem' }}>Square Open Orders — Diagnostic</h1>
      <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
        Real open tickets on Square right now, today only. Read-only — nothing here writes anything.
        The question this answers: does <code>ticket_name</code> tell us which table an order belongs to?
      </p>

      <button
        onClick={load}
        disabled={loading}
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '1.25rem' }}
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {loading ? 'Loading...' : 'Refresh'}
      </button>

      {pulledAt && !loading && (
        <p style={{ color: '#999', fontSize: '0.75rem', marginBottom: '1rem' }}>Pulled {new Date(pulledAt).toLocaleTimeString()}</p>
      )}

      {error && (
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.9rem', backgroundColor: '#fee', color: '#c33', borderRadius: '6px', marginBottom: '1.25rem' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {!loading && !error && (
        <div style={{ padding: '0.9rem', borderRadius: '6px', marginBottom: '1.25rem', backgroundColor: hasAnyTicketName ? '#e8f5e9' : '#fff3e0', border: `1px solid ${hasAnyTicketName ? '#66bb6a' : '#ffb74d'}` }}>
          <strong>{hasAnyTicketName ? '✓ At least one open order has a ticket name set.' : '✗ None of these open orders have a ticket name set.'}</strong>
          <p style={{ fontSize: '0.8rem', marginTop: '0.3rem', color: '#555' }}>
            {hasAnyTicketName
              ? 'Worth checking whether the ones that do actually name the table (e.g. "Table 3") consistently.'
              : "Without a ticket name (or something else identifying), Square's open orders can't currently be matched to a specific table automatically."}
          </p>
        </div>
      )}

      {!loading && !error && orders.length === 0 && (
        <p style={{ color: '#999' }}>No open orders on Square right now.</p>
      )}

      {!loading && orders.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {orders.map((o) => (
            <div key={o.id} style={{ padding: '0.9rem', border: '1px solid #ddd', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontWeight: 700 }}>
                  {o.ticket_name ? `"${o.ticket_name}"` : <span style={{ color: '#999', fontWeight: 400 }}>(no ticket name)</span>}
                </span>
                <span style={{ color: '#666', fontSize: '0.85rem' }}>{o.total_gbp !== null ? `£${o.total_gbp.toFixed(2)}` : '—'}</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#999', fontFamily: 'monospace', marginBottom: '0.4rem' }}>{o.id}</p>
              {o.reference_id && <p style={{ fontSize: '0.78rem', color: '#555' }}>reference_id: {o.reference_id}</p>}
              <p style={{ fontSize: '0.78rem', color: '#555' }}>
                {o.item_count} item{o.item_count === 1 ? '' : 's'}
                {o.item_names.length > 0 && ` — ${o.item_names.join(', ')}`}
              </p>
              <p style={{ fontSize: '0.72rem', color: '#aaa', marginTop: '0.3rem' }}>
                {o.state} · opened {new Date(o.created_at).toLocaleTimeString()} · source: {o.source || '—'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
