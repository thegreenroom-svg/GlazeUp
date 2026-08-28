'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { Printer, Loader } from 'lucide-react';

// Daisy: "we need to be able to print a label at that point of packing...
// either for collection with a very big name and surname and collection
// date with pieces itemized, or postage with the full postage address."
//
// Two genuinely different documents, deliberately not one template with
// bits hidden -- a collection label has to be readable from across a
// counter; a postal one is what a courier reads.

interface LabelData {
  booking_code: string;
  customer_name: string;
  collection_date: string | null;
  collection_method: 'studio' | 'postal' | null;
  postal_address_line1: string | null;
  postal_city: string | null;
  postal_postcode: string | null;
  pieces: string[];
}

export default function PrintLabelPage() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<LabelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [royalMail, setRoyalMail] = useState<{ configured: boolean; message: string } | null>(null);

  const load = useCallback(async (code: string) => {
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/packing/label/${encodeURIComponent(code)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Could not load this booking');
      setData(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }, []);

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) load(code);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/postal/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setRoyalMail(d); })
      .catch(() => { /* status just stays unknown */ });
  }, [searchParams, load]);

  const isPostal = data?.collection_method === 'postal';

  return (
    <PageShell title="Print label" subtitle="What goes on the parcel">
      {!data && !error && (
        <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
          <Loader size={16} className="animate-spin" /> Loading…
        </p>
      )}
      {error && (
        <p style={{ fontSize: '0.85rem', color: '#a5342f' }}>{error}</p>
      )}

      {data && (
        <>
          {/* COLLECTION variant -- big, readable from across a counter. */}
          {!isPostal && (
            <div className="print-label" style={{ border: '2px solid #222', borderRadius: 10, padding: '1.4rem', textAlign: 'center', background: 'white' }}>
              <p style={{ fontSize: '1.8rem', fontWeight: 800, lineHeight: 1.15, margin: 0 }}>{data.customer_name}</p>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#8C6A4A', margin: '0.6rem 0 0' }}>
                {data.collection_date
                  ? new Date(data.collection_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
                  : 'Collection date not set'}
              </p>
              {data.pieces.length > 0 && (
                <ul style={{ textAlign: 'left', margin: '1rem auto 0', maxWidth: 320, fontSize: '0.85rem', color: '#333' }}>
                  {data.pieces.map((p, i) => <li key={i} style={{ marginBottom: '0.2rem' }}>{p}</li>)}
                </ul>
              )}
              <p style={{ fontSize: '0.7rem', color: '#999', marginTop: '1rem' }}>{data.booking_code}</p>
            </div>
          )}

          {/* POSTAL variant -- what a courier reads. Full address, no
              itemized contents (a courier doesn't need to know what's
              inside, only where it's going). */}
          {isPostal && (
            <div className="print-label" style={{ border: '2px solid #222', borderRadius: 10, padding: '1.4rem', background: 'white' }}>
              <p style={{ fontSize: '0.7rem', color: '#999', margin: '0 0 0.6rem' }}>{data.booking_code}</p>
              <p style={{ fontSize: '1.3rem', fontWeight: 800, lineHeight: 1.3, margin: 0 }}>{data.customer_name}</p>
              <p style={{ fontSize: '1.1rem', lineHeight: 1.4, margin: '0.3rem 0 0' }}>
                {data.postal_address_line1 || <span style={{ color: '#c0392b' }}>No address on file</span>}
                {data.postal_city && <><br />{data.postal_city}</>}
                {data.postal_postcode && <><br /><strong>{data.postal_postcode}</strong></>}
              </p>
            </div>
          )}

          <button
            onClick={() => window.print()}
            style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', borderRadius: 10, border: '1px solid #ccc', background: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          >
            <Printer size={15} /> Print
          </button>

          {isPostal && !data.postal_address_line1 && (
            <p style={{ fontSize: '0.75rem', color: '#A6761D', marginTop: '0.6rem' }}>
              No street address was captured for this booking — go back to the table step to add one before posting.
            </p>
          )}
          {isPostal && royalMail && (
            <p style={{ fontSize: '0.72rem', color: royalMail.configured ? '#2E7D32' : '#999', marginTop: '0.5rem' }}>
              {royalMail.configured ? '✓ ' : ''}{royalMail.message}
            </p>
          )}
        </>
      )}

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .print-label, .print-label * { visibility: visible; }
          .print-label { position: absolute; left: 0; top: 0; width: 100%; page-break-inside: avoid; }
        }
      `}</style>
    </PageShell>
  );
}
