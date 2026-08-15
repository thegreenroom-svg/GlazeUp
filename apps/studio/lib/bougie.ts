import type { CSSProperties } from 'react';

// Shared "bougie" visual language -- per Daisy: "these apps don't just
// have to look like normal apps... it has to look quite bougie like the
// rest of the app." Extracted from the real treatment first built for
// Colour Picker (soft gradient fills, coloured glow shadows, generous
// rounded corners, warm sand/ivory backgrounds) so it's a shared,
// reusable style rather than hand-copied CSS-in-JS per page -- applying
// it consistently across the app means calling these, not re-inventing
// the same shadow values every time.
//
// Plain style-object helpers, not components -- every page here uses
// inline styles already (the established convention throughout this
// app), so these slot into that same pattern rather than introduce a
// new one.

export function premiumCard(opts: { highlighted?: boolean; padding?: string } = {}): CSSProperties {
  return {
    backgroundColor: 'white',
    borderRadius: '14px',
    padding: opts.padding ?? '0.9rem 1rem',
    boxShadow: opts.highlighted ? '0 4px 14px rgba(184,121,70,0.22)' : '0 2px 6px rgba(43,39,36,0.06)',
    border: opts.highlighted ? '1.5px solid var(--clay)' : '1px solid transparent',
  };
}

// A colour swatch as a soft gradient circle with a coloured glow and
// inner highlight, instead of a flat bordered square.
export function gradientSwatch(hex: string, size: number): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    background: `linear-gradient(155deg, ${hex} 0%, ${hex}dd 100%)`,
    boxShadow: `0 3px 8px ${hex}55, inset 0 1px 2px rgba(255,255,255,0.4)`,
  };
}

// The clay gradient tile used for primary action cards (photo upload,
// main CTAs) -- warm gradient fill with a real drop shadow, not a flat
// dashed border.
export function gradientActionCard(): CSSProperties {
  return {
    borderRadius: '16px',
    cursor: 'pointer',
    background: 'linear-gradient(155deg, var(--sand) 0%, #DCC9AC 100%)',
    boxShadow: '0 4px 14px rgba(184,121,70,0.18)',
  };
}

// Circular icon badge in solid clay, used inside gradientActionCard.
export function iconBadge(size = 52): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: 'var(--clay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 3px 8px rgba(184,121,70,0.4)',
  };
}

// Small-caps section label -- clay, uppercase, letter-spaced. Matches
// the label style already used on the Dashboard's tiles.
export const sectionLabel: CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  color: 'var(--clay)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '0.7rem',
};

// Solid or soft pill, used for match percentages, counts, and similar
// small standalone numbers/labels.
export function pill(opts: { solid?: boolean } = {}): CSSProperties {
  return {
    padding: '0.3rem 0.6rem',
    borderRadius: '999px',
    flexShrink: 0,
    backgroundColor: opts.solid ? 'var(--clay)' : 'var(--sand)',
  };
}
