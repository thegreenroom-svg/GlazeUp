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
// Label printer, one label per collection date. The number of shelves a
// batch spans does not matter and is not tracked -- Daisy: "doesn't
// matter how many shelves, just collection date catch." So a label
// carries a DATE, not a shelf identity, and you print as many copies as
// there are shelf edges to stick them on. Two labels showing 19 Sep are
// the same label, not two different shelves, which is what lets the
// batch survive being split across kiln loads later.

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { PageShell } from '@/components/PageShell';
import { Printer } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Batch { collection_date: string | null; pieces_waiting: number }

export default function ShelfStickersPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  // Copies per date, because a batch spreads over however many shelves
  // it needs and every edge wants one.
  const [copies, setCopies] = useState<Record<string, number>>({});

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
        One label per collection date. Print as many as you have shelf edges to stick them on —
        they are all the same label. Scanning any of them shows everything due that day and
        flags anything still missing.
      </p>

      {/* [6 Sep] Daisy: "what's this makes no sense."
          The date and the copy buttons were fighting for one row, so
          "19 Sep · 206 pieces" wrapped across three lines behind a wall
          of numbers and the batch -- the actual subject -- became the
          least readable thing on screen. Date on its own line, copies
          underneath. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
        {batches.map((b) => b.collection_date && (
          <div key={b.collection_date} style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.7rem 0.8rem' }}>
            <p style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--charcoal)' }}>
              {new Date(b.collection_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })}
            </p>
            <p style={{ margin: '0.1rem 0 0.5rem', fontSize: 'var(--text-xs)', color: '#777' }}>
              {b.pieces_waiting} piece{b.pieces_waiting === 1 ? '' : 's'} waiting
            </p>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              {[0, 1, 2, 3, 4, 6].map((n) => {
                const on = (copies[b.collection_date as string] ?? 0) === n;
                return (
                  <button
                    key={n}
                    onClick={() => setCopies((c) => ({ ...c, [b.collection_date as string]: n }))}
                    style={{
                      flex: 1, minHeight: 40, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      fontSize: 'var(--text-sm)', fontWeight: 700,
                      border: on ? '2px solid var(--clay)' : '1px solid #ece5db',
                      background: on ? 'var(--clay)' : 'white',
                      color: on ? 'white' : 'var(--charcoal)',
                    }}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => window.print()}
        style={{ width: '100%', minHeight: 48, marginBottom: '1rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
      >
        <Printer size={18} /> Print these
      </button>

      <div className="stickers">
        {batches.flatMap((b) =>
          Array.from({ length: copies[b.collection_date as string] ?? 0 }, (_, n) => {
            const d = b.collection_date as string;
            return (
              <div key={`${d}-${n}`} className="sticker">
                {qrs[d] && <img className="qr" src={qrs[d]} alt="" />}
                <div className="txt">
                  <p className="kicker">COLLECTION</p>
                  {/* The date is the label. Most of the time nobody scans
                      anything -- they want to know which shelf is which
                      from across the studio, and only reach for a phone
                      when something is actually wrong. */}
                  <p className="big">{new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                  <p className="sub">{pretty(d)}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        .sticker {
          display: flex; align-items: center; gap: 4mm;
          width: 62mm; height: 29mm; padding: 2mm 3mm;
          border: 1px solid #ddd; border-radius: 2mm; background: white;
          margin-bottom: 3mm; box-sizing: border-box; overflow: hidden;
        }
        .sticker .qr { width: 24mm; height: 24mm; flex-shrink: 0; }
        .sticker .txt { min-width: 0; }
        .sticker .kicker { margin: 0; font-size: 6pt; letter-spacing: 0.09em; color: #777; font-weight: 700; }
        .sticker .big { margin: 0.4mm 0 0; font-size: 19pt; font-weight: 800; line-height: 1; color: #000; }
        .sticker .sub { margin: 0.6mm 0 0; font-size: 7pt; color: #444; }

        @media print {
          body * { visibility: hidden; }
          .stickers, .stickers * { visibility: visible; }
          .stickers { position: absolute; left: 0; top: 0; }
          /* One label per page: a label printer feeds a roll, so each
             sticker is its own page and the borders come off. */
          @page { size: 62mm 29mm; margin: 0; }
          .sticker {
            border: none; margin: 0; page-break-after: always;
            break-after: page; width: 62mm; height: 29mm;
          }
          .sticker:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>
    </PageShell>
  );
}
