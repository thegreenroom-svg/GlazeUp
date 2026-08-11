'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SkeletonRows } from '@/components/Skeleton';
import { Receipt } from 'lucide-react';

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
}

interface BookingDetail {
  booking: Booking & { customer_phone: string | null };
  session: { id: string; table_number: string; status: string; number_of_places: number } | null;
  orders: { id: string; item_name: string; quantity: number; unit_price_cents: number; notes: string | null }[];
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

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
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
  const [photoMatches, setPhotoMatches] = useState<PhotoMatch[]>([]);
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
    const matchesDate = !dateFilter || b.session_start.startsWith(dateFilter);
    return matchesSearch && matchesDate;
  });

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
      <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Demo view — read-only. Tap a booking to see its table session and orders.
      </div>

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '1rem' }}>Bookings</h1>

      <div style={{ position: 'sticky', top: 0, backgroundColor: '#FDF6F1', zIndex: 10, paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer, room, or table..."
          style={{ width: '100%', maxWidth: '400px', padding: '0.6rem 0.9rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.9rem', boxSizing: 'border-box' }}
        />

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{ padding: '0.55rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem' }}
          />
          <button
            onClick={() => setDateFilter(todayStr)}
            style={{ padding: '0.55rem 0.9rem', backgroundColor: dateFilter === todayStr ? 'var(--clay)' : '#f0f0f0', color: dateFilter === todayStr ? 'white' : '#333', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            Today
          </button>
          {dateFilter && (
            <button
              onClick={() => setDateFilter('')}
              style={{ padding: '0.55rem 0.9rem', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' }}
            >
              Clear date
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
              <input
                value={walkInTable}
                onChange={(e) => setWalkInTable(e.target.value)}
                placeholder="Table"
                style={{ flex: 1, padding: '0.5rem 0.7rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setShowWalkIn(false)} style={{ flex: 1, padding: '0.55rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
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
                  <td style={{ padding: '0.75rem' }}>{b.customer_name}</td>
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
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#999' }}>Party size</span><span>{detail.booking.party_size ?? '—'}</span></div>
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

                {photoMatches.length > 0 && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.75rem' }}>AI Matched Photos</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {photoMatches.map((m) => (
                        <div key={m.id} style={{ display: 'flex', gap: '0.75rem', border: '1px solid #eee', borderRadius: '6px', overflow: 'hidden' }}>
                          <img src={m.photo_url} alt="Matched pieces" style={{ width: '90px', height: '90px', objectFit: 'cover', flexShrink: 0 }} />
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
                  style={{ marginTop: '1.5rem', width: '100%', padding: '0.6rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
