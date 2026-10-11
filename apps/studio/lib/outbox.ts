'use client';

// [11 Oct] THE OUTBOX. Daisy: when the studio wifi drops mid-tap, a save can
// vanish. A JSON POST that cannot reach the server at all (no network, the
// server asleep, a timeout) is kept here and sent again when the connection
// is back: on the browser's "online" event, when the app comes to the front,
// and every half minute meanwhile. The screen is told "saved, will send",
// so nobody taps it a second time, and the OutboxBar shows what is waiting.
//
// Only genuine transport failures are queued. A reply from the server --
// even a 500 -- means the server was reached and the screen deals with it
// as before. Queued writes are replayed in order, each at most 20 times.

const KEY = 'glazeup_outbox';
const MAX_TRIES = 20;

export type Queued = { id: string; url: string; body: unknown; at: number; tries: number; label: string };
export type PostResult = { ok: true; queued: false; res: Response } | { ok: true; queued: true; res: null } | { ok: false; queued: false; res: Response };

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => { try { f(); } catch { /* listener error */ } });

export function readOutbox(): Queued[] {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Queued[]) : []; } catch { return []; }
}
function writeOutbox(items: Queued[]) {
  try { if (items.length) localStorage.setItem(KEY, JSON.stringify(items)); else localStorage.removeItem(KEY); } catch { /* private mode */ }
  notify();
}
export function onOutboxChange(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

const isTransport = (e: unknown) => {
  const n = (e as { name?: string })?.name || '';
  return n === 'TypeError' || n === 'AbortError' || (typeof navigator !== 'undefined' && navigator.onLine === false);
};

// A gateway error means the request never reached the app: Render waking a
// sleeping service, or a cafe wifi's captive portal. Treated like no wifi.
const GATEWAY = new Set([502, 503, 504]);

async function send(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
  } finally { clearTimeout(t); }
}

/**
 * POST JSON, and if the server cannot be reached, keep it to send later.
 * `label` is what the OutboxBar shows while it waits ("Kiln: shelf 17 Oct").
 */
export async function postOrQueue(url: string, body: unknown, label: string, timeoutMs = 15000): Promise<PostResult> {
  try {
    const res = await send(url, body, timeoutMs);
    if (res.ok) return { ok: true, queued: false, res };
    if (!GATEWAY.has(res.status)) return { ok: false, queued: false, res };
    // fall through to the queue
  } catch (e) {
    if (!isTransport(e)) throw e;
  }
  {
    const items = readOutbox();
    items.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, url, body, at: Date.now(), tries: 0, label });
    writeOutbox(items);
    scheduleFlush();
    return { ok: true, queued: true, res: null };
  }
}

let flushing = false;
export async function flushOutbox(): Promise<{ sent: number; left: number }> {
  if (flushing) return { sent: 0, left: readOutbox().length };
  flushing = true;
  let sent = 0;
  try {
    let items = readOutbox();
    while (items.length) {
      const it = items[0];
      try {
        const res = await send(it.url, it.body, 15000);
        if (GATEWAY.has(res.status)) { it.tries++; if (it.tries < MAX_TRIES) break; }
        // Reached the server: done with it, whatever it said. A rejected
        // write (4xx/5xx) is not retried forever -- it would be rejected
        // again -- and the screen will show the truth on its next load.
        items = items.slice(1); sent++;
      } catch (e) {
        if (!isTransport(e)) { items = items.slice(1); continue; }
        it.tries++;
        if (it.tries >= MAX_TRIES) items = items.slice(1); else break;
      }
      writeOutbox(items);
    }
    writeOutbox(items);
    return { sent, left: items.length };
  } finally { flushing = false; }
}

let timer: ReturnType<typeof setTimeout> | null = null;
function scheduleFlush(ms = 5000) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; flushOutbox().then((r) => { if (r.left) scheduleFlush(30000); }); }, ms);
}

let wired = false;
/** Call once (the shell does) so queued writes go out when the connection is back. */
export function wireOutbox() {
  if (wired || typeof window === 'undefined') return;
  wired = true;
  window.addEventListener('online', () => scheduleFlush(500));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleFlush(500); });
  if (readOutbox().length) scheduleFlush(2000);
}
