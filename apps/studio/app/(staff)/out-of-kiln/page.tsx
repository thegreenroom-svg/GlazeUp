'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { Collapse, Section, Tool, Toolbar } from '@/components/Toolbar';
import { Row, RowAction, Chip } from '@/components/Row';
import { Camera, Loader, Boxes, HelpCircle, Layers } from 'lucide-react';

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
  const [numOpen, setNumOpen] = useState(false);
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
    <PageShell title="Out of the kiln" subtitle="Box it up, photograph it, carry on" back="/collect">
      {/* [6 Sep] The batch picker lived here for about three hours.
          It was added to stop the sweep searching the wrong 80 pieces,
          then removed because the honest fix was to stop capping at 80
          -- not to ask someone holding a box which shelf they are
          looking at. The whole pool is searched now.

          [11 Oct] And the how-to moved below the camera, folded into one
          line. Seven bullets of guidance above the button is right for the
          first box anyone ever does and wrong for the two hundredth: it
          put the one thing this screen is for below the fold. */}

      <label
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', padding: '0.95rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-lg)', cursor: busy ? 'default' : 'pointer', minHeight: 56, opacity: busy ? 0.7 : 1 }}
      >
        {busy ? <Loader size={18} className="animate-spin" /> : <Camera size={18} />}
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

      <Toolbar style={{ marginTop: '0.6rem' }}>
        {/* The number is normally read straight off the box. This is for the
            box whose marker has rubbed off, and it overrides the camera. */}
        <Tool onClick={() => setNumOpen((v) => !v)} active={numOpen || !!boxTyped.trim()} tone="dark">
          {boxTyped.trim() ? `Box ${boxTyped.trim()}` : 'Type the box number'}
        </Tool>
        <Tool onClick={() => router.push('/shelves')} icon={<Boxes size={15} />}>Every box</Tool>
        <Tool onClick={() => router.push('/packing')} icon={<Layers size={15} />}>Packing</Tool>
      </Toolbar>

      {numOpen && (
        <input
          autoFocus
          value={boxTyped}
          onChange={(e) => setBoxTyped(e.target.value)}
          inputMode="numeric"
          placeholder="Box number, e.g. 7"
          style={{ width: '100%', padding: '0.7rem', minHeight: 44, marginBottom: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid #d8cbbc', fontSize: 'var(--text-base)', background: 'white', color: 'var(--charcoal)' }}
        />
      )}

      {error && (
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', marginBottom: '0.7rem' }}>{error}</p>
      )}

      {found && (
        <div style={{ marginBottom: '1rem' }}>
          {/* Shown for confirmation, never trusted silently -- handwritten
              digits misread easily, and a wrong box number sends someone
              confidently to the wrong box. */}
          <Section n={found.length}>
            {boxTyped.trim()
              ? `Saved as box ${boxTyped.trim()}`
              : boxRead
                ? `Read as box ${boxRead}`
                : 'No box number read'}
          </Section>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', margin: '0 0 0.6rem' }}>
            {totalFound} piece{totalFound === 1 ? '' : 's'} recognised of {candidates} waiting
            {!boxTyped.trim() && (boxRead ? ' · wrong number? Type it above and photograph again' : ' · type it above and photograph again to record it')}
          </p>

          {found.length === 0 ? (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--warning)' }}>
              Nothing was recognised. Try again with more space between the pieces, or a little more light.
            </p>
          ) : (
            found.map((b) => {
              const whole = b.found === b.total_in_booking;
              return (
                <Row
                  key={b.booking_code}
                  title={b.customer_name}
                  detail={b.pieces.map((p) => p.description || p.piece_type || 'piece').join(', ')}
                  tone={whole ? 'done' : 'plain'}
                  chips={<Chip tone={whole ? 'good' : 'quiet'}>{whole ? `All ${b.found}` : `${b.found} of ${b.total_in_booking}`}</Chip>}
                  onClick={() => router.push(`/booking/${encodeURIComponent(b.booking_code)}`)}
                  action={<RowAction onClick={() => router.push(`/packing?code=${encodeURIComponent(b.booking_code)}`)}>Pack</RowAction>}
                />
              );
            })
          )}
        </div>
      )}

      <Collapse summary="How to pack and photograph a box" icon={<HelpCircle size={16} color="#8a8178" />}>
        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: '#8a8178', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.2rem 0 0.4rem' }}>
          Packing
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
        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 800, color: '#8a8178', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0.9rem 0 0.4rem' }}>
          The photo
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
      </Collapse>
    </PageShell>
  );
}
