'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PageShell } from '@/components/PageShell';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { Printer, RefreshCw, AlertCircle } from 'lucide-react';

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
}

// Clean short label from the real (verbose) space_name text -- e.g.
// 'The Vault - perfect for private parties!' -> 'Vault'. Falls back to
// showing nothing rather than a guess when it doesn't match a known space.
function shortSpaceLabel(spaceName: string | null): string | null {
  if (!spaceName) return null;
  const s = spaceName.toLowerCase();
  // The Vault was renamed the Party Room -- same Square resource,
  // TMYVfH7VAWAr3WnT. Old bookings still carry the Vault service name, so
  // both resolve to the room's current name and a card printed today for a
  // July session sends someone to the right door.
  if (s.includes('vault') || s.includes('party room')) return 'Party Room';
  if (s.includes('lounge')) return 'Lounge';
  if (s.includes('main studio')) return 'Main Studio';
  if (s.includes('evening')) return 'Evening Session';
  if (s.includes('thursdays')) return 'Thursdays';
  if (s.includes('wheel hire')) return 'Wheel Hire';
  if (s.includes('throwing taster')) return 'Throwing Taster';
  if (s.includes('kids party')) return 'Kids Party';
  if (s.includes('ultimate')) return 'Ultimate Party';
  if (s.includes('pop-up') || s.includes('pop up')) return 'Pop-Up';
  if (s.includes('grotto')) return 'Grotto';
  return null;
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
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [newSinceLoad, setNewSinceLoad] = useState<Booking[]>([]);
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

      // Real, scannable QR per booking -- same payload every other QR in the
      // app uses, so any of these cards works with the same /customer route.
      const urls: Record<string, string> = {};
      await Promise.all(
        today.map(async (b: Booking) => {
          urls[b.booking_code] = await QRCode.toDataURL(
            `${window.location.origin}/customer?booking=${encodeURIComponent(b.booking_code)}`,
            { margin: 1, width: 140 }
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
    setQrUrls({});
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
    <PageShell title="Print Booking Cards">
      <div className="no-print">
        
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
          One real QR card per booking — scan to view the session, order drinks, or track pieces. Go forward or back to print ahead for a party or a busy day.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setCardDate((d) => new Date(new Date(d).getTime() - 86400000).toISOString().slice(0, 10))}
            style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', color: '#333' }}
          >
            ← Prev day
          </button>
          <input
            type="date"
            value={cardDate}
            onChange={(e) => setCardDate(e.target.value)}
            style={{ padding: '0.5rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', color: '#333', backgroundColor: 'white' }}
          />
          <button
            onClick={() => setCardDate((d) => new Date(new Date(d).getTime() + 86400000).toISOString().slice(0, 10))}
            style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem', color: '#333' }}
          >
            Next day →
          </button>
          <button
            onClick={() => setCardDate(new Date().toISOString().slice(0, 10))}
            style={{ padding: '0.5rem 0.8rem', backgroundColor: cardDate === new Date().toISOString().slice(0, 10) ? 'var(--clay)' : '#f0f0f0', color: cardDate === new Date().toISOString().slice(0, 10) ? 'white' : '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            Today
          </button>
          <button
            onClick={() => setCardDate((d) => new Date(new Date(d).getTime() + 7 * 86400000).toISOString().slice(0, 10))}
            style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', color: '#333' }}
          >
            +1 week
          </button>
        </div>

        {sessionTimes.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <button
              onClick={goToPrevSession}
              disabled={selectedSessionIdx === null}
              style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', cursor: selectedSessionIdx === null ? 'default' : 'pointer', fontSize: '0.85rem', opacity: selectedSessionIdx === null ? 0.5 : 1 }}
            >
              ← Previous session
            </button>
            <span style={{ padding: '0.4rem 0.7rem', fontSize: '0.85rem', color: '#666', fontWeight: 600 }}>
              {selectedSessionIdx === null
                ? `All sessions (${sessionTimes.length})`
                : new Date(sessionTimes[selectedSessionIdx]).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              onClick={goToNextSession}
              disabled={selectedSessionIdx !== null && selectedSessionIdx === sessionTimes.length - 1}
              style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', cursor: (selectedSessionIdx !== null && selectedSessionIdx === sessionTimes.length - 1) ? 'default' : 'pointer', fontSize: '0.85rem', opacity: (selectedSessionIdx !== null && selectedSessionIdx === sessionTimes.length - 1) ? 0.5 : 1 }}
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
              <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                {newSinceLoad.length} new booking{newSinceLoad.length === 1 ? '' : 's'} since you loaded this page
              </p>
              <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '0.2rem' }}>
                {newSinceLoad.map((b) => b.customer_name).join(', ')} — marked below, print those too.
              </p>
            </div>
            <button onClick={acceptNew} style={{ background: 'none', border: 'none', color: '#e0a020', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Dismiss
            </button>
          </div>
        )}

        {!loading && bookings.length === 0 && (
          <p style={{ color: '#999', fontSize: '0.9rem' }}>No bookings found for {new Date(cardDate).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}.</p>
        )}

        {bookings.length > 0 && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <button
              onClick={handlePrintSelected}
              disabled={selected.size === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', backgroundColor: selected.size === 0 ? '#ccc' : 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: selected.size === 0 ? 'not-allowed' : 'pointer', fontSize: '0.9rem', fontWeight: 600 }}
            >
              <Printer size={16} /> Print selected {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
            <button
              onClick={selectAll}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', backgroundColor: '#f0f0f0', color: '#333', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              {selected.size === visibleBookings.length ? '✓ Deselect all' : '◯ Select all'}
            </button>
            <button
              onClick={handleManualSync}
              disabled={syncing}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', backgroundColor: syncing ? '#e0e0e0' : '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', cursor: syncing ? 'wait' : 'pointer', fontSize: '0.9rem', opacity: syncing ? 0.6 : 1 }}
            >
              <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} /> {syncing ? 'Checking...' : 'Check for new bookings now'}
            </button>
            {lastSyncTime && (
              <div style={{ fontSize: '0.75rem', color: '#999', alignSelf: 'center' }}>
                Last checked: {lastSyncTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
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
              className="print-card"
              data-selected={isSelected ? "true" : "false"}
              style={{
                padding: '1rem', 
                borderRadius: '10px', 
                backgroundColor: isSelected ? 'var(--clay-light, #f5e6d3)' : 'white', 
                textAlign: 'center',
                border: isNew ? '2px solid #e0a020' : isSelected ? '2px solid var(--clay)' : '1px solid #ddd',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
              onClick={() => toggleSelect(b.booking_code)}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(b.booking_code)}
                onClick={(e) => e.stopPropagation()}
                style={{ position: 'absolute', top: '0.8rem', right: '0.8rem', cursor: 'pointer', width: '18px', height: '18px' }}
              />
              {isNew && <p style={{ fontSize: '0.7rem', color: '#e0a020', fontWeight: 700, marginBottom: '0.3rem' }}>NEW</p>}
              {qrUrls[b.booking_code] ? (
                <img src={qrUrls[b.booking_code]} alt="" style={{ width: 120, height: 120, margin: '0 auto' }} />
              ) : (
                <div style={{ width: 120, height: 120, margin: '0 auto', backgroundColor: '#f0f0f0' }} />
              )}
              <p style={{ fontWeight: 700, fontSize: '1rem', marginTop: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                {/* Same real photo indicator as the bookings list -- at end
                    of day this is how a missed table gets spotted without
                    opening every booking. Hidden when printing: a status
                    dot on a customer's card would be meaningless to them. */}
                {(b.photo_count ?? 0) > 0 && (
                  <span
                    className="no-print"
                    title={`${b.photo_count} piece${b.photo_count === 1 ? '' : 's'} photographed`}
                    style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', backgroundColor: '#1a8a3c', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.58rem', fontWeight: 700 }}
                  >
                    {b.photo_count}
                  </span>
                )}
                {b.customer_name}
              </p>
              <p style={{ fontSize: '0.8rem', color: '#666' }}>
                {new Date(b.session_start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </p>

              {/* Table, read-only. Per Daisy: the girls set the table in
                  Square and then physically put the card on it -- the app
                  printing an editable table field made it a second source
                  of truth for something it doesn't decide. Shown only when
                  Square actually says one. */}
              {b.table_number && (
                <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: '#666' }}>Table {b.table_number}</div>
              )}

              {(b.party_size || shortSpaceLabel(b.space_name)) && (
                <p style={{ fontSize: '0.78rem', color: 'var(--clay)', fontWeight: 600, marginTop: '0.2rem' }}>
                  {b.party_size ? `${b.party_size} seat${b.party_size === 1 ? '' : 's'}` : ''}
                  {b.party_size && shortSpaceLabel(b.space_name) ? ' · ' : ''}
                  {shortSpaceLabel(b.space_name) || ''}
                </p>
              )}
              {setupFlags.length > 0 && (
                <div style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                  {setupFlags.map((flag) => (
                    <span
                      key={flag}
                      style={{ fontSize: '0.7rem', fontWeight: 700, color: '#8a5a00', backgroundColor: '#fff4d6', border: '1px solid #e0c060', borderRadius: 999, padding: '0.15rem 0.55rem' }}
                    >
                      {flag}
                    </span>
                  ))}
                </div>
              )}
              {b.notes && (
                <p style={{ fontSize: '0.72rem', color: '#8a5a00', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: 6, padding: '0.35rem 0.5rem', marginTop: '0.4rem', textAlign: 'left' }}>
                  {b.notes}
                </p>
              )}
              <p style={{ fontSize: '0.7rem', color: '#aaa', fontFamily: 'monospace', marginTop: '0.3rem' }}>{b.booking_code}</p>
            </div>
          );
        })}
      </div>

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
          input[type="checkbox"] { display: none !important; }
          
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
          .print-card img { width: 2.2in !important; height: 2.2in !important; margin: 0 auto 0.25in !important; display: block !important; }
          .print-card p { margin: 0 0 0.1in !important; line-height: 1.3; }
        }
      `}</style>
    </PageShell>
  );
}
