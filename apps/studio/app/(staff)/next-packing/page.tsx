'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { PieceThumb, PieceBox } from '@/components/PieceBoxes';
import { Count, Tool, Toolbar } from '@/components/Toolbar';
import { Loader, PackageCheck, Check, Boxes } from 'lucide-react';

// Daisy's design: "the AI has a button to say find the next packing from
// this kiln... it picks up every piece from the first chronologically full
// picking order for a full booking that's ready. And then maybe there's a
// check button on each small cropped photo image piece that you click as
// packed."
//
// The point is that nothing is searched for. The app has already worked out
// which booking is complete and which box each piece is in, so this screen
// is a picking list: a thumbnail, a box number, a tick.

interface NextPiece {
  id: string;
  piece_type: string | null;
  description: string | null;
  box_number: string | null;
  shelf_photo_url: string | null;
  shelf_box: PieceBox | null;
  reference_photo_url: string | null;
  photo_box: PieceBox | null;
}

interface NextBooking {
  booking_code: string;
  customer_name: string;
  collection_date: string | null;
  pieces: NextPiece[];
}

// Crops one piece out of a larger photo using its stored box. The maths
// itself now lives in PieceThumb, which every other screen already uses --
// this copy had been reproduced from the pattern proven elsewhere rather
// than reinvented, because an earlier attempt at rewriting it from memory
// carried two subtle bugs. [11 Oct] All that is left here is the question
// of WHICH photo to crop, which is this screen's own.
function usable(box: PieceBox | null) {
  if (!box) return false;
  return box.right_pct - box.left_pct > 0 && box.bottom_pct - box.top_pct > 0;
}

export default function NextPackingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<NextBooking | null>(null);
  const [waitingOnBoxes, setWaitingOnBoxes] = useState(0);
  const [alsoReady, setAlsoReady] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string[]>([]);

  const load = () => {
    setLoading(true);
    setPicked(new Set());
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/packing/next`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setBooking(d?.booking || null);
        setWaitingOnBoxes(d?.waiting_on_boxes || 0);
        setAlsoReady(d?.also_ready || 0);
      })
      .catch(() => setBooking(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const allPicked = booking ? booking.pieces.every((p) => picked.has(p.id)) : false;

  // Marks each piece via the existing per-piece route rather than a
  // booking-level one, because that is what actually exists -- I had
  // written this against an endpoint I assumed was there.
  //
  // That route deliberately refuses a piece held for a return visit, so
  // a refusal is reported rather than swallowed: a piece that stays
  // behind must not look packed.
  const finish = async () => {
    if (!booking) return;
    setSaving(true);
    setRefused([]);
    const failed: string[] = [];
    try {
      await Promise.all(Array.from(picked).map(async (id) => {
        const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${encodeURIComponent(id)}/packed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packed: true }),
        });
        if (!r.ok) {
          const pc = booking.pieces.find((x) => x.id === id);
          failed.push(pc?.piece_type || pc?.description || 'a piece');
        }
      }));
    } catch {
      failed.push('a piece (connection problem)');
    } finally {
      setSaving(false);
      if (failed.length) { setRefused(failed); } else { load(); }
    }
  };

  return (
    // [11 Oct] You only get here from Packing, so Back goes there.
    <PageShell title="Next packing" subtitle="The first booking that's all out of the kiln" back="/packing">
      {loading && (
        <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-base)', color: 'var(--muted)' }}>
          <Loader size={16} className="animate-spin" /> Looking…
        </p>
      )}

      {/* Saying WHY there is nothing matters more than saying there is
          nothing: "photograph more boxes" and "nothing is due" are
          completely different jobs. */}
      {!loading && !booking && (
        <EmptyState
          icon={<Boxes size={24} />}
          title={waitingOnBoxes > 0 ? 'Nothing is complete yet' : 'Nothing waiting to pack'}
          hint={
            waitingOnBoxes > 0
              ? `${waitingOnBoxes} booking${waitingOnBoxes === 1 ? ' has' : 's have'} pieces that haven't turned up in a box yet. Photograph more boxes and check again.`
              : 'Every booking with pieces out of the kiln has been packed.'
          }
        />
      )}

      {!loading && booking && (
        <>
          {/* [11 Oct] The name stays at the top: it is what the picking list
              is for. Its second line of detail is the control line now, so
              "Open this booking instead" comes up here as a chip rather than
              sitting as a second full-width button under the tick list. */}
          <p style={{ fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--charcoal)', margin: '0 0 0.5rem' }}>
            {booking.customer_name}
          </p>

          <Toolbar>
            <Count>
              {booking.pieces.length} piece{booking.pieces.length === 1 ? '' : 's'}
              {booking.collection_date && ` · for ${new Date(booking.collection_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
              {alsoReady > 0 && ` · ${alsoReady} more ready after this`}
            </Count>
            <Tool onClick={() => router.push(`/packing?code=${encodeURIComponent(booking.booking_code)}`)}>
              Open this booking
            </Tool>
          </Toolbar>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {booking.pieces.map((p, i) => {
              // The crop from the SHELF photo shows the piece as it sits in
              // its box right now. Falls back to the table photo, which at
              // least shows what it looks like.
              const onShelf = !!p.shelf_photo_url && usable(p.shelf_box);
              const url = onShelf ? p.shelf_photo_url : p.reference_photo_url;
              const box = onShelf ? p.shelf_box : p.photo_box;
              const isPicked = picked.has(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                    return next;
                  })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.7rem', textAlign: 'left', width: '100%',
                    padding: '0.6rem', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    border: `1px solid ${isPicked ? 'var(--success)' : '#e6ded3'}`,
                    background: isPicked ? '#F2F8F3' : 'white',
                    opacity: isPicked ? 0.75 : 1,
                  }}
                >
                  <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 'var(--radius-full)', border: `2px solid ${isPicked ? 'var(--success)' : '#c9bfb2'}`, background: isPicked ? 'var(--success)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isPicked && <Check size={13} color="white" />}
                  </span>

                  {/* [11 Oct] Was a hand-cropped span; the shared thumbnail
                      does the same crop and says "no photo" in words where
                      there isn't one, the same as every other list. */}
                  <PieceThumb url={url} box={box} size={64} />

                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--charcoal)' }}>
                      {i + 1}. {p.piece_type || 'Piece'}
                    </span>
                    <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.description || 'No description'}
                    </span>
                    <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--clay)', marginTop: '0.15rem' }}>
                      {p.box_number ? `Box ${p.box_number}` : 'Box not recorded'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {refused.length > 0 && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--warning)', marginTop: '0.7rem' }}>
              Not packed: {refused.join(', ')} — held back for a return visit, or already gone. The rest were saved.
            </p>
          )}

          <button
            onClick={finish}
            disabled={!allPicked || saving}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
              width: '100%', marginTop: '1rem', padding: '0.8rem', borderRadius: 'var(--radius-md)',
              border: 'none', fontWeight: 700, fontSize: 'var(--text-base)',
              background: allPicked ? 'var(--clay)' : '#e6ded3',
              color: allPicked ? 'white' : 'var(--muted)',
              cursor: allPicked ? 'pointer' : 'default',
              minHeight: 48,
            }}
          >
            <PackageCheck size={16} />
            {saving ? 'Saving…' : allPicked ? 'Packed — find the next one' : `${booking.pieces.length - picked.size} still to find`}
          </button>
        </>
      )}
    </PageShell>
  );
}
