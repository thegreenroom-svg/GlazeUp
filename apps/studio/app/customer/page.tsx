'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Flame, PackageCheck, Award, Coffee } from 'lucide-react';

interface MenuItem {
  item_name: string;
  category: string | null;
  price_cents: number | null;
}
interface Subsection { category: string; label: string; items: MenuItem[] }
interface TillGroup { key: string; label: string; subsections: Subsection[] }

function OrderPanel({ bookingCode, onOrdered }: { bookingCode: string; onOrdered: () => void }) {
  const [groups, setGroups] = useState<TillGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<TillGroup | null>(null);
  const [activeSub, setActiveSub] = useState<Subsection | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/till-menu`)
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((d) => setGroups((d.groups || []).filter((g: TillGroup) => g.key === 'cafe' || g.key === 'food')))
      .catch(() => {});
  }, []);

  const order = async (item: MenuItem) => {
    setSending(true);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings/${bookingCode}/till`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_name: item.item_name, category: item.category, quantity: 1, unit_price_cents: item.price_cents ?? 0, added_by: 'customer-app' }),
      });
      onOrdered();
      setActiveGroup(null);
      setActiveSub(null);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ marginBottom: '1.25rem', padding: '1rem', backgroundColor: '#fdf6f8', borderRadius: '10px' }}>
      {!activeGroup && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {groups.map((g) => (
            <button key={g.key} onClick={() => setActiveGroup(g)} style={{ padding: '1rem 0.6rem', borderRadius: 10, border: 'none', backgroundColor: 'var(--charcoal)', color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>
              {g.label}
            </button>
          ))}
        </div>
      )}
      {activeGroup && !activeSub && (
        <>
          <button onClick={() => setActiveGroup(null)} style={{ color: 'var(--clay)', background: 'none', border: 'none', fontSize: '0.8rem', marginBottom: '0.5rem', padding: 0 }}>← {activeGroup.label}</button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {activeGroup.subsections.map((s) => (
              <button key={s.category} onClick={() => { setActiveSub(s); setShowAll(false); }} style={{ padding: '1rem 0.6rem', borderRadius: 10, border: 'none', backgroundColor: 'var(--charcoal)', color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>
                {s.label}
              </button>
            ))}
          </div>
        </>
      )}
      {activeSub && (
        <>
          <button onClick={() => setActiveSub(null)} style={{ color: 'var(--clay)', background: 'none', border: 'none', fontSize: '0.8rem', marginBottom: '0.5rem', padding: 0 }}>← {activeSub.label}</button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {(showAll ? activeSub.items : activeSub.items.slice(0, 8)).map((item, i) => (
              <button key={i} onClick={() => order(item)} disabled={sending} style={{ padding: '0.7rem 0.5rem', borderRadius: 8, border: 'none', backgroundColor: 'var(--clay)', color: 'white', fontSize: '0.78rem', textAlign: 'left' }}>
                {item.item_name}
                {item.price_cents ? <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.85 }}>£{(item.price_cents / 100).toFixed(2)}</span> : null}
              </button>
            ))}
          </div>
          {!showAll && activeSub.items.length > 8 && (
            <button onClick={() => setShowAll(true)} style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem', borderRadius: 8, border: '1px solid #ccc', background: 'none', fontSize: '0.8rem' }}>
              + {activeSub.items.length - 8} more
            </button>
          )}
        </>
      )}
    </div>
  );
}

interface Piece {
  id: string;
  piece_type: string | null;
  status: string | null;
  description: string | null;
  reference_photo_url: string | null;
  mark_code: string | null;
}

interface CustomerView {
  greeting: string;
  booking: { booking_code: string; customer_name: string; session_start: string; table_number: string | null; party_size: number | null };
  pieces: Piece[];
  piece_count: number;
  ready_count: number;
  in_kiln_count: number;
  loyalty: { earned: number; spent: number; balance: number };
  photos: { photo_url: string; ai_description: string | null }[];
  status_message: string;
}

function CustomerInner() {
  const params = useSearchParams();
  const code = params.get('booking');
  const [data, setData] = useState<CustomerView | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [orderConfirm, setOrderConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/customer/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('We could not find that booking.'))
      .finally(() => setLoading(false));
  }, [code]);

  if (!code) {
    return (
      <div style={{ padding: '2rem', maxWidth: '520px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Customer view</h1>
        <p style={{ color: '#666', fontSize: '0.9rem' }}>
          This is the page a customer lands on after scanning their booking QR code.
          Add <code style={{ backgroundColor: '#f0f0f0', padding: '0.1rem 0.3rem', borderRadius: 3 }}>?booking=CODE</code> to the address to preview a real session.
        </p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '520px' }}>
      {loading && <p style={{ color: '#666' }}>Loading...</p>}
      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px' }}>{error}</div>}

      {data && (
        <>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 'bold', marginBottom: '0.15rem' }}>{data.greeting}</h1>
          <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
            {new Date(data.booking.session_start).toLocaleDateString()}
            {data.booking.table_number ? ` · Table ${data.booking.table_number}` : ''}
          </p>

          <div style={{
            padding: '1rem', borderRadius: '10px', marginBottom: '1.25rem',
            backgroundColor: data.ready_count ? '#eafaf0' : data.in_kiln_count ? '#fdf6e3' : '#f9f9f9',
            display: 'flex', alignItems: 'center', gap: '0.6rem',
          }}>
            {data.ready_count ? <PackageCheck size={22} color="#1a8a3c" /> : data.in_kiln_count ? <Flame size={22} color="#b8860b" /> : null}
            <p style={{ fontWeight: 600 }}>{data.status_message}</p>
          </div>

          <button
            onClick={() => setOrdering((o) => !o)}
            style={{
              width: '100%', padding: '1.1rem', marginBottom: '1.25rem', borderRadius: '12px', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              background: 'linear-gradient(155deg, var(--clay) 0%, #9A6435 100%)', color: 'white', fontSize: '1.05rem', fontWeight: 700,
            }}
          >
            <Coffee size={20} /> {ordering ? 'Close menu' : 'Order a drink or cake'}
          </button>

          {ordering && code && (
            <OrderPanel bookingCode={code} onOrdered={() => setOrderConfirm(true)} />
          )}

          {orderConfirm && (
            <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#eafaf0', color: '#1a8a3c', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem', fontWeight: 600 }}>
              Sent to the kitchen — someone will bring it over.
            </div>
          )}

          {data.loyalty.balance > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.7rem 0.9rem', backgroundColor: '#fdf6f8', borderRadius: '8px', marginBottom: '1.25rem' }}>
              <Award size={18} color="var(--clay)" />
              <span style={{ fontSize: '0.9rem' }}>
                <strong>{data.loyalty.balance}</strong> loyalty points
              </span>
            </div>
          )}

          {data.photos.length > 0 && (
            <>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Your table</h2>
              <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', marginBottom: '1.25rem' }}>
                {data.photos.map((p, i) => (
                  <img key={i} src={p.photo_url} alt="Your pieces" style={{ height: 150, borderRadius: 8, flexShrink: 0 }} />
                ))}
              </div>
            </>
          )}

          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Your pieces {data.piece_count > 0 && `(${data.piece_count})`}
          </h2>
          {data.pieces.length === 0 ? (
            <p style={{ fontSize: '0.85rem', color: '#999' }}>
              Nothing logged against this booking yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {data.pieces.map((p) => (
                <div key={p.id} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.5rem', border: '1px solid #eee', borderRadius: '8px' }}>
                  {p.reference_photo_url && (
                    <img src={p.reference_photo_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 5 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.88rem', fontWeight: 500 }}>{p.description || p.piece_type || 'Piece'}</p>
                    <p style={{ fontSize: '0.75rem', color: '#999', textTransform: 'capitalize' }}>
                      {(p.status || '').replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

export default function CustomerPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem' }}>Loading...</div>}>
      <CustomerInner />
    </Suspense>
  );
}
