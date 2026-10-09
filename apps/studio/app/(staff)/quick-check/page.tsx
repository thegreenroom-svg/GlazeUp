'use client';

export const dynamic = 'force-dynamic';

// [9 Oct] QUICK CHECK. Daisy: "Do all" -- this one from the list as
// "ten seconds a table at the end of the day".
//
// Recognition gets the kind of piece right and the exact shape wrong often
// enough that its answers are shown as guesses until someone settles them.
// This is the fastest way to settle them: one piece at a time, its photo,
// the guess in big letters. Right: one tap. Wrong: tap the right one from
// the shortlist. Every tap prices the piece properly and is scored against
// the guess, which is how recognition learns where to trust itself.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { Check, Loader, SkipForward } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL;
const money = (c: number) => `£${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

interface Shape { square_item_id: string; name: string; price_cents: number }
interface Guess {
  id: string; booking_code: string; customer_name: string; session_start: string;
  piece_type: string; description: string | null; guess: Shape | null; options: Shape[]; confidence: string | null;
}

export default function QuickCheckPage() {
  const router = useRouter();
  const [list, setList] = useState<Guess[] | null>(null);
  const [i, setI] = useState(0);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/spec/shapes/guesses?days=14`, { cache: 'no-store' })
      .then((r) => r.json()).then((d) => setList(d.pieces || []))
      .catch(() => setList([]));
  }, []);

  const who = (() => { try { return JSON.parse(localStorage.getItem('glazeup_shift') || '{}').name || 'staff'; } catch { return 'staff'; } })();

  const settle = async (shape: Shape | null) => {
    if (!list) return;
    const p = list[i];
    if (!shape) { setI(i + 1); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${API}/api/spec/pieces/${p.id}/shape`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ square_item_id: shape.square_item_id, confirmed_by: who }),
      });
      if (!r.ok) throw new Error();
      setDone((d) => d + 1);
      setI(i + 1);
    } catch {
      setErr('Could not save that one. Try again.');
    } finally { setBusy(false); }
  };

  // [9 Oct] Daisy: Katrin Aneva's pieces were made in a workshop and only
  // painted in the session. Not one of the bisque range: no shape, no price.
  const settleHandmade = async () => {
    if (!list) return;
    const p = list[i];
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`${API}/api/spec/pieces/${p.id}/shape`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ square_item_id: null, confirmed_by: who }),
      });
      if (!r.ok) throw new Error();
      setDone((d) => d + 1);
      setI(i + 1);
    } catch { setErr('Could not save that one. Try again.'); }
    finally { setBusy(false); }
  };

  if (!list) {
    return (
      <PageShell title="Quick check" subtitle="Settle the guessed shapes, one tap each">
        <p style={{ color: 'var(--stone)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}><Loader size={15} className="animate-spin" /> Loading</p>
      </PageShell>
    );
  }

  const p = list[i];
  if (!p) {
    return (
      <PageShell title="Quick check" subtitle="Settle the guessed shapes, one tap each">
        <div style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '1.2rem', textAlign: 'center' }}>
          <Check size={28} color="#3D7A4A" />
          <p style={{ fontWeight: 700, marginTop: '0.4rem', color: 'var(--charcoal)' }}>
            {list.length === 0 ? 'Nothing to check. Every recent piece is settled.' : `All done: ${done} confirmed.`}
          </p>
          <button onClick={() => router.push('/daily-cards')} style={{ marginTop: '0.8rem', padding: '0.6rem 1.1rem', borderRadius: 999, border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700 }}>
            Back to the cards
          </button>
        </div>
      </PageShell>
    );
  }

  const opts = p.options.filter((o) => !p.guess || o.square_item_id !== p.guess.square_item_id);
  return (
    <PageShell title="Quick check" subtitle={`${i + 1} of ${list.length}${done ? ` · ${done} confirmed` : ''}`}>
      <div style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${API}/api/spec/pieces/${p.id}/crop.jpg`}
          alt={p.piece_type}
          style={{ display: 'block', width: '100%', maxHeight: '46vh', objectFit: 'contain', background: '#f4efe8' }}
        />
        <div style={{ padding: '0.8rem 0.9rem' }}>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--stone)' }}>
            {p.customer_name} · {new Date(p.session_start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </p>
          <p style={{ fontSize: 'var(--text-sm)', color: '#6b625a', marginTop: '0.15rem' }}>
            {(p.description || p.piece_type || '').replace(/^./, (c) => c.toUpperCase())}
          </p>

          {p.guess ? (
            <button
              disabled={busy}
              onClick={() => settle(p.guess)}
              style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', marginTop: '0.8rem', padding: '0.9rem 1rem', borderRadius: 'var(--radius-md)', border: 'none', background: '#3D7A4A', color: 'white', fontWeight: 700, fontSize: 'var(--text-md)', textAlign: 'left' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Check size={18} /> {p.guess.name}</span>
              <span>{p.guess.price_cents ? money(p.guess.price_cents) : ''}</span>
            </button>
          ) : (
            <p style={{ marginTop: '0.8rem', fontWeight: 700, color: 'var(--charcoal)' }}>Not recognised. Which is it?</p>
          )}

          {opts.length > 0 && (
            <>
              <p style={{ marginTop: '0.8rem', fontSize: 'var(--text-xs)', color: 'var(--stone)', fontWeight: 600 }}>{p.guess ? 'Or is it one of these?' : 'Tap the right one'}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.35rem' }}>
                {opts.map((o) => (
                  <button
                    key={o.square_item_id}
                    disabled={busy}
                    onClick={() => settle(o)}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.65rem 0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--clay)', background: 'white', color: 'var(--clay)', fontWeight: 600, fontSize: 'var(--text-sm)', textAlign: 'left' }}
                  >
                    <span>{o.name}</span><span>{o.price_cents ? money(o.price_cents) : ''}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <button
            disabled={busy}
            onClick={() => settleHandmade()}
            style={{ display: 'block', width: '100%', marginTop: '0.6rem', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--stone)', background: 'white', color: '#6b625a', fontWeight: 600, fontSize: 'var(--text-sm)', textAlign: 'left' }}
          >
            Handmade in a workshop, just painted here (no bisque price)
          </button>
          <button
            onClick={() => settle(null)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.9rem', background: 'none', border: 'none', padding: 0, color: 'var(--stone)', fontWeight: 600, fontSize: 'var(--text-sm)' }}
          >
            <SkipForward size={15} /> Not sure, skip
          </button>
          {err && <p style={{ color: '#b03a2e', fontSize: 'var(--text-sm)', marginTop: '0.5rem' }}>{err}</p>}
        </div>
      </div>
      <p style={{ color: 'var(--stone)', fontSize: 'var(--text-xs)', marginTop: '0.8rem', lineHeight: 1.5 }}>
        Not on the list? Open the card and pick it there, or use Shape recognition for the full range.
      </p>
    </PageShell>
  );
}
