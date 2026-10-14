'use client';
import { postOrQueue } from '@/lib/outbox';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PageShell } from '@/components/PageShell';
import { Row, RowAction, Chip } from '@/components/Row';
import { Count, Tool, ToolFile, Toolbar } from '@/components/Toolbar';
import { useSearchParams, useRouter } from 'next/navigation';
import { Package, PackageCheck, Check, Search, Camera, Loader, RefreshCw, Trash2, Printer, Layers } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { compressPhotoForUpload } from '@/lib/compressPhoto';

// The screen for whoever is actually boxing the pottery. There wasn't one:
// kiln-dip is a lookup-by-code tool for collection dates and emails and
// renders no photographs at all, so the person packing had nowhere to see
// what they were packing. That's the one job where the reference photo
// matters most -- a shelf of fired pottery all looks the same, and this
// moment is why the table was photographed in the first place.
//
// Three levels, per Daisy: "somehow drillable, so it's not all on the huge
// screen."
//   1. QUEUE    - who's due, how many pieces, posting or collecting
//   2. BOOKING  - that booking's pieces, each cropped to itself
//   3. PIECE    - one piece, big, ringed on the table photo
// Photos are loaded per booking on drill-down rather than for the whole
// queue at once, so opening this page doesn't pull every image for the week.

// Palette and box drawing now live in the shared component, so a piece
// numbered 3 is the same colour on this screen, the floor and the
// backfill. They were three separate copies of these six hex codes.
import { BeforeAfter, PIECE_COLOURS, pieceColour, PhotoWithBoxes } from '@/components/PieceBoxes';

type PieceBox = { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number };

interface QueueItem {
  booking_code: string;
  customer_name: string;
  piece_count: number;
  on_hold: number;
  ready: number;
  out_of_kiln: boolean;
  posting: number;
  postal_postcode: string | null;
  shelf_label: string | null;
  collection_date: string | null;
  has_photo: boolean;
  collected: number;
  done: boolean;
}

interface Piece {
  id: string;
  piece_type: string | null;
  description: string | null;
  status: string | null;
  reference_photo_url: string | null;
  photo_box: PieceBox | null;
  assigned_to: string | null;
  fulfilment: string | null;
  notes: string | null;
  photo_taken_by: string | null;
  reference_photo_taken_at: string | null;
  last_seen_box: PieceBox | null;
}

// Crops the shared table photo to one piece. Every piece on a booking shares
// ONE photo, so without this a packer sees the same picture of the whole
// table on every row -- useless for telling which is which.
function cropStyle(url: string, box: PieceBox): React.CSSProperties {
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




export default function PackingPage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openBooking, setOpenBooking] = useState<QueueItem | null>(null);
  const [pieces, setPieces] = useState<Piece[]>([]);
  // Where this booking's pieces were last matched on a shelf -- the
  // "walk here first" half of the hybrid.
  const [lastSeen, setLastSeen] = useState<{ id: string; photo_url: string; created_at: string } | null>(null);

  // The piece as it was last seen on a shelf, cropped out of that shelf
  // photo. Null when no sweep has found it yet, which is when the table
  // photo has to do instead.
  const shelfCrop = (p: Piece): React.CSSProperties | null =>
    lastSeen?.photo_url && p.last_seen_box ? cropStyle(lastSeen.photo_url, p.last_seen_box) : null;
  const [showLastSeen, setShowLastSeen] = useState(false);
  const [boxNumber, setBoxNumber] = useState('');
  const [piecesLoading, setPiecesLoading] = useState(false);
  const [openPiece, setOpenPiece] = useState<{ piece: Piece; index: number } | null>(null);
  // Daisy: "select each thumbnail or select all once collected from the
  // table... mark as packed here." Picking pieces one at a time by
  // opening each one was real friction for something this routine.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPacking, setBulkPacking] = useState(false);
  const toggleSelected = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const [saving, setSaving] = useState<string | null>(null);
  // Daisy: "item 1 identified as a sheep figurine, clearly two different
  // jugs... click on it and take this photo again, try again to
  // decipher, or failing that, make description [yourself]." Four
  // actions on one piece: ask the AI again from its own stored crop,
  // type the description by hand, remove a wrongly-identified "piece"
  // entirely, or leave a note. All reuse routes that mostly already
  // existed -- manual description edit and archive were already built,
  // only the AI re-check and notes were genuinely new.
  const [redescribing, setRedescribing] = useState(false);
  const [suggestion, setSuggestion] = useState<{ piece_type: string | null; description: string } | null>(null);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [removing, setRemoving] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<null | { title: string; body?: string; confirmLabel: string; destructive?: boolean; run: () => void }>(null);
  // Reset on every piece change, not just on open -- without this, a
  // half-typed note or an AI suggestion for piece 3 could still be
  // sitting there after tapping straight through to piece 4.
  useEffect(() => {
    setSuggestion(null); setEditingDescription(false); setDescriptionDraft('');
    setEditingNotes(false); setNotesDraft('');
  }, [openPiece?.piece.id]);

  // Selection is per-booking, not per-session -- opening a different
  // booking must never carry a stale selection into it.
  useEffect(() => { setSelected(new Set()); }, [openBooking?.booking_code]);
  // Breakage. The draft comes back from the server for a human to send --
  // "we broke your pottery" is exactly the message that must never go out
  // by accident, so nothing here emails anyone.
  const [breaking, setBreaking] = useState(false);
  const [breakResult, setBreakResult] = useState<{ message_draft: string; customer_phone: string | null; customer_email: string | null } | null>(null);

  // Opened from a booking rather than from the queue. Packing is a job you
  // reach FROM a booking as often as you reach it from a list -- the pieces
  // are in your hand and the booking is what you're looking at.
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedCode = searchParams.get('code');

  // Photograph the shelf and find out whose pottery is on it. Everything
  // else works the other way round -- pick a booking, then confirm its
  // pieces are there -- which is the wrong order when a kiln has just been
  // unloaded and nobody knows whose anything is. Here the photo is the
  // question, not the answer.
  const [sweeping, setSweeping] = useState(false);
  const [sweep, setSweep] = useState<{
    candidates: number;
    waiting_total?: number;
    not_searched?: number;
    note?: string;
    bookings: {
      booking_code: string; customer_name: string; found: number; expected: number; complete: boolean; collection_date?: string | null;
      pieces: { id: string; piece_type: string | null; description: string | null; confidence: number;
                box: { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number } | null }[];
    }[];
  } | null>(null);
  const [sweepError, setSweepError] = useState<string | null>(null);
  // Shelf photos are archived now rather than discarded after use, so a
  // failed sweep can be revisited without walking back to the shelf.
  // The photo just taken, kept so the matches can be shown ON it. Without
  // this the sweep answered "whose is this?" with a list of names and no
  // picture -- which is exactly the point of photographing a shelf: seeing
  // WHICH pot on the shelf is whose.
  const [sweepPhoto, setSweepPhoto] = useState<string | null>(null);
  // Daisy: "it needs to be able to have a second option if they're not in
  // that photo to take another shelf... and tell they're all found for
  // that booking." One shelf photo was never guaranteed to show
  // everything -- a kiln room has more than one shelf. Accumulated across
  // however many photos it takes this session; reset only when someone
  // deliberately starts a fresh search.
  const [foundSoFar, setFoundSoFar] = useState<{ id: string; piece_type: string | null; description: string | null; booking_code: string; customer_name: string }[]>([]);

  const runSweep = async (file: File, onlyBookingCode?: string) => {
    setSweeping(true); setSweep(null); setSweepError(null);
    // Always accumulates -- foundSoFar is only ever cleared by the
    // explicit "Start a new search" action below, never as a side effect
    // of which button happened to be tapped. A second photo that finds
    // nothing NEW must never look like a reason to throw away what a
    // first photo already found.
    setSweepPhoto((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
    // A hard stop on the button itself, independent of whatever the
    // backend does. The backend now times out its own Gemini call, but a
    // spinner that only trusts the server to eventually respond is one
    // slow layer away from being stuck again -- this one gives up on its
    // own after 30s and says so, rather than spinning until the page is
    // closed.
    const controller = new AbortController();
    // 55s, not 30s. The server's own retry chain -- a real rate-limit
    // wait, a retry, a fallback model -- is now a PROVEN 40s worst case
    // (tested directly against a hung connection). 30s here would cancel
    // that legitimate recovery before it finished, which is exactly what
    // happened minutes after the first version of this fix shipped: the
    // spinner stopped being stuck and started failing too early instead.
    // 55s gives the server's 40s room to breathe plus real margin for the
    // photo itself uploading over whatever signal the iPad has, which
    // happens before the server-side clock even starts.
    const killSwitch = setTimeout(() => controller.abort(), 70000); // 15s above the server's 55s overall deadline -- these two numbers move together, never independently
    try {
      // Compressed ON THE DEVICE before it ever leaves, not just at the
      // server. The server's resize genuinely cannot handle HEIC in this
      // environment -- proven directly against a real HEIC file, both
      // the encoder and the decoder fail -- so a HEIC photo from an iPad
      // camera was going up at full size again, undoing the whole point
      // of today's speed fix. Safari can decode HEIC natively, since
      // it's Apple's own format, so doing the resize here sidesteps the
      // server's gap entirely and cuts the upload itself, which matters
      // on the studio's own wifi. Falls back to the original file if
      // this fails for any reason -- the server's own resize (or its
      // HEIC-aware skip) is still there underneath as the real safety
      // net.
      const compressed = await compressPhotoForUpload(file);
      const fd = new FormData();
      fd.append('photo', compressed, 'shelf.jpg');
      // Already-found pieces are excluded from the search entirely --
      // this photo can only ever add to what's been found, never re-ask
      // about something a previous photo already confirmed.
      if (foundSoFar.length) fd.append('exclude_piece_ids', JSON.stringify(foundSoFar.map((f) => f.id)));
      // Set when opened from a specific booking's own detail view -- this
      // is what used to be the separate "Find on Table" page, folded into
      // the same engine everything else here already uses.
      if (onlyBookingCode) fd.append('only_booking_code', onlyBookingCode);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/shelf/sweep`, { method: 'POST', body: fd, signal: controller.signal });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not read the shelf');
      setSweep(d);
      const newlyFound = (d.bookings || []).flatMap((b: typeof d.bookings[number]) =>
        b.pieces.map((p: typeof b.pieces[number]) => ({ id: p.id, piece_type: p.piece_type, description: p.description, booking_code: b.booking_code, customer_name: b.customer_name }))
      );
      if (newlyFound.length) setFoundSoFar((prev) => [...prev, ...newlyFound]);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        setSweepError('That took too long and was cancelled. Try again — a smaller or clearer photo often helps.');
      } else {
        setSweepError(e instanceof Error ? e.message : 'Could not read the shelf');
      }
    } finally {
      clearTimeout(killSwitch);
      setSweeping(false);
    }
  };

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/packing/queue`);
      if (!res.ok) throw new Error(`Could not load the packing queue (${res.status})`);
      const d = await res.json();
      setQueue(d.queue || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the packing queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const jumped = useRef(false);
  useEffect(() => {
    if (!linkedCode || jumped.current || !queue.length) return;
    const match = queue.find((q) => q.booking_code === linkedCode);
    if (!match) return;
    jumped.current = true;
    openIt(match);
    // openIt is stable enough for this one-shot jump; the guard ref stops
    // it re-firing if the queue refreshes underneath.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedCode, queue]);

  const openIt = async (item: QueueItem) => {
    setOpenBooking(item);
    setPieces([]);
    setPiecesLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${item.booking_code}/detail`);
      const d = res.ok ? await res.json() : null;
      setPieces(d?.pieces || []);
      setLastSeen(d?.last_seen || null);
    } catch { setPieces([]); } finally { setPiecesLoading(false); }
  };

  const markCollected = async (p: Piece) => {
    setSaving(p.id);
    try {
      // [11 Oct] Through the outbox: with no wifi the tick is kept here and
      // sent when the connection is back. A reply from the server that is
      // not OK still leaves the row unticked, as before.
      const res = await postOrQueue(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${p.id}/packed`, { packed: true }, `Packed: ${p.piece_type || 'piece'}`);
      if (res.ok) setPieces((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'collected' } : x)));
    } catch { /* left as-is; the row simply doesn't tick */ } finally { setSaving(null); }
  };

  // ---------- LEVEL 3: one piece, big ----------
  if (openPiece && openBooking) {
    const { piece: p, index: i } = openPiece;
    const colour = PIECE_COLOURS[i % 6];
    return (
      <PageShell
        title={p.piece_type || 'Piece'}
        subtitle={p.description && !editingDescription ? p.description : undefined}
        back={() => setOpenPiece(null)}
      >
        {/* [11 Oct] The photograph is why anyone opens this screen -- it is
            what you hold up against the shelf -- so it is the first thing
            now. Two correction buttons used to sit above it, which put the
            picture below the fold on a phone; they are on one line
            underneath, where a correction belongs: after looking. */}
        <div>
          <p style={{ fontSize: 'var(--text-sm)', color: '#8a8178', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.6rem' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: colour, color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
            {openBooking.customer_name}
            {p.assigned_to && <span style={{ color: 'var(--clay)' }}>· for {p.assigned_to}</span>}
          </p>

          {/* Big cropped view first: this is what you hold up against the
              shelf. The full table photo sits underneath for context, with
              this piece ringed, because sometimes the only way to identify
              a plate is seeing what it was sitting next to. */}
          {/* [6 Sep] Daisy: the shelf crop "should be with booking now...
              eventually it would follow into packing and handover."
              So it prefers the piece as last seen ON THE SHELF -- fired,
              glazed, in the state the person packing it is holding --
              over the table photo, which shows it chalky and unfired.
              The table shot is still the fallback for anything a sweep
              has not found yet. */}
          {/* [14 Oct] Both crops, big, when both exist -- unfired on the
              left, fired on the right. Before this the fired crop simply
              replaced the table one, which meant the moment the app had
              most to prove was the moment it showed least: a packer could
              see what it claimed to be holding but not what that claim was
              based on. Shape and where the pattern sits are what should
              agree; the colour jumping from chalky to glossy is the firing
              doing its job. */}
          {shelfCrop(p) && p.reference_photo_url && p.photo_box ? (
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ width: '100%', aspectRatio: '1', borderRadius: 'var(--radius-md)', border: '2px solid #e2d8cb', ...cropStyle(p.reference_photo_url, p.photo_box) }} />
                <p style={{ fontSize: 'var(--text-xs)', color: '#888', margin: '0.3rem 0 0', textAlign: 'center' }}>On the table</p>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ width: '100%', aspectRatio: '1', borderRadius: 'var(--radius-md)', border: `3px solid ${colour}`, ...shelfCrop(p) }} />
                <p style={{ fontSize: 'var(--text-xs)', color: '#888', margin: '0.3rem 0 0', textAlign: 'center' }}>Out of the kiln</p>
              </div>
            </div>
          ) : (shelfCrop(p) || (p.reference_photo_url && p.photo_box)) ? (
            <div style={{ marginTop: '0.75rem', width: '100%', aspectRatio: '1', borderRadius: 'var(--radius-md)', border: `3px solid ${colour}`, ...(shelfCrop(p) || cropStyle(p.reference_photo_url as string, p.photo_box as PieceBox)) }} />
          ) : null}
          {p.reference_photo_url && (
            <div style={{ position: 'relative', marginTop: '0.75rem' }}>
              {/* Same accountability line as the booking view -- this is
                  the other place a bad photo actually gets noticed. */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.3rem' }}>
                {/* "The whole table", matching the booking view -- the crop
                    directly above this is already captioned "On the table",
                    and the same two words twice running read as a repeat
                    rather than as two different pictures. */}
                <p style={{ fontSize: 'var(--text-xs)', color: '#888', margin: 0 }}>The whole table</p>
                {p.photo_taken_by && (
                  <p style={{ fontSize: 'var(--text-xs)', color: '#888', margin: 0 }}>
                    Photographed by <strong style={{ color: 'var(--charcoal)' }}>{p.photo_taken_by}</strong>
                  </p>
                )}
              </div>
              <img src={p.reference_photo_url} alt="" style={{ width: '100%', borderRadius: 'var(--radius-md)', display: 'block' }} />
              {p.photo_box && (
                <div style={{
                  position: 'absolute',
                  left: `${p.photo_box.left_pct}%`,
                  top: `calc(${p.photo_box.top_pct}% + 1.15rem)`,
                  width: `${p.photo_box.right_pct - p.photo_box.left_pct}%`,
                  height: `${p.photo_box.bottom_pct - p.photo_box.top_pct}%`,
                  border: `3px solid ${colour}`,
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
          )}
          {!p.reference_photo_url && (
            <p style={{ marginTop: '0.75rem', fontSize: 'var(--text-sm)', color: '#888' }}>No photo on this piece — identify it from the description.</p>
          )}
          <button
            onClick={() => markCollected(p)}
            disabled={saving === p.id || p.status === 'collected'}
            style={{ ...primaryBtn, marginTop: '1rem', opacity: p.status === 'collected' ? 0.5 : 1 }}
          >
            {p.status === 'collected' ? '✓ Packed' : saving === p.id ? 'Saving...' : 'Mark this one packed'}
          </button>

          {/* The three ways a description gets corrected, and the two ways
              a piece leaves the list -- one line, after the photograph.
              A wrong description caught directly: item 1 called "a sheep
              figurine" when it is genuinely two different jugs. */}
          <Toolbar style={{ marginTop: '0.9rem' }}>
            {!editingDescription && (
              <Tool
                onClick={async () => {
                  setRedescribing(true); setSuggestion(null);
                  try {
                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${p.id}/redescribe`, { method: 'POST' });
                    const d = await res.json();
                    if (res.ok) setSuggestion(d); else setSuggestion({ piece_type: null, description: `Could not check it: ${d?.error || 'unknown error'}` });
                  } catch { setSuggestion({ piece_type: null, description: 'Could not reach the server.' }); }
                  finally { setRedescribing(false); }
                }}
                disabled={redescribing}
                tone="clay"
                icon={redescribing ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              >
                {redescribing ? 'Asking again…' : 'Ask the AI again'}
              </Tool>
            )}
            {!editingDescription && (
              <Tool onClick={() => { setDescriptionDraft(p.description || ''); setEditingDescription(true); }}>
                Type it myself
              </Tool>
            )}
            {!editingNotes && (
              <Tool onClick={() => { setNotesDraft(p.notes || ''); setEditingNotes(true); }} active={!!p.notes} tone="warn">
                {p.notes ? `Note: ${p.notes}` : 'Add a note'}
              </Tool>
            )}
            {p.status !== 'collected' && !breakResult && (
              <Tool
                onClick={async () => {
                  setBreaking(true);
                  try {
                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${p.id}/breakage`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({}),
                    });
                    const d = await res.json();
                    if (res.ok) setBreakResult(d);
                  } finally { setBreaking(false); }
                }}
                disabled={breaking}
                tone="late"
              >
                {breaking ? 'Marking…' : 'It broke in the kiln'}
              </Tool>
            )}
            {/* For when the AI mistook something that was never a piece at
                all -- a shopping bag, a matchbox -- for one. Archived, not
                deleted, so nothing genuinely disappears. */}
            <Tool
              onClick={() => {
                setPendingConfirm({
                  title: 'Remove this piece?',
                  body: 'It will no longer count toward what needs packing. Nothing is deleted — it can be brought back.',
                  confirmLabel: 'Remove',
                  destructive: true,
                  run: async () => {
                    setRemoving(true);
                    try {
                      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${p.id}/archive`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ archived: true }),
                      });
                      if (res.ok) {
                        setPieces((prev) => prev.filter((x) => x.id !== p.id));
                        setOpenPiece(null);
                      }
                    } finally { setRemoving(false); }
                  },
                });
              }}
              disabled={removing}
              icon={<Trash2 size={13} />}
            >
              {removing ? 'Removing…' : 'Not a real piece'}
            </Tool>
          </Toolbar>

          {/* The AI's second attempt -- shown, never saved automatically.
              Accepting it reuses the exact same manual-edit route as
              typing it by hand; the only difference is who typed it. */}
          {suggestion && !editingDescription && (
            <div style={{ marginTop: '0.6rem', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid #ddd', background: '#FAFAFA' }}>
              <p style={{ fontSize: 'var(--text-xs)', color: '#888', marginBottom: '0.2rem' }}>Suggested:</p>
              <p style={{ fontSize: 'var(--text-base)' }}>{suggestion.description}</p>
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                <button
                  onClick={async () => {
                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${p.id}/description`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ description: suggestion.description }),
                    });
                    if (res.ok) {
                      setOpenPiece({ piece: { ...p, description: suggestion.description, piece_type: suggestion.piece_type || p.piece_type }, index: i });
                      setPieces((prev) => prev.map((x) => (x.id === p.id ? { ...x, description: suggestion.description, piece_type: suggestion.piece_type || x.piece_type } : x)));
                      setSuggestion(null);
                    }
                  }}
                  style={{ padding: '0.65rem 0.9rem', minHeight: 44, borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                >
                  Keep this
                </button>
                <button
                  onClick={() => setSuggestion(null)}
                  style={{ padding: '0.65rem 0.9rem', minHeight: 44, borderRadius: 'var(--radius-sm)', border: '1px solid #ccc', background: 'white', fontWeight: 600, fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                >
                  No, discard
                </button>
              </div>
            </div>
          )}

          {editingDescription && (
            <div style={{ marginTop: '0.6rem' }}>
              <textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                rows={2}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid #ccc', fontSize: 'var(--text-base)', color: 'var(--charcoal)', backgroundColor: 'white' }}
                placeholder="What is this piece, really?"
              />
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                <button
                  onClick={async () => {
                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${p.id}/description`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ description: descriptionDraft }),
                    });
                    if (res.ok) {
                      setOpenPiece({ piece: { ...p, description: descriptionDraft }, index: i });
                      setPieces((prev) => prev.map((x) => (x.id === p.id ? { ...x, description: descriptionDraft } : x)));
                      setEditingDescription(false);
                    }
                  }}
                  style={{ padding: '0.65rem 0.9rem', minHeight: 44, borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingDescription(false)}
                  style={{ padding: '0.65rem 0.9rem', minHeight: 44, borderRadius: 'var(--radius-sm)', border: '1px solid #ccc', background: 'white', fontWeight: 600, fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Free-text notes, separate from the description -- "chipped on
              the base", the kind of thing a packer needs to know that
              isn't a visual description of the piece itself. Opened from
              the control line above. */}
          {editingNotes && (
            <div style={{ marginTop: '0.5rem' }}>
              <input
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid #ccc', fontSize: 'var(--text-sm)', color: 'var(--charcoal)', backgroundColor: 'white' }}
                placeholder="e.g. chipped on the base"
              />
              <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                <button
                  onClick={async () => {
                    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${p.id}/notes`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ notes: notesDraft }),
                    });
                    if (res.ok) {
                      setOpenPiece({ piece: { ...p, notes: notesDraft || null }, index: i });
                      setPieces((prev) => prev.map((x) => (x.id === p.id ? { ...x, notes: notesDraft || null } : x)));
                      setEditingNotes(false);
                    }
                  }}
                  style={{ padding: '0.65rem 0.9rem', minHeight: 44, borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingNotes(false)}
                  style={{ padding: '0.65rem 0.9rem', minHeight: 44, borderRadius: 'var(--radius-sm)', border: '1px solid #ccc', background: 'white', fontWeight: 600, fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}



          {breakResult && (
            <div style={{ marginTop: '0.7rem', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid #E5B8B8', background: '#FBF3F3' }}>
              <p style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: '#A33' }}>Marked as broken in firing</p>
              <p style={{ fontSize: 'var(--text-sm)', color: '#555', margin: '0.4rem 0', lineHeight: 1.4 }}>{breakResult.message_draft}</p>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigator.clipboard?.writeText(breakResult.message_draft)}
                  style={{ padding: '0.45rem 0.7rem', borderRadius: 'var(--radius-md)', border: '1px solid #ddd', background: 'white', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' }}
                >
                  Copy message
                </button>
                {breakResult.customer_phone && (
                  <a href={`sms:${breakResult.customer_phone}&body=${encodeURIComponent(breakResult.message_draft)}`}
                     style={{ padding: '0.45rem 0.7rem', borderRadius: 'var(--radius-md)', border: '1px solid #ddd', background: 'white', fontSize: 'var(--text-sm)', fontWeight: 600, textDecoration: 'none', color: 'var(--charcoal)' }}>
                    Text it
                  </a>
                )}
              </div>
              <p style={{ fontSize: 'var(--text-xs)', color: '#999', marginTop: '0.4rem' }}>
                Nothing has been sent — this is a draft for you to use.
              </p>
            </div>
          )}

        </div>
        <ConfirmDialog
          open={!!pendingConfirm}
          title={pendingConfirm?.title || ''}
          body={pendingConfirm?.body}
          confirmLabel={pendingConfirm?.confirmLabel}
          destructive={pendingConfirm?.destructive}
          onConfirm={() => { const r = pendingConfirm?.run; setPendingConfirm(null); r?.(); }}
          onCancel={() => setPendingConfirm(null)}
        />
      </PageShell>
    );
  }

  // ---------- LEVEL 2: one booking's pieces ----------
  if (openBooking) {
    const photo = pieces.find((p) => p.reference_photo_url)?.reference_photo_url;
    // ONE list drives both the rows and the boxes. They were filtered
    // separately, which is exactly how a numbering drift gets introduced
    // later -- piece 2 in the list quietly becoming piece 3 on the photo.
    const packablePieces = pieces.filter((p) => p.fulfilment !== 'return_visit');
    const outstanding = packablePieces.filter((p) => p.status !== 'collected').length;
    const allSelected = selected.size > 0 && selected.size === outstanding;
    // What used to be a paragraph of its own under the Back button: where
    // this booking is going, and anything held back from the parcel.
    const where = [
      openBooking.posting > 0
        ? `${openBooking.posting} to post${openBooking.postal_postcode ? ` · ${openBooking.postal_postcode}` : ''}`
        : 'Collecting from the studio',
      openBooking.on_hold > 0 ? `${openBooking.on_hold} on hold, not in this parcel` : null,
    ].filter(Boolean).join(' · ');
    return (
      <PageShell title={openBooking.customer_name} subtitle={where} back={() => { setOpenBooking(null); loadQueue(); }}>
        {piecesLoading && <p style={{ fontSize: 'var(--text-base)', color: '#888' }}>Loading the pieces...</p>}

        {/* [11 Oct] Everything that used to be a band of its own is on this
            one line: the count, select all, where they were last seen, the
            shelf camera and the label printer. Before this there were three
            separate blocks of buttons between the piece list and the table
            photo, two of them headed "Where are these pieces?" -- and the
            photo you actually hold up against the shelf was below the lot.

            Select individual pieces, or all at once, and pack them
            together -- opening each one just to tick it off was real
            friction for something this routine. */}
        <Toolbar>
          {outstanding > 0 && <Count>{outstanding} still to pack</Count>}
          {packablePieces.length > 0 && (
            <Tool
              tone="dark"
              active={allSelected}
              onClick={() => {
                const stillToPack = packablePieces.filter((p) => p.status !== 'collected').map((p) => p.id);
                setSelected((prev) => (prev.size === stillToPack.length ? new Set() : new Set(stillToPack)));
              }}
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </Tool>
          )}
          {/* Deliberately LAST SEEN with a timestamp, never "is on". Pieces
              move between shelves, and a confidently wrong shelf wastes
              more time than no answer at all. */}
          {!piecesLoading && lastSeen && pieces.length > 0 && (
            <Tool onClick={() => setShowLastSeen((v) => !v)} active={showLastSeen} tone="warn" icon={<Layers size={15} />}>
              Last seen {new Date(lastSeen.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </Tool>
          )}
          {/* Daisy chose the hybrid: know roughly where to walk without
              photographing, then confirm with a photo only if it isn't
              obvious. The free answer sits to the left of this. */}
          {!piecesLoading && pieces.length > 0 && (
            <ToolFile
              icon={<Search size={15} />}
              onFile={(f) => { const code = openBooking.booking_code; setOpenBooking(null); runSweep(f, code); }}
            >
              {lastSeen ? 'Not there? Photograph the shelf' : 'Photograph the shelf to find them'}
            </ToolFile>
          )}
          {/* Daisy: "print a label at that point of packing... for
              collection with a very big name and collection date with
              pieces itemized, or postage with the full postage address." */}
          <Tool onClick={() => router.push(`/print-label?code=${encodeURIComponent(openBooking.booking_code)}`)} icon={<Printer size={15} />}>
            Print label
          </Tool>
        </Toolbar>

        {/* Same numbers and same colours as the table photo below,
            deliberately: piece 2 on the table is piece 2 on the shelf. */}
        {showLastSeen && lastSeen && (
          <div style={{ marginBottom: '0.8rem', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <PhotoWithBoxes
              src={lastSeen.photo_url}
              pieces={packablePieces.map((pc) => ({
                piece_type: pc.piece_type,
                description: pc.description,
                box: pc.last_seen_box,
              }))}
            />
            {!packablePieces.some((pc) => pc.last_seen_box) && (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--warning)', margin: '0.35rem 0 0' }}>
                This photo was taken before positions were recorded, so nothing is boxed on it.
              </p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {packablePieces.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: 'flex', gap: '0.65rem', alignItems: 'center',
                padding: '0.5rem', border: '1px solid #eee', borderRadius: 'var(--radius-md)',
                background: p.status === 'collected' ? '#F4F8F4' : 'white',
              }}
            >
              {p.status !== 'collected' && (
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleSelected(p.id)}
                  style={{ width: 26, height: 26, flexShrink: 0, cursor: 'pointer' }}
                  aria-label={`Select ${p.piece_type || 'piece'} ${i + 1}`}
                />
              )}
              <button
                onClick={() => setOpenPiece({ piece: p, index: i })}
                style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', textAlign: 'left', flex: 1, minWidth: 0, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}
              >
                {/* [14 Oct] BOTH, not one or the other. This thumbnail used
                    to be `shelfCrop(p) || p.reference_photo_url` -- the
                    fired crop if a sweep had found the piece, otherwise the
                    chalky table crop, and never the pair. David: the
                    comparison "is also a very good cross-reference for any
                    missing pieces", and Jenny packs from the table photo by
                    eye anyway, so the table shot is what she is matching
                    and the fired shot is what is in her hand. Falls back to
                    whichever single crop exists when a piece has not been
                    found on a shelf yet. */}
                {shelfCrop(p) && p.reference_photo_url ? (
                  <BeforeAfter
                    before={p.reference_photo_url}
                    beforeBox={p.photo_box}
                    after={lastSeen?.photo_url}
                    afterBox={p.last_seen_box}
                    size={54}
                    beforeRing={PIECE_COLOURS[i % 6]}
                  />
                ) : shelfCrop(p) || p.reference_photo_url ? (
                  <div style={{
                    width: 60, height: 60, borderRadius: 'var(--radius-sm)', flexShrink: 0,
                    border: `2px solid ${PIECE_COLOURS[i % 6]}`,
                    ...(shelfCrop(p)
                      || (p.photo_box ? cropStyle(p.reference_photo_url as string, p.photo_box)
                        : { backgroundImage: `url(${p.reference_photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center' })),
                  }} />
                ) : (
                  <div style={{ width: 60, height: 60, borderRadius: 'var(--radius-sm)', flexShrink: 0, backgroundColor: '#f7f7f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', color: '#bbb' }}>no photo</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 'var(--text-base)', fontWeight: 600 }}>{i + 1}. {p.piece_type || 'Piece'}</p>
                  {p.description && <p style={{ fontSize: 'var(--text-xs)', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</p>}
                  {p.assigned_to && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--clay)', fontWeight: 600 }}>For {p.assigned_to}</p>}
                </div>
                {p.status === 'collected' && <Check size={18} style={{ color: '#2E7D32', flexShrink: 0 }} />}
              </button>
            </div>
          ))}
        </div>

        {selected.size > 0 && (
          <button
            onClick={async () => {
              setBulkPacking(true);
              try {
                const toPack = packablePieces.filter((p) => selected.has(p.id));
                for (const p of toPack) await markCollected(p);
                setSelected(new Set());
                // From the app review: printing the label is the natural
                // next physical action once everything's boxed -- offered
                // here at that exact moment, rather than relying on
                // someone knowing to look for the button further up.
                const remaining = packablePieces.filter((p) => p.status !== 'collected' && !selected.has(p.id)).length;
                if (remaining === 0) {
                  setPendingConfirm({
                    title: 'All packed',
                    body: 'Print the label for this booking now?',
                    confirmLabel: 'Print label',
                    run: () => router.push(`/print-label?code=${encodeURIComponent(openBooking.booking_code)}`),
                  });
                }
              } finally { setBulkPacking(false); }
            }}
            disabled={bulkPacking}
            style={{ ...primaryBtn, marginTop: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          >
            {bulkPacking ? <Loader size={16} className="animate-spin" /> : <Check size={16} />}
            {bulkPacking ? 'Packing…' : `Mark ${selected.size} selected as packed`}
          </button>
        )}

        {/* The other half of packing. The list tells you WHAT is in the
            parcel; the shelf camera on the control line above finds it on a
            shelf of two hundred fired pieces that all look alike. It was
            reachable only from the landing tiles, which meant leaving the
            booking and re-picking it from a list of sixty names -- so it
            carries the booking with it. */}
        {/* Was a link to a page called Find on Table that no longer
            exists -- removed hours ago in the same evening's stripping-
            down, leaving this button pointing nowhere. Daisy: "the 404
            was under the test booking... it shows me all the pieces
            with photographs. Find these pieces." Same idea, rebuilt on
            the sweep engine everything else on this page already uses,
            scoped to just this booking's own pieces rather than
            searching everything waiting. Closes this detail view first
            so the result shows where every other sweep result already
            shows, at the top of Packing, rather than needing a second
            copy of that whole display built just for this one button. */}

        {!piecesLoading && photo && (
          <div style={{ marginTop: '1rem' }}>
            {/* Daisy: "it would be good to have the name of the person who
                took the photograph referenced on the photograph of the
                table, so we can check people are putting the right
                groupings, the right patterns at the front, making sure
                the QR code is in place, and there aren't any missing
                pieces." The name was already being captured on every
                piece -- it had simply never been shown anywhere. Put
                here, against the photo itself, which is the thing being
                judged. */}
            {(() => {
              const shot = packablePieces.find((p) => p.reference_photo_url === photo && (p.photo_taken_by || p.reference_photo_taken_at));
              return (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.3rem' }}>
                  <p style={{ fontSize: 'var(--text-xs)', color: '#888', margin: 0 }}>The whole table</p>
                  {shot && (
                    <p style={{ fontSize: 'var(--text-xs)', color: '#888', margin: 0, textAlign: 'right' }}>
                      {shot.photo_taken_by ? <>Photographed by <strong style={{ color: 'var(--charcoal)' }}>{shot.photo_taken_by}</strong></> : 'Photographer not recorded'}
                      {shot.reference_photo_taken_at && ` · ${new Date(shot.reference_photo_taken_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  )}
                </div>
              );
            })()}
            {/* Numbered coloured boxes, same as everywhere else. Without
                them this was a plain photo of a table -- two rabbits in the
                list, both called "Rabbit figurine", and nothing tying row 1
                to a position in the shot. On a booking of near-identical
                blanks the list and the photo have to be readable together
                or neither is much use. Colours and numbers match the rows
                above, so piece 2 is green in both places. */}
            <div style={{ position: 'relative' }}>
              <img src={photo} alt="" style={{ width: '100%', borderRadius: 'var(--radius-md)', display: 'block' }} />
              {/* Daisy: "see these table with identified pieces for
                  location finding persist until packed." This view stays
                  up for as long as the booking has anything left to find
                  -- but every box used to look identical whether a piece
                  was still on a shelf somewhere or already handed over,
                  which cluttered the one thing meant to help find what's
                  LEFT. A packed piece now greys out with a check instead
                  of competing for attention with what's still needed. */}
              {packablePieces.map((p, i) => {
                if (!p.photo_box || p.reference_photo_url !== photo) return null;
                const packed = p.status === 'collected';
                const isSelected = selected.has(p.id);
                // Daisy: "see the kiln shot with all the pieces laid out
                // on the table so they're easily pickable from here."
                // Tappable directly on the photo, not just the thumbnail
                // list above -- a piece already packed has nothing left
                // to select and stays a plain marker.
                return (
                  <button
                    key={p.id}
                    onClick={packed ? undefined : () => toggleSelected(p.id)}
                    aria-label={packed ? undefined : `Select ${p.piece_type || 'piece'} ${i + 1}`}
                    style={{
                      position: 'absolute',
                      left: `${p.photo_box.left_pct}%`,
                      top: `${p.photo_box.top_pct}%`,
                      width: `${p.photo_box.right_pct - p.photo_box.left_pct}%`,
                      height: `${p.photo_box.bottom_pct - p.photo_box.top_pct}%`,
                      border: `3px solid ${packed ? '#bbb' : PIECE_COLOURS[i % 6]}`,
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                      backgroundColor: isSelected ? `${PIECE_COLOURS[i % 6]}33` : 'transparent',
                      opacity: packed ? 0.45 : 1,
                      padding: 0,
                      cursor: packed ? 'default' : 'pointer',
                    }}
                  >
                    <span style={{ position: 'absolute', top: -9, left: -9, width: 20, height: 20, borderRadius: '50%', backgroundColor: packed ? '#bbb' : PIECE_COLOURS[i % 6], color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px white' }}>
                      {packed ? '✓' : isSelected ? '✓' : i + 1}
                    </span>
                  </button>
                );
              })}
            </div>
            {/* Said plainly rather than leaving someone to wonder why a
                piece has no square on it. */}
            {packablePieces.some((p) => !p.photo_box) && (
              <p style={{ fontSize: 'var(--text-xs)', color: '#A6761D', marginTop: '0.3rem' }}>
                {packablePieces.filter((p) => !p.photo_box).length} piece{packablePieces.filter((p) => !p.photo_box).length === 1 ? ' has' : 's have'} no marked position on this photo.
              </p>
            )}
          </div>
        )}
        <ConfirmDialog
          open={!!pendingConfirm}
          title={pendingConfirm?.title || ''}
          body={pendingConfirm?.body}
          confirmLabel={pendingConfirm?.confirmLabel}
          destructive={pendingConfirm?.destructive}
          onConfirm={() => { const r = pendingConfirm?.run; setPendingConfirm(null); r?.(); }}
          onCancel={() => setPendingConfirm(null)}
        />
      </PageShell>
    );
  }

  // ---------- LEVEL 1: the queue ----------
  return (
    <PageShell title="Packing" subtitle="Pottery due out">
      {/* [11 Oct] This was a bordered box with a heading, two sentences of
          explanation, a camera button, a second full-width primary button
          and a link -- six bands before the queue, which is the thing the
          page is actually for. The camera stays prominent, because after a
          firing it is the first thing anyone does; everything else is one
          line of chips. The explanation went: "Photograph the shelf" says
          it, and whoever is holding the camera already knows why.

          Daisy, twice: "Can't see previous photos" -- they live on their
          own page (Next packing) because opening one inline closed the
          last, and comparing two shelves meant remembering the first. */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', minHeight: 56, padding: '0.95rem', borderRadius: 'var(--radius-md)', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-lg)', cursor: sweeping ? 'default' : 'pointer', opacity: sweeping ? 0.7 : 1 }}>
          {sweeping ? <Loader size={18} className="animate-spin" /> : <Camera size={18} />}
          {sweeping ? 'Reading the shelf…' : 'Photograph the shelf'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            disabled={sweeping}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) runSweep(f); e.target.value = ''; }}
          />
        </label>

        <Toolbar style={{ marginTop: '0.6rem' }}>
          <Tool onClick={() => router.push('/next-packing')} icon={<PackageCheck size={15} />}>Next packing</Tool>
          <Tool onClick={() => router.push('/shelves')} icon={<Layers size={15} />}>Packing shots</Tool>
          <Tool onClick={() => router.push('/out-of-kiln')}>Out of the kiln</Tool>
          {foundSoFar.length > 0 && (
            <Tool onClick={() => { setFoundSoFar([]); setSweep(null); setSweepPhoto((old) => { if (old) URL.revokeObjectURL(old); return null; }); }}>
              Start a new search
            </Tool>
          )}
        </Toolbar>

        {sweepError && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', marginBottom: '0.5rem' }}>{sweepError}</p>
        )}


        {sweep && sweep.bookings.length === 0 && sweepPhoto && (
          <img src={sweepPhoto} alt="" style={{ width: '100%', borderRadius: 'var(--radius-md)', display: 'block', marginTop: '0.6rem', opacity: 0.7 }} />
        )}
        {sweep && sweep.bookings.length === 0 && (
          <>
            <p style={{ fontSize: 'var(--text-sm)', color: '#A6761D', marginTop: '0.6rem' }}>
              {sweep.note || `Nothing recognised out of ${sweep.candidates} piece${sweep.candidates === 1 ? '' : 's'} waiting. Worth trying a closer photo.`}
              {/* "Nothing found" and "nothing found in the part I looked
                  at" are different answers, and only one of them means
                  the photo was bad. */}
              {!!sweep.not_searched && ` ${sweep.not_searched} more weren't searched this time — they're due later.`}
            </p>
            {foundSoFar.length > 0 && (
              <p style={{ fontSize: 'var(--text-xs)', color: '#777', marginTop: '0.3rem' }}>
                {foundSoFar.length} found across earlier photos this search -- still here, tap &quot;Photograph the shelf&quot; above to keep going.
              </p>
            )}
          </>
        )}

        {sweep && sweep.bookings.length > 0 && (
          <div style={{ marginTop: '0.7rem' }}>
            {/* The photo back, with a numbered box on every piece it
                recognised. A list of names alone doesn't tell a packer
                which pot on the shelf is whose -- and that is the whole
                reason for photographing the shelf. Numbers and colours
                match the rows below. */}
            {sweepPhoto && (
              <div style={{ position: 'relative', marginBottom: '0.6rem' }}>
                <img src={sweepPhoto} alt="" style={{ width: '100%', borderRadius: 'var(--radius-md)', display: 'block' }} />
                {sweep.bookings.flatMap((b) => b.pieces).map((p, pi) => ({ p, colour: PIECE_COLOURS[pi % 6], n: pi + 1 }))
                 .map(({ p, colour, n }) => p.box && (
                  <div
                    key={p.id}
                    style={{
                      position: 'absolute',
                      left: `${p.box.left_pct}%`,
                      top: `${p.box.top_pct}%`,
                      width: `${p.box.right_pct - p.box.left_pct}%`,
                      height: `${p.box.bottom_pct - p.box.top_pct}%`,
                      border: `3px solid ${colour}`,
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                      pointerEvents: 'none',
                    }}
                  >
                    <span style={{ position: 'absolute', top: -9, left: -9, width: 20, height: 20, borderRadius: '50%', backgroundColor: colour, color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px white' }}>
                      {n}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* What each numbered square actually is. Per Daisy: "marked
                clearly with one, two, three in their squares with
                descriptions" -- a box with no description tells you where
                something is but not what it is, which on a shelf of
                similar pots is only half an answer. */}
            <div style={{ marginBottom: '0.6rem' }}>
              {sweep.bookings.flatMap((b) => b.pieces.map((p) => ({ p, who: b.customer_name })))
                .map(({ p, who }, pi) => (
                <div key={p.id} style={{ display: 'flex', gap: '0.45rem', alignItems: 'flex-start', padding: '0.2rem 0' }}>
                  <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', backgroundColor: PIECE_COLOURS[pi % 6], color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    {pi + 1}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                      {p.piece_type || 'Piece'} · {who}
                    </span>
                    {p.description && (
                      <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: '#777' }}>{p.description}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: 'var(--text-xs)', color: '#666', marginBottom: '0.4rem' }}>
              Checked against {sweep.candidates} piece{sweep.candidates === 1 ? '' : 's'} still waiting
              {!!sweep.not_searched && ` (of ${sweep.waiting_total}, earliest collection dates first)`}
            </p>
            {sweep.bookings.map((b, bi) => (
              <div key={b.booking_code}>
              {/* The line between work you can finish now and work you
                  can't. Drawn once, at the first partial booking. */}
              {!b.complete && bi > 0 && sweep.bookings[bi - 1].complete && (
                <p style={{ fontSize: 'var(--text-xs)', color: '#999', margin: '0.6rem 0 0.3rem', textAlign: 'center' }}>
                  Still missing pieces — leave these until more turn up
                </p>
              )}
              <button
                onClick={() => { const q = queue.find((x) => x.booking_code === b.booking_code); if (q) openIt(q); }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                  textAlign: 'left', padding: '0.5rem 0.6rem', marginBottom: '0.3rem', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${b.complete ? '#9CC79C' : '#E4D8C8'}`,
                  background: b.complete ? '#F1F8F1' : '#FBF7F1', cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left' }}>
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>{b.customer_name}</span>
                  {/* The date the order is sorted by -- shown so the
                      ordering reads as deliberate rather than arbitrary. */}
                  {b.collection_date && (
                    <span style={{ fontSize: 'var(--text-xs)', color: '#888' }}>
                      for {new Date(b.collection_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </span>
                {/* "2 of 4" is the useful number -- a part-found booking
                    means the rest are still somewhere else. */}
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, flexShrink: 0, color: b.complete ? '#2E7D32' : '#A6761D' }}>
                  {b.found} of {b.expected}{b.complete ? ' · all here' : ''}
                </span>
              </button>
              </div>
            ))}
            {/* Daisy: "it needs to be able to have a second option if
                they're not in that photo to take another shelf." A kiln
                room has more than one shelf -- one photo was never
                guaranteed to be the whole story. */}
            <label
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                width: '100%', padding: '0.6rem', marginTop: '0.5rem', borderRadius: 'var(--radius-md)',
                border: '1px dashed var(--clay)', color: 'var(--clay)', fontWeight: 700, fontSize: 'var(--text-sm)',
                cursor: sweeping ? 'default' : 'pointer', opacity: sweeping ? 0.5 : 1,
              }}
            >
              {sweeping ? <Loader size={14} className="animate-spin" /> : <Camera size={14} />}
              {sweeping ? 'Reading the shelf...' : 'Not all here? Photograph another shelf'}
              <input
                type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={sweeping}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) runSweep(f); e.target.value = ''; }}
              />
            </label>
            {foundSoFar.length > sweep.bookings.reduce((n, b) => n + b.pieces.length, 0) && (
              <p style={{ fontSize: 'var(--text-xs)', color: '#777', textAlign: 'center', marginTop: '0.4rem' }}>
                {foundSoFar.length} found in total across your photos so far
              </p>
            )}
          </div>
        )}
      </div>

      {loading && <p style={{ fontSize: 'var(--text-base)', color: '#888' }}>Loading...</p>}
      {error && <p style={{ fontSize: 'var(--text-base)', color: '#c0392b' }}>{error}</p>}
      {!loading && !error && queue.length === 0 && (
        <EmptyState
          icon={<Package size={24} />}
          title="Nothing due to go out"
          hint="Bookings appear here as soon as they have pieces, soonest collection first."
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {queue.map((q) => {
          // [11 Oct] The same row shape as Collect and the booking page.
          const today = new Date().toISOString().slice(0, 10);
          const late = !!q.collection_date && q.collection_date < today;
          const due = q.collection_date
            ? new Date(q.collection_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
            : null;
          return (
            <Row
              key={q.booking_code}
              title={q.customer_name}
              tone={q.done ? 'done' : late ? 'late' : 'plain'}
              detail={[
                `${q.piece_count} piece${q.piece_count === 1 ? '' : 's'}`,
                q.posting > 0 ? `${q.posting} to post` : null,
                q.on_hold > 0 ? `${q.on_hold} on hold` : null,
                q.shelf_label || null,
              ].filter(Boolean).join(' · ')}
              chips={(
                <>
                  {due && <Chip tone={late ? 'late' : 'clay'}>{late ? `Was due ${due}` : `Collect ${due}`}</Chip>}
                  <Chip tone={q.out_of_kiln ? 'good' : 'kiln'}>
                    {q.out_of_kiln ? (q.shelf_label ? `Shelf ${q.shelf_label}` : 'Out of the kiln') : `${q.ready}/${q.piece_count} fired`}
                  </Chip>
                  {!q.has_photo && <Chip tone="warn">No photo</Chip>}
                </>
              )}
              onClick={() => openIt(q)}
              action={<RowAction onClick={() => openIt(q)}>Pack</RowAction>}
            />
          );
        })}
      </div>
    </PageShell>
  );
}

const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: 'none',
  backgroundColor: 'var(--clay)', color: 'white', fontWeight: 700,
  fontSize: 'var(--text-md)', cursor: 'pointer',
};
