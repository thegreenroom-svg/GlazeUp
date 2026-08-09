'use client';

export function SkeletonBlock({ height = '1rem', width = '100%', radius = '4px' }: { height?: string; width?: string; radius?: string }) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: radius,
        background: 'linear-gradient(90deg, #eee 25%, #f5f5f5 50%, #eee 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton-shimmer 1.4s ease-in-out infinite',
      }}
    />
  );
}

export function SkeletonCard() {
  return (
    <div style={{ padding: '1.25rem', backgroundColor: 'white', border: '1px solid #eee', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <SkeletonBlock height="1.1rem" width="60%" />
      <SkeletonBlock height="0.8rem" width="40%" />
      <SkeletonBlock height="0.8rem" width="80%" />
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ padding: '0.75rem', backgroundColor: 'white', border: '1px solid #eee', borderRadius: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <SkeletonBlock height="0.9rem" width="45%" />
          <SkeletonBlock height="0.9rem" width="20%" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTiles() {
  return (
    <div style={{ maxWidth: '520px', margin: '0 auto' }}>
      <div style={{ marginBottom: '0.75rem' }}>
        <SkeletonBlock height="0" width="100%" radius="14px" />
        <div style={{ aspectRatio: '1', width: '100%' }}>
          <SkeletonBlock height="100%" width="100%" radius="14px" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ aspectRatio: '1' }}>
            <SkeletonBlock height="100%" width="100%" radius="14px" />
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.6rem' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ aspectRatio: '1' }}>
            <SkeletonBlock height="100%" width="100%" radius="14px" />
          </div>
        ))}
      </div>
    </div>
  );
}
