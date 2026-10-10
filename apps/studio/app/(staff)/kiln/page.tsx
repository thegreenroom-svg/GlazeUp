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

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { PieceThumb, PIECE_COLOURS } from '@/components/PieceBoxes';
import { Check, ChevronDown, ChevronUp, Flame, Loader, Plus, Printer } from 'lucide-react';

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
interface Shelf { date: string; days_left: number | null; stage: Stage | null; to_fire: number; fired: number; packed: number; bookings: Booking[] }

type Step = 'shelved' | 'kiln' | 'out';
const STEPS: { key: Step; col: keyof Stage; doLabel: string; doneLabel: string }[] = [
  { key: 'shelved', col: 'shelved_at', doLabel: 'All on the shelf', doneLabel: 'On the shelf' },
  { key: 'kiln', col: 'into_kiln_at', doLabel: 'Dipped, into the kiln', doneLabel: 'Dipped and in the kiln' },
  { key: 'out', col: 'out_of_kiln_at', doLabel: 'Out of the kiln', doneLabel: 'Out of the kiln' },
];

const chalk = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
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

  if (!shelves) {
    return (
      <PageShell title="Kiln" subtitle="One shelf for each collection date">
        <p style={{ color: 'var(--stone)', display: 'flex', gap: '0.4rem', alignItems: 'center' }}><Loader size={15} className="animate-spin" /> Loading</p>
      </PageShell>
    );
  }

  // The shelf to dip and fire next: the soonest date not yet in the kiln
  // that has something on it.
  const next = shelves.find((s) => s.date !== 'none' && s.to_fire > 0 && !s.stage?.into_kiln_at);

  return (
    <PageShell title="Kiln" subtitle="One shelf for each collection date">
      <p style={{ color: '#6b625a', fontSize: 'var(--text-sm)', lineHeight: 1.5, marginBottom: '0.8rem' }}>
        Chalk the date on the shelf, or print its label. Put that date&apos;s pieces on it, then dip and fire the shelf due first.
      </p>
      {err && <p style={{ color: '#b03a2e', fontSize: 'var(--text-sm)', marginBottom: '0.6rem' }}>{err}</p>}
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
          <div key={s.date} style={{
            background: 'white', borderRadius: 'var(--radius-md)', marginBottom: '0.7rem', overflow: 'hidden',
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
                  <button disabled={busy === s.date} onClick={() => step(s.date, todo.key)}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.45rem' }}>
                  {b.pieces.map((p, i) => (
                    <div key={p.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <PieceThumb url={p.reference_photo_url} box={p.photo_box} size={44} ring={PIECE_COLOURS[i % 6]} />
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--charcoal)', margin: 0 }}>
                          {(p.description || p.piece_type || 'Piece').replace(/^./, (c) => c.toUpperCase())}
                        </p>
                        <p style={{ fontSize: 11, margin: 0, fontWeight: 600, color: p.stage === 'to_fire' ? '#A8651A' : '#3D7A4A' }}>
                          {p.stage === 'to_fire' ? 'to fire' : p.stage === 'packed' ? 'packed' : 'out of the kiln'}
                          {p.parts > 1 ? ` · ${p.parts} parts, keep together` : ''}
                        </p>
                      </div>
                    </div>
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
    </PageShell>
  );
}
