'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { AiCostCounter } from '@/components/AiCostCounter';
import { Camera, Loader, XCircle, Check, RotateCcw, Truck, Home as HomeIcon, Printer } from 'lucide-react';

interface Booking {
  booking_code: string;
  customer_name: string;
}

interface PieceResult {
  id: string;
  description: string;
  reference_photo_url: string | null;
  found: boolean;
  confidence: 'high' | 'medium' | 'low';
  x_pct: number | null;
  y_pct: number | null;
  box: { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number } | null;
  reasoning: string | null;
}

interface Fulfilment {
  fulfilment_method: 'collection' | 'posted' | null;
  postal_postcode: string | null;
  collection_date: string | null;
  people: { person_name: string; collection_method: string | null; postal_postcode: string | null }[];
}

const PIN_COLOURS = ['#e0392b', '#2b7de0', '#1a8a3c', '#b8860b', '#7a3d99', '#d1477a'];

// Real packing workflow, redesigned per Daisy's request: "if there was a
// group of cases on a table, would it find all those, or prompt you...
// three out of five, check another box... put yourself in the person's
// position." Scans a WHOLE booking's still-unpacked pieces against one
// photo in a single Gemini call, reports honestly how many were found
// here vs still missing, and surfaces the real postal/collection info
// right there so a packer doesn't have to go looking for it separately.
export default function FindOnTablePage() {
  // Arriving from Packing with a booking already in mind. The packer is
  // stood at the shelf holding a box -- making them re-pick from a list of
  // sixty names they've just come from is a pointless step.
  const searchParams = useSearchParams();
  const [bookingCode, setBookingCode] = useState(() => searchParams.get('code') || '');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [fulfilment, setFulfilment] = useState<Fulfilment | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PieceResult[] | null>(null);
  // Real cumulative tracking across multiple photos, keyed by piece id --
  // a booking spread across two tables needs several photos before it's
  // genuinely complete.
  const [foundInPreviousPhotos, setFoundInPreviousPhotos] = useState<Record<string, PieceResult>>({});
  // Real photo history, same as Test AI -- pieces found two photos ago
  // on another table can still be located, rather than being lost the
  // moment a later photo replaces the view.
  const [photoHistory, setPhotoHistory] = useState<{ url: string; results: PieceResult[]; index: number }[]>([]);
  const [viewingPhoto, setViewingPhoto] = useState<number | null>(null);
  const [totals, setTotals] = useState<{ total: number; found_count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Real, same tap-to-enlarge as Test AI -- per Daisy: "will look
  // exactly the same, yeah?" These two are directly compared against
  // each other, so they should genuinely match, not just share the
  // same circle logic underneath.
  const [zoomed, setZoomed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setBookings((Array.isArray(d) ? d : []).slice(0, 60)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!bookingCode) { setFulfilment(null); return; }
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${bookingCode}/fulfilment-info`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFulfilment(d))
      .catch(() => {});
  }, [bookingCode]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !bookingCode) return;
    setPreview(URL.createObjectURL(f));
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('photo', f);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${bookingCode}/find-all-on-table`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not check the photo');
      const fresh: PieceResult[] = data.results || [];

      // Real cumulative search across multiple photos -- per Daisy
      // directly: a real booking "may have seven pieces... may be
      // eleven... and they may be spread across two tables. If it's not
      // all there, take another photo until we find a whole booking."
      // Each new photo previously wiped the previous results entirely,
      // so a booking split across two tables could never be completed.
      // Now a piece found in ANY photo stays found; only pieces still
      // genuinely missing get re-checked against each new photo. The
      // pins shown on the current photo are only the ones found in THIS
      // photo, since a box from a previous table's photo would be
      // meaningless drawn over a different image.
      setFoundInPreviousPhotos((prev) => {
        const merged = { ...prev };
        fresh.forEach((r) => { if (r.found) merged[r.id] = r; });
        return merged;
      });
      setPhotoHistory((prev) => [...prev, { url: URL.createObjectURL(f), results: fresh, index: prev.length + 1 }]);
      setResults(fresh);
      setTotals({ total: data.total, found_count: data.found_count });
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const isPostal = fulfilment?.fulfilment_method === 'posted';

  return (
    <PageShell title="Find on Table">
      
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
        Pick a booking, photograph the table or tray you think its pieces are on — checks every piece from that booking at once.
      </p>

      <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '1rem' }}>
        Uses Google Gemini (a separate paid AI) for real pixel-level detection — roughly £0.0015–0.0025 per photo, logged into the same running AI cost total.
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <AiCostCounter />
      </div>

      <select
        value={bookingCode}
        onChange={(e) => { setBookingCode(e.target.value); setResults(null); setTotals(null); setPreview(null); setFoundInPreviousPhotos({}); setPhotoHistory([]); setViewingPhoto(null); }}
        style={{ width: '100%', padding: '0.55rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.88rem', marginBottom: '0.9rem' }}
      >
        <option value="">Choose a booking...</option>
        {bookings.map((b) => (
          <option key={b.booking_code} value={b.booking_code}>{b.customer_name}</option>
        ))}
      </select>

      {bookingCode && fulfilment && (
        <div style={{ padding: '0.8rem 0.9rem', backgroundColor: isPostal ? '#fdf0e8' : '#eef4fb', border: `1px solid ${isPostal ? '#e0a878' : '#a8c4e8'}`, borderRadius: '6px', marginBottom: '1.1rem' }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.85rem', color: isPostal ? '#a85a2e' : '#2b5a8f' }}>
            {isPostal ? <Truck size={15} /> : <HomeIcon size={15} />}
            {isPostal ? 'Postal — needs a label' : 'Studio collection'}
          </p>
          {fulfilment.postal_postcode && <p style={{ fontSize: '0.78rem', color: '#666', marginTop: '0.2rem' }}>Postcode: {fulfilment.postal_postcode}</p>}
          {fulfilment.collection_date && (
            <p style={{ fontSize: '0.78rem', color: '#666', marginTop: '0.2rem' }}>
              Collection date: {new Date(fulfilment.collection_date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
            </p>
          )}
          {!fulfilment.collection_date && <p style={{ fontSize: '0.78rem', color: '#999', marginTop: '0.2rem' }}>No collection date set yet</p>}
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
            <a
              href={`/kiln-dip?booking=${bookingCode}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.35rem 0.7rem', backgroundColor: 'var(--clay)', color: 'white', borderRadius: '5px', fontSize: '0.78rem', textDecoration: 'none' }}
            >
              {isPostal ? <><Printer size={13} /> Create postage label</> : <>Set collection date</>}
            </a>
            <a
              href={`/bookings?code=${bookingCode}`}
              style={{ display: 'inline-flex', alignItems: 'center', padding: '0.35rem 0.7rem', backgroundColor: 'white', border: '1px solid #ddd', color: '#666', borderRadius: '5px', fontSize: '0.78rem', textDecoration: 'none' }}
            >
              Open full booking →
            </a>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFile}
        style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={!bookingCode}
        style={{ width: '100%', padding: '1.2rem', border: '2px dashed #ccc', borderRadius: '8px', backgroundColor: 'white', cursor: bookingCode ? 'pointer' : 'not-allowed', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', marginBottom: '1.25rem', opacity: bookingCode ? 1 : 0.5 }}
      >
        <Camera size={26} color="var(--clay)" />
        <span style={{ color: '#666', fontSize: '0.85rem' }}>Photograph the table or tray</span>
      </button>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666', marginBottom: '1.25rem' }}>
          <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Checking every piece from this booking...
        </div>
      )}

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1.25rem' }}>{error}</div>}

      {preview && (
        <div
          onClick={() => setZoomed(true)}
          style={{ position: 'relative', width: '100%', marginBottom: '1rem', cursor: 'zoom-in', borderRadius: '8px', overflow: 'hidden' }}
        >
          <img src={preview} alt="Table" style={{ width: '100%', display: 'block' }} />
          {/* Real bounding boxes sized to the actual detected object,
              replacing fixed-size circles -- per Daisy: "both circles
              are over the same piece... they need to be very defined
              because it could be a very busy table with lots of pieces
              close together." A fixed 40px dot can't distinguish
              adjacent items; a real box scales to what was actually
              detected. Number badge sits just outside the top-left
              corner so it never obscures the piece itself. */}
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

      {/* Real full-screen viewer, same pattern as Test AI -- per Daisy:
          "will look exactly the same, yeah?" These are directly
          compared against each other, so seeing all the numbered pins
          clearly against a busy shelf photo works the same way here. */}
      {zoomed && preview && (
        <div
          onClick={() => setZoomed(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 100, backgroundColor: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'zoom-out' }}
        >
          <div style={{ position: 'relative', maxWidth: '100%', maxHeight: '82vh' }}>
            <img src={preview} alt="Table" style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8, display: 'block' }} />
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

      {/* Real reset -- same as Test AI, so both behave identically.
          Clears the cumulative multi-photo progress and starts the
          booking's search fresh. */}
      {/* Deliberately understated -- this wipes the cumulative progress,
          so it must not compete with "take another photo" as the
          obvious next tap. */}
      {/* Real photo history strip -- tap any earlier photo to see it
          again with its own pieces still boxed and numbered, so a piece
          found on an earlier table can still be located. */}
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

      {(preview || results) && (
        <button
          onClick={() => { setPreview(null); setResults(null); setTotals(null); setFoundInPreviousPhotos({}); setError(null); setPhotoHistory([]); setViewingPhoto(null); }}
          style={{ width: '100%', padding: '0.6rem', marginBottom: '0.9rem', backgroundColor: 'transparent', color: '#999', border: 'none', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', textDecoration: 'underline' }}
        >
          <RotateCcw size={13} /> Start this booking again
        </button>
      )}

      {totals && (() => {
        // Real cumulative count across every photo taken so far, not
        // just the current one -- per Daisy: pieces "may be spread
        // across two tables... take another photo until we find a whole
        // booking." Showing only this photo's count would make a
        // genuinely complete booking look incomplete.
        const cumulativeFound = Object.keys(foundInPreviousPhotos).length;
        const allFound = cumulativeFound >= totals.total;
        const thisPhotoCount = totals.found_count;
        return (
          <div style={{ marginBottom: '0.9rem' }}>
            <div style={{ padding: '0.9rem', backgroundColor: allFound ? '#eafaf0' : '#fdf6e3', borderRadius: '8px' }}>
              <p style={{ fontWeight: 700, fontSize: '0.95rem', color: allFound ? '#1a8a3c' : '#b8860b' }}>
                {allFound
                  ? `All ${totals.total} pieces found — booking complete`
                  : `${cumulativeFound} of ${totals.total} found so far`}
              </p>
              {cumulativeFound > thisPhotoCount && (
                <p style={{ fontSize: '0.78rem', color: '#666', marginTop: '0.3rem' }}>
                  {thisPhotoCount} in this photo, {cumulativeFound - thisPhotoCount} found in earlier photos
                </p>
              )}
              {!allFound && (
                <p style={{ fontSize: '0.82rem', color: '#666', marginTop: '0.3rem' }}>
                  {totals.total - cumulativeFound} still missing — photograph another table or box and they will be added to this list.
                </p>
              )}
            </div>

            {/* Real "photograph another table" action, right under the
                result where the gap is noticed -- same fix as Test AI.
                The camera above is already scrolled past by this point,
                so without this the only visible action was the reset. */}
            {!allFound && (
              <label
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%', padding: '0.9rem', marginTop: '0.6rem', borderRadius: 10, cursor: 'pointer', position: 'relative', background: 'linear-gradient(155deg, var(--clay) 0%, #9A6435 100%)', color: 'white', fontWeight: 700, fontSize: '0.9rem', boxShadow: '0 3px 10px rgba(184,121,70,0.3)' }}
              >
                <input type="file" accept="image/*" capture="environment" onChange={onFile} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                <Camera size={18} /> Photograph another table
              </label>
            )}
          </div>
        );
      })()}

      {results && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {results.map((r, i) => {
            // Real cumulative status -- a piece found in an earlier
            // photo of another table is genuinely still found, and must
            // not show as missing just because it isn't in this photo.
            const foundEarlier = !r.found && !!foundInPreviousPhotos[r.id];
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
              {/* The real reference photo, right beside the result -- standing
                  at the shelf, this is the side-by-side that actually helps:
                  "here's what it looked like painted, here's where it is now." */}
              {r.reference_photo_url && (
                <img
                  src={r.reference_photo_url}
                  alt=""
                  style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: '1px solid #ddd' }}
                />
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
