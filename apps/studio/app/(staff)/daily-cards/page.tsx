'use client';
import QRCode from 'qrcode';
import { PieceThumb, PhotoWithBoxes } from '@/components/PieceBoxes';
import { PieceViewer, ViewerPiece } from '@/components/PieceViewer';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PageShell } from '@/components/PageShell';
import { useSearchParams } from 'next/navigation';
import { Printer, RefreshCw, AlertCircle, CalendarDays, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Camera, Loader, LayoutGrid } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/EmptyState';

// Same fix as PinGate.tsx: a plain fetch() has no timeout of its own. This
// page gates real controls (Check for new bookings, Save on the table
// editor) on busy flags while their fetch is in flight -- if one genuinely
// stalls rather than failing outright, the flag never resets and the
// button stays disabled forever, indistinguishable from the page being
// broken. Guarantees every call here resolves or rejects within 20s.
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface Booking {
  booking_code: string;
  customer_name: string;
  session_start: string;
  table_number: string | null;
  party_size: number | null;
  space_name: string | null;
  notes: string | null;
  piece_count?: number;
  photo_count?: number;
  visit_number?: number;
  previous_visits?: number;
  last_visit?: string | null;
  returns_waiting?: {
    piece_type: string;
    reason: string | null;
    photo: string | null;
    box: { top_pct: number; left_pct: number; right_pct: number; bottom_pct: number } | null;
  }[];
}


// Table-setup flags for the printed card -- deliberately NOT the raw note.
// Girls placing cards need to know at a glance whether a table needs extra
// space (pram) or a particular arrangement (wheelchair, highchair) before
// they've had a chance to open the booking -- but the note itself can
// contain far more personal detail than that, so only match these specific
// physical-space keywords and show the flag word alone, never the note
// text it came from. Keep this list short and about table setup only.
function tableSetupFlags(notes: string | null): string[] {
  if (!notes) return [];
  const n = notes.toLowerCase();
  const flags: string[] = [];
  if (/\bpram|pushchair|buggy\b/.test(n)) flags.push('Pram');
  if (/\bbaby|babies|infant\b/.test(n)) flags.push('Baby');
  if (/\bwheelchair\b/.test(n)) flags.push('Wheelchair');
  if (/\bhigh ?chair\b/.test(n)) flags.push('Highchair');
  return flags;
}

export default function DailyCardsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  // [6 Oct] Daisy: the cards are the interface. One card opens at a time,
  // full width, with its saved table photo; any picture goes full screen.
  const router = useRouter();
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ pieces: ViewerPiece[]; start: number; title: string } | null>(null);
  const [tablePieces, setTablePieces] = useState<Record<string, { photo_url: string | null; pieces: any[]; booking: any } | 'loading' | 'error'>>({});
  // [6 Oct] Daisy: leave a card to do something (table photo, returns,
  // collection card) and coming back should land on that same card, open,
  // not the top of the day or the menu. Remembered for this tab only, and
  // only for a couple of hours so tomorrow does not reopen today's card.
  const OPEN_KEY = 'glazeup_open_card';
  const openCard = async (code: string) => {
    if (openCode === code) {
      setOpenCode(null);
      try { sessionStorage.removeItem(OPEN_KEY); } catch { /* private mode */ }
      return;
    }
    setOpenCode(code);
    try { sessionStorage.setItem(OPEN_KEY, JSON.stringify({ code, date: cardDateRef.current, at: Date.now() })); } catch { /* private mode */ }
    setTablePieces((t) => ({ ...t, [code]: 'loading' }));
    try {
      const r = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${encodeURIComponent(code)}/table-pieces`);
      const d = r.ok ? await r.json() : null;
      setTablePieces((t) => ({ ...t, [code]: d ? { photo_url: d.photo_url || null, pieces: Array.isArray(d.pieces) ? d.pieces : [], booking: d.booking || null } : 'error' }));
    } catch {
      setTablePieces((t) => ({ ...t, [code]: 'error' }));
    }
  };
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [newSinceLoad, setNewSinceLoad] = useState<Booking[]>([]);
  // Daisy: "don't need qr it's not at all good."
  //
  // So the card IS the chalk tag, printed. Same four facts the board
  // carries and the photo already reads off it -- name, painted, due,
  // table -- but set in type instead of chalk. Printed text reads far
  // more reliably than handwriting, so this should push the 91% match
  // rate up rather than cost anything.
  //
  // Nothing machine readable on it. The board was never scanned either.
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [collectDate, setCollectDate] = useState<string | null>(null);
  // The chalk tag carries the collection date, so the printed card has to
  // as well -- otherwise it is a prettier card that does less.
  const [collectionDate, setCollectionDate] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/studio/collection-date`)
      .then((r) => r.json())
      .then((d) => setCollectDate(d?.current_collection_date || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/studio/collection-date`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setCollectionDate(d.collection_date || null))
      .catch(() => {});
  }, []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Arriving from a booking: open that booking's day and preselect only
  // its card. Every booking already HAS a card -- the QR on it points
  // straight back at the booking -- so the card is really just the
  // booking's printed form. Reaching it from the booking, rather than
  // hunting a day-long list for the right name, is the way round that
  // matches how the job is actually done.
  const searchParams = useSearchParams();
  const linkedCode = searchParams.get('code');
  const linkedDate = searchParams.get('date');
  const [cardDate, setCardDate] = useState(() => linkedDate || new Date().toISOString().slice(0, 10));
  const cardDateRef = useRef(cardDate);
  const knownCodes = useRef<Set<string>>(new Set());
  const firstLoadDone = useRef(false);
  const [selectedSessionIdx, setSelectedSessionIdx] = useState<number | null>(null);

  useEffect(() => { cardDateRef.current = cardDate; }, [cardDate]);

  // Coming back: reopen the card that was open, on its day, scrolled to.
  const restoreCode = useRef<string | null>(null);
  useEffect(() => {
    if (linkedCode) return;
    try {
      const raw = sessionStorage.getItem('glazeup_open_card');
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved?.code || Date.now() - (saved.at || 0) > 2 * 60 * 60 * 1000) {
        sessionStorage.removeItem('glazeup_open_card');
        return;
      }
      restoreCode.current = saved.code;
      if (saved.date && saved.date !== cardDateRef.current) setCardDate(saved.date);
    } catch { /* nothing remembered */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const code = restoreCode.current;
    if (!code || !bookings.some((b) => b.booking_code === code)) return;
    restoreCode.current = null;
    openCard(code);
    // After the open card has laid out, bring it into view.
    setTimeout(() => {
      document.getElementById(`card-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings]);

  const preselected = useRef(false);
  useEffect(() => {
    if (!linkedCode || preselected.current || !bookings.length) return;
    if (!bookings.some((b) => b.booking_code === linkedCode)) return;
    preselected.current = true;
    setSelected(new Set([linkedCode]));
  }, [linkedCode, bookings]);
  // Reset the session filter whenever the day changes -- a session index
  // from a different day (e.g. its 3rd Saturday slot) means nothing once
  // you've moved to a day with only 2 sessions.
  useEffect(() => { setSelectedSessionIdx(null); }, [cardDate]);

  // Set/change the table a booking's card gets placed on. Same real
  // endpoint the Bookings page already uses (POST .../table-number) --
  // this is the point staff actually decide the table (reading the setup
  // flags, checking which tables have room for a pram etc.), and the same
  // control covers moving a booking to a different table later if the
  const load = useCallback(async (isFirstLoad: boolean) => {
    try {
      setError(null);
      
      // Real fix -- per Daisy: "have it thinking automatically... every
      // time you open the app, it's fresh." This used to skip the real
      // sync specifically on first/automatic load, only running it when
      // someone manually tapped "Check for new bookings now" -- meaning
      // just opening this page never actually synced anything on its
      // own. Now syncs every single load, first or not. The isFirstLoad
      // distinction below (known-codes tracking vs "what's new" diffing)
      // is untouched -- still correct either way.
      try {
        const syncRes = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/bookings/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        // Real, visible error instead of a silent console.warn --
        // exactly the class of thing that hid the real cause here:
        // this page's own sync could have been failing with a genuine
        // Square error (permission scope, expired token, etc.) with
        // zero visible sign anything was wrong.
        if (!syncRes.ok) {
          const body = await syncRes.json().catch(() => ({}));
          setSyncError(`Booking sync failed: ${body.error || `HTTP ${syncRes.status}`}`);
        } else {
          setSyncError(null);
        }
      } catch (e: any) {
        setSyncError(e?.name === 'AbortError' ? 'Booking sync timed out.' : `Could not reach the sync: ${e?.message || e}`);
      }
      
      // Fetch bookings for the selected date
      const dateStr = cardDateRef.current;
      const res = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`);
      const data = res.ok ? await res.json() : [];
      const dayStr = new Date(dateStr).toDateString();
      const today = (Array.isArray(data) ? data : [])
        .filter((b: Booking) => new Date(b.session_start).toDateString() === dayStr)
        .sort((a: Booking, b: Booking) => new Date(a.session_start).getTime() - new Date(b.session_start).getTime());

      if (isFirstLoad) {
        knownCodes.current = new Set(today.map((b: Booking) => b.booking_code));
        setBookings(today);
      } else {
        const fresh = today.filter((b: Booking) => !knownCodes.current.has(b.booking_code));
        if (fresh.length > 0) {
          setNewSinceLoad((prev) => {
            const codes = new Set(prev.map((p) => p.booking_code));
            return [...prev, ...fresh.filter((f: Booking) => !codes.has(f.booking_code))];
          });
        }
        setBookings(today);
      }

      // [5 Oct] The QR is back, but doing a different job. It is no longer
      // the way the card is read -- the printed name and dates are, and the
      // photo reads those. This is the fallback for when the OCR cannot,
      // and the quick way in at the shelf and the kiln where there is no
      // table photo to read at all.
      //
      // Small and top left, so it stays out of the way of the card until
      // somebody actually needs it.
      const urls: Record<string, string> = {};
      await Promise.all(
        today.map(async (b: Booking) => {
          urls[b.booking_code] = await QRCode.toDataURL(
            `${window.location.origin}/floor?code=${encodeURIComponent(b.booking_code)}`,
            { margin: 0, width: 160 }
          );
        })
      );
      setQrUrls((prev) => ({ ...prev, ...urls }));
    } catch (e) {
      console.error('Load error:', e);
      setError('Could not load bookings for that day.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setNewSinceLoad([]);
    setLoading(true);
    load(true);
    firstLoadDone.current = true;
    // Real check for new bookings landing after the initial print run --
    // this is the 'update any further ones with an alert' Daisy asked for.
    // Resets whenever the chosen date changes, so 'new since load' always
    // means new for whichever day is currently on screen.
    const t = setInterval(() => load(false), 60000);
    return () => clearInterval(t);
  }, [load, cardDate]);

  const acceptNew = () => {
    setNewSinceLoad([]);
    knownCodes.current = new Set(bookings.map((b) => b.booking_code));
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await load(false);
      setLastSyncTime(new Date());
    } catch (e) {
      console.error('Manual sync failed:', e);
    } finally {
      setSyncing(false);
    }
  };

  const toggleSelect = (bookingCode: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(bookingCode)) {
        next.delete(bookingCode);
      } else {
        next.add(bookingCode);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === visibleBookings.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleBookings.map((b) => b.booking_code)));
    }
  };

  const handlePrintSelected = () => {
    if (selected.size === 0) {
      alert('Please select at least one card to print');
      return;
    }
    window.print();
  };

  // Distinct session start-times present on the selected day, sorted
  // chronologically -- e.g. Main Studio's two (or three, Saturdays)
  // sessions. Prev/Next Session below steps through these, so staff can
  // jump straight to just the next session's cards without hand-picking
  // through a mixed list of the whole day.
  const sessionTimes = useMemo(() => {
    const times = Array.from(new Set(bookings.map((b) => b.session_start)));
    return times.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [bookings]);

  const visibleBookings = useMemo(() => {
    if (selectedSessionIdx === null) return bookings;
    const t = sessionTimes[selectedSessionIdx];
    return t ? bookings.filter((b) => b.session_start === t) : bookings;
  }, [bookings, sessionTimes, selectedSessionIdx]);

  const goToNextSession = () => {
    if (sessionTimes.length === 0) return;
    setSelectedSessionIdx((idx) => (idx === null ? 0 : Math.min(idx + 1, sessionTimes.length - 1)));
  };
  const goToPrevSession = () => {
    setSelectedSessionIdx((idx) => (idx === null || idx === 0 ? null : idx - 1));
  };

  return (
    <PageShell title={new Date(cardDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}>
      <div className="no-print">
        {/* [6 Oct] This is the main screen now. Kept to the day, the
            sessions and the cards; everything else is behind Menu. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setCardDate((d) => new Date(new Date(d).getTime() - 86400000).toISOString().slice(0, 10))}
            aria-label="Previous day"
            style={{ padding: '0.5rem 0.6rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#333', display: 'flex' }}
          >
            <ChevronLeft size={18} />
          </button>
          <input
            type="date"
            value={cardDate}
            onChange={(e) => setCardDate(e.target.value)}
            style={{ padding: '0.5rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: 'var(--text-md)', color: '#333', backgroundColor: 'white' }}
          />
          <button
            onClick={() => setCardDate((d) => new Date(new Date(d).getTime() + 86400000).toISOString().slice(0, 10))}
            aria-label="Next day"
            style={{ padding: '0.5rem 0.6rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#333', display: 'flex' }}
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => setCardDate(new Date().toISOString().slice(0, 10))}
            style={{ padding: '0.5rem 0.8rem', backgroundColor: cardDate === new Date().toISOString().slice(0, 10) ? 'var(--clay)' : '#f0f0f0', color: cardDate === new Date().toISOString().slice(0, 10) ? 'white' : '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: 'var(--text-base)' }}
          >
            Today
          </button>
          <button
            onClick={() => router.push('/menu')}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.8rem', backgroundColor: 'white', border: '1px solid var(--clay)', borderRadius: '6px', cursor: 'pointer', color: 'var(--clay)', fontWeight: 700, fontSize: 'var(--text-sm)' }}
          >
            <LayoutGrid size={15} /> Menu
          </button>
        </div>

        {sessionTimes.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <button
              onClick={goToPrevSession}
              disabled={selectedSessionIdx === null}
              style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', cursor: selectedSessionIdx === null ? 'default' : 'pointer', fontSize: 'var(--text-base)', opacity: selectedSessionIdx === null ? 0.5 : 1 }}
            >
              ← Previous session
            </button>
            <span style={{ padding: '0.4rem 0.7rem', fontSize: 'var(--text-base)', color: '#666', fontWeight: 600 }}>
              {selectedSessionIdx === null
                ? `All sessions (${sessionTimes.length})`
                : new Date(sessionTimes[selectedSessionIdx]).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              onClick={goToNextSession}
              disabled={selectedSessionIdx !== null && selectedSessionIdx === sessionTimes.length - 1}
              style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', cursor: (selectedSessionIdx !== null && selectedSessionIdx === sessionTimes.length - 1) ? 'default' : 'pointer', fontSize: 'var(--text-base)', opacity: (selectedSessionIdx !== null && selectedSessionIdx === sessionTimes.length - 1) ? 0.5 : 1 }}
            >
              Next session →
            </button>
          </div>
        )}

        {loading && <p style={{ color: '#666' }}>Loading...</p>}
        {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}
        {syncError && <div style={{ padding: '1rem', backgroundColor: '#5a2a2a', color: '#ffcccc', borderRadius: '4px', marginBottom: '1rem' }}>{syncError}</div>}

        {newSinceLoad.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.9rem', backgroundColor: '#fdf6e3', border: '1px solid #e0a020', borderRadius: '8px', marginBottom: '1.25rem' }}>
            <AlertCircle size={18} color="#e0a020" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: 600, fontSize: 'var(--text-md)' }}>
                {newSinceLoad.length} new booking{newSinceLoad.length === 1 ? '' : 's'} since you loaded this page
              </p>
              <p style={{ fontSize: 'var(--text-sm)', color: '#666', marginTop: '0.2rem' }}>
                {newSinceLoad.map((b) => b.customer_name).join(', ')} — marked below, print those too.
              </p>
            </div>
            <button onClick={acceptNew} style={{ background: 'none', border: 'none', color: '#e0a020', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Dismiss
            </button>
          </div>
        )}

        {!loading && bookings.length === 0 && (
          <EmptyState
            icon={<CalendarDays size={24} />}
            title="No bookings that day"
            hint={`Nothing is booked for ${new Date(cardDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}. Try another date, or check Square if you were expecting some.`}
          />
        )}

        {bookings.length > 0 && (
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handlePrintSelected}
              disabled={selected.size === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 0.8rem', backgroundColor: selected.size === 0 ? '#ddd' : 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: selected.size === 0 ? 'not-allowed' : 'pointer', fontSize: 'var(--text-sm)', fontWeight: 600 }}
            >
              <Printer size={14} /> Print{selected.size > 0 ? ` (${selected.size})` : ''}
            </button>
            <button
              onClick={selectAll}
              style={{ padding: '0.45rem 0.8rem', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: 'var(--text-sm)' }}
            >
              {selected.size === visibleBookings.length ? 'Deselect all' : 'Select all'}
            </button>
            <button
              onClick={handleManualSync}
              disabled={syncing}
              aria-label="Check for new bookings"
              title={lastSyncTime ? `Last checked ${lastSyncTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : 'Check for new bookings'}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', padding: '0.45rem 0.6rem', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.6 : 1 }}
            >
              <RefreshCw size={15} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        )}
      </div>

      <div className="card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
        {visibleBookings.map((b) => {
          const isNew = newSinceLoad.some((n) => n.booking_code === b.booking_code);
          const isSelected = selected.has(b.booking_code);
          const setupFlags = tableSetupFlags(b.notes);
          return (
            <div
              key={b.booking_code}
              id={`card-${b.booking_code}`}
              className="print-card"
              data-selected={isSelected ? "true" : "false"}
              style={{
                padding: '0', 
                borderRadius: '2px', 
                /* [5 Oct] The checkbox is gone. The whole card has always
                   been clickable, and a selected card already turns clay
                   bordered and tinted -- the box was belt and braces on
                   something that already said it clearly, and it had
                   nowhere left to sit without landing on the QR or the
                   table circle. */
                backgroundColor: isSelected ? 'var(--clay-light, #f5e6d3)' : 'white', 
                textAlign: 'center',
                border: isNew ? '2px solid #e0a020' : isSelected ? '2px solid var(--clay)' : '1px solid #ddd',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative',
                gridColumn: openCode === b.booking_code ? '1 / -1' : undefined,
                // Clears the dark header bar when scrolled back to.
                scrollMarginTop: 90,
              }}
              onClick={() => toggleSelect(b.booking_code)}
            >
              {isNew && <p style={{ fontSize: 'var(--text-xs)', color: '#e0a020', fontWeight: 700, marginBottom: '0.3rem' }}>NEW</p>}
              {(() => {
                const d = new Date(b.session_start);
                const longDate = (x: Date) =>
                  x.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
                return (
                  <div style={{ padding: '1.5rem 1.2rem 1.2rem', textAlign: 'center' }}>
                    {/* The table box sits on its own at the top, out of the
                        way of everything. It was crowding the ready date
                        before, which is the one line a customer reads. */}
                    {/* Code left, table circle right, name below both.
                        Neither one is in the middle, so neither competes
                        with the name. */}
                    <div style={{
                      display: 'flex', alignItems: 'flex-start',
                      justifyContent: 'space-between', gap: '0.8rem',
                      marginBottom: '1.1rem',
                    }}>
                      {qrUrls[b.booking_code] ? (
                        <img
                          src={qrUrls[b.booking_code]}
                          alt=""
                          style={{ width: 38, height: 38, flexShrink: 0, opacity: .72 }}
                        />
                      ) : <span style={{ width: 38 }} />}
                      {/* The word next to the circle, so nobody has to
                          work out what the empty ring is for. Printed
                          small and pale -- it is an instruction to staff,
                          not part of the card's face. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                        <span style={{
                          fontSize: '0.58rem', letterSpacing: '.1em',
                          textTransform: 'uppercase', color: '#C4B8AD', fontWeight: 600,
                        }}>
                          Table
                        </span>
                        <div style={{
                          width: 46, height: 46, flexShrink: 0,
                          border: '1px solid #D8CBBC', borderRadius: '50%',
                        }} />
                      </div>
                    </div>

                    <p style={{
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      fontSize: '1.7rem', lineHeight: 1.15, color: 'var(--charcoal)',
                      margin: 0,
                    }}>
                      {b.customer_name}
                    </p>

                    <div style={{
                      width: 26, height: 1, backgroundColor: 'var(--clay)',
                      opacity: .5, margin: '.9rem auto',
                    }} />

                    {/* Painted, then ready. Said in words rather than
                        slashes -- this is the bit they take home. */}
                    <p style={{
                      fontSize: '0.72rem', letterSpacing: '.14em', textTransform: 'uppercase',
                      color: '#9B8C85', margin: 0, lineHeight: 1.9,
                    }}>
                      Painted {longDate(d)} · {d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p style={{
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      fontSize: '1rem', color: 'var(--clay)', margin: '.15rem 0 0',
                    }}>
                      Ready {collectDate ? longDate(new Date(collectDate)) : 'in about three weeks'}
                    </p>

                    {/* Said to the customer, not about them. A number on its
                        own ("visit 7") reads like a loyalty scheme; this
                        reads like somebody noticed. */}
                    <p style={{
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      fontSize: '0.85rem', fontStyle: 'italic', color: '#8A7F74',
                      margin: '1.1rem 0 0', lineHeight: 1.5,
                    }}>
                      {(b.previous_visits || 0) === 0
                        ? 'Welcome to The Kiln Cafe. Enjoy your painting.'
                        : (b.previous_visits || 0) >= 5
                          ? `Lovely to see you again \u2014 that\u2019s visit number ${b.visit_number}.`
                          : 'Welcome back. Enjoy your painting.'}
                    </p>

                    {/* For whoever seats them. Printed small, but printed:
                        finding out at collection that something of theirs is
                        on the returns shelf is the worst time to find out. */}
                    {/* Always printed, either way. A line that only appears
                        when there is something to say is ambiguous: staff
                        cannot tell a clean booking from one the check never
                        ran on. Explicitly saying "none" is the whole value
                        of a check. */}
                    {(() => {
                      const r = b.returns_waiting;
                      const has = !!(r && r.length);
                      return (
                        <p style={{
                          fontSize: '0.62rem', margin: '.7rem 0 0',
                          letterSpacing: '.04em', fontWeight: 600,
                          color: has ? '#A8651A' : '#C4B8AD',
                        }}>
                          {has
                            ? `${r!.length} to finish, on the returns shelf`
                            : '\u2713 nothing on the returns shelf'}
                        </p>
                      );
                    })()}

                    {/* The pieces themselves, as they looked the day they
                        were painted. Stood at the shelf a name is not much
                        help -- there are four white mugs on it. The picture
                        is the only thing that identifies one. */}
                    {!!(b.returns_waiting && b.returns_waiting.length) && (
                      <div style={{
                        display: 'flex', gap: '0.4rem', justifyContent: 'center',
                        flexWrap: 'wrap', marginTop: '0.45rem',
                      }}>
                        {b.returns_waiting.map((r, i) => (
                          <div
                            key={i}
                            style={{ textAlign: 'center', maxWidth: 62, cursor: 'zoom-in' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewer({
                                title: `${b.customer_name} · returns shelf`,
                                start: i,
                                pieces: (b.returns_waiting || []).map((x) => ({ photo: x.photo, box: x.box, piece_type: x.piece_type, note: x.reason })),
                              });
                            }}
                          >
                            <PieceThumb url={r.photo} box={r.box} size={40} ring="#A8651A" />
                            <p style={{
                              fontSize: '0.52rem', color: '#A8651A', lineHeight: 1.25,
                              margin: '0.15rem 0 0', fontWeight: 600,
                            }}>
                              {r.piece_type}
                              {r.reason ? <><br /><span style={{ color: '#B9ADA0', fontWeight: 500 }}>{r.reason}</span></> : null}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              <p style={{ fontWeight: 700, fontSize: 'var(--text-md)', marginTop: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                {/* Same real photo indicator as the bookings list -- at end
                    of day this is how a missed table gets spotted without
                    opening every booking. Hidden when printing: a status
                    dot on a customer's card would be meaningless to them. */}
                {(b.photo_count ?? 0) > 0 && (
                  <span
                    className="no-print"
                    title={`${b.photo_count} piece${b.photo_count === 1 ? '' : 's'} photographed`}
                    style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#1a8a3c', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--text-xs)', fontWeight: 700 }}
                  >
                    {b.photo_count}
                  </span>
                )}
              </p>

              {b.party_size && (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--clay)', fontWeight: 600, marginTop: '0.35rem' }}>
                  {b.party_size} seat{b.party_size === 1 ? '' : 's'}
                </p>
              )}
              {setupFlags.length > 0 && (
                <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                  {setupFlags.map((flag) => (
                    <span
                      key={flag}
                      style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: '#8a5a00', backgroundColor: '#fff4d6', border: '1px solid #e0c060', borderRadius: 999, padding: '0.15rem 0.55rem' }}
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              )}
              {b.notes && (
                <p style={{ fontSize: 'var(--text-xs)', color: '#8a5a00', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: 'var(--radius-sm)', padding: '0.35rem 0.5rem', marginTop: '0.4rem', textAlign: 'left' }}>
                  {b.notes}
                </p>
              )}
              {/* Open the card: the saved table photo, every piece numbered,
                  and the next things to do. Screen only, never printed. */}
              <div className="no-print" style={{ padding: '0 1rem 1rem' }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => openCard(b.booking_code)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.6rem', padding: '0.4rem 0.9rem', borderRadius: 999, border: '1px solid var(--clay)', background: openCode === b.booking_code ? 'var(--clay)' : 'transparent', color: openCode === b.booking_code ? 'white' : 'var(--clay)', fontWeight: 700, fontSize: 'var(--text-sm)' }}
                >
                  {openCode === b.booking_code ? <>Close <ChevronUp size={15} /></> : <>Open <ChevronDown size={15} /></>}
                </button>

                {openCode === b.booking_code && (() => {
                  const tp = tablePieces[b.booking_code];
                  if (tp === 'loading' || tp === undefined) {
                    return <p style={{ marginTop: '0.8rem', color: 'var(--stone)', fontSize: 'var(--text-sm)', display: 'flex', gap: '0.4rem', justifyContent: 'center', alignItems: 'center' }}><Loader size={14} className="animate-spin" /> Loading the table</p>;
                  }
                  if (tp === 'error') {
                    return <p style={{ marginTop: '0.8rem', color: '#c0392b', fontSize: 'var(--text-sm)' }}>Could not load this table. Close and open again.</p>;
                  }
                  const viewerPieces: ViewerPiece[] = tp.pieces.map((p: any) => ({
                    photo: p.reference_photo_url || null,
                    box: p.photo_box || null,
                    piece_type: p.piece_type,
                    description: p.description,
                    note: p.returned_at ? (p.return_reason || 'Coming back to finish') : (p.stage || null),
                  }));
                  const show = (k: number) => setViewer({ title: b.customer_name, start: k, pieces: viewerPieces });
                  const bk = tp.booking;
                  return (
                    <div style={{ marginTop: '0.9rem', textAlign: 'left' }}>
                      {bk && (bk.collected_at || bk.collection_date) && (
                        <p style={{ textAlign: 'center', fontSize: 'var(--text-sm)', fontWeight: 600, color: bk.collected_at ? '#3d7a4a' : 'var(--clay)', marginBottom: '0.6rem' }}>
                          {bk.collected_at
                            ? 'Collected'
                            : `${bk.fulfilment_method === 'postal' ? 'Posting' : 'Collecting'} ${new Date(bk.collection_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`}
                        </p>
                      )}
                      {tp.photo_url ? (
                        <div style={{ borderRadius: 6, overflow: 'hidden', maxWidth: 640, margin: '0 auto' }}>
                          <PhotoWithBoxes
                            src={tp.photo_url}
                            pieces={tp.pieces.map((p: any, k: number) => ({ index: k + 1, piece_type: p.piece_type, box: p.reference_photo_url === tp.photo_url ? p.photo_box : null }))}
                            onPick={show}
                          />
                        </div>
                      ) : (
                        <p style={{ color: 'var(--stone)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>Not photographed yet.</p>
                      )}
                      {tp.pieces.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginTop: '0.8rem', justifyContent: 'center' }}>
                          {tp.pieces.map((p: any, k: number) => (
                            <button key={p.id} onClick={() => show(k)} style={{ background: 'none', border: 'none', padding: 0, width: 84, textAlign: 'center', cursor: 'zoom-in' }}>
                              <PieceThumb url={p.reference_photo_url} box={p.photo_box} size={72} ring={p.returned_at ? '#A8651A' : undefined} />
                              <span style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, marginTop: '0.2rem', color: 'var(--charcoal)', textTransform: 'capitalize' }}>{k + 1}. {p.piece_type || 'Piece'}</span>
                              {p.stage && <span style={{ display: 'block', fontSize: '0.65rem', lineHeight: 1.25, color: p.returned_at ? '#A8651A' : 'var(--stone)', fontWeight: 600 }}>{p.returned_at ? 'to finish' : p.stage}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button onClick={() => router.push(`/floor?code=${encodeURIComponent(b.booking_code)}&from=card`)} style={actionBtn(true)}>
                          <Camera size={16} /> {tp.photo_url ? 'Table photo & returns' : 'Photograph the table'}
                        </button>
                        <button onClick={() => router.push(`/collection?code=${encodeURIComponent(b.booking_code)}&from=card`)} style={actionBtn(false)}>
                          <Printer size={16} /> Collection card
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* The reference is for us, not for them. A plain card has
                  nothing on it a customer would not want on their table. */}

            </div>
          );
        })}
      </div>

      {viewer && <PieceViewer pieces={viewer.pieces} start={viewer.start} title={viewer.title} onClose={() => setViewer(null)} />}

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .card-grid > div:not([data-selected="true"]) {
          display: block;
        }
        
        @media print {
          /* .no-print's own display:none rule now lives in globals.css,
             genuinely global rather than page-scoped -- see the fix
             there for why (AppShell/PinGate chrome wasn't being hidden
             at all). Kept here: only what's specific to this page. */
          
          /* Hide unselected cards during print */
          .card-grid > div:not([data-selected="true"]) {
            display: none !important;
          }
          
          /* Real 4x6in label stock, confirmed directly against the actual
             Zebra label roll loaded (previously assumed 3x2in, which never
             matched the real hardware -- that mismatch is what caused
             printing to fail across every device type, not just one
             platform). One label per page -- a label printer feeds one at
             a time, it doesn't print a multi-up sheet like a normal
             printer does, so the on-screen grid is replaced here rather
             than just scaled down. The on-screen card is already a
             natural vertical stack (QR, then name, then details) which
             suits a tall 4x6 label directly -- no longer forcing the
             cramped horizontal layout the old 3x2 size needed. */
          @page { size: 4in 6in; margin: 0.15in; }
          .card-grid { display: block !important; }
          .print-card {
            width: 3.7in;
            height: 5.7in;
            page-break-after: always;
            break-after: page;
            border-radius: 0 !important;
            border: none !important;
            background: white !important;
            display: block !important;
            text-align: center !important;
            padding: 0.2in !important;
          }
          /* [5 Oct] This forced EVERY image on the card to 2.2in, from when
             the QR was the centrepiece. The QR is now a 38px fallback in
             the corner, so on paper it was blowing up to 2.2in and landing
             on top of the table circle. Sized to match the screen instead. */
          .print-card img { width: 0.42in !important; height: 0.42in !important; margin: 0 !important; display: block !important; }

          /* The return thumbnails crop with a background-image rather than
             an <img>, which is why the rule above does not squash them --
             but browsers drop background images when printing unless told
             otherwise. Without this the pieces print as empty boxes, which
             is worse than not printing them at all. */
          .print-card * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print-card p { margin: 0 0 0.1in !important; line-height: 1.3; }
        }
      `}</style>
    </PageShell>
  );
}

function actionBtn(primary: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.6rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 700,
    fontSize: 'var(--text-sm)',
    border: primary ? 'none' : '1px solid var(--clay)',
    background: primary ? 'var(--clay)' : 'white',
    color: primary ? 'white' : 'var(--clay)',
  };
}
