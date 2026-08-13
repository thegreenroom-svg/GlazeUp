'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronRight, Home, Camera, Printer, Check, Loader, RefreshCw } from 'lucide-react';
import QRCode from 'qrcode';
import { NudgeCard, HelpButton } from '@/components/NudgeSystem';

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
  const [splitBillCount, setSplitBillCount] = useState(1);
  const [quickAccessMode, setQuickAccessMode] = useState(false);
  const [tableTotals, setTableTotals] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash' | null>(null);
  const [collectionMethod, setCollectionMethod] = useState<'studio' | 'postal' | null>(null);
  const [postalPostcode, setPostalPostcode] = useState('');
  const [collectionDate, setCollectionDate] = useState('');
  const [liveSquareOrder, setLiveSquareOrder] = useState<{
    matched: boolean; reason?: string; multiple_candidates?: boolean; table_number?: string;
    order: { ticket_name: string; total_gbp: number | null; items: { name: string; quantity: number; total_gbp: number | null }[]; updated_at: string } | null;
  } | null>(null);
  const [liveSquareLoading, setLiveSquareLoading] = useState(false);
  const [editingTableInline, setEditingTableInline] = useState(false);
  const [tableDraftInline, setTableDraftInline] = useState('');
  const [savingTableInline, setSavingTableInline] = useState(false);
  const [tillItems, setTillItems] = useState<TillItem[]>([]);
  const [tillBusy, setTillBusy] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [finished, setFinished] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const tillTotal = tillItems.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);

  useEffect(() => {
    const dayStr = new Date(floorDate).toDateString();
    const dayBookings = allBookings
      .filter((b) => new Date(b.session_start).toDateString() === dayStr)
      .sort((a, b) => new Date(a.session_start).getTime() - new Date(b.session_start).getTime());
    setBookings(dayBookings.slice(0, 30));
  }, [floorDate, allBookings]);

  const loadBookings = async () => {
    setLoading(true);
    setQuickAccessMode(false);
    try {
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
  const saveTableInline = async () => {
    if (!current) return;
    const value = tableDraftInline.trim();
    if (!value) return;
    setSavingTableInline(true);
    try {
      const res = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${current.booking_code}/table-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: value }),
      });
      if (!res.ok) return;
      setCurrent({ ...current, table_number: value });
      setEditingTableInline(false);
      loadLiveSquareOrder(current.booking_code);
    } finally {
      setSavingTableInline(false);
    }
  };

  const selectBooking = async (b: Booking) => {
    setCurrent(b);
    setPieceCount(0);  // Start at 0 - will be populated from Phase 2 photo (or show unfinished pieces if returning customer)
    setTillItems([]);
    setFinished(false);
    setActiveGroup(null);
    setActiveSubsection(null);
    setActiveBucket(null);
    setShowAllItems(false);
    setPaymentMethod(null);
    setCollectionMethod(null);
    setPostalPostcode('');
    setCollectionDate(defaultCollectionDate());
    setLiveSquareOrder(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${b.booking_code}/till`);
      const d = res.ok ? await res.json() : [];
      setTillItems(Array.isArray(d) ? d : d?.items || []);
    } catch { /* fresh table, no till yet */ }
    loadLiveSquareOrder(b.booking_code);
    setPhase(3);
  };

  // Sensible default for the collection date field -- 14 days out, a
  // typical bisque + glaze firing turnaround. Staff can change it; this
  // just saves re-typing the same date on every booking.
  const defaultCollectionDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  };

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
        body: JSON.stringify({ item_name: m.item_name, category: m.category, quantity: 1, unit_price_cents: m.price_cents ?? 0 }),
      });
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${current.booking_code}/till`);
      const d = res.ok ? await res.json() : [];
      setTillItems(Array.isArray(d) ? d : d?.items || []);
    } finally {
      setTillBusy(false);
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

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPhoto(f);
    setPhotoPreview(URL.createObjectURL(f));
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
        formData.append('description', `${pieceCount} pieces, Start Floor hand-off`);
        formData.append('confirmed_by', 'start-floor');
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/photo-match/confirm`, { method: 'POST', body: formData });
      }

      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${current.booking_code}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finished_by: 'start-floor',
          payment_method: paymentMethod,
          collection_method: collectionMethod,
          postal_postcode: collectionMethod === 'postal' ? postalPostcode.trim() : undefined,
          collection_date: collectionDate || undefined,
          till_total_cents: tillTotal,
          split_bill_count: splitBillCount > 1 ? splitBillCount : undefined,
        }),
      });
      setFinished(true);

      const url = `${window.location.origin}/customer?booking=${encodeURIComponent(current.booking_code)}`;
      setQrUrl(url);
      setSaved(true);
      setPhase(5);
      setTimeout(async () => {
        const c = canvasRef.current;
        if (!c) return;
        const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 160 });
        const img = new Image();
        img.onload = () => c.getContext('2d')?.drawImage(img, 0, 0, 160, 160);
        img.src = dataUrl;
      }, 50);
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
    setQrUrl(null);
    setPaymentMethod(null);
    setCollectionMethod(null);
    setPostalPostcode('');
    setCollectionDate('');
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
            <p className="text-sm mt-1" style={{ color: B.stone }}>Table → till → photo → hand-off. Real data throughout.</p>
          </div>
          <div className="space-y-3">
            <button onClick={loadBookings} disabled={loading} className="w-full py-5 rounded-lg font-bold flex items-center justify-center gap-3 text-lg" style={{ backgroundColor: B.clay, color: B.ivory }}>
              {loading ? 'Loading...' : '🏃 Start Floor'}
              {!loading && <ChevronRight size={24} />}
            </button>
            <button onClick={loadSeatedBookings} disabled={loading} className="w-full py-5 rounded-lg font-bold flex items-center justify-center gap-3 text-lg" style={{ backgroundColor: B.sand, color: B.charcoal }}>
              {loading ? 'Loading...' : '🪑 Seated Bookings'}
              {!loading && <ChevronRight size={24} />}
            </button>
            <p style={{ color: B.stone, fontSize: '0.75rem', textAlign: 'center' }}>Already-seated tables · more drinks or pieces · running totals</p>
            <a href="/shelf-sweep" className="w-full py-5 rounded-lg font-bold flex items-center justify-center gap-3 text-lg" style={{ backgroundColor: B.stone, color: B.charcoal, textDecoration: 'none' }}>
              <Camera size={24} /> Shelf Scan
            </a>
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
          <Header label={quickAccessMode ? 'Seated Bookings' : 'Phase 2/5 · Table'} />
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
    const QUICK_TABLES = [
      ...Array.from({ length: 8 }, (_, i) => `Main Studio ${i + 1}`),
      ...Array.from({ length: 3 }, (_, i) => `Lounge ${i + 1}`),
    ];

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
              {!editingTableInline ? (
                <button
                  onClick={() => { setTableDraftInline(current?.table_number || ''); setEditingTableInline(true); }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', color: current?.table_number ? SQ.sub : SQ.accent, fontSize: '0.72rem', fontWeight: current?.table_number ? 400 : 700 }}
                >
                  {current?.table_number ? `Table ${current.table_number}` : 'Set table'}
                  <span style={{ fontSize: '0.62rem', opacity: 0.7 }}>✎</span>
                </button>
              ) : (
                <p style={{ color: SQ.sub, fontSize: '0.72rem' }}>Choose a table below</p>
              )}
            </div>
          </div>
          <button onClick={() => router.push('/floor')} style={{ background: 'none', border: 'none', color: SQ.sub, fontSize: '0.8rem', cursor: 'pointer' }}>
            <Home size={20} />
          </button>
        </div>

        {editingTableInline && (
          <div style={{ backgroundColor: SQ.panel, borderBottom: `1px solid ${SQ.line}`, padding: '0.8rem 1rem' }}>
            <p style={{ color: SQ.sub, fontSize: '0.72rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Quick pick</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.8rem' }}>
              {QUICK_TABLES.map((t) => (
                <button
                  key={t}
                  onClick={() => { setTableDraftInline(t); }}
                  style={{
                    padding: '0.4rem 0.7rem', borderRadius: 6, fontSize: '0.78rem', cursor: 'pointer',
                    border: tableDraftInline === t ? `1.5px solid ${SQ.accent}` : `1px solid ${SQ.line}`,
                    backgroundColor: tableDraftInline === t ? SQ.accent + '15' : 'transparent',
                    color: tableDraftInline === t ? SQ.accentDark : SQ.ink,
                    fontWeight: tableDraftInline === t ? 700 : 400,
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input
                type="text"
                value={tableDraftInline}
                onChange={(e) => setTableDraftInline(e.target.value)}
                placeholder="Or type e.g. 3A, 3+4"
                maxLength={30}
                style={{ flex: 1, padding: '0.5rem 0.7rem', borderRadius: 6, border: `1px solid ${SQ.line}`, fontSize: '0.82rem' }}
              />
              <button
                onClick={saveTableInline}
                disabled={savingTableInline || !tableDraftInline.trim()}
                style={{ padding: '0.5rem 0.9rem', borderRadius: 6, border: 'none', backgroundColor: SQ.accent, color: 'white', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: savingTableInline || !tableDraftInline.trim() ? 0.6 : 1 }}
              >
                {savingTableInline ? '...' : 'Save'}
              </button>
              <button
                onClick={() => setEditingTableInline(false)}
                style={{ padding: '0.5rem 0.7rem', borderRadius: 6, border: 'none', background: 'none', color: SQ.sub, fontSize: '0.8rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {current?.notes && (
          <div style={{ backgroundColor: '#FFF4D6', borderBottom: '1px solid #E0C060', padding: '0.5rem 1rem', fontSize: '0.8rem' }}>
            <strong>Note:</strong> {current.notes}
          </div>
        )}

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
                      <span style={{ fontSize: '0.85rem' }}>{i.quantity > 1 ? `${i.quantity}x ` : ''}{i.item_name}</span>
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
    const finishDisabled =
      saving || !paymentMethod || !collectionMethod ||
      (collectionMethod === 'postal' && !postalPostcode.trim()) ||
      !collectionDate;
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: B.charcoal }}>
        <div className="max-w-2xl mx-auto">
          <Header label="Phase 4/5 · Completion" />

          {/* Totals summary */}
          <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
            <p style={{ color: B.ivory, fontWeight: 700, fontSize: '0.95rem' }}>{current?.customer_name}</p>
            <div className="flex justify-between mt-1">
              <span style={{ color: B.stone, fontSize: '0.8rem' }}>Till total</span>
              <span style={{ color: B.ivory, fontWeight: 700, fontSize: '0.9rem' }}>£{(tillTotal / 100).toFixed(2)}</span>
            </div>
            {splitBillCount > 1 && (
              <div className="flex justify-between mt-1">
                <span style={{ color: B.stone, fontSize: '0.75rem' }}>Split {splitBillCount} ways</span>
                <span style={{ color: B.sand, fontSize: '0.8rem' }}>£{((tillTotal / splitBillCount) / 100).toFixed(2)} each</span>
              </div>
            )}
          </div>

          {/* Collection method */}
          <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
            <p style={{ color: B.stone, fontSize: '0.75rem', marginBottom: '0.5rem' }}>Collection</p>
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
            {collectionMethod && (
              <div style={{ marginTop: '0.6rem' }}>
                <label style={{ display: 'block', color: B.stone, fontSize: '0.75rem', marginBottom: '0.3rem' }}>
                  {collectionMethod === 'postal' ? 'Ready to post from' : 'Ready for collection on'}
                </label>
                <input
                  type="date"
                  value={collectionDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setCollectionDate(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.6rem', borderRadius: 8, border: `1px solid ${B.stone}`, backgroundColor: B.charcoal, color: B.ivory, fontSize: '0.85rem', colorScheme: 'dark' }}
                />
                <p style={{ color: B.stone, fontSize: '0.7rem', marginTop: '0.3rem' }}>
                  Told to the customer at hand-off · defaults to 14 days for firing, change if needed
                </p>
              </div>
            )}
          </div>

          {/* Payment method (Square) */}
          <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
            <p style={{ color: B.stone, fontSize: '0.75rem', marginBottom: '0.5rem' }}>Payment · £{(tillTotal / 100).toFixed(2)}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                onClick={() => setPaymentMethod('card')}
                style={{ padding: '0.7rem', borderRadius: 8, border: paymentMethod === 'card' ? `2px solid ${B.clay}` : `1px solid ${B.stone}`, backgroundColor: paymentMethod === 'card' ? B.clay + '30' : 'transparent', color: B.ivory, fontSize: '0.85rem', fontWeight: 600 }}
              >
                💳 Card (Square)
              </button>
              <button
                onClick={() => setPaymentMethod('cash')}
                style={{ padding: '0.7rem', borderRadius: 8, border: paymentMethod === 'cash' ? `2px solid ${B.clay}` : `1px solid ${B.stone}`, backgroundColor: paymentMethod === 'cash' ? B.clay + '30' : 'transparent', color: B.ivory, fontSize: '0.85rem', fontWeight: 600 }}
              >
                💵 Cash
              </button>
            </div>
          </div>

          {/* Photo */}
          <div className="rounded-lg p-6" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
            <div className="text-center mb-5">
              <h2 className="text-xl font-bold" style={{ color: B.ivory }}>Photograph the pieces</h2>
              <p style={{ color: B.stone, fontSize: '0.8rem' }}>Real photo, confirmed against {current?.customer_name}&apos;s booking</p>
            </div>

            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: 'none' }} />
            {!photoPreview ? (
              <button onClick={() => fileRef.current?.click()} className="w-full py-8 rounded-lg flex flex-col items-center gap-2 mb-4" style={{ backgroundColor: B.charcoal, border: `2px dashed ${B.stone}` }}>
                <Camera size={28} color={B.clay} />
                <span style={{ color: B.stone, fontSize: '0.85rem' }}>Tap to photograph</span>
              </button>
            ) : (
              <img src={photoPreview} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: '1rem', maxHeight: 240, objectFit: 'cover' }} onClick={() => fileRef.current?.click()} />
            )}

            <button
              onClick={saveAndFinish}
              disabled={finishDisabled}
              className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2"
              style={{ backgroundColor: B.clay, color: B.ivory, opacity: finishDisabled ? 0.5 : 1 }}
            >
              {saving ? <><Loader size={18} className="animate-spin" /> Saving...</> : <>Finish &amp; Hand off <ChevronRight size={20} /></>}
            </button>
            {(!paymentMethod || !collectionMethod || !collectionDate) && (
              <p style={{ color: B.stone, fontSize: '0.7rem', textAlign: 'center', marginTop: '0.5rem' }}>Choose collection, a date and payment above to finish</p>
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
        <Header label="Phase 5/5 · Hand-off" />
        <div className="rounded-lg p-8" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
          <div className="text-center mb-6">
            <span className="text-4xl">✅</span>
            <h2 className="text-xl font-bold mt-3" style={{ color: B.ivory }}>Hand-off</h2>
          </div>
          <div className="space-y-4 mb-8">
            <div className="p-4 rounded-lg text-center" style={{ backgroundColor: B.charcoal }}>
              <p style={{ color: B.ivory }} className="font-bold text-sm mb-2">📱 Scan to track your pieces &amp; order drinks</p>
              <canvas ref={canvasRef} width={160} height={160} style={{ margin: '0 auto', borderRadius: 6, backgroundColor: 'white' }} />
              <p style={{ color: B.sand }} className="text-xs font-mono mt-2">{current?.booking_code}</p>
              <p style={{ color: B.stone }} className="text-xs mt-1">{current?.customer_name}</p>
            </div>
            <div className="p-4 rounded-lg" style={{ backgroundColor: B.charcoal }}>
              <p style={{ color: B.ivory }} className="font-bold text-sm">Session complete</p>
              <p style={{ color: B.stone }} className="text-xs mt-2">
                {pieceCount} piece{pieceCount === 1 ? '' : 's'} · £{(tillTotal / 100).toFixed(2)} till total{finished ? ' · marked finished' : ''}
              </p>
              {paymentMethod && (
                <p style={{ color: B.stone }} className="text-xs mt-1">
                  {paymentMethod === 'card' ? '💳 Card' : '💵 Cash'} · {collectionMethod === 'postal' ? `📮 Postal to ${postalPostcode}` : '🏠 Studio pickup'}
                </p>
              )}
              {collectionDate && (
                <p style={{ color: B.ivory }} className="text-xs mt-2 font-semibold">
                  📅 {collectionMethod === 'postal' ? 'Posting from' : 'Ready for collection'}: {new Date(collectionDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
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
