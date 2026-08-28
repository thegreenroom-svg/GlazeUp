'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronRight, Home, Camera, Printer, Check, Loader, RefreshCw } from 'lucide-react';
import { NudgeCard, HelpButton } from '@/components/NudgeSystem';
import { compressPhotoForUpload } from '@/lib/compressPhoto';

// Same fix already applied in PinGate.tsx and daily-cards/page.tsx: a
// plain fetch() has no timeout, and this file gates real controls (table
// Save button, etc.) on busy flags -- if a fetch genuinely stalls, the
// flag never resets and the control looks permanently broken rather than
// just failing cleanly. Guarantees a call resolves or rejects within 20s.
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
  notes: string | null;
}

interface MenuItem {
  kind?: 'simple';
  item_name: string;
  category: string | null;
  price_cents: number | null;
}
interface CustomisableItem {
  kind: 'customisable';
  base: string;
  category: string | null;
  from_price_cents: number;
  flavours: string[];
  milks: string[];
  lookup: Record<string, MenuItem>;
}
type MenuEntry = MenuItem | CustomisableItem;

interface Bucket { label: string; items: MenuEntry[] }
interface Subsection {
  category: string;
  label: string;
  popularity: number;
  items: MenuEntry[];
  buckets: Bucket[] | null;
}

interface TillGroup {
  key: string;
  label: string;
  popularity: number;
  subsections: Subsection[];
}

interface TillItem {
  id: string;
  item_name: string;
  quantity: number;
  unit_price_cents: number;
  person_name: string | null;
}

const B = {
  charcoal: 'var(--charcoal)',
  clay: 'var(--clay)',
  sand: 'var(--sand)',
  ivory: 'var(--ivory)',
  stone: 'var(--stone)',
};

type Phase = 1 | 2 | 3 | 4 | 5;

export default function FloorPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(1);
  // Real per-studio setting, not a hardcoded choice -- The Kiln Cafe
  // takes payment on physical Square terminals and skips the in-app
  // till, but a studio without Square terminals may genuinely need it.
  // Defaults true so a slow/failed load never hides functionality.
  const [tillEnabled, setTillEnabled] = useState(true);

  // Kept as a promise, not just state, because the phase decision is made
  // the instant a booking is tapped -- which on a studio connection can
  // easily happen BEFORE this fetch lands. With tillEnabled defaulting to
  // true, that race sent staff into the till screen even though the flag
  // is false for this studio, which is exactly what Daisy hit: category
  // tiles for a till that isn't in use.
  //
  // Same class of bug as the collection date defaulting to +14 before the
  // studio's real date arrived. A default that's only correct once a fetch
  // resolves has to be waited for, not guessed at.
  const featuresRef = useRef<Promise<boolean> | null>(null);
  if (featuresRef.current === null && typeof window !== 'undefined') {
    featuresRef.current = fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/studio/features`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const on = d && typeof d.feature_in_app_till === 'boolean' ? d.feature_in_app_till : true;
        setTillEnabled(on);
        return on;
      })
      // Still defaults to ON if the request genuinely fails -- a studio
      // that depends on the in-app till must not lose it because one
      // request timed out.
      .catch(() => true);
  }
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [floorDate, setFloorDate] = useState(new Date().toISOString().slice(0, 10));
  const [menu, setMenu] = useState<TillGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<TillGroup | null>(null);
  const [activeSubsection, setActiveSubsection] = useState<Subsection | null>(null);
  const [activeBucket, setActiveBucket] = useState<Bucket | null>(null);
  const [showAllItems, setShowAllItems] = useState(false);
  const [customising, setCustomising] = useState<CustomisableItem | null>(null);
  const [pickedFlavour, setPickedFlavour] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<Booking | null>(null);
  const [pieceCount, setPieceCount] = useState(0);
  // Real per-piece identification from the table photo.
  const [identifiedPieces, setIdentifiedPieces] = useState<{ index: number; piece_type: string; description: string; box: { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number } | null }[] | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [splitBillCount, setSplitBillCount] = useState(1);
  const [quickAccessMode, setQuickAccessMode] = useState(false);
  const [tableTotals, setTableTotals] = useState<Record<string, number>>({});
  const [collectionMethod, setCollectionMethod] = useState<'studio' | 'postal' | null>(null);
  const [postalPostcode, setPostalPostcode] = useState('');
  const [liveSquareOrder, setLiveSquareOrder] = useState<{
    matched: boolean; reason?: string; multiple_candidates?: boolean; table_number?: string;
    order: { ticket_name: string; total_gbp: number | null; items: { name: string; quantity: number; total_gbp: number | null }[]; updated_at: string } | null;
  } | null>(null);
  const [liveSquareLoading, setLiveSquareLoading] = useState(false);
  const [savingTableInline, setSavingTableInline] = useState(false);
  const [tillItems, setTillItems] = useState<TillItem[]>([]);
  // Real per-person billing/collection -- per Daisy: people at the same
  // table often pay separately and may want different collection methods.
  // null means 'shared/whole table', same as every booking before this
  // existed. activePersonTag is who new items get attributed to right now.
  const [activePersonTag, setActivePersonTag] = useState<string | null>(null);
  const [newPersonInput, setNewPersonInput] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);
  const [personCollection, setPersonCollection] = useState<Record<string, { collection_method: 'studio' | 'postal' | null; postal_postcode: string; payment_method: 'card' | 'cash' | null }>>({});
  const [savingPersonCollection, setSavingPersonCollection] = useState<string | null>(null);
  const [tillBusy, setTillBusy] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [finished, setFinished] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const tillTotal = tillItems.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);

  useEffect(() => {
    const dayStr = new Date(floorDate).toDateString();
    const dayBookings = allBookings
      .filter((b) => new Date(b.session_start).toDateString() === dayStr)
      .sort((a, b) => new Date(a.session_start).getTime() - new Date(b.session_start).getTime());
    setBookings(dayBookings.slice(0, 30));
  }, [floorDate, allBookings]);

  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  // Real, visible failure reporting -- the previous fix used
  // .catch(() => {}), a completely silent catch. Checked the real
  // database directly: the last successful sync was ~24 hours old even
  // after that fix shipped, meaning it's very likely failing here
  // without any way to tell. A real 12s timeout too, so a slow cold
  // backend can't hang this silently either -- it fails visibly and
  // quickly instead.
  const syncBookings = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/bookings/sync`, { method: 'POST', signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSyncWarning(`Booking sync failed: ${body.error || `HTTP ${res.status}`}`);
      }
    } catch (err: any) {
      setSyncWarning(err?.name === 'AbortError' ? 'Booking sync timed out — showing what was already loaded.' : `Could not reach the sync: ${err?.message || err}`);
    }
  };

  const loadBookings = async () => {
    setLoading(true);
    setQuickAccessMode(false);
    try {
      // Real fix -- this fetched straight from the database with zero
      // sync call anywhere in this page, unlike the Dashboard and Daily
      // Cards. If Floor is opened directly (very likely the most common
      // real entry point, not the Dashboard), the earlier sync-on-open
      // fix never fired here at all -- so a genuinely busier real day
      // could still show stale numbers. Syncing first, same as
      // everywhere else now does.
      await syncBookings();
      const [bRes, mRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/till-menu`),
      ]);
      const bData = bRes.ok ? await bRes.json() : [];
      const mData = mRes.ok ? await mRes.json() : [];
      setAllBookings(Array.isArray(bData) ? bData : []);
      setMenu((mData?.groups || []).slice(0, 30));
      setPhase(2);
    } finally {
      setLoading(false);
    }
  };

  const loadSeatedBookings = async () => {
    setLoading(true);
    setQuickAccessMode(true);
    try {
      // Same real fix as loadBookings above -- Seated Bookings is its
      // own direct entry point too.
      await syncBookings();
      const [bRes, mRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/till-menu`),
      ]);
      const bData = bRes.ok ? await bRes.json() : [];
      const mData = mRes.ok ? await mRes.json() : [];
      const all: Booking[] = Array.isArray(bData) ? bData : [];
      setAllBookings(all);
      setMenu((mData?.groups || []).slice(0, 30));

      // Fetch running till totals for today's bookings so staff can see
      // which tables already have items before jumping back in
      const todayStr = new Date().toDateString();
      const todays = all.filter((b) => new Date(b.session_start).toDateString() === todayStr);
      const totals: Record<string, number> = {};
      await Promise.all(
        todays.map(async (b) => {
          try {
            const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${b.booking_code}/till`);
            const d = r.ok ? await r.json() : [];
            const items = Array.isArray(d) ? d : d?.items || [];
            totals[b.booking_code] = items.reduce((s: number, i: TillItem) => s + i.unit_price_cents * i.quantity, 0);
          } catch {
            totals[b.booking_code] = 0;
          }
        })
      );
      setTableTotals(totals);
      setFloorDate(new Date().toISOString().slice(0, 10));
      setPhase(2);
    } finally {
      setLoading(false);
    }
  };

  // Live, read-only Square order for this booking's table -- what's
  // actually been rung up on the physical handheld right now. Fetched
  // fresh every time a booking is opened (matches "when you open up the
  // app in that table, I see exactly what's on that table"), and
  // refreshable from the Till screen since the girls keep adding to it
  // live throughout the session.
  const loadLiveSquareOrder = async (bookingCode: string) => {
    setLiveSquareLoading(true);
    try {
      const res = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${bookingCode}/live-square-order`);
      const d = await res.json();
      setLiveSquareOrder(res.ok ? d : { matched: false, reason: 'error', order: null });
    } catch {
      setLiveSquareOrder({ matched: false, reason: 'error', order: null });
    } finally {
      setLiveSquareLoading(false);
    }
  };

  // Setting the table right from the Till header -- same real endpoint
  // already used on Bookings and daily-cards, just reachable from here too
  // since this is the actual point staff open a table and notice it's not
  // set yet. Re-checks the live Square match afterwards since that match
  // depends entirely on table_number.

  const selectBooking = async (b: Booking) => {
    setCurrent(b);
    setPieceCount(0);  // Start at 0 - will be populated from Phase 2 photo (or show unfinished pieces if returning customer)
    setTillItems([]);
    setFinished(false);
    setActiveGroup(null);
    setActiveSubsection(null);
    setActiveBucket(null);
    setShowAllItems(false);
    setCollectionMethod(null);
    setPostalPostcode('');
    setLiveSquareOrder(null);
    setActivePersonTag(null);
    setNewPersonInput('');
    setPersonCollection({});
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${b.booking_code}/till`);
      const d = res.ok ? await res.json() : [];
      setTillItems(Array.isArray(d) ? d : d?.items || []);
      // Real existing per-person collection prefs, if any were set on a
      // previous visit to this booking (e.g. quick-access mid-session).
      if (!Array.isArray(d) && Array.isArray(d?.people)) {
        const prefs: typeof personCollection = {};
        d.people.forEach((p: any) => {
          prefs[p.person_name] = {
            collection_method: p.collection_method || null,
            postal_postcode: p.postal_postcode || '',
            payment_method: p.payment_method || null,
          };
        });
        setPersonCollection(prefs);
      }
    } catch { /* fresh table, no till yet */ }
    loadLiveSquareOrder(b.booking_code);
    // Per Daisy directly: "the Square till points are used... the girls
    // know it. I think it's cumbersome within the app. We'll have the
    // app for everything else other than payment." Now a real
    // per-studio setting rather than hardcoded, since this has to be
    // sellable to studios with genuinely different setups -- The Kiln
    // Cafe skips straight to Completion; a studio that needs the in-app
    // till still gets it.
    // Wait for the real answer rather than trusting the optimistic
    // default. Resolved after the first call, so this costs nothing.
    const tillOn = featuresRef.current ? await featuresRef.current : tillEnabled;
    setPhase(tillOn ? 3 : 4);
  };

  // Deep link from the Schedule. The old phase 1 was a splash screen of
  // three buttons holding no information, and phase 2 -- labelled "Select
  // Table" -- was really a date picker over a flat list of the day's
  // bookings. The Schedule shows the same thing spatially, in the layout
  // the studio already reads every shift, and marks what's finished.
  //
  // It also answers "which table" before anyone taps, now that the real
  // table comes from Square Appointments. That step only ever existed
  // because the app didn't know.
  // Who is on shift, read from the same session the PIN gate writes. Per
  // Daisy: "I want whoever's on the app referenced against the photo so we
  // can trace back who took the photos, so we can explain what we need if
  // it goes wrong." Attribution for coaching, not blame -- if one person's
  // photos keep missing pieces, that is a two-minute conversation, but only
  // if you know whose they are.
  const [shiftName, setShiftName] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('glazeup_shift');
      if (raw) setShiftName(JSON.parse(raw)?.name || null);
    } catch { /* private mode, or nobody signed in */ }
  }, []);

  const searchParams = useSearchParams();
  const deepLinked = useRef(false);
  useEffect(() => {
    const code = searchParams.get('code');
    if (!code || deepLinked.current) return;
    deepLinked.current = true;
    (async () => {
      setLoading(true);
      try {
        const [bRes, mRes] = await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`),
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/till-menu`),
        ]);
        const bData = bRes.ok ? await bRes.json() : [];
        const mData = mRes.ok ? await mRes.json() : [];
        const list = Array.isArray(bData) ? bData : [];
        setAllBookings(list);
        setBookings(list);
        setMenu((mData?.groups || []).slice(0, 30));
        const match = list.find((b: Booking) => b.booking_code === code);
        // Falls back to the normal picker rather than a dead end if the
        // booking genuinely isn't in today's list -- e.g. a stale link
        // left open on an iPad overnight.
        if (match) await selectBooking(match);
        else setPhase(2);
      } finally {
        setLoading(false);
      }
    })();
  }, [searchParams]);

  // Single-tap return from any depth (bucket, subsection, or item grid)
  // straight to the top-level Till group tiles -- Cafe or Pottery Blanks
  // side alike, instead of the previous chained back-one-level-at-a-time
  // navigation.
  const backToTillMenu = () => {
    setActiveGroup(null);
    setActiveSubsection(null);
    setActiveBucket(null);
    setShowAllItems(false);
  };

  const addTillItem = async (m: MenuItem) => {
    if (!current) return;
    setTillBusy(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${current.booking_code}/till`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_name: m.item_name, category: m.category, quantity: 1, unit_price_cents: m.price_cents ?? 0, person_name: activePersonTag }),
      });
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${current.booking_code}/till`);
      const d = res.ok ? await res.json() : [];
      setTillItems(Array.isArray(d) ? d : d?.items || []);
    } finally {
      setTillBusy(false);
    }
  };

  // Save one named person's collection/payment preference -- real endpoint,
  // separate from the whole-booking one used when nobody's split.
  const savePersonCollection = async (personName: string) => {
    if (!current) return;
    const pref = personCollection[personName];
    if (!pref?.collection_method) return;
    setSavingPersonCollection(personName);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${current.booking_code}/people/${encodeURIComponent(personName)}/collection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection_method: pref.collection_method,
          postal_postcode: pref.collection_method === 'postal' ? pref.postal_postcode : null,
          payment_method: pref.payment_method,
        }),
      });
    } finally {
      setSavingPersonCollection(null);
    }
  };

  const removeTillItem = async (id: string) => {
    if (!current) return;
    setTillBusy(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/till-items/${id}`, { method: 'DELETE' });
      setTillItems((prev) => prev.filter((i) => i.id !== id));
    } finally {
      setTillBusy(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
    // Real AI identification of each piece on the table -- per Daisy:
    // "it would be useful if the AI can give a description of each piece
    // and maybe with a numbered square around each one so they can be
    // checked." This also fixes a real bug: pieceCount was never set by
    // anything despite the UI claiming "captured from photo", so every
    // real table was logging as a single piece regardless (Kathy
    // d'Ambrumenil's photo showed two rabbits but recorded "0 pieces").
    setIdentifying(true);
    setIdentifiedPieces(null);
    try {
      // Compressed for the AI call only -- a throwaway copy used just for
      // this request. `photo` (the state used by saveAndFinish below,
      // which becomes the real stored, displayed-everywhere booking
      // photo) stays the original, untouched, full-quality file.
      const compressed = await compressPhotoForUpload(f);
      const fd = new FormData();
      fd.append('photo', compressed, 'table.jpg');
      // fetchWithTimeout, not a plain fetch. Gemini calls had no upper
      // bound anywhere, and this one's own finally block only protects
      // against a REJECTED promise -- a call that never resolves at all
      // (a genuine network stall) would leave "identifying" spinning with
      // no explanation for as long as the connection stayed open.
      const res = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/identify-in-photo`, { method: 'POST', body: fd }, 55000); // server's own retry chain is a proven 40s worst case
      const d = await res.json();
      if (res.ok && Array.isArray(d.pieces)) {
        setIdentifiedPieces(d.pieces);
        setPieceCount(d.pieces.length);
      }
    } catch { /* identification is a helper, not a blocker -- staff can still finish */ }
    finally { setIdentifying(false); }
  };

  const saveAndFinish = async () => {
    if (!current) return;
    setSaving(true);
    try {
      // Real photo, confirmed against the real booking -- the same table
      // photo + confirm path Photo Match uses, so it shows up under this
      // booking's AI Matched Photos afterwards.
      if (photo) {
        const formData = new FormData();
        formData.append('photo', photo);
        formData.append('booking_code', current.booking_code);
        formData.append('chalk_tag_name', current.customer_name);
        formData.append('description', `${pieceCount} pieces, photographed at table`);
        formData.append('confirmed_by', 'start-floor');
        // Real pipeline connection: this one photo also creates the
        // piece records with itself attached, so Find on Table can
        // genuinely find them when the kiln comes out.
        formData.append('piece_count', String(Math.max(1, pieceCount)));
        // Real per-piece descriptions, so each piece is stored with
        // something Find on Table can genuinely search on later.
        if (identifiedPieces?.length) {
          formData.append('pieces_json', JSON.stringify(identifiedPieces.map((p) => ({ piece_type: p.piece_type, description: p.description, box: p.box }))));
        }
        if (shiftName) {
          formData.append('photo_taken_by', shiftName);
        }
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/photo-match/confirm`, { method: 'POST', body: formData });
      }

      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${current.booking_code}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finished_by: 'start-floor',
          // Not collected here any more -- the till owns this.
          payment_method: null,
          collection_method: collectionMethod,
          postal_postcode: collectionMethod === 'postal' ? postalPostcode.trim() : undefined,
          till_total_cents: tillTotal,
          split_bill_count: splitBillCount > 1 ? splitBillCount : undefined,
        }),
      });
      setFinished(true);

      setSaved(true);
      setPhase(5);
    } finally {
      setSaving(false);
    }
  };

  const nextBooking = () => {
    setPhase(quickAccessMode ? 2 : 2);
    setCurrent(null);
    setPieceCount(0);
    setTillItems([]);
    setPhoto(null);
    setPhotoPreview(null);
    setSaved(false);
    setFinished(false);
    setCollectionMethod(null);
    setPostalPostcode('');
    setActivePersonTag(null);
    setNewPersonInput('');
    setAddingPerson(false);
    setPersonCollection({});
    if (quickAccessMode) {
      // Refresh totals so the seated list reflects the table just finished
      loadSeatedBookings();
    }
  };

  const Header = ({ label }: { label: string }) => (
    <div className="flex justify-between items-center mb-6 pt-4">
      <button onClick={() => router.push('/')} className="p-2" style={{ color: B.clay }}><Home size={24} /></button>
      <p style={{ color: B.stone }} className="text-sm font-bold">{label}</p>
      <div style={{ width: 24 }} />
    </div>
  );

  // ============ PHASE 1: HOME ============
  if (phase === 1) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: B.charcoal }}>
        <HelpButton pageIds={['floor_home', 'floor_select_table', 'floor_seated_totals', 'floor_till', 'floor_split_bill', 'floor_completion', 'floor_photo', 'floor_handoff']} />
        <div className="max-w-2xl mx-auto">
          <div className="pt-6 pb-8 text-center">
            <h1 className="text-2xl font-bold" style={{ color: B.ivory }}>Start Floor</h1>
            <p className="text-sm mt-1" style={{ color: B.stone }}>Table → photo. Scan the QR card with your camera to begin.</p>
          </div>
          {syncWarning && (
            <div style={{ backgroundColor: '#5a2a2a', color: '#ffcccc', padding: '0.7rem 0.9rem', borderRadius: 8, fontSize: '0.8rem', marginBottom: '1rem' }}>
              {syncWarning}
            </div>
          )}
          {/* The QR card on the table IS the way in now. Daisy: "we don't
              need anything else on this apart from photograph table
              because the QR code will be picked up, and that will open
              the booking." So: scan, and this screen is skipped entirely
              -- ?code= deep-links straight to the table step. The old
              schedule / booking list / seated-bookings launchpad is gone,
              along with the till it fed. Browsing for a booking by hand
              is the thing the QR code exists to replace. */}
          <div className="space-y-4">
            {/* Daisy landed here and asked how to photograph a QR code
                from this screen -- the honest answer was "you can't, and
                nothing here explained that." There is no in-app scanner;
                it relies entirely on iOS recognising a URL in a QR code
                through the ordinary Camera app. That's zero extra code,
                but it's invisible unless someone actually says so. */}
            <div className="rounded-lg p-4" style={{ backgroundColor: B.charcoal, border: `1px solid ${B.stone}` }}>
              <p className="font-bold text-sm" style={{ color: B.ivory }}>To open a booking, scan its card</p>
              <p className="text-xs mt-2" style={{ color: B.stone, lineHeight: 1.5 }}>
                Use the iPad's own Camera app -- not this one. Point it at the QR code on the table card. iOS shows a banner to open the link; tap it, and this screen loads with that booking ready.
              </p>
            </div>
            <button onClick={loadBookings} disabled={loading} className="w-full py-4 rounded-lg font-semibold flex items-center justify-center gap-3" style={{ backgroundColor: 'transparent', color: B.ivory, border: `1px solid ${B.stone}` }}>
              {loading ? 'Loading...' : 'No card? Find the booking by hand'}
            </button>
          </div>
        </div>
        <NudgeCard id="floor_home" />
      </div>
    );
  }

  // ============ PHASE 2: SELECT TABLE ============
  if (phase === 2) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: B.charcoal }}>
        <div className="max-w-2xl mx-auto">
          <Header label={quickAccessMode ? 'Seated Bookings' : `Step 2/${tillEnabled ? 5 : 4} · Table`} />
          {syncWarning && (
            <div style={{ backgroundColor: '#5a2a2a', color: '#ffcccc', padding: '0.7rem 0.9rem', borderRadius: 8, fontSize: '0.8rem', marginBottom: '1rem' }}>
              {syncWarning}
            </div>
          )}
          <div className="rounded-lg p-6" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
            <div className="text-center mb-6">
              <span className="text-4xl">{quickAccessMode ? '🪑' : '🎨'}</span>
              <h2 className="text-xl font-bold mt-3" style={{ color: B.ivory }}>{quickAccessMode ? 'Active Tables' : 'Select Table'}</h2>
              {quickAccessMode && <p style={{ color: B.stone, fontSize: '0.8rem', marginTop: '0.3rem' }}>Tap a table to add more drinks or pieces</p>}
              <input
                type="date"
                value={floorDate}
                onChange={(e) => setFloorDate(e.target.value)}
                style={{ marginTop: '0.6rem', padding: '0.4rem 0.6rem', borderRadius: 8, border: `1px solid ${B.stone}`, backgroundColor: B.charcoal, color: B.ivory, fontSize: '0.85rem' }}
              />
              <p style={{ color: B.stone, fontSize: '0.8rem', marginTop: '0.4rem' }}>{bookings.length} real booking{bookings.length === 1 ? '' : 's'} on this day</p>
            </div>
            {bookings.length === 0 && <p style={{ color: B.stone, textAlign: 'center', fontSize: '0.85rem' }}>No bookings found for today.</p>}
            <div className="space-y-2" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              {bookings.map((b) => (
                <button key={b.booking_code} onClick={() => selectBooking(b)} className="w-full text-left p-3 rounded-lg flex justify-between items-center" style={{ backgroundColor: B.charcoal, border: `1px solid ${B.stone}40` }}>
                  <div>
                    <p style={{ color: B.ivory, fontWeight: 600, fontSize: '0.9rem' }}>
                      {b.customer_name}
                      {b.notes && <span style={{ color: '#e0c060', marginLeft: '0.4rem' }} title="Has a note">●</span>}
                    </p>
                    <p style={{ color: B.stone, fontSize: '0.75rem' }}>
                      {new Date(b.session_start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      {b.table_number ? ` · Table ${b.table_number}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {quickAccessMode && tableTotals[b.booking_code] !== undefined && (
                      <span style={{ color: B.sand, fontWeight: 700, fontSize: '0.85rem' }}>
                        £{(tableTotals[b.booking_code] / 100).toFixed(2)}
                      </span>
                    )}
                    <ChevronRight size={18} color={B.ivory} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <NudgeCard id={quickAccessMode ? 'floor_seated_totals' : 'floor_select_table'} />
      </div>
    );
  }

  // ============ PHASE 3: TILL (Square-style till, real menu, real data) ============
  // Styled to match Square's own standard/default point-of-sale look, per
  // Daisy's request -- so the girls recognise it instantly and it doesn't
  // slow them down. Same real data, same real handlers as before (menu,
  // addTillItem, tillItems, splitBillCount etc. all unchanged) -- this is
  // a presentation change, not a data change. Square's actual POS is a
  // LIGHT theme (white background, black text, teal accent), unlike the
  // rest of this app -- that's deliberate here, it's the specific visual
  // familiarity being asked for. Honest caveat: this matches Square's
  // well-known standard/default skin, not a pixel trace of this exact
  // device's screen, which nobody here has access to.
  if (phase === 3) {
    const SQ = { bg: '#F7F7F5', ink: '#1A1A1A', sub: '#6B6B6B', line: '#E3E3E0', accent: '#00785A', accentDark: '#00563F', panel: '#FFFFFF' };
    const PALETTE = ['#3B7EC4', '#3F9A6E', '#A16FC2', '#D98A4E', '#4AA6A0', '#C25F86', '#7A8F4A', '#5D7BC4'];
    const colourFor = (idx: number) => PALETTE[idx % PALETTE.length];

    // Quick-pick table options, same space-prefixed convention the girls
    // already use on the tools they set tables with day to day -- 'Main
    // Studio 4', 'Lounge 2' etc, rather than typing a bare number. Real
    // studio layout: Main Studio has tables 1-8; Lounge is (still)
    // referred to as 3 tables. Free text below covers anything these
    // quick options don't -- splits/combines like '3A' or '3+4'.
    
    const activeList = activeBucket ? activeBucket.items : activeSubsection ? activeSubsection.items : null;

    return (
      <div style={{ minHeight: '100vh', backgroundColor: SQ.bg, color: SQ.ink, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {/* Header bar -- ticket name, receipt icon, standard Square-style top strip */}
        <div style={{ backgroundColor: SQ.panel, borderBottom: `1px solid ${SQ.line}`, padding: '0.7rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: SQ.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Printer size={16} color="white" />
            </div>
            <div>
              <p style={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.1 }}>{current?.customer_name || 'Ticket'}</p>
              {/* Read-only. Per Daisy: "we don't in this app really need to
                  worry about which table anyone's on. That's for the girls,
                  it's for Square -- they set it." The table shown here comes
                  from the Square appointment and is a label, not something
                  this app decides. Nothing is offered to tap. */}
              {current?.table_number && (
                <p style={{ color: SQ.sub, fontSize: '0.72rem' }}>Table {current.table_number}</p>
              )}
            </div>
          </div>
          <button onClick={() => router.push('/floor')} style={{ background: 'none', border: 'none', color: SQ.sub, fontSize: '0.8rem', cursor: 'pointer' }}>
            <Home size={20} />
          </button>
        </div>


        {current?.notes && (
          <div style={{ backgroundColor: '#FFF4D6', borderBottom: '1px solid #E0C060', padding: '0.5rem 1rem', fontSize: '0.8rem' }}>
            <strong>Note:</strong> {current.notes}
          </div>
        )}

        {/* Who's this for -- real per-person billing. Shared (null) is the
            default and behaves exactly as every booking always has.
            Picking a name here just tags whatever's added next; nothing
            retroactively changes for items already on the till. */}
        <div style={{ backgroundColor: SQ.panel, borderBottom: `1px solid ${SQ.line}`, padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: SQ.sub, marginRight: '0.2rem' }}>Adding for:</span>
          <button
            onClick={() => setActivePersonTag(null)}
            style={{ padding: '0.3rem 0.7rem', borderRadius: 999, fontSize: '0.78rem', cursor: 'pointer', border: activePersonTag === null ? `1.5px solid ${SQ.accent}` : `1px solid ${SQ.line}`, backgroundColor: activePersonTag === null ? SQ.accent + '15' : 'transparent', color: activePersonTag === null ? SQ.accentDark : SQ.ink, fontWeight: activePersonTag === null ? 700 : 400 }}
          >
            Shared
          </button>
          {Array.from(new Set(tillItems.map((i) => i.person_name).filter((n): n is string => !!n))).map((name) => (
            <button
              key={name}
              onClick={() => setActivePersonTag(name)}
              style={{ padding: '0.3rem 0.7rem', borderRadius: 999, fontSize: '0.78rem', cursor: 'pointer', border: activePersonTag === name ? `1.5px solid ${SQ.accent}` : `1px solid ${SQ.line}`, backgroundColor: activePersonTag === name ? SQ.accent + '15' : 'transparent', color: activePersonTag === name ? SQ.accentDark : SQ.ink, fontWeight: activePersonTag === name ? 700 : 400 }}
            >
              {name}
            </button>
          ))}
          {!addingPerson ? (
            <button
              onClick={() => setAddingPerson(true)}
              style={{ padding: '0.3rem 0.6rem', borderRadius: 999, fontSize: '0.78rem', cursor: 'pointer', border: `1px dashed ${SQ.line}`, background: 'transparent', color: SQ.sub }}
            >
              + Add person
            </button>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="text"
                value={newPersonInput}
                onChange={(e) => setNewPersonInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPersonInput.trim()) {
                    setActivePersonTag(newPersonInput.trim());
                    setNewPersonInput('');
                    setAddingPerson(false);
                  }
                }}
                placeholder="Name"
                autoFocus
                maxLength={30}
                style={{ width: '7rem', padding: '0.25rem 0.5rem', borderRadius: 6, border: `1px solid ${SQ.line}`, fontSize: '0.78rem' }}
              />
              <button
                onClick={() => { if (newPersonInput.trim()) { setActivePersonTag(newPersonInput.trim()); setNewPersonInput(''); } setAddingPerson(false); }}
                style={{ padding: '0.25rem 0.5rem', borderRadius: 6, border: 'none', backgroundColor: SQ.accent, color: 'white', fontSize: '0.72rem', cursor: 'pointer' }}
              >
                Add
              </button>
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem', maxWidth: 1100, margin: '0 auto' }}>
          {/* Left: category tabs + item grid */}
          <div style={{ flex: '1 1 60%', minWidth: 300 }}>
            {menu.length > 0 && !activeGroup && (
              <>
                <p style={{ color: SQ.sub, fontSize: '0.75rem', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Categories</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.6rem' }}>
                  {menu.map((g, idx) => (
                    <button
                      key={g.key}
                      onClick={() => setActiveGroup(g)}
                      style={{ aspectRatio: '1.4', borderRadius: 8, border: 'none', backgroundColor: colourFor(idx), color: 'white', fontWeight: 700, fontSize: '0.9rem', textAlign: 'left', padding: '0.8rem', cursor: 'pointer' }}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {activeGroup && !activeSubsection && (
              <>
                <button onClick={backToTillMenu} style={{ color: SQ.accent, background: 'none', border: 'none', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.7rem', padding: 0, cursor: 'pointer' }}>
                  ← Back to Till
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.6rem' }}>
                  {activeGroup.subsections.map((s: any, idx: number) => (
                    <button
                      key={s.category}
                      onClick={() => { setActiveSubsection(s); setActiveBucket(null); setShowAllItems(false); }}
                      style={{ aspectRatio: '1.4', borderRadius: 8, border: 'none', backgroundColor: colourFor(idx), color: 'white', fontWeight: 700, fontSize: '0.88rem', textAlign: 'left', padding: '0.8rem', cursor: 'pointer' }}
                    >
                      {s.label}
                      <span style={{ display: 'block', fontWeight: 400, fontSize: '0.72rem', opacity: 0.85, marginTop: '0.2rem' }}>{s.items.length} items</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {activeSubsection && (
              <>
                <button onClick={backToTillMenu} style={{ color: SQ.accent, background: 'none', border: 'none', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.7rem', padding: 0, cursor: 'pointer' }}>
                  ← Back to Till
                </button>

                {activeSubsection.buckets && !activeBucket ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.6rem' }}>
                    {activeSubsection.buckets.map((bk: any, idx: number) => (
                      <button
                        key={bk.label}
                        onClick={() => { setActiveBucket(bk); setShowAllItems(false); }}
                        style={{ aspectRatio: '1.4', borderRadius: 8, border: 'none', backgroundColor: colourFor(idx), color: 'white', fontWeight: 700, fontSize: '0.88rem', textAlign: 'left', padding: '0.8rem', cursor: 'pointer' }}
                      >
                        {bk.label}
                        <span style={{ display: 'block', fontWeight: 400, fontSize: '0.72rem', opacity: 0.85, marginTop: '0.2rem' }}>{bk.items.length} items</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
                      {(showAllItems ? activeList : activeList?.slice(0, 12))?.map((entry: any, idx: number) => {
                        const colour = colourFor(idx);
                        if (entry.kind === 'customisable') {
                          return (
                            <button
                              key={idx}
                              onClick={() => { setCustomising(entry); setPickedFlavour(null); }}
                              style={{ aspectRatio: '1', borderRadius: 8, border: `1px solid ${SQ.line}`, backgroundColor: SQ.panel, borderTop: `4px solid ${colour}`, color: SQ.ink, fontSize: '0.8rem', textAlign: 'left', padding: '0.6rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                            >
                              <span style={{ fontWeight: 600 }}>{entry.base}</span>
                              <span style={{ color: SQ.sub, fontSize: '0.75rem' }}>from £{(entry.from_price_cents / 100).toFixed(2)}</span>
                            </button>
                          );
                        }
                        return (
                          <button
                            key={idx}
                            onClick={() => addTillItem(entry)}
                            disabled={tillBusy}
                            style={{ aspectRatio: '1', borderRadius: 8, border: `1px solid ${SQ.line}`, backgroundColor: SQ.panel, borderTop: `4px solid ${colour}`, color: SQ.ink, fontSize: '0.8rem', textAlign: 'left', padding: '0.6rem', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', opacity: tillBusy ? 0.6 : 1 }}
                          >
                            <span style={{ fontWeight: 600, lineHeight: 1.2 }}>{entry.item_name}</span>
                            {entry.price_cents ? <span style={{ color: SQ.sub, fontSize: '0.75rem' }}>£{(entry.price_cents / 100).toFixed(2)}</span> : null}
                          </button>
                        );
                      })}
                    </div>
                    {!showAllItems && (activeList?.length || 0) > 12 && (
                      <button onClick={() => setShowAllItems(true)} style={{ width: '100%', marginTop: '0.6rem', padding: '0.6rem', borderRadius: 8, border: `1px solid ${SQ.line}`, background: SQ.panel, color: SQ.sub, fontSize: '0.82rem', cursor: 'pointer' }}>
                        + {(activeList?.length || 0) - 12} more
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Right: ticket panel */}
          <div style={{ flex: '1 1 32%', minWidth: 260 }}>
            {/* Live from Square -- read-only, separate from GlazeUp's own
                till below. What's actually been rung up on the real
                handheld right now, per Daisy's request. */}
            <div style={{ backgroundColor: SQ.panel, borderRadius: 10, border: `1px solid ${SQ.accent}`, overflow: 'hidden', marginBottom: '0.8rem' }}>
              <div style={{ padding: '0.7rem 1rem', borderBottom: `1px solid ${SQ.line}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: SQ.accentDark }}>Live from Square</span>
                <button
                  onClick={() => current && loadLiveSquareOrder(current.booking_code)}
                  disabled={liveSquareLoading}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: SQ.sub, display: 'flex', alignItems: 'center' }}
                  aria-label="Refresh live Square order"
                >
                  <RefreshCw size={14} className={liveSquareLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              <div style={{ padding: '0.7rem 1rem' }}>
                {liveSquareLoading && !liveSquareOrder ? (
                  <p style={{ color: SQ.sub, fontSize: '0.78rem' }}>Checking Square...</p>
                ) : liveSquareOrder?.matched && liveSquareOrder.order ? (
                  <>
                    {liveSquareOrder.multiple_candidates && (
                      <p style={{ color: '#B8860B', fontSize: '0.72rem', marginBottom: '0.4rem' }}>
                        ⚠ More than one open ticket matches this table — showing the most recently updated.
                      </p>
                    )}
                    <p style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: '0.3rem' }}>"{liveSquareOrder.order.ticket_name}"</p>
                    <div style={{ maxHeight: '16vh', overflowY: 'auto', marginBottom: '0.4rem' }}>
                      {liveSquareOrder.order.items.map((it, idx) => (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', padding: '0.15rem 0' }}>
                          <span>{it.quantity > 1 ? `${it.quantity}x ` : ''}{it.name}</span>
                          {it.total_gbp !== null && <span style={{ color: SQ.sub }}>£{it.total_gbp.toFixed(2)}</span>}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.4rem', borderTop: `1px solid ${SQ.line}` }}>
                      <span style={{ color: SQ.sub, fontSize: '0.78rem' }}>Square total</span>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>£{(liveSquareOrder.order.total_gbp ?? 0).toFixed(2)}</span>
                    </div>
                  </>
                ) : liveSquareOrder?.reason === 'no_table_set' ? (
                  <p style={{ color: SQ.sub, fontSize: '0.78rem' }}>Set a table number to match against Square.</p>
                ) : liveSquareOrder?.reason === 'no_open_ticket_for_table' ? (
                  <p style={{ color: SQ.sub, fontSize: '0.78rem' }}>No open Square ticket found for {current?.table_number ? `Table ${current.table_number}` : 'this table'}.</p>
                ) : liveSquareOrder?.reason === 'table_number_has_no_digits' ? (
                  <p style={{ color: SQ.sub, fontSize: '0.78rem' }}>Table "{liveSquareOrder.table_number}" has no number to match on Square.</p>
                ) : (
                  <p style={{ color: SQ.sub, fontSize: '0.78rem' }}>Could not check Square right now.</p>
                )}
              </div>
            </div>

            <div style={{ backgroundColor: SQ.panel, borderRadius: 10, border: `1px solid ${SQ.line}`, overflow: 'hidden', position: 'sticky', top: '1rem' }}>
              <div style={{ padding: '0.8rem 1rem', borderBottom: `1px solid ${SQ.line}`, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Printer size={16} color={SQ.sub} />
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>GlazeUp Till</span>
              </div>

              {pieceCount > 0 && (
                <div style={{ padding: '0.5rem 1rem', borderBottom: `1px solid ${SQ.line}`, fontSize: '0.78rem', color: SQ.sub }}>
                  {pieceCount} piece{pieceCount === 1 ? '' : 's'} captured from photo
                </div>
              )}

              <div style={{ maxHeight: '32vh', overflowY: 'auto' }}>
                {tillItems.length === 0 ? (
                  <p style={{ padding: '1.2rem 1rem', color: SQ.sub, fontSize: '0.82rem', textAlign: 'center' }}>No items yet</p>
                ) : (
                  tillItems.map((i) => (
                    <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1rem', borderBottom: `1px solid ${SQ.line}` }}>
                      <span style={{ fontSize: '0.85rem' }}>
                        {i.quantity > 1 ? `${i.quantity}x ` : ''}{i.item_name}
                        {i.person_name && <span style={{ display: 'block', fontSize: '0.68rem', color: SQ.accent, fontWeight: 600 }}>{i.person_name}</span>}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>£{((i.unit_price_cents * i.quantity) / 100).toFixed(2)}</span>
                        <button onClick={() => removeTillItem(i.id)} style={{ color: '#C0392B', background: 'none', border: 'none', fontSize: '1rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
                      </span>
                    </div>
                  ))
                )}
              </div>

              <div style={{ padding: '0.8rem 1rem', borderTop: `1px solid ${SQ.line}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <span style={{ color: SQ.sub, fontSize: '0.85rem' }}>Total</span>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>£{(tillTotal / 100).toFixed(2)}</span>
                </div>

                {tillItems.length > 0 && (
                  <div style={{ marginTop: '0.6rem', marginBottom: '0.6rem' }}>
                    <p style={{ color: SQ.sub, fontSize: '0.72rem', marginBottom: '0.4rem' }}>Split bill</p>
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <button
                          key={n}
                          onClick={() => setSplitBillCount(n)}
                          style={{
                            padding: '0.3rem 0.6rem', borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer',
                            border: splitBillCount === n ? `1.5px solid ${SQ.accent}` : `1px solid ${SQ.line}`,
                            backgroundColor: splitBillCount === n ? SQ.accent + '15' : 'transparent',
                            color: splitBillCount === n ? SQ.accentDark : SQ.sub,
                            fontWeight: splitBillCount === n ? 700 : 400,
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    {splitBillCount > 1 && (
                      <p style={{ color: SQ.accentDark, fontSize: '0.78rem', fontWeight: 600, marginTop: '0.4rem' }}>
                        £{((tillTotal / splitBillCount) / 100).toFixed(2)} each
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={() => setPhase(4)}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: 8, border: 'none', backgroundColor: SQ.accent, color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
                >
                  Continue to Completion <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <NudgeCard id="floor_till" />
        {tillItems.length > 0 && <NudgeCard id="floor_split_bill" />}

        {customising && (
          <div
            onClick={() => setCustomising(null)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', zIndex: 70 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: SQ.panel, borderRadius: 14, padding: '1.5rem', maxWidth: 360, width: '100%', border: `1px solid ${SQ.line}` }}>
              <h3 style={{ color: SQ.ink, fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.3rem' }}>{customising.base}</h3>
              <p style={{ color: SQ.sub, fontSize: '0.8rem', marginBottom: '1rem' }}>
                {pickedFlavour ? 'Milk?' : customising.flavours.length > 1 || customising.flavours[0] !== '(plain)' ? 'Syrup?' : 'Milk?'}
              </p>

              {!pickedFlavour ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {customising.flavours.map((f: string) => (
                    <button
                      key={f}
                      onClick={() => setPickedFlavour(f)}
                      style={{ padding: '0.7rem 0.5rem', borderRadius: 8, border: 'none', backgroundColor: f === '(plain)' ? SQ.sub : SQ.accent, color: 'white', fontSize: '0.82rem', cursor: 'pointer' }}
                    >
                      {f === '(plain)' ? 'No syrup' : f}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {customising.milks.map((m: string) => {
                    const match = customising.lookup[`${pickedFlavour}|${m}`];
                    return (
                      <button
                        key={m}
                        onClick={() => { if (match) { addTillItem(match); setCustomising(null); } }}
                        disabled={!match || tillBusy}
                        style={{ padding: '0.7rem 0.5rem', borderRadius: 8, border: 'none', backgroundColor: SQ.accent, color: 'white', fontSize: '0.82rem', textAlign: 'left', cursor: 'pointer', opacity: !match || tillBusy ? 0.5 : 1 }}
                      >
                        {m}
                        {match?.price_cents ? <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.85 }}>£{(match.price_cents / 100).toFixed(2)}</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                {pickedFlavour && (
                  <button onClick={() => setPickedFlavour(null)} style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: `1px solid ${SQ.line}`, backgroundColor: 'transparent', color: SQ.ink, fontSize: '0.8rem', cursor: 'pointer' }}>
                    ← Back
                  </button>
                )}
                <button onClick={() => setCustomising(null)} style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: `1px solid ${SQ.line}`, backgroundColor: 'transparent', color: SQ.ink, fontSize: '0.8rem', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============ PHASE 4: COMPLETION (real photo, real finish) ============
  if (phase === 4) {
    // Payment is no longer a gate. It doesn't take any money -- Square
    // does the charging, and sync-finished-from-square already reads the
    // real payment back off Square afterwards. Requiring it here forced
    // a tap to re-declare something the system finds out on its own, and
    // on a £0.00 table it demanded card-or-cash about nothing.
    //
    // Collection stays required: studio pickup vs postal genuinely
    // changes what happens to the pottery, and nothing outside this app
    // knows which it is.
    // The collection date is gone. Per Daisy it is a promise made to the
    // customer, not a state of the pottery -- the studio tells them when it
    // will be ready and fires the kiln in good time. Keeping it here made
    // the app the third place that opinion lived, and it caused three real
    // bugs in a day: a +14 default that promised the wrong week, a packing
    // queue that showed nothing until the date arrived, and a batch move
    // that needed a date to move to.
    const finishDisabled =
      saving || !collectionMethod ||
      (collectionMethod === 'postal' && !postalPostcode.trim());
    // Real per-person breakdown -- only shows up if anyone was actually
    // tagged while adding items. Bookings that never use this feature look
    // exactly as they always have.
    const namedPeople = Array.from(new Set(tillItems.map((i) => i.person_name).filter((n): n is string => !!n)));
    const sharedTotal = tillItems.filter((i) => !i.person_name).reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);
    const personTotal = (name: string) => tillItems.filter((i) => i.person_name === name).reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: B.charcoal }}>
        <div className="max-w-2xl mx-auto">
          <Header label={`Step ${tillEnabled ? 4 : 3}/${tillEnabled ? 5 : 4} · Completion`} />

          {/* Totals summary */}
          <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
            <p style={{ color: B.ivory, fontWeight: 700, fontSize: '0.95rem' }}>{current?.customer_name}</p>
            {/* Payment is taken on the real Square till, not in the app --
                so this only shows if a total genuinely exists (e.g. an
                older booking that used the in-app till), rather than
                displaying a meaningless £0.00 on every table. */}
            {tillTotal > 0 && (
              <div className="flex justify-between mt-1">
                <span style={{ color: B.stone, fontSize: '0.8rem' }}>Till total</span>
                <span style={{ color: B.ivory, fontWeight: 700, fontSize: '0.9rem' }}>£{(tillTotal / 100).toFixed(2)}</span>
              </div>
            )}
            {splitBillCount > 1 && (
              <div className="flex justify-between mt-1">
                <span style={{ color: B.stone, fontSize: '0.75rem' }}>Split {splitBillCount} ways</span>
                <span style={{ color: B.sand, fontSize: '0.8rem' }}>£{((tillTotal / splitBillCount) / 100).toFixed(2)} each</span>
              </div>
            )}
          </div>

          {/* Real per-person breakdown -- own subtotal, own collection
              method, own payment. Separate from the whole-booking section
              below, which still applies to anything left 'Shared'. */}
          {namedPeople.length > 0 && (
            <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
              <p style={{ color: B.stone, fontSize: '0.75rem', marginBottom: '0.7rem' }}>Paying/collecting separately</p>
              {sharedTotal > 0 && (
                <div className="flex justify-between mb-2" style={{ paddingBottom: '0.5rem', borderBottom: `1px solid ${B.stone}30` }}>
                  <span style={{ color: B.ivory, fontSize: '0.82rem' }}>Shared (whole table)</span>
                  <span style={{ color: B.sand, fontWeight: 700, fontSize: '0.82rem' }}>£{(sharedTotal / 100).toFixed(2)}</span>
                </div>
              )}
              {namedPeople.map((name) => {
                const pref = personCollection[name] || { collection_method: null, postal_postcode: '', payment_method: null };
                return (
                  <div key={name} style={{ marginBottom: '0.9rem', paddingBottom: '0.9rem', borderBottom: `1px solid ${B.stone}30` }}>
                    <div className="flex justify-between mb-2">
                      <span style={{ color: B.ivory, fontWeight: 700, fontSize: '0.85rem' }}>{name}</span>
                      <span style={{ color: B.sand, fontWeight: 700, fontSize: '0.85rem' }}>£{(personTotal(name) / 100).toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' }}>
                      <button
                        onClick={() => setPersonCollection((prev) => ({ ...prev, [name]: { ...pref, collection_method: 'studio' } }))}
                        style={{ padding: '0.5rem', borderRadius: 6, fontSize: '0.75rem', border: pref.collection_method === 'studio' ? `2px solid ${B.clay}` : `1px solid ${B.stone}`, backgroundColor: pref.collection_method === 'studio' ? B.clay + '30' : 'transparent', color: B.ivory }}
                      >
                        🏠 Studio
                      </button>
                      <button
                        onClick={() => setPersonCollection((prev) => ({ ...prev, [name]: { ...pref, collection_method: 'postal' } }))}
                        style={{ padding: '0.5rem', borderRadius: 6, fontSize: '0.75rem', border: pref.collection_method === 'postal' ? `2px solid ${B.clay}` : `1px solid ${B.stone}`, backgroundColor: pref.collection_method === 'postal' ? B.clay + '30' : 'transparent', color: B.ivory }}
                      >
                        📮 Postal
                      </button>
                    </div>
                    {pref.collection_method === 'postal' && (
                      <input
                        type="text"
                        value={pref.postal_postcode}
                        onChange={(e) => setPersonCollection((prev) => ({ ...prev, [name]: { ...pref, postal_postcode: e.target.value } }))}
                        placeholder="Their postcode"
                        style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: 6, border: `1px solid ${B.stone}`, backgroundColor: B.charcoal, color: B.ivory, fontSize: '0.78rem', marginBottom: '0.4rem' }}
                      />
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' }}>
                      <button
                        onClick={() => setPersonCollection((prev) => ({ ...prev, [name]: { ...pref, payment_method: 'card' } }))}
                        style={{ padding: '0.5rem', borderRadius: 6, fontSize: '0.75rem', border: pref.payment_method === 'card' ? `2px solid ${B.clay}` : `1px solid ${B.stone}`, backgroundColor: pref.payment_method === 'card' ? B.clay + '30' : 'transparent', color: B.ivory }}
                      >
                        💳 Card
                      </button>
                      <button
                        onClick={() => setPersonCollection((prev) => ({ ...prev, [name]: { ...pref, payment_method: 'cash' } }))}
                        style={{ padding: '0.5rem', borderRadius: 6, fontSize: '0.75rem', border: pref.payment_method === 'cash' ? `2px solid ${B.clay}` : `1px solid ${B.stone}`, backgroundColor: pref.payment_method === 'cash' ? B.clay + '30' : 'transparent', color: B.ivory }}
                      >
                        💵 Cash
                      </button>
                    </div>
                    <button
                      onClick={() => savePersonCollection(name)}
                      disabled={savingPersonCollection === name || !pref.collection_method}
                      style={{ width: '100%', padding: '0.4rem', borderRadius: 6, border: 'none', backgroundColor: B.clay, color: B.ivory, fontSize: '0.75rem', fontWeight: 700, opacity: !pref.collection_method ? 0.5 : 1 }}
                    >
                      {savingPersonCollection === name ? 'Saving...' : `Save ${name}'s choice`}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Collection method */}
          <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
            <p style={{ color: B.stone, fontSize: '0.75rem', marginBottom: '0.5rem' }}>{namedPeople.length > 0 ? 'Collection — shared items / whole booking fallback' : 'Collection'}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                onClick={() => setCollectionMethod('studio')}
                style={{ padding: '0.7rem', borderRadius: 8, border: collectionMethod === 'studio' ? `2px solid ${B.clay}` : `1px solid ${B.stone}`, backgroundColor: collectionMethod === 'studio' ? B.clay + '30' : 'transparent', color: B.ivory, fontSize: '0.85rem', fontWeight: 600 }}
              >
                🏠 Studio pickup
              </button>
              <button
                onClick={() => setCollectionMethod('postal')}
                style={{ padding: '0.7rem', borderRadius: 8, border: collectionMethod === 'postal' ? `2px solid ${B.clay}` : `1px solid ${B.stone}`, backgroundColor: collectionMethod === 'postal' ? B.clay + '30' : 'transparent', color: B.ivory, fontSize: '0.85rem', fontWeight: 600 }}
              >
                📮 Postal
              </button>
            </div>
            {collectionMethod === 'postal' && (
              <input
                type="text"
                value={postalPostcode}
                onChange={(e) => setPostalPostcode(e.target.value)}
                placeholder="Destination postcode"
                style={{ marginTop: '0.6rem', width: '100%', padding: '0.5rem 0.6rem', borderRadius: 8, border: `1px solid ${B.stone}`, backgroundColor: B.charcoal, color: B.ivory, fontSize: '0.85rem' }}
              />
            )}
          </div>

          {/* Payment is not taken here at all. The money happens on the
              Square till; this app's job is to KNOW the position, not to
              ask someone to retype it. Per Daisy: "we're just using the
              Square till points now... they'll have their own payment
              system as long as the system knows that it's been paid for."
              That generalises -- a studio on Zettle or SumUp gets the
              same read-only line, and nothing here assumes Square.

              So this reports what the till says and offers nothing to
              tap. An open ticket means money still to take; no open
              ticket for a table that had items means it's been rung
              through and closed. */}
          {tillTotal > 0 && (
          <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: B.sand + '18', border: `1px solid ${B.stone}` }}>
            <p style={{ color: B.stone, fontSize: '0.75rem', marginBottom: '0.35rem' }}>Payment · taken on the till</p>
            {liveSquareOrder?.matched && liveSquareOrder.order ? (
              <p style={{ color: B.ivory, fontSize: '0.85rem', fontWeight: 600 }}>
                Ticket &quot;{liveSquareOrder.order.ticket_name}&quot; still open · £{(liveSquareOrder.order.total_gbp ?? 0).toFixed(2)} to take
              </p>
            ) : liveSquareOrder?.reason === 'no_open_ticket_for_table' ? (
              <p style={{ color: '#7BB661', fontSize: '0.85rem', fontWeight: 600 }}>
                No open ticket for this table — looks settled
              </p>
            ) : (
              <p style={{ color: B.stone, fontSize: '0.8rem' }}>
                £{(tillTotal / 100).toFixed(2)} on this table. Settle it on the till as usual.
              </p>
            )}
          </div>
          )}

          {/* Photo */}
          <div className="rounded-lg p-6" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
            <div className="text-center mb-5">
              <h2 className="text-xl font-bold" style={{ color: B.ivory }}>Photograph the pieces</h2>
              <p style={{ color: B.stone, fontSize: '0.8rem' }}>Real photo, confirmed against {current?.customer_name}&apos;s booking</p>
            </div>

            {/* The gentle nudge, per Daisy: "if a bad photograph's taken and
                nothing's visible for the initial AI, then we've got a
                problem." This is the single point in the whole app where a
                careless moment cannot be recovered later -- the table gets
                cleared, the pieces go on a shelf, and no amount of
                re-identifying will find what was never in frame.
                Framed as help rather than a warning: the person holding
                the iPad is busy, not careless. */}
            {!photoPreview && (
              <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.7rem 0.8rem', borderRadius: 8, backgroundColor: B.clay + '22', border: `1px solid ${B.clay}`, marginBottom: '1rem' }}>
                <Camera size={17} color={B.clay} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ color: B.ivory, fontSize: '0.82rem', fontWeight: 700 }}>Get every piece in the shot</p>
                  <p style={{ color: B.stone, fontSize: '0.76rem', marginTop: '0.15rem', lineHeight: 1.35 }}>
                    Anything not in the photo can&apos;t be found on the shelf later. Stand back, get all {pieceCount > 0 ? pieceCount : 'the'} piece{pieceCount === 1 ? '' : 's'} in frame, and keep the painted side showing.
                  </p>
                </div>
              </div>
            )}

            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
            {!photoPreview ? (
              <button onClick={() => fileRef.current?.click()} className="w-full py-8 rounded-lg flex flex-col items-center gap-2 mb-4" style={{ backgroundColor: B.charcoal, border: `2px dashed ${B.stone}` }}>
                <Camera size={28} color={B.clay} />
                <span style={{ color: B.stone, fontSize: '0.85rem' }}>Tap to photograph</span>
              </button>
            ) : (
              <>
                {/* Real numbered boxes over each identified piece, so
                    staff can check the AI got them all before finishing.
                    Same box format and colours as Find on Table. */}
                <div style={{ position: 'relative', marginBottom: '1rem' }}>
                  <img src={photoPreview} alt="" style={{ width: '100%', borderRadius: 8, display: 'block' }} onClick={() => fileRef.current?.click()} />
                  {identifiedPieces?.map((p, i) => (
                    p.box && (
                      <div
                        key={p.index}
                        style={{
                          position: 'absolute',
                          left: `${p.box.left_pct}%`,
                          top: `${p.box.top_pct}%`,
                          width: `${p.box.right_pct - p.box.left_pct}%`,
                          height: `${p.box.bottom_pct - p.box.top_pct}%`,
                          border: `3px solid ${['#e0392b', '#1a8a3c', '#2b6fe0', '#c77a0a', '#8b3ec7', '#0a9aa8'][i % 6]}`,
                          borderRadius: 4,
                          boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                          pointerEvents: 'none',
                        }}
                      >
                        <span style={{ position: 'absolute', top: -9, left: -9, width: 20, height: 20, borderRadius: '50%', backgroundColor: ['#e0392b', '#1a8a3c', '#2b6fe0', '#c77a0a', '#8b3ec7', '#0a9aa8'][i % 6], color: 'white', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px white' }}>
                          {p.index}
                        </span>
                      </div>
                    )
                  ))}
                </div>

                {identifying && (
                  <p style={{ color: B.stone, fontSize: '0.8rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Loader size={14} className="animate-spin" /> Identifying pieces...
                  </p>
                )}

                {identifiedPieces && identifiedPieces.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    <p style={{ color: B.ivory, fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                      {identifiedPieces.length} piece{identifiedPieces.length === 1 ? '' : 's'} identified — check before finishing
                    </p>
                    {identifiedPieces.map((p, i) => (
                      <div key={p.index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.4rem 0' }}>
                        <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', backgroundColor: ['#e0392b', '#1a8a3c', '#2b6fe0', '#c77a0a', '#8b3ec7', '#0a9aa8'][i % 6], color: 'white', fontSize: '0.62rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                          {p.index}
                        </span>
                        <div style={{ flex: 1 }}>
                          <p style={{ color: B.ivory, fontSize: '0.8rem', fontWeight: 600 }}>{p.piece_type}</p>
                          <p style={{ color: B.stone, fontSize: '0.72rem' }}>{p.description}</p>
                        </div>
                      </div>
                    ))}
                    <p style={{ color: B.stone, fontSize: '0.72rem', marginTop: '0.4rem' }}>
                      Wrong count? Tap the photo to retake it.
                    </p>
                  </div>
                )}

                {identifiedPieces && identifiedPieces.length === 0 && !identifying && (
                  <p style={{ color: B.stone, fontSize: '0.8rem', marginBottom: '1rem' }}>
                    No pieces identified — tap the photo to retake, or carry on and add them later.
                  </p>
                )}
              </>
            )}

            <button
              onClick={saveAndFinish}
              disabled={finishDisabled}
              className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2"
              style={{ backgroundColor: B.clay, color: B.ivory, opacity: finishDisabled ? 0.5 : 1 }}
            >
              {saving ? <><Loader size={18} className="animate-spin" /> Saving...</> : <>Finish &amp; Hand off <ChevronRight size={20} /></>}
            </button>
            {!collectionMethod && (
              <p style={{ color: B.stone, fontSize: '0.7rem', textAlign: 'center', marginTop: '0.5rem' }}>Choose collecting or posting above to finish</p>
            )}
          </div>
        </div>
        <NudgeCard id="floor_completion" />
        <NudgeCard id="floor_photo" />
      </div>
    );
  }

  // ============ PHASE 5: HAND-OFF ============
  return (
    <div className="min-h-screen p-4" style={{ backgroundColor: B.charcoal }}>
      <div className="max-w-2xl mx-auto">
        <Header label={`Step ${tillEnabled ? 5 : 4}/${tillEnabled ? 5 : 4} · Hand-off`} />
        <div className="rounded-lg p-8" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
          <div className="text-center mb-6">
            <span className="text-4xl">✅</span>
            <h2 className="text-xl font-bold mt-3" style={{ color: B.ivory }}>Hand-off</h2>
          </div>
          <div className="space-y-4 mb-8">
            <div className="p-4 rounded-lg text-center" style={{ backgroundColor: B.charcoal }}>
              <p style={{ color: B.sand }} className="text-xs font-mono">{current?.booking_code}</p>
              <p style={{ color: B.stone }} className="text-xs mt-1">{current?.customer_name}</p>
            </div>
            <div className="p-4 rounded-lg" style={{ backgroundColor: B.charcoal }}>
              <p style={{ color: B.ivory }} className="font-bold text-sm">Session complete</p>
              <p style={{ color: B.stone }} className="text-xs mt-2">
                {pieceCount} piece{pieceCount === 1 ? '' : 's'} · £{(tillTotal / 100).toFixed(2)} till total{finished ? ' · marked finished' : ''}
              </p>
              {collectionMethod && (
                <p style={{ color: B.stone }} className="text-xs mt-1">
                  {collectionMethod === 'postal' ? `📮 Postal to ${postalPostcode}` : '🏠 Studio pickup'}
                </p>
              )}
              {photo && <p style={{ color: '#7ec98a' }} className="text-xs mt-1 flex items-center gap-1"><Check size={12} /> Photo confirmed to booking</p>}
            </div>
          </div>
          <button onClick={() => window.print()} className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 mb-2" style={{ backgroundColor: B.stone, color: B.charcoal }}>
            <Printer size={18} /> Print card
          </button>
          <button onClick={nextBooking} className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2" style={{ backgroundColor: B.clay, color: B.ivory }}>
            Next Booking <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <NudgeCard id="floor_handoff" />
    </div>
  );
}
