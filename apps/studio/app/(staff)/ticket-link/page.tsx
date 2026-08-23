'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { PageShell } from '@/components/PageShell';

// Measures which rung of the matching ladder is actually available in this
// studio's real Square data, before a matcher gets built on an assumption
// about how staff ring things up. Read-only: reads Square and reads
// bookings, writes nothing anywhere.

interface Result {
  window_days: number;
  orders_scanned: number;
  bookings_in_window: number;
  appointments_with_a_square_customer: number;
  rung_1_customer: { orders_with_customer_id: number; of_those_matching_a_booking: number };
  rung_2_reference_id: { orders_with_reference_id: number };
  rung_3_digits: {
    orders_with_ticket_name: number;
    ticket_names_containing_digits: number;
    digits_matching_a_known_table: number;
  };
  orders_with_nothing_usable: number;
  sample_ticket_names: string[];
  error?: string;
}

export default function TicketLinkPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/diagnostics/ticket-link?days=${days}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Failed (${res.status})`);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not run the check');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—');

  return (
    <PageShell title="Ticket link check" subtitle="What can a booking be matched on?">
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.9rem' }}>
        {[1, 7, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              padding: '0.4rem 0.7rem', borderRadius: 8, cursor: 'pointer',
              border: days === d ? 'none' : '1px solid #ddd',
              background: days === d ? 'var(--clay)' : 'white',
              color: days === d ? 'white' : 'var(--charcoal)',
              fontSize: '0.8rem', fontWeight: 600,
            }}
          >
            {d === 1 ? 'Today' : `${d} days`}
          </button>
        ))}
      </div>

      {loading && <p style={{ fontSize: '0.85rem', color: '#888' }}>Reading Square...</p>}
      {error && <p style={{ fontSize: '0.85rem', color: '#c0392b' }}>{error}</p>}

      {data && !loading && (
        <>
          <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.9rem' }}>
            {data.orders_scanned} order{data.orders_scanned === 1 ? '' : 's'} · {data.bookings_in_window} booking{data.bookings_in_window === 1 ? '' : 's'} in the window
          </p>

          {/* Each rung reported as raw counts, not a verdict. The point is to
              look at the real numbers and then choose. */}
          <Rung
            n={1}
            title="Square customer on the ticket"
            note="Exact, and nobody has to type anything. Needs staff to attach the customer at the terminal."
            rows={[
              ['Orders carrying a customer', `${data.rung_1_customer.orders_with_customer_id} of ${data.orders_scanned} (${pct(data.rung_1_customer.orders_with_customer_id, data.orders_scanned)})`],
              ['Of those, matching an appointment', `${data.rung_1_customer.of_those_matching_a_booking}`],
              ['Appointments with a customer at all', `${data.appointments_with_a_square_customer}`],
            ]}
          />

          <Rung
            n={2}
            title="Reference on the order"
            note="Would let a code from the table card tie the ticket to the booking exactly."
            rows={[['Orders with a reference_id', `${data.rung_2_reference_id.orders_with_reference_id}`]]}
          />

          <Rung
            n={3}
            title="Digits in the ticket name"
            note="What happens today. Fails silently on names like 'L3' or 'main studio four b'."
            rows={[
              ['Orders with a ticket name', `${data.rung_3_digits.orders_with_ticket_name}`],
              ['Names containing digits', `${data.rung_3_digits.ticket_names_containing_digits}`],
              ['Digits matching a known table', `${data.rung_3_digits.digits_matching_a_known_table}`],
            ]}
          />

          <Rung
            n={4}
            title="Nothing usable"
            note="No customer and no ticket name — only time-and-elimination could match these."
            rows={[['Orders', `${data.orders_with_nothing_usable}`]]}
          />

          {data.sample_ticket_names.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <p style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '0.35rem' }}>How tickets are actually named</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {data.sample_ticket_names.map((n) => (
                  <span key={n} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: 999, background: '#f4f4f4', color: '#444' }}>{n}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

function Rung({ n, title, note, rows }: { n: number; title: string; note: string; rows: [string, string][] }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 10, padding: '0.75rem', marginBottom: '0.6rem' }}>
      <p style={{ fontSize: '0.85rem', fontWeight: 700 }}>{n}. {title}</p>
      <p style={{ fontSize: '0.74rem', color: '#888', marginTop: '0.1rem', marginBottom: '0.5rem' }}>{note}</p>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', padding: '0.15rem 0' }}>
          <span style={{ color: '#666' }}>{k}</span>
          <span style={{ fontWeight: 600 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}
