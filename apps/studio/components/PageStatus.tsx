'use client';

// Kept in step with PageShell's own heading treatment deliberately --
// 11 pages already use this component, so aligning it here brings them
// all into line automatically rather than needing 11 rewrites. Any
// change to page heading style should be made in BOTH places.
export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h1 style={{ fontSize: '1.55rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--charcoal)', marginBottom: '0.3rem' }}>{title}</h1>
      <p style={{ color: 'var(--charcoal)', opacity: 0.6, fontSize: '0.88rem', lineHeight: 1.5, marginBottom: '1.4rem' }}>{subtitle}</p>
    </>
  );
}

export function StatusBlock({ loading, error }: { loading: boolean; error: string | null }) {
  if (!loading && !error) return null;
  return (
    <>
      {loading && <p style={{ color: '#666' }}>Loading...</p>}
      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}
    </>
  );
}
