'use client';
import { useEffect, useState } from 'react';

// [6 Oct] Never fail silently. Today a table photo's pieces and their
// return were dropped with a green tick on screen. This watches every
// save the app makes to the server; if one fails, a dot in the header
// goes amber and says what did not save, until someone taps it.
//
// It wraps fetch once for the whole app. It only watches writes (not
// reads) to our own API, and never changes what the page gets back.

type Failure = { what: string; at: number };

const API = process.env.NEXT_PUBLIC_API_URL || '';
let installed = false;
const listeners = new Set<(f: Failure) => void>();

function describe(url: string): string {
  const path = url.replace(API, '').split('?')[0];
  if (/photo-match\/confirm/.test(path)) return 'A table photo';
  if (/returns/.test(path)) return 'A return';
  if (/table-number/.test(path)) return 'A table number';
  if (/arrived/.test(path)) return 'An arrival';
  if (/collection|handover|collect/.test(path)) return 'A collection';
  if (/till|payment|sell/.test(path)) return 'A sale';
  return 'Something';
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') || 'GET').toUpperCase();
    // Background jobs are not saves somebody made, and the booking sync
    // retries itself every minute -- flagging those would cry wolf.
    const background = /\/bookings\/sync|auto-sync|backup-photo|\/identify|\/search/.test(url);
    const watched = method !== 'GET' && method !== 'HEAD' && !!API && url.startsWith(API) && !background;
    try {
      const res = await orig(input as any, init);
      if (watched && res.status >= 500) listeners.forEach((l) => l({ what: describe(url), at: Date.now() }));
      return res;
    } catch (err) {
      // Deliberate cancels (timeouts the page handles itself) still count:
      // the save did not happen.
      if (watched) listeners.forEach((l) => l({ what: describe(url), at: Date.now() }));
      throw err;
    }
  };
}

export default function SaveWatch() {
  const [fail, setFail] = useState<Failure | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    install();
    const l = (f: Failure) => setFail(f);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={fail ? 'Something did not save' : 'Everything saved'}
        title={fail ? 'Something did not save' : 'Everything saved'}
        style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <span style={{ width: 10, height: 10, borderRadius: 999, background: fail ? '#e0a23c' : '#5aa86a', boxShadow: fail ? '0 0 0 3px rgba(224,162,60,0.3)' : 'none' }} />
      </button>
      {open && (
        <span style={{ position: 'absolute', top: 30, left: 0, zIndex: 1100, width: 240, padding: '0.7rem 0.8rem', borderRadius: 8, background: 'white', color: '#2b2622', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>
          {fail ? (
            <>
              <strong style={{ display: 'block', marginBottom: 4 }}>{fail.what} did not save</strong>
              at {new Date(fail.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}. Go back and do it again, or check the wifi.
              <button onClick={() => { setFail(null); setOpen(false); }} style={{ display: 'block', marginTop: 8, background: 'none', border: 'none', padding: 0, color: 'var(--clay)', fontWeight: 700 }}>
                Done, clear it
              </button>
            </>
          ) : (
            <>Everything has saved.</>
          )}
        </span>
      )}
    </span>
  );
}
