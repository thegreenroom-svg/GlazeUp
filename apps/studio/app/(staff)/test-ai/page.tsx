'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { AiCostCounter } from '@/components/AiCostCounter';
import { Camera, Loader, MapPin, XCircle } from 'lucide-react';

interface FindResult {
  found: boolean;
  confidence: 'high' | 'medium' | 'low';
  x_pct: number | null;
  y_pct: number | null;
  reasoning: string | null;
}

// Real accuracy test, no booking involved. Daisy: "I need to be able to
// test the AI recognition... household items... the same system that
// we're gonna be using for the glaze." Put back deliberately on the
// SAME proven Gemini engine as Find on Table (real bounding boxes),
// not the old removed text-only version this page used to run on.
export default function TestAiPage() {
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [scenePreview, setScenePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FindResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  const onReference = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setReferenceFile(f);
    setReferencePreview(URL.createObjectURL(f));
    setScenePreview(null);
    setResult(null);
    setError(null);
  };

  const onScene = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !referenceFile) return;
    setScenePreview(URL.createObjectURL(f));
    setResult(null);
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
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell title="Test AI" subtitle="Real accuracy test using the same engine as Find on Table. Photograph a reference item, then photograph it mixed among other household objects.">
      <AiCostCounter />

      <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
        Uses Google Gemini for real pixel-level detection — roughly £0.0015–0.0025 per test, logged into the same running AI cost total.
      </div>

      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--clay)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem' }}>
        1. Reference item
      </p>
      <label
        style={{ width: '100%', padding: referencePreview ? '0.5rem' : '1.5rem', borderRadius: 12, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', position: 'relative', background: referencePreview ? 'white' : 'linear-gradient(155deg, var(--sand) 0%, #DCC9AC 100%)', boxShadow: referencePreview ? '0 2px 6px rgba(43,39,36,0.08)' : '0 4px 14px rgba(184,121,70,0.18)' }}
      >
        <input type="file" accept="image/*" capture="environment" onChange={onReference} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
        {referencePreview ? (
          <img src={referencePreview} alt="Reference" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 8 }} />
        ) : (
          <>
            <Camera size={26} color="var(--clay)" />
            <span style={{ color: 'var(--charcoal)', fontSize: '0.88rem', fontWeight: 600 }}>Photograph the reference item</span>
          </>
        )}
      </label>
      {referencePreview && (
        <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '-0.9rem', marginBottom: '1.25rem', textAlign: 'center' }}>
          Tap to choose a different reference item
        </p>
      )}

      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--clay)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.6rem' }}>
        2. Scene — mixed with other items
      </p>
      <label
        style={{ width: '100%', padding: '1.5rem', borderRadius: 12, cursor: referenceFile ? 'pointer' : 'not-allowed', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', position: 'relative', background: 'linear-gradient(155deg, var(--sand) 0%, #DCC9AC 100%)', boxShadow: '0 4px 14px rgba(184,121,70,0.18)', opacity: referenceFile ? 1 : 0.5 }}
      >
        <input type="file" accept="image/*" capture="environment" onChange={onScene} disabled={!referenceFile} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: referenceFile ? 'pointer' : 'not-allowed' }} />
        <Camera size={26} color="var(--clay)" />
        <span style={{ color: 'var(--charcoal)', fontSize: '0.88rem', fontWeight: 600 }}>
          {referenceFile ? 'Photograph the mixed-up scene' : 'Add a reference item first'}
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
          {result?.found && result.x_pct != null && result.y_pct != null && (
            <div
              style={{
                position: 'absolute',
                left: `${result.x_pct}%`,
                top: `${result.y_pct}%`,
                transform: 'translate(-50%, -50%)',
                width: 46, height: 46,
                borderRadius: '50%',
                border: '3px solid #e0392b',
                boxShadow: '0 0 0 2px white, 0 2px 8px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
              }}
            />
          )}
          <p style={{ position: 'absolute', bottom: 8, right: 10, fontSize: '0.7rem', color: 'white', backgroundColor: 'rgba(0,0,0,0.5)', padding: '0.2rem 0.5rem', borderRadius: 999 }}>
            Tap to enlarge
          </p>
        </div>
      )}

      {result && (
        <div style={{ padding: '0.9rem 1rem', backgroundColor: result.found ? '#eafaf0' : '#f5f5f5', borderRadius: 10 }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.9rem', color: result.found ? '#1a8a3c' : '#666' }}>
            {result.found ? <MapPin size={16} /> : <XCircle size={16} />}
            {result.found ? `Found — ${result.confidence} confidence` : 'Not found in this scene'}
          </p>
          {result.reasoning && <p style={{ fontSize: '0.82rem', color: '#666', marginTop: '0.4rem' }}>{result.reasoning}</p>}
        </div>
      )}

      {/* Real full-screen viewer, same pattern as the booking piece
          photos -- tap to enlarge is exactly what's needed to see the
          circle clearly against a busy scene of similar objects. */}
      {zoomed && scenePreview && (
        <div
          onClick={() => setZoomed(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'zoom-out' }}
        >
          <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '82vh' }}>
            <img src={scenePreview} alt="Scene" style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8, display: 'block' }} />
            {result?.found && result.x_pct != null && result.y_pct != null && (
              <div
                style={{
                  position: 'absolute',
                  left: `${result.x_pct}%`,
                  top: `${result.y_pct}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 56, height: 56,
                  borderRadius: '50%',
                  border: '3px solid #e0392b',
                  boxShadow: '0 0 0 3px white, 0 2px 10px rgba(0,0,0,0.5)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', marginTop: '0.7rem' }}>Tap anywhere to close</p>
        </div>
      )}
    </PageShell>
  );
}
