'use client';

// [11 Oct] ONE CONTROL LINE, EVERYWHERE.
//
// Daisy, looking at the daily cards: "this looks very very busy". Ten
// bands of headings, counts, filters and buttons stacked above the first
// booking, so the thing you opened the page for started 1,570 pixels down.
//
// The fix there was to put every control on one line that scrolls
// sideways, and to hide the guidance and the search behind a tap. The same
// shapes were then wanted on every other screen, so they live here rather
// than being re-invented page by page:
//
//   Toolbar   one line of controls, scrolls sideways, never wraps
//   Tool      a chip in that line (on/off, or just a button)
//   Count     the quiet "12 bookings" at the start of the line
//   Tally     numbers inline and tappable, instead of a grid of big tiles
//   Collapse  guidance folded into one tappable line
//   Search    behind a magnifier, so it costs nothing when unused
//
// The rule they share: nothing takes vertical space until someone asks
// for it, and no number is shown twice.

import React, { useState } from 'react';
import { ChevronDown, Search as SearchIcon, X } from 'lucide-react';

const line: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.35rem',
  overflowX: 'auto',
  paddingBottom: 2,
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'none',
};

/** One line of controls. Anything inside keeps its width and scrolls. */
export function Toolbar({ children, gap = '0.35rem', style }: { children: React.ReactNode; gap?: string; style?: React.CSSProperties }) {
  return <div className="no-print" style={{ ...line, gap, marginBottom: '0.8rem', ...style }}>{children}</div>;
}

export type ToolTone = 'quiet' | 'clay' | 'dark' | 'good' | 'warn' | 'late';
const TONE: Record<ToolTone, string> = {
  quiet: '#8a8178', clay: 'var(--clay)', dark: 'var(--charcoal)',
  good: '#2E7D32', warn: '#A6761D', late: '#C0392B',
};

/**
 * A chip on the control line. `active` fills it in; without `active` it is
 * an ordinary small button. 44px high so it is still a thumb-sized target
 * on the iPad.
 */
export function Tool({
  onClick, active, tone = 'quiet', icon, children, disabled, label, small,
}: {
  onClick?: () => void;
  active?: boolean;
  tone?: ToolTone;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  disabled?: boolean;
  /** For an icon-only chip. */
  label?: string;
  small?: boolean;
}) {
  const c = TONE[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        minHeight: small ? 32 : 36, padding: children ? '0 0.75rem' : '0 0.5rem',
        borderRadius: 999, border: `1px solid ${active ? c : '#e0d7cb'}`,
        background: active ? c : 'white', color: active ? 'white' : c,
        fontWeight: 700, fontSize: 'var(--text-xs)', whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon}{children}
    </button>
  );
}

/**
 * The same chip, but it opens the camera. A file input cannot be a button,
 * so this is a label wearing the chip's clothes -- used where photographing
 * something is one option among several rather than the point of the page.
 */
export function ToolFile({
  onFile, children, icon, busy, tone = 'clay',
}: {
  onFile: (f: File) => void;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  busy?: boolean;
  tone?: ToolTone;
}) {
  const c = TONE[tone];
  return (
    <label
      style={{
        flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
        minHeight: 36, padding: '0 0.75rem', borderRadius: 999,
        border: `1px solid ${c}`, background: 'white', color: c,
        fontWeight: 700, fontSize: 'var(--text-xs)', whiteSpace: 'nowrap',
        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
      }}
    >
      {icon}{children}
      <input
        type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={busy}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />
    </label>
  );
}

/** The quiet count that starts a control line. */
export function Count({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ flexShrink: 0, fontSize: 'var(--text-xs)', color: '#6b625a', fontWeight: 700, whiteSpace: 'nowrap', paddingRight: '0.15rem' }}>
      {children}
    </span>
  );
}

/**
 * Numbers as one line of words rather than a grid of tiles.
 *
 * A grid of three big numbers above a list that says the same thing is the
 * busyness Daisy was pointing at: "5 to pack" in 28px type, directly above
 * a heading that says To pack with five rows under it. Here they are a
 * sentence, and tapping one jumps to or filters by it. A zero is dropped,
 * because nothing is the normal state and does not need announcing.
 */
export function Tally({ items }: { items: { label: string; n: number; tone?: ToolTone; onClick?: () => void; always?: boolean }[] }) {
  const show = items.filter((i) => i.n > 0 || i.always);
  if (!show.length) return null;
  return (
    <div style={{ ...line, marginBottom: '0.75rem', gap: 0 }}>
      {show.map((i, k) => (
        <React.Fragment key={i.label}>
          {k > 0 && <span style={{ color: '#cfc5b8', padding: '0 0.45rem', flexShrink: 0 }}>·</span>}
          {i.onClick ? (
            <button onClick={i.onClick} style={{ flexShrink: 0, border: 'none', background: 'none', padding: 0, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 'var(--text-sm)', color: TONE[i.tone || 'quiet'], fontWeight: 600 }}>
              <b style={{ fontWeight: 800 }}>{i.n}</b> {i.label} <span style={{ opacity: 0.6 }}>›</span>
            </button>
          ) : (
            <span style={{ flexShrink: 0, whiteSpace: 'nowrap', fontSize: 'var(--text-sm)', color: TONE[i.tone || 'quiet'], fontWeight: 600 }}>
              <b style={{ fontWeight: 800 }}>{i.n}</b> {i.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * Guidance folded into one tappable line.
 *
 * Out of the kiln had seven bullets of how-to above the camera button --
 * read once, in the way forever after. Opened state is remembered for the
 * session only, so the first box of the day can be a reminder and the next
 * nine are not.
 */
export function Collapse({
  summary, children, icon, startOpen = false,
}: {
  summary: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <div style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', marginBottom: '0.8rem', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 0.75rem', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--charcoal)' }}
      >
        {icon}
        <span style={{ flex: 1, minWidth: 0 }}>{summary}</span>
        <ChevronDown size={16} color="#b5aca2" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
      </button>
      {open && <div style={{ padding: '0 0.75rem 0.75rem' }}>{children}</div>}
    </div>
  );
}

/**
 * Search behind a magnifier. Returns the chip to put on the control line
 * and the box to render under it, so a page that never searches pays
 * nothing for having the option.
 */
export function useSearch(onClear?: () => void) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const close = () => { setOpen(false); setQ(''); onClear?.(); };
  const chip = (
    <Tool
      onClick={() => (open ? close() : setOpen(true))}
      active={open}
      tone="dark"
      label={open ? 'Close search' : 'Search'}
      icon={open ? <X size={15} /> : <SearchIcon size={15} />}
    />
  );
  const box = open ? (
    <div className="no-print" style={{ marginBottom: '0.8rem' }}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name, phone or booking code"
        style={{ width: '100%', minHeight: 44, padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid #d8cbbc', background: 'white', color: 'var(--charcoal)', fontSize: 'var(--text-base)' }}
      />
    </div>
  ) : null;
  return { open, q, setQ, chip, box, close };
}

/** A heading for a list, with the count in it rather than on its own line. */
export function Section({ icon, children, n, tone = 'quiet', right }: { icon?: React.ReactNode; children: React.ReactNode; n?: number; tone?: ToolTone; right?: React.ReactNode }) {
  return (
    <h2 style={{ margin: '1.1rem 0 0.5rem', fontSize: 'var(--text-sm)', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: TONE[tone], display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      {icon}{children}
      {n != null && <span style={{ fontWeight: 700, opacity: 0.6 }}>{n}</span>}
      {right && <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>{right}</span>}
    </h2>
  );
}
