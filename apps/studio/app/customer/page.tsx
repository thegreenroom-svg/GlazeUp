'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Flame, PackageCheck, Award } from 'lucide-react';

interface Piece {
  id: string;
  piece_type: string | null;
  status: string | null;
  description: string | null;
  reference_photo_url: string | null;
  mark_code: string | null;
}

interface CustomerView {
  greeting: string;
  booking: { booking_code: string; customer_name: string; session_start: string; table_number: string | null; party_size: number | null };
  pieces: Piece[];
  piece_count: number;
  ready_count: number;
  in_kiln_count: number;
  loyalty: { earned: number; spent: number; balance: number };
  photos: { photo_url: string; ai_description: string | null }[];
  status_message: string;
}

function CustomerInner() {
  const params = useSearchParams();
  const code = params.get('booking');
  const [data, setData] = useState<CustomerView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/customer/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('We could not find that booking.'))
      .finally(() => setLoading(false));
  }, [code]);

  if (!code) {
    return (
      <div style={{ padding: '2rem', maxWidth: '520px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Customer view</h1>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>
          This is the page a customer lands on after scanning their booking QR code.
          Add <code style={{ backgroundColor: '#f0f0f0', padding: '0.1rem 0.3rem', borderRadius: 3 }}>?booking=CODE</code> to the address to preview a real session.
        </p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '520px' }}>
      {loading && <p style={{ color: '#666' }}>Loading...</p>}
      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px' }}>{error}</div>}

      {data && (
        <>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 'bold', marginBottom: '0.15rem' }}>{data.greeting}</h1>
          <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            {new Date(data.booking.session_start).toLocaleDateString()}
            {data.booking.table_number ? ` · Table ${data.booking.table_number}` : ''}
          </p>

          <div style={{
            padding: '1rem', borderRadius: '10px', marginBottom: '1.25rem',
            backgroundColor: data.ready_count ? '#eafaf0' : data.in_kiln_count ? '#fdf6e3' : '#f9f9f9',
            display: 'flex', alignItems: 'center', gap: '0.6rem',
          }}>
            {data.ready_count ? <PackageCheck size={22} color="#1a8a3c" /> : data.in_kiln_count ? <Flame size={22} color="#b8860b" /> : null}
            <p style={{ fontWeight: 600 }}>{data.status_message}</p>
          </div>

          {data.loyalty.balance > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 0.9rem', backgroundColor: '#fdf6f8', borderRadius: '8px', marginBottom: '1.25rem' }}>
              <Award size={18} color="#E85D8A" />
              <span style={{ fontSize: '0.9rem' }}>
                <strong>{data.loyalty.balance}</strong> loyalty points
              </span>
            </div>
          )}

          {data.photos.length > 0 && (
            <>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Your table</h2>
              <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginBottom: '1.25rem' }}>
                {data.photos.map((p, i) => (
                  <img key={i} src={p.photo_url} alt="Your pieces" style={{ height: 150, borderRadius: 8, flexShrink: 0 }} />
                ))}
              </div>
            </>
          )}

          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Your pieces {data.piece_count > 0 && `(${data.piece_count})`}
          </h2>
          {data.pieces.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#999' }}>
              Nothing logged against this booking yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {data.pieces.map((p) => (
                <div key={p.id} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.5rem', border: '1px solid #eee', borderRadius: '8px' }}>
                  {p.reference_photo_url && (
                    <img src={p.reference_photo_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 5 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.88rem', fontWeight: 500 }}>{p.description || p.piece_type || 'Piece'}</p>
                    <p style={{ fontSize: '0.75rem', color: '#999', textTransform: 'capitalize' }}>
                      {(p.status || '').replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

export default function CustomerPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <CustomerInner />
    </Suspense>
  );
}
