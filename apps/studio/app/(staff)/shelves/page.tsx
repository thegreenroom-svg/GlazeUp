'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { EmptyState } from '@/components/EmptyState';
import { Loader, Layers } from 'lucide-react';

// Daisy: "check all the photographs of all the shelves that are on file
// and make a composite page, a scrollable set of shelves with all of the
// itemised numbers on there with descriptions... then you can see them
// all if they're all on different shelves straight away, instead of
// going through and losing that photo again in the next one."
//
// The problem this solves is losing your place. Opening one shelf photo
// closed the last one, so comparing shelves meant remembering what you
// had just seen. A continuous scroll holds them all at once.
//
// Every photo annotates itself from the sweep that produced it, so an
// older shelf still shows what was found on it -- pieces only remember
// their MOST RECENT position, which would have made older photos blank.

const PIECE_COLOURS = ['#C0392B', '#27853F', '#2E6FB7', '#B8791F', '#6C3FA8', '#0F8F86'];

interface MatchedDetail {
  piece_id: string;
  piece_type: string | null;
  description: string | null;
  box: { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number } | null;
  booking_code: string;
  customer_name: string;
  booking_waiting?: number | null;
  reference_photo_url?: string | null;
  reference_box?: { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number } | null;
}

interface Sweep {
  id: string;
  photo_url: string;
  created_at: string;
  succeeded: boolean;
  matches_found: number | null;
  candidates_checked: number | null;
  matched_details: MatchedDetail[] | null;
  box_number: string | null;
}

export default function ShelvesPage() {
  const router = useRouter();
  const [sweeps, setSweeps] = useState<Sweep[] | null>(null);
  // [6 Sep] Daisy: "click on individual open image."
  // A description and a box say the AI believes two things are the
  // same. Standing at a shelf about to put pottery in a bag, the only
  // thing that settles it is seeing the piece as it was painted.
  const [looking, setLooking] = useState<MatchedDetail | null>(null);
  // [6 Sep] Daisy: "I thought here we were gonna see thumbnails of each
  // shelf on one page and then click on them to expand and then click
  // on the items to go to each booking."
  //
  // That is what I built for the backfill an hour earlier and did not
  // carry across to here. This page was a vertical scroll of full-width
  // photos with every match expanded underneath, so finding the shelf
  // you had in mind meant scrolling past four screens of a shelf you
  // did not. A wall of shelves should look like a wall.
  const [openSweep, setOpenSweep] = useState<string | null>(null);
  // Unnumbered photos are indistinguishable from one another on a wall,
  // so only the latest few show until asked.
  const [showAllUnnumbered, setShowAllUnnumbered] = useState(false);
  // Blank photos are hidden by default -- Daisy: "remove any on wall
  // without any matches" -- but NOT thrown away, because nothing
  // re-matches them in the background. A photo that found nothing
  // stays blank until someone re-runs it, so hiding it with no way
  // back would strand it permanently.
  const [showBlanks, setShowBlanks] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/shelf/sweeps`)
      .then((r) => (r.ok ? r.json() : null))
      // Daisy: "remove any on wall without any matches." A photo with
      // nothing marked on it is clutter on a wall whose entire job is
      // spotting pieces -- it cannot answer the question the page
      // exists to answer. Filtered on arrival so the empty state stays
      // truthful rather than the page rendering a run of blanks.
      .then((d) => setSweeps((d?.sweeps || []) as Sweep[]))
      .catch(() => setSweeps([]));
  }, []);

  return (
    <PageShell title="Shelves" subtitle="Every shelf photographed, most recent first">
      {sweeps === null && (
        <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 'var(--text-base)', color: 'var(--muted)' }}>
          <Loader size={16} className="animate-spin" /> Loading…
        </p>
      )}

      {sweeps?.length === 0 && (
        <EmptyState
          icon={<Layers size={24} />}
          title="No shelf photos yet"
          hint="Photograph a shelf from Packing and it'll appear here once pieces are recognised on it."
        />
      )}

      {(() => {
        const blanks = (sweeps || []).filter((sw) => !(sw.matched_details || []).some((m) => m.box)).length;
        if (!blanks) return null;
        return (
          <button
            onClick={() => setShowBlanks((v) => !v)}
            style={{ padding: '0.4rem 0', marginBottom: '0.9rem', border: 'none', background: 'none', color: 'var(--clay)', fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer', minHeight: 44 }}
          >
            {showBlanks
              ? 'Hide the ones that found nothing'
              : `${blanks} photo${blanks === 1 ? '' : 's'} found nothing — show ${blanks === 1 ? 'it' : 'them'}`}
          </button>
        );
      })()}

      {/* [6 Sep] ONE TILE PER BOX, NOT PER PHOTO.
          The first version of this wall showed every sweep, so twelve
          tiles of the same two shelving units looked like twelve
          shelves -- every re-check and every test shot added another.
          A sweep log is not a wall.

          A box is identified by the number written on it, so tiles are
          grouped by box_number and each shows its most recent photo.
          Photos with no box number cannot be told apart from each other
          at all, so they collapse to the latest few with the rest
          behind a toggle: showing all of them implies a distinctness
          that is not there. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginBottom: '1rem' }}>
        {(() => {
          const visible = (sweeps || []).filter((sw) => showBlanks || (sw.matched_details || []).some((m) => m.box));
          const seenBox = new Set<string>();
          const kept: Sweep[] = [];
          let unnumbered = 0;
          for (const sw of visible) {
            const box = (sw.box_number || '').trim();
            if (box) {
              if (seenBox.has(box)) continue;   // older photo of a box already shown
              seenBox.add(box);
              kept.push(sw);
            } else {
              unnumbered += 1;
              if (showAllUnnumbered || unnumbered <= 6) kept.push(sw);
            }
          }
          return kept;
        })().map((sw) => {
          const n = (sw.matched_details || []).filter((d) => d.box).length;
          const isOpen = openSweep === sw.id;
          return (
            <button
              key={sw.id}
              onClick={() => setOpenSweep(isOpen ? null : sw.id)}
              style={{ position: 'relative', padding: 0, aspectRatio: '1', overflow: 'hidden', cursor: 'pointer', background: 'white', borderRadius: 'var(--radius-sm)', border: isOpen ? '2px solid var(--clay)' : '1px solid #ece5db' }}
            >
              <img src={sw.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0.2rem', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'white', background: 'rgba(0,0,0,0.55)' }}>
                {sw.box_number ? `Box ${sw.box_number}` : new Date(sw.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
              {n > 0 && (
                <span style={{ position: 'absolute', top: 3, right: 3, minWidth: 19, height: 19, padding: '0 5px', borderRadius: 10, background: 'var(--clay)', color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {(() => {
        const unnumbered = (sweeps || []).filter((sw) => !(sw.box_number || '').trim() && (showBlanks || (sw.matched_details || []).some((m) => m.box))).length;
        if (unnumbered <= 6) return null;
        return (
          <button
            onClick={() => setShowAllUnnumbered((v) => !v)}
            style={{ padding: '0.4rem 0', marginBottom: '0.9rem', border: 'none', background: 'none', color: 'var(--clay)', fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer', minHeight: 44 }}
          >
            {showAllUnnumbered
              ? 'Show fewer'
              : `${unnumbered - 6} more photos with no box number — show them`}
          </button>
        );
      })()}

      {/* [6 Sep] Daisy: "also wouldn't expand."
          It did -- but it rendered BELOW the grid, so with a dozen
          tiles the opened shelf appeared a screen and a half further
          down and nothing visibly happened. A tap that produces no
          change on screen has failed, whatever the state says.
          It opens over the top now. */}
      <div
        style={openSweep ? {
          position: 'fixed', inset: 0, zIndex: 50, background: 'var(--cream, #faf7f2)',
          overflowY: 'auto', padding: '0.7rem', WebkitOverflowScrolling: 'touch',
        } : { display: 'none' }}
      >
        <button
          onClick={() => setOpenSweep(null)}
          style={{ position: 'sticky', top: 0, zIndex: 2, width: '100%', minHeight: 48, marginBottom: '0.6rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--charcoal, #2f2a25)', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer' }}
        >
          Close this shelf
        </button>
        {sweeps?.filter((sw) => sw.id === openSweep).map((sw) => {
          const details = (sw.matched_details || []).filter((d) => d.box);
          return (
            <div key={sw.id} style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.7rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--charcoal)' }}>
                  {new Date(sw.created_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: sw.succeeded ? 'var(--muted)' : 'var(--warning)' }}>
                  {sw.succeeded ? `${sw.matches_found ?? 0} found` : 'check failed'}
                </span>
              </div>

              <div style={{ position: 'relative' }}>
                <img src={sw.photo_url} alt="" style={{ width: '100%', borderRadius: 'var(--radius-md)', display: 'block' }} />
                {details.map((d, i) => d.box && (
                  <div
                    key={d.piece_id}
                    style={{
                      position: 'absolute',
                      left: `${d.box.left_pct}%`,
                      top: `${d.box.top_pct}%`,
                      width: `${d.box.right_pct - d.box.left_pct}%`,
                      height: `${d.box.bottom_pct - d.box.top_pct}%`,
                      border: `3px solid ${PIECE_COLOURS[i % 6]}`,
                      borderRadius: 'var(--radius-sm)',
                      boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                      pointerEvents: 'none',
                    }}
                  >
                    <span style={{ position: 'absolute', top: -9, left: -9, width: 20, height: 20, borderRadius: 'var(--radius-full)', backgroundColor: PIECE_COLOURS[i % 6], color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px white' }}>
                      {i + 1}
                    </span>
                  </div>
                ))}
              </div>

              {/* The list under each photo is what makes this worth
                  scrolling -- a box alone tells you something is there,
                  the description tells you whose it is and what to
                  reach for. */}
              {/* [6 Sep] Daisy: "need grouping into booking."
                  A flat list of pieces is the wrong unit of work. You do
                  not pack a butter dish, you pack Tiegan Stoodley -- and
                  when a sweep finds thirty pieces across a whole
                  shelving unit, a flat list means reading every line to
                  work out how many people are actually represented.
                  Grouped by customer, the same result answers the
                  question you had when you took the photo.

                  The numbers and colours stay tied to their original
                  position in the list, because they label the boxes on
                  the photo above -- regrouping the text must not
                  renumber the picture. */}
              {details.length > 0 ? (
                <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {Object.values(
                    details.reduce((acc, d, i) => {
                      const key = d.booking_code || 'unknown';
                      (acc[key] ||= { code: d.booking_code, name: d.customer_name, waiting: d.booking_waiting ?? null, items: [] }).items.push({ d, i });
                      return acc;
                    }, {} as Record<string, { code: string; name: string; waiting: number | null; items: { d: MatchedDetail; i: number }[] }>)
                  )
                    // Most pieces first: a booking with four on this
                    // shelf is more likely to be packable than one with a
                    // single stray.
                    // Complete bookings first, then most pieces. A
                    // booking you can finish outranks one you cannot,
                    // whatever the raw count.
                    .sort((a, b) => {
                      const aDone = a.waiting ? a.items.length >= a.waiting : false;
                      const bDone = b.waiting ? b.items.length >= b.waiting : false;
                      if (aDone !== bDone) return aDone ? -1 : 1;
                      return b.items.length - a.items.length;
                    })
                    .map((g) => (
                      <button
                        key={g.code || g.name}
                        onClick={() => router.push(`/packing?code=${encodeURIComponent(g.code)}`)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid #ece5db', borderRadius: 'var(--radius-sm)', background: 'white', padding: '0.5rem 0.6rem', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--charcoal)' }}>
                            {g.name || 'Unknown booking'}
                          </span>
                          {/* "4 of 4" is the whole answer: pack it. "4 of
                              6" means two are elsewhere and packing now
                              sends someone home short. Complete is
                              coloured differently because that is the
                              only case you can act on without thinking. */}
                          <span style={{ flexShrink: 0, fontSize: 'var(--text-xs)', fontWeight: 700, color: g.waiting && g.items.length >= g.waiting ? '#2E7D32' : 'var(--clay)' }}>
                            {g.waiting ? `${g.items.length} of ${g.waiting}` : `${g.items.length} here`}
                            {g.waiting && g.items.length >= g.waiting ? ' · all here' : ''}
                          </span>
                        </span>
                        {g.items.map(({ d, i }) => (
                          <span
                            key={d.piece_id}
                            role="button"
                            onClick={(e) => { e.stopPropagation(); if (d.reference_photo_url) setLooking(d); }}
                            style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', marginTop: '0.25rem', cursor: d.reference_photo_url ? 'zoom-in' : 'default' }}
                          >
                            <span style={{ flexShrink: 0, width: 17, height: 17, borderRadius: 'var(--radius-full)', backgroundColor: PIECE_COLOURS[i % 6], color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {i + 1}
                            </span>
                            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', textDecoration: d.reference_photo_url ? 'underline dotted' : 'none' }}>
                              {d.description || d.piece_type || 'Piece'}
                            </span>
                          </span>
                        ))}
                      </button>
                    ))}
                </div>
              ) : null}

              {/* Re-runs the AI against this stored photo. Nothing
                  re-matches in the background, so a photo that found
                  nothing needs this to ever find anything -- and pieces
                  photographed AFTER this shelf was taken only become
                  candidates on a re-run. */}
              <button
                onClick={async () => {
                  setRetrying(sw.id);
                  try {
                    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/shelf/sweep`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ retry_sweep_id: sw.id }),
                    });
                    if (r.ok) {
                      const fresh = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/shelf/sweeps`);
                      const d = fresh.ok ? await fresh.json() : null;
                      if (d?.sweeps) setSweeps(d.sweeps as Sweep[]);
                    }
                  } catch { /* leave the wall as it was */ }
                  finally { setRetrying(null); }
                }}
                disabled={retrying === sw.id}
                style={{ marginTop: '0.5rem', padding: '0.5rem 0.8rem', minHeight: 44, borderRadius: 'var(--radius-md)', border: '1px solid var(--clay)', background: 'white', color: 'var(--clay)', fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer' }}
              >
                {retrying === sw.id ? 'Checking again…' : 'Check this photo again'}
              </button>
            </div>
          );
        })}
      </div>

      {/* The piece as it was painted, ringed on its own table photo.
          Full width and dark behind, because this gets used standing at
          a shelf with a box in one hand -- it has to be readable at
          arm's length, and one tap anywhere closes it. */}
      {looking && (
        <div
          onClick={() => setLooking(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.82)',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            padding: '1rem', cursor: 'zoom-out',
          }}
        >
          <p style={{ color: 'white', fontSize: 'var(--text-sm)', fontWeight: 700, margin: '0 0 0.15rem' }}>
            {looking.customer_name}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 'var(--text-xs)', margin: '0 0 0.6rem' }}>
            {looking.description || looking.piece_type}
          </p>
          <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <img src={looking.reference_photo_url || ''} alt="" style={{ width: '100%', display: 'block' }} />
            {looking.reference_box && (
              <div style={{
                position: 'absolute',
                left: `${looking.reference_box.left_pct}%`,
                top: `${looking.reference_box.top_pct}%`,
                width: `${looking.reference_box.right_pct - looking.reference_box.left_pct}%`,
                height: `${looking.reference_box.bottom_pct - looking.reference_box.top_pct}%`,
                border: '3px solid #e0392b',
                borderRadius: 'var(--radius-sm)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.9), 0 0 0 9999px rgba(0,0,0,0.45)',
              }} />
            )}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 'var(--text-xs)', textAlign: 'center', margin: '0.7rem 0 0' }}>
            Photographed at the table. Tap anywhere to close.
          </p>
        </div>
      )}
    </PageShell>
  );
}
