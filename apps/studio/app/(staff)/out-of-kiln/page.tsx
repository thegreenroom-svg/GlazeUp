'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { Collapse, Count, Section, Tool, Toolbar } from '@/components/Toolbar';
import { Row, RowAction, Chip } from '@/components/Row';
import { Camera, Loader, Boxes, HelpCircle, Layers, Check, Search, X } from 'lucide-react';
import { BeforeAfter, PieceThumb, PieceBox } from '@/components/PieceBoxes';

// Daisy's kiln-unloading step, in her words: pieces come out into
// numbered boxes, "not too tightly, leaving some separation, obviously
// for carrying purposes too", and photographed "from an angle more or
// less above, say forty five degrees down".
//
// The guidance is ON the screen rather than in anyone's head, because
// this is the one step where doing it badly is invisible until packing
// day: a tightly packed box photographs as a jumble of rims, and the
// pieces underneath are simply never seen again by the app.
//
// No sorting happens here. Pieces go in as they come out of the kiln,
// in any order. The app does the reassembly afterwards.
//
// [14 Oct] AN UNLOAD IS SEVERAL PHOTOS, NOT ONE.
//
// David, unloading: "I need to add all the photos up as I take them,
// because I might add a few extra as I go and then do the whole table
// again, but you need to bunch them all up into one grouping."
//
// Each photo used to stand alone. You photographed a box, saw what was
// found, photographed the next, and the first result vanished -- so there
// was never a moment where the app knew a kiln had been emptied, only a
// series of unrelated sightings. And nothing marked the shelf as out,
// which is what turns its pieces ready, so that had to be remembered
// separately over on the Kiln screen.
//
// The grouping already existed and this screen simply wasn't using it: a
// shelf. One is opened when the unload starts, every photo is attached to
// it, and what has been found accumulates across all of them. Closing it
// marks the shelf out of the kiln, which is the one action that moves
// every piece on it to ready.

interface FoundPiece {
  id: string;
  piece_type: string | null;
  description: string | null;
  /** The piece as it was on the table, before firing. */
  reference_photo_url?: string | null;
  photo_box?: PieceBox | null;
  /** Where it sits in the box photo just taken, after firing. */
  box?: PieceBox | null;
  /** That box photo, kept locally -- the server never sends it back. */
  shot_url?: string | null;
  /** The sweep that found it, so this match can be rejected. */
  sweep_id?: string | null;
}
interface FoundBooking {
  booking_code: string;
  customer_name: string;
  found: number;
  total_in_booking: number;
  pieces: FoundPiece[];
  missing: FoundPiece[];
}
interface Shelf { id: string; label: string }

export default function OutOfKilnPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The open unload. Null until someone starts one.
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [starting, setStarting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState<number | null>(null);

  // Accumulated across every photo in this unload, deduped by piece id so
  // a piece that shows in two shots is not counted twice.
  const [found, setFound] = useState<FoundBooking[]>([]);
  const [shots, setShots] = useState(0);
  const [lastShot, setLastShot] = useState<{ box: string | null; date: string | null; found: number } | null>(null);
  const [candidates, setCandidates] = useState(0);

  const [rejecting, setRejecting] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [boxTyped, setBoxTyped] = useState('');
  const [numOpen, setNumOpen] = useState(false);

  const API = process.env.NEXT_PUBLIC_API_URL;

  // Opening the unload. The label is only a human handle -- what groups the
  // photos is the shelf's id -- so the typed box number is used when there
  // is one and today's date when there is not.
  const startUnload = async () => {
    setStarting(true);
    setError(null);
    try {
      const label = boxTyped.trim()
        ? `Box ${boxTyped.trim()}`
        : `Out ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
      const res = await fetch(`${API}/api/spec/kiln/shelves`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not start the unload');
      setShelf({ id: d.id, label: d.label || label });
      setFound([]);
      setShots(0);
      setClosed(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the unload');
    } finally {
      setStarting(false);
    }
  };

  // One photo. Attached to the open shelf, and merged into what is already
  // found rather than replacing it.
  const send = async (file: File) => {
    if (!shelf) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('shelf_id', shelf.id);
      if (boxTyped.trim()) fd.append('box_number', boxTyped.trim());
      const res = await fetch(`${API}/api/spec/shelf/sweep`, { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not read the box');

      // The box photo itself, kept in the browser. The server archives it
      // but does not hand it back, and the comparison needs the fired side.
      const shotUrl = URL.createObjectURL(file);
      const fresh: FoundBooking[] = (d.bookings || []).map((b: FoundBooking) => ({
        ...b,
        missing: b.missing || [],
        pieces: (b.pieces || []).map((q) => ({ ...q, shot_url: shotUrl, sweep_id: d.sweep_id || null })),
      }));
      setFound((prev) => {
        const byCode = new Map(prev.map((b) => [b.booking_code, { ...b, pieces: [...b.pieces] }]));
        for (const b of fresh) {
          const cur = byCode.get(b.booking_code);
          if (!cur) { byCode.set(b.booking_code, { ...b, pieces: [...b.pieces], missing: [...(b.missing || [])] }); continue; }
          // Same piece seen in a second photo is still one piece.
          const seen = new Set(cur.pieces.map((p) => p.id));
          for (const p of b.pieces) if (!seen.has(p.id)) { cur.pieces.push(p); seen.add(p.id); }
          cur.found = cur.pieces.length;
          cur.total_in_booking = b.total_in_booking || cur.total_in_booking;
          // Anything now found stops being missing, so the list shrinks as
          // more boxes are photographed rather than repeating itself.
          cur.missing = (b.missing || []).filter((m) => !seen.has(m.id));
        }
        return Array.from(byCode.values()).sort((a, b) => a.customer_name.localeCompare(b.customer_name));
      });
      setShots((n) => n + 1);
      setLastShot({
        box: (d.box_number_read || '').trim() || null,
        date: (d.shelf_date_read || '').trim() || null,
        found: fresh.reduce((n: number, b: FoundBooking) => n + b.found, 0),
      });
      setCandidates(d.candidates || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the box');
    } finally {
      setBusy(false);
    }
  };

  // [14 Oct] SAYING NO TO A PAIR. The comparison is only worth showing if
  // disagreeing with it does something. A rejected piece comes off the
  // shelf, so when the shelf is marked out of the kiln it is not waved
  // through to packing with the rest of the group, and it goes back to
  // being unfound so somebody looks for the real one.
  const reject = async (b: FoundBooking, p: FoundPiece) => {
    if (!p.sweep_id) return;
    setRejecting(p.id);
    try {
      await fetch(`${API}/api/spec/shelf/sweeps/${p.sweep_id}/reject/${p.id}`, { method: 'POST' });
      setFound((prev) => prev.map((x) => {
        if (x.booking_code !== b.booking_code) return x;
        const pieces = x.pieces.filter((q) => q.id !== p.id);
        // Back into the missing list, which is where it now belongs.
        const missing = x.missing.some((m) => m.id === p.id)
          ? x.missing
          : [...x.missing, { id: p.id, piece_type: p.piece_type, description: p.description, reference_photo_url: p.reference_photo_url, photo_box: p.photo_box }];
        return { ...x, pieces, missing, found: pieces.length };
      }).filter((x) => x.pieces.length > 0 || x.missing.length > 0));
    } catch {
      setError('Could not reject that match. It is still on the shelf.');
    } finally {
      setRejecting(null);
      setConfirming(null);
    }
  };

  // Closing it. This is the step that was missing: marking the shelf out of
  // the kiln is what moves every piece on it to ready.
  const finishUnload = async () => {
    if (!shelf) return;
    setClosing(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/spec/kiln/shelves/${shelf.id}/out`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not mark it out of the kiln');
      setClosed(totalFound);
      setShelf(null);
      setFound([]);
      setShots(0);
      setLastShot(null);
      setBoxTyped('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark it out of the kiln');
    } finally {
      setClosing(false);
    }
  };

  const totalFound = found.reduce((n, b) => n + b.found, 0);
  const whole = found.filter((b) => b.found === b.total_in_booking).length;

  return (
    <PageShell title="Out of the kiln" subtitle="Box it up, photograph it, carry on" back="/collect">
      {/* [6 Sep] The batch picker lived here for about three hours.
          It was added to stop the sweep searching the wrong 80 pieces,
          then removed because the honest fix was to stop capping at 80
          -- not to ask someone holding a box which shelf they are
          looking at. The whole pool is searched now.

          [11 Oct] And the how-to moved below the camera, folded into one
          line. Seven bullets of guidance above the button is right for the
          first box anyone ever does and wrong for the two hundredth: it
          put the one thing this screen is for below the fold. */}

      {closed !== null && (
        <div style={{ background: '#F4F8F4', border: '1px solid #CDE3CD', borderRadius: 'var(--radius-md)', padding: '0.8rem', marginBottom: '0.9rem' }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#2E7D32', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Check size={16} /> Out of the kiln. {closed} piece{closed === 1 ? '' : 's'} are ready to pack.
          </p>
        </div>
      )}

      {!shelf ? (
        <>
          <button
            onClick={startUnload}
            disabled={starting}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', padding: '0.95rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-lg)', cursor: starting ? 'default' : 'pointer', minHeight: 56, opacity: starting ? 0.7 : 1 }}
          >
            {starting ? <Loader size={18} className="animate-spin" /> : <Boxes size={18} />}
            {starting ? 'Starting…' : 'Start unloading'}
          </button>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', margin: '0.5rem 0 0.8rem' }}>
            Take as many photos as you need. They all go together, and nothing counts as out of the kiln until you say so.
          </p>
        </>
      ) : (
        <>
          <label
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', padding: '0.95rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-lg)', cursor: busy ? 'default' : 'pointer', minHeight: 56, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? <Loader size={18} className="animate-spin" /> : <Camera size={18} />}
            {busy ? 'Reading the box…' : shots === 0 ? 'Photograph the box' : 'Photograph another'}
            <input
              type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) send(f);
                e.target.value = '';
              }}
            />
          </label>

          {/* What this unload has gathered so far, across every photo. */}
          <Toolbar style={{ marginTop: '0.6rem' }}>
            <Count>
              {shelf.label} · {shots} photo{shots === 1 ? '' : 's'} · {totalFound} piece{totalFound === 1 ? '' : 's'}
            </Count>
            <Tool onClick={() => setNumOpen((v) => !v)} active={numOpen || !!boxTyped.trim()} tone="dark">
              {boxTyped.trim() ? `Box ${boxTyped.trim()}` : 'Type the box number'}
            </Tool>
          </Toolbar>

          {numOpen && (
            <input
              autoFocus
              value={boxTyped}
              onChange={(e) => setBoxTyped(e.target.value)}
              inputMode="numeric"
              placeholder="Box number, e.g. 7"
              style={{ width: '100%', padding: '0.7rem', minHeight: 44, marginBottom: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid #d8cbbc', fontSize: 'var(--text-base)', background: 'white', color: 'var(--charcoal)' }}
            />
          )}

          {/* The last photo's own result, so a bad shot is obvious straight
              away rather than hiding inside the running total. */}
          {lastShot && (
            <p style={{ fontSize: 'var(--text-xs)', color: lastShot.found ? 'var(--muted)' : 'var(--warning)', margin: '0 0 0.7rem' }}>
              {lastShot.found
                ? `Last photo found ${lastShot.found}`
                : 'Last photo recognised nothing. Try more space between the pieces, or a little more light.'}
              {lastShot.box && ` · read box ${lastShot.box}`}
              {lastShot.date && ` · shelf chalked ${lastShot.date}`}
              {candidates ? ` · ${candidates} still waiting` : ''}
            </p>
          )}
        </>
      )}

      {error && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', marginBottom: '0.7rem' }}>{error}</p>
      )}

      {found.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <Section n={found.length} right={whole ? <span style={{ color: '#2E7D32', fontWeight: 700, fontSize: 'var(--text-xs)' }}>{whole} complete</span> : undefined}>
            Found so far
          </Section>
          {found.map((b) => {
            const all = b.found === b.total_in_booking;
            return (
              <div key={b.booking_code} style={{ marginBottom: '0.5rem' }}>
                <Row
                  title={b.customer_name}
                  tone={all ? 'done' : 'plain'}
                  chips={<Chip tone={all ? 'good' : 'warn'}>{all ? `All ${b.found}` : `${b.found} of ${b.total_in_booking}`}</Chip>}
                  onClick={() => router.push(`/booking/${encodeURIComponent(b.booking_code)}`)}
                  action={<RowAction onClick={() => router.push(`/packing?code=${encodeURIComponent(b.booking_code)}`)}>Pack</RowAction>}
                />
                {/* Unfired on the left, fired on the right. The pair is the
                    evidence for the match, so it sits with the booking it
                    belongs to rather than behind a tap. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', padding: '0 0 0 0.3rem' }}>
                  {b.pieces.map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minHeight: 44 }}>
                      <BeforeAfter before={p.reference_photo_url} beforeBox={p.photo_box} after={p.shot_url} afterBox={p.box} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-xs)', color: '#6b625a' }}>
                        <b style={{ color: 'var(--charcoal)', textTransform: 'capitalize' }}>{p.piece_type || 'Piece'}</b>
                        {p.description ? ` · ${p.description}` : ''}
                      </span>
                      {/* Confirmed in two taps, because a reject that fires on
                          a stray thumb would send good pottery back to being
                          lost. Nothing is confirmed the other way: agreeing
                          with the app is the default, and the pair above is
                          how you check it. */}
                      {confirming === p.id ? (
                        <span style={{ display: 'inline-flex', gap: '0.3rem', flexShrink: 0 }}>
                          <Tool onClick={() => reject(b, p)} tone="late" small disabled={rejecting === p.id}>
                            {rejecting === p.id ? 'Removing' : 'Not this'}
                          </Tool>
                          <Tool onClick={() => setConfirming(null)} small>Keep</Tool>
                        </span>
                      ) : (
                        <Tool onClick={() => setConfirming(p.id)} small label="Wrong match" icon={<X size={13} />} />
                      )}
                    </div>
                  ))}
                  {/* The cross-reference. Not a count of what is absent but a
                      picture of it, while the shelves are still to hand. */}
                  {b.missing.length > 0 && (
                    <div style={{ marginTop: '0.15rem', paddingTop: '0.35rem', borderTop: '1px dashed #e6ddd2' }}>
                      <p style={{ margin: '0 0 0.3rem', fontSize: 'var(--text-xs)', fontWeight: 700, color: '#A6761D', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Search size={12} /> Not in the box yet
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {b.missing.map((m) => (
                          <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            <PieceThumb url={m.reference_photo_url} box={m.photo_box} size={44} ring="#E0B872" />
                            <span style={{ fontSize: 'var(--text-xs)', color: '#8a6a2a', maxWidth: 110 }}>
                              {m.description || m.piece_type || 'piece'}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* The step that was missing. Everything above is a record of what was
          seen; this is what actually moves the pottery on. */}
      {shelf && shots > 0 && (
        <button
          onClick={finishUnload}
          disabled={closing}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', padding: '0.9rem', borderRadius: 'var(--radius-md)', border: 'none', background: '#2E7D32', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: closing ? 'default' : 'pointer', minHeight: 52, marginBottom: '1rem', opacity: closing ? 0.7 : 1 }}
        >
          {closing ? <Loader size={16} className="animate-spin" /> : <Check size={16} />}
          {closing ? 'Marking…' : `That's it all out (${totalFound} piece${totalFound === 1 ? '' : 's'} ready)`}
        </button>
      )}

      <Toolbar>
        <Tool onClick={() => router.push('/shelves')} icon={<Boxes size={15} />}>Kiln photos</Tool>
        <Tool onClick={() => router.push('/packing')} icon={<Layers size={15} />}>Packing</Tool>
        <Tool onClick={() => router.push('/kiln')}>Kiln</Tool>
      </Toolbar>

      <Collapse summary="How to pack and photograph a box" icon={<HelpCircle size={16} color="#8a8178" />}>
        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: '#8a8178', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.2rem 0 0.4rem' }}>
          Packing
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Pieces go in as they come out. No sorting — the app works out whose is whose afterwards.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Pack loosely, with a gap between pieces. Nothing touching, nothing stacked out of sight.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            A box you can carry safely is about right — the same spacing that protects the pottery is what lets every piece be seen.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Write the box number big and bold on every face.
          </li>
        </ul>
        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: '#8a8178', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.9rem 0 0.4rem' }}>
          The photo
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Stand above the box and tilt down about 45 degrees — not flat overhead, not from the side.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            That angle shows the top and the side of each piece, which is what makes them recognisable.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Get the whole box in shot, including the number written on it.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Take as many as you like. Extra angles and a shot of the whole table all count toward the same unload.
          </li>
        </ul>
      </Collapse>
    </PageShell>
  );
}
