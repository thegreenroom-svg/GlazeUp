'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from 'react';
import { PageShell } from '@/components/PageShell';
import { AiCostCounter } from '@/components/AiCostCounter';
import { Camera, Loader, XCircle, Truck, Home as HomeIcon, Printer } from 'lucide-react';

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
  const [bookingCode, setBookingCode] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [fulfilment, setFulfilment] = useState<Fulfilment | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PieceResult[] | null>(null);
  const [totals, setTotals] = useState<{ total: number; found_count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    setResults(null);
    setTotals(null);
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
      setResults(data.results || []);
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
        Uses Google Gemini (a separate paid AI) for real pixel-level detection — roughly £0.003–0.005 per photo, logged into the same running AI cost total.
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <AiCostCounter />
      </div>

      <select
        value={bookingCode}
        onChange={(e) => { setBookingCode(e.target.value); setResults(null); setTotals(null); setPreview(null); }}
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
        <div style={{ position: 'relative', width: '100%', marginBottom: '1rem' }}>
          <img src={preview} alt="Table" style={{ width: '100%', borderRadius: '8px', display: 'block' }} />
          {results?.map((r, i) => (
            r.found && r.x_pct != null && r.y_pct != null && (
              <div
                key={r.id}
                style={{
                  position: 'absolute',
                  left: `${r.x_pct}%`,
                  top: `${r.y_pct}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 40, height: 40,
                  borderRadius: '50%',
                  border: `3px solid ${PIN_COLOURS[i % PIN_COLOURS.length]}`,
                  boxShadow: '0 0 0 2px white, 0 2px 8px rgba(0,0,0,0.4)',
                  pointerEvents: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.7rem', fontWeight: 700, color: 'white', backgroundColor: PIN_COLOURS[i % PIN_COLOURS.length],
                }}
              >
                {i + 1}
              </div>
            )
          ))}
        </div>
      )}

      {totals && (
        <div style={{ padding: '0.9rem', backgroundColor: totals.found_count === totals.total ? '#eafaf0' : '#fdf6e3', borderRadius: '8px', marginBottom: '0.9rem' }}>
          <p style={{ fontWeight: 700, fontSize: '0.95rem', color: totals.found_count === totals.total ? '#1a8a3c' : '#b8860b' }}>
            {totals.found_count} of {totals.total} found here
          </p>
          {totals.found_count < totals.total && (
            <p style={{ fontSize: '0.82rem', color: '#666', marginTop: '0.3rem' }}>
              {totals.total - totals.found_count} still missing — check another table or box for the rest.
            </p>
          )}
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
                <p style={{ fontSize: '0.75rem', color: r.found ? '#1a8a3c' : '#c33', marginTop: '0.15rem' }}>
                  {r.found ? `Found — ${r.confidence} confidence` : 'Not found here'}
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
