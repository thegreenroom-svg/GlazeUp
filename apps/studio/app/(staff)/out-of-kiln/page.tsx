'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { Collapse, Count, Section, Tool, Toolbar } from '@/components/Toolbar';
import { Row, RowAction, Chip } from '@/components/Row';
import { ArrowRight, Camera, Loader, Boxes, HelpCircle, Layers, Check, HelpingHand, Search, X } from 'lucide-react';
import { BeforeAfter, PieceThumb, PieceBox } from '@/components/PieceBoxes';
import { PieceViewer, ViewerPiece } from '@/components/PieceViewer';

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
// The grouping already existed and this screen simply wasn't using it: a
// shelf. One is opened when the unload starts, every photo is attached to
// it, and what has been found accumulates across all of them. Closing it
// marks the shelf out of the kiln, which is the one action that moves
// every piece on it to ready.
//
// [14 Oct, later] AND IT ASKS, RATHER THAN WAITING TO BE TOLD.
//
// David: "photographs top shelf, photograph second shelf, etc. until the
// kiln's empty... if there are any pieces unidentified that may be half
// pieces, bases, lids, that weren't in the photo originally, as separated,
// or pieces that aren't identified need to be flagged at that stage, so
// there's another prompt there. Please identify or put aside for
// identification later."
//
// So the screen counts the shelves out loud -- top shelf, second shelf,
// third -- and after each photo it asks about anything it could not name.
// Two answers, both one tap: say what it is, or put it in the tray. The
// kiln is not signed off as empty while the tray still has something in
// it, which is the whole point: the piece nobody can name is exactly the
// piece that gets left behind.
//
// The whole unload survives a page refresh. It is the longest single job
// in the studio and it happens standing up, holding a phone, in a room
// where the wifi is poor.

interface FoundPiece {
  id: string;
  piece_type: string | null;
  description: string | null;
  /** The piece as it was on the table, before firing. */
  reference_photo_url?: string | null;
  photo_box?: PieceBox | null;
  /** Where it sits in the kiln photo just taken, after firing. */
  box?: PieceBox | null;
  /** That kiln photo, as archived by the server. */
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
/** Pottery in the photo that the AI could not put a name to. */
interface Unplaced {
  key: string;
  description: string;
  reason: string | null;
  maybe: {
    id: string; piece_type: string | null; description: string | null;
    booking_code: string; customer_name: string;
    reference_photo_url: string | null; photo_box: PieceBox | null;
  } | null;
  box: PieceBox | null;
  /** The photo it was seen in, and the sweep, so it can be assigned. */
  shot_url: string | null;
  sweep_id: string | null;
  /** Which shelf of the kiln this came off, for the tray. */
  shelf_no: number;
}
interface Shelf { id: string; label: string }

// David counts them from the top down, so the screen does too.
const ORDINAL = ['top', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const shelfName = (n: number) => (n <= ORDINAL.length ? `${ORDINAL[n - 1]} shelf` : `shelf ${n}`);
const REASON: Record<string, string> = {
  part: 'Looks like part of something — a lid, a base, a half',
  unsure: 'Nearly matched, not confidently enough',
  'no match': 'Matches nothing that is waiting',
  obscured: 'Too far back or too dark to judge',
};
const STORE = 'glazeup_unload';

export default function OutOfKilnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The open unload. Null until someone starts one.
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [starting, setStarting] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);

  // Which shelf of the kiln is being emptied right now.
  const [shelfNo, setShelfNo] = useState(1);

  // Accumulated across every photo in this unload, deduped by piece id so
  // a piece that shows in two shots is not counted twice.
  const [found, setFound] = useState<FoundBooking[]>([]);
  const [shots, setShots] = useState(0);
  const [lastShot, setLastShot] = useState<{ box: string | null; date: string | null; found: number; clipped: number } | null>(null);
  const [candidates, setCandidates] = useState(0);

  // Asked about straight after the photo, and whatever is not settled
  // there goes in the tray.
  const [asking, setAsking] = useState<Unplaced[]>([]);
  const [tray, setTray] = useState<Unplaced[]>([]);
  const [identifying, setIdentifying] = useState<Unplaced | null>(null);
  const [assigning, setAssigning] = useState<string | null>(null);

  const [rejecting, setRejecting] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [boxTyped, setBoxTyped] = useState('');
  const [numOpen, setNumOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // [14 Oct] David: "want to be able to selects and expand all images zoom
  // etc." Here it matters most on the pairs: deciding whether the chalky
  // thing on the table and the glossy thing in the box are the same piece is
  // exactly the judgement a 56px square cannot support. Tapping one opens
  // both full screen, before then after, with the zoom.
  const [viewer, setViewer] = useState<null | { pieces: ViewerPiece[]; start: number; title: string }>(null);

  const API = process.env.NEXT_PUBLIC_API_URL;

  // An unload outlives the page. Everything here is either a server URL or
  // a plain value, so what comes back after a refresh is the real thing
  // rather than a set of dead blob links.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const d = JSON.parse(raw);
        if (d?.shelf?.id) {
          setShelf(d.shelf); setShelfNo(d.shelf_no || 1); setFound(d.found || []);
          setTray(d.tray || []); setShots(d.shots || 0); setBoxTyped(d.box || '');
        }
      }
    } catch { /* a corrupt entry is not worth failing the page for */ }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      if (shelf) localStorage.setItem(STORE, JSON.stringify({ shelf, shelf_no: shelfNo, found, tray, shots, box: boxTyped }));
      else localStorage.removeItem(STORE);
    } catch { /* private browsing, a full disk -- the unload still works */ }
  }, [restored, shelf, shelfNo, found, tray, shots, boxTyped]);

  // Opening the unload. The label is only a human handle -- what groups the
  // photos is the shelf's id -- so the typed box number is used when there
  // is one and today's date when there is not.
  const startUnload = useCallback(async () => {
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
      setFound([]); setTray([]); setAsking([]); setShots(0); setShelfNo(1); setClosed(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the unload');
    } finally {
      setStarting(false);
    }
  }, [API, boxTyped]);

  // Arriving from the kiln screen with a firing that has just finished:
  // the unload opens itself rather than asking for one more tap from
  // someone whose hands are full.
  useEffect(() => {
    if (!restored || shelf || starting) return;
    if (searchParams.get('start') !== '1') return;
    void startUnload();
    // Once only -- the query string stays in the URL after a refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored]);

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
      if (!res.ok) throw new Error(d.error || 'Could not read the shelf');

      const shotUrl: string | null = d.photo_url || null;
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
          // more shelves are photographed rather than repeating itself.
          cur.missing = (b.missing || []).filter((m) => !seen.has(m.id));
        }
        return Array.from(byCode.values()).sort((a, b) => a.customer_name.localeCompare(b.customer_name));
      });
      // The prompt David asked for, raised at the moment the piece is still
      // within arm's reach. Anything already in the tray is not asked twice.
      const inTray = new Set(tray.map((t) => t.key));
      setAsking((d.unplaced || [])
        .filter((u: Unplaced) => !inTray.has(u.key))
        .map((u: Unplaced) => ({ ...u, shot_url: shotUrl, sweep_id: d.sweep_id || null, shelf_no: shelfNo })));
      setShots((n) => n + 1);
      setLastShot({
        box: (d.box_number_read || '').trim() || null,
        date: (d.shelf_date_read || '').trim() || null,
        found: fresh.reduce((n: number, b: FoundBooking) => n + b.found, 0),
        clipped: d.clipped_dropped || 0,
      });
      setCandidates(d.candidates || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the shelf');
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

  // Saying what something is. Written exactly as a confident match would
  // have been, so the piece travels to packing with the rest of its
  // booking and carries this photo as where it was last seen.
  const assign = async (u: Unplaced, pieceId: string, code: string) => {
    if (!u.sweep_id) return;
    setAssigning(pieceId);
    try {
      const res = await fetch(`${API}/api/spec/shelf/sweeps/${u.sweep_id}/assign/${pieceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ box: u.box, shelf_id: shelf?.id || null, by: whoAmI() }),
      });
      if (!res.ok) throw new Error();
      setFound((prev) => prev.map((b) => {
        if (b.booking_code !== code) return b;
        const m = b.missing.find((x) => x.id === pieceId);
        const pieces = [...b.pieces, {
          id: pieceId,
          piece_type: m?.piece_type ?? u.maybe?.piece_type ?? null,
          description: m?.description ?? u.maybe?.description ?? u.description,
          reference_photo_url: m?.reference_photo_url ?? u.maybe?.reference_photo_url ?? null,
          photo_box: m?.photo_box ?? u.maybe?.photo_box ?? null,
          box: u.box, shot_url: u.shot_url, sweep_id: u.sweep_id,
        }];
        return { ...b, pieces, found: pieces.length, missing: b.missing.filter((x) => x.id !== pieceId) };
      }));
      setAsking((prev) => prev.filter((x) => x.key !== u.key));
      setTray((prev) => prev.filter((x) => x.key !== u.key));
      setIdentifying(null);
    } catch {
      setError('Could not record that. Try again, or put it aside for now.');
    } finally {
      setAssigning(null);
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
      setShelf(null); setFound([]); setTray([]); setAsking([]);
      setShots(0); setShelfNo(1); setLastShot(null); setBoxTyped(''); setLeaving(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark it out of the kiln');
    } finally {
      setClosing(false);
    }
  };

  const totalFound = found.reduce((n, b) => n + b.found, 0);
  const whole = found.filter((b) => b.found === b.total_in_booking).length;
  // Everything still waiting that this unload has not found, which is what
  // an unknown piece is almost always one of.
  const stillMissing = found.flatMap((b) => b.missing.map((m) => ({ m, b })));

  // One unknown item, as a crop of the photo it was seen in.
  const UnplacedRow = ({ u, inTray }: { u: Unplaced; inTray: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', padding: '0.4rem 0', borderTop: '1px solid #f1e9dd' }}>
      <button
        onClick={() => setViewer({ title: u.description, start: 0, pieces: [{ photo: u.shot_url, box: u.box, piece_type: u.description, description: (u.reason && REASON[u.reason]) || null, note: `${shelfName(u.shelf_no)}` }] })}
        aria-label="Open this photo"
        style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', display: 'block', flexShrink: 0 }}
      >
        <PieceThumb url={u.shot_url} box={u.box} size={52} ring="#A6761D" />
      </button>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--charcoal)' }}>{u.description}</span>
        <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: '#8a8178' }}>
          {(u.reason && REASON[u.reason]) || 'Not identified'}
          {inTray ? ` · ${shelfName(u.shelf_no)}` : ''}
        </span>
      </span>
      <span style={{ display: 'inline-flex', gap: '0.3rem', flexShrink: 0 }}>
        <Tool onClick={() => setIdentifying(u)} tone="clay" small>Identify</Tool>
        {!inTray && (
          <Tool
            onClick={() => { setTray((prev) => [...prev, u]); setAsking((prev) => prev.filter((x) => x.key !== u.key)); }}
            small
          >
            Put aside
          </Tool>
        )}
      </span>
    </div>
  );

  return (
    <PageShell title="Out of the kiln" subtitle="One shelf at a time, until it's empty" back="/menu">
      {closed !== null && (
        <div style={{ background: '#F4F8F4', border: '1px solid #CDE3CD', borderRadius: 'var(--radius-md)', padding: '0.8rem', marginBottom: '0.9rem' }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#2E7D32', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Check size={16} /> Out of the kiln. {closed} piece{closed === 1 ? '' : 's'} are ready to pack.
          </p>
          <Toolbar style={{ marginTop: '0.5rem' }}>
            <Tool onClick={() => router.push('/packing')} tone="dark" icon={<Layers size={15} />}>Go and pack</Tool>
          </Toolbar>
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
            One photo per shelf, from the top down. Nothing counts as out of the kiln until you say the kiln is empty.
          </p>
        </>
      ) : (
        <>
          {/* The prompt. It says which shelf, because standing in front of
              a hot kiln holding a box is exactly when you lose your place. */}
          <p style={{ margin: '0 0 0.45rem', fontSize: 'var(--text-sm)', fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: 'var(--clay)' }}>
            {shots === 0 ? 'Start at the top' : `Now the ${shelfName(shelfNo)}`}
          </p>
          <label
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', padding: '0.95rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-lg)', cursor: busy ? 'default' : 'pointer', minHeight: 56, opacity: busy ? 0.7 : 1 }}
          >
            {busy ? <Loader size={18} className="animate-spin" /> : <Camera size={18} />}
            {busy ? 'Reading the shelf…' : `Photograph the ${shelfName(shelfNo)}`}
            <input
              type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) send(f);
                e.target.value = '';
              }}
            />
          </label>

          {/* Forward and back along the kiln. "Another of this one" is for
              David's extra angles; the arrow is the next shelf down. */}
          <Toolbar style={{ marginTop: '0.6rem' }}>
            <Count>
              {shelf.label} · {shots} photo{shots === 1 ? '' : 's'} · {totalFound} piece{totalFound === 1 ? '' : 's'}
            </Count>
            {shots > 0 && (
              <Tool onClick={() => { setShelfNo((n) => n + 1); setAsking([]); }} tone="dark" icon={<ArrowRight size={15} />}>
                Next shelf down
              </Tool>
            )}
            {shelfNo > 1 && (
              <Tool onClick={() => setShelfNo((n) => Math.max(1, n - 1))}>Back a shelf</Tool>
            )}
            <Tool onClick={() => setNumOpen((v) => !v)} active={numOpen || !!boxTyped.trim()}>
              {boxTyped.trim() ? `Box ${boxTyped.trim()}` : 'Box number'}
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
              {!!lastShot.clipped && ` · ${lastShot.clipped} ignored for falling off the edge of the frame`}
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

      {/* THE PROMPT. Raised the moment the photo comes back, because the
          piece it is asking about is still in reach. */}
      {asking.length > 0 && (
        <div style={{ background: '#FDF8EF', border: '1px solid #E8D5AE', borderRadius: 'var(--radius-md)', padding: '0.7rem 0.75rem', marginBottom: '0.9rem' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--text-sm)', color: '#8a6a2a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <HelpingHand size={15} /> {asking.length} piece{asking.length === 1 ? '' : 's'} on this shelf nobody can name
          </p>
          <p style={{ margin: '0.2rem 0 0.1rem', fontSize: 'var(--text-xs)', color: '#8a6a2a' }}>
            Usually a lid or a base — photographed sitting on its pot at the table, so nothing describes it on its own. Say what it is, or put it aside and come back before you finish.
          </p>
          {asking.map((u) => <UnplacedRow key={u.key} u={u} inTray={false} />)}
        </div>
      )}

      {/* THE TRAY. What was put aside, waiting, and in the way of finishing. */}
      {tray.length > 0 && (
        <div style={{ background: '#FBF7F1', border: '1px dashed #D8C3A0', borderRadius: 'var(--radius-md)', padding: '0.7rem 0.75rem', marginBottom: '0.9rem' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 'var(--text-sm)', color: '#8a6a2a' }}>
            Put aside to identify · {tray.length}
          </p>
          {tray.map((u) => <UnplacedRow key={u.key} u={u} inTray />)}
        </div>
      )}

      {/* Identifying one. The list is this unload's own missing pieces,
          because that is what an unknown on this shelf nearly always is --
          and the AI's hunch, where it had one, sits at the top. */}
      {identifying && (
        <div style={{ background: 'white', border: '2px solid var(--clay)', borderRadius: 'var(--radius-md)', padding: '0.75rem', marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.5rem' }}>
            <PieceThumb url={identifying.shot_url} box={identifying.box} size={56} ring="#B8562E" />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--charcoal)' }}>{identifying.description}</span>
              <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: '#8a8178' }}>Whose is it?</span>
            </span>
            <Tool onClick={() => setIdentifying(null)} small label="Close" icon={<X size={13} />} />
          </div>

          {identifying.maybe && (
            <div style={{ marginBottom: '0.45rem' }}>
              <p style={{ margin: '0 0 0.25rem', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--clay)' }}>Best guess</p>
              <button
                onClick={() => assign(identifying, identifying.maybe!.id, identifying.maybe!.booking_code)}
                disabled={assigning === identifying.maybe.id}
                style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', width: '100%', minHeight: 52, padding: '0.4rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--clay)', background: '#FBF2EA', textAlign: 'left', cursor: 'pointer' }}
              >
                <PieceThumb url={identifying.maybe.reference_photo_url} box={identifying.maybe.photo_box} size={44} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-xs)', color: '#6b625a' }}>
                  <b style={{ display: 'block', color: 'var(--charcoal)', fontSize: 'var(--text-sm)' }}>{identifying.maybe.customer_name}</b>
                  {identifying.maybe.description || identifying.maybe.piece_type || 'piece'}
                </span>
              </button>
            </div>
          )}

          {stillMissing.length === 0 ? (
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: '#8a8178' }}>
              Nothing from this unload is still missing, so this is likely a part of a piece already found, or from an earlier firing. Put it aside and it will keep.
            </p>
          ) : (
            <>
              <p style={{ margin: '0 0 0.25rem', fontSize: 'var(--text-xs)', fontWeight: 700, color: '#8a8178' }}>
                Still missing from this unload
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: 280, overflowY: 'auto' }}>
                {stillMissing.map(({ m, b }) => (
                  <button
                    key={m.id}
                    onClick={() => assign(identifying, m.id, b.booking_code)}
                    disabled={assigning === m.id}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', width: '100%', minHeight: 48, padding: '0.35rem 0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid #e6ddd2', background: 'white', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <PieceThumb url={m.reference_photo_url} box={m.photo_box} size={40} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--text-xs)', color: '#6b625a' }}>
                      <b style={{ display: 'block', color: 'var(--charcoal)', fontSize: 'var(--text-sm)' }}>{b.customer_name}</b>
                      {m.description || m.piece_type || 'piece'}
                    </span>
                    {assigning === m.id && <Loader size={14} className="animate-spin" />}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
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
                      <button
                        onClick={() => setViewer({
                          title: `${b.customer_name} · ${p.piece_type || 'piece'}`,
                          start: 0,
                          pieces: [
                            { photo: p.reference_photo_url || null, box: p.photo_box || null, piece_type: p.piece_type, description: p.description, note: 'On the table, before firing' },
                            { photo: p.shot_url || null, box: p.box || null, piece_type: p.piece_type, description: p.description, note: 'Out of the kiln' },
                          ],
                        })}
                        aria-label={`Open the photos of ${p.piece_type || 'this piece'}`}
                        style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', display: 'block', flexShrink: 0 }}
                      >
                        <BeforeAfter before={p.reference_photo_url} beforeBox={p.photo_box} after={p.shot_url} afterBox={p.box} />
                      </button>
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
                        <Search size={12} /> Not out of the kiln yet
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {b.missing.map((m) => (
                          <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            <button
                              onClick={() => setViewer({ title: `${b.customer_name} · not out yet`, start: 0, pieces: [{ photo: m.reference_photo_url || null, box: m.photo_box || null, piece_type: m.piece_type, description: m.description, note: 'Not photographed out of the kiln yet' }] })}
                              aria-label="Open this photo"
                              style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', display: 'block', flexShrink: 0 }}
                            >
                              <PieceThumb url={m.reference_photo_url} box={m.photo_box} size={44} ring="#E0B872" />
                            </button>
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
          seen; this is what actually moves the pottery on. The tray stands
          in the way on purpose -- not as a lock, since a piece can genuinely
          belong to an earlier firing, but asked once and out loud. */}
      {shelf && shots > 0 && (
        tray.length > 0 && !leaving ? (
          <div style={{ border: '1px solid #E8D5AE', background: '#FDF8EF', borderRadius: 'var(--radius-md)', padding: '0.7rem 0.75rem', marginBottom: '1rem' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: '#8a6a2a' }}>
              {tray.length} piece{tray.length === 1 ? '' : 's'} still put aside. Identify {tray.length === 1 ? 'it' : 'them'} above, or say the kiln is empty anyway and {tray.length === 1 ? 'it stays' : 'they stay'} on the side to sort out.
            </p>
            <Toolbar style={{ marginTop: '0.5rem' }}>
              <Tool onClick={() => setLeaving(true)} tone="dark">Finish anyway</Tool>
            </Toolbar>
          </div>
        ) : (
          <button
            onClick={finishUnload}
            disabled={closing}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', padding: '0.9rem', borderRadius: 'var(--radius-md)', border: 'none', background: '#2E7D32', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: closing ? 'default' : 'pointer', minHeight: 52, marginBottom: '1rem', opacity: closing ? 0.7 : 1 }}
          >
            {closing ? <Loader size={16} className="animate-spin" /> : <Check size={16} />}
            {closing ? 'Marking…' : `That's the kiln empty (${totalFound} piece${totalFound === 1 ? '' : 's'} ready)`}
          </button>
        )
      )}

      <Toolbar>
        <Tool onClick={() => router.push('/shelves')} icon={<Boxes size={15} />}>Kiln photos</Tool>
        <Tool onClick={() => router.push('/packing')} icon={<Layers size={15} />}>Packing</Tool>
      </Toolbar>

      {viewer && (
        <PieceViewer pieces={viewer.pieces} start={viewer.start} title={viewer.title} onClose={() => setViewer(null)} />
      )}

      <Collapse summary="How to empty a kiln and photograph it" icon={<HelpCircle size={16} color="#8a8178" />}>
        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: '#8a8178', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.2rem 0 0.4rem' }}>
          Unloading
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Top shelf first, then down. One photo per shelf is enough; take more if a shelf is crowded.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Pieces come out as they come out. No sorting — the app works out whose is whose afterwards.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Leave a gap between pieces before you shoot. Nothing touching, nothing hidden behind anything else.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Lids and bases off their pots are the ones that go unnamed. Expect to be asked about them.
          </li>
        </ul>
        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: '#8a8178', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.9rem 0 0.4rem' }}>
          The photo
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Stand above the shelf and tilt down about 45 degrees — not flat overhead, not from the side.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            That angle shows the top and the side of each piece, which is what makes them recognisable.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Get the whole shelf in shot, including any number written on the box.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Take as many as you like. Extra angles all count toward the same unload.
          </li>
        </ul>
      </Collapse>
    </PageShell>
  );
}

function whoAmI() {
  try { return JSON.parse(localStorage.getItem('glazeup_shift') || '{}').name || null; } catch { return null; }
}
