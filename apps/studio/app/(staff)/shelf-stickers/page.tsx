'use client';

// [6 Sep] THE SHELF STICKER.
//
// Daisy: the QR goes on the shelf "before glazing during", and printing
// is by printer.
//
// So this sticker lives on a shelf of GREENWARE -- painted, waiting to
// be dipped and fired. That is the moment the batch is most fragile and
// least visible: nothing is glazed yet, several shelves may hold one
// collection date, and the pieces will be split across kiln loads and
// come back in a different arrangement. A number chalked on the shelf
// edge says which batch it is; the QR says what is supposed to be in it.
//
// Deliberately not a label-printer job. These are big stickers going on
// a wooden shelf edge that people scan from a metre away with wet
// hands, so they print several to an A4 sheet at a size you can read
// across the room, rather than at 50mm.

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { PageShell } from '@/components/PageShell';
import { Printer } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Batch { collection_date: string | null; pieces_waiting: number }

export default function ShelfStickersPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [qrs, setQrs] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/shelf/batches`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (d) => {
        const list: Batch[] = (d?.batches || []).filter((b: Batch) => b.collection_date);
        setBatches(list);
        const made: Record<string, string> = {};
        for (const b of list) {
          if (!b.collection_date) continue;
          // Encodes the app URL, not a bare date: scanning it with any
          // phone camera should land on the manifest, not show a string
          // of digits that means nothing to whoever picked it up.
          made[b.collection_date] = await QRCode.toDataURL(
            `${window.location.origin}/batch/${b.collection_date}`,
            { margin: 1, width: 420, errorCorrectionLevel: 'M' }
          );
        }
        setQrs(made);
      })
      .catch(() => {});
  }, []);

  const pretty = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <PageShell title="Shelf stickers" subtitle="One per collection date, for the greenware shelves">
      <p style={{ fontSize: 'var(--text-sm)', color: '#777', margin: '0 0 0.8rem', lineHeight: 1.45 }}>
        Stick one on the edge of every shelf holding this batch, before the pieces are dipped.
        Scanning it shows everything due that day and flags anything still missing.
      </p>

      <button
        onClick={() => window.print()}
        style={{ width: '100%', minHeight: 48, marginBottom: '1rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
      >
        <Printer size={18} /> Print these
      </button>

      <div className="stickers">
        {batches.map((b) => b.collection_date && (
          <div
            key={b.collection_date}
            className="sticker"
            style={{ border: '2px solid #2f2a25', borderRadius: 12, padding: '0.9rem', marginBottom: '0.8rem', background: 'white', display: 'flex', gap: '0.9rem', alignItems: 'center', breakInside: 'avoid' }}
          >
            {qrs[b.collection_date] && (
              <img src={qrs[b.collection_date]} alt="" style={{ width: 130, height: 130, flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#777', fontWeight: 700 }}>
                Collection
              </p>
              {/* The date is set big enough to read from across the
                  studio, because most of the time nobody scans anything
                  -- they just want to know which shelf is which. */}
              <p style={{ margin: '0.1rem 0 0', fontSize: 30, fontWeight: 800, lineHeight: 1.05, color: '#2f2a25' }}>
                {new Date(b.collection_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </p>
              <p style={{ margin: '0.15rem 0 0', fontSize: 13, color: '#555' }}>{pretty(b.collection_date)}</p>
              <p style={{ margin: '0.3rem 0 0', fontSize: 13, fontWeight: 700, color: '#8a5a2b' }}>
                {b.pieces_waiting} pieces · scan to check nothing is missing
              </p>
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .stickers, .stickers * { visibility: visible; }
          .stickers { position: absolute; left: 0; top: 0; width: 100%; }
          /* Several to a sheet, none split across a page break -- half a
             QR code on the shelf is worse than none. */
          .sticker { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
    </PageShell>
  );
}
