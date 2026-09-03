'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { PageShell } from '@/components/PageShell';
import { Loader, Printer, Trash2, ArrowRight, RefreshCw } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// Daisy: "one test booking button... print off one test QR code. I can add
// a few pieces. I can then do my own tests in the kiln... and then I can do
// the whole process with one test QR code card."
//
// The card it prints is deliberately identical in function to a real one --
// same /floor?code= target -- so scanning it exercises the real path rather
// than a special test route that could pass while the real one is broken.

interface TestBooking {
  booking_code: string;
  customer_name: string;
  session_start: string;
}

export default function TestCardPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<TestBooking[]>([]);
  const [reidentifying, setReidentifying] = useState<string | null>(null);
  const [reidentifyMsg, setReidentifyMsg] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const makeQrs = useCallback(async (list: TestBooking[]) => {
    const next: Record<string, string> = {};
    for (const b of list) {
      next[b.booking_code] = await QRCode.toDataURL(
        `${window.location.origin}/floor?code=${encodeURIComponent(b.booking_code)}`,
        { margin: 1, width: 220 }
      );
    }
    setQrs(next);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/test-booking`);
      const data = res.ok ? await res.json() : [];
      setBookings(Array.isArray(data) ? data : []);
      await makeQrs(Array.isArray(data) ? data : []);
    } catch { /* leave empty; the create button still works */ }
  }, [makeQrs]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/test-booking`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not create a test booking');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {

    setBusy(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/test-booking`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not clear');
      setBookings([]);
      setQrs({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="Test card" subtitle="One throwaway booking to run the whole process against.">
      <button
        onClick={create}
        disabled={busy}
        style={{ width: '100%', padding: '0.9rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-md)', cursor: 'pointer', marginBottom: '1rem' }}
      >
        {busy ? 'Working…' : 'Make a test card'}
      </button>

      {error && (
        <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#fdecea', border: '1px solid #f5c2c0', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-base)', color: '#a5342f', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {bookings.map((b) => (
        <div key={b.booking_code} className="test-card" style={{ border: '1px solid #ddd', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '0.8rem', textAlign: 'center', background: 'white' }}>
          {qrs[b.booking_code]
            ? <img src={qrs[b.booking_code]} alt="" style={{ width: 200, height: 200 }} />
            : <Loader size={20} className="animate-spin" />}
          <p style={{ fontWeight: 700, fontSize: 'var(--text-md)', margin: '0.5rem 0 0.15rem' }}>{b.customer_name}</p>
          <p style={{ fontSize: 'var(--text-xs)', color: '#777', margin: 0 }}>{b.booking_code}</p>
          <p style={{ fontSize: 'var(--text-xs)', color: '#999', margin: '0.35rem 0 0.7rem' }}>
            Scan to open the table step with this booking loaded
          </p>
          {/* Daisy: "if we're actually on a booking or a test booking, I
              don't want to have to print a card... use internal scanning
              rather than have to actually physically scan." Same
              destination a real scan reaches -- just skips pointing this
              device's camera at its own screen to prove a point. */}
          <button
            onClick={() => router.push(`/floor?code=${encodeURIComponent(b.booking_code)}`)}
            style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          >
            Open this booking <ArrowRight size={15} />
          </button>
          {/* For pieces stuck as the old placeholder from before tonight's
              speed fixes -- re-runs identification against the photo
              already on file, using the current fast model, without
              retaking anything. */}
          <button
            onClick={async () => {
              setReidentifying(b.booking_code);
              setReidentifyMsg(null);
              try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${encodeURIComponent(b.booking_code)}/reidentify-pieces`, { method: 'POST' });
                const data = await res.json();
                setReidentifyMsg(res.ok ? `Re-checked — ${data.pieces?.length ?? 0} piece(s) found.` : (data?.error || 'Could not re-check this booking.'));
              } catch {
                setReidentifyMsg('Could not reach the server.');
              } finally {
                setReidentifying(null);
              }
            }}
            disabled={reidentifying === b.booking_code}
            style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-md)', border: '1px solid #ccc', background: 'white', color: 'var(--charcoal)', fontWeight: 600, fontSize: 'var(--text-sm)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '0.5rem' }}
          >
            <RefreshCw size={13} className={reidentifying === b.booking_code ? 'animate-spin' : ''} />
            {reidentifying === b.booking_code ? 'Re-checking…' : 'Re-check pieces from stored photo'}
          </button>
          {reidentifyMsg && b.booking_code === (reidentifying || b.booking_code) && (
            <p style={{ fontSize: 'var(--text-xs)', color: '#666', marginTop: '0.35rem' }}>{reidentifyMsg}</p>
          )}
        </div>
      ))}

      {bookings.length > 0 && (
        <>
          <button
            onClick={() => window.print()}
            style={{ width: '100%', padding: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid #ccc', background: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          >
            <Printer size={15} /> Print
          </button>
          <button
            onClick={() => setConfirmClear(true)}
            disabled={busy}
            style={{ width: '100%', padding: '0.7rem', borderRadius: 'var(--radius-md)', border: '1px solid #f5c2c0', background: 'white', color: '#a5342f', fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer', marginTop: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          >
            <Trash2 size={15} /> Clear all test bookings and their pieces
          </button>
        </>
      )}

      {/* Only the cards print -- not the buttons, not the app chrome. */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .test-card, .test-card * { visibility: visible; }
          .test-card { page-break-inside: avoid; }
        }
      `}</style>
      <ConfirmDialog
        open={confirmClear}
        title="Clear all test bookings?"
        body="Every test booking and any pieces added to them will be removed. Real bookings are not touched."
        confirmLabel="Clear them"
        destructive
        onConfirm={() => { setConfirmClear(false); clearAll(); }}
        onCancel={() => setConfirmClear(false)}
      />
    </PageShell>
  );
}
