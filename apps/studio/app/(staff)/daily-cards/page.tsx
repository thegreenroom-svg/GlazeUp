'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { Printer, RefreshCw, AlertCircle } from 'lucide-react';

interface Booking {
  booking_code: string;
  customer_name: string;
  session_start: string;
  table_number: string | null;
  party_size: number | null;
  space_name: string | null;
  notes: string | null;
}

// Clean short label from the real (verbose) space_name text -- e.g.
// 'The Vault - perfect for private parties!' -> 'Vault'. Falls back to
// showing nothing rather than a guess when it doesn't match a known space.
function shortSpaceLabel(spaceName: string | null): string | null {
  if (!spaceName) return null;
  const s = spaceName.toLowerCase();
  if (s.includes('vault')) return 'Vault';
  if (s.includes('lounge')) return 'Lounge';
  if (s.includes('main studio')) return 'Main Studio';
  if (s.includes('evening')) return 'Evening Session';
  if (s.includes('thursdays')) return 'Thursdays';
  if (s.includes('wheel hire')) return 'Wheel Hire';
  if (s.includes('throwing taster')) return 'Throwing Taster';
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
  const [newSinceLoad, setNewSinceLoad] = useState<Booking[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cardDate, setCardDate] = useState(() => new Date().toISOString().slice(0, 10));
  const cardDateRef = useRef(cardDate);
  const knownCodes = useRef<Set<string>>(new Set());
  const firstLoadDone = useRef(false);
  const [editingTableCode, setEditingTableCode] = useState<string | null>(null);
  const [tableDraft, setTableDraft] = useState('');
  const [savingTableCode, setSavingTableCode] = useState<string | null>(null);
  const [selectedSessionIdx, setSelectedSessionIdx] = useState<number | null>(null);

  useEffect(() => { cardDateRef.current = cardDate; }, [cardDate]);
  // Reset the session filter whenever the day changes -- a session index
  // from a different day (e.g. its 3rd Saturday slot) means nothing once
  // you've moved to a day with only 2 sessions.
  useEffect(() => { setSelectedSessionIdx(null); }, [cardDate]);

  // Set/change the table a booking's card gets placed on. Same real
  // endpoint the Bookings page already uses (POST .../table-number) --
  // this is the point staff actually decide the table (reading the setup
  // flags, checking which tables have room for a pram etc.), and the same
  // control covers moving a booking to a different table later if the
  // party changes -- one place, always reachable from the card itself.
  const saveTableNumber = async (bookingCode: string) => {
    const value = tableDraft.trim();
    if (!value) return;
    setSavingTableCode(bookingCode);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${bookingCode}/table-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: value }),
      });
      if (!res.ok) throw new Error();
      setBookings((prev) => prev.map((b) => (b.booking_code === bookingCode ? { ...b, table_number: value } : b)));
      setEditingTableCode(null);
    } catch {
      setError('Could not save table number.');
    } finally {
      setSavingTableCode(null);
    }
  };

  const load = useCallback(async (isFirstLoad: boolean) => {
    try {
      setError(null);
      
      // Trigger a Square sync first (only on manual refresh, not on auto-check)
      if (!isFirstLoad) {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookings/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (e) {
          // Sync may fail if Square isn't connected, but we'll still try to fetch what we have
          console.warn('Square sync failed:', e);
        }
      }
      
      // Fetch bookings for the selected date
      const dateStr = cardDateRef.current;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`);
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '900px' }}>
      <div className="no-print">
        <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Print Booking Cards</h1>
        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1rem' }}>
          One real QR card per booking — scan to view the session, order drinks, or track pieces. Go forward or back to print ahead for a party or a busy day.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setCardDate((d) => new Date(new Date(d).getTime() - 86400000).toISOString().slice(0, 10))}
            style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            ← Prev day
          </button>
          <input
            type="date"
            value={cardDate}
            onChange={(e) => setCardDate(e.target.value)}
            style={{ padding: '0.5rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem' }}
          />
          <button
            onClick={() => setCardDate((d) => new Date(new Date(d).getTime() + 86400000).toISOString().slice(0, 10))}
            style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}
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
            style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            +1 week
          </button>
        </div>

        {sessionTimes.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <button
              onClick={goToPrevSession}
              disabled={selectedSessionIdx === null}
              style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: selectedSessionIdx === null ? 'default' : 'pointer', fontSize: '0.85rem', opacity: selectedSessionIdx === null ? 0.5 : 1 }}
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
              style={{ padding: '0.5rem 0.8rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: (selectedSessionIdx !== null && selectedSessionIdx === sessionTimes.length - 1) ? 'default' : 'pointer', fontSize: '0.85rem', opacity: (selectedSessionIdx !== null && selectedSessionIdx === sessionTimes.length - 1) ? 0.5 : 1 }}
            >
              Next session →
            </button>
          </div>
        )}

        {loading && <p style={{ color: '#666' }}>Loading...</p>}
        {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

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
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', backgroundColor: '#f0f0f0', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              {selected.size === visibleBookings.length ? '✓ Deselect all' : '◯ Select all'}
            </button>
            <button
              onClick={handleManualSync}
              disabled={syncing}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', backgroundColor: syncing ? '#e0e0e0' : '#f0f0f0', border: 'none', borderRadius: '6px', cursor: syncing ? 'wait' : 'pointer', fontSize: '0.9rem', opacity: syncing ? 0.6 : 1 }}
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
          const hasNotes = !!(b.notes && b.notes.trim());
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
              <p style={{ fontWeight: 700, fontSize: '1rem', marginTop: '0.6rem' }}>{b.customer_name}</p>
              <p style={{ fontSize: '0.8rem', color: '#666' }}>
                {new Date(b.session_start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </p>

              {/* Table -- set at print/placement time, or changed later if
                  the party moves. Same real endpoint as the Bookings page. */}
              <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '0.3rem' }}>
                {editingTableCode === b.booking_code ? (
                  <span className="no-print" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <input
                      type="text"
                      value={tableDraft}
                      onChange={(e) => setTableDraft(e.target.value)}
                      placeholder="e.g. 3A"
                      autoFocus
                      maxLength={20}
                      style={{ width: '5rem', padding: '0.2rem 0.35rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.8rem' }}
                    />
                    <button
                      onClick={() => saveTableNumber(b.booking_code)}
                      disabled={savingTableCode === b.booking_code || !tableDraft.trim()}
                      style={{ padding: '0.2rem 0.5rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer' }}
                    >
                      {savingTableCode === b.booking_code ? '...' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingTableCode(null)}
                      style={{ padding: '0.2rem 0.4rem', background: 'none', border: 'none', color: '#999', fontSize: '0.72rem', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => { setTableDraft(b.table_number || ''); setEditingTableCode(b.booking_code); }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.8rem', color: b.table_number ? '#666' : 'var(--clay)', fontWeight: b.table_number ? 400 : 600 }}
                  >
                    {b.table_number ? `Table ${b.table_number}` : 'Set table'}
                    <span className="no-print" style={{ fontSize: '0.65rem', color: '#999' }}>✎</span>
                  </button>
                )}
              </div>

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
              <p style={{ fontSize: '0.72rem', color: hasNotes ? '#8a5a00' : '#aaa', fontWeight: hasNotes ? 700 : 400, marginTop: '0.35rem' }}>
                Notes: {hasNotes ? 'Yes' : 'No'}
              </p>
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
          .no-print { display: none !important; }
          input[type="checkbox"] { display: none !important; }
          
          /* Hide unselected cards during print */
          .card-grid > div:not([data-selected="true"]) {
            display: none !important;
          }
          
          /* Real 3x2in label stock, one label per page -- a label printer
             feeds one at a time, it doesn't print a multi-up sheet like a
             normal printer does, so the on-screen grid is replaced here
             rather than just scaled down. */
          @page { size: 3in 2in; margin: 0.08in; }
          .card-grid { display: block !important; }
          .print-card {
            width: 2.84in;
            height: 1.84in;
            page-break-after: always;
            break-after: page;
            border-radius: 0 !important;
            border: none !important;
            background: white !important;
            display: flex !important;
            align-items: center;
            gap: 0.1in;
            text-align: left !important;
            padding: 0.08in !important;
          }
          .print-card img { width: 1in !important; height: 1in !important; margin: 0 !important; flex-shrink: 0; }
          .print-card p { margin: 0 !important; line-height: 1.25; }
        }
      `}</style>
    </motion.div>
  );
}
