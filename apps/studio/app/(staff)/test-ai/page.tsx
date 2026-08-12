'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, RotateCcw, Loader } from 'lucide-react';

interface Match {
  reference_item: string;
  found: boolean;
  location_in_scene: string | null;
  reasoning: string | null;
  confidence: 'high' | 'medium' | 'low';
}

interface ReferenceItem {
  description: string;
}

interface Result {
  reference_items: ReferenceItem[];
  matches: Match[];
}

const confidenceColor: Record<string, string> = { high: '#1a8a3c', medium: '#b8860b', low: '#999' };
const confidenceBg: Record<string, string> = { high: '#eafaf0', medium: '#fdf6e3', low: '#f5f5f5' };

export default function TestAiPage() {
  const [step, setStep] = useState<'reference' | 'scene' | 'result'>('reference');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [scenePreview, setScenePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const refFileRef = useRef<HTMLInputElement>(null);
  const sceneFileRef = useRef<HTMLInputElement>(null);

  const onReferenceChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setReferenceFile(f);
    setReferencePreview(URL.createObjectURL(f));
    setStep('scene');
  };

  const onSceneChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !referenceFile) return;
    setScenePreview(URL.createObjectURL(f));
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('reference', referenceFile);
      formData.append('scene', f);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/test-ai/match`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed');
      }
      setResult(await res.json());
      setStep('result');
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep('reference');
    setReferenceFile(null);
    setReferencePreview(null);
    setScenePreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '600px' }}>
      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Test AI</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        No bookings involved — just checking whether the AI can pick real reference items back out of a jumbled scene, using household objects.
      </p>

      <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '6px', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
        Each test is a fresh, independent AI call — it doesn&apos;t remember previous tests or improve from repeated use. Every run tells you whether it works <em>this time</em>, not a model getting smarter over time.
      </div>

      {step === 'reference' && (
        <>
          <p style={{ fontWeight: 600, marginBottom: '0.6rem' }}>Step 1 — photograph your test item(s)</p>
          <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.8rem' }}>e.g. two jugs and a cup, on their own.</p>
          <input ref={refFileRef} type="file" accept="image/*" capture="environment" onChange={onReferenceChosen} style={{ display: 'none' }} />
          <button
            onClick={() => refFileRef.current?.click()}
            style={{ width: '100%', padding: '2rem', border: '2px dashed #ccc', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
          >
            <Camera size={30} color="var(--clay)" />
            <span style={{ color: '#666', fontSize: '0.9rem' }}>Photograph the reference items</span>
          </button>
        </>
      )}

      {step === 'scene' && (
        <>
          {referencePreview && (
            <img src={referencePreview} alt="Reference items" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, marginBottom: '1rem' }} />
          )}
          <p style={{ fontWeight: 600, marginBottom: '0.6rem' }}>Step 2 — mix them in and photograph the whole table</p>
          <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.8rem' }}>Put those same items among a pile of other stuff, then photograph the lot.</p>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666', padding: '1rem' }}>
              <Loader size={18} /> Checking...
            </div>
          ) : (
            <>
              <input ref={sceneFileRef} type="file" accept="image/*" capture="environment" onChange={onSceneChosen} style={{ display: 'none' }} />
              <button
                onClick={() => sceneFileRef.current?.click()}
                style={{ width: '100%', padding: '2rem', border: '2px dashed #ccc', borderRadius: '8px', backgroundColor: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
              >
                <Camera size={30} color="var(--clay)" />
                <span style={{ color: '#666', fontSize: '0.9rem' }}>Photograph the whole table/shelf</span>
              </button>
            </>
          )}
          {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginTop: '1rem' }}>{error}</div>}
        </>
      )}

      {step === 'result' && result && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
            {referencePreview && <img src={referencePreview} alt="" style={{ width: '48%', height: 120, objectFit: 'cover', borderRadius: 8 }} />}
            {scenePreview && <img src={scenePreview} alt="" style={{ width: '48%', height: 120, objectFit: 'cover', borderRadius: 8 }} />}
          </div>

          <details style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
            <summary style={{ cursor: 'pointer', color: '#666' }}>What it saw in your reference photo</summary>
            <div style={{ marginTop: '0.5rem', color: '#444' }}>
              {result.reference_items.map((r, i) => <p key={i} style={{ marginBottom: '0.4rem' }}>{r.description}</p>)}
            </div>
          </details>

          <p style={{ fontWeight: 600, marginBottom: '0.6rem' }}>Results</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {result.matches.map((m, i) => (
              <div key={i} style={{ padding: '0.8rem', backgroundColor: m.found ? confidenceBg[m.confidence] : '#f5f5f5', borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>{m.reference_item}</p>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: m.found ? confidenceColor[m.confidence] : '#999' }}>
                    {m.found ? `${m.confidence} confidence` : 'not found'}
                  </span>
                </div>
                {m.location_in_scene && <p style={{ fontSize: '0.82rem', color: '#444', marginTop: '0.3rem' }}>📍 {m.location_in_scene}</p>}
                {m.reasoning && <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.2rem' }}>{m.reasoning}</p>}
              </div>
            ))}
          </div>

          <button
            onClick={reset}
            style={{ width: '100%', marginTop: '1.5rem', padding: '0.6rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          >
            <RotateCcw size={15} /> Run another test
          </button>
        </>
      )}
    </motion.div>
  );
}
