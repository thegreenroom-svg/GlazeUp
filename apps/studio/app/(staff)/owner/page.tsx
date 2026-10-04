'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { PageShell } from '@/components/PageShell';
import { Loader, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

// Daisy: "something to look at every day."
//
// The honest bit first. The biggest line in the takings has always been a
// category called Other -- about GBP 328k over four years, roughly 40% of
// everything -- and nobody could say what was in it. It turns out it is
// mostly bisque that was never given a category in Square: teapots,
// lanterns, the big serving bowls. Parties and courses are in there too but
// they are a small slice.
//
// So Other is broken apart here rather than shown as one lump, the split is
// labelled as an estimate because it is apportioned by catalogue value, and
// the uncategorised pieces are listed as a job to do. A dashboard that
// quietly hides 40% of the takings is worse than no dashboard.

const B = {
  text: 'var(--charcoal)', stone: 'var(--stone)',
  clay: 'var(--clay)', sand: 'var(--sand)', ivory: 'var(--ivory)',
};

const money = (c: number) =>
  '£' + Math.round((c || 0) / 100).toLocaleString('en-GB');

const prettyMonth = (m: string) =>
  new Date(m + '-01T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });

const prettyDay = (d: string) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit' });

interface Dash {
  latest_day: string; latest_day_cents: number;
  last7_cents: number; prev7_cents: number;
  last30_cents: number; prev30_cents: number;
  trading_days: number; avg_day_cents: number;
  best_day: { key: string; cents: number };
  best_week: { key: string; cents: number };
  best_month: { key: string; cents: number };
  spark: { d: string; v: number }[];
  months: { month: string; cents: number }[];
  categories: { name: string; cents: number; estimated: boolean }[];
  other_total_cents: number;
  uncategorised: { name: string; price_cents: number }[];
  uncategorised_count: number;
  other_items?: { name: string; cents: number; count: number; last: string | null }[];
  other_items_count?: number;
  uncollected_pieces: number;
  bookings_total: number;
}

// A day against the best day ever. A bar, not a speedometer -- a dial looks
// like a target you were set, and nobody set this one.
function DayGauge({ today, best, avg }: { today: number; best: number; avg: number }) {
  const pct = best > 0 ? Math.min(1, today / best) : 0;
  const avgPct = best > 0 ? Math.min(1, avg / best) : 0;
  return (
    <div style={{ marginTop: '0.9rem' }}>
      <div style={{
        position: 'relative', height: 14, borderRadius: 999,
        backgroundColor: 'var(--sand)', overflow: 'hidden',
      }}>
        <div style={{
          width: (pct * 100).toFixed(1) + '%', height: '100%', borderRadius: 999,
          background: 'linear-gradient(90deg, var(--clay), #d89a5e)',
          transition: 'width 900ms cubic-bezier(.2,.7,.3,1)',
        }} />
        {/* where an average day sits, so a good day reads as good */}
        <div style={{
          position: 'absolute', top: -3, bottom: -3,
          left: (avgPct * 100).toFixed(1) + '%',
          width: 2, backgroundColor: 'var(--charcoal)', opacity: 0.45,
        }} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: 'var(--text-xs)', color: B.stone, marginTop: '0.35rem',
      }}>
        <span>average day {money(avg)}</span>
        <span>best ever {money(best)}</span>
      </div>
    </div>
  );
}

function Spark({ points }: { points: { d: string; v: number }[] }) {
  if (!points?.length) return null;
  const max = Math.max(...points.map((p) => p.v)) || 1;
  const W = 320, H = 54;
  const step = W / Math.max(1, points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(H - (p.v / max) * (H - 6) - 3).toFixed(1)}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block', marginTop: '0.6rem' }}>
      <path d={`${path} L${W},${H} L0,${H} Z`} fill="var(--clay)" opacity="0.12" />
      <path d={path} fill="none" stroke="var(--clay)" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return null;
  const pc = Math.round(((now - before) / before) * 100);
  const up = pc >= 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
      fontSize: 'var(--text-xs)', fontWeight: 700,
      color: up ? '#3d7a4a' : '#b0203c',
    }}>
      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {up ? '+' : ''}{pc}%
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      backgroundColor: '#fff', border: `1px solid ${B.sand}`,
      borderRadius: 'var(--radius-md)', padding: '0.95rem 1rem',
      marginBottom: '0.6rem',
    }}>{children}</div>
  );
}

export default function OwnerPage() {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState(false);
  const [showTodo, setShowTodo] = useState(false);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/owner/dashboard`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.error ? setErr(true) : setD(j)))
      .catch(() => setErr(true));
  }, []);

  if (err) return (
    <PageShell title="The numbers" subtitle="Takings, records and where it comes from">
      <p style={{ color: B.stone }}>Could not load the figures just now.</p>
    </PageShell>
  );

  if (!d) return (
    <PageShell title="The numbers" subtitle="Takings, records and where it comes from">
      <p style={{ color: B.stone, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Loader size={15} className="animate-spin" /> Adding it up
      </p>
    </PageShell>
  );

  const catMax = d.categories[0]?.cents || 1;

  return (
    <PageShell title="The numbers" subtitle="Takings, records and where it comes from">

      <Card>
        <p style={{ color: B.stone, fontSize: 'var(--text-xs)', fontWeight: 600 }}>
          LAST TRADING DAY · {d.latest_day ? prettyDay(d.latest_day) : ''}
        </p>
        <p style={{
          fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.03em',
          color: B.text, lineHeight: 1, marginTop: '0.2rem',
        }}>
          {money(d.latest_day_cents)}
        </p>
        <DayGauge today={d.latest_day_cents} best={d.best_day.cents} avg={d.avg_day_cents} />
        <Spark points={d.spark} />
        <p style={{ color: B.stone, fontSize: 'var(--text-xs)' }}>
          The last sixty trading days
        </p>
      </Card>

      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.6rem' }}>
        {[
          { label: 'Last 7 days', now: d.last7_cents, before: d.prev7_cents },
          { label: 'Last 30 days', now: d.last30_cents, before: d.prev30_cents },
        ].map((x) => (
          <div key={x.label} style={{
            flex: 1, backgroundColor: '#fff', border: `1px solid ${B.sand}`,
            borderRadius: 'var(--radius-md)', padding: '0.85rem 0.9rem',
          }}>
            <p style={{ color: B.stone, fontSize: 'var(--text-xs)', fontWeight: 600 }}>{x.label}</p>
            <p style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.02em', color: B.text }}>
              {money(x.now)}
            </p>
            <Delta now={x.now} before={x.before} />
          </div>
        ))}
      </div>

      <Card>
        <p style={{ color: B.text, fontWeight: 700, marginBottom: '0.55rem' }}>Records</p>
        {[
          { l: 'Best day', k: d.best_day.key ? prettyDay(d.best_day.key) : '', v: d.best_day.cents },
          { l: 'Best week', k: d.best_week.key ? 'week of ' + prettyDay(d.best_week.key) : '', v: d.best_week.cents },
          { l: 'Best month', k: d.best_month.key ? prettyMonth(d.best_month.key) : '', v: d.best_month.cents },
        ].map((r) => (
          <div key={r.l} style={{
            display: 'flex', alignItems: 'baseline', gap: '0.5rem',
            padding: '0.4rem 0', borderBottom: `1px solid ${B.sand}55`,
          }}>
            <span style={{ color: B.text, fontWeight: 600, fontSize: 'var(--text-sm)', minWidth: '5.6rem' }}>{r.l}</span>
            <span style={{ color: B.stone, fontSize: 'var(--text-xs)', flex: 1 }}>{r.k}</span>
            <span style={{ color: 'var(--clay)', fontWeight: 800 }}>{money(r.v)}</span>
          </div>
        ))}
        <p style={{ color: B.stone, fontSize: 'var(--text-xs)', marginTop: '0.5rem' }}>
          Across {d.trading_days.toLocaleString('en-GB')} trading days.
          An average day takes {money(d.avg_day_cents)}.
        </p>
      </Card>

      <Card>
        <p style={{ color: B.text, fontWeight: 700, marginBottom: '0.15rem' }}>Where it comes from</p>
        <p style={{ color: B.stone, fontSize: 'var(--text-xs)', marginBottom: '0.6rem' }}>
          Every category, all time
        </p>
        {d.categories.slice(0, 14).map((c) => (
          <div key={c.name} style={{ marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={{ color: B.text, fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                {c.name}
                {c.estimated && (
                  <span style={{ color: '#a8651a', fontWeight: 700 }}> · estimated</span>
                )}
              </span>
              <span style={{ color: B.stone, fontSize: 'var(--text-xs)', flexShrink: 0 }}>{money(c.cents)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, backgroundColor: B.sand, marginTop: '0.2rem' }}>
              <div style={{
                width: ((c.cents / catMax) * 100).toFixed(1) + '%', height: '100%',
                borderRadius: 999,
                backgroundColor: c.estimated ? '#c8925a' : 'var(--clay)',
              }} />
            </div>
          </div>
        ))}
      </Card>

      {(d.other_items?.length ?? 0) > 0 && (
        <Card>
          <p style={{ color: B.text, fontWeight: 700 }}>What is in Other</p>
          <p style={{ color: B.stone, fontSize: 'var(--text-xs)', marginTop: '0.25rem', lineHeight: 1.5 }}>
            {money(d.other_total_cents)} across {d.other_items_count} things that had no
            category in Square when they were sold, mostly items since deleted. Old
            sessions and parties are already moved to their own lines by name.
          </p>
          <button
            onClick={() => setShowTodo((v) => !v)}
            style={{
              marginTop: '0.5rem', background: 'none', border: 'none', padding: 0,
              color: 'var(--clay)', fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {showTodo ? 'Hide the list' : 'Show me what they are'}
          </button>
          {showTodo && (
            <div style={{ marginTop: '0.7rem', borderTop: `1px solid ${B.sand}`, paddingTop: '0.5rem' }}>
              {d.other_items!.map((it, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', gap: '0.5rem',
                  fontSize: 'var(--text-xs)', padding: '0.22rem 0', color: B.text,
                }}>
                  <span>{it.name} <span style={{ color: B.stone }}>×{it.count}</span></span>
                  <span style={{ color: B.stone, flexShrink: 0 }}>{money(it.cents)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!(d.other_items?.length) && d.uncategorised_count > 0 && (
        <Card>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <AlertCircle size={17} color="#a8651a" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <p style={{ color: B.text, fontWeight: 700 }}>
                {d.uncategorised_count} items have no category in Square
              </p>
              <p style={{ color: B.stone, fontSize: 'var(--text-xs)', marginTop: '0.25rem', lineHeight: 1.5 }}>
                They are why {money(d.other_total_cents)} has been sitting under
                &quot;Other&quot; with nothing to say what it was. Nearly all of it is
                pottery — teapots, lanterns, the big serving bowls. Give them a
                category in Square and this page corrects itself.
              </p>
              <button
                onClick={() => setShowTodo((v) => !v)}
                style={{
                  marginTop: '0.5rem', background: 'none', border: 'none', padding: 0,
                  color: 'var(--clay)', fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer',
                }}
              >
                {showTodo ? 'Hide the list' : 'Show me which ones'}
              </button>
            </div>
          </div>
          {showTodo && (
            <div style={{ marginTop: '0.7rem', borderTop: `1px solid ${B.sand}`, paddingTop: '0.5rem' }}>
              {d.uncategorised.map((it, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', gap: '0.5rem',
                  fontSize: 'var(--text-xs)', padding: '0.22rem 0', color: B.text,
                }}>
                  <span>{it.name}</span>
                  <span style={{ color: B.stone, flexShrink: 0 }}>{money(it.price_cents)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card>
        <p style={{ color: B.text, fontWeight: 700, marginBottom: '0.5rem' }}>By month</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
          {d.months.map((m) => {
            const mx = Math.max(...d.months.map((x) => x.cents)) || 1;
            return (
              <div key={m.month} style={{ flex: 1, textAlign: 'center' }} title={`${prettyMonth(m.month)} ${money(m.cents)}`}>
                <div style={{
                  height: Math.max(2, (m.cents / mx) * 74),
                  borderRadius: '3px 3px 0 0', backgroundColor: 'var(--clay)',
                  opacity: 0.55 + 0.45 * (m.cents / mx),
                }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: B.stone, fontSize: 'var(--text-xs)', marginTop: '0.3rem' }}>
          <span>{d.months.length ? prettyMonth(d.months[0].month) : ''}</span>
          <span>{d.months.length ? prettyMonth(d.months[d.months.length - 1].month) : ''}</span>
        </div>
      </Card>

      <Card>
        <p style={{ color: B.text, fontWeight: 700, marginBottom: '0.4rem' }}>On the shelves right now</p>
        <p style={{ color: B.stone, fontSize: 'var(--text-sm)', lineHeight: 1.55 }}>
          <b style={{ color: B.text }}>{d.uncollected_pieces}</b> pieces painted and not yet
          collected, across <b style={{ color: B.text }}>{d.bookings_total}</b> bookings on record.
          Every one of them has already cost you clay, glaze, a firing and the shelf it sits on.
        </p>
      </Card>

    </PageShell>
  );
}
