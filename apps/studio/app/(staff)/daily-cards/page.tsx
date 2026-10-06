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

// [6 Oct] Every card says where the booking is and the one thing to do
// next, so nobody needs to know the app's layout -- just the button.
type NextStep = 'arrived' | 'photo' | 'handover' | null;
// A card with no button always says what happens next instead, so nobody
// is left looking at a card wondering where to go.
// fallbackDate is the date the card itself prints as "Ready", used when
// the booking has none of its own saved.
function cardStatus(
  b: { arrived_at?: string | null; collected_at?: string | null; collection_date?: string | null; finished_at?: string | null; photo_count?: number; returns_waiting?: unknown[] },
  fallbackDate?: string | null
): { label: string; colour: string; next: NextStep; hint?: string } {
  const today = new Date().toLocaleDateString('en-CA');
  if (b.collected_at) return { label: 'Collected', colour: '#3d7a4a', next: null, hint: 'All done.' };
  const photos = b.photo_count || 0;
  if (b.finished_at || photos > 0) {
    // Every piece is coming back to finish: nothing to fire, nothing to hand over.
    if (photos > 0 && (b.returns_waiting?.length || 0) >= photos) {
      return { label: 'Coming back to finish', colour: '#A8651A', next: null, hint: 'Nothing to fire. Their pieces wait on the returns shelf until they come back.' };
    }
    const date = (b.collection_date || fallbackDate || '').slice(0, 10);
    if (date && date <= today) return { label: 'Ready to collect', colour: '#b8860b', next: 'handover' };
    return {
      label: 'Photographed', colour: '#4a6a8a', next: null,
      hint: date
        ? `Next: the kiln. Back here to hand over from ${new Date(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}.`
        : 'Next: the kiln. Back here to hand over once it is ready.',
    };
  }
  if (b.arrived_at) return { label: 'Painting', colour: 'var(--clay)', next: 'photo' };
  return { label: 'Booked', colour: '#8a8178', next: 'arrived' };
}

interface Booking {
  arrived_at?: string | null;
  collected_at?: string | null;
  collection_date?: string | null;
  finished_at?: string | null;
  session_end?: string | null;
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
    id?: string;
    own?: boolean;
    from_booking?: string;
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
  // Every booking the feed returned, not just the chosen day's -- the
  // Collecting view needs bookings painted on other days.
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [view, setView] = useState<'painting' | 'collecting'>('painting');
  const [showEarlier, setShowEarlier] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  // The table photo and collection screens open in a sheet over the card.
  const [sheet, setSheet] = useState<{ code: string; src: string; title: string } | null>(null);
  const sheetGuard = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (text: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), 10000);
  };
  // Search, any day.
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[] | null>(null);
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
      setAllBookings(Array.isArray(data) ? data : []);
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
      const collectingToday = (Array.isArray(data) ? data : []).filter(
        (b: Booking) => !b.collected_at && !!b.collection_date && b.collection_date.slice(0, 10) === dateStr
      );
      await Promise.all(
        [...today, ...collectingToday].map(async (b: Booking) => {
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

  // [6 Oct] Daisy: a print button on each card, so one can be printed off
  // on its own without selecting and deselecting the rest. Only that card
  // is marked for the print CSS until the print dialog closes.
  const [printOnly, setPrintOnly] = useState<string | null>(null);

  // [6 Oct] Table number, set by staff by tapping the circle on a card.
  const [editingTable, setEditingTable] = useState<string | null>(null);
  const [tableErr, setTableErr] = useState<string | null>(null);
  const saveTable = async (code: string, value: string) => {
    setEditingTable(null);
    const v = value.trim();
    const before = bookings.find((x) => x.booking_code === code)?.table_number ?? null;
    if ((before || '') === v) return;
    setBookings((bs) => bs.map((x) => (x.booking_code === code ? { ...x, table_number: v || null } : x)));
    try {
      const r = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${encodeURIComponent(code)}/table-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: v || null }),
      });
      if (!r.ok) throw new Error();
      setTableErr(null);
    } catch {
      setBookings((bs) => bs.map((x) => (x.booking_code === code ? { ...x, table_number: before } : x)));
      setTableErr(code);
    }
  };
  const printOne = (code: string) => {
    setPrintOnly(code);
    const done = () => setPrintOnly(null);
    window.addEventListener('afterprint', done, { once: true });
    // Let the marking render before the dialog opens.
    setTimeout(() => window.print(), 80);
    // Safety net if afterprint never fires (some iOS versions).
    setTimeout(done, 60000);
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

  // Collecting: anything due to be picked up on the chosen day, whenever it
  // was painted.
  const collectingList = useMemo(
    () => allBookings
      .filter((b) => !b.collected_at && !!b.collection_date && b.collection_date.slice(0, 10) === cardDate)
      .sort((a, b) => a.customer_name.localeCompare(b.customer_name)),
    [allBookings, cardDate]
  );

  // Today opens at now: earlier sessions that are finished fold away.
  // Anything from earlier still waiting for its table photo stays out,
  // because that is work still to do.
  const isToday = cardDate === new Date().toLocaleDateString('en-CA');
  const isEarlierDone = (b: Booking) => {
    const end = b.session_end ? new Date(b.session_end).getTime() : new Date(b.session_start).getTime() + 2 * 3600000;
    return end < Date.now() && (!!b.finished_at || !!b.collected_at || (b.photo_count || 0) > 0);
  };

  const sessionFiltered = useMemo(() => {
    if (selectedSessionIdx === null) return bookings;
    const t = sessionTimes[selectedSessionIdx];
    return t ? bookings.filter((b) => b.session_start === t) : bookings;
  }, [bookings, sessionTimes, selectedSessionIdx]);
  const earlierDone = isToday && selectedSessionIdx === null ? sessionFiltered.filter(isEarlierDone) : [];
  const visibleBookings = useMemo(() => {
    if (view === 'collecting') return collectingList;
    if (showEarlier || !earlierDone.length) return sessionFiltered;
    const hide = new Set(earlierDone.map((b) => b.booking_code));
    return sessionFiltered.filter((b) => !hide.has(b.booking_code));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, collectingList, sessionFiltered, showEarlier, earlierDone.length]);

  const markArrived = async (b: Booking, arrived: boolean) => {
    const before = b.arrived_at ?? null;
    const set = (v: string | null) => setBookings((bs) => bs.map((x) => (x.booking_code === b.booking_code ? { ...x, arrived_at: v } : x)));
    set(arrived ? new Date().toISOString() : null);
    try {
      const r = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${encodeURIComponent(b.booking_code)}/arrived`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ arrived }),
      });
      if (!r.ok) throw new Error();
      if (arrived) showToast(`${b.customer_name} arrived`, () => markArrived({ ...b, arrived_at: new Date().toISOString() }, false));
    } catch {
      set(before);
      showToast("That didn't save. Try again.");
    }
  };

  // [6 Oct] Daisy: persistent undo where needed. The toast's Undo only
  // lasts seconds; each card also keeps an undo for its last step for as
  // long as that step stands, so a mistake found later is still one tap.
  const markCollected = async (b: Booking, collected: boolean) => {
    try {
      const r = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/collection/collect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_code: b.booking_code, uncollect: !collected }),
      });
      if (!r.ok) throw new Error();
      refreshCard(b.booking_code);
      showToast(collected ? `${b.customer_name} collected` : `${b.customer_name} not collected after all`, () => markCollected(b, !collected));
    } catch {
      showToast("That didn't save. Try again.");
    }
  };
  const fetchReturns = async (b: Booking, ids: string[], undo = false) => {
    try {
      const r = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/returns/fetch${undo ? '/undo' : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_code: b.booking_code, piece_ids: ids }),
      });
      if (!r.ok) throw new Error();
      load(true);
      if (!undo) showToast(`Off the shelf for ${b.customer_name}. They go in today's table photo.`, () => fetchReturns(b, ids, true));
    } catch {
      showToast("That didn't save. Try again.");
    }
  };

  const undoReturn = async (b: Booking, pieceId: string, label: string) => {
    try {
      const r = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/returns/${pieceId}/undo`, { method: 'POST' });
      if (!r.ok) throw new Error();
      refreshCard(b.booking_code);
      showToast(`${label} taken off the returns shelf`);
    } catch {
      showToast("That didn't save. Try again.");
    }
  };

  const goToCard = (code: string, sessionStart: string) => {
    const date = new Date(sessionStart).toLocaleDateString('en-CA');
    setQ(''); setResults(null); setView('painting'); setShowEarlier(true); setSelectedSessionIdx(null);
    if (bookings.some((b) => b.booking_code === code)) {
      if (openCode !== code) openCard(code);
      setTimeout(() => document.getElementById(`card-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      return;
    }
    restoreCode.current = code;
    setCardDate(date);
  };

  const openSheet = (b: Booking, path: '/floor' | '/collection') => {
    sheetGuard.current = null;
    // Opening a card's screen remembers the card, as if it were opened.
    try { sessionStorage.setItem('glazeup_open_card', JSON.stringify({ code: b.booking_code, date: cardDateRef.current, at: Date.now() })); } catch { /* private mode */ }
    setSheet({
      code: b.booking_code,
      src: `${path}?code=${encodeURIComponent(b.booking_code)}&from=card`,
      title: `${b.customer_name} · ${path === '/floor' ? 'Table photo' : 'Collection'}`,
    });
  };
  const refreshCard = (code: string) => {
    load(true);
    if (openCode === code) {
      setOpenCode(null);
      setTimeout(() => openCard(code), 0);
    }
  };
  const closeSheet = (force = false) => {
    if (!sheet) return;
    if (!force && sheetGuard.current && !window.confirm(sheetGuard.current)) return;
    const code = sheet.code;
    setSheet(null);
    sheetGuard.current = null;
    refreshCard(code);
    setTimeout(() => document.getElementById(`card-${code}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
  };
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data?.type) return;
      if (e.data.type === 'glazeup:guard') sheetGuard.current = e.data.message || null;
      if (e.data.type === 'glazeup:done') closeSheet(true);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  });

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/cards/search?q=${encodeURIComponent(term)}`);
        setResults(r.ok ? await r.json() : []);
      } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

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

        {/* Any booking, any day: name, phone, email, table or code. */}
        <div style={{ position: 'relative', marginBottom: '0.8rem' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a booking: name, phone, table..."
            style={{ width: '100%', padding: '0.75rem 0.9rem', fontSize: 'var(--text-md)', border: '1px solid #ddd', borderRadius: 8, background: 'white' }}
          />
          {results && (
            <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4, background: 'white', border: '1px solid #e5ddd2', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '60vh', overflowY: 'auto' }}>
              {results.length === 0 && <p style={{ padding: '0.8rem 1rem', color: '#888', fontSize: 'var(--text-sm)' }}>No bookings found.</p>}
              {results.map((r) => (
                <button
                  key={r.booking_code}
                  onClick={() => goToCard(r.booking_code, r.session_start)}
                  style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', padding: '0.8rem 1rem', border: 'none', borderBottom: '1px solid #f1ece5', background: 'none', textAlign: 'left', cursor: 'pointer' }}
                >
                  <span style={{ fontWeight: 600 }}>{r.customer_name}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: '#888', whiteSpace: 'nowrap' }}>
                    {new Date(r.session_start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                    {r.table_number ? ` · Table ${r.table_number}` : ''}
                    {r.collected_at ? ' · Collected' : ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Same cards, different pile. */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {([
            ['painting', `Painting${bookings.length ? ` (${bookings.length})` : ''}`],
            ['collecting', `Collecting${collectingList.length ? ` (${collectingList.length})` : ''}`],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{ padding: '0.55rem 1rem', borderRadius: 999, fontWeight: 700, fontSize: 'var(--text-sm)', border: '1px solid var(--clay)', background: view === v ? 'var(--clay)' : 'white', color: view === v ? 'white' : 'var(--clay)' }}
            >
              {label}
            </button>
          ))}
          {/* Daisy: need to get to packing etc. The other daily steps, one
              tap from the cards rather than via Menu. */}
          {([['/returns', 'Returns shelf'], ['/out-of-kiln', 'Out of the kiln'], ['/packing', 'Packing']] as const).map(([href, label]) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              style={{ padding: '0.55rem 1rem', borderRadius: 999, fontWeight: 700, fontSize: 'var(--text-sm)', border: '1px solid #d8cbbc', background: 'white', color: '#8a8178' }}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'painting' && earlierDone.length > 0 && (
          <button
            onClick={() => setShowEarlier((x) => !x)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '1rem', padding: '0.5rem 0.9rem', borderRadius: 8, border: '1px dashed #d8cbbc', background: 'transparent', color: '#8a8178', fontSize: 'var(--text-sm)', fontWeight: 600 }}
          >
            {showEarlier ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {showEarlier ? 'Hide' : 'Show'} earlier today, done ({earlierDone.length})
          </button>
        )}

        {view === 'painting' && sessionTimes.length > 1 && (
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
              data-selected={(printOnly ? printOnly === b.booking_code : isSelected) ? "true" : "false"}
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
                          fontSize: '0.68rem', letterSpacing: '.1em',
                          textTransform: 'uppercase', color: '#C4B8AD', fontWeight: 600,
                        }}>
                          Table
                        </span>
                        {/* Tap to set the table number. Prints with the
                            number in it, or empty for a pen if not set. */}
                        <div
                          onClick={(e) => { e.stopPropagation(); setEditingTable(b.booking_code); }}
                          title="Tap to set the table number"
                          style={{
                            width: 46, height: 46, flexShrink: 0,
                            border: `1px solid ${tableErr === b.booking_code ? '#c0392b' : b.table_number ? 'var(--clay)' : '#D8CBBC'}`,
                            borderRadius: '50%', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'Georgia, "Times New Roman", serif', fontSize: '1.25rem',
                            color: 'var(--charcoal)', overflow: 'hidden',
                          }}
                        >
                          {editingTable === b.booking_code ? (
                            <input
                              autoFocus
                              inputMode="numeric"
                              defaultValue={b.table_number || ''}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => saveTable(b.booking_code, e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur();
                                if (e.key === 'Escape') setEditingTable(null);
                              }}
                              style={{ width: 40, border: 'none', outline: 'none', background: 'transparent', textAlign: 'center', font: 'inherit', color: 'inherit' }}
                            />
                          ) : (b.table_number || '')}
                        </div>
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
                      Ready {(b.collection_date || collectDate) ? longDate(new Date((b.collection_date || collectDate) as string)) : 'in about three weeks'}
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
                        // [6 Oct] Daisy: the printed card is the customer's.
                        // Returns and notes are for studio staff, screen
                        // only. Seats and setup flags still print, for
                        // whoever lays the table.
                        <p className="no-print" style={{
                          fontSize: '0.78rem', margin: '.7rem 0 0',
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
                      <div className="no-print" style={{
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
                    {(() => {
                      // Pieces from an earlier visit (not this booking's own):
                      // staff fetch them off the shelf and say so here.
                      const theirs = (b.returns_waiting || []).filter((r) => !r.own && r.id);
                      if (!theirs.length) return null;
                      return (
                        <button
                          className="no-print"
                          onClick={(e) => { e.stopPropagation(); fetchReturns(b, theirs.map((r) => r.id as string)); }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.6rem', padding: '0.5rem 1rem', borderRadius: 999, border: 'none', background: '#A8651A', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)' }}
                        >
                          Got {theirs.length === 1 ? 'it' : 'them'} out
                        </button>
                      );
                    })()}
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
                // Printed: whoever lays the table needs the seat count.
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--clay)', fontWeight: 600, marginTop: '0.35rem' }}>
                  {b.party_size} seat{b.party_size === 1 ? '' : 's'}
                </p>
              )}
              {setupFlags.length > 0 && (
                // Printed: pram, wheelchair and the like, for laying the table.
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
                <p className="no-print" style={{ fontSize: 'var(--text-xs)', color: '#8a5a00', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: 'var(--radius-sm)', padding: '0.35rem 0.5rem', marginTop: '0.4rem', textAlign: 'left' }}>
                  {b.notes}
                </p>
              )}
              {/* Open the card: the saved table photo, every piece numbered,
                  and the next things to do. Screen only, never printed. */}
              <div className="no-print" style={{ padding: '0 1rem 1rem' }} onClick={(e) => e.stopPropagation()}>
                {(() => {
                  const st = cardStatus(b, collectDate);
                  return (
                    <div style={{ marginTop: '0.8rem' }}>
                      <span style={{ display: 'inline-block', padding: '0.2rem 0.65rem', borderRadius: 999, fontSize: 'var(--text-xs)', fontWeight: 700, color: 'white', background: st.colour }}>
                        {st.label}
                      </span>
                      {!st.next && st.hint && (
                        <p style={{ marginTop: '0.45rem', fontSize: 'var(--text-sm)', color: '#6b625a', lineHeight: 1.35 }}>{st.hint}</p>
                      )}
                      {/* The undo for this card's last step, for as long as it stands. */}
                      {st.label === 'Painting' && (
                        <button onClick={() => markArrived(b, false)} style={undoLink}>Not here yet? Undo arrival</button>
                      )}
                      {st.label === 'Collected' && (
                        <button onClick={() => markCollected(b, false)} style={undoLink}>Undo collected</button>
                      )}
                      {st.next && (
                        <button
                          onClick={() => {
                            if (st.next === 'arrived') markArrived(b, true);
                            if (st.next === 'photo') openSheet(b, '/floor');
                            if (st.next === 'handover') openSheet(b, '/collection');
                          }}
                          style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginTop: '0.6rem', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-md)' }}
                        >
                          {st.next === 'arrived' && <>They&apos;re here</>}
                          {st.next === 'photo' && <><Camera size={18} /> Photograph the table</>}
                          {st.next === 'handover' && <>Hand over</>}
                        </button>
                      )}
                    </div>
                  );
                })()}
                <button
                  onClick={() => openCard(b.booking_code)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.6rem', padding: '0.4rem 0.9rem', borderRadius: 999, border: '1px solid var(--clay)', background: openCode === b.booking_code ? 'var(--clay)' : 'transparent', color: openCode === b.booking_code ? 'white' : 'var(--clay)', fontWeight: 700, fontSize: 'var(--text-sm)' }}
                >
                  {openCode === b.booking_code ? <>Close <ChevronUp size={15} /></> : <>Open <ChevronDown size={15} /></>}
                </button>
                <button
                  onClick={() => printOne(b.booking_code)}
                  aria-label="Print this card"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.6rem', marginLeft: '0.4rem', padding: '0.4rem 0.9rem', borderRadius: 999, border: '1px solid var(--clay)', background: 'transparent', color: 'var(--clay)', fontWeight: 700, fontSize: 'var(--text-sm)' }}
                >
                  <Printer size={14} /> Print
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
                              {p.returned_at && (
                                <span
                                  role="button"
                                  onClick={(e) => { e.stopPropagation(); undoReturn(b, p.id, p.piece_type || 'Piece'); }}
                                  style={{ ...undoLink, display: 'block', marginTop: '0.15rem', fontSize: '0.7rem' }}
                                >
                                  Undo return
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button onClick={() => openSheet(b, '/floor')} style={actionBtn(true)}>
                          <Camera size={16} /> {tp.photo_url ? 'Table photo & returns' : 'Photograph the table'}
                        </button>
                        <button onClick={() => openSheet(b, '/collection')} style={actionBtn(false)}>
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

      {sheet && (
        <div className="no-print" style={{ position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(20,16,12,0.5)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)', flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--ivory, #f6f1ea)', borderRadius: '14px 14px 0 0', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem', padding: '0.6rem 0.9rem', background: 'var(--charcoal)', color: 'var(--ivory)' }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--text-md)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sheet.title}</span>
              <button onClick={() => closeSheet()} style={{ flexShrink: 0, padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none', background: 'rgba(255,255,255,0.15)', color: 'inherit', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                Back to the card
              </button>
            </div>
            <iframe
              src={sheet.src}
              title={sheet.title}
              allow="camera"
              style={{ flex: 1, width: '100%', border: 'none', background: 'white' }}
            />
          </div>
        </div>
      )}
      {toast && (
        <div className="no-print" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.2rem)', zIndex: 900, display: 'flex', alignItems: 'center', gap: '0.9rem', padding: '0.75rem 1rem', borderRadius: 10, background: '#2b2622', color: '#f6f1ea', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', fontSize: 'var(--text-sm)', maxWidth: '92vw' }}>
          <span>{toast.text}</span>
          {toast.undo && (
            <button onClick={() => { toast.undo?.(); setToast(null); }} style={{ background: 'none', border: 'none', color: '#e8a23c', fontWeight: 700, fontSize: 'var(--text-sm)' }}>
              Undo
            </button>
          )}
        </div>
      )}
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

// Small and quiet, but always there while the step it undoes stands.
const undoLink: React.CSSProperties = {
  display: 'block', margin: '0.45rem auto 0', background: 'none', border: 'none',
  padding: '0.3rem 0.4rem', color: '#8a8178', fontSize: 'var(--text-xs)', fontWeight: 600,
  textDecoration: 'underline', cursor: 'pointer',
};
