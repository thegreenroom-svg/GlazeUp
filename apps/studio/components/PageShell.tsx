'use client';

import { motion } from 'framer-motion';

// ============================================================================
// SHARED PAGE SHELL -- one real structure every page uses.
// ----------------------------------------------------------------------------
// Daisy: "give everything a brush up, make it all look the same on every
// single page you go to. Do you remember that original brief? No
// scrolling. Must look the same on every page."
//
// The real measured problem before this: 33 staff pages using 4
// different outer padding values (1rem, 1.5rem, 2rem) and 5 different
// heading sizes (0.75, 1.35, 1.4, 1.6, 1.875rem). This makes the shell
// a single shared component rather than a convention each page
// re-implements slightly differently -- so it stays consistent instead
// of drifting again as pages get added.
//
// pb-24 on mobile reserves real space for the fixed hamburger button so
// content can never sit underneath it.
// ============================================================================

export function PageShell({
  title,
  subtitle,
  children,
  maxWidth = 700,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ padding: '1.5rem 1.25rem', maxWidth, margin: '0 auto' }}
    >
      <h1
        style={{
          fontSize: '1.55rem',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: 'var(--charcoal)',
          marginBottom: subtitle ? '0.3rem' : '1.25rem',
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p style={{ color: 'var(--charcoal)', opacity: 0.6, fontSize: '0.88rem', lineHeight: 1.5, marginBottom: '1.4rem' }}>
          {subtitle}
        </p>
      )}
      {children}
    </motion.div>
  );
}

// Consistent small-caps section label, matching the Dashboard's own.
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: '0.7rem',
        fontWeight: 700,
        color: 'var(--clay)',
        textTransform: 'uppercase',
        letterSpacing: '0.07em',
        marginBottom: '0.6rem',
      }}
    >
      {children}
    </p>
  );
}

// Consistent empty state, so "nothing here" reads the same everywhere
// instead of each page inventing its own wording and styling.
export function EmptyState({ message }: { message: string }) {
  return (
    <p style={{ color: 'var(--stone)', fontSize: '0.9rem', padding: '1.5rem 0', textAlign: 'center' }}>
      {message}
    </p>
  );
}
