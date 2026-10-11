'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

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
  back,
  right,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: number;
  /**
   * [11 Oct] Where Back goes. Every screen except the daily cards is
   * somewhere you arrived from somewhere, and the hamburger is a poor way
   * back: it makes you choose again instead of undoing one step. `true`
   * uses the browser's own history.
   */
  back?: string | true | (() => void);
  /** One control that belongs beside the title rather than below it. */
  right?: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{ padding: '1.1rem 1.25rem', maxWidth, margin: '0 auto' }}
    >
      {back && (
        <button
          className="no-print"
          onClick={() => (back === true ? router.back() : typeof back === 'function' ? back() : router.push(back))}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', minHeight: 36, marginBottom: '0.3rem', marginLeft: '-0.3rem', padding: '0 0.3rem', border: 'none', background: 'none', color: '#8a8178', fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer' }}
        >
          <ChevronLeft size={16} /> Back
        </button>
      )}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
        <h1
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 'var(--text-xl)',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--charcoal)',
            marginBottom: subtitle ? '0.2rem' : '0.8rem',
          }}
        >
          {title}
        </h1>
        {right && <span className="no-print" style={{ flexShrink: 0 }}>{right}</span>}
      </div>
      {subtitle && (
        <p style={{ color: 'var(--charcoal)', opacity: 0.6, fontSize: 'var(--text-base)', lineHeight: 1.45, marginBottom: '0.9rem' }}>
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
        fontSize: 'var(--text-xs)',
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
    <p style={{ color: 'var(--stone)', fontSize: 'var(--text-md)', padding: '1.5rem 0', textAlign: 'center' }}>
      {message}
    </p>
  );
}
