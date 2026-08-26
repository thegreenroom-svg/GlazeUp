'use client';

import { useState, useEffect, useRef } from 'react';

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

// The race this guards against, caught live: on a slow connection --
// exactly what this studio's wifi has been all evening -- a person can
// tap "In-house" and start photographing before the studio-wide default
// has finished loading. Without a guard, that fetch resolving AFTER the
// manual tap silently overwrites the choice back to Gemini, with no
// visual sign anything changed -- so a test believed to be running
// in-house was actually hitting Gemini, and Gemini's OWN timeout message
// is what showed up on screen while the person had every reason to think
// they'd picked the engine that makes no network call at all.
//
// Fix: once the person has touched the toggle, the async default is
// never allowed to apply again for the rest of that page's life. A ref,
// not state, because it's a guard flag, not something that should ever
// itself trigger a re-render.
export function useEngineSelection(apiUrl: string): ['gemini' | 'inhouse', (e: 'gemini' | 'inhouse') => void] {
  const [engine, setEngineState] = useState<'gemini' | 'inhouse'>('gemini');
  const manuallySet = useRef(false);

  useEffect(() => {
    fetchDefaultEngine(apiUrl).then((d) => {
      if (!manuallySet.current) setEngineState(d);
    });
    // Deliberately empty deps -- this should only ever run once, on
    // mount. Re-running on every apiUrl reference change (a new string
    // each render in some setups) would reopen exactly the race this
    // exists to close.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setEngine = (e: 'gemini' | 'inhouse') => {
    manuallySet.current = true;
    setEngineState(e);
  };

  return [engine, setEngine];
}
