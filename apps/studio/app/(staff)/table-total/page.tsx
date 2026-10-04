'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { compressPhotoForUpload } from '@/lib/compressPhoto';
import { Camera, Loader, X, Search, Plus, Copy, Check, AlertCircle, Trash2, Coffee } from 'lucide-react';

// TABLE TOTAL -- stage 1.
//
// Daisy: "photograph the table and it prices how many pieces are on the
// table. It would split if people are paying individually for their drinks
// and pieces. So we can total up immediately."
//
// Photograph the whole table: the pieces are found, each is matched to its
// shape from the stocktake and priced at Square's own price. Tap a piece to
// give it to a person, or to correct it. Drinks and cakes are added by
// hand -- a photo can't tell a latte from a cappuccino. The totals are
// there to ring up on the till as usual: nothing here is saved, and
// nothing is sent to Square.

const API = process.env.NEXT_PUBLIC_API_URL;

interface Variation { id: string; name: string; price_cents: number }
interface Shape {
  square_item_id: string; name: string; category?: string; image_url?: string | null;
  price_cents: number; price_min_cents?: number | null; variations?: Variation[] | null;
}
interface Piece {
  id: number; piece_type: string; description: string; box: any; crop: string | null;
  pricing: boolean; shape: Shape | null; confidence: string; candidates: Shape[];
  price_cents: number | null; variation: string | null; custom: boolean; person: number; removed: boolean;
}
interface Extra { id: number; person: number; name: string; price_cents: number }
interface Booking { booking_code: string; customer_name: string; party_size: number | null; session_start: string }

const money = (c: number) => '£' + (c / 100).toFixed(2);
const PERSON_TINTS = ['#B87946', '#4F6D7A', '#6E7A55', '#8C5A8C', '#A8651A', '#5B6E8C', '#9C5A3C', '#2E7D6B'];

// Cut each piece out of the photo for its row, using the box the photo step found.
async function cropAll(blob: Blob, boxes: any[]): Promise<(string | null)[]> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    return boxes.map((b) => {
      if (!b) return null;
      const pad = 3;
      const l = Math.max(0, b.left_pct - pad) / 100, t = Math.max(0, b.top_pct - pad) / 100;
      const r = Math.min(100, b.right_pct + pad) / 100, btm = Math.min(100, b.bottom_pct + pad) / 100;
      const sw = (r - l) * img.naturalWidth, sh = (btm - t) * img.naturalHeight;
      if (sw < 4 || sh < 4) return null;
      const scale = 220 / Math.max(sw, sh);
      const c = document.createElement('canvas');
      c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
      c.getContext('2d')!.drawImage(img, l * img.naturalWidth, t * img.naturalHeight, sw, sh, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.8);
    });
  } catch { return boxes.map(() => null); }
  finally { URL.revokeObjectURL(url); }
}

function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(43,39,36,0.55)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', borderRadius: '18px 18px 0 0', padding: '1rem 1rem 1.5rem', position: 'relative' }}>
        <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 10, right: 10, border: 'none', background: 'none', cursor: 'pointer', padding: 6 }}><X size={20} /></button>
        {children}
      </div>
    </div>
  );
}

function ShapeTile({ s, onPick, selected }: { s: Shape; onPick: () => void; selected?: boolean }) {
  return (
    <button onClick={onPick} style={{ border: `2px solid ${selected ? 'var(--clay)' : 'var(--sand)'}`, borderRadius: 'var(--radius-md)', backgroundColor: '#fff', padding: '0.35rem', cursor: 'pointer', textAlign: 'left' }}>
      {s.image_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={s.image_url} alt="" loading="lazy" style={{ width: '100%', aspectRatio: '1', objectFit: 'contain', backgroundColor: 'var(--ivory)', borderRadius: 6 }} />
        : <div style={{ width: '100%', aspectRatio: '1', backgroundColor: 'var(--sand)', borderRadius: 6 }} />}
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--charcoal)', marginTop: 4, lineHeight: 1.2 }}>{s.name}</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--clay)' }}>
        {s.price_min_cents && s.price_min_cents !== s.price_cents ? `${money(s.price_min_cents)} to ${money(s.price_cents)}` : money(s.price_cents)}
      </div>
    </button>
  );
}

export default function TableTotalPage() {
  const [stage, setStage] = useState<'start' | 'finding' | 'ready'>('start');
  const [error, setError] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [people, setPeople] = useState<string[]>(['Table']);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [feeOn, setFeeOn] = useState(false);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [catalogue, setCatalogue] = useState<Shape[] | null>(null);
  const [extrasList, setExtrasList] = useState<{ name: string; price_cents: number; category: string }[] | null>(null);
  const [editing, setEditing] = useState<Piece | null>(null);
  const [addingFor, setAddingFor] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const extraId = useRef(1);

  // Today's bookings, so a table can be named and sized from its booking.
  useEffect(() => {
    fetch(`${API}/api/demo/bookings`, { cache: 'no-store' }).then((r) => r.json()).then((d) => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
      const list = (Array.isArray(d) ? d : []).filter((b: Booking) => b.session_start &&
        new Date(b.session_start).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }) === today);
      list.sort((a: Booking, b: Booking) => a.session_start.localeCompare(b.session_start));
      setBookings(list);
    }).catch(() => {});
    fetch(`${API}/api/spec/table-total/extras`, { cache: 'no-store' }).then((r) => r.json())
      .then((d) => setExtrasList(d.items || [])).catch(() => setExtrasList([]));
  }, []);

  const studioFee = useMemo(() => extrasList?.find((x) => /studio fee/i.test(x.name)) || null, [extrasList]);

  const chooseBooking = (code: string) => {
    const b = bookings.find((x) => x.booking_code === code) || null;
    setBooking(b);
    const n = Math.max(1, Math.min(12, b?.party_size || 1));
    const first = (b?.customer_name || '').split(' ')[0];
    setPeople(n === 1 ? [first || 'Table'] : Array.from({ length: n }, (_, i) => (i === 0 && first ? first : `Person ${i + 1}`)));
    setPieces((ps) => ps.map((p) => ({ ...p, person: Math.min(p.person, n - 1) })));
    setExtras((xs) => xs.map((x) => ({ ...x, person: Math.min(x.person, n - 1) })));
  };

  const takePhoto = async (file: File | undefined) => {
    if (!file) return;
    setError(null); setStage('finding'); setPieces([]); setExtras((x) => x);
    try {
      const jpeg = await compressPhotoForUpload(file, 1600, 0.85);
      setPhotoUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(jpeg); });
      const fd = new FormData(); fd.append('photo', jpeg, 'table.jpg');
      const r = await fetch(`${API}/api/spec/pieces/identify-in-photo`, { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok || !Array.isArray(d.pieces)) throw new Error(d?.error || 'Could not read that photo.');
      if (!d.pieces.length) { setError('No pottery found in that photo. Try again with the whole table in shot.'); setStage('start'); return; }
      const crops = await cropAll(jpeg, d.pieces.map((p: any) => p.box));
      const first: Piece[] = d.pieces.map((p: any, i: number) => ({
        id: i, piece_type: p.piece_type, description: p.description, box: p.box, crop: crops[i],
        pricing: true, shape: null, confidence: '', candidates: [], price_cents: null, variation: null, custom: false, person: 0, removed: false,
      }));
      setPieces(first); setStage('ready');

      // Prices next, while the pieces are already on screen.
      const fd2 = new FormData(); fd2.append('photo', jpeg, 'table.jpg');
      fd2.append('pieces', JSON.stringify(d.pieces.map((p: any) => ({ piece_type: p.piece_type, description: p.description, box: p.box }))));
      const r2 = await fetch(`${API}/api/spec/table-total/price`, { method: 'POST', body: fd2 });
      const d2 = await r2.json().catch(() => ({}));
      const byIdx = new Map<number, any>((d2.pieces || []).map((x: any) => [x.index, x]));
      setPieces((ps) => ps.map((p) => {
        const m = byIdx.get(p.id);
        if (!m) return { ...p, pricing: false };
        const shape: Shape | null = m.shape || null;
        const oneVar = shape && (!shape.variations || shape.variations.length <= 1);
        return {
          ...p, pricing: false, shape, confidence: m.confidence, candidates: (m.candidates || []).filter(Boolean),
          // One size: priced. Several sizes: left for a person to choose, rather than guessing the dearest.
          price_cents: shape && oneVar ? shape.price_cents : null,
          variation: shape && oneVar ? (shape.variations?.[0]?.id || null) : null,
        };
      }));
      if (!r2.ok) setError(d2?.error || 'Pieces found, but pricing failed. Tap each piece to choose it.');
    } catch (e: any) {
      setError(e?.message || 'Something went wrong. Try the photo again.');
      setStage((s) => (s === 'finding' ? 'start' : s));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const setPiece = (id: number, patch: Partial<Piece>) => {
    setPieces((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setEditing((e) => (e && e.id === id ? { ...e, ...patch } : e));
  };
  const chooseShape = (p: Piece, s: Shape) => {
    const vars = s.variations || [];
    setPiece(p.id, {
      shape: s, confidence: 'chosen', custom: false,
      price_cents: vars.length > 1 ? null : s.price_cents,
      variation: vars.length > 1 ? null : (vars[0]?.id || null),
    });
    if (vars.length <= 1) { setEditing(null); setQ(''); }
  };
  const cyclePerson = (p: Piece) => setPiece(p.id, { person: (p.person + 1) % people.length });

  const openEditor = (p: Piece) => {
    setEditing(p); setQ('');
    if (!catalogue) fetch(`${API}/api/spec/stock`, { cache: 'no-store' }).then((r) => r.json()).then((d) => setCatalogue(d.items || [])).catch(() => setCatalogue([]));
  };

  const live = pieces.filter((p) => !p.removed);
  const unpriced = live.filter((p) => p.price_cents == null && !p.pricing).length;
  const stillPricing = live.some((p) => p.pricing);
  const fee = feeOn && studioFee ? studioFee.price_cents : 0;

  const perPerson = people.map((name, i) => {
    const ps = live.filter((p) => p.person === i);
    const xs = extras.filter((x) => x.person === i);
    const total = ps.reduce((n, p) => n + (p.price_cents || 0), 0) + xs.reduce((n, x) => n + x.price_cents, 0) + fee;
    return { name, ps, xs, total };
  });
  const grand = perPerson.reduce((n, p) => n + p.total, 0);

  const summary = () => {
    const lines: string[] = [];
    if (booking) lines.push(`${booking.customer_name} (${booking.booking_code})`);
    perPerson.forEach((pp) => {
      if (!pp.ps.length && !pp.xs.length && !fee) return;
      if (people.length > 1) lines.push(`\n${pp.name}: ${money(pp.total)}`);
      pp.ps.forEach((p) => lines.push(`  ${p.shape?.name || p.piece_type}${p.variation && p.shape?.variations && p.shape.variations.length > 1 ? ` (${p.shape.variations.find((v) => v.id === p.variation)?.name})` : ''}  ${p.price_cents != null ? money(p.price_cents) : 'NO PRICE'}`));
      pp.xs.forEach((x) => lines.push(`  ${x.name}  ${money(x.price_cents)}`));
      if (fee) lines.push(`  Studio fee  ${money(fee)}`);
    });
    lines.push(`\nTable total: ${money(grand)}`);
    return lines.join('\n');
  };

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shapeResults = !catalogue || !words.length ? [] : catalogue.filter((s) => words.every((w) => `${s.name} ${s.category || ''}`.toLowerCase().includes(w))).slice(0, 24);
  const extraResults = !extrasList ? [] : (words.length ? extrasList.filter((x) => words.every((w) => `${x.name} ${x.category}`.toLowerCase().includes(w))) : extrasList).slice(0, 60);

  const row: React.CSSProperties = { display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.55rem', border: '1px solid var(--sand)', borderRadius: 'var(--radius-md)', backgroundColor: '#fff' };
  const pill = (bg: string, fg: string): React.CSSProperties => ({ padding: '0.15rem 0.5rem', borderRadius: 999, backgroundColor: bg, color: fg, fontSize: 'var(--text-xs)', fontWeight: 600, whiteSpace: 'nowrap' });

  return (
    <PageShell title="Table total" subtitle="Photograph the table, see what everyone owes" maxWidth={760}>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => takePhoto(e.target.files?.[0])} />

      {/* Booking + people */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
        <select value={booking?.booking_code || ''} onChange={(e) => chooseBooking(e.target.value)} style={{ width: 'auto', flex: '1 1 220px', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--stone)', backgroundColor: '#fff', fontSize: 'var(--text-sm)' }}>
          <option value="">No booking (walk-in)</option>
          {bookings.map((b) => (
            <option key={b.booking_code} value={b.booking_code}>
              {new Date(b.session_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })} {b.customer_name}{b.party_size ? ` (${b.party_size})` : ''}
            </option>
          ))}
        </select>
        <button onClick={() => setPeople((p) => [...p, `Person ${p.length + 1}`])} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0.5rem 0.8rem', borderRadius: 999, border: '1px solid var(--stone)', background: '#fff', cursor: 'pointer', fontSize: 'var(--text-sm)' }}><Plus size={14} /> Person</button>
      </div>

      {stage === 'start' && (
        <button onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: '2rem 1rem', borderRadius: 'var(--radius-lg)', border: '2px dashed var(--clay)', background: '#fff', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--charcoal)' }}>
          <Camera size={32} color="var(--clay)" />
          <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>Photograph the table</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>Every piece in shot, from above if you can</span>
        </button>
      )}
      {stage === 'finding' && (
        <div style={{ ...row, justifyContent: 'center', padding: '1.5rem', color: 'var(--muted)' }}><Loader size={18} className="animate-spin" /> Finding the pieces...</div>
      )}
      {error && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--danger)', fontSize: 'var(--text-sm)', margin: '0.6rem 0' }}><AlertCircle size={16} /> {error}</div>
      )}

      {stage === 'ready' && (
        <>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.6rem' }}>
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 'var(--radius-md)' }} />
            )}
            <div style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
              {live.length} piece{live.length === 1 ? '' : 's'} found{stillPricing ? ', pricing...' : ''}.
              {people.length > 1 ? ' Tap the coloured dot to change whose it is.' : ''} Tap a piece to correct it.
            </div>
            <button onClick={() => fileRef.current?.click()} style={{ padding: '0.45rem 0.8rem', borderRadius: 999, border: '1px solid var(--stone)', background: '#fff', cursor: 'pointer', fontSize: 'var(--text-sm)', display: 'inline-flex', gap: 4, alignItems: 'center' }}><Camera size={14} /> Retake</button>
          </div>

          <div style={{ display: 'grid', gap: '0.45rem' }}>
            {live.map((p) => {
              const sure = p.confidence === 'high' || p.confidence === 'chosen';
              return (
                <div key={p.id} style={row}>
                  {p.crop
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={p.crop} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                    : <div style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: 'var(--sand)', flexShrink: 0 }} />}
                  <button onClick={() => openEditor(p)} style={{ flex: 1, minWidth: 0, textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--charcoal)', fontSize: 'var(--text-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.custom ? `${p.piece_type} (own price)` : p.shape ? p.shape.name : p.piece_type}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>
                    <div style={{ marginTop: 3 }}>
                      {p.pricing ? <span style={pill('var(--ivory)', 'var(--muted)')}>Pricing...</span>
                        : p.price_cents == null ? <span style={pill('#FBEDEC', 'var(--danger)')}>{p.shape ? 'Pick the size' : 'Tap to choose'}</span>
                          : !sure && !p.custom ? <span style={pill('var(--warning-bg)', 'var(--warning)')}>Check this one</span> : null}
                    </div>
                  </button>
                  <div style={{ fontWeight: 700, color: 'var(--clay)', fontSize: 'var(--text-md)', minWidth: 58, textAlign: 'right' }}>
                    {p.price_cents != null ? money(p.price_cents) : ''}
                  </div>
                  {people.length > 1 && (
                    <button onClick={() => cyclePerson(p)} title={people[p.person]} style={{ width: 34, height: 34, borderRadius: 999, border: 'none', cursor: 'pointer', backgroundColor: PERSON_TINTS[p.person % PERSON_TINTS.length], color: '#fff', fontWeight: 700, fontSize: 'var(--text-xs)', flexShrink: 0 }}>
                      {(people[p.person] || '?').slice(0, 2)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {pieces.some((p) => p.removed) && (
            <button onClick={() => setPieces((ps) => ps.map((p) => ({ ...p, removed: false })))} style={{ marginTop: 6, border: 'none', background: 'none', color: 'var(--clay)', cursor: 'pointer', fontSize: 'var(--text-xs)' }}>
              Bring back {pieces.filter((p) => p.removed).length} removed
            </button>
          )}
        </>
      )}

      {/* Per person: drinks, cakes, fee, subtotal */}
      {(stage === 'ready' || extras.length > 0) && (
        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.6rem' }}>
          {studioFee && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
              <input type="checkbox" checked={feeOn} onChange={(e) => setFeeOn(e.target.checked)} style={{ width: 18, height: 18, flex: "none", margin: 0 }} /> Studio fee, {money(studioFee.price_cents)} each
            </label>
          )}
          {perPerson.map((pp, i) => (
            <div key={i} style={{ border: '1px solid var(--sand)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.75rem', backgroundColor: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: PERSON_TINTS[i % PERSON_TINTS.length], flexShrink: 0 }} />
                <input value={pp.name} onChange={(e) => setPeople((ps) => ps.map((n, j) => (j === i ? e.target.value : n)))}
                  style={{ flex: 1, minWidth: 0, border: 'none', fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--charcoal)', background: 'transparent', padding: 0 }} />
                <span style={{ fontWeight: 700, color: 'var(--charcoal)' }}>{money(pp.total)}</span>
                {people.length > 1 && (
                  <button aria-label="Remove person" onClick={() => {
                    setPeople((ps) => ps.filter((_, j) => j !== i));
                    setPieces((ps) => ps.map((p) => ({ ...p, person: p.person === i ? 0 : p.person > i ? p.person - 1 : p.person })));
                    setExtras((xs) => xs.filter((x) => x.person !== i).map((x) => ({ ...x, person: x.person > i ? x.person - 1 : x.person })));
                  }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 2 }}><X size={16} /></button>
                )}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', marginTop: 4 }}>
                {pp.ps.length} piece{pp.ps.length === 1 ? '' : 's'}{fee ? ' + studio fee' : ''}
              </div>
              {pp.xs.map((x) => (
                <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-sm)', marginTop: 4 }}>
                  <span>{x.name}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{money(x.price_cents)}
                    <button aria-label="Remove" onClick={() => setExtras((xs) => xs.filter((y) => y.id !== x.id))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 0 }}><X size={14} /></button>
                  </span>
                </div>
              ))}
              <button onClick={() => { setAddingFor(i); setQ(''); }} style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', color: 'var(--clay)', cursor: 'pointer', fontSize: 'var(--text-sm)', padding: 0, fontWeight: 600 }}>
                <Coffee size={14} /> Add drink or cake
              </button>
            </div>
          ))}

          <div style={{ backgroundColor: 'var(--charcoal)', color: '#fff', borderRadius: 'var(--radius-lg)', padding: '0.9rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--text-sm)', opacity: 0.8 }}>Table total</span>
              <span style={{ fontSize: 'var(--text-2xl)', fontWeight: 700 }}>{money(grand)}</span>
            </div>
            {(unpriced > 0 || stillPricing) && (
              <div style={{ fontSize: 'var(--text-xs)', color: '#F3C98B', marginTop: 4 }}>
                {stillPricing ? 'Still pricing some pieces.' : `${unpriced} piece${unpriced === 1 ? '' : 's'} not priced yet, so not counted.`}
              </div>
            )}
            <button onClick={() => { navigator.clipboard?.writeText(summary()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); }}
              style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.85rem', borderRadius: 999, border: '1px solid rgba(255,255,255,0.4)', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
              {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy the breakdown</>}
            </button>
            <div style={{ fontSize: 'var(--text-xs)', opacity: 0.65, marginTop: 8 }}>Ring it up on the till as usual. Nothing here is sent to Square.</div>
          </div>
          <button onClick={() => { setStage('start'); setPieces([]); setExtras([]); setBooking(null); setPeople(['Table']); setFeeOn(false); setError(null); }}
            style={{ justifySelf: 'start', border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>Start a new table</button>
        </div>
      )}

      {/* Correct a piece */}
      {editing && (
        <Sheet onClose={() => { setEditing(null); setQ(''); }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem', paddingRight: 28 }}>
            {editing.crop
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={editing.crop} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} /> : null}
            <div>
              <div style={{ fontWeight: 700, color: 'var(--charcoal)' }}>Which shape is this?</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>{editing.description}</div>
            </div>
          </div>

          {editing.shape && (editing.shape.variations || []).length > 1 && (
            <div style={{ marginBottom: '0.8rem' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{editing.shape.name}: which size?</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(editing.shape.variations || []).map((v) => (
                  <button key={v.id} onClick={() => { setPiece(editing.id, { variation: v.id, price_cents: v.price_cents, custom: false }); setEditing(null); }}
                    style={{ padding: '0.45rem 0.75rem', borderRadius: 999, cursor: 'pointer', fontSize: 'var(--text-sm)', border: `1px solid ${editing.variation === v.id ? 'var(--clay)' : 'var(--stone)'}`, background: editing.variation === v.id ? 'var(--clay)' : '#fff', color: editing.variation === v.id ? '#fff' : 'var(--charcoal)' }}>
                    {v.name} {money(v.price_cents)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {editing.candidates.length > 0 && !words.length && (
            <>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Closest from the stocktake</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 6 }}>
                {editing.candidates.map((s) => <ShapeTile key={s.square_item_id} s={s} selected={editing.shape?.square_item_id === s.square_item_id} onPick={() => chooseShape(editing, s)} />)}
              </div>
            </>
          )}

          <div style={{ position: 'relative', margin: '0.8rem 0 0.5rem' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every shape..." autoComplete="off"
              style={{ width: '100%', padding: '0.65rem 0.75rem 0.65rem 2.2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--stone)', fontSize: 'var(--text-md)' }} />
          </div>
          {words.length > 0 && (catalogue === null
            ? <div style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Loading shapes...</div>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))', gap: 6 }}>
                {shapeResults.map((s) => <ShapeTile key={s.square_item_id} s={s} onPick={() => chooseShape(editing, s)} />)}
              </div>)}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>Or its own price £</span>
            <input type="number" inputMode="decimal" step="0.5" min="0" placeholder="0.00"
              defaultValue={editing.custom && editing.price_cents != null ? (editing.price_cents / 100).toFixed(2) : ''}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              onBlur={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) setPiece(editing.id, { price_cents: Math.round(v * 100), custom: true }); }}
              style={{ width: 96, padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--stone)' }} />
          </div>
          <button onClick={() => { setPiece(editing.id, { removed: true }); setEditing(null); }}
            style={{ marginTop: '1rem', display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--stone)', background: '#fff', color: 'var(--muted)', borderRadius: 999, padding: '0.45rem 0.85rem', cursor: 'pointer', fontSize: 'var(--text-sm)' }}>
            <Trash2 size={14} /> Not a customer piece, remove it
          </button>
        </Sheet>
      )}

      {/* Add drink or cake */}
      {addingFor !== null && (
        <Sheet onClose={() => setAddingFor(null)}>
          <div style={{ fontWeight: 700, color: 'var(--charcoal)', marginBottom: '0.6rem', paddingRight: 28 }}>Add for {people[addingFor]}</div>
          <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Latte, brownie, juice..." autoComplete="off"
              style={{ width: '100%', padding: '0.65rem 0.75rem 0.65rem 2.2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--stone)', fontSize: 'var(--text-md)' }} />
          </div>
          {extrasList === null ? <div style={{ color: 'var(--muted)' }}>Loading...</div> : (
            <div style={{ display: 'grid', gap: 4 }}>
              {extraResults.map((x) => (
                <button key={x.name} onClick={() => { setExtras((xs) => [...xs, { id: extraId.current++, person: addingFor, name: x.name, price_cents: x.price_cents }]); setAddingFor(null); }}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '0.55rem 0.7rem', border: '1px solid var(--sand)', borderRadius: 'var(--radius-sm)', background: '#fff', cursor: 'pointer', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                  <span>{x.name} <span style={{ color: 'var(--muted)', fontSize: 'var(--text-xs)' }}>{x.category}</span></span>
                  <span style={{ color: 'var(--clay)', fontWeight: 600 }}>{money(x.price_cents)}</span>
                </button>
              ))}
              {!extraResults.length && <div style={{ color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>Nothing matches.</div>}
            </div>
          )}
        </Sheet>
      )}
    </PageShell>
  );
}
