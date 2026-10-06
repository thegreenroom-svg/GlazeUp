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

// [6 Oct] Holding saves when the wifi drops. A simple save (text, not a
// photo) that cannot reach the server is kept on this iPad and sent as
// soon as the connection is back, instead of being lost. Photos are too
// big to keep this way, so those still fail loudly and need redoing.
type Queued = { url: string; method: string; headers: Record<string, string>; body: string | null; what: string; at: number };
const QUEUE_KEY = 'glazeup_save_queue';
function readQueue(): Queued[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}
function writeQueue(q: Queued[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-200))); } catch { /* full or private */ }
  queueListeners.forEach((l) => l(q.length));
}
const queueListeners = new Set<(n: number) => void>();
let flushing = false;
let origFetch: typeof fetch | null = null;
async function flushQueue() {
  if (flushing || !origFetch) return;
  const q = readQueue();
  if (!q.length) return;
  flushing = true;
  const left: Queued[] = [];
  for (const item of q) {
    try {
      const r = await origFetch(item.url, { method: item.method, headers: item.headers, body: item.body ?? undefined });
      // A 4xx will never succeed by retrying; drop it rather than loop.
      if (r.status >= 500) left.push(item);
    } catch {
      left.push(item);
    }
  }
  writeQueue(left);
  flushing = false;
}

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
  origFetch = orig;
  // Only the main window sends the queue, so a sheet over a card and the
  // card screen behind it never both send the same save.
  if (window.self === window.top) {
    window.addEventListener('online', () => { flushQueue(); });
    setInterval(() => { if (navigator.onLine) flushQueue(); }, 30000);
    setTimeout(flushQueue, 2000);
  }
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
      // No connection at all, and the save is plain text: keep it and send
      // it later, and tell the page it is in hand.
      const body = init?.body;
      const keepable = watched && (body == null || typeof body === 'string') && (!navigator.onLine || (err as any)?.name === 'TypeError');
      if (keepable) {
        const headers: Record<string, string> = {};
        new Headers(init?.headers || {}).forEach((v, k) => { headers[k] = v; });
        writeQueue([...readQueue(), { url, method, headers, body: (body as string) ?? null, what: describe(url), at: Date.now() }]);
        return new Response(JSON.stringify({ queued: true }), { status: 202, headers: { 'Content-Type': 'application/json' } });
      }
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
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    install();
    const inSheet = window.self !== window.top;
    const l = (f: Failure) => {
      setFail(f);
      // Inside a sheet over a card the header is hidden, so pass it up.
      if (inSheet) { try { window.parent.postMessage({ type: 'glazeup:savefail', what: f.what, at: f.at }, window.location.origin); } catch { /* */ } }
    };
    listeners.add(l);
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === 'glazeup:savefail') setFail({ what: e.data.what, at: e.data.at });
    };
    window.addEventListener('message', onMsg);
    const onStorage = (e: StorageEvent) => { if (e.key === QUEUE_KEY) setWaiting(readQueue().length); };
    window.addEventListener('storage', onStorage);
    const ql = (n: number) => setWaiting(n);
    queueListeners.add(ql);
    setWaiting(readQueue().length);
    return () => { listeners.delete(l); queueListeners.delete(ql); window.removeEventListener('message', onMsg); window.removeEventListener('storage', onStorage); };
  }, []);

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={fail ? 'Something did not save' : 'Everything saved'}
        title={fail ? 'Something did not save' : 'Everything saved'}
        style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <span style={{ width: 10, height: 10, borderRadius: 999, background: fail ? '#e0a23c' : waiting ? '#6b8fb3' : '#5aa86a', boxShadow: fail ? '0 0 0 3px rgba(224,162,60,0.3)' : 'none' }} />
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
          ) : waiting ? (
            <>{waiting} save{waiting === 1 ? '' : 's'} waiting for the wifi. {waiting === 1 ? 'It' : 'They'} will send by {waiting === 1 ? 'itself' : 'themselves'} when it is back. Keep the app open.</>
          ) : (
            <>Everything has saved.</>
          )}
        </span>
      )}
    </span>
  );
}
