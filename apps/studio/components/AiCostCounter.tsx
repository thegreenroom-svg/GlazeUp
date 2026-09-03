'use client';

import { useState, useEffect } from 'react';
import { Cpu } from 'lucide-react';

export function AiCostCounter() {
  const [total, setTotal] = useState<{ total_usd: number; call_count: number } | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/ai-cost-total`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setTotal)
      .catch(() => {});
  }, []);

  if (!total) return null;

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
      padding: '0.35rem 0.7rem', borderRadius: '999px', backgroundColor: '#f0f0f0',
      fontSize: 'var(--text-xs)', color: '#555', marginBottom: '1rem',
    }}>
      <Cpu size={13} />
      <span>
        AI cost so far: <strong>${total.total_usd.toFixed(4)}</strong> ({total.call_count} call{total.call_count === 1 ? '' : 's'})
      </span>
    </div>
  );
}
