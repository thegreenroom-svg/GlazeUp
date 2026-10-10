'use client';

export const dynamic = 'force-dynamic';

// [10 Oct] KILN. Daisy: "there's got to be a section kiln... for Lucy or
// whoever's packing the kilns and dip glazing... handwrite a date for
// collection on the shelf that items to be dip glazed and fired next for
// the collection date need to be placed on... always the option to add
// new shelf and new collection dates if that booking says so."
//
// One shelf per collection date, soonest first. Each shows the date to
// chalk on the shelf (or a label to print), the pieces that go on it with
// their photos so they can be found on the racks, and the one next step
// for that shelf: on the shelf, dipped and into the kiln, out. A booking
// can be moved to another date, which moves it to that date's shelf, and
// a shelf can be added for a date nobody is on yet.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { PieceThumb, PIECE_COLOURS } from '@/components/PieceBoxes';
import { Camera, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Flame, Loader, Maximize2, Minus, Plus, Printer, X, ZoomIn } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL;

interface Piece {
  id: string; piece_type: string | null; description: string | null; parts: number;
  reference_photo_url: string | null;
  photo_box: { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number } | null;
  stage: string;
}
interface Booking {
  booking_code: string; customer_name: string; session_start: string; notes: string | null; postal: boolean;
  to_fire: number; fired: number; packed: number; pieces: Piece[];
}
interface Stage { shelved_at: string | null; into_kiln_at: string | null; out_of_kiln_at: string | null; moved_by: string | null }
interface Shelf { date: string; days_left: number | null; stage: Stage | null; to_fire: number; fired: number; packed: number; left_out: number; left_out_in_kiln: number; bookings: Booking[] }

type Step = 'shelved' | 'kiln' | 'out';
const STEPS: { key: Step; col: keyof Stage; doLabel: string; doneLabel: string }[] = [
  { key: 'shelved', col: 'shelved_at', doLabel: 'All on the shelf', doneLabel: 'On the shelf' },
  { key: 'kiln', col: 'into_kiln_at', doLabel: 'Dipped, into the kiln', doneLabel: 'Dipped and in the kiln' },
  { key: 'out', col: 'out_of_kiln_at', doLabel: 'Out of the kiln', doneLabel: 'Out of the kiln' },
];

const chalk = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '').toUpperCase();
const when = (n: number | null) =>
  n === null ? '' : n < 0 ? `${-n} day${n === -1 ? '' : 's'} late` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
const who = () => {
  try { return JSON.parse(localStorage.getItem('glazeup_shift') || '{}').name || 'staff'; } catch { return 'staff'; }
};

export default function KilnPage() {
  const router = useRouter();
  const [shelves, setShelves] = useState<Shelf[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [newDate, setNewDate] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<{ booking: Booking; index: number; date: string } | null>(null);
  // [10 Oct] "Did everything fit?" -- asked when a shelf goes into the kiln.
  const [fit, setFit] = useState<{ date: string; picking: boolean } | null>(null);
  const [leftSel, setLeftSel] = useState<Set<string>>(new Set());
  const [scan, setScan] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });
  const camRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/spec/kiln/shelves-by-date`, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setShelves(d.shelves || []);
    } catch {
      setErr('Could not load the shelves. Reload the page to try again.');
      setShelves((s) => s || []);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const step = async (date: string, stage: Step, undo = false) => {
    setBusy(date); setErr(null);
    try {
      const r = await fetch(`${API}/api/spec/batch/${date}/move`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, undo, by: who() }),
      });
      if (!r.ok) throw new Error();
      await load();
    } catch { setErr('Could not save that. Try again.'); } finally { setBusy(null); }
  };

  const changeDate = async (code: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(moveTo)) return;
    setBusy(code); setErr(null);
    try {
      const r = await fetch(`${API}/api/spec/bookings/${encodeURIComponent(code)}/collection-date`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collection_date: moveTo }),
      });
      if (!r.ok) throw new Error();
      setMoving(null); setMoveTo('');
      await load();
    } catch { setErr('Could not change that date. Try again.'); } finally { setBusy(null); }
  };

  const addShelf = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return;
    setBusy('new'); setErr(null);
    try {
      const r = await fetch(`${API}/api/spec/kiln/shelf-dates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: newDate }),
      });
      if (!r.ok) throw new Error();
      setNewDate('');
      await load();
    } catch { setErr('Could not add that shelf. Try again.'); } finally { setBusy(null); }
  };

  const post = async (path: string, body: unknown) => {
    const r = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error();
  };

  // Everything went in, or the picked pieces stay behind and the rest go in.
  const intoKiln = async (date: string, leftIds: string[]) => {
    setBusy(date); setErr(null);
    try {
      if (leftIds.length) await post('/api/spec/kiln/left-out', { piece_ids: leftIds });
      await post(`/api/spec/batch/${date}/move`, { stage: 'kiln', by: who() });
      setFit(null); setLeftSel(new Set()); setScan({ busy: false, note: null });
      await load();
    } catch { setErr('Could not save that. Try again.'); } finally { setBusy(null); }
  };

  const leftovers = async (date: string, ids: string[], stage: 'kiln' | 'unkiln' | 'out' | 'back') => {
    setBusy(`lo-${date}`); setErr(null);
    try {
      if (stage === 'back') await post('/api/spec/kiln/left-out', { piece_ids: ids, undo: true });
      else if (stage === 'unkiln') await post('/api/spec/kiln/leftovers', { piece_ids: ids, stage: 'kiln', undo: true });
      else await post('/api/spec/kiln/leftovers', { piece_ids: ids, stage });
      await load();
    } catch { setErr('Could not save that. Try again.'); } finally { setBusy(null); }
  };

  // Photograph what is still on the shelf; the server says which of the
  // shelf's pieces it can see, and those are ticked for checking.
  const scanShelf = async (shelf: Shelf, file: File) => {
    const ids = shelf.bookings.flatMap((b) => b.pieces.filter((p) => p.stage === 'to_fire').map((p) => p.id));
    setScan({ busy: true, note: null });
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('piece_ids', JSON.stringify(ids));
      const r = await fetch(`${API}/api/spec/kiln/left-out/photo`, { method: 'POST', body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'failed');
      setLeftSel(new Set(d.found || []));
      setScan({ busy: false, note: (d.found || []).length
        ? `Found ${(d.found || []).length} on the shelf. Check the ticks, then save.`
        : 'Could not pick out any pieces. Tick the ones left on the shelf.' });
    } catch {
      setScan({ busy: false, note: 'Could not read the photo. Tick the ones left on the shelf.' });
    }
  };

  if (!shelves) {
    return (
      <PageShell title="Kiln" subtitle="One shelf for each collection date">
        <p style={{ color: 'var(--stone)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}><Loader size={15} className="animate-spin" /> Loading</p>
      </PageShell>
    );
  }

  // The shelf to dip and fire next: the soonest date not yet in the kiln
  // that has something on it.
  const next = shelves.find((s) => s.date !== 'none' && (
    (s.to_fire > s.left_out && !s.stage?.into_kiln_at) || (s.left_out > s.left_out_in_kiln)
  ));

  return (
    <PageShell title="Kiln" subtitle="One shelf for each collection date">
      <p style={{ color: '#6b625a', fontSize: 'var(--text-sm)', lineHeight: 1.5, marginBottom: '0.8rem' }}>
        Chalk the date on the shelf, or print its label. Put that date&apos;s pieces on it, then dip and fire the shelf due first.
      </p>
      {err && <p style={{ color: '#b03a2e', fontSize: 'var(--text-sm)', marginBottom: '0.6rem' }}>{err}</p>}
      <KilnCalendar shelves={shelves} onPick={(date) => {
        setOpen(date);
        setTimeout(() => document.getElementById(`shelf-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      }} />
      {shelves.length === 0 && <p style={{ color: 'var(--stone)' }}>Nothing waiting to be fired.</p>}

      {shelves.map((s) => {
        const isNone = s.date === 'none';
        const isNext = next?.date === s.date;
        const pieces = s.bookings.reduce((n, b) => n + b.pieces.length, 0);
        const done = STEPS.filter((x) => s.stage?.[x.col]);
        const todo = isNone ? null : STEPS.find((x) => !s.stage?.[x.col]);
        const last = done[done.length - 1];
        const late = s.days_left !== null && s.days_left <= 3 && !s.stage?.into_kiln_at && s.to_fire > 0;
        const expanded = open === s.date;
        return (
          <div key={s.date} id={`shelf-${s.date}`} style={{
            background: 'white', borderRadius: 'var(--radius-md)', marginBottom: '0.7rem', overflow: 'hidden', scrollMarginTop: 80,
            border: `${isNext ? 2 : 1}px solid ${isNext ? '#B8562E' : late ? '#b03a2e66' : '#ece5db'}`,
          }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch', padding: '0.8rem 0.9rem 0.6rem' }}>
              {/* What goes on the shelf, as it would be chalked. */}
              <div style={{
                flexShrink: 0, minWidth: 92, borderRadius: 8, background: '#2f3330', color: '#f4f1ea',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.45rem 0.6rem',
              }}>
                {isNone ? (
                  <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)', textAlign: 'center' }}>NO DATE</span>
                ) : (
                  <>
                    <span style={{ fontSize: 10, letterSpacing: 1, opacity: 0.7 }}>COLLECT</span>
                    <span style={{ fontWeight: 800, fontSize: 'var(--text-md)', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{chalk(s.date)}</span>
                  </>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.4rem', alignItems: 'baseline' }}>
                  <span style={{ fontWeight: 700, color: 'var(--charcoal)' }}>
                    {isNone ? 'No collection date yet' : isNext ? 'Dip and fire next' : (last ? last.doneLabel : 'Filling the shelf')}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: late ? '#b03a2e' : '#8a8178', whiteSpace: 'nowrap' }}>{when(s.days_left)}</span>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: '#6b625a', marginTop: '0.2rem' }}>
                  {s.bookings.length === 0
                    ? 'Empty shelf. Move a booking here with "Change date".'
                    : `${pieces} piece${pieces === 1 ? '' : 's'} · ${s.bookings.length} booking${s.bookings.length === 1 ? '' : 's'}`}
                  {s.left_out > 0 && ` · ${s.left_out} left out`}
                  {s.fired > 0 && ` · ${s.fired} already out`}
                  {s.packed > 0 && ` · ${s.packed} packed`}
                </p>
                {isNext && last && (
                  <p style={{ fontSize: 'var(--text-xs)', color: '#3D7A4A', fontWeight: 600, marginTop: '0.15rem' }}>{last.doneLabel}</p>
                )}
              </div>
            </div>

            {/* Only the next step is offered, with an undo for the last one
                done -- the same rule as the shelf sticker's page. */}
            {!isNone && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', padding: '0 0.9rem 0.7rem' }}>
                {todo && s.bookings.length > 0 && (
                  <button disabled={busy === s.date} onClick={() => (todo.key === 'kiln' ? setFit({ date: s.date, picking: false }) : step(s.date, todo.key))}
                    style={{ flex: '1 1 180px', minHeight: 44, borderRadius: 'var(--radius-md)', border: 'none', background: todo.key === 'kiln' ? '#B8562E' : 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                    {busy === s.date ? <Loader size={15} className="animate-spin" /> : todo.key === 'kiln' ? <Flame size={15} /> : <Check size={15} />}
                    {todo.doLabel}
                  </button>
                )}
                <button onClick={() => router.push(`/shelf-stickers?date=${s.date}`)}
                  style={{ minHeight: 44, padding: '0 0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--clay)', background: 'white', color: 'var(--clay)', fontWeight: 600, fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Printer size={14} /> Label
                </button>
                {last && (
                  <button disabled={busy === s.date} onClick={() => step(s.date, last.key, true)}
                    style={{ border: 'none', background: 'none', color: '#A8651A', fontWeight: 700, fontSize: 'var(--text-xs)', padding: '0.3rem' }}>
                    undo &ldquo;{last.doneLabel.toLowerCase()}&rdquo;
                  </button>
                )}
              </div>
            )}

            {fit?.date === s.date && (() => {
              const toFire = s.bookings.flatMap((b) => b.pieces.map((p, i) => ({ p, i, b })).filter((x) => x.p.stage === 'to_fire'));
              return (
                <div style={{ margin: '0 0.9rem 0.8rem', padding: '0.75rem', borderRadius: 'var(--radius-md)', background: '#fbf3ea', border: '1px solid #ecd9c3' }}>
                  {!fit.picking ? (
                    <>
                      <p style={{ fontWeight: 700, color: 'var(--charcoal)', fontSize: 'var(--text-sm)' }}>Did everything on this shelf fit in the kiln?</p>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                        <button disabled={busy === s.date} onClick={() => intoKiln(s.date, [])}
                          style={{ flex: '1 1 160px', minHeight: 44, borderRadius: 'var(--radius-md)', border: 'none', background: '#B8562E', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                          {busy === s.date ? 'Saving' : 'Yes, everything went in'}
                        </button>
                        <button onClick={() => { setFit({ date: s.date, picking: true }); setLeftSel(new Set()); setScan({ busy: false, note: null }); }}
                          style={{ flex: '1 1 160px', minHeight: 44, borderRadius: 'var(--radius-md)', border: '1px solid #B8562E', background: 'white', color: '#B8562E', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                          Some were left out
                        </button>
                      </div>
                      <button onClick={() => setFit(null)} style={{ border: 'none', background: 'none', color: 'var(--stone)', fontSize: 'var(--text-xs)', fontWeight: 600, marginTop: '0.4rem', padding: 0 }}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <p style={{ fontWeight: 700, color: 'var(--charcoal)', fontSize: 'var(--text-sm)' }}>Which pieces are still on the shelf?</p>
                      <p style={{ fontSize: 'var(--text-xs)', color: '#6b625a', marginTop: '0.15rem' }}>
                        Photograph the shelf with what was left, or tick them below. They stay on this shelf for the next firing.
                      </p>
                      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) scanShelf(s, f); e.target.value = ''; }} />
                      <button disabled={scan.busy} onClick={() => camRef.current?.click()}
                        style={{ width: '100%', minHeight: 46, marginTop: '0.55rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                        {scan.busy ? <><Loader size={15} className="animate-spin" /> Looking at the shelf</> : <><Camera size={16} /> Photograph what&apos;s left</>}
                      </button>
                      {scan.note && <p style={{ fontSize: 'var(--text-xs)', color: '#6b625a', marginTop: '0.4rem', fontWeight: 600 }}>{scan.note}</p>}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 88px)', gap: '0.5rem', marginTop: '0.6rem' }}>
                        {toFire.map(({ p, i, b }) => {
                          const on = leftSel.has(p.id);
                          return (
                            <button key={p.id} onClick={() => setLeftSel((cur) => { const n = new Set(cur); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                              style={{ position: 'relative', border: 'none', background: 'none', padding: 0, textAlign: 'left', opacity: on || leftSel.size === 0 ? 1 : 0.55 }}>
                              <PieceThumb url={p.reference_photo_url} box={p.photo_box} size={88} ring={on ? '#B8562E' : PIECE_COLOURS[i % 6]} />
                              {on && <span style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 999, background: '#B8562E', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px white' }}><Check size={14} /></span>}
                              <span style={{ display: 'block', fontSize: 10, color: 'var(--charcoal)', marginTop: 2, lineHeight: 1.2, fontWeight: 600 }}>{b.customer_name.split(' ')[0]}</span>
                              <span style={{ display: 'block', fontSize: 10, color: '#6b625a', lineHeight: 1.2 }}>{(p.description || p.piece_type || 'Piece').slice(0, 40)}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.7rem' }}>
                        <button disabled={busy === s.date || leftSel.size === 0} onClick={() => intoKiln(s.date, Array.from(leftSel))}
                          style={{ flex: '1 1 200px', minHeight: 44, borderRadius: 'var(--radius-md)', border: 'none', background: '#B8562E', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', opacity: leftSel.size ? 1 : 0.5 }}>
                          {busy === s.date ? 'Saving' : `${leftSel.size} left out, the rest into the kiln`}
                        </button>
                        <button onClick={() => setFit(null)} style={{ border: 'none', background: 'none', color: 'var(--stone)', fontSize: 'var(--text-xs)', fontWeight: 600 }}>Cancel</button>
                      </div>
                    </>
                  )}
                </div>
              );
            })()}

            {s.left_out > 0 && (() => {
              const lo = s.bookings.flatMap((b) => b.pieces.map((p, i) => ({ p, i, b })).filter((x) => x.p.stage === 'left_out' || x.p.stage === 'left_out_in_kiln'));
              const waiting = lo.filter((x) => x.p.stage === 'left_out');
              const inKiln = lo.filter((x) => x.p.stage === 'left_out_in_kiln');
              const b2 = busy === `lo-${s.date}`;
              return (
                <div style={{ margin: '0 0.9rem 0.8rem', padding: '0.7rem', borderRadius: 'var(--radius-md)', background: '#fff7e6', border: '1px solid #f0d49a' }}>
                  <p style={{ fontWeight: 700, color: '#8a5a00', fontSize: 'var(--text-sm)' }}>
                    {waiting.length ? `${waiting.length} left out, still on this shelf` : `${inKiln.length} left-out piece${inKiln.length === 1 ? '' : 's'} in the kiln`}
                  </p>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.45rem' }}>
                    {lo.map(({ p, i, b }) => (
                      <button key={p.id} onClick={() => setView({ booking: b, index: i, date: s.date })} style={{ border: 'none', background: 'none', padding: 0 }}>
                        <PieceThumb url={p.reference_photo_url} box={p.photo_box} size={56} ring={p.stage === 'left_out_in_kiln' ? '#B8562E' : '#E0A23C'} />
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.55rem' }}>
                    {waiting.length > 0 ? (
                      <button disabled={b2} onClick={() => leftovers(s.date, waiting.map((x) => x.p.id), 'kiln')}
                        style={{ flex: '1 1 200px', minHeight: 42, borderRadius: 'var(--radius-md)', border: 'none', background: '#B8562E', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                        <Flame size={15} /> {b2 ? 'Saving' : 'These dipped, into the kiln'}
                      </button>
                    ) : (
                      <button disabled={b2} onClick={() => leftovers(s.date, inKiln.map((x) => x.p.id), 'out')}
                        style={{ flex: '1 1 200px', minHeight: 42, borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                        {b2 ? 'Saving' : 'These out of the kiln'}
                      </button>
                    )}
                    {waiting.length > 0 && !s.stage?.out_of_kiln_at && (
                      <button disabled={b2} onClick={() => leftovers(s.date, waiting.map((x) => x.p.id), 'back')}
                        style={{ border: 'none', background: 'none', color: '#A8651A', fontWeight: 700, fontSize: 'var(--text-xs)' }}>
                        went in after all
                      </button>
                    )}
                    {inKiln.length > 0 && waiting.length === 0 && (
                      <button disabled={b2} onClick={() => leftovers(s.date, inKiln.map((x) => x.p.id), 'unkiln')}
                        style={{ border: 'none', background: 'none', color: '#A8651A', fontWeight: 700, fontSize: 'var(--text-xs)' }}>
                        undo &ldquo;in the kiln&rdquo;
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {s.bookings.length > 0 && (
              <button onClick={() => setOpen(expanded ? null : s.date)}
                style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', border: 'none', borderTop: '1px solid #ece5db', background: '#faf7f2', padding: '0.55rem 0.9rem', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--charcoal)' }}>
                {expanded ? 'Hide the pieces' : 'What goes on this shelf'}
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}

            {expanded && s.bookings.map((b) => (
              <div key={b.booking_code} style={{ borderTop: '1px solid #f1ece5', padding: '0.6rem 0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline' }}>
                  <button onClick={() => router.push(`/daily-cards?date=${b.session_start.slice(0, 10)}&code=${encodeURIComponent(b.booking_code)}&open=1`)}
                    style={{ border: 'none', background: 'none', padding: 0, fontWeight: 700, color: 'var(--charcoal)', fontSize: 'var(--text-sm)', textAlign: 'left' }}>
                    {b.customer_name}
                    <span style={{ fontWeight: 400, color: 'var(--stone)', fontSize: 'var(--text-xs)' }}>
                      {' '}painted {new Date(b.session_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{b.postal ? ' · posting' : ''}
                    </span>
                  </button>
                  <button onClick={() => { setMoving(moving === b.booking_code ? null : b.booking_code); setMoveTo(isNone ? '' : s.date); }}
                    style={{ border: 'none', background: 'none', color: 'var(--clay)', fontWeight: 600, fontSize: 'var(--text-xs)', whiteSpace: 'nowrap', padding: '0.2rem' }}>
                    {isNone ? 'Set date' : 'Change date'}
                  </button>
                </div>
                {b.notes && <p style={{ fontSize: 'var(--text-xs)', color: '#b03a2e', fontWeight: 600, marginTop: '0.15rem' }}>{b.notes}</p>}
                {moving === b.booking_code && (
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                    <input type="date" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}
                      style={{ minHeight: 40, padding: '0 0.5rem', borderRadius: 8, border: '1px solid #d8cfc3', color: '#2b2622', background: 'white', fontSize: 'var(--text-sm)' }} />
                    <button disabled={busy === b.booking_code || !moveTo || moveTo === s.date} onClick={() => changeDate(b.booking_code)}
                      style={{ minHeight: 40, padding: '0 0.9rem', borderRadius: 8, border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', opacity: !moveTo || moveTo === s.date ? 0.5 : 1 }}>
                      {busy === b.booking_code ? 'Saving' : 'Move to that shelf'}
                    </button>
                  </div>
                )}
                {/* [10 Oct] Daisy: "see the pieces against the bookings for
                    identification... expandable and zoomable." Big enough to
                    tell two white mugs apart; tap for the full-screen view. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 112px)', gap: '0.6rem', marginTop: '0.5rem' }}>
                  {b.pieces.map((p, i) => (
                    <button key={p.id} onClick={() => setView({ booking: b, index: i, date: s.date })}
                      style={{ border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'zoom-in' }}>
                      <span style={{ position: 'relative', display: 'block', width: 112, height: 112 }}>
                        <PieceThumb url={p.reference_photo_url} box={p.photo_box} size={112} ring={PIECE_COLOURS[i % 6]} />
                        <span style={{ position: 'absolute', top: 4, left: 4, minWidth: 20, height: 20, borderRadius: 999, background: PIECE_COLOURS[i % 6], color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px white' }}>{i + 1}</span>
                        {p.reference_photo_url && <ZoomIn size={16} color="white" style={{ position: 'absolute', right: 6, bottom: 6, filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.7))' }} />}
                      </span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--charcoal)', marginTop: 3, lineHeight: 1.25 }}>
                        {(p.description || p.piece_type || 'Piece').replace(/^./, (c) => c.toUpperCase())}
                      </span>
                      <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: p.stage === 'to_fire' || p.stage.startsWith('left_out') ? '#A8651A' : '#3D7A4A' }}>
                        {p.stage === 'to_fire' ? 'to fire' : p.stage === 'left_out' ? 'left out, on the shelf' : p.stage === 'left_out_in_kiln' ? 'left out, now in the kiln' : p.stage === 'packed' ? 'packed' : 'out of the kiln'}
                        {p.parts > 1 ? ` · ${p.parts} parts` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <div style={{ background: 'white', border: '1px dashed #d8cfc3', borderRadius: 'var(--radius-md)', padding: '0.8rem 0.9rem', marginTop: '0.4rem' }}>
        <p style={{ fontWeight: 700, color: 'var(--charcoal)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Plus size={15} /> Add a shelf for another date
        </p>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.45rem', flexWrap: 'wrap' }}>
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
            style={{ minHeight: 40, padding: '0 0.5rem', borderRadius: 8, border: '1px solid #d8cfc3', color: '#2b2622', background: 'white', fontSize: 'var(--text-sm)' }} />
          <button disabled={!newDate || busy === 'new'} onClick={addShelf}
            style={{ minHeight: 40, padding: '0 0.9rem', borderRadius: 8, border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', opacity: newDate ? 1 : 0.5 }}>
            {busy === 'new' ? 'Adding' : 'Add shelf'}
          </button>
        </div>
      </div>

      {view && (
        <PieceViewer
          booking={view.booking}
          index={view.index}
          date={view.date}
          onIndex={(i) => setView({ ...view, index: i })}
          onClose={() => setView(null)}
        />
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// [10 Oct] KILN CALENDAR. Daisy: "Some form of scheduling would be good...
// like a calendar chart... interactive." Three weeks from two days ago, one
// column a day. Each shelf shows on its collection day, on the day it should
// be fired by (two days before), and on the days it actually went into and
// came out of the kiln. Closed days are shaded. Tap anything to jump to that
// shelf.
const OPEN = new Set([0, 3, 4, 5, 6]); // Sun, Wed-Sat
const FIRE_BY_DAYS = 2;
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoDay(d); };

function KilnCalendar({ shelves, onPick }: { shelves: Shelf[]; onPick: (date: string) => void }) {
  const today = isoDay(new Date());
  const days = Array.from({ length: 21 }, (_, i) => addDays(today, i - 2));
  type Mark = { date: string; kind: 'collect' | 'fireby' | 'in' | 'out' | 'left'; label: string };
  const marks = new Map<string, Mark[]>();
  const put = (day: string, m: Mark) => { if (!marks.has(day)) marks.set(day, []); marks.get(day)!.push(m); };
  for (const s of shelves) {
    if (s.date === 'none') continue;
    const pieces = s.bookings.reduce((n, b) => n + b.pieces.length, 0);
    put(s.date, { date: s.date, kind: 'collect', label: `Collect ${pieces}` });
    if (!s.stage?.into_kiln_at) {
      let fb = addDays(s.date, -FIRE_BY_DAYS);
      if (fb < today) fb = today;
      put(fb, { date: s.date, kind: 'fireby', label: `Fire ${chalk(s.date).split(' ').slice(1).join(' ')}` });
    }
    if (s.stage?.into_kiln_at) put(isoDay(new Date(s.stage.into_kiln_at)), { date: s.date, kind: 'in', label: 'In kiln' });
    if (s.stage?.out_of_kiln_at) put(isoDay(new Date(s.stage.out_of_kiln_at)), { date: s.date, kind: 'out', label: 'Out' });
    if (s.left_out > s.left_out_in_kiln) put(today, { date: s.date, kind: 'left', label: `${s.left_out - s.left_out_in_kiln} left out` });
  }
  const style: Record<Mark['kind'], React.CSSProperties> = {
    collect: { background: '#2f3330', color: '#f4f1ea' },
    fireby: { background: 'white', color: '#B8562E', border: '1px solid #B8562E' },
    in: { background: '#B8562E', color: 'white' },
    out: { background: '#3D7A4A', color: 'white' },
    left: { background: '#fff1cc', color: '#8a5a00', border: '1px solid #f0d49a' },
  };
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ left: 2 * 70 - 8 }); }, []);

  return (
    <div style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.6rem 0 0.5rem', marginBottom: '0.9rem' }}>
      <div ref={scroller} style={{ display: 'flex', overflowX: 'auto', gap: 4, padding: '0 0.6rem', WebkitOverflowScrolling: 'touch' }}>
        {days.map((d) => {
          const dt = new Date(`${d}T12:00:00`);
          const closed = !OPEN.has(dt.getDay());
          const isToday = d === today;
          const ms = marks.get(d) || [];
          return (
            <div key={d} style={{
              flex: '0 0 66px', minHeight: 116, borderRadius: 8, padding: '0.3rem 0.25rem',
              background: closed ? '#f3efe9' : 'white', border: isToday ? '2px solid var(--clay)' : '1px solid #eee6dc',
              opacity: d < today ? 0.6 : 1,
            }}>
              <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: isToday ? 'var(--clay)' : '#8a8178' }}>
                  {isToday ? 'TODAY' : dt.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--charcoal)' }}>{dt.getDate()}</div>
                {closed && <div style={{ fontSize: 9, color: '#a59a8e' }}>closed</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                {ms.map((m, i) => (
                  <button key={i} onClick={() => onPick(m.date)}
                    style={{ ...style[m.kind], borderRadius: 5, fontSize: 9.5, fontWeight: 700, padding: '3px 2px', lineHeight: 1.15, cursor: 'pointer', border: style[m.kind].border || 'none' }}>
                    {m.kind === 'in' && <Flame size={9} style={{ verticalAlign: '-1px', marginRight: 2 }} />}
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 10.5, color: '#8a8178', padding: '0.45rem 0.8rem 0', lineHeight: 1.4 }}>
        <b style={{ color: '#2f3330' }}>Collect</b> day · <b style={{ color: '#B8562E' }}>Fire</b> by, {FIRE_BY_DAYS} days before · <b style={{ color: '#B8562E' }}>In kiln</b> and <b style={{ color: '#3D7A4A' }}>Out</b> when it happened. Tap to jump to the shelf.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// [10 Oct] PIECE VIEWER. Full screen, starting zoomed in on the piece within
// its whole table photo (the original, so zooming stays sharp), with the
// booking's other pieces outlined and numbered for context. Plus and minus
// to zoom, drag to look around, "Whole table" to see it all.
function PieceViewer({ booking, index, date, onIndex, onClose }: {
  booking: Booking; index: number; date: string; onIndex: (i: number) => void; onClose: () => void;
}) {
  const p = booking.pieces[index];
  const box = useRef<HTMLDivElement>(null);
  const [natRaw, setNat] = useState<{ url: string; w: number; h: number } | null>(null);
  const nat = natRaw && natRaw.url === p?.reference_photo_url ? natRaw : null;
  const [mode, setMode] = useState<'piece' | 'table'>('piece');
  const [zoom, setZoom] = useState(1);
  const [cw, setCw] = useState(0);
  const [ch, setCh] = useState(0);

  useEffect(() => { setMode('piece'); setZoom(1); }, [p?.id]);
  useEffect(() => {
    const measure = () => { if (box.current) { setCw(box.current.clientWidth); setCh(box.current.clientHeight); } };
    measure();
    window.addEventListener('resize', measure);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('keydown', esc); };
  }, [onClose]);

  const b = p?.photo_box;
  let W = 0;
  if (nat && cw && ch) {
    const fit = Math.min(cw / nat.w, ch / nat.h);
    let base = fit;
    if (mode === 'piece' && b) {
      const bw = Math.max(0.02, (b.right_pct - b.left_pct) / 100);
      const bh = Math.max(0.02, (b.bottom_pct - b.top_pct) / 100);
      base = Math.min((cw * 0.8) / (bw * nat.w), (ch * 0.8) / (bh * nat.h));
    }
    W = Math.min(nat.w * 3, Math.max(nat.w * fit, nat.w * base * zoom));
  }
  const H = nat ? (W * nat.h) / nat.w : 0;

  // Centre the piece once the size is known.
  useEffect(() => {
    const el = box.current;
    if (!el || !W || !b) return;
    const cx = ((b.left_pct + b.right_pct) / 200) * W;
    const cy = ((b.top_pct + b.bottom_pct) / 200) * H;
    el.scrollTo({ left: Math.max(0, cx - el.clientWidth / 2), top: Math.max(0, cy - el.clientHeight / 2) });
  }, [W, H, b, mode]);

  if (!p) return null;
  const same = booking.pieces.map((q, i) => ({ q, i })).filter((x) => x.q.reference_photo_url && x.q.reference_photo_url === p.reference_photo_url && x.q.photo_box);
  const btn: React.CSSProperties = { minWidth: 44, minHeight: 44, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.14)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontWeight: 700, fontSize: 13, padding: '0 0.7rem' };

  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#141413', display: 'flex', flexDirection: 'column', color: 'white' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: 'max(0.7rem, env(safe-area-inset-top)) 0.8rem 0.6rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{booking.customer_name}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            Piece {index + 1} of {booking.pieces.length} · painted {new Date(booking.session_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            {date !== 'none' ? ` · collect ${chalk(date).toLowerCase()}` : ''}
          </div>
        </div>
        <button aria-label="Close" onClick={onClose} style={btn}><X size={20} /></button>
      </div>

      <div ref={box} style={{ flex: 1, overflow: 'auto', position: 'relative', touchAction: 'pan-x pan-y pinch-zoom', background: '#0c0c0b' }}>
        {p.reference_photo_url ? (
          <div style={{ position: 'relative', width: W || '100%', height: H || 'auto', margin: W && W < cw ? '0 auto' : 0, marginTop: H && H < ch ? (ch - H) / 2 : 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.reference_photo_url} alt={p.description || p.piece_type || 'piece'} draggable={false}
              onLoad={(e) => setNat({ url: p.reference_photo_url as string, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              style={{ display: 'block', width: W || '100%', height: H || 'auto', userSelect: 'none' }} />
            {W > 0 && same.map(({ q, i }) => {
              const qb = q.photo_box!;
              const on = q.id === p.id;
              return (
                <button key={q.id} onClick={() => onIndex(i)} aria-label={`Piece ${i + 1}`}
                  style={{
                    position: 'absolute', left: `${qb.left_pct}%`, top: `${qb.top_pct}%`,
                    width: `${qb.right_pct - qb.left_pct}%`, height: `${qb.bottom_pct - qb.top_pct}%`,
                    border: `${on ? 3 : 2}px solid ${PIECE_COLOURS[i % 6]}`, borderRadius: 6, background: 'transparent',
                    boxShadow: on ? '0 0 0 2px rgba(255,255,255,0.9)' : 'none', opacity: on ? 1 : 0.7, padding: 0, cursor: 'pointer',
                  }}>
                  <span style={{ position: 'absolute', top: -10, left: -10, minWidth: 20, height: 20, borderRadius: 999, background: PIECE_COLOURS[i % 6], color: 'white', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px white' }}>{i + 1}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>No photo of this piece yet</div>
        )}
      </div>

      <div style={{ padding: '0.6rem 0.8rem max(0.8rem, env(safe-area-inset-bottom))' }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{(p.description || p.piece_type || 'Piece').replace(/^./, (c) => c.toUpperCase())}</div>
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
          {p.stage === 'to_fire' ? 'To fire' : p.stage === 'left_out' ? 'Left out, on the shelf' : p.stage === 'left_out_in_kiln' ? 'Left out, now in the kiln' : p.stage === 'packed' ? 'Packed' : 'Out of the kiln'}
          {p.parts > 1 ? ` · ${p.parts} parts, keep together` : ''}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
          <button aria-label="Previous piece" disabled={index === 0} onClick={() => onIndex(index - 1)} style={{ ...btn, opacity: index === 0 ? 0.35 : 1 }}><ChevronLeft size={20} /></button>
          <button aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.25, z / 1.5))} style={btn}><Minus size={18} /></button>
          <button aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(6, z * 1.5))} style={btn}><Plus size={18} /></button>
          <button onClick={() => { setMode(mode === 'piece' ? 'table' : 'piece'); setZoom(1); }} style={btn}>
            <Maximize2 size={15} /> {mode === 'piece' ? 'Whole table' : 'This piece'}
          </button>
          <span style={{ flex: 1 }} />
          <button aria-label="Next piece" disabled={index >= booking.pieces.length - 1} onClick={() => onIndex(index + 1)} style={{ ...btn, opacity: index >= booking.pieces.length - 1 ? 0.35 : 1 }}><ChevronRight size={20} /></button>
        </div>
      </div>
    </div>
  );
}
