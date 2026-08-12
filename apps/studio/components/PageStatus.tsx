'use client';

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>{title}</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.5rem' }}>{subtitle}</p>
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
