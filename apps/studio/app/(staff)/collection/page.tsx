'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { PageShell } from '@/components/PageShell';
import { QrScanner } from '@/components/QrScanner';
import { Camera, Printer, Check, Loader, Undo2 } from 'lucide-react';

// Collection, per Daisy's afternoon revelation: the girls already hand out a
// written card at the end of every session. This is that card, printed --
// booking details, collection date, what's on it, and a QR code -- plus the
// handover itself.
//
// "The app could just scan it, and it's completed. If they don't bring it in
// ... just take off collected." So scanning is a convenience, never a
// requirement: every booking due is listed and tappable by hand for anyone
// who forgot their card.

type PieceBox = { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number };
interface Piece {
  id: string; piece_type: string; description: string | null;
  reference_photo_url: string | null; photo_box: PieceBox | null;
}

// Same crop maths already used in Packing -- one small helper duplicated
// here rather than a shared import, matching how the app already handles
// small utilities like this elsewhere.
function cropStyle(url: string, box: PieceBox): React.CSSProperties {
  const w = box.right_pct - box.left_pct;
  const h = box.bottom_pct - box.top_pct;
  if (!(w > 0) || !(h > 0)) return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${(100 / w) * 100}% ${(100 / h) * 100}%`,
    backgroundPosition: `${w >= 100 ? 0 : (box.left_pct / (100 - w)) * 100}% ${h >= 100 ? 0 : (box.top_pct / (100 - h)) * 100}%`,
    backgroundRepeat: 'no-repeat',
  };
}
interface CardData {
  booking_code: string;
  customer_name: string;
  collection_date: string | null;
  pieces: Piece[];
}
interface DueBooking { booking_code: string; customer_name: string; piece_count: number }
interface DueDate { collection_date: string; bookings: DueBooking[]; total_pieces: number }

export default function CollectionPage() {
  const searchParams = useSearchParams();
  const [card, setCard] = useState<CardData | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [due, setDue] = useState<DueDate[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState<{ url: string; box: PieceBox | null } | null>(null); // Daisy: small thumbnails here, opening full screen when tapped

  const loadCard = useCallback(async (code: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/collection/card/${encodeURIComponent(code)}`);
      if (!res.ok) throw new Error('Booking not found');
      const data = await res.json();
      setCard(data);
      // Points at the customer's own page, not the staff one -- Daisy:
      // "just make sure it's one QR code for the booking." Staff's own
      // scanner already extracts the code from any URL regardless of
      // path, so this still works for scanning here exactly as before.
      // It ALSO means a customer who taps or scans the same printed
      // code themselves lands somewhere genuinely appropriate for
      // them, instead of hitting a staff login wall.
      setQr(await QRCode.toDataURL(`${window.location.origin}/my-booking?code=${encodeURIComponent(code)}`, { margin: 1, width: 200 }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not load that booking');
    } finally {
      setBusy(false);
    }
  }, []);

  const loadDue = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/collection/due`);
      const data = res.ok ? await res.json() : { dates: [] };
      setDue(data.dates || []);
    } catch { /* list just stays empty */ }
  }, []);

  useEffect(() => {
    const code = searchParams.get('code');
    if (code) loadCard(code);
    loadDue();
  }, [searchParams, loadCard, loadDue]);

  const collect = async (code: string, uncollect = false) => {
    setBusy(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/collection/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_code: code, uncollect }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not update');
      setMessage(uncollect ? 'Put back as not collected.' : `Handed over — ${data.pieces_updated} piece(s) marked collected.`);
      await loadDue();
      if (card?.booking_code === code) setCard(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell title="Collection" subtitle="Print the card, or hand pottery over.">
      <button
        onClick={() => setScanning(true)}
        style={{ width: '100%', padding: '0.9rem', borderRadius: 10, border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
      >
        <Camera size={18} /> Scan a collection card
      </button>

      {scanning && (
        <QrScanner
          onClose={() => setScanning(false)}
          onScan={(text) => {
            setScanning(false);
            let code: string | null = null;
            try { code = new URL(text).searchParams.get('code'); } catch { /* not a URL */ }
            if (!code) code = text.trim();
            if (code) loadCard(code);
          }}
        />
      )}

      {message && (
        <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#F1F8F1', border: '1px solid #9CC79C', borderRadius: 6, fontSize: '0.85rem', marginBottom: '1rem' }}>
          {message}
        </div>
      )}

      {busy && <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#666' }}><Loader size={16} className="animate-spin" /> Working…</p>}

      {card && (
        <>
          <div className="collection-card" style={{ border: '1px solid #ddd', borderRadius: 10, padding: '1.1rem', marginBottom: '0.8rem', background: 'white' }}>
            <div style={{ textAlign: 'center' }}>
              {qr && <img src={qr} alt="" style={{ width: 170, height: 170 }} />}
            </div>
            <p style={{ fontWeight: 800, fontSize: '1.05rem', margin: '0.6rem 0 0.1rem', textAlign: 'center' }}>{card.customer_name}</p>
            <p style={{ fontSize: '0.75rem', color: '#777', margin: 0, textAlign: 'center' }}>{card.booking_code}</p>
            <p style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0.7rem 0 0.2rem', textAlign: 'center' }}>
              Ready to collect: {card.collection_date ? new Date(card.collection_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : 'date not set'}
            </p>
            {card.pieces.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.7rem' }}>
                {card.pieces.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                    {p.reference_photo_url ? (
                      <button
                        onClick={() => setFullscreen({ url: p.reference_photo_url as string, box: p.photo_box })}
                        style={{
                          width: 44, height: 44, borderRadius: 6, flexShrink: 0, border: '1px solid #ddd', padding: 0, cursor: 'pointer',
                          ...(p.photo_box ? cropStyle(p.reference_photo_url, p.photo_box)
                            : { backgroundImage: `url(${p.reference_photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }),
                        }}
                        aria-label="View full screen"
                      />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 6, flexShrink: 0, background: '#f2f2f2' }} />
                    )}
                    <span style={{ fontSize: '0.8rem', color: '#444', textAlign: 'left' }}>{p.description || p.piece_type}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tapping a thumbnail opens the real photo full screen -- the
              small version is just for scanning the list quickly. */}
          {fullscreen && (
            <div
              onClick={() => setFullscreen(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.2rem' }}
            >
              <img
                src={fullscreen.url}
                alt=""
                style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, objectFit: 'contain' }}
              />
            </div>
          )}

          <button
            onClick={() => window.print()}
            style={{ width: '100%', padding: '0.8rem', borderRadius: 10, border: '1px solid #ccc', background: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}
          >
            <Printer size={15} /> Print collection card
          </button>
          <button
            onClick={() => collect(card.booking_code)}
            disabled={busy}
            style={{ width: '100%', padding: '0.9rem', borderRadius: 10, border: 'none', background: '#2E7D32', color: 'white', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
          >
            <Check size={17} /> Hand over {card.pieces.length} piece{card.pieces.length === 1 ? '' : 's'}
          </button>
        </>
      )}

      {!card && due.length > 0 && (
        <>
          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: '#777', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.5rem 0 0.6rem' }}>
            Due to collect
          </p>
          {due.map((d) => (
            <div key={d.collection_date} style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                {new Date(d.collection_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                <span style={{ color: '#777', fontWeight: 500 }}> · {d.total_pieces} piece{d.total_pieces === 1 ? '' : 's'}</span>
              </p>
              {d.bookings.map((b) => (
                <button
                  key={b.booking_code}
                  onClick={() => loadCard(b.booking_code)}
                  style={{ width: '100%', textAlign: 'left', border: '1px solid #eee', borderRadius: 8, padding: '0.7rem 0.85rem', marginBottom: '0.4rem', background: 'white', cursor: 'pointer' }}
                >
                  <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{b.customer_name}</span>
                  <span style={{ float: 'right', fontSize: '0.8rem', color: '#8C6A4A', fontWeight: 700 }}>{b.piece_count} piece{b.piece_count === 1 ? '' : 's'}</span>
                </button>
              ))}
            </div>
          ))}
        </>
      )}

      {!card && due.length === 0 && !busy && (
        <p style={{ fontSize: '0.85rem', color: '#777' }}>Nothing waiting to be collected.</p>
      )}

      {/* Only the card prints -- not the buttons or the due list. */}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          .collection-card, .collection-card * { visibility: visible; }
          .collection-card { position: absolute; left: 0; top: 0; width: 100%; page-break-inside: avoid; }
        }
      `}</style>
    </PageShell>
  );
}
