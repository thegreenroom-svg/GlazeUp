'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { Loader, Search, X, AlertCircle, ImageOff } from 'lucide-react';

// Daisy: "a really useful page for stock and finding etc with prices."
//
// Every bisque shape from the Square stocktake: photo, name, price and how
// many are in. Built for the moment a customer asks "have you got a gnome?"
// or "how much is the big serving bowl?" -- type a word, see it, done.
//
// Everything here comes from Square and is read-only. Prices and stock are
// Square's, refreshed every fifteen minutes in the background. Items that
// don't track stock in Square say so rather than pretending to be zero.

interface Variation { id: string; name: string; price_cents: number; tracked: boolean; stock: number | null }
interface Shape {
  id: string; square_item_id: string; name: string; category: string; category_guessed: boolean;
  description: string | null; price_cents: number; price_min_cents: number | null;
  image_url: string | null; stock_count: number | null; stock_tracked: boolean;
  variations: Variation[] | null; refreshed_at: string | null;
}

type StockFilter = 'all' | 'in' | 'low' | 'out';
type Sort = 'name' | 'price-up' | 'price-down' | 'stock';

const LOW = 2;

const money = (c: number) => '£' + ((c || 0) / 100).toFixed(c % 100 === 0 ? 0 : 2);
const priceLabel = (s: Shape) => {
  const lo = s.price_min_cents || s.price_cents, hi = s.price_cents;
  if (!hi) return 'No price';
  return lo && lo !== hi ? `${money(lo)} to ${money(hi)}` : money(hi);
};
// "PB Mugs And Cups" reads better as "Mugs and cups"
const catLabel = (c: string) => {
  const t = c.replace(/^PB\s+/, '').trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const stockState = (s: Shape): 'in' | 'low' | 'out' | 'untracked' =>
  !s.stock_tracked || s.stock_count == null ? 'untracked'
    : s.stock_count <= 0 ? 'out' : s.stock_count <= LOW ? 'low' : 'in';

const BANDS: { key: string; label: string; test: (p: number) => boolean }[] = [
  { key: 'u20', label: 'Under £20', test: (p) => p < 2000 },
  { key: '20-30', label: '£20 to £30', test: (p) => p >= 2000 && p < 3000 },
  { key: '30-40', label: '£30 to £40', test: (p) => p >= 3000 && p < 4000 },
  { key: '40+', label: '£40 and up', test: (p) => p >= 4000 },
];

function StockBadge({ s, big = false }: { s: Shape; big?: boolean }) {
  const st = stockState(s);
  const map = {
    in: { bg: 'var(--success-bg)', fg: 'var(--success)', text: `${s.stock_count} in` },
    low: { bg: 'var(--warning-bg)', fg: 'var(--warning)', text: `Only ${s.stock_count}` },
    out: { bg: '#FBEDEC', fg: 'var(--danger)', text: 'Out' },
    untracked: { bg: 'var(--ivory)', fg: 'var(--muted)', text: 'Not counted' },
  }[st];
  return (
    <span style={{
      display: 'inline-block', padding: big ? '0.3rem 0.7rem' : '0.15rem 0.5rem',
      borderRadius: 'var(--radius-full)', backgroundColor: map.bg, color: map.fg,
      fontSize: big ? 'var(--text-sm)' : 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap',
    }}>{map.text}</span>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap',
      border: `1px solid ${on ? 'var(--charcoal)' : 'var(--stone)'}`,
      backgroundColor: on ? 'var(--charcoal)' : '#fff', color: on ? '#fff' : 'var(--charcoal)',
      fontSize: 'var(--text-sm)', cursor: 'pointer', flexShrink: 0,
    }}>{children}</button>
  );
}

function Photo({ url, alt, height, whole = false }: { url: string | null; alt: string; height: number; whole?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div style={{
        height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'var(--sand)', color: 'var(--muted)',
      }}><ImageOff size={22} /></div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)}
      style={{ width: '100%', height, objectFit: whole ? 'contain' : 'cover', display: 'block', backgroundColor: whole ? 'var(--ivory)' : 'var(--sand)' }} />
  );
}

export default function StockPage() {
  const [items, setItems] = useState<Shape[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [band, setBand] = useState<string | null>(null);
  const [stock, setStock] = useState<StockFilter>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [open, setOpen] = useState<Shape | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/stock`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          if (d.error) throw new Error(d.error);
          setItems(d.items || []);
          setRefreshedAt(d.refreshed_at);
          setError(null);
          // First ever load, or a refresh is under way: look again shortly.
          if (d.refreshing) setTimeout(() => alive && load(), 20000);
        })
        .catch((e) => alive && setError(e.message || 'Could not load stock'))
        .finally(() => alive && setLoading(false));
    load();
    return () => { alive = false; };
  }, []);

  // Search: every word typed has to appear somewhere in the name, category
  // or description, in any order. "serving bowl" finds the serving bowls,
  // "gnome" finds every gnome wherever it is filed.
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const matchesSearch = (s: Shape) => {
    if (!words.length) return true;
    const hay = `${s.name} ${catLabel(s.category)} ${s.description || ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  };
  const matchesBand = (s: Shape) => !band || BANDS.find((b) => b.key === band)!.test(s.price_cents);
  const matchesStock = (s: Shape) => {
    if (stock === 'all') return true;
    const st = stockState(s);
    return stock === 'in' ? st === 'in' || st === 'low' : st === stock;
  };

  const base = useMemo(() => items.filter((s) => matchesSearch(s) && matchesBand(s) && matchesStock(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, q, band, stock]);

  const catCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of base) m.set(s.category, (m.get(s.category) || 0) + 1);
    return Array.from(m.entries()).sort((a, b) => catLabel(a[0]).localeCompare(catLabel(b[0])));
  }, [base]);

  const shown = useMemo(() => {
    const list = cat ? base.filter((s) => s.category === cat) : base.slice();
    const stockKey = (s: Shape) => (s.stock_tracked && s.stock_count != null ? s.stock_count : 9999);
    list.sort((a, b) =>
      sort === 'price-up' ? a.price_cents - b.price_cents
        : sort === 'price-down' ? b.price_cents - a.price_cents
          : sort === 'stock' ? stockKey(a) - stockKey(b)
            : a.name.localeCompare(b.name));
    return list;
  }, [base, cat, sort]);

  const totals = useMemo(() => ({
    all: items.length,
    out: items.filter((s) => stockState(s) === 'out').length,
    low: items.filter((s) => stockState(s) === 'low').length,
  }), [items]);

  const clearAll = () => { setQ(''); setCat(null); setBand(null); setStock('all'); searchRef.current?.focus(); };
  const filtered = q || cat || band || stock !== 'all';

  return (
    <PageShell title="Stock" subtitle="Every shape, its price, and how many are in" maxWidth={1100}>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--muted)', padding: '2rem 0' }}>
          <Loader size={18} className="animate-spin" /> Loading the shelves
        </div>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--danger)', padding: '1rem 0' }}>
          <AlertCircle size={18} /> {error}
        </div>
      ) : !items.length ? (
        <div style={{ color: 'var(--muted)', padding: '1.5rem 0', lineHeight: 1.5 }}>
          Fetching the catalogue from Square for the first time. This takes a minute; the page will fill on its own.
        </div>
      ) : (
        <>
          {/* Search */}
          <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
            <Search size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input
              ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Gnome, letter A, serving bowl..."
              inputMode="search" autoComplete="off"
              style={{
                width: '100%', padding: '0.85rem 2.75rem 0.85rem 2.6rem', fontSize: 'var(--text-md)',
                borderRadius: 'var(--radius-lg)', border: '1px solid var(--stone)', backgroundColor: '#fff',
                color: 'var(--charcoal)', outline: 'none',
              }}
            />
            {q && (
              <button onClick={() => { setQ(''); searchRef.current?.focus(); }} aria-label="Clear search" style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4,
              }}><X size={18} /></button>
            )}
          </div>

          {/* Stock + price filters */}
          <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
            <Chip on={stock === 'all'} onClick={() => setStock('all')}>All {totals.all}</Chip>
            <Chip on={stock === 'in'} onClick={() => setStock('in')}>In stock</Chip>
            <Chip on={stock === 'low'} onClick={() => setStock('low')}>Running low {totals.low}</Chip>
            <Chip on={stock === 'out'} onClick={() => setStock('out')}>Out {totals.out}</Chip>
            <span style={{ width: 1, backgroundColor: 'var(--stone)', margin: '0 0.25rem', flexShrink: 0 }} />
            {BANDS.map((b) => (
              <Chip key={b.key} on={band === b.key} onClick={() => setBand(band === b.key ? null : b.key)}>{b.label}</Chip>
            ))}
          </div>

          {/* Categories */}
          <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.75rem' }}>
            <Chip on={!cat} onClick={() => setCat(null)}>Everything</Chip>
            {catCounts.map(([c, n]) => (
              <Chip key={c} on={cat === c} onClick={() => setCat(cat === c ? null : c)}>{catLabel(c)} {n}</Chip>
            ))}
          </div>

          {/* Count + sort */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem',
            marginBottom: '0.75rem', fontSize: 'var(--text-sm)', color: 'var(--muted)', flexWrap: 'wrap',
          }}>
            <span>
              {shown.length} {shown.length === 1 ? 'shape' : 'shapes'}
              {filtered && <> · <button onClick={clearAll} style={{ border: 'none', background: 'none', color: 'var(--clay)', cursor: 'pointer', padding: 0, fontSize: 'inherit' }}>clear</button></>}
            </span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} style={{
              width: 'auto', padding: '0.35rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--stone)',
              backgroundColor: '#fff', color: 'var(--charcoal)', fontSize: 'var(--text-sm)',
            }}>
              <option value="name">A to Z</option>
              <option value="price-up">Cheapest first</option>
              <option value="price-down">Dearest first</option>
              <option value="stock">Lowest stock first</option>
            </select>
          </div>

          {/* Grid */}
          {shown.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.75rem' }}>
              {shown.map((s) => (
                <button key={s.id} onClick={() => setOpen(s)} style={{
                  textAlign: 'left', padding: 0, border: '1px solid var(--sand)', borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden', backgroundColor: '#fff', cursor: 'pointer',
                  opacity: stockState(s) === 'out' ? 0.6 : 1,
                }}>
                  <Photo url={s.image_url} alt={s.name} height={140} />
                  <div style={{ padding: '0.55rem 0.65rem 0.65rem' }}>
                    <div style={{
                      fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--charcoal)', lineHeight: 1.25,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: '2.5em',
                    }}>{s.name}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem', gap: '0.3rem' }}>
                      <span style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--clay)' }}>{priceLabel(s)}</span>
                      <StockBadge s={s} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--muted)', padding: '2rem 0', textAlign: 'center' }}>
              Nothing matches. <button onClick={clearAll} style={{ border: 'none', background: 'none', color: 'var(--clay)', cursor: 'pointer', fontSize: 'inherit' }}>Clear the filters</button>
            </div>
          )}

          {refreshedAt && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: '1.25rem' }}>
              Prices and stock from Square, last checked {new Date(refreshedAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.
              Change them in Square and this page follows within fifteen minutes.
            </p>
          )}
        </>
      )}

      {/* Detail sheet */}
      {open && (
        <div onClick={() => setOpen(null)} style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(43,39,36,0.55)', zIndex: 60,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            backgroundColor: '#fff', width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto',
            borderRadius: '18px 18px 0 0', position: 'relative',
          }}>
            <button onClick={() => setOpen(null)} aria-label="Close" style={{
              position: 'absolute', top: 10, right: 10, zIndex: 1, width: 36, height: 36, borderRadius: 999,
              border: 'none', backgroundColor: 'rgba(255,255,255,0.9)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><X size={18} /></button>
            <Photo url={open.image_url} alt={open.name} height={340} whole />
            <div style={{ padding: '1rem 1.25rem 1.5rem' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {catLabel(open.category)}
              </div>
              <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--charcoal)', margin: '0.2rem 0 0.6rem' }}>{open.name}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem' }}>
                <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--clay)' }}>{priceLabel(open)}</span>
                <StockBadge s={open} big />
              </div>

              {(open.variations || []).length > 1 && (
                <div style={{ border: '1px solid var(--sand)', borderRadius: 'var(--radius-md)', marginBottom: '0.9rem' }}>
                  {(open.variations || []).map((v, i) => (
                    <div key={v.id} style={{
                      display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.55rem 0.75rem',
                      borderTop: i ? '1px solid var(--sand)' : 'none', fontSize: 'var(--text-sm)',
                    }}>
                      <span style={{ color: 'var(--charcoal)' }}>{v.name}</span>
                      <span style={{ color: 'var(--muted)' }}>
                        {money(v.price_cents)}{v.tracked ? ` · ${v.stock ?? 0} in` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {open.description && (
                <p style={{ fontSize: 'var(--text-base)', color: 'var(--charcoal)', lineHeight: 1.5, whiteSpace: 'pre-line', margin: 0 }}>
                  {open.description}
                </p>
              )}
              {open.category_guessed && (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: '0.75rem' }}>
                  This shape has no category in Square, so GlazeUp has filed it here.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
