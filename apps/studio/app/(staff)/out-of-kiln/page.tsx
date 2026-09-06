'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { Camera, Loader, Check, Boxes } from 'lucide-react';

// Daisy's kiln-unloading step, in her words: pieces come out into
// numbered boxes, "not too tightly, leaving some separation, obviously
// for carrying purposes too", and photographed "from an angle more or
// less above, say forty five degrees down".
//
// The guidance is ON the screen rather than in anyone's head, because
// this is the one step where doing it badly is invisible until packing
// day: a tightly packed box photographs as a jumble of rims, and the
// pieces underneath are simply never seen again by the app.
//
// No sorting happens here. Pieces go in as they come out of the kiln,
// in any order. The app does the reassembly afterwards.

interface FoundBooking {
  booking_code: string;
  customer_name: string;
  found: number;
  total_in_booking: number;
  pieces: { id: string; piece_type: string | null; description: string | null }[];
}

export default function OutOfKilnPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<FoundBooking[] | null>(null);
  const [boxRead, setBoxRead] = useState<string | null>(null);
  const [boxTyped, setBoxTyped] = useState('');
  const [candidates, setCandidates] = useState(0);

  const send = async (file: File) => {
    setBusy(true);
    setError(null);
    setFound(null);
    setBoxRead(null);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      if (boxTyped.trim()) fd.append('box_number', boxTyped.trim());
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/shelf/sweep`, {
        method: 'POST',
        body: fd,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not read the box');
      setFound(d.bookings || []);
      setBoxRead(d.box_number_read || null);
      setCandidates(d.candidates || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the box');
    } finally {
      setBusy(false);
    }
  };

  const totalFound = (found || []).reduce((n, b) => n + b.found, 0);

  return (
    <PageShell title="Out of the kiln" subtitle="Box it up, photograph it, carry on">
      {/* [6 Sep] The batch picker lived here for about three hours.
          It was added to stop the sweep searching the wrong 80 pieces,
          then removed because the honest fix was to stop capping at 80
          -- not to ask someone holding a box which shelf they are
          looking at. The whole pool is searched now. */}

      <div style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.9rem', marginBottom: '1rem' }}>
        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--charcoal)', margin: '0 0 0.5rem' }}>
          Packing the box
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Pieces go in as they come out. No sorting — the app works out whose is whose afterwards.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Pack loosely, with a gap between pieces. Nothing touching, nothing stacked out of sight.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            A box you can carry safely is about right — the same spacing that protects the pottery is what lets every piece be seen.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Write the box number big and bold on every face.
          </li>
        </ul>

        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--charcoal)', margin: '0.9rem 0 0.5rem' }}>
          Taking the photo
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Stand above the box and tilt down about 45 degrees — not flat overhead, not from the side.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            That angle shows the top and the side of each piece, which is what makes them recognisable.
          </li>
          <li style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)' }}>
            Get the whole box in shot, including the number written on it.
          </li>
        </ul>
      </div>

      {/* Typed before the photo, and optional: the number is usually read
          straight off the box. This is here for the box whose marker has
          rubbed off, and it always overrides what the camera reads. */}
      <label style={{ display: 'block', marginBottom: '0.8rem' }}>
        <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)', marginBottom: '0.25rem' }}>
          Box number (only if it is not readable in the photo)
        </span>
        <input
          value={boxTyped}
          onChange={(e) => setBoxTyped(e.target.value)}
          inputMode="numeric"
          placeholder="e.g. 7"
          style={{ width: '100%', padding: '0.7rem', minHeight: 44, borderRadius: 'var(--radius-md)', border: '1px solid #ddd', fontSize: 'var(--text-base)', background: 'white', color: 'var(--charcoal)' }}
        />
      </label>

      <label
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: busy ? 'default' : 'pointer', minHeight: 48, opacity: busy ? 0.7 : 1 }}
      >
        {busy ? <Loader size={16} className="animate-spin" /> : <Camera size={16} />}
        {busy ? 'Reading the box…' : 'Photograph the box'}
        <input
          type="file" accept="image/*" capture="environment" style={{ display: 'none' }} disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) send(f);
            e.target.value = '';
          }}
        />
      </label>

      {error && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', marginTop: '0.7rem' }}>{error}</p>
      )}

      {found && (
        <div style={{ marginTop: '1rem' }}>
          {/* Shown for confirmation, never trusted silently -- handwritten
              digits misread easily, and a wrong box number sends someone
              confidently to the wrong box. */}
          <p style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--charcoal)', margin: '0 0 0.15rem' }}>
            {boxTyped.trim()
              ? `Saved as box ${boxTyped.trim()}`
              : boxRead
                ? `Read the number as box ${boxRead}`
                : 'No box number could be read'}
          </p>
          {!boxTyped.trim() && (
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', margin: '0 0 0.7rem' }}>
              {boxRead ? 'If that is wrong, type the number above and photograph again.' : 'Type the number above and photograph again to record it.'}
            </p>
          )}

          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)', marginBottom: '0.6rem' }}>
            {totalFound} piece{totalFound === 1 ? '' : 's'} recognised out of {candidates} still waiting.
          </p>

          {found.length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--warning)' }}>
              Nothing was recognised. Try again with more space between the pieces, or a little more light.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {found.map((b) => (
                <button
                  key={b.booking_code}
                  onClick={() => router.push(`/packing?code=${encodeURIComponent(b.booking_code)}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', textAlign: 'left', width: '100%', padding: '0.6rem', borderRadius: 'var(--radius-md)', border: '1px solid #ece5db', background: 'white', cursor: 'pointer' }}
                >
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--charcoal)' }}>{b.customer_name}</span>
                    <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--muted)' }}>
                      {b.pieces.map((p) => p.description || p.piece_type || 'piece').join(', ')}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: 'var(--text-xs)', fontWeight: 700, color: b.found === b.total_in_booking ? 'var(--success)' : 'var(--muted)' }}>
                    {b.found === b.total_in_booking && <Check size={13} />}
                    {b.found} of {b.total_in_booking}
                  </span>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => router.push('/shelves')}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.9rem', padding: '0.4rem 0', border: 'none', background: 'none', color: 'var(--clay)', fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer', minHeight: 44 }}
          >
            <Boxes size={15} /> See every box photographed
          </button>
        </div>
      )}
    </PageShell>
  );
}
