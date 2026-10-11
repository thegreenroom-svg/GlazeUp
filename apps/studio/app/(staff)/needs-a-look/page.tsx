'use client';

// [11 Oct] NEEDS A LOOK, AS ONE LIST. Four screens each held a pile of
// things a person has to settle: guessed shapes, iPad photos that matched
// no booking, till items with no name, and bookings where the till charged
// for more pieces than were photographed. This shows every pile with its
// count, biggest job first, and hides the ones that are empty. Staff see
// the shapes; the rest are the owner's.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { AlertTriangle, Check, CheckCircle2, ChevronRight, HelpCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';
const API = process.env.NEXT_PUBLIC_API_URL;
const OWNER_ROLES = ['General Manager', 'Co-Director', 'Studio Executive'];

type Counts = { shapes: number; unknown_items: number; short_pieces: number; total: number };
const PILES = [
  { key: 'shapes', label: 'Guessed shapes', detail: 'Confirm or correct, one tap each', href: '/quick-check', icon: CheckCircle2, tint: '#3D7A4A', owner: false },
  // [11 Oct] Daisy: "take out the backfill for now." The iPad photos still
  // come in and match on their own; the unmatched pile is just not nagged.
  { key: 'short_pieces', label: 'Pieces missing from photos', detail: 'The till charged for more than were photographed', href: '/piece-check', icon: AlertTriangle, tint: '#E0A23C', owner: true },
  { key: 'unknown_items', label: 'Unknown till items', detail: 'Deleted from Square, waiting to be named', href: '/other-items', icon: HelpCircle, tint: '#A8651A', owner: true },
] as const;

export default function NeedsALookPage() {
  const router = useRouter();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [err, setErr] = useState(false);
  const [isOwner, setIsOwner] = useState(true);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('glazeup_shift');
      const role = raw ? JSON.parse(raw)?.role : null;
      setIsOwner(!!role && OWNER_ROLES.includes(role));
    } catch { /* leave everything showing */ }
    fetch(`${API}/api/spec/needs-a-look/counts`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setCounts).catch(() => setErr(true));
  }, []);

  const piles = PILES.filter((p) => isOwner || !p.owner)
    .map((p) => ({ ...p, n: counts ? counts[p.key] : null }))
    .sort((a, b) => (b.n || 0) - (a.n || 0));
  const open = counts ? piles.filter((p) => (p.n || 0) > 0) : piles;
  const clear = counts ? piles.filter((p) => !p.n) : [];

  return (
    // [11 Oct] Reached from the menu, so Back undoes that one step rather
    // than making you open the menu and choose again.
    <PageShell title="Needs a look" subtitle="Things a person has to settle. Biggest pile first." back={true}>
      {err && <p style={{ color: '#C0392B', fontSize: 'var(--text-sm)' }}>Could not load the counts. The piles below still open.</p>}
      {counts && open.length === 0 && (
        <p style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '1rem', color: '#2E7D32', fontWeight: 700, display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <Check size={18} /> Nothing needs a look. Lovely.
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
        {open.map((p) => {
          const Icon = p.icon;
          return (
            <button key={p.key} onClick={() => router.push(p.href)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%', padding: '0.9rem', borderRadius: 'var(--radius-md)', border: '1px solid #ece5db', background: 'white', color: 'var(--charcoal)', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ flexShrink: 0, width: 38, height: 38, borderRadius: 'var(--radius-md)', background: p.tint, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={18} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--text-md)' }}>{p.label}</span>
                <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: '#777' }}>{p.detail}</span>
              </span>
              {p.n != null && <span style={{ flexShrink: 0, minWidth: 32, height: 32, padding: '0 0.55rem', borderRadius: 16, background: p.tint, color: 'white', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{p.n}</span>}
              <ChevronRight size={18} color="#b5aca2" />
            </button>
          );
        })}
      </div>
      {clear.length > 0 && (
        <p style={{ marginTop: '1rem', fontSize: 'var(--text-xs)', color: '#777' }}>
          All clear: {clear.map((p, i) => (
            <span key={p.key}>{i ? ', ' : ''}<button onClick={() => router.push(p.href)} style={{ border: 'none', background: 'none', padding: 0, color: 'var(--clay)', fontWeight: 600, fontSize: 'inherit', cursor: 'pointer' }}>{p.label.toLowerCase()}</button></span>
          ))}.
        </p>
      )}
    </PageShell>
  );
}
