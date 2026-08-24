'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { PageShell } from '@/components/PageShell';
import { useSearchParams, useRouter } from 'next/navigation';
import { Package, ChevronLeft, Check, Search, Camera, Loader } from 'lucide-react';

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

const PIECE_COLOURS = ['#e0392b', '#1a8a3c', '#2b6fe0', '#c77a0a', '#8b3ec7', '#0a9aa8'];

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
  const [piecesLoading, setPiecesLoading] = useState(false);
  const [openPiece, setOpenPiece] = useState<{ piece: Piece; index: number } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
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
    note?: string;
    bookings: {
      booking_code: string; customer_name: string; found: number; expected: number; complete: boolean;
      pieces: { id: string; piece_type: string | null; description: string | null; confidence: number;
                box: { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number } | null }[];
    }[];
  } | null>(null);
  const [sweepError, setSweepError] = useState<string | null>(null);
  // The photo just taken, kept so the matches can be shown ON it. Without
  // this the sweep answered "whose is this?" with a list of names and no
  // picture -- which is exactly the point of photographing a shelf: seeing
  // WHICH pot on the shelf is whose.
  const [sweepPhoto, setSweepPhoto] = useState<string | null>(null);

  const runSweep = async (file: File) => {
    setSweeping(true); setSweep(null); setSweepError(null);
    setSweepPhoto((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/shelf/sweep`, { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not read the shelf');
      setSweep(d);
    } catch (e) {
      setSweepError(e instanceof Error ? e.message : 'Could not read the shelf');
    } finally { setSweeping(false); }
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
    } catch { setPieces([]); } finally { setPiecesLoading(false); }
  };

  const markCollected = async (p: Piece) => {
    setSaving(p.id);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${p.id}/packed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packed: true }),
      });
      // Only tick the row if it genuinely saved. Showing a tick for a
      // failed write is worse than showing nothing -- a packer would trust
      // it and the piece would sit on the shelf marked as gone.
      if (res.ok) setPieces((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: 'collected' } : x)));
    } catch { /* left as-is; the row simply doesn't tick */ } finally { setSaving(null); }
  };

  // ---------- LEVEL 3: one piece, big ----------
  if (openPiece && openBooking) {
    const { piece: p, index: i } = openPiece;
    const colour = PIECE_COLOURS[i % 6];
    return (
      <PageShell title="Packing" subtitle={openBooking.customer_name}>
        <button onClick={() => setOpenPiece(null)} style={backBtn}>
          <ChevronLeft size={16} /> Back to the pieces
        </button>
        <div style={{ marginTop: '0.75rem' }}>
          <p style={{ fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ width: 24, height: 24, borderRadius: '50%', backgroundColor: colour, color: 'white', fontSize: '0.75rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            {p.piece_type || 'Piece'}
          </p>
          {p.description && <p style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.35rem' }}>{p.description}</p>}
          {p.assigned_to && <p style={{ fontSize: '0.85rem', marginTop: '0.35rem' }}>For <strong>{p.assigned_to}</strong></p>}

          {/* Big cropped view first: this is what you hold up against the
              shelf. The full table photo sits underneath for context, with
              this piece ringed, because sometimes the only way to identify
              a plate is seeing what it was sitting next to. */}
          {p.reference_photo_url && p.photo_box && (
            <div style={{ marginTop: '0.75rem', width: '100%', aspectRatio: '1', borderRadius: 10, border: `3px solid ${colour}`, ...cropStyle(p.reference_photo_url, p.photo_box) }} />
          )}
          {p.reference_photo_url && (
            <div style={{ position: 'relative', marginTop: '0.75rem' }}>
              <p style={{ fontSize: '0.72rem', color: '#888', marginBottom: '0.3rem' }}>On the table</p>
              <img src={p.reference_photo_url} alt="" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
              {p.photo_box && (
                <div style={{
                  position: 'absolute',
                  left: `${p.photo_box.left_pct}%`,
                  top: `calc(${p.photo_box.top_pct}% + 1.15rem)`,
                  width: `${p.photo_box.right_pct - p.photo_box.left_pct}%`,
                  height: `${p.photo_box.bottom_pct - p.photo_box.top_pct}%`,
                  border: `3px solid ${colour}`,
                  borderRadius: 4,
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
          )}
          {!p.reference_photo_url && (
            <p style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#888' }}>No photo on this piece — identify it from the description.</p>
          )}

          <button
            onClick={() => markCollected(p)}
            disabled={saving === p.id || p.status === 'collected'}
            style={{ ...primaryBtn, marginTop: '1rem', opacity: p.status === 'collected' ? 0.5 : 1 }}
          >
            {p.status === 'collected' ? '✓ Packed' : saving === p.id ? 'Saving...' : 'Mark this one packed'}
          </button>

          {/* The bad moment, handled while the piece is in hand. Marks it,
              and drafts the message so the customer conversation starts
              from a written offer rather than an apology improvised at the
              till. */}
          {p.status !== 'collected' && !breakResult && (
            <button
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
              style={{ width: '100%', marginTop: '0.5rem', padding: '0.7rem', borderRadius: 10, border: '1px solid #E5B8B8', background: '#FBF3F3', color: '#A33', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
            >
              {breaking ? 'Marking...' : 'It broke in the kiln'}
            </button>
          )}

          {breakResult && (
            <div style={{ marginTop: '0.7rem', padding: '0.75rem', borderRadius: 10, border: '1px solid #E5B8B8', background: '#FBF3F3' }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#A33' }}>Marked as broken in firing</p>
              <p style={{ fontSize: '0.78rem', color: '#555', margin: '0.4rem 0', lineHeight: 1.4 }}>{breakResult.message_draft}</p>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => navigator.clipboard?.writeText(breakResult.message_draft)}
                  style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #ddd', background: 'white', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Copy message
                </button>
                {breakResult.customer_phone && (
                  <a href={`sms:${breakResult.customer_phone}&body=${encodeURIComponent(breakResult.message_draft)}`}
                     style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #ddd', background: 'white', fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none', color: 'var(--charcoal)' }}>
                    Text it
                  </a>
                )}
              </div>
              <p style={{ fontSize: '0.68rem', color: '#999', marginTop: '0.4rem' }}>
                Nothing has been sent — this is a draft for you to use.
              </p>
            </div>
          )}
        </div>
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
    return (
      <PageShell title="Packing" subtitle={openBooking.customer_name}>
        <button onClick={() => { setOpenBooking(null); loadQueue(); }} style={backBtn}>
          <ChevronLeft size={16} /> Back to the queue
        </button>

        <p style={{ fontSize: '0.82rem', color: '#666', margin: '0.6rem 0 0.75rem' }}>
          {openBooking.posting > 0
            ? `${openBooking.posting} to post${openBooking.postal_postcode ? ` · ${openBooking.postal_postcode}` : ''}`
            : 'Collecting from the studio'}
          {openBooking.on_hold > 0 && ` · ${openBooking.on_hold} on hold, not in this parcel`}
        </p>

        {piecesLoading && <p style={{ fontSize: '0.85rem', color: '#888' }}>Loading the pieces...</p>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {packablePieces.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setOpenPiece({ piece: p, index: i })}
              style={{
                display: 'flex', gap: '0.65rem', alignItems: 'center', textAlign: 'left',
                padding: '0.5rem', border: '1px solid #eee', borderRadius: 8,
                background: p.status === 'collected' ? '#F4F8F4' : 'white', cursor: 'pointer',
              }}
            >
              {p.reference_photo_url ? (
                <div style={{
                  width: 60, height: 60, borderRadius: 6, flexShrink: 0,
                  border: `2px solid ${PIECE_COLOURS[i % 6]}`,
                  ...(p.photo_box ? cropStyle(p.reference_photo_url, p.photo_box)
                    : { backgroundImage: `url(${p.reference_photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }),
                }} />
              ) : (
                <div style={{ width: 60, height: 60, borderRadius: 6, flexShrink: 0, backgroundColor: '#f7f7f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#bbb' }}>no photo</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{i + 1}. {p.piece_type || 'Piece'}</p>
                {p.description && <p style={{ fontSize: '0.72rem', color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</p>}
                {p.assigned_to && <p style={{ fontSize: '0.72rem', color: 'var(--clay)', fontWeight: 600 }}>For {p.assigned_to}</p>}
              </div>
              {p.status === 'collected' && <Check size={18} style={{ color: '#2E7D32', flexShrink: 0 }} />}
            </button>
          ))}
        </div>

        {/* The other half of packing. The list tells you WHAT is in the
            parcel; this finds it on a shelf of two hundred fired pieces
            that all look alike. It was reachable only from the landing
            tiles, which meant leaving the booking and re-picking it from a
            list of sixty names -- so it carries the booking with it. */}
        {!piecesLoading && pieces.length > 0 && (
          <button
            onClick={() => router.push(`/find-on-table?code=${openBooking.booking_code}`)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', marginTop: '0.85rem', padding: '0.7rem', borderRadius: 8, border: '1px solid var(--clay)', background: 'white', color: 'var(--clay)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            <Search size={15} /> Find these on the shelf
          </button>
        )}

        {!piecesLoading && photo && (
          <div style={{ marginTop: '1rem' }}>
            <p style={{ fontSize: '0.72rem', color: '#888', marginBottom: '0.3rem' }}>The whole table</p>
            {/* Numbered coloured boxes, same as everywhere else. Without
                them this was a plain photo of a table -- two rabbits in the
                list, both called "Rabbit figurine", and nothing tying row 1
                to a position in the shot. On a booking of near-identical
                blanks the list and the photo have to be readable together
                or neither is much use. Colours and numbers match the rows
                above, so piece 2 is green in both places. */}
            <div style={{ position: 'relative' }}>
              <img src={photo} alt="" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
              {packablePieces.map((p, i) => p.photo_box && p.reference_photo_url === photo && (
                <div
                  key={p.id}
                  style={{
                    position: 'absolute',
                    left: `${p.photo_box.left_pct}%`,
                    top: `${p.photo_box.top_pct}%`,
                    width: `${p.photo_box.right_pct - p.photo_box.left_pct}%`,
                    height: `${p.photo_box.bottom_pct - p.photo_box.top_pct}%`,
                    border: `3px solid ${PIECE_COLOURS[i % 6]}`,
                    borderRadius: 4,
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                    pointerEvents: 'none',
                  }}
                >
                  <span style={{ position: 'absolute', top: -9, left: -9, width: 20, height: 20, borderRadius: '50%', backgroundColor: PIECE_COLOURS[i % 6], color: 'white', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px white' }}>
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>
            {/* Said plainly rather than leaving someone to wonder why a
                piece has no square on it. */}
            {packablePieces.some((p) => !p.photo_box) && (
              <p style={{ fontSize: '0.7rem', color: '#A6761D', marginTop: '0.3rem' }}>
                {packablePieces.filter((p) => !p.photo_box).length} piece{packablePieces.filter((p) => !p.photo_box).length === 1 ? '' : 's'} have no marked position on this photo.
              </p>
            )}
          </div>
        )}
      </PageShell>
    );
  }

  // ---------- LEVEL 1: the queue ----------
  return (
    <PageShell title="Packing" subtitle="Pottery due out">
      {/* Top of the queue, because after a kiln comes out this is the first
          thing you do -- before you know which booking you're looking at. */}
      <div style={{ border: '1px solid #eee', borderRadius: 10, padding: '0.75rem', marginBottom: '0.9rem' }}>
        <p style={{ fontSize: '0.85rem', fontWeight: 700 }}>Just unloaded the kiln?</p>
        <p style={{ fontSize: '0.75rem', color: '#777', margin: '0.15rem 0 0.55rem' }}>
          Photograph the shelf and it&apos;ll tell you whose pottery is on it.
        </p>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.55rem 0.85rem', borderRadius: 8, background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer' }}>
          {sweeping ? <Loader size={15} className="animate-spin" /> : <Camera size={15} />}
          {sweeping ? 'Reading the shelf...' : 'Photograph the shelf'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            disabled={sweeping}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) runSweep(f); e.target.value = ''; }}
          />
        </label>

        {sweepError && <p style={{ fontSize: '0.78rem', color: '#c0392b', marginTop: '0.5rem' }}>{sweepError}</p>}

        {sweep && sweep.bookings.length === 0 && sweepPhoto && (
          <img src={sweepPhoto} alt="" style={{ width: '100%', borderRadius: 8, display: 'block', marginTop: '0.6rem', opacity: 0.7 }} />
        )}
        {sweep && sweep.bookings.length === 0 && (
          <p style={{ fontSize: '0.78rem', color: '#A6761D', marginTop: '0.6rem' }}>
            {sweep.note || `Nothing recognised out of ${sweep.candidates} piece${sweep.candidates === 1 ? '' : 's'} waiting. Worth trying a closer photo.`}
          </p>
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
                <img src={sweepPhoto} alt="" style={{ width: '100%', borderRadius: 8, display: 'block' }} />
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
                      borderRadius: 4,
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                      pointerEvents: 'none',
                    }}
                  >
                    <span style={{ position: 'absolute', top: -9, left: -9, width: 20, height: 20, borderRadius: '50%', backgroundColor: colour, color: 'white', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px white' }}>
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
                  <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', backgroundColor: PIECE_COLOURS[pi % 6], color: 'white', fontSize: '0.62rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    {pi + 1}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600 }}>
                      {p.piece_type || 'Piece'} · {who}
                    </span>
                    {p.description && (
                      <span style={{ display: 'block', fontSize: '0.72rem', color: '#777' }}>{p.description}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <p style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.4rem' }}>
              Checked against {sweep.candidates} piece{sweep.candidates === 1 ? '' : 's'} still waiting
            </p>
            {sweep.bookings.map((b) => (
              <button
                key={b.booking_code}
                onClick={() => { const q = queue.find((x) => x.booking_code === b.booking_code); if (q) openIt(q); }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                  textAlign: 'left', padding: '0.5rem 0.6rem', marginBottom: '0.3rem', borderRadius: 7,
                  border: `1px solid ${b.complete ? '#9CC79C' : '#E4D8C8'}`,
                  background: b.complete ? '#F1F8F1' : '#FBF7F1', cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{b.customer_name}</span>
                {/* "2 of 4" is the useful number -- a part-found booking
                    means the rest are still somewhere else. */}
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: b.complete ? '#2E7D32' : '#A6761D' }}>
                  {b.found} of {b.expected}{b.complete ? ' · all here' : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <p style={{ fontSize: '0.85rem', color: '#888' }}>Loading...</p>}
      {error && <p style={{ fontSize: '0.85rem', color: '#c0392b' }}>{error}</p>}
      {!loading && !error && queue.length === 0 && (
        <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px dashed #ddd', borderRadius: 10 }}>
          <Package size={26} style={{ color: '#ccc' }} />
          <p style={{ fontSize: '0.9rem', fontWeight: 600, marginTop: '0.5rem' }}>Nothing due to go out</p>
          <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '0.25rem' }}>Bookings appear here as soon as they have pieces. Oldest first.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {queue.map((q) => (
          <button
            key={q.booking_code}
            onClick={() => openIt(q)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left',
              padding: '0.7rem 0.8rem', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${q.done ? '#CDE3CD' : '#eee'}`,
              backgroundColor: q.done ? '#F4F8F4' : 'white',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: '0.9rem', fontWeight: 700 }}>{q.customer_name}</p>
              <p style={{ fontSize: '0.75rem', color: '#777' }}>
                {q.posting > 0 ? `${q.posting} to post` : 'Collecting'}
                {q.on_hold > 0 ? ` · ${q.on_hold} on hold` : ''}
                {q.shelf_label ? ` · ${q.shelf_label}` : ''}
              </p>
              {/* Said up front so nobody walks to the shelf expecting a
                  photo that was never taken. */}
              {!q.has_photo && <p style={{ fontSize: '0.72rem', color: '#A6761D' }}>No photo — identify by description</p>}
            </div>
            <div style={{ flexShrink: 0, marginLeft: '0.5rem', textAlign: 'right' }}>
              <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: q.out_of_kiln ? '#2E7D32' : 'var(--clay)' }}>
                {q.piece_count} piece{q.piece_count === 1 ? '' : 's'}
              </span>
              {/* Out of the kiln and on a shelf, or still waiting to be
                  fired -- which is what a packer needs to know before
                  walking anywhere. No dates involved. */}
              <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 600, color: q.out_of_kiln ? '#2E7D32' : '#A6761D' }}>
                {q.out_of_kiln ? (q.shelf_label || 'Out of the kiln') : `${q.ready}/${q.piece_count} fired`}
              </span>
            </div>
          </button>
        ))}
      </div>
    </PageShell>
  );
}

const backBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.25rem',
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'var(--clay)', fontSize: '0.85rem', fontWeight: 600,
};

const primaryBtn: React.CSSProperties = {
  width: '100%', padding: '0.75rem', borderRadius: 8, border: 'none',
  backgroundColor: 'var(--clay)', color: 'white', fontWeight: 700,
  fontSize: '0.9rem', cursor: 'pointer',
};
