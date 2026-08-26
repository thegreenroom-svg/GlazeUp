'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { AiCostCounter } from '@/components/AiCostCounter';
import { Camera, Loader, XCircle, Check, RotateCcw } from 'lucide-react';

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
  // Real cumulative tracking across multiple scene photos, matching
  // Find on Table exactly -- per Daisy: "there's no 'two items not
  // found, take another photo' option. I thought that was what we were
  // doing." It was built into Find on Table but never into Test AI,
  // which contradicts the whole point of Test AI being identical.
  const [foundInPreviousPhotos, setFoundInPreviousPhotos] = useState<Record<string, ItemResult>>({});
  const [photoCount, setPhotoCount] = useState(0);
  // Real photo history -- per Daisy: "it might be useful to have the
  // thumbnails of the previous photographs with the actual items still
  // circled on them and numbered so that you can go back and reference
  // if you haven't picked them all out in one go." Without this, only
  // the most recent photo is visible, so where items 1, 5 and 6
  // actually were is lost the moment a later photo replaces it.
  // Each entry keeps its own results so boxes stay correct per photo.
  const [photoHistory, setPhotoHistory] = useState<{ url: string; results: ItemResult[]; index: number }[]>([]);
  const [viewingPhoto, setViewingPhoto] = useState<number | null>(null);

  const resetAll = () => {
    setReferenceFile(null);
    setReferencePreview(null);
    setScenePreview(null);
    setResults(null);
    setTotals(null);
    setError(null);
    setFoundInPreviousPhotos({});
    setPhotoCount(0);
    setPhotoHistory([]);
    setViewingPhoto(null);
  };

  const onReference = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setReferenceFile(f);
    setReferencePreview(URL.createObjectURL(f));
    setScenePreview(null);
    setResults(null);
    setTotals(null);
    setError(null);
    // New reference items means a genuinely new test -- previous finds
    // are no longer meaningful.
    setFoundInPreviousPhotos({});
    setPhotoCount(0);
    setPhotoHistory([]);
    setViewingPhoto(null);
  };

  const onScene = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !referenceFile) return;
    setScenePreview(URL.createObjectURL(f));
    setError(null);
    setLoading(true);
    // Same fix as Find on Table and the packing shelf sweep: no fetch to
    // a Gemini-backed endpoint anywhere in the app had an upper bound,
    // so a genuine stall left the spinner running with nothing to show
    // for it.
    const controller = new AbortController();
    const killSwitch = setTimeout(() => controller.abort(), 30000);
    try {
      const formData = new FormData();
      formData.append('reference', referenceFile);
      formData.append('scene', f);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/test-ai/find`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not check the photo');
      const fresh: ItemResult[] = data.results || [];

      // Real cumulative merge, same as Find on Table -- an item found in
      // ANY photo stays found, so items in a dark corner can be
      // captured by a second, closer photo without losing the first.
      // Keyed by description rather than id: unlike Find on Table's
      // database pieces, ids here are generated per-call and won't
      // match across separate photos.
      setFoundInPreviousPhotos((prev) => {
        const merged = { ...prev };
        fresh.forEach((r) => { if (r.found) merged[r.description.toLowerCase().trim()] = r; });
        return merged;
      });
      setPhotoCount((n) => n + 1);
      // Real history entry -- kept with its own results so each photo's
      // boxes stay correct when revisited.
      setPhotoHistory((prev) => [...prev, { url: URL.createObjectURL(f), results: fresh, index: prev.length + 1 }]);
      setResults(fresh);
      setTotals({ total: data.total, found_count: data.found_count });
    } catch (err: any) {
      setError(err.name === 'AbortError'
        ? 'That took too long and was cancelled. Try again.'
        : (err.message || 'Something went wrong.'));
    } finally {
      clearTimeout(killSwitch);
      setLoading(false);
    }
  };

  return (
    <PageShell title="Test AI" subtitle="Runs exactly the same matching as Find on Table. Photograph one or more reference items, then photograph them mixed among other objects.">
      <AiCostCounter />

      <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '1.25rem' }}>
        Uses Google Gemini for real pixel-level detection — roughly £0.0015–0.0025 per test, logged into the same running AI cost total.
      </div>

      {!results && (
        <>
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
        </>
      )}

      {/* Hidden once results exist -- the "take another photo" button
          under the results replaces it there, so there's exactly one
          obvious next action rather than two competing cameras. */}
      {!results && (
        <>
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
        </>
      )}

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

      {totals && (() => {
        const cumulativeFound = Object.keys(foundInPreviousPhotos).length;
        const allFound = cumulativeFound >= totals.total;
        return (
          <div style={{ marginBottom: '0.9rem' }}>
            <div style={{ padding: '0.9rem', backgroundColor: allFound ? '#eafaf0' : '#fdf6e3', borderRadius: '8px' }}>
              <p style={{ fontWeight: 700, fontSize: '0.95rem', color: allFound ? '#1a8a3c' : '#b8860b' }}>
                {allFound
                  ? `All ${totals.total} found`
                  : `${cumulativeFound} of ${totals.total} found so far`}
              </p>
              {photoCount > 1 && (
                <p style={{ fontSize: '0.78rem', color: '#666', marginTop: '0.3rem' }}>
                  Across {photoCount} photos · {totals.found_count} in this one
                </p>
              )}
              {!allFound && (
                <p style={{ fontSize: '0.82rem', color: '#666', marginTop: '0.3rem' }}>
                  {totals.total - cumulativeFound} still missing — take another photo, closer or better lit, and anything found will be added.
                </p>
              )}
            </div>

            {/* Real "take another photo" action, right here under the
                result -- per Daisy: "I went to test again... and it took
                me to a whole new page to photograph the test items
                again. I want to be able to take a second photograph of
                the scene, maybe closer, to find the remaining items."
                The scene camera existed but sat ABOVE the results,
                already scrolled past, so the only visible action was
                the reset -- which wiped everything. This is now the
                prominent next step exactly where the gap is noticed. */}
            {!allFound && (
              <label
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', padding: '0.9rem', marginTop: '0.6rem', borderRadius: 10, cursor: 'pointer', position: 'relative', background: 'linear-gradient(155deg, var(--clay) 0%, #9A6435 100%)', color: 'white', fontWeight: 700, fontSize: '0.9rem', boxShadow: '0 3px 10px rgba(184,121,70,0.3)' }}
              >
                <input type="file" accept="image/*" capture="environment" onChange={onScene} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                <Camera size={18} /> Take another photo of the scene
              </label>
            )}
          </div>
        );
      })()}

      {/* Deliberately understated -- this wipes everything, so it must
          not compete with "take another photo" as the obvious next tap.
          That exact confusion is what lost a 2-of-7 result. */}
      {/* Real photo history strip -- tap any earlier photo to see it
          again with its own items still boxed and numbered, so a piece
          found two photos ago can still be located on the shelf. */}
      {photoHistory.length > 1 && (
        <div style={{ marginBottom: '0.9rem' }}>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--clay)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.5rem' }}>
            All photos taken
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.3rem' }}>
            {photoHistory.map((ph) => {
              const foundHere = ph.results.filter((r) => r.found).length;
              return (
                <button
                  key={ph.index}
                  onClick={() => setViewingPhoto(ph.index)}
                  style={{ flexShrink: 0, width: 88, padding: 0, border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ position: 'relative', width: 88, height: 88, borderRadius: 8, overflow: 'hidden', border: '1px solid #ddd' }}>
                    <img src={ph.url} alt={`Photo ${ph.index}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    {ph.results.map((r, i) => (
                      r.found && r.box && (
                        <div
                          key={r.id}
                          style={{
                            position: 'absolute',
                            left: `${r.box.left_pct}%`,
                            top: `${r.box.top_pct}%`,
                            width: `${r.box.right_pct - r.box.left_pct}%`,
                            height: `${r.box.bottom_pct - r.box.top_pct}%`,
                            border: `2px solid ${PIN_COLOURS[i % PIN_COLOURS.length]}`,
                            borderRadius: 2,
                            pointerEvents: 'none',
                          }}
                        />
                      )
                    ))}
                  </div>
                  <p style={{ fontSize: '0.68rem', color: '#666', marginTop: '0.25rem' }}>
                    Photo {ph.index} · {foundHere} found
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Full-screen view of an earlier photo, with its own boxes. */}
      {viewingPhoto !== null && (() => {
        const ph = photoHistory.find((p) => p.index === viewingPhoto);
        if (!ph) return null;
        return (
          <div
            onClick={() => setViewingPhoto(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'zoom-out' }}
          >
            <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '78vh' }}>
              <img src={ph.url} alt={`Photo ${ph.index}`} style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: 8, display: 'block' }} />
              {ph.results.map((r, i) => (
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
            <p style={{ color: 'white', fontSize: '0.85rem', fontWeight: 600, marginTop: '0.8rem' }}>
              Photo {ph.index} — {ph.results.filter((r) => r.found).length} found here
            </p>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', marginTop: '0.3rem' }}>Tap anywhere to close</p>
          </div>
        );
      })()}

      {(referencePreview || results) && (
        <button
          onClick={resetAll}
          style={{ width: '100%', padding: '0.6rem', marginBottom: '0.9rem', backgroundColor: 'transparent', color: '#999', border: 'none', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', textDecoration: 'underline' }}
        >
          <RotateCcw size={13} /> Start over with different items
        </button>
      )}

      {results && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {results.map((r, i) => {
            // Real cumulative status -- an item found in an earlier
            // photo is genuinely still found, and must not show as
            // missing just because it isn't in this one.
            const foundEarlier = !r.found && !!foundInPreviousPhotos[r.description.toLowerCase().trim()];
            const isFound = r.found || foundEarlier;
            return (
            <div key={r.id} style={{ padding: '0.7rem 0.9rem', backgroundColor: isFound ? '#f9f9f9' : '#fef6f6', borderRadius: '6px', display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}>
              {r.found ? (
                <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', backgroundColor: PIN_COLOURS[i % PIN_COLOURS.length], color: 'white', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              ) : foundEarlier ? (
                <Check size={18} color="#1a8a3c" style={{ flexShrink: 0, marginTop: 1 }} />
              ) : (
                <XCircle size={18} color="#c33" style={{ flexShrink: 0, marginTop: 1 }} />
              )}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '0.85rem', fontWeight: 600 }}>{r.description}</p>
                <p style={{ fontSize: '0.75rem', color: isFound ? '#1a8a3c' : '#c33', marginTop: '0.15rem' }}>
                  {r.found
                    ? `Found — ${r.confidence} confidence`
                    : foundEarlier
                      ? 'Already found in an earlier photo'
                      : 'Not in this photo'}
                </p>
                {r.found && r.reasoning && <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.15rem' }}>{r.reasoning}</p>}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
