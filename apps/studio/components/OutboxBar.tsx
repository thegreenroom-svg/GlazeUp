'use client';

// [11 Oct] What is waiting to be sent, when the wifi has dropped. Hidden
// when there is nothing. One tap sends now; otherwise it goes by itself.

import { useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { flushOutbox, onOutboxChange, readOutbox, wireOutbox } from '@/lib/outbox';

export function OutboxBar() {
  const [items, setItems] = useState<ReturnType<typeof readOutbox>>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    wireOutbox();
    setItems(readOutbox());
    return onOutboxChange(() => setItems(readOutbox()));
  }, []);
  if (!items.length) return null;
  const n = items.length;
  return (
    <div className="no-print" role="status" style={{ position: 'sticky', top: 0, zIndex: 60, display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.9rem', background: '#fff4d6', color: '#8a5a00', borderBottom: '1px solid #f0d9a6', fontSize: 'var(--text-sm)' }}>
      <CloudOff size={16} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <b>{n} change{n === 1 ? '' : 's'} saved here, waiting for the wifi.</b>{' '}
        <span style={{ opacity: 0.8 }}>{items.slice(0, 2).map((i) => i.label).join(' · ')}{n > 2 ? ` · +${n - 2}` : ''}</span>
      </span>
      <button onClick={async () => { setBusy(true); try { await flushOutbox(); } finally { setBusy(false); } }} disabled={busy}
        style={{ border: '1px solid #e0c58a', background: 'white', color: '#8a5a00', borderRadius: 999, padding: '0.3rem 0.7rem', fontWeight: 700, fontSize: 'var(--text-xs)', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
        <RefreshCw size={13} className={busy ? 'animate-spin' : undefined} /> Send now
      </button>
    </div>
  );
}
