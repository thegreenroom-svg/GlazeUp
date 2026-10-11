'use client';

// [11 Oct] ONE LIST ROW, EVERYWHERE.
//
// Collect, the booking page and the kiln shelves had each grown their own
// idea of what a row of pottery looks like: different borders, different
// places for the piece count, the due date sometimes under the name and
// sometimes floated right. Packing and Collection were older still. This is
// the shape they all share now -- a thumbnail, the name, a quiet line of
// detail, small coloured chips for anything that needs noticing, and one
// action on the right -- so a person moving between screens is reading the
// same thing in the same place each time.

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { PieceThumb, PieceBox } from '@/components/PieceBoxes';

export type ChipTone = 'quiet' | 'clay' | 'good' | 'warn' | 'late' | 'kiln' | 'post';

const TONES: Record<ChipTone, { bg: string; fg: string }> = {
  quiet: { bg: '#f3efe9', fg: '#6b625a' },
  clay: { bg: '#f6ece1', fg: '#8C6A4A' },
  good: { bg: '#e7f4e8', fg: '#2E7D32' },
  warn: { bg: '#fff4d6', fg: '#8a5a00' },
  late: { bg: '#fdecea', fg: '#C0392B' },
  kiln: { bg: '#fbe9e1', fg: '#B8562E' },
  post: { bg: '#fdf3e0', fg: '#A6761D' },
};

export function Chip({ tone = 'quiet', children, onClick }: { tone?: ChipTone; children: React.ReactNode; onClick?: (e: React.MouseEvent) => void }) {
  const t = TONES[tone];
  return (
    <span
      role={onClick ? 'link' : undefined}
      onClick={onClick}
      style={{
        display: 'inline-block', padding: '0.2rem 0.55rem', borderRadius: 999,
        background: t.bg, color: t.fg, fontSize: 'var(--text-xs)', fontWeight: 700,
        cursor: onClick ? 'pointer' : undefined, whiteSpace: 'nowrap',
      }}
    >
      {children}{onClick ? ' ›' : ''}
    </span>
  );
}

export function Row({
  title, detail, chips, photo, box, tone = 'plain', onClick, action, children,
}: {
  title: React.ReactNode;
  detail?: React.ReactNode;
  chips?: React.ReactNode;
  photo?: string | null;
  box?: PieceBox | null;
  /** 'late' outlines the row in red; 'done' tints it green. */
  tone?: 'plain' | 'late' | 'done';
  onClick?: () => void;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const border = tone === 'late' ? '#f0c9c3' : tone === 'done' ? '#CDE3CD' : '#ece5db';
  const bg = tone === 'done' ? '#F4F8F4' : 'white';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: bg, border: `1px solid ${border}`, borderRadius: 'var(--radius-md)', padding: '0.55rem 0.6rem', marginBottom: '0.45rem' }}>
      <button
        onClick={onClick}
        disabled={!onClick}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.6rem', border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: onClick ? 'pointer' : 'default' }}
      >
        {photo !== undefined && <PieceThumb url={photo} box={box} size={44} />}
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--charcoal)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
          {detail && <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: '#777' }}>{detail}</span>}
          {chips && <span style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.25rem' }}>{chips}</span>}
          {children}
        </span>
        {onClick && !action && <ChevronRight size={18} color="#b5aca2" style={{ flexShrink: 0 }} />}
      </button>
      {action}
    </div>
  );
}

/** The one filled button a row can carry on its right. */
export function RowAction({ onClick, children, tone = 'clay' }: { onClick: () => void; children: React.ReactNode; tone?: 'clay' | 'quiet' | 'good' }) {
  const bg = tone === 'clay' ? 'var(--clay)' : tone === 'good' ? '#2E7D32' : 'white';
  const fg = tone === 'quiet' ? 'var(--charcoal)' : 'white';
  return (
    <button
      onClick={onClick}
      style={{ flexShrink: 0, minHeight: 40, padding: '0 0.85rem', borderRadius: 'var(--radius-md)', border: tone === 'quiet' ? '1px solid #e6ddd2' : 'none', background: bg, color: fg, fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
    >
      {children}
    </button>
  );
}
