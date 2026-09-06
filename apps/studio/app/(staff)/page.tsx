'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Printer, Camera, Package, Check, Layers, Boxes, Image as ImageIcon, Search } from 'lucide-react';

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
const STEPS = [
  { key: 'cards',   n: 1, label: 'Print cards',           detail: 'Booking references for today',      href: '/daily-cards', icon: Printer, tint: '#8C6A4A' },
  { key: 'table',   n: 2, label: 'Photograph the table',  detail: 'All pieces clear, QR code in shot', href: '/floor',       icon: Camera,  tint: '#A8763E' },
  // Unloading is its own step in the day, not a variant of packing: it
  // happens hours or days earlier, usually by whoever opened the kiln,
  // and doing it badly is invisible until packing day. It carries its
  // own technique -- loose spacing, 45 degrees down -- so it gets its
  // own screen where that guidance can be read rather than remembered.
  { key: 'kiln',       n: 3, label: 'Out of the kiln', detail: 'Box it up and photograph each box',  href: '/out-of-kiln', icon: Boxes,   tint: '#7C5E4C' },
  { key: 'packing',    n: 4, label: 'Packing',    detail: 'Find whose pottery is ready',       href: '/packing',    icon: Package, tint: '#9C5A3C' },
  { key: 'collection', n: 5, label: 'Collection', detail: 'Print the card, hand pottery over',  href: '/collection', icon: Check,   tint: '#6E7A55' },
  // Daisy has now said three times that she cannot find something I
  // built, and the cause is mine: I kept adding entry points as small
  // text links buried inside other screens. The wall of boxes is a
  // place she wants to GO, not a footnote on the packing screen, so it
  // gets a tile like everything else she reaches for.
];

// [6 Sep] Daisy: "it's all looking very messy... rationalise the
// navigation again and consolidate."
//
// The mess was structural, and mine. This screen is a NUMBERED list,
// which promises "do these in order today". Steps 1 to 5 genuinely are
// that -- print, photograph, unload, pack, hand over -- and they happen
// in that order every open day.
//
// Then I bolted three more onto the end and numbered them 6, 7 and 8,
// because a tile was the only shape available and each one had a real
// reason to be reachable. But the shelf wall, the booking search and
// the photo backfill are not steps in a day. Nobody does them after
// collection. Numbering them said they were part of the sequence, so
// the sequence stopped meaning anything and the screen just read as a
// list of eight things.
//
// Two lists now, because there are two kinds of thing. The day in
// order, then the tools you reach for when something needs finding or
// fixing. Same destinations, no invented ordering, and the tools are
// visibly secondary rather than competing with the work.
const TOOLS = [
  { key: 'shelves',  label: 'Wall of shelves',      detail: 'Every box, and what is in it',        href: '/shelves',  icon: Layers,    tint: '#7A6A8C' },
  { key: 'find',     label: 'Find a booking',       detail: 'Any name or date, whole history',     href: '/find',     icon: Search,    tint: '#4F6D7A' },
  { key: 'backfill', label: 'Backfill from photos', detail: 'Tables photographed outside the app', href: '/backfill', icon: ImageIcon, tint: '#5F7A8C' },
];


export default function StudioHome() {
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
    [...STEPS, ...TOOLS].forEach((s) => router.prefetch(s.href));
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
        <p style={{ fontSize: 'var(--text-base)', color: '#777', margin: '0.2rem 0 0' }}>Five steps, start to finish.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {STEPS.map((step) => {
          const Icon = step.icon;
          const isOpening = opening === step.key;
          return (
            <motion.button
              key={step.key}
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
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 800, opacity: 0.7 }}>{step.n}</span>
                  <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>{step.label}</span>
                </div>
                <div style={{ fontSize: 'var(--text-sm)', opacity: 0.82, marginTop: '0.1rem' }}>{step.detail}</div>
              </div>
              {(() => {
                if (!counts) return null;
                const n = step.key === 'cards' ? counts.today_bookings
                  : step.key === 'packing' ? counts.to_pack
                  : step.key === 'collection' ? counts.due_collection
                  : null;
                if (!n) return null;
                return (
                  <span style={{ flexShrink: 0, minWidth: 30, height: 30, padding: '0 0.5rem', borderRadius: 15, background: 'rgba(255,255,255,0.25)', color: 'white', fontWeight: 800, fontSize: 'var(--text-base)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {n}
                  </span>
                );
              })()}
            </motion.button>
          );
        })}
      </div>

      {/* Deliberately quieter than the steps above: smaller, paler, no
          numbers. These are places to go when something needs finding
          or fixing, not work waiting to be done today. */}
      <p style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '1.6rem 0 0.6rem' }}>
        Anytime
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {TOOLS.map((tool) => {
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

      <button
        onClick={() => router.push('/test-card')}
        disabled={!!opening}
        style={{
          marginTop: '1.6rem', width: '100%', padding: '0.7rem',
          borderRadius: 'var(--radius-md)', border: '1px dashed #c9c0b4', background: 'transparent',
          color: '#8a8178', fontWeight: 600, fontSize: 'var(--text-sm)', cursor: 'pointer',
        }}
      >
        Make a test card
      </button>

      {/* From the app review: four maintenance pages existed with no way
          in except typing their URLs -- including the Square access
          checker, which matters urgently before the token expires. Kept
          deliberately quiet: tiny, grey, below everything, invisible in
          normal use. */}
      <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '0.9rem', flexWrap: 'wrap' }}>
        {[
          ['Square access', '/square-access'],
          ['Ticket link', '/ticket-link'],
          ['Verification', '/needs-verification'],
          ['Party sizes', '/backfill-party-sizes'],
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
