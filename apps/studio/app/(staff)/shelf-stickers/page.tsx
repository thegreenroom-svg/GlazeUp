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
  // [6 Sep] Daisy: "need to just have a date picker here. No other
  // collection dates. Not needed."
  //
  // Listing the batches that already exist was backwards, and the
  // sticker's own timing is why. It goes on the shelf BEFORE glazing,
  // often before a single booking on that date has been given a
  // collection date at all -- so the date you want to print is
  // frequently one the database has never heard of. Offering only
  // known dates meant the label you actually needed was the one you
  // could not print.
  //
  // A date and a number of copies. That is the whole screen.
  // [6 Sep] Starts on the next Saturday rather than empty. An empty
  // date input on iOS renders as a blank box with no visible text, so
  // the screen opened looking broken -- and the answer is nearly always
  // a Saturday anyway, since that is when collections happen.
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    return d.toISOString().slice(0, 10);
  });
  const [copies, setCopies] = useState(2);
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (!date) { setQr(''); return; }
    // Encodes the app URL, so any phone camera lands on the batch --
    // where scanning it moves the whole lot off the shelves and into
    // the kiln -- rather than showing a string of digits.
    QRCode.toDataURL(`${window.location.origin}/batch/${date}`, { margin: 1, width: 420, errorCorrectionLevel: 'M' })
      .then(setQr)
      .catch(() => setQr(''));
  }, [date]);

  const pretty = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <PageShell title="Shelf stickers" subtitle="One collection date, as many labels as you need">
      {/* [6 Sep] glaze-surface, which is how every other card in the app
          survives dark mode. Mine was a bare white div, so in dark mode
          the body colour -- ivory -- was inherited by any text that did
          not set its own, and the label went near-white on a white
          card. Present the whole time, and invisible. */}
      <div className="glaze-surface" style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.9rem', marginBottom: '1rem' }}>
        {/* Colours stated outright rather than inherited. This card is
            white in both themes, so a label taking its colour from the
            theme went near-white on white and disappeared. */}
        <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 700, marginBottom: '0.4rem', color: '#2f2a25' }}>
          Collection date
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          // colorScheme light forces the native picker to draw dark text
          // on white. Without it the system renders it for dark mode and
          // the date is white on a white card -- present, but invisible.
          style={{ width: '100%', minHeight: 48, padding: '0.6rem 0.7rem', borderRadius: 'var(--radius-md)', border: '1px solid #ece5db', fontSize: 'var(--text-base)', background: 'white', color: '#2f2a25', colorScheme: 'light', WebkitAppearance: 'none', appearance: 'none' }}
        />

        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: '0.9rem 0 0.4rem', color: '#2f2a25' }}>How many labels</p>
        <div style={{ display: 'flex', gap: '0.35rem' }}>
          {[1, 2, 3, 4, 6, 8].map((n) => (
            <button
              key={n}
              onClick={() => setCopies(n)}
              style={{
                flex: 1, minHeight: 44, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                fontSize: 'var(--text-base)', fontWeight: 700,
                border: copies === n ? '2px solid var(--clay)' : '1px solid #ece5db',
                background: copies === n ? 'var(--clay)' : 'white',
                color: copies === n ? 'white' : '#2f2a25',
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 'var(--text-xs)', color: '#6b625a', margin: '0.5rem 0 0', lineHeight: 1.45 }}>
          One per shelf edge holding this batch. They are all the same label — the date is what matters,
          not which shelf, because the shelves get broken up when the kiln is loaded.
        </p>
      </div>

      {date && (
        <button
          onClick={() => window.print()}
          style={{ width: '100%', minHeight: 48, marginBottom: '1rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
        >
          <Printer size={18} /> Print {copies} label{copies === 1 ? '' : 's'}
        </button>
      )}

      <div className="stickers">
        {date && qr && Array.from({ length: copies }, (_, n) => (
          <div key={n} className="sticker">
            <img className="qr" src={qr} alt="" />
            <div className="txt">
              <p className="kicker">COLLECTION</p>
              {/* The date is the label. Most of the time nobody scans
                  anything -- they want to know which shelf is which
                  from across the studio. */}
              <p className="big">{new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
              <p className="sub">{pretty(date)}</p>
            </div>
          </div>
        ))}
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
