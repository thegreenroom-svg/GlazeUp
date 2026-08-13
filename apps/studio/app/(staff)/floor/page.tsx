'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronRight, Home, Camera, Printer, Check, Loader } from 'lucide-react';
import QRCode from 'qrcode';
import { NudgeCard, HelpButton } from '@/components/NudgeSystem';

interface Booking {
  booking_code: string;
  customer_name: string;
  session_start: string;
  table_number: string | null;
  party_size: number | null;
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
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${b.booking_code}/till`);
      const d = res.ok ? await res.json() : [];
      setTillItems(Array.isArray(d) ? d : d?.items || []);
    } catch { /* fresh table, no till yet */ }
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
                    <p style={{ color: B.ivory, fontWeight: 600, fontSize: '0.9rem' }}>{b.customer_name}</p>
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

  // ============ PHASE 3: TILL (real till, real menu) ============
  if (phase === 3) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: B.charcoal }}>
        <div className="max-w-2xl mx-auto">
          <Header label="Phase 3/5 · Till" />
          <div className="rounded-lg p-6" style={{ backgroundColor: B.sand + '18', border: `2px solid ${B.clay}` }}>
            <div className="text-center mb-5">
              <h2 className="text-xl font-bold" style={{ color: B.ivory }}>{current?.customer_name}</h2>
              <p style={{ color: B.stone, fontSize: '0.8rem' }}>Add items as the table orders</p>
            </div>

            {pieceCount > 0 && (
              <div className="flex items-center gap-3 justify-center mb-5">
                <span style={{ color: B.stone, fontSize: '0.8rem' }}>Pieces captured</span>
                <span style={{ color: B.ivory, fontWeight: 700, minWidth: 26, textAlign: 'center', fontSize: '1.1rem' }}>{pieceCount}</span>
                <span style={{ color: B.stone, fontSize: '0.65rem', fontStyle: 'italic' }}>from photo</span>
              </div>
            )}
            {pieceCount === 0 && (
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <p style={{ color: B.stone, fontSize: '0.8rem' }}>Pieces will appear here after photo taken</p>
              </div>
            )}

            {tillItems.length > 0 && (
              <div className="mb-4 p-3 rounded" style={{ backgroundColor: B.charcoal, borderLeft: `3px solid ${B.clay}` }}>
                <p style={{ color: B.stone, fontSize: '0.75rem', marginBottom: '0.5rem' }}>Split bill</p>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      onClick={() => setSplitBillCount(n)}
                      style={{
                        padding: '0.4rem 0.8rem',
                        borderRadius: 6,
                        border: splitBillCount === n ? `2px solid ${B.clay}` : `1px solid ${B.stone}`,
                        backgroundColor: splitBillCount === n ? B.clay + '30' : 'transparent',
                        color: B.ivory,
                        fontSize: '0.8rem',
                        fontWeight: splitBillCount === n ? 600 : 400,
                        cursor: 'pointer'
                      }}
                    >
                      {n} {n === 1 ? 'person' : 'people'}
                    </button>
                  ))}
                </div>
                {splitBillCount > 1 && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.6rem', backgroundColor: B.charcoal, borderRadius: 4, textAlign: 'center' }}>
                    <p style={{ color: B.sand, fontSize: '0.75rem', fontWeight: 600 }}>
                      Per person: £{((tillTotal / splitBillCount) / 100).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
            )}

            {tillItems.length > 0 && (
              <div className="space-y-1 mb-3" style={{ maxHeight: '28vh', overflowY: 'auto' }}>
                {tillItems.map((i) => (
                  <div key={i.id} className="flex justify-between items-center px-3 py-2 rounded" style={{ backgroundColor: B.charcoal }}>
                    <span style={{ color: B.ivory, fontSize: '0.85rem' }}>{i.quantity > 1 ? `${i.quantity}x ` : ''}{i.item_name}</span>
                    <span className="flex items-center gap-2">
                      <span style={{ color: B.sand, fontSize: '0.8rem' }}>£{((i.unit_price_cents * i.quantity) / 100).toFixed(2)}</span>
                      <button onClick={() => removeTillItem(i.id)} style={{ color: '#e88', background: 'none', border: 'none', fontSize: '1rem' }}>×</button>
                    </span>
                  </div>
                ))}
                <div className="flex justify-between px-3 pt-2" style={{ borderTop: `1px solid ${B.stone}30` }}>
                  <span style={{ color: B.stone, fontSize: '0.8rem' }}>Total</span>
                  <span style={{ color: B.ivory, fontWeight: 700, fontSize: '0.9rem' }}>£{(tillTotal / 100).toFixed(2)}</span>
                </div>
              </div>
            )}

            {menu.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                {!activeGroup && (
                  <>
                    <p style={{ color: B.stone, fontSize: '0.75rem', marginBottom: '0.5rem' }}>Add an item</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      {menu.map((g) => (
                        <button
                          key={g.key}
                          onClick={() => setActiveGroup(g)}
                          style={{ padding: '1rem 0.6rem', borderRadius: 10, border: 'none', backgroundColor: B.charcoal, color: B.ivory, fontWeight: 600, fontSize: '0.85rem' }}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {activeGroup && !activeSubsection && (
                  <>
                    <button onClick={backToTillMenu} style={{ color: B.clay, background: 'none', border: 'none', fontSize: '0.8rem', marginBottom: '0.5rem', padding: 0 }}>
                      ← Back to Till
                    </button>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      {activeGroup.subsections.map((s) => (
                        <button
                          key={s.category}
                          onClick={() => { setActiveSubsection(s); setActiveBucket(null); setShowAllItems(false); }}
                          style={{ padding: '1rem 0.6rem', borderRadius: 10, border: 'none', backgroundColor: B.charcoal, color: B.ivory, fontWeight: 600, fontSize: '0.85rem' }}
                        >
                          {s.label}
                          <span style={{ display: 'block', color: B.stone, fontSize: '0.7rem', fontWeight: 400, marginTop: '0.2rem' }}>{s.items.length} items</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {activeSubsection && (
                  <>
                    <button
                      onClick={backToTillMenu}
                      style={{ color: B.clay, background: 'none', border: 'none', fontSize: '0.8rem', marginBottom: '0.5rem', padding: 0 }}
                    >
                      ← Back to Till
                    </button>

                    {activeSubsection.buckets && !activeBucket ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        {activeSubsection.buckets.map((bk) => (
                          <button
                            key={bk.label}
                            onClick={() => { setActiveBucket(bk); setShowAllItems(false); }}
                            style={{ padding: '1rem 0.6rem', borderRadius: 10, border: 'none', backgroundColor: B.charcoal, color: B.ivory, fontWeight: 600, fontSize: '0.85rem' }}
                          >
                            {bk.label}
                            <span style={{ display: 'block', color: B.stone, fontSize: '0.7rem', fontWeight: 400, marginTop: '0.2rem' }}>{bk.items.length} items</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                          {(() => {
                            const list = activeBucket ? activeBucket.items : activeSubsection.items;
                            return (showAllItems ? list : list.slice(0, 8)).map((entry, idx) => {
                              if (entry.kind === 'customisable') {
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => { setCustomising(entry); setPickedFlavour(null); }}
                                    style={{ padding: '0.7rem 0.5rem', borderRadius: 8, border: 'none', backgroundColor: B.clay, color: B.ivory, fontSize: '0.78rem', textAlign: 'left' }}
                                  >
                                    {entry.base}
                                    <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.85 }}>from £{(entry.from_price_cents / 100).toFixed(2)}</span>
                                  </button>
                                );
                              }
                              return (
                                <button
                                  key={idx}
                                  onClick={() => addTillItem(entry)}
                                  disabled={tillBusy}
                                  style={{ padding: '0.7rem 0.5rem', borderRadius: 8, border: 'none', backgroundColor: B.clay, color: B.ivory, fontSize: '0.78rem', textAlign: 'left' }}
                                >
                                  {entry.item_name}
                                  {entry.price_cents ? <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.85 }}>£{(entry.price_cents / 100).toFixed(2)}</span> : null}
                                </button>
                              );
                            });
                          })()}
                        </div>
                        {(() => {
                          const list = activeBucket ? activeBucket.items : activeSubsection.items;
                          return !showAllItems && list.length > 8 && (
                            <button onClick={() => setShowAllItems(true)} style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem', borderRadius: 8, border: `1px solid ${B.stone}`, background: 'none', color: B.stone, fontSize: '0.8rem' }}>
                              + {list.length - 8} more
                            </button>
                          );
                        })()}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            <button onClick={() => setPhase(4)} className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2" style={{ backgroundColor: B.clay, color: B.ivory }}>
              Continue to Completion <ChevronRight size={20} />
            </button>
          </div>
        </div>
        <NudgeCard id="floor_till" />
        {tillItems.length > 0 && <NudgeCard id="floor_split_bill" />}

        {customising && (
          <div
            onClick={() => setCustomising(null)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', zIndex: 70 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: B.charcoal, borderRadius: 14, padding: '1.5rem', maxWidth: 360, width: '100%', border: `2px solid ${B.clay}` }}>
              <h3 style={{ color: B.ivory, fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.3rem' }}>{customising.base}</h3>
              <p style={{ color: B.stone, fontSize: '0.8rem', marginBottom: '1rem' }}>
                {pickedFlavour ? 'Milk?' : customising.flavours.length > 1 || customising.flavours[0] !== '(plain)' ? 'Syrup?' : 'Milk?'}
              </p>

              {!pickedFlavour ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {customising.flavours.map((f) => (
                    <button
                      key={f}
                      onClick={() => setPickedFlavour(f)}
                      style={{ padding: '0.7rem 0.5rem', borderRadius: 8, border: 'none', backgroundColor: f === '(plain)' ? B.stone : 'var(--clay)', color: B.ivory, fontSize: '0.82rem' }}
                    >
                      {f === '(plain)' ? 'No syrup' : f}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  {customising.milks.map((m) => {
                    const match = customising.lookup[`${pickedFlavour}|${m}`];
                    return (
                      <button
                        key={m}
                        onClick={() => { if (match) { addTillItem(match); setCustomising(null); } }}
                        disabled={!match || tillBusy}
                        style={{ padding: '0.7rem 0.5rem', borderRadius: 8, border: 'none', backgroundColor: 'var(--clay)', color: B.ivory, fontSize: '0.82rem', textAlign: 'left' }}
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
                  <button onClick={() => setPickedFlavour(null)} style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: 'none', backgroundColor: '#00000030', color: B.ivory, fontSize: '0.8rem' }}>
                    ← Back
                  </button>
                )}
                <button onClick={() => setCustomising(null)} style={{ flex: 1, padding: '0.5rem', borderRadius: 8, border: 'none', backgroundColor: '#00000030', color: B.ivory, fontSize: '0.8rem' }}>
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
