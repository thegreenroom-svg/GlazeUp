'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import { PageShell } from '@/components/PageShell';
import { Search, Check, Package } from 'lucide-react';

// The front desk moment. A customer says a first name; ten seconds later the
// right box is in their hands. Type the name, see the shelf, see the pottery
// cropped from the table photo, see whether it is genuinely all out of the
// kiln -- then one button for the hand-over itself.

type Box = { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number };

interface Match {
  booking_code: string;
  customer_name: string;
  session_start: string;
  piece_count: number;
  uncollected: number;
  all_out_of_kiln: boolean;
  shelf_label: string | null;
  posting: number;
  pieces: {
    id: string; piece_type: string | null; description: string | null;
    status: string | null; out: boolean;
    reference_photo_url: string | null; photo_box: Box | null;
  }[];
}

function cropStyle(url: string, box: Box | null): React.CSSProperties {
  if (!box) return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  const w = box.right_pct - box.left_pct;
  const h = box.bottom_pct - box.top_pct;
  if (!(w > 0) || !(h > 0)) return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${(100 / w) * 100}% ${(100 / h) * 100}%`,
    backgroundPosition: `${w >= 100 ? 0 : (box.left_pct / (100 - w)) * 100}% ${h >= 100 ? 0 : (box.top_pct / (100 - h)) * 100}%`,
    backgroundRepeat: 'no-repeat',
  };
}

export default function CollectPage() {
  const [q, setQ] = useState('');
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [open, setOpen] = useState<Match | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handed, setHanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (text: string) => {
    setQ(text);
    setOpen(null); setHanded(false);
    if (debounce.current) clearTimeout(debounce.current);
    if (text.trim().length < 2) { setMatches(null); return; }
    debounce.current = setTimeout(async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/collection/search?q=${encodeURIComponent(text.trim())}`);
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Search failed');
        setMatches(d.matches || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed');
      } finally { setLoading(false); }
    }, 250);
  };

  const handover = async () => {
    if (!open) return;
    setBusy(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/collection/${open.booking_code}/handover`, { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not mark that collected');
      setHanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark that collected');
    } finally { setBusy(false); }
  };

  return (
    <PageShell title="Collection" subtitle="Customer at the desk? Start typing their name">
      <div style={{ position: 'relative', marginBottom: '0.9rem' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
        <input
          value={q}
          onChange={(e) => search(e.target.value)}
          placeholder="First name is enough"
          autoFocus
          style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2.3rem', border: '1px solid #ddd', borderRadius: 10, fontSize: '1rem', boxSizing: 'border-box' }}
        />
      </div>

      {loading && <p style={{ fontSize: '0.85rem', color: '#888' }}>Searching...</p>}
      {error && <p style={{ fontSize: '0.85rem', color: '#c0392b' }}>{error}</p>}
      {matches && matches.length === 0 && !loading && (
        <p style={{ fontSize: '0.85rem', color: '#888' }}>
          Nobody with pottery waiting matches that. If they collected already, their pieces won&apos;t show here.
        </p>
      )}

      {/* Result list -- only people who still have pottery here. */}
      {!open && matches && matches.map((m) => (
        <button
          key={m.booking_code}
          onClick={() => { setOpen(m); setHanded(false); }}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', textAlign: 'left', padding: '0.7rem 0.8rem', marginBottom: '0.4rem', borderRadius: 10, border: `1px solid ${m.all_out_of_kiln ? '#9CC79C' : '#eee'}`, background: m.all_out_of_kiln ? '#F1F8F1' : 'white', cursor: 'pointer' }}
        >
          <span>
            <span style={{ display: 'block', fontSize: '0.92rem', fontWeight: 700 }}>{m.customer_name}</span>
            <span style={{ display: 'block', fontSize: '0.74rem', color: '#777' }}>
              Painted {new Date(m.session_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              {' · '}{m.uncollected} piece{m.uncollected === 1 ? '' : 's'} waiting
            </span>
          </span>
          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: m.all_out_of_kiln ? '#2E7D32' : '#A6761D', textAlign: 'right' }}>
            {m.all_out_of_kiln
              ? (m.shelf_label || 'Out of the kiln')
              : 'Still firing'}
          </span>
        </button>
      ))}

      {/* The hand-over view */}
      {open && (
        <div>
          <button onClick={() => setOpen(null)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--clay)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', marginBottom: '0.6rem' }}>
            ← Back to results
          </button>

          <p style={{ fontSize: '1.05rem', fontWeight: 700 }}>{open.customer_name}</p>
          <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.25rem' }}>
            {open.shelf_label ? `Shelf: ${open.shelf_label}` : open.all_out_of_kiln ? 'Out of the kiln' : 'Not all fired yet'}
            {open.posting > 0 ? ` · ${open.posting} being posted` : ''}
          </p>

          {/* Not-all-out is said in amber BEFORE anyone promises anything
              over the desk. */}
          {!open.all_out_of_kiln && (
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#A6761D', marginBottom: '0.4rem' }}>
              Some of this booking hasn&apos;t been fired yet — check before promising the lot.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem', margin: '0.7rem 0' }}>
            {open.pieces.map((p) => (
              <div key={p.id} style={{ border: '1px solid #eee', borderRadius: 8, overflow: 'hidden', opacity: p.status === 'collected' ? 0.55 : 1 }}>
                <div style={{ width: '100%', aspectRatio: '1', backgroundColor: '#f4f4f4', ...(p.reference_photo_url ? cropStyle(p.reference_photo_url, p.photo_box) : {}) }} />
                <div style={{ padding: '0.35rem 0.45rem' }}>
                  <p style={{ fontSize: '0.72rem', fontWeight: 700 }}>{p.piece_type || 'Piece'}</p>
                  <p style={{ fontSize: '0.66rem', color: p.out ? '#2E7D32' : '#A6761D', fontWeight: 600 }}>
                    {p.status === 'collected' ? 'Collected' : p.out ? 'Ready' : 'Firing'}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {handed ? (
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem', fontWeight: 700, color: '#2E7D32' }}>
              <Check size={18} /> Handed over — all marked collected
            </p>
          ) : (
            <button
              onClick={handover}
              disabled={busy}
              style={{ width: '100%', padding: '0.9rem', borderRadius: 10, border: 'none', backgroundColor: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: busy ? 0.6 : 1 }}
            >
              <Package size={17} />
              {busy ? 'Marking...' : `Hand over ${open.uncollected} piece${open.uncollected === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}
    </PageShell>
  );
}
