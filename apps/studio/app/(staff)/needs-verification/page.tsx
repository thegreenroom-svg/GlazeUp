'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { PageShell } from '@/components/PageShell';
import { Row, Chip } from '@/components/Row';
import { Collapse, Count, Tool, Toolbar } from '@/components/Toolbar';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface FlaggedBooking {
  booking_code: string;
  customer_name: string;
  table_number: string | null;
  session_start: string;
  notes: string;
}

// Real, read-only list of bookings imported on 9 Aug from a photo of a
// diary, where the date/time couldn't be read with full confidence.
// GET only -- no "mark verified" action here on purpose. Verifying a
// booking's real date/time is a judgement call for a person with the
// actual records, not something this app should silently resolve.
export default function NeedsVerificationPage() {
  const [bookings, setBookings] = useState<FlaggedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/needs-verification`);
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || 'Could not load');
        setBookings([]);
        return;
      }
      setBookings(d.bookings || []);
    } catch {
      setError('Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date();

  return (
    // [11 Oct] This was the one staff page still drawing its own heading and
    // its own padding, so it looked like a different app. PageShell now, and
    // Back goes to the menu, which is the only way in.
    <PageShell
      title="Bookings needing verification"
      subtitle="Read from a photo of a diary, so the date or time might be wrong"
      maxWidth={800}
      back="/menu"
    >
      {/* [11 Oct] Refresh was a filled button on a line of its own, and the
          count sat on another line below it. Both are on one control line
          now, so the first flagged booking is near the top. */}
      <Toolbar>
        {!loading && !error && (
          <Count>{bookings.length} booking{bookings.length === 1 ? '' : 's'} still flagged</Count>
        )}
        <Tool
          onClick={load}
          disabled={loading}
          tone="clay"
          icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
        >
          {loading ? 'Loading' : 'Refresh'}
        </Tool>
      </Toolbar>

      {/* [11 Oct] Four lines of explanation used to sit above everything.
          It is worth reading once and never again, so it folds. Every word
          of it is still here. */}
      <Collapse summary="Why these are flagged, and what to do" icon={<AlertCircle size={15} color="#A6761D" />}>
        <p style={{ color: '#666', fontSize: 'var(--text-base)', lineHeight: 1.5, margin: 0 }}>
          Entered on 9 Aug from a photo of a diary, not typed in directly — the date or time
          on these couldn&apos;t be read with full confidence. Check each against the real
          records and correct on the Bookings page if needed. Read-only here; nothing
          gets cleared automatically.
        </p>
      </Collapse>

      {error && (
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.9rem', backgroundColor: '#fee', color: '#c33', borderRadius: '6px', marginBottom: '1.25rem' }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {!loading && !error && bookings.length === 0 && (
        <p style={{ color: '#999' }}>None flagged — all clear.</p>
      )}

      {/* [11 Oct] Each booking was a hand-rolled card with five stacked
          lines in it. It is the shared row now: the name, the date and the
          note under it, and the rest as small chips. Upcoming used to be
          said twice over, as a yellow border AND a shouted UPCOMING, and is
          one chip instead. Open booking keeps its own link and its own
          address exactly as it was. */}
      {!loading && bookings.map((b) => {
        const start = new Date(b.session_start);
        const upcoming = start > now;
        return (
          <Row
            key={b.booking_code}
            title={b.customer_name}
            detail={
              <>
                {start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                {' · '}
                {start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                {b.table_number ? ` · Table ${b.table_number}` : ''}
                <span style={{ display: 'block', color: '#999' }}>{b.notes}</span>
              </>
            }
            chips={
              <>
                {upcoming && <Chip tone="warn">Coming up</Chip>}
                <Chip>{b.booking_code}</Chip>
              </>
            }
            action={
              <a
                // [11 Oct] Was /bookings?code=... -- a route that has never
                // existed, so Open booking has always 404'd from here. The
                // booking page is /booking/<code>.
                href={`/booking/${encodeURIComponent(b.booking_code)}`}
                style={{
                  flexShrink: 0, display: 'inline-flex', alignItems: 'center', minHeight: 40,
                  padding: '0 0.7rem', borderRadius: 'var(--radius-md)', border: '1px solid #e6ddd2',
                  background: 'white', fontSize: 'var(--text-xs)', color: 'var(--clay)',
                  fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap',
                }}
              >
                Open booking
              </a>
            }
          />
        );
      })}
    </PageShell>
  );
}
