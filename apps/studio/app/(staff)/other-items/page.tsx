'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useMemo } from 'react';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Loader, Check, Search, HelpCircle } from 'lucide-react';

// What reaches this screen is only the genuinely unknowable.
//
// Every Other line now carries the Square catalogue id it came from. The sync
// follows those ids: if an item still exists but was renamed, it is resolved
// automatically and the old name-based guess is thrown away. Nobody needs to
// look at those.
//
// These are the ones whose id Square no longer has at all. Deleted from the
// catalogue, so no lookup and no rename will ever find them. Somebody who was
// there has to say what shape it was.
//
// Sorted by money, because if only ten of these ever get done they should be
// the ten that matter. Square is never written to.

const B = {
  text: 'var(--charcoal)', stone: 'var(--stone)',
  clay: 'var(--clay)', sand: 'var(--sand)', ivory: 'var(--ivory)',
};

const money = (c: number) => '£' + Math.round((c || 0) / 100).toLocaleString('en-GB');

interface Unmatched {
  square_item_id: string;
  item_name: string;
  revenue_cents: number;
  item_count: number;
  days: number;
}
interface Shape {
  square_item_id: string | null;
  name: string;
  category: string;
  image_url: string | null;
  price_cents: number | null;
}

export default function OtherItemsPage() {
  const [rows, setRows] = useState<Unmatched[] | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/other/unmatched`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { setRows(d.unmatched || []); setShapes(d.catalogue || []); })
      .catch(() => setRows([]));
  }, []);

  // One row per category, with a photo to recognise it by. Staff think in
  // shapes, not category names, so the picture has to lead.
  const choices = useMemo(() => {
    const seen = new Map<string, Shape>();
    for (const s of shapes) {
      if (!s.category) continue;
      const cur = seen.get(s.category);
      if (!cur || (!cur.image_url && s.image_url)) seen.set(s.category, s);
    }
    const all = [...seen.values()].sort((a, b) => a.category.localeCompare(b.category));
    const term = q.trim().toLowerCase();
    return term ? all.filter((s) => s.category.toLowerCase().includes(term) || s.name.toLowerCase().includes(term)) : all;
  }, [shapes, q]);

  const save = async (row: Unmatched, category: string) => {
    setSaving(row.square_item_id);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/other/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ square_item_id: row.square_item_id, item_name: row.item_name, category }),
      });
      setDone((d) => ({ ...d, [row.square_item_id]: category }));
      setOpen(null); setQ('');
    } finally {
      setSaving(null);
    }
  };

  const left = (rows || []).filter((r) => !done[r.square_item_id]);
  const totalLeft = left.reduce((a, r) => a + r.revenue_cents, 0);

  return (
    <PageShell title="Unknown items" subtitle="Deleted from Square, so only you can say what they were">

      {rows === null && (
        <p style={{ color: B.stone, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Loader size={15} className="animate-spin" /> Looking
        </p>
      )}

      {rows !== null && left.length === 0 && (
        <EmptyState
          icon={<Check size={22} />}
          title="Nothing left to identify"
          hint="Everything that landed in Other has either been matched to a shape, or still exists in Square and was resolved automatically."
        />
      )}

      {left.length > 0 && (
        <p style={{ color: B.stone, fontSize: 'var(--text-sm)', lineHeight: 1.55, marginBottom: '0.9rem' }}>
          <b style={{ color: B.text }}>{left.length}</b> items worth{' '}
          <b style={{ color: B.text }}>{money(totalLeft)}</b> were deleted from Square,
          so there is nothing left to look them up by. Tap a shape for each one.
          Biggest first, and you can stop whenever you like.
        </p>
      )}

      {left.map((r) => (
        <div
          key={r.square_item_id}
          style={{
            backgroundColor: '#fff', border: `1px solid ${B.sand}`,
            borderRadius: 'var(--radius-md)', padding: '0.85rem 0.95rem', marginBottom: '0.55rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
            <HelpCircle size={17} color="#a8651a" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: B.text, fontWeight: 700, fontSize: 'var(--text-sm)' }}>{r.item_name}</p>
              <p style={{ color: B.stone, fontSize: 'var(--text-xs)', marginTop: '0.15rem' }}>
                {money(r.revenue_cents)} · {r.item_count} sold · across {r.days} day{r.days === 1 ? '' : 's'}
              </p>
            </div>
            <button
              onClick={() => { setOpen(open === r.square_item_id ? null : r.square_item_id); setQ(''); }}
              style={{
                flexShrink: 0, padding: '0.35rem 0.75rem', borderRadius: 999,
                fontSize: 'var(--text-xs)', fontWeight: 700, border: `1px solid var(--clay)`,
                backgroundColor: open === r.square_item_id ? 'var(--clay)' : 'transparent',
                color: open === r.square_item_id ? '#fff' : 'var(--clay)',
              }}
            >
              {open === r.square_item_id ? 'Close' : 'What was it?'}
            </button>
          </div>

          {open === r.square_item_id && (
            <div style={{ marginTop: '0.75rem', borderTop: `1px solid ${B.sand}`, paddingTop: '0.7rem' }}>
              <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
                <Search size={14} color={B.stone} style={{ position: 'absolute', left: 10, top: 11 }} />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Mug, plate, bauble..."
                  style={{
                    width: '100%', padding: '0.5rem 0.6rem 0.5rem 2rem',
                    borderRadius: 'var(--radius-sm)', border: `1px solid ${B.sand}`,
                    fontSize: 'var(--text-sm)', backgroundColor: B.ivory, color: B.text,
                  }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {choices.map((s) => (
                  <button
                    key={s.category}
                    onClick={() => save(r, s.category)}
                    disabled={saving === r.square_item_id}
                    style={{
                      border: `1px solid ${B.sand}`, borderRadius: 'var(--radius-sm)',
                      padding: '0.35rem', backgroundColor: '#fff', cursor: 'pointer',
                      opacity: saving === r.square_item_id ? 0.5 : 1, textAlign: 'center',
                    }}
                  >
                    {s.image_url ? (
                      <img src={s.image_url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 4 }} />
                    ) : (
                      <div style={{ width: '100%', aspectRatio: '1', borderRadius: 4, backgroundColor: B.sand }} />
                    )}
                    <span style={{ display: 'block', fontSize: '0.64rem', lineHeight: 1.25, color: B.text, marginTop: '0.25rem' }}>
                      {s.category}
                    </span>
                  </button>
                ))}
              </div>
              {choices.length === 0 && (
                <p style={{ color: B.stone, fontSize: 'var(--text-xs)' }}>Nothing matches that.</p>
              )}
            </div>
          )}
        </div>
      ))}

      {Object.keys(done).length > 0 && (
        <p style={{ color: '#3d7a4a', fontSize: 'var(--text-xs)', fontWeight: 600, marginTop: '0.8rem' }}>
          {Object.keys(done).length} identified this session. They will move out of Other on the next sync.
        </p>
      )}
    </PageShell>
  );
}
