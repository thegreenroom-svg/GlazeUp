'use client';

import { useEffect, useRef } from 'react';

// ---------------------------------------------------------------------------
// [10 Oct] DATES BY SLIDING. Daisy: "sliders on calendar date choosing". The
// iPad's date box is fiddly with clay on your hands, and opens blank. This is
// a strip of days to swipe and tap, with a slider underneath to scrub weeks
// at a time. Closed days are shaded but can still be picked; Saturdays (the
// usual collection day) are marked; shelves that already exist get a dot.
export const OPEN_DAYS = new Set([0, 3, 4, 5, 6]); // Sun, Wed-Sat
export const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const plusDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return isoOf(d); };
export function dayName(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/,/g, '');
}
// The latest sensible firing day: two open days before collection.
export function fireBy(collect: string) {
  let d = collect; let n = 0;
  while (n < 2) { d = plusDays(d, -1); if (OPEN_DAYS.has(new Date(`${d}T12:00:00`).getDay())) n++; }
  return d;
}

export function DateSlider({ value, onChange, max, mark, existing, busy }: {
  value: string; onChange: (iso: string) => void; max?: string; mark?: string; existing?: string[]; busy?: boolean;
}) {
  const today = isoOf(new Date());
  const span = 56;
  const days = Array.from({ length: span }, (_, i) => plusDays(today, i)).filter((d) => !max || d <= max);
  const strip = useRef<HTMLDivElement>(null);
  const TILE = 58;
  const idx = Math.max(0, days.indexOf(value));
  useEffect(() => {
    strip.current?.scrollTo({ left: Math.max(0, idx * (TILE + 6) - (strip.current.clientWidth - TILE) / 2), behavior: 'smooth' });
  }, [idx]);
  const has = new Set(existing || []);
  return (
    <div style={{ opacity: busy ? 0.6 : 1 }}>
      <div ref={strip} style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px 2px 6px', WebkitOverflowScrolling: 'touch', scrollSnapType: 'x proximity' }}>
        {days.map((d, i) => {
          const dt = new Date(`${d}T12:00:00`);
          const on = d === value;
          const closed = !OPEN_DAYS.has(dt.getDay());
          const sat = dt.getDay() === 6;
          const first = i === 0 || dt.getDate() === 1;
          return (
            <button key={d} disabled={busy} onClick={() => onChange(d)}
              style={{
                flex: `0 0 ${TILE}px`, minHeight: 66, borderRadius: 10, scrollSnapAlign: 'center', padding: '0.3rem 0',
                border: on ? '2px solid var(--clay)' : d === mark ? '2px dashed #8a8178' : '1px solid #e6ddd2',
                background: on ? 'var(--clay)' : closed ? '#f3efe9' : 'white', color: on ? 'white' : 'var(--charcoal)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1, position: 'relative',
              }}>
              <span style={{ fontSize: 10, fontWeight: 700, opacity: on ? 0.9 : 0.6 }}>{d === today ? 'TODAY' : dt.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}</span>
              <span style={{ fontSize: 19, fontWeight: 800 }}>{dt.getDate()}</span>
              <span style={{ fontSize: 9.5, fontWeight: 600, opacity: 0.7 }}>{first ? dt.toLocaleDateString('en-GB', { month: 'short' }) : closed ? 'closed' : sat ? 'collect' : ''}</span>
              {has.has(d) && <span style={{ position: 'absolute', top: 4, right: 5, width: 6, height: 6, borderRadius: 3, background: on ? 'white' : 'var(--clay)' }} />}
            </button>
          );
        })}
      </div>
      {days.length > 7 && (
        <input type="range" min={0} max={days.length - 1} step={1} value={idx} disabled={busy}
          onChange={(e) => onChange(days[parseInt(e.target.value, 10)])}
          aria-label="Slide to pick a day"
          style={{ width: '100%', accentColor: 'var(--clay)', marginTop: 2 }} />
      )}
    </div>
  );
}
