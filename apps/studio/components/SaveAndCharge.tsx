'use client';

import { useState } from 'react';
import { Check, PoundSterling, Loader } from 'lucide-react';

export function SaveAndCharge({ tool, label }: { tool: 'design-preview' | 'transfer-designer'; label: string }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ simulated: boolean; price_cents: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/design-tools/${tool}/charge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setResult({ simulated: data.simulated, price_cents: data.price_cents });
    } catch {
      setError('Could not save this right now.');
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div style={{ padding: '0.8rem', backgroundColor: '#eafaf0', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Check size={16} color="#1a8a3c" />
        <span>
          {label} saved · £{(result.price_cents / 100).toFixed(2)}
          {result.simulated && <span style={{ color: '#999' }}> (test mode — no real charge sent)</span>}
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={save}
        disabled={busy}
        style={{ width: '100%', padding: '0.6rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
      >
        {busy ? <><Loader size={15} /> Saving...</> : <><PoundSterling size={15} /> Save {label}</>}
      </button>
      {error && <p style={{ color: '#c33', fontSize: '0.8rem', marginTop: '0.4rem' }}>{error}</p>}
    </div>
  );
}
