'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { AiCostCounter } from '@/components/AiCostCounter';
import { Camera, Loader, XCircle } from 'lucide-react';

interface ItemResult {
  id: string;
  description: string;
  found: boolean;
  confidence: 'high' | 'medium' | 'low';
  x_pct: number | null;
  y_pct: number | null;
  box: { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number } | null;
  reasoning: string | null;
}

// Same real pin colours as Find on Table -- per Daisy: "this has to be
// the same for all the apps using this... when I'm testing, I have to
// effectively be testing Find on Table through the Test AI button." Any
// visual difference here would make the test misleading about the real
// tool.
const PIN_COLOURS = ['#e0392b', '#1a8a3c', '#2b6fe0', '#c77a0a', '#8b3ec7', '#0a9aa8'];

export default function TestAiPage() {
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [scenePreview, setScenePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ItemResult[] | null>(null);
  const [totals, setTotals] = useState<{ total: number; found_count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  const onReference = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setReferenceFile(f);
    setReferencePreview(URL.createObjectURL(f));
    setScenePreview(null);
    setResults(null);
    setTotals(null);
    setError(null);
  };

  const onScene = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !referenceFile) return;
    setScenePreview(URL.createObjectURL(f));
    setResults(null);
    setTotals(null);
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('reference', referenceFile);
      formData.append('scene', f);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/test-ai/find`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not check the photo');
      setResults(data.results || []);
      setTotals({ total: data.total, found_count: data.found_count });
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell title="Test AI" subtitle="Runs exactly the same matching as Find on Table. Photograph one or more reference items, then photograph them mixed among other objects.">
      <AiCostCounter />

      <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
        Uses Google Gemini for real pixel-level detection — roughly £0.0015–0.0025 per test, logged into the same running AI cost total.
      </div>

      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--clay)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem' }}>
        1. Reference items
      </p>
      <label
        style={{ width: '100%', padding: referencePreview ? '0.5rem' : '1.5rem', borderRadius: 12, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', position: 'relative', background: referencePreview ? 'white' : 'linear-gradient(155deg, var(--sand) 0%, #DCC9AC 100%)', boxShadow: referencePreview ? '0 2px 6px rgba(43,39,36,0.08)' : '0 4px 14px rgba(184,121,70,0.18)' }}
      >
        <input type="file" accept="image/*" capture="environment" onChange={onReference} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
        {referencePreview ? (
          <img src={referencePreview} alt="Reference" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8 }} />
        ) : (
          <>
            <Camera size={26} color="var(--clay)" />
            <span style={{ color: 'var(--charcoal)', fontSize: '0.88rem', fontWeight: 600 }}>Photograph the reference item(s)</span>
          </>
        )}
      </label>
      <p style={{ fontSize: '0.75rem', color: '#999', marginBottom: '1.25rem', textAlign: 'center' }}>
        {referencePreview ? 'Tap to choose different reference items' : 'Include several items in one photo to test them all at once'}
      </p>

      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--clay)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem' }}>
        2. Scene — mixed with other items
      </p>
      <label
        style={{ width: '100%', padding: '1.5rem', borderRadius: 12, cursor: referenceFile ? 'pointer' : 'not-allowed', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', position: 'relative', background: 'linear-gradient(155deg, var(--sand) 0%, #DCC9AC 100%)', boxShadow: '0 4px 14px rgba(184,121,70,0.18)', opacity: referenceFile ? 1 : 0.5 }}
      >
        <input type="file" accept="image/*" capture="environment" onChange={onScene} disabled={!referenceFile} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: referenceFile ? 'pointer' : 'not-allowed' }} />
        <Camera size={26} color="var(--clay)" />
        <span style={{ color: 'var(--charcoal)', fontSize: '0.88rem', fontWeight: 600 }}>
          {referenceFile ? 'Photograph the mixed-up scene' : 'Add reference items first'}
        </span>
      </label>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666', marginBottom: '1.25rem' }}>
          <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Checking...
        </div>
      )}

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: 8, marginBottom: '1.25rem' }}>{error}</div>}

      {scenePreview && (
        <div
          onClick={() => setZoomed(true)}
          style={{ position: 'relative', width: '100%', marginBottom: '1rem', cursor: 'zoom-in', borderRadius: 12, overflow: 'hidden', boxShadow: '0 3px 10px rgba(43,39,36,0.1)' }}
        >
          <img src={scenePreview} alt="Scene" style={{ width: '100%', display: 'block' }} />
          {results?.map((r, i) => (
            r.found && r.box && (
              <div
                key={r.id}
                style={{
                  position: 'absolute',
                  left: `${r.box.left_pct}%`,
                  top: `${r.box.top_pct}%`,
                  width: `${r.box.right_pct - r.box.left_pct}%`,
                  height: `${r.box.bottom_pct - r.box.top_pct}%`,
                  border: `3px solid ${PIN_COLOURS[i % PIN_COLOURS.length]}`,
                  borderRadius: 4,
                  boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                  pointerEvents: 'none',
                }}
              >
                <span
                  style={{
                    position: 'absolute', top: -9, left: -9,
                    width: 20, height: 20, borderRadius: '50%',
                    backgroundColor: PIN_COLOURS[i % PIN_COLOURS.length],
                    color: 'white', fontSize: '0.68rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 0 2px white',
                  }}
                >
                  {i + 1}
                </span>
              </div>
            )
          ))}
          {results && results.some((r) => r.found) && (
            <p style={{ position: 'absolute', bottom: 8, right: 10, fontSize: '0.7rem', color: 'white', backgroundColor: 'rgba(0,0,0,0.5)', padding: '0.2rem 0.5rem', borderRadius: 999 }}>
              Tap to enlarge
            </p>
          )}
        </div>
      )}

      {zoomed && scenePreview && (
        <div
          onClick={() => setZoomed(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'zoom-out' }}
        >
          <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '82vh' }}>
            <img src={scenePreview} alt="Scene" style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8, display: 'block' }} />
            {results?.map((r, i) => (
              r.found && r.box && (
                <div
                  key={r.id}
                  style={{
                    position: 'absolute',
                    left: `${r.box.left_pct}%`,
                    top: `${r.box.top_pct}%`,
                    width: `${r.box.right_pct - r.box.left_pct}%`,
                    height: `${r.box.bottom_pct - r.box.top_pct}%`,
                    border: `3px solid ${PIN_COLOURS[i % PIN_COLOURS.length]}`,
                    borderRadius: 4,
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute', top: -11, left: -11,
                      width: 24, height: 24, borderRadius: '50%',
                      backgroundColor: PIN_COLOURS[i % PIN_COLOURS.length],
                      color: 'white', fontSize: '0.75rem', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 0 0 2px white',
                    }}
                  >
                    {i + 1}
                  </span>
                </div>
              )
            ))}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', marginTop: '0.7rem' }}>Tap anywhere to close</p>
        </div>
      )}

      {totals && (
        <div style={{ padding: '0.9rem', backgroundColor: totals.found_count === totals.total ? '#eafaf0' : '#fdf6e3', borderRadius: '8px', marginBottom: '0.9rem' }}>
          <p style={{ fontWeight: 700, fontSize: '0.95rem', color: totals.found_count === totals.total ? '#1a8a3c' : '#b8860b' }}>
            {totals.found_count} of {totals.total} found
          </p>
        </div>
      )}

      {results && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {results.map((r, i) => (
            <div key={r.id} style={{ padding: '0.7rem 0.9rem', backgroundColor: r.found ? '#f9f9f9' : '#fef6f6', borderRadius: '6px', display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
              {r.found ? (
                <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', backgroundColor: PIN_COLOURS[i % PIN_COLOURS.length], color: 'white', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              ) : (
                <XCircle size={18} color="#c33" style={{ flexShrink: 0, marginTop: 1 }} />
              )}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{r.description}</p>
                <p style={{ fontSize: '0.75rem', color: r.found ? '#1a8a3c' : '#c33', marginTop: '0.15rem' }}>
                  {r.found ? `Found — ${r.confidence} confidence` : 'Not found in this scene'}
                </p>
                {r.reasoning && <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.15rem' }}>{r.reasoning}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
