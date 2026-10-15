'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
// [11 Oct] Eleven icons left over from the twenty-three tiles this page
// used to have were still being imported. Only the nine still drawn.
import { Printer, Camera, TrendingUp, ScanSearch, Flame, Package } from 'lucide-react';

// THE WHOLE APP, on one page.
//
// Daisy: "I need everything integrated into one big page... Each button
// does something. It opens up to a full screen camera, pictures taken.
// That pops back down into that little button when it's complete and
// finished. Next button opens up. Does its job, shuts down."
//
// Four steps, in the order the pottery actually moves through the studio:
//   1. Print cards -- the booking references that start the session
//   2. Table photo -- every piece clear, QR code visible in frame
//   3. Kiln        -- shelf codes and collection dates on the way in
//   4. Packing     -- match what came out and hand it over
//
// Each tile expands into the real, existing flow rather than a rebuilt
// copy of it. The floor photography, kiln shelf and packing screens are
// the ones that have been debugged all week -- reimplementing them inside
// a modal would throw that away to gain nothing.
// [11 Oct] Daisy: "Do we need all the other menu items now? Or can it all
// just work off this one landing page?" Not quite one page -- the booking
// page answers everything about ONE booking, but loading a kiln or packing
// the wall works across many -- but four places, not twenty-three tiles.
// Each place's lesser screens hang off it as small links, so nothing is
// lost, and every old page still works at its own address.
type Link = { label: string; href: string };
// [15 Oct] THREE STEPS. David: "So now we streamline. App only needs the
// following steps. Bookings. Photo table or automations. Photograph kiln
// shelves or when emptied and packing."
//
// That is the whole studio, and it is what the app is for. Everything the
// pottery actually does is: a booking exists, its table gets photographed,
// and then at some point it comes out of a kiln and gets packed. Four tiles
// made Find a destination of its own when it is really a way into a
// booking, and it put Collect alongside the kiln when handing over is the
// end of the same thread as packing.
//
// Nothing is deleted. Each step's lesser screens hang off it, and every
// page still works at its own address.
// [15 Oct, afternoon] FOUR, AND PACKING IS ONE OF THEM. David: "Get rid of
// needs a look, Stock, Is everything running, Collect, Returns shelf, Table
// total. Packing needs to be a separate function, own big button."
//
// Packing was a chip under the kiln, which was wrong in the way that
// matters: it is not a thing you do while unloading, it is a different
// person on a different day with a box in their hands. A chip the size of
// a fingernail under someone else's step is not how you find your own job.
//
// The six that went were each a page that watched something rather than
// did it. What is left is four things a person does, in order, and one
// chip: the kiln photographs themselves, which is the evidence behind the
// step above it.
const STEPS: { key: string; label: string; detail: string; href: string; icon: typeof Printer; tint: string; also: Link[] }[] = [
  { key: 'bookings', label: 'Bookings', detail: "Today's tables, and any name or date", href: '/daily-cards', icon: Printer, tint: '#8C6A4A',
    also: [{ label: 'Find a booking', href: '/find' }] },
  { key: 'table', label: 'Table photos', detail: 'Photograph a table, or let the iPad send them through', href: '/floor', icon: Camera, tint: '#4F6D7A',
    also: [] },
  // [15 Oct] David: "Kiln just photo when opened, no dip, no fire
  // schedule, simplify."
  //
  // The kiln screen tracked four stages per collection date -- on the
  // shelf, dipped, into the kiln, out -- plus which kiln, which program
  // and a planned firing day. All of it was someone telling the app what
  // they had just done, and none of it is what the app knows anything
  // about. The photograph taken as the kiln is opened is the only record
  // that earns its keep: it is evidence, it names pieces, and it moves
  // bookings to packing on its own.
  //
  // So the step goes straight to the camera. What is still waiting to be
  // fired is already on the packing screen, by name, under Waiting on the
  // kiln.
  { key: 'kiln', label: 'The kiln', detail: "Photograph each shelf as it's opened", href: '/out-of-kiln', icon: Flame, tint: '#B8562E',
    also: [{ label: 'Kiln photos', href: '/shelves' }] },
  { key: 'packing', label: 'Packing', detail: 'Who is complete, piece by piece against the table photo', href: '/packing', icon: Package, tint: '#2E7D6B',
    also: [] },
];

// The office: owner only. Stock and the job monitor went with the rest --
// one priced the shapes, the other watched the watchers, and neither is
// anybody's job during a day in the studio.
const BACKROOM = [
  { key: 'owner',    label: 'The numbers',          detail: 'Takings, records and where it comes from', href: '/owner', icon: TrendingUp, tint: '#2E7D6B' },
  { key: 'shapes',   label: 'Shape recognition',    detail: 'Which shape each painted piece is', href: '/recognition', icon: ScanSearch, tint: '#5B6E8C' },
];

// [6 Oct] Owner-only screens: the money, the job monitor and the data
// fixes. Hidden from staff PINs so the menu is just their work. This only
// hides tiles -- the pages themselves are not locked, so it is tidiness,
// not security. Roles match PinGate's ADMIN_ROLES.
const OWNER_ROLES = ['General Manager', 'Co-Director', 'Studio Executive'];

export default function StudioHome() {
  const [showBackroom, setShowBackroom] = useState(false);
  const [isOwner, setIsOwner] = useState(true);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('glazeup_shift');
      const role = raw ? JSON.parse(raw)?.role : null;
      setIsOwner(!!role && OWNER_ROLES.includes(role));
    } catch { /* leave everything showing */ }
  }, []);
  const backroom = isOwner ? BACKROOM : [];
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  // From the app review: the tiles said what each step IS but nothing
  // about whether it needs you right now. Fetched after render -- the
  // tiles never wait on this, the numbers just appear.
  const [counts, setCounts] = useState<{ today_bookings: number; to_pack: number; due_collection: number } | null>(null);
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/home/counts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setCounts(d); })
      .catch(() => { /* tiles simply stay unbadged */ });
  }, []);

  // Prefetched on arrival. A tile that expands and then sits waiting on a
  // network fetch reads as broken, and this studio's wifi has been the
  // slowest part of every test this week.
  useEffect(() => {
    STEPS.forEach((s) => { router.prefetch(s.href); s.also.forEach((l) => router.prefetch(l.href)); });
  }, [router]);

  const open = (step: { key: string; href: string }) => {
    setOpening(step.key);
    // Let the expand actually play before navigating, so the tile grows
    // into the screen rather than the page snapping over the top of it.
    setTimeout(() => router.push(step.href), 240);
  };

  return (
    <div style={{ padding: '1rem 0.9rem 2rem' }}>
      <div style={{ marginBottom: '1.4rem' }}>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>The Kiln Cafe</h1>
        <p style={{ fontSize: 'var(--text-base)', color: '#777', margin: '0.2rem 0 0' }}>Four things, in the order the pottery moves.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {STEPS.map((step) => {
          const Icon = step.icon;
          const isOpening = opening === step.key;
          return (
            <div key={step.key}>
            <motion.button
              onClick={() => open(step)}
              disabled={!!opening}
              animate={isOpening ? { scale: 1.04, opacity: 0.92 } : { scale: 1, opacity: opening ? 0.35 : 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              whileTap={{ scale: 0.985 }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.9rem', width: '100%',
                padding: '1.15rem 1rem', borderRadius: 'var(--radius-lg)', border: 'none',
                background: step.tint, color: 'white',
                cursor: opening ? 'default' : 'pointer', textAlign: 'left',
                boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
              }}
            >
              <div style={{ flexShrink: 0, width: 46, height: 46, borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={22} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem' }}>
                  <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>{step.label}</span>
                </div>
                <div style={{ fontSize: 'var(--text-sm)', opacity: 0.82, marginTop: '0.1rem' }}>{step.detail}</div>
              </div>
              {(() => {
                if (!counts) return null;
                // [15 Oct] Packing has its own button now, so the number
                // that belongs to packing goes on packing. The kiln tile
                // carries nothing: what is waiting to be fired is not a
                // queue the app can count, it is whatever is on the shelf.
                const n = step.key === 'bookings' ? counts.today_bookings
                  : step.key === 'packing' ? (counts.to_pack || 0) + (counts.due_collection || 0)
                  : null;
                if (!n) return null;
                return (
                  <span style={{ flexShrink: 0, minWidth: 30, height: 30, padding: '0 0.5rem', borderRadius: 15, background: 'rgba(255,255,255,0.25)', color: 'white', fontWeight: 800, fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {n}
                  </span>
                );
              })()}
            </motion.button>
            {step.also.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '0.45rem 0 0 0.2rem' }}>
                {step.also.map((l) => (
                  <button key={l.href} onClick={() => open({ key: l.href, href: l.href })} disabled={!!opening}
                    style={{ minHeight: 34, padding: '0 0.75rem', borderRadius: 999, border: '1px solid #e6ddd2', background: 'white', color: 'var(--charcoal)', fontWeight: 600, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
                    {l.label}
                  </button>
                ))}
              </div>
            )}
            </div>
          );
        })}
      </div>

      {/* [15 Oct] Needs a look went too. It was a waiting room: four piles
          of things the app had noticed and nobody had answered, which is a
          list about the app rather than about pottery. The two piles that
          were real work -- a guessed shape to confirm, a booking charged
          for more pieces than were photographed -- belong next to the
          photograph that raised them, not behind a fifth button. */}

      {/* One line, not eight tiles. Everything here is still one tap away,
          it has just stopped shouting over the work. */}
      {backroom.length > 0 && <button
        onClick={() => setShowBackroom((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.45rem', width: '100%',
          background: 'none', border: 'none', padding: '1.5rem 0 0.6rem',
          cursor: 'pointer', color: '#999', fontSize: 'var(--text-xs)',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
        }}
      >
        Office
        <span style={{ fontSize: '0.95rem', lineHeight: 1 }}>{showBackroom ? '\u2212' : '+'}</span>
      </button>}
      {showBackroom && backroom.length > 0 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {backroom.map((tool) => {
          const Icon = tool.icon;
          return (
            <motion.button
              key={tool.key}
              onClick={() => open(tool)}
              disabled={!!opening}
              animate={opening === tool.key ? { scale: 1.03, opacity: 0.92 } : { scale: 1, opacity: opening ? 0.35 : 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              whileTap={{ scale: 0.985 }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%',
                padding: '0.8rem 0.9rem', borderRadius: 'var(--radius-md)',
                border: '1px solid #ece5db', background: 'white', color: 'var(--charcoal)',
                cursor: opening ? 'default' : 'pointer', textAlign: 'left',
              }}
            >
              <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 'var(--radius-md)', background: tool.tint, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={17} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 700 }}>{tool.label}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: '#777' }}>{tool.detail}</div>
              </div>
            </motion.button>
          );
        })}
      </div>
      )}


      {/* [15 Oct] David: "Just nothing in between." The test card, the
          ticket linker, the verification queue and the party-size
          backfill were all one-off jobs that are done, each leaving a
          page behind. Deleted. Square access stays because the token
          expires and this is the only place that says so. */}
      <div style={{ marginTop: '1.6rem', display: 'flex', justifyContent: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
        {[
          ['Square access', '/square-access'],
        ].map(([label, href]) => (
          <button
            key={href}
            onClick={() => router.push(href)}
            style={{ border: 'none', background: 'none', color: '#c2bab0', fontSize: 'var(--text-xs)', cursor: 'pointer', padding: '0.3rem 0.2rem' }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
