'use client';

// One small shared control, used on every screen that can compare the two
// matching engines: Packing's shelf sweep, Find on Table, and Test AI.
//
// Defaults to whatever the studio-wide setting says (feature_inhouse_matching
// -- the same flag Daisy already flipped on), so ordinary daily use stays
// consistent across the app without anyone having to think about it. But
// each page keeps its own LOCAL override, because the actual ask was to
// compare them side by side and to have a fallback "in case no internet
// etc, or if one is better for certain things" -- a global-only switch
// could not do either of those, it could only pick one engine for
// everyone, everywhere, all the time.

interface EngineToggleProps {
  engine: 'gemini' | 'inhouse';
  onChange: (engine: 'gemini' | 'inhouse') => void;
}

export function EngineToggle({ engine, onChange }: EngineToggleProps) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden', marginBottom: '0.75rem' }}>
      {(['gemini', 'inhouse'] as const).map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: '0.4rem 0.8rem',
            border: 'none',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
            backgroundColor: engine === opt ? 'var(--clay)' : 'white',
            color: engine === opt ? 'white' : 'var(--charcoal)',
          }}
        >
          {opt === 'gemini' ? 'Gemini' : 'In-house'}
        </button>
      ))}
    </div>
  );
}

// Reads the studio-wide default once. Each page still keeps its own local
// state so switching here never writes anything back -- this is a
// starting point per page load, not a shared toggle across screens.
export async function fetchDefaultEngine(apiUrl: string): Promise<'gemini' | 'inhouse'> {
  try {
    const res = await fetch(`${apiUrl}/api/spec/studio/features`);
    if (!res.ok) return 'gemini';
    const d = await res.json();
    return d?.feature_inhouse_matching ? 'inhouse' : 'gemini';
  } catch {
    return 'gemini';
  }
}
