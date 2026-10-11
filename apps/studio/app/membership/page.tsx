'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// [11 Oct] Daisy: "a page taking you to a really nice introduction and
// pricing benefits of our new membership cards." Public, like /my-booking:
// outside the (staff) group, so no PIN, and a customer can scan the QR at
// the bottom and take it home on their own phone.
//
// EVERYTHING YOU MIGHT WANT TO CHANGE IS IN THIS BLOCK. The scheme is still
// being decided, so prices and perks are a first draft; while DRAFT is true
// a small strip says so, so nobody quotes a customer a number that moves.
const DRAFT = true;
const PLANS = [
  {
    key: 'painter',
    name: "Painter's Card",
    for: 'Pottery painting',
    monthly: 12,
    yearly: 120,
    colour: '#B87946',
    ink: '#FFF7EE',
    perks: [
      '10% off every piece of bisque, every visit',
      'A free piece to paint when you join',
      'A mug on us in your birthday month',
      'Member rate on birthday parties in the Party Room',
      'First dibs on seasonal sessions, like Christmas baubles',
      'A little something on your membership anniversary',
    ],
  },
  {
    key: 'maker',
    name: "Maker's Card",
    for: 'Wheels, handbuilding and glazing',
    monthly: 15,
    yearly: 150,
    colour: '#2B2724',
    ink: '#F7F4EE',
    perks: [
      'Wheel hire at £32 instead of £40 for 90 minutes',
      'Member rate on firing your own work',
      '10% off clay',
      'First pick of places on wheel and handbuilding courses',
      'Members-only open studio sessions',
      'A little something on your membership anniversary',
    ],
  },
];
const FAQ = [
  ['How do I join?', 'Ask at the counter next time you are in. It takes a couple of minutes and your card is yours that day.'],
  ['Can I give one as a present?', 'Yes. Any card can be bought as a gift for a year, and comes ready to wrap.'],
  ['Monthly or yearly?', 'Monthly keeps it easy. Yearly works out cheaper, two months free near enough.'],
  ['Can I have both cards?', 'Of course. Ask us and we will sort a price for the pair.'],
];

const C = { charcoal: '#2B2724', clay: '#B87946', sand: '#E8D9C4', ivory: '#F7F4EE', stone: '#8a8178' };
const money = (n: number) => `£${Number.isInteger(n) ? n : n.toFixed(2)}`;

function MemberCard({ plan, tilt }: { plan: typeof PLANS[number]; tilt: number }) {
  return (
    <div style={{
      width: '100%', maxWidth: 320, aspectRatio: '1.586', borderRadius: 18, background: plan.colour, color: plan.ink,
      padding: '1.1rem 1.2rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden',
      boxShadow: '0 18px 40px -18px rgba(43,39,36,0.55), 0 2px 6px rgba(43,39,36,0.12)', transform: `rotate(${tilt}deg)`,
    }}>
      {/* the kiln arch, drawn rather than imported, faint in the corner */}
      <svg viewBox="0 0 100 100" style={{ position: 'absolute', right: -18, bottom: -26, width: 150, opacity: 0.14 }} aria-hidden>
        <path d="M10 100 V55 A40 40 0 0 1 90 55 V100" fill="none" stroke="currentColor" strokeWidth="9" />
        <path d="M32 100 V60 A18 18 0 0 1 68 60 V100" fill="none" stroke="currentColor" strokeWidth="6" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.8 }}>The Kiln Cafe</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', opacity: 0.7 }}>MEMBER</span>
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{plan.name}</div>
        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{plan.for}</div>
      </div>
    </div>
  );
}

export default function MembershipPage() {
  const [yearly, setYearly] = useState(true);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(window.location.href.split('?')[0], { margin: 1, width: 360, color: { dark: C.charcoal, light: '#ffffff' } })
      .then(setQr).catch(() => {});
  }, []);

  return (
    <main style={{ background: C.ivory, color: C.charcoal, minHeight: '100vh', fontFamily: "'Instrument Sans', system-ui, sans-serif" }}>
      {DRAFT && (
        <div style={{ background: C.sand, color: C.charcoal, fontSize: 12, fontWeight: 600, textAlign: 'center', padding: '0.4rem 1rem' }}>
          Draft: prices and perks are not final yet
        </div>
      )}

      {/* Hero */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: '3rem 1.25rem 2rem', display: 'grid', gap: '2.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.clay, margin: 0 }}>Membership</p>
          <h1 style={{ fontSize: 'clamp(2.1rem, 6vw, 3.2rem)', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.04, margin: '0.6rem 0 1rem' }}>
            For the regulars.<br />And the soon‑to‑be.
          </h1>
          <p style={{ fontSize: '1.05rem', lineHeight: 1.6, color: '#5a524b', margin: 0, maxWidth: 440 }}>
            If you keep finding excuses to pop in, this is for you. A Kiln Cafe card gets you better prices every visit,
            first go at the good stuff, and a few treats along the way. Yes, there is cake involved. Sometimes.
          </p>
          <a href="#cards" style={{ display: 'inline-block', marginTop: '1.5rem', background: C.charcoal, color: C.ivory, padding: '0.85rem 1.4rem', borderRadius: 999, fontWeight: 700, textDecoration: 'none' }}>
            See the cards
          </a>
        </div>
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center', minHeight: 300 }}>
          <div style={{ position: 'absolute', width: '82%', transform: 'translate(-8%, -16%)' }}><MemberCard plan={PLANS[1]} tilt={-7} /></div>
          <div style={{ position: 'relative', width: '82%', transform: 'translate(8%, 14%)' }}><MemberCard plan={PLANS[0]} tilt={4} /></div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: '1.5rem 1.25rem' }}>
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {[
            ['1', 'Pick your card', 'Painting, or getting your hands in the clay. Or both, we won\'t judge.'],
            ['2', 'Join at the counter', 'Monthly or yearly. Your card is ready the same day.'],
            ['3', 'Show it, save', 'Every visit, every party booking. We\'ll remember your birthday too.'],
          ].map(([n, t, d]) => (
            <div key={n} style={{ background: 'white', border: `1px solid ${C.sand}`, borderRadius: 16, padding: '1.2rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: 16, background: C.sand, color: C.charcoal, fontWeight: 700, display: 'grid', placeItems: 'center' }}>{n}</div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0.8rem 0 0.3rem' }}>{t}</h3>
              <p style={{ margin: 0, color: '#5a524b', lineHeight: 1.5, fontSize: '0.95rem' }}>{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cards and prices */}
      <section id="cards" style={{ maxWidth: 980, margin: '0 auto', padding: '2.5rem 1.25rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.4rem' }}>
          <h2 style={{ fontSize: 'clamp(1.6rem, 4vw, 2.2rem)', fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Two cards. Pick yours.</h2>
          <div role="group" aria-label="Billing" style={{ display: 'inline-flex', background: 'white', border: `1px solid ${C.sand}`, borderRadius: 999, padding: 4 }}>
            {[['Monthly', false], ['Yearly', true]].map(([label, v]) => (
              <button key={String(label)} onClick={() => setYearly(v as boolean)} aria-pressed={yearly === v}
                style={{ border: 'none', borderRadius: 999, padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', background: yearly === v ? C.charcoal : 'transparent', color: yearly === v ? C.ivory : C.charcoal }}>
                {label as string}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gap: '1.2rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {PLANS.map((p) => {
            const saving = p.monthly * 12 - p.yearly;
            return (
              <article key={p.key} style={{ background: 'white', borderRadius: 22, border: `1px solid ${C.sand}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ background: `linear-gradient(160deg, ${C.sand}, #f1e7da)`, padding: '1.6rem 1.4rem 1.4rem', display: 'grid', placeItems: 'center' }}>
                  <MemberCard plan={p} tilt={0} />
                </div>
                <div style={{ padding: '1.4rem', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
                    <span style={{ fontSize: '2.4rem', fontWeight: 700, letterSpacing: '-0.03em' }}>{money(yearly ? p.yearly : p.monthly)}</span>
                    <span style={{ color: C.stone, fontWeight: 600 }}>{yearly ? 'a year' : 'a month'}</span>
                  </div>
                  <p style={{ margin: '0.2rem 0 1rem', fontSize: '0.9rem', color: yearly && saving > 0 ? '#3d7a4a' : C.stone, fontWeight: 600 }}>
                    {yearly ? (saving > 0 ? `Saves ${money(saving)} on paying monthly` : 'Paid once a year') : `Or ${money(p.yearly)} a year`}
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.65rem' }}>
                    {p.perks.map((perk) => (
                      <li key={perk} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', lineHeight: 1.45 }}>
                        <span aria-hidden style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 10, background: p.colour, color: p.ink, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, marginTop: 1 }}>✓</span>
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Gift */}
      <section style={{ maxWidth: 980, margin: '0 auto', padding: '2rem 1.25rem' }}>
        <div style={{ background: C.charcoal, color: C.ivory, borderRadius: 22, padding: '2rem 1.5rem', display: 'grid', gap: '1.2rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.sand, margin: 0, opacity: 0.8 }}>Give it</p>
            <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, letterSpacing: '-0.02em', margin: '0.4rem 0 0.6rem', color: C.ivory }}>The present that keeps turning up.</h2>
            <p style={{ margin: 0, lineHeight: 1.6, color: C.ivory, opacity: 0.85 }}>
              A year of membership, ready to wrap. Better than socks, and they will think of you every time they pick up a brush.
            </p>
          </div>
          <div style={{ justifySelf: 'center', width: '100%', maxWidth: 300 }}><MemberCard plan={PLANS[0]} tilt={-3} /></div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1.25rem' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.8rem' }}>Good questions</h2>
        {FAQ.map(([q, a]) => (
          <details key={q} style={{ background: 'white', border: `1px solid ${C.sand}`, borderRadius: 14, padding: '0.9rem 1.1rem', marginBottom: '0.6rem' }}>
            <summary style={{ fontWeight: 700, cursor: 'pointer' }}>{q}</summary>
            <p style={{ margin: '0.6rem 0 0', color: '#5a524b', lineHeight: 1.55 }}>{a}</p>
          </details>
        ))}
      </section>

      {/* Take it home */}
      <section style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1.25rem 3.5rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0 }}>Ready when you are</h2>
        <p style={{ color: '#5a524b', margin: '0.4rem 0 1.2rem' }}>Ask at the counter to join. Or scan this to take the page home.</p>
        {qr && <img src={qr} alt="QR code for this page" style={{ display: 'block', margin: '0 auto', width: 160, height: 160, borderRadius: 12, background: 'white', padding: 8, border: `1px solid ${C.sand}` }} />}
        <p style={{ color: C.stone, fontSize: 12, marginTop: '1.5rem' }}>The Kiln Cafe · The Old Bank, Cheapside, Langport</p>
      </section>
    </main>
  );
}
