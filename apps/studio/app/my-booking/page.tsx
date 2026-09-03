'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';

// Daisy: "scan this QR code for your collection time and details of your
// booking... Save it somewhere so you can collect it." The customer's own
// page -- deliberately outside the (staff) route group, which is where
// PinGate lives. This page and its data route are the only things in the
// whole app a customer can reach without a staff login, and they only ever
// see the one booking their own code names -- nothing else.

interface BookingView {
  booking_code: string;
  customer_name: string;
  collection_date: string | null;
  piece_count: number;
  ready: boolean;
  already_collected: boolean;
}

// useSearchParams() requires a Suspense boundary during static export --
// confirmed by a real build failure, not assumed. Other pages in this app
// use it too but sit inside the (staff) layout's PinGate/AppShell wrapper;
// this page has no shared layout beyond the bare root one, so it needs its
// own boundary explicitly.
export default function MyBookingPage() {
  return (
    <Suspense fallback={null}>
      <MyBookingContent />
    </Suspense>
  );
}

function MyBookingContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<BookingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) { setError('No booking code given.'); return; }

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/public/booking/${encodeURIComponent(code)}`)
      .then(async (res) => {
        const d = await res.json();
        if (!res.ok) throw new Error(d?.error || 'Could not find that booking');
        setData(d);
        // The same code, shown back to them -- this is what they save
        // and show at the counter to collect.
        QRCode.toDataURL(window.location.href, { margin: 1, width: 220 }).then(setQr);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Something went wrong'));
  }, [searchParams]);

  return (
    <div style={{ minHeight: '100vh', background: '#FBF7F1', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '2rem 1.2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: '#3a2420', marginBottom: '1.5rem' }}>The Kiln Cafe</h1>

      {error && <p style={{ color: '#a5342f', fontSize: 'var(--text-md)' }}>{error}</p>}

      {data && (
        <div style={{ width: '100%', maxWidth: 360, background: 'white', borderRadius: 'var(--radius-lg)', padding: '1.6rem', textAlign: 'center', boxShadow: '0 1px 6px rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: '#3a2420', margin: 0 }}>{data.customer_name}</p>

          {data.already_collected ? (
            <div style={{ margin: '1.2rem 0', padding: '0.9rem', borderRadius: 'var(--radius-md)', background: '#F1F8F1' }}>
              <p style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: '#2E7D32', margin: 0 }}>✓ Already collected</p>
            </div>
          ) : data.ready ? (
            <div style={{ margin: '1.2rem 0', padding: '0.9rem', borderRadius: 'var(--radius-md)', background: '#F1F8F1' }}>
              <p style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: '#2E7D32', margin: 0 }}>✓ Ready to collect</p>
              <p style={{ fontSize: 'var(--text-sm)', color: '#5a5a5a', margin: '0.3rem 0 0' }}>{data.piece_count} piece{data.piece_count === 1 ? '' : 's'}</p>
            </div>
          ) : (
            <div style={{ margin: '1.2rem 0', padding: '0.9rem', borderRadius: 'var(--radius-md)', background: '#FFF8E1' }}>
              <p style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: '#8a6d1a', margin: 0 }}>Still being fired</p>
              <p style={{ fontSize: 'var(--text-sm)', color: '#5a5a5a', margin: '0.3rem 0 0' }}>Not ready yet — check back closer to your collection date.</p>
            </div>
          )}

          {data.collection_date && (
            <p style={{ fontSize: 'var(--text-base)', color: '#5a5a5a', margin: '0.4rem 0' }}>
              Collection date: <strong>{new Date(data.collection_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
            </p>
          )}

          {qr && (
            <>
              <img src={qr} alt="" style={{ width: 160, height: 160, margin: '1rem auto 0.4rem' }} />
              <p style={{ fontSize: 'var(--text-xs)', color: '#999' }}>Show this at the counter to collect</p>
            </>
          )}

          <p style={{ fontSize: 'var(--text-xs)', color: '#bbb', marginTop: '1rem' }}>
            Save this page — Share → Add to Home Screen — so it's easy to find when you come back.
          </p>
        </div>
      )}
    </div>
  );
}
