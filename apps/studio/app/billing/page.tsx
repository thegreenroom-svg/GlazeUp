'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

interface Plan { id: string; name: string; price_cents: number; blurb: string }
interface Addon { addon_key: string; enabled: boolean; monthly_price_cents: number | null }
interface Billing {
  plans: Plan[];
  subscription: { plan_id: string | null; status: string | null; current_period_end: string | null; cancel_at_period_end: boolean | null } | null;
  current_plan: Plan | null;
  addons: Addon[];
  monthly_total_cents: number;
  ai_spend_this_month_cents: number;
  billing_note: string;
}

export default function BillingPage() {
  const [data, setData] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/billing`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load billing.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '700px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Billing</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        What a studio pays to run GlazeUp.
      </p>

      {loading && <p style={{ color: '#666' }}>Loading...</p>}
      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px' }}>{error}</div>}

      {data && (
        <>
          <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
            {data.billing_note}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.6rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1rem', backgroundColor: 'white', border: '1px solid #eee', borderRadius: '8px' }}>
              <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--clay)' }}>
                £{(data.monthly_total_cents / 100).toFixed(2)}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#999' }}>Per month</p>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'white', border: '1px solid #eee', borderRadius: '8px' }}>
              <p style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--clay)' }}>
                £{(data.ai_spend_this_month_cents / 100).toFixed(2)}
              </p>
              <p style={{ fontSize: '0.75rem', color: '#999' }}>AI spend this month</p>
            </div>
          </div>

          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.6rem' }}>Plans</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {data.plans.map((p) => {
              const active = data.current_plan?.id === p.id;
              return (
                <div key={p.id} style={{
                  padding: '0.9rem', borderRadius: '8px',
                  border: active ? '2px solid var(--clay)' : '1px solid #eee',
                  backgroundColor: active ? '#fdf6f8' : 'white',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      {p.name}
                      {active && <Check size={15} color="var(--clay)" />}
                    </p>
                    <span style={{ fontWeight: 700 }}>£{(p.price_cents / 100).toFixed(0)}<span style={{ fontSize: '0.75rem', color: '#999' }}>/mo</span></span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>{p.blurb}</p>
                </div>
              );
            })}
          </div>

          {data.subscription && (
            <div style={{ padding: '0.8rem', backgroundColor: '#f9f9f9', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              <p>Status: <strong style={{ textTransform: 'capitalize' }}>{data.subscription.status || 'unknown'}</strong></p>
              {data.subscription.current_period_end && (
                <p style={{ marginTop: '0.2rem', color: '#666' }}>
                  Renews {new Date(data.subscription.current_period_end).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.6rem' }}>Add-ons</h2>
          {data.addons.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#999' }}>No add-ons configured.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {data.addons.map((a) => (
                <div key={a.addon_key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.7rem', backgroundColor: a.enabled ? '#eafaf0' : '#f9f9f9', borderRadius: '6px', fontSize: '0.85rem' }}>
                  <span style={{ textTransform: 'capitalize' }}>{a.addon_key.replace(/[-_]/g, ' ')}</span>
                  <span style={{ color: a.enabled ? '#1a8a3c' : '#999' }}>
                    {a.enabled ? `£${((a.monthly_price_cents || 0) / 100).toFixed(2)}/mo` : 'off'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
