'use client';

import { ReactNode } from 'react';

// Emptiness is a designed moment, not an accident. It's the first thing
// a new member of staff sees on a quiet morning, and a bare line of grey
// text reads like something failed to load rather than "there is
// genuinely nothing here yet".
//
// Three parts, deliberately: an icon so it reads as a state rather than
// an error, a plain headline saying what is empty, and one line telling
// the person what would fill it -- which is the part that turns a dead
// end into an instruction.

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        padding: '2.5rem 1.5rem',
        color: 'var(--muted)',
      }}
    >
      {icon && (
        <div
          style={{
            width: 52, height: 52, borderRadius: 'var(--radius-full)',
            background: 'var(--sand)', color: 'var(--clay)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: '0.9rem',
          }}
        >
          {icon}
        </div>
      )}
      <p style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--charcoal)', margin: 0 }}>
        {title}
      </p>
      {hint && (
        <p style={{ fontSize: 'var(--text-base)', margin: '0.35rem 0 0', maxWidth: 280, lineHeight: 1.45 }}>
          {hint}
        </p>
      )}
      {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
    </div>
  );
}
