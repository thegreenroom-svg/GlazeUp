'use client';

// [9 Oct] Daisy's phone kept showing the old cards after a deploy, because
// a page already open keeps the version it loaded. This checks every few
// minutes, and whenever the app comes back to the front, whether a newer
// version is live, and offers a one-tap update.

import { useEffect, useState } from 'react';

const MINE = process.env.NEXT_PUBLIC_BUILD_ID || '';

export function UpdateBar() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!MINE) return;
    let stop = false;
    const check = async () => {
      try {
        const r = await fetch('/api/version', { cache: 'no-store' });
        const d = r.ok ? await r.json() : null;
        if (!stop && d?.build && d.build !== MINE) setStale(true);
      } catch { /* offline: try again later */ }
    };
    check();
    const t = setInterval(check, 5 * 60 * 1000);
    const onShow = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onShow);
    return () => { stop = true; clearInterval(t); document.removeEventListener('visibilitychange', onShow); };
  }, []);

  if (!stale) return null;
  return (
    <button
      className="no-print"
      onClick={() => window.location.reload()}
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
        top: 'calc(env(safe-area-inset-top, 0px) + 0.6rem)',
        padding: '0.6rem 1.1rem', borderRadius: 999, border: 'none',
        background: '#3D7A4A', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.2)', whiteSpace: 'nowrap',
      }}
    >
      New version of the app. Tap to update
    </button>
  );
}
