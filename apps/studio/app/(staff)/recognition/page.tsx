'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { Loader, Check, X, Search, RefreshCw, AlertCircle, ImageOff } from 'lucide-react';

// Which shape is each painted piece?
//
// Shape recognition runs in the background after a table is photographed:
// each piece is cut out of the photo and compared against the catalogue
// photos from the Square stocktake, judging form rather than paint. This
// is where you see what it decided, side by side, and put it right in
// one tap. Anything confirmed here is never overwritten by the machine.

const API = process.env.NEXT_PUBLIC_API_URL;

interface ShapeRef { square_item_id: string; name: string; category?: string; image_url?: string | null; price_cents?: number }
interface Piece {
  id: string; booking_id: string; piece_type: string | null; description: string | null; created_at: string;
  square_item_id: string | null; shape_confidence: string | null; shape_checked_at: string | null;
  shape_confirmed: boolean | null; shape_confirmed_by: string | null;
  shape: ShapeRef | null; shape_candidates: ShapeRef[];
}
interface Stats { total: number; unchecked: number; matched: number; confirmed: number }
type Filter = 'all' | 'unsure' | 'matched' | 'unchecked';

const money = (c?: number) => (c ? '£' + (c / 100).toFixed(c % 100 ? 2 : 0) : '');
const catLabel = (c?: string) => {
  const t = String(c || '').replace(/^PB\s+/, '').trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const staffName = () => {
  try { return JSON.parse(localStorage.getItem('glazeup_shift') || '{}').name || null; } catch { return null; }
};

function Thumb({ src, size = 120 }: { src?: string | null; size?: number }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    return <div style={{ width: size, height: size, borderRadius: 'var(--radius-md)', backgroundColor: 'var(--sand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', flexShrink: 0 }}><ImageOff size={20} /></div>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" onError={() => setBad(true)} style={{ width: size, height: size, objectFit: 'contain', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--ivory)', flexShrink: 0 }} />;
}

function Verdict({ p }: { p: Piece }) {
  const v = p.shape_confirmed
    ? (p.square_item_id ? { t: 'Confirmed', bg: 'var(--success-bg)', fg: 'var(--success)' } : { t: 'Not one of ours', bg: 'var(--ivory)', fg: 'var(--muted)' })
    : !p.shape_checked_at ? { t: 'Not checked yet', bg: 'var(--ivory)', fg: 'var(--muted)' }
      : p.square_item_id ? (p.shape_confidence === 'high'
        ? { t: 'Sure', bg: 'var(--success-bg)', fg: 'var(--success)' }
        : { t: 'Fairly sure', bg: 'var(--warning-bg)', fg: 'var(--warning)' })
        : { t: 'Needs a look', bg: '#FBEDEC', fg: 'var(--danger)' };
  return <span style={{ padding: '0.15rem 0.55rem', borderRadius: 999, backgroundColor: v.bg, color: v.fg, fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap' }}>{v.t}</span>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: '0.4rem 0.8rem', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0, cursor: 'pointer',
      border: `1px solid ${on ? 'var(--charcoal)' : 'var(--stone)'}`,
      backgroundColor: on ? 'var(--charcoal)' : '#fff', color: on ? '#fff' : 'var(--charcoal)', fontSize: 'var(--text-sm)',
    }}>{children}</button>
  );
}

export default function RecognitionPage() {
  const [items, setItems] = useState<Piece[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [picking, setPicking] = useState<Piece | null>(null);
  const [catalogue, setCatalogue] = useState<ShapeRef[] | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`${API}/api/spec/shapes/review?filter=${filter}&limit=80`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setItems(d.items || []); setStats(d.stats || null); setError(null); })
      .catch((e) => setError(e.message || 'Could not load'))
      .finally(() => setLoading(false));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const runNow = async () => {
    setRunning(true); setRunMsg(null);
    try {
      const r = await fetch(`${API}/api/spec/shapes/recognise`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photos: 5 }),
      });
      const d = await r.json();
      setRunMsg(d.reason === 'already running' ? 'Already checking in the background. Give it a minute.'
        : d.error ? d.error
          : d.pieces ? `Checked ${d.pieces} piece${d.pieces === 1 ? '' : 's'}, recognised ${d.matched}.`
            : 'Nothing new to check.');
      load();
    } catch { setRunMsg('Could not reach the server.'); }
    finally { setRunning(false); }
  };

  const save = async (p: Piece, square_item_id: string | null) => {
    // Optimistic: the list updates straight away.
    const shape = square_item_id ? (catalogue?.find((s) => s.square_item_id === square_item_id)
      || p.shape_candidates.find((s) => s.square_item_id === square_item_id) || p.shape) : null;
    setItems((xs) => xs.map((x) => x.id === p.id ? { ...x, square_item_id, shape: shape || null, shape_confirmed: true, shape_confidence: square_item_id ? 'confirmed' : 'none' } : x));
    setPicking(null); setQ('');
    await fetch(`${API}/api/spec/pieces/${p.id}/shape`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ square_item_id, confirmed_by: staffName() }),
    }).catch(() => { /* list reloads on next visit */ });
  };

  const openPicker = (p: Piece) => {
    setPicking(p); setQ('');
    if (!catalogue) {
      fetch(`${API}/api/spec/stock`, { cache: 'no-store' }).then((r) => r.json())
        .then((d) => setCatalogue(d.items || [])).catch(() => setCatalogue([]));
    }
  };

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = useMemo(() => !catalogue || !words.length ? []
    : catalogue.filter((s) => words.every((w) => `${s.name} ${catLabel(s.category)}`.toLowerCase().includes(w))).slice(0, 24),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [catalogue, q]);

  const pct = stats && stats.total ? Math.round((stats.matched / stats.total) * 100) : 0;

  return (
    <PageShell title="Shape recognition" subtitle="Which shape each painted piece is, checked against the stocktake photos" maxWidth={900}>
      {stats && (
        <div style={{ backgroundColor: '#fff', border: '1px solid var(--sand)', borderRadius: 'var(--radius-lg)', padding: '0.9rem 1rem', marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--charcoal)' }}>{stats.matched}</span>
              <span style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}> of {stats.total} pieces have a shape</span>
            </div>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>{stats.confirmed} confirmed by staff · {stats.unchecked} not checked yet</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, backgroundColor: 'var(--sand)', marginTop: '0.6rem', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: 'var(--clay)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <button onClick={runNow} disabled={running} style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', borderRadius: 999,
              border: 'none', backgroundColor: 'var(--clay)', color: '#fff', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', opacity: running ? 0.6 : 1,
            }}>
              <RefreshCw size={14} className={running ? 'animate-spin' : ''} /> {running ? 'Checking...' : 'Check new pieces now'}
            </button>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{runMsg || 'Runs on its own every five minutes too.'}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '0.75rem' }}>
        <Chip on={filter === 'all'} onClick={() => setFilter('all')}>Latest</Chip>
        <Chip on={filter === 'unsure'} onClick={() => setFilter('unsure')}>Needs a look</Chip>
        <Chip on={filter === 'matched'} onClick={() => setFilter('matched')}>Recognised</Chip>
        <Chip on={filter === 'unchecked'} onClick={() => setFilter('unchecked')}>Not checked yet</Chip>
      </div>

      {loading ? (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--muted)', padding: '1.5rem 0' }}><Loader size={18} className="animate-spin" /> Loading</div>
      ) : error ? (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--danger)', padding: '1rem 0' }}><AlertCircle size={18} /> {error}</div>
      ) : !items.length ? (
        <div style={{ color: 'var(--muted)', padding: '1.5rem 0' }}>Nothing here.</div>
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {items.map((p) => (
            <div key={p.id} style={{ backgroundColor: '#fff', border: '1px solid var(--sand)', borderRadius: 'var(--radius-lg)', padding: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <Thumb src={`${API}/api/spec/pieces/${p.id}/crop.jpg`} size={112} />
                <span style={{ color: 'var(--stone)', fontSize: 20 }}>→</span>
                {p.shape ? <Thumb src={p.shape.image_url} size={112} /> : (
                  <div style={{ width: 112, height: 112, borderRadius: 'var(--radius-md)', border: '1px dashed var(--stone)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 'var(--text-xs)', textAlign: 'center', padding: '0.5rem', flexShrink: 0 }}>
                    {p.shape_checked_at ? 'No shape' : 'Not checked'}
                  </div>
                )}
                <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                  <Verdict p={p} />
                  <div style={{ fontWeight: 700, color: 'var(--charcoal)', marginTop: '0.3rem', fontSize: 'var(--text-md)' }}>
                    {p.shape ? p.shape.name : (p.piece_type || 'Piece')}
                  </div>
                  {p.shape && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--clay)', fontWeight: 600 }}>{money(p.shape.price_cents)} · {catLabel(p.shape.category)}</div>}
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.description || ''}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{p.booking_id}</div>
                </div>
              </div>
              {p.shape_checked_at && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                  {p.square_item_id && !p.shape_confirmed && (
                    <button onClick={() => save(p, p.square_item_id)} style={btn('var(--success)')}><Check size={14} /> Right</button>
                  )}
                  <button onClick={() => openPicker(p)} style={btn('var(--charcoal)', true)}>
                    {p.square_item_id ? <><X size={14} /> Wrong, pick it</> : <><Search size={14} /> Pick the shape</>}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Picker */}
      {picking && (
        <div onClick={() => setPicking(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(43,39,36,0.55)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', borderRadius: '18px 18px 0 0', padding: '1rem 1rem 1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
              <Thumb src={`${API}/api/spec/pieces/${picking.id}/crop.jpg`} size={80} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--charcoal)' }}>Which shape is this?</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{picking.description}</div>
              </div>
              <button onClick={() => setPicking(null)} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 6 }}><X size={20} /></button>
            </div>

            {picking.shape_candidates.length > 0 && !words.length && (
              <>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.25rem 0 0.4rem' }}>Closest from the stocktake</div>
                <div style={grid}>
                  {picking.shape_candidates.map((s) => <ShapeButton key={s.square_item_id} s={s} onPick={() => save(picking, s.square_item_id)} />)}
                </div>
              </>
            )}

            <div style={{ position: 'relative', margin: '0.9rem 0 0.6rem' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Or search every shape..." autoComplete="off"
                style={{ width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--stone)', fontSize: 'var(--text-md)' }} />
            </div>
            {words.length > 0 && (
              catalogue === null ? <div style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading shapes...</div>
                : results.length ? <div style={grid}>{results.map((s) => <ShapeButton key={s.square_item_id} s={s} onPick={() => save(picking, s.square_item_id)} />)}</div>
                  : <div style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>No shape matches that.</div>
            )}

            <button onClick={() => save(picking, null)} style={{ ...btn('var(--muted)', true), marginTop: '1rem' }}>
              Not one of our shapes (thrown, hand-built, brought in)
            </button>
          </div>
        </div>
      )}
    </PageShell>
  );
}

const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.5rem' };

function ShapeButton({ s, onPick }: { s: ShapeRef; onPick: () => void }) {
  return (
    <button onClick={onPick} style={{ border: '1px solid var(--sand)', borderRadius: 'var(--radius-md)', backgroundColor: '#fff', padding: '0.4rem', cursor: 'pointer', textAlign: 'left' }}>
      <Thumb src={s.image_url} size={96} />
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--charcoal)', marginTop: '0.3rem', lineHeight: 1.25 }}>{s.name}</div>
      {s.price_cents ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clay)' }}>{money(s.price_cents)}</div> : null}
    </button>
  );
}

function btn(colour: string, outline = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.85rem', borderRadius: 999,
    border: `1px solid ${colour}`, backgroundColor: outline ? '#fff' : colour, color: outline ? colour : '#fff',
    fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer',
  };
}
