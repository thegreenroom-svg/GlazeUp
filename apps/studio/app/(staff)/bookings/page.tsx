'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageShell } from '@/components/PageShell';
import { SkeletonRows } from '@/components/Skeleton';
import { Receipt, Calendar } from 'lucide-react';

// Same fix already applied elsewhere (PinGate.tsx, daily-cards, floor):
// a plain fetch() has no timeout, and this file gates real Save buttons
// on busy flags -- a stalled fetch would leave them permanently
// disabled rather than failing cleanly. Guarantees resolve/reject
// within 20s either way.
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
  id: string;
  booking_code: string;
  customer_name: string;
  customer_email: string | null;
  party_size: number | null;
  status: string;
  session_start: string;
  session_end: string;
  room: string | null;
  current_stage: string;
  table_number: string | null;
  notes: string | null;
  booking_type: string | null;
  arrived_at: string | null;
  piece_count?: number;
  photo_count?: number;
}

interface BookingDetail {
  booking: Booking & { customer_phone: string | null };
  session: { id: string; table_number: string; status: string; number_of_places: number } | null;
  orders: { id: string; item_name: string; quantity: number; unit_price_cents: number; notes: string | null }[];
  pieces: { id: string; piece_type: string | null; description: string | null; status: string; reference_photo_url: string | null; reference_photo_taken_at: string | null; mark_code: string | null; assigned_to: string | null; fulfilment: string | null; postal_postcode: string | null; hold_reason: string | null; photo_box: { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number } | null }[];
}

interface PhotoMatch {
  id: string;
  photo_url: string;
  chalk_tag_name: string | null;
  ai_description: string | null;
  created_at: string;
}

interface TillItem {
  id: string;
  item_name: string;
  category: string | null;
  quantity: number;
  unit_price_cents: number;
}

interface MenuItem {
  item_name: string;
  category: string | null;
  price_cents: number | null;
}

// Real deep-link support -- per Daisy directly: "bookings need to be
// ever-present, referenced everywhere... we can then go into the
// bookings." This detail view previously only opened via clicking a row
// within this same page (local state, no URL). Anything elsewhere in
// the app (Alerts and others) can now link straight to a specific
// booking with ?code=<booking_code>.
function BookingsPageInner() {
  const searchParams = useSearchParams();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().slice(0, 10));
  const [showAllDates, setShowAllDates] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(() => searchParams.get('code'));
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkInName, setWalkInName] = useState('');
  const [walkInParty, setWalkInParty] = useState('');
  const [walkInTable, setWalkInTable] = useState('');
  const [walkInBusy, setWalkInBusy] = useState(false);

  const createWalkIn = async () => {
    if (!walkInName.trim()) return;
    setWalkInBusy(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/walk-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: walkInName,
          party_size: walkInParty ? Number(walkInParty) : null,
          table_number: walkInTable || null,
        }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      setBookings((prev) => [{ ...created, current_stage: 'booking', status: 'active', notes: null, booking_type: 'walk-in', arrived_at: null } as Booking, ...prev]);
      setShowWalkIn(false);
      setWalkInName(''); setWalkInParty(''); setWalkInTable('');
    } catch {
      setError('Could not create that walk-in booking.');
    } finally {
      setWalkInBusy(false);
    }
  };
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [editingParty, setEditingParty] = useState(false);
  const [partyDraft, setPartyDraft] = useState('');
  const [savingParty, setSavingParty] = useState(false);
  const [editingTable, setEditingTable] = useState(false);
  const [tableDraft, setTableDraft] = useState('');
  const [savingTable, setSavingTable] = useState(false);

  const savePartySize = async () => {
    if (!detail) return;
    const size = parseInt(partyDraft, 10);
    if (!Number.isInteger(size) || size < 1 || size > 30) return;
    setSavingParty(true);
    try {
      const res = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${detail.booking.booking_code}/party-size`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ party_size: size }),
      });
      if (!res.ok) throw new Error();
      setDetail({ ...detail, booking: { ...detail.booking, party_size: size } });
      setEditingParty(false);
    } catch (err: any) {
      setError(err?.name === 'AbortError' ? 'Taking too long -- try again' : 'Could not save party size.');
    } finally {
      setSavingParty(false);
    }
  };

  // Free-text table number -- covers splitting one table into smaller ones
  // ('3A', '3B') or combining several into a group ('3+4', '1&2') without
  // needing a rigid split/combine picker, since the column itself is just
  // text underneath.
  const saveTableNumber = async () => {
    if (!detail) return;
    const value = tableDraft.trim();
    if (!value) return;
    setSavingTable(true);
    try {
      const res = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${detail.booking.booking_code}/table-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_number: value }),
      });
      if (!res.ok) throw new Error();
      setDetail({ ...detail, booking: { ...detail.booking, table_number: value } });
      setEditingTable(false);
    } catch (err: any) {
      setError(err?.name === 'AbortError' ? 'Taking too long -- try again' : 'Could not save table number.');
    } finally {
      setSavingTable(false);
    }
  };
  const [photoMatches, setPhotoMatches] = useState<PhotoMatch[]>([]);

  // Saves one piece's assignment. Deliberately fire-and-refresh rather
  // than a form with a save button: staff are doing this while holding
  // pottery, so every extra tap is a real cost. Refreshes the detail so
  // the parcel count updates immediately.
  const [reidentifying, setReidentifying] = useState(false);
  const [reidentifyMsg, setReidentifyMsg] = useState<string | null>(null);

  const reidentifyPieces = async () => {
    if (!selectedCode) return;
    setReidentifying(true);
    setReidentifyMsg(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${selectedCode}/reidentify-pieces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || 'Could not re-identify');
      setReidentifyMsg(`Found ${d.created} piece${d.created === 1 ? '' : 's'}`);
      const detailRes = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${selectedCode}/detail`);
      if (detailRes.ok) setDetail(await detailRes.json());
    } catch (err: any) {
      setReidentifyMsg(`Could not re-identify: ${err.message}`);
    } finally {
      setReidentifying(false);
    }
  };

  const savePieceFulfilment = async (pieceId: string, patch: Record<string, string>) => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${pieceId}/fulfilment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok && selectedCode) {
        const d = await fetchWithTimeout(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${selectedCode}/detail`);
        if (d.ok) setDetail(await d.json());
      }
    } catch { /* non-blocking -- the field keeps its typed value either way */ }
  };
  // Real full-screen viewer -- per Daisy: "if I click on it, I can
  // enlarge it so that I can visually try to see what I'm looking for
  // in the app rather than scroll through all the photographs on the
  // iPad to find what I'm looking for when it comes out of the kiln."
  // An 80px thumbnail is genuinely useless for identifying a piece
  // against a shelf of fired pottery.
  const [zoomPhoto, setZoomPhoto] = useState<{ url: string; caption: string } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tillItems, setTillItems] = useState<TillItem[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [tillBusy, setTillBusy] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setBookings)
      .catch(() => setError('Could not load bookings.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCode) {
      setDetail(null);
      setPhotoMatches([]);
      setTillItems([]);
      setFinished(false);
      return;
    }
    setDetailLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${selectedCode}/detail`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${selectedCode}/photo-matches`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setPhotoMatches)
      .catch(() => setPhotoMatches([]));

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${selectedCode}/till`)
      .then((res) => (res.ok ? res.json() : []))
      .then((d) => {
        setTillItems(Array.isArray(d) ? d : d?.items || []);
        setFinished(Boolean(d?.finished_at));
      })
      .catch(() => setTillItems([]));
  }, [selectedCode]);

  // Menu is the same for every booking, so load it once.
  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/menu`)
      .then((res) => (res.ok ? res.json() : []))
      .then((d) => setMenu((Array.isArray(d) ? d : []).slice(0, 40)))
      .catch(() => setMenu([]));
  }, []);

  const reloadTill = async (code: string) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${code}/till`);
    const d = res.ok ? await res.json() : [];
    setTillItems(Array.isArray(d) ? d : d?.items || []);
  };

  const addTillItem = async (m: MenuItem) => {
    if (!selectedCode) return;
    setTillBusy(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${selectedCode}/till`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_name: m.item_name,
          category: m.category,
          quantity: 1,
          unit_price_cents: m.price_cents ?? 0,
        }),
      });
      await reloadTill(selectedCode);
    } catch {
      setError('Could not add that item.');
    } finally {
      setTillBusy(false);
    }
  };

  const removeTillItem = async (id: string) => {
    if (!selectedCode) return;
    setTillBusy(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/till-items/${id}`, { method: 'DELETE' });
      await reloadTill(selectedCode);
    } catch {
      setError('Could not remove that item.');
    } finally {
      setTillBusy(false);
    }
  };

  const finishSession = async () => {
    if (!selectedCode) return;
    setTillBusy(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${selectedCode}/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finished_by: 'studio' }),
      });
      setFinished(true);
    } catch {
      setError('Could not finish the session.');
    } finally {
      setTillBusy(false);
    }
  };

  const tillTotal = tillItems.reduce((sum, i) => sum + i.unit_price_cents * i.quantity, 0);

  const orderTotal = (orders: BookingDetail['orders']) =>
    orders.reduce((sum, o) => sum + (o.unit_price_cents * o.quantity) / 100, 0);

  const filteredBookings = bookings.filter((b) => {
    const matchesSearch =
      b.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      (b.customer_email || '').toLowerCase().includes(search.toLowerCase()) ||
      (b.room || '').toLowerCase().includes(search.toLowerCase()) ||
      (b.table_number || '').toLowerCase().includes(search.toLowerCase());
    const matchesDate = showAllDates || b.session_start.startsWith(dateFilter);
    return matchesSearch && matchesDate;
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <PageShell title="Bookings">
      <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Demo view — read-only. Tap a booking to see its table session and orders.
      </div>

      

      <div style={{ position: 'sticky', top: 0, backgroundColor: '#FDF6F1', zIndex: 10, paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer, room, or table..."
          style={{ width: '100%', maxWidth: '400px', padding: '0.6rem 0.9rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.9rem', boxSizing: 'border-box' }}
        />

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Calendar size={16} color="#888" style={{ position: 'absolute', left: '0.6rem', pointerEvents: 'none' }} />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              style={{ padding: '0.55rem 0.7rem 0.55rem 2rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', minWidth: '150px' }}
            />
          </div>
          <button
            onClick={() => setDateFilter(todayStr)}
            style={{ padding: '0.55rem 0.9rem', backgroundColor: dateFilter === todayStr ? 'var(--clay)' : '#f0f0f0', color: dateFilter === todayStr ? 'white' : '#333', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            Today
          </button>
          {showAllDates && (
            <button
              onClick={() => setShowAllDates(false)}
              style={{ padding: '0.55rem 0.9rem', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Back to one day
            </button>
          )}
          {!showAllDates && (
            <button
              onClick={() => setShowAllDates(true)}
              style={{ padding: '0.55rem 0.9rem', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Show all dates
            </button>
          )}
          <button
            onClick={() => setShowWalkIn(true)}
            style={{ padding: '0.55rem 0.9rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer', marginLeft: 'auto' }}
          >
            + Walk-in
          </button>
        </div>
      </div>

      {showWalkIn && (
        <div
          onClick={() => setShowWalkIn(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', zIndex: 60 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: '10px', padding: '1.5rem', maxWidth: '360px', width: '100%' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.9rem' }}>New walk-in</h3>
            <input
              value={walkInName}
              onChange={(e) => setWalkInName(e.target.value)}
              placeholder="Customer name"
              style={{ width: '100%', padding: '0.5rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', marginBottom: '0.5rem', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.9rem' }}>
              <input
                value={walkInParty}
                onChange={(e) => setWalkInParty(e.target.value.replace(/\D/g, ''))}
                placeholder="Party size"
                style={{ flex: 1, padding: '0.5rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
              <select
                value={walkInTable}
                onChange={(e) => setWalkInTable(e.target.value)}
                style={{ flex: 1, padding: '0.5rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box', color: '#333', backgroundColor: 'white' }}
              >
                <option value="">Table (optional)</option>
                {Array.from({ length: 8 }, (_, i) => `Main Studio ${i + 1}`).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowWalkIn(false)} style={{ flex: 1, padding: '0.55rem', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={createWalkIn}
                disabled={!walkInName.trim() || walkInBusy}
                style={{ flex: 1, padding: '0.55rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '6px', cursor: walkInName.trim() ? 'pointer' : 'not-allowed', opacity: walkInName.trim() ? 1 : 0.5 }}
              >
                {walkInBusy ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <SkeletonRows count={6} />
      ) : filteredBookings.length === 0 ? (
        <p style={{ color: '#999' }}>{bookings.length === 0 ? 'No bookings found.' : 'No bookings match your search.'}</p>
      ) : (
        <div style={{ overflowX: 'auto', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd', backgroundColor: '#f9f9f9' }}>
                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Customer</th>
                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Party</th>
                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Session</th>
                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Room / Table</th>
                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Stage</th>
                <th style={{ textAlign: 'left', padding: '0.75rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setSelectedCode(b.booking_code)}
                  style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fafafa')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      {/* Real photo indicator -- a filled green camera means
                          this table has been photographed and its pieces are
                          in the system; nothing means it hasn't. Lets a busy
                          day be scanned at a glance instead of opening every
                          booking to check. */}
                      {(b.photo_count ?? 0) > 0 ? (
                        <span
                          title={`${b.photo_count} piece${b.photo_count === 1 ? '' : 's'} photographed`}
                          style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', backgroundColor: '#1a8a3c', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700 }}
                        >
                          {b.photo_count}
                        </span>
                      ) : (
                        <span
                          title="No photos yet"
                          style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', border: '1.5px dashed #ccc', display: 'inline-block' }}
                        />
                      )}
                      {b.customer_name}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem' }}>{b.party_size ?? '—'}</td>
                  <td style={{ padding: '0.75rem' }}>{new Date(b.session_start).toLocaleString()}</td>
                  <td style={{ padding: '0.75rem' }}>{[b.room, b.table_number].filter(Boolean).join(' / ') || '—'}</td>
                  <td style={{ padding: '0.75rem', textTransform: 'capitalize' }}>{b.current_stage}</td>
                  <td style={{ padding: '0.75rem' }}>
                    <span style={{ padding: '0.25rem 0.75rem', backgroundColor: '#eef', borderRadius: '9999px', fontSize: '0.75rem', textTransform: 'capitalize' }}>
                      {b.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCode && (
        <div
          onClick={() => setSelectedCode(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: '8px', maxWidth: '450px', width: '100%', maxHeight: '85vh', overflow: 'auto', padding: '1.5rem' }}>
            {detailLoading ? (
              <p style={{ color: '#666' }}>Loading...</p>
            ) : !detail ? (
              <p style={{ color: '#c33' }}>Could not load booking detail.</p>
            ) : (
              <>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>{detail.booking.customer_name}</h2>
                <p style={{ color: '#999', fontSize: '0.8rem', marginBottom: '1rem', fontFamily: 'monospace' }}>{detail.booking.booking_code}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                  {detail.booking.customer_email && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#999' }}>Email</span><span>{detail.booking.customer_email}</span></div>
                  )}
                  {detail.booking.customer_phone && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#999' }}>Phone</span><span>{detail.booking.customer_phone}</span></div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#999' }}>Party size</span>
                    {editingParty ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={partyDraft}
                          onChange={(e) => setPartyDraft(e.target.value)}
                          autoFocus
                          style={{ width: '3.5rem', padding: '0.25rem 0.4rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                        <button
                          onClick={savePartySize}
                          disabled={savingParty}
                          style={{ padding: '0.25rem 0.6rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.78rem', cursor: 'pointer' }}
                        >
                          {savingParty ? '...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingParty(false)}
                          style={{ padding: '0.25rem 0.5rem', background: 'none', border: 'none', color: '#999', fontSize: '0.78rem', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => { setPartyDraft(detail.booking.party_size ? String(detail.booking.party_size) : ''); setEditingParty(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: detail.booking.party_size ? '#222' : 'var(--clay)', fontSize: '0.875rem' }}
                      >
                        {detail.booking.party_size ?? 'Set manually'}
                        <span style={{ fontSize: '0.7rem', color: '#999' }}>✎</span>
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#999' }}>Table</span>
                    {editingTable ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <input
                          type="text"
                          value={tableDraft}
                          onChange={(e) => setTableDraft(e.target.value)}
                          placeholder="e.g. 3A, 3+4"
                          autoFocus
                          maxLength={20}
                          style={{ width: '6rem', padding: '0.25rem 0.4rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.85rem' }}
                        />
                        <button
                          onClick={saveTableNumber}
                          disabled={savingTable || !tableDraft.trim()}
                          style={{ padding: '0.25rem 0.6rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.78rem', cursor: 'pointer' }}
                        >
                          {savingTable ? '...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingTable(false)}
                          style={{ padding: '0.25rem 0.5rem', background: 'none', border: 'none', color: '#999', fontSize: '0.78rem', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => { setTableDraft(detail.booking.table_number || ''); setEditingTable(true); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: detail.booking.table_number ? '#222' : 'var(--clay)', fontSize: '0.875rem' }}
                      >
                        {detail.booking.table_number || 'Set manually'}
                        <span style={{ fontSize: '0.7rem', color: '#999' }}>✎</span>
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#999' }}>Session</span><span>{new Date(detail.booking.session_start).toLocaleString()}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#999' }}>Stage</span><span style={{ textTransform: 'capitalize' }}>{detail.booking.current_stage}</span></div>
                  {detail.booking.notes && (
                    <div style={{ padding: '0.5rem', backgroundColor: '#f9f9f9', borderRadius: '4px', marginTop: '0.25rem' }}>{detail.booking.notes}</div>
                  )}
                </div>

                <div style={{ paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Receipt size={16} /> Table Session
                  </h3>
                  {!detail.session ? (
                    <p style={{ fontSize: '0.85rem', color: '#999' }}>No table session linked to this booking yet.</p>
                  ) : (
                    <>
                      <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
                        Table {detail.session.table_number} · {detail.session.number_of_places} places · <span style={{ textTransform: 'capitalize' }}>{detail.session.status}</span>
                      </p>
                      {detail.orders.length === 0 ? (
                        <p style={{ fontSize: '0.85rem', color: '#999' }}>No items ordered yet.</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {detail.orders.map((o) => (
                            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                              <span>{o.quantity}× {o.item_name}</span>
                              <span>£{((o.unit_price_cents * o.quantity) / 100).toFixed(2)}</span>
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', paddingTop: '0.4rem', borderTop: '1px solid #eee', marginTop: '0.2rem' }}>
                            <span>Total</span>
                            <span>£{orderTotal(detail.orders).toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: '600' }}>Till</h3>
                    <span style={{ fontSize: '0.7rem', color: '#999' }}>demo table only</span>
                  </div>

                  {tillItems.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: '#999', marginBottom: '0.75rem' }}>Nothing added yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.75rem' }}>
                      {tillItems.map((i) => (
                        <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', padding: '0.4rem 0.5rem', backgroundColor: '#f9f9f9', borderRadius: '4px' }}>
                          <span>{i.quantity > 1 ? `${i.quantity}x ` : ''}{i.item_name}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span>£{((i.unit_price_cents * i.quantity) / 100).toFixed(2)}</span>
                            {!finished && (
                              <button
                                onClick={() => removeTillItem(i.id)}
                                disabled={tillBusy}
                                style={{ background: 'none', border: 'none', color: '#c33', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, padding: 0 }}
                                aria-label={`Remove ${i.item_name}`}
                              >
                                ×
                              </button>
                            )}
                          </span>
                        </div>
                      ))}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: '0.9rem', paddingTop: '0.4rem', borderTop: '1px solid #eee' }}>
                        <span>Total</span>
                        <span>£{(tillTotal / 100).toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {finished ? (
                    <div style={{ padding: '0.6rem', backgroundColor: '#eafaf0', color: '#1a8a3c', borderRadius: '4px', fontSize: '0.85rem', textAlign: 'center' }}>
                      Session finished
                    </div>
                  ) : (
                    <>
                      {menu.length > 0 && (
                        <select
                          onChange={(e) => {
                            const m = menu[Number(e.target.value)];
                            if (m) addTillItem(m);
                            e.target.value = '';
                          }}
                          disabled={tillBusy}
                          defaultValue=""
                          style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '0.5rem' }}
                        >
                          <option value="" disabled>Add an item...</option>
                          {menu.map((m, idx) => (
                            <option key={`${m.item_name}-${idx}`} value={idx}>
                              {m.item_name}{m.price_cents ? ` — £${(m.price_cents / 100).toFixed(2)}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      {tillItems.length > 0 && (
                        <button
                          onClick={finishSession}
                          disabled={tillBusy}
                          style={{ width: '100%', padding: '0.5rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.85rem', cursor: tillBusy ? 'not-allowed' : 'pointer', opacity: tillBusy ? 0.6 : 1 }}
                        >
                          Finish session
                        </button>
                      )}
                    </>
                  )}
                </div>

                {detail.pieces && detail.pieces.length > 0 && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem' }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: '600' }}>
                        Pieces ({detail.pieces.length})
                      </h3>
                      {/* Re-runs identification on the photo already stored.
                          For bookings photographed before identification
                          existed -- they're stuck as one generic "Piece 1 of
                          1" even when the photo clearly shows several. */}
                      <button
                        onClick={reidentifyPieces}
                        disabled={reidentifying}
                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.72rem', fontWeight: 600, backgroundColor: reidentifying ? '#eee' : 'var(--clay)', color: reidentifying ? '#999' : 'white', border: 'none', borderRadius: 6, cursor: reidentifying ? 'default' : 'pointer', flexShrink: 0 }}
                      >
                        {reidentifying ? 'Identifying...' : 'Re-identify from photo'}
                      </button>
                    </div>
                    {reidentifyMsg && (
                      <p style={{ fontSize: '0.75rem', color: reidentifyMsg.startsWith('Could not') ? '#c33' : '#1a8a3c', marginBottom: '0.6rem' }}>{reidentifyMsg}</p>
                    )}
                    {/* The table photo ONCE, with a numbered coloured box
                        over each piece -- per Daisy: "itemised numbered
                        coloured squares and descriptions... then we can see
                        each thing." The boxes were previously drawn only on
                        the Floor screen at the moment of capture and thrown
                        away, so opening the booking afterwards gave a list
                        of descriptions with no way to tell which row was
                        which pot on a table of four similar pieces. */}
                    {(() => {
                      const photo = detail.pieces.find((p) => p.reference_photo_url)?.reference_photo_url;
                      const boxed = detail.pieces.filter((p) => p.photo_box);
                      if (!photo) return null;
                      return (
                        <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                          <img
                            src={photo}
                            alt=""
                            onClick={() => setZoomPhoto({ url: photo, caption: detail.booking?.customer_name || '' })}
                            style={{ width: '100%', borderRadius: 8, display: 'block', cursor: 'zoom-in' }}
                          />
                          {detail.pieces.map((p, i) => p.photo_box && (
                            <div
                              key={p.id}
                              style={{
                                position: 'absolute',
                                left: `${p.photo_box.left_pct}%`,
                                top: `${p.photo_box.top_pct}%`,
                                width: `${p.photo_box.right_pct - p.photo_box.left_pct}%`,
                                height: `${p.photo_box.bottom_pct - p.photo_box.top_pct}%`,
                                border: `3px solid ${PIECE_COLOURS[i % 6]}`,
                                borderRadius: 4,
                                boxShadow: '0 0 0 1px rgba(255,255,255,0.9)',
                                pointerEvents: 'none',
                              }}
                            >
                              <span style={{ position: 'absolute', top: -9, left: -9, width: 20, height: 20, borderRadius: '50%', backgroundColor: PIECE_COLOURS[i % 6], color: 'white', fontSize: '0.68rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px white' }}>
                                {i + 1}
                              </span>
                            </div>
                          ))}
                          {boxed.length === 0 && (
                            <p style={{ fontSize: '0.72rem', color: '#888', marginTop: '0.35rem' }}>
                              No piece positions stored for this photo yet — tap Re-identify from photo to break it down.
                            </p>
                          )}
                        </div>
                      );
                    })()}

                    {/* Real per-piece rows rather than a thumbnail grid --
                        assignment needs room to show who each piece is for
                        and how it's going out. This is where a split
                        booking actually gets recorded. */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {detail.pieces.map((p, i) => (
                        <div key={p.id} style={{ border: '1px solid #eee', borderRadius: '8px', padding: '0.6rem', display: 'flex', gap: '0.7rem', backgroundColor: p.fulfilment === 'return_visit' ? '#fff8e1' : 'white' }}>
                          {p.reference_photo_url ? (
                            <div
                              onClick={() => setZoomPhoto({
                                url: p.reference_photo_url!,
                                caption: [detail.booking?.customer_name, p.piece_type || p.description].filter(Boolean).join(' — '),
                              })}
                              title={p.photo_box ? 'Cropped to this piece — tap for the full photo' : undefined}
                              style={{
                                width: 64, height: 64, borderRadius: 6, flexShrink: 0, cursor: 'zoom-in',
                                border: `2px solid ${PIECE_COLOURS[i % 6]}`,
                                // Cropped to THIS piece when we know where it
                                // sits; falls back to the whole table photo
                                // for older pieces with no stored position.
                                ...(p.photo_box
                                  ? cropStyle(p.reference_photo_url, p.photo_box)
                                  : { backgroundImage: `url(${p.reference_photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }),
                              }}
                            />
                          ) : (
                            <div style={{ width: 64, height: 64, backgroundColor: '#f7f7f7', borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#bbb', textAlign: 'center' }}>
                              no photo
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--charcoal)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', backgroundColor: PIECE_COLOURS[i % 6], color: 'white', fontSize: '0.62rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                {i + 1}
                              </span>
                              {p.piece_type || 'Piece'}
                            </p>
                            {p.description && <p style={{ fontSize: '0.72rem', color: '#888', marginBottom: '0.4rem' }}>{p.description}</p>}

                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              <input
                                defaultValue={p.assigned_to || ''}
                                placeholder="Who's it for?"
                                onBlur={(e) => savePieceFulfilment(p.id, { assigned_to: e.target.value })}
                                style={{ flex: '1 1 110px', minWidth: 0, padding: '0.3rem 0.45rem', fontSize: '0.72rem', border: '1px solid #ddd', borderRadius: 5, color: '#333', backgroundColor: 'white' }}
                              />
                              <select
                                defaultValue={p.fulfilment || ''}
                                onChange={(e) => savePieceFulfilment(p.id, { fulfilment: e.target.value })}
                                style={{ padding: '0.3rem 0.45rem', fontSize: '0.72rem', border: '1px solid #ddd', borderRadius: 5, color: '#333', backgroundColor: 'white' }}
                              >
                                <option value="">Same as booking</option>
                                <option value="collect">Collecting</option>
                                <option value="post">Posting</option>
                                <option value="return_visit">Coming back to finish</option>
                              </select>
                            </div>

                            {p.fulfilment === 'post' && (
                              <input
                                defaultValue={p.postal_postcode || ''}
                                placeholder="Postcode for this parcel"
                                onBlur={(e) => savePieceFulfilment(p.id, { postal_postcode: e.target.value })}
                                style={{ width: '100%', marginTop: '0.35rem', padding: '0.3rem 0.45rem', fontSize: '0.72rem', border: '1px solid #ddd', borderRadius: 5, color: '#333', backgroundColor: 'white' }}
                              />
                            )}
                            {p.fulfilment === 'return_visit' && (
                              <p style={{ fontSize: '0.7rem', color: '#b8860b', fontWeight: 600, marginTop: '0.35rem' }}>
                                On hold — kept out of the kiln and off the packing list
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Real parcel summary -- the commercially useful bit:
                        how many separate parcels this booking actually is,
                        which is what postage gets charged on. */}
                    {(() => {
                      const live = detail.pieces.filter((p) => p.fulfilment !== 'return_visit');
                      const keys = new Set(live.map((p) => {
                        const f = p.fulfilment || 'booking-default';
                        return f === 'post' ? `post|${p.assigned_to || ''}|${p.postal_postcode || ''}` : `${f}|${p.assigned_to || ''}`;
                      }));
                      const postal = new Set(live.filter((p) => p.fulfilment === 'post').map((p) => `${p.assigned_to || ''}|${p.postal_postcode || ''}`));
                      const held = detail.pieces.filter((p) => p.fulfilment === 'return_visit').length;
                      if (keys.size <= 1 && !held) return null;
                      return (
                        <div style={{ marginTop: '0.7rem', padding: '0.6rem 0.8rem', backgroundColor: '#f0f6ff', borderRadius: 8, fontSize: '0.78rem', color: '#2b4a7a' }}>
                          <strong>{keys.size} separate parcel{keys.size === 1 ? '' : 's'}</strong>
                          {postal.size > 0 && ` · ${postal.size} to post`}
                          {held > 0 && ` · ${held} on hold`}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {photoMatches.length > 0 && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.75rem' }}>AI Matched Photos</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {photoMatches.map((m) => (
                        <div key={m.id} style={{ display: 'flex', gap: '0.75rem', border: '1px solid #eee', borderRadius: '6px', overflow: 'hidden' }}>
                          <img
                            src={m.photo_url}
                            alt="Matched pieces"
                            onClick={() => setZoomPhoto({
                              url: m.photo_url,
                              caption: [detail.booking?.customer_name, m.ai_description].filter(Boolean).join(' — '),
                            })}
                            style={{ width: '90px', height: '90px', objectFit: 'cover', flexShrink: 0, cursor: 'zoom-in' }}
                          />
                          <div style={{ padding: '0.5rem 0.5rem 0.5rem 0' }}>
                            {m.ai_description && <p style={{ fontSize: '0.8rem', color: '#444' }}>{m.ai_description}</p>}
                            <p style={{ fontSize: '0.7rem', color: '#999', marginTop: '0.25rem' }}>{new Date(m.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setSelectedCode(null)}
                  style={{ marginTop: '1.5rem', width: '100%', padding: '0.6rem', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Real full-screen photo viewer -- tap any piece or matched photo
          to enlarge it, so a piece can actually be identified against
          the shelf when it comes out of the kiln. Tap anywhere to
          dismiss. */}
      {zoomPhoto && (
        <div
          onClick={() => setZoomPhoto(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '1rem', cursor: 'zoom-out',
          }}
        >
          <img
            src={zoomPhoto.url}
            alt={zoomPhoto.caption}
            style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain', borderRadius: 8 }}
          />
          {zoomPhoto.caption && (
            <p style={{ color: 'white', fontSize: '0.9rem', fontWeight: 600, marginTop: '0.9rem', textAlign: 'center' }}>
              {zoomPhoto.caption}
            </p>
          )}
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', marginTop: '0.4rem' }}>Tap anywhere to close</p>
        </div>
      )}
    </PageShell>
  );
}

// Same six colours used by Find on Table and the Floor capture screen, so
// piece 3 is the same colour everywhere it appears in the app.
const PIECE_COLOURS = ['#e0392b', '#1a8a3c', '#2b6fe0', '#c77a0a', '#8b3ec7', '#0a9aa8'];

type PieceBox = { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number };

// Crops the shared table photo down to a single piece using CSS background
// positioning. Every piece on a booking shares ONE photo, so without this
// each row showed four identical thumbnails of the same table -- useless
// for telling which row is which pot. This shows just that piece instead.
function cropStyle(url: string, box: PieceBox): React.CSSProperties {
  const w = box.right_pct - box.left_pct;
  const h = box.bottom_pct - box.top_pct;
  if (!(w > 0) || !(h > 0)) return { backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  return {
    backgroundImage: `url(${url})`,
    // Scale the photo up so the box fills the frame...
    backgroundSize: `${(100 / w) * 100}% ${(100 / h) * 100}%`,
    // ...then pan to it. CSS percentage positioning is relative to the
    // overflow, hence the (100 - w) denominators; guarded against the
    // divide-by-zero when a box spans the full width or height.
    backgroundPosition: `${w >= 100 ? 0 : (box.left_pct / (100 - w)) * 100}% ${h >= 100 ? 0 : (box.top_pct / (100 - h)) * 100}%`,
    backgroundRepeat: 'no-repeat',
  };
}

export default function BookingsPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <BookingsPageInner />
    </Suspense>
  );
}
