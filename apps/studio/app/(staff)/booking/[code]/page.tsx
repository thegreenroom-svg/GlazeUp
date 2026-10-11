'use client';

// [11 Oct] ONE BOOKING PAGE. Daisy: "one booking page that everything links
// to." A booking's story was split across the cards, the kiln shelves,
// packing, backfill and the till. Every name on every screen now opens this:
// who and when, each piece with its photo, shape, price and where it is now,
// the table photos, the tickets that paid, its kiln shelf, a dated timeline,
// and the customer's other visits. The collection date can be changed here.

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { PhotoWithBoxes, PieceThumb, pieceColour, PieceBox } from '@/components/PieceBoxes';
import { PieceViewer } from '@/components/PieceViewer';
import { DateSlider, dayName } from '@/components/DateSlider';
import { Calendar, Flame, Mail, Package, Phone, Printer, Receipt, Truck } from 'lucide-react';

export const dynamic = 'force-dynamic';
const API = process.env.NEXT_PUBLIC_API_URL;

interface Piece {
  id: string; piece_type: string | null; description: string | null; parts: number; parts_seen: number;
  photo: string | null; box: PieceBox | null; shape: string | null; price_cents: number;
  shape_sure: boolean; shape_how: string | null; stage: string; box_number: number | string | null;
  notes: string | null; size_cm: number | null; postal: boolean;
}
interface PageData {
  booking: {
    booking_code: string; customer_name: string; email: string | null; phone: string | null;
    session_start: string | null; session_end: string | null; space: string | null; table: string | null;
    party_size: number | null; notes: string | null; collection_notes: string | null; status: string | null;
    booking_type: string | null; wheel: boolean; postal: boolean; shipping: string | null;
    arrived_at: string | null; collected_at: string | null; ready_email_sent_at: string | null;
    collection_date: string | null; days_to_collect: number | null;
    paid_piece_count: number | null; paid_ticket_count: number | null; payment: string | null;
  };
  pieces: Piece[];
  photos: { url: string; taken_at: string | null; pieces: (Piece & { n: number })[] }[];
  total_cents: number;
  tickets: { ticket_name: string | null; at: string | null; state: string | null; total_cents: number; pottery: unknown[]; basis: string | null }[];
  shelf: { collection_date: string; shelved_at?: string | null; dipped_at?: string | null; into_kiln_at?: string | null; out_of_kiln_at?: string | null; kilns?: string[] | null; fire_program?: string | null; plan_fire_date?: string | null } | null;
  backfill: { id: string; taken_at: string | null; status: string | null; tag_name: string | null; pieces_created: number | null; error_message: string | null }[];
  timeline: { at: string; what: string; who: string | null }[];
  others: { booking_code: string; customer_name: string; session_start: string | null; status: string | null; collected_at: string | null }[];
}

const money = (c: number) => `£${(c / 100).toFixed(2).replace(/\.00$/, '')}`;
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '';
const card: React.CSSProperties = { background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.9rem', marginBottom: '0.9rem' };
const h2: React.CSSProperties = { margin: '0 0 0.6rem', fontSize: 'var(--text-sm)', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#8a8178', display: 'flex', alignItems: 'center', gap: '0.35rem' };
const chip = (bg: string, fg: string): React.CSSProperties => ({ display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: 999, background: bg, color: fg, fontSize: 'var(--text-xs)', fontWeight: 700, marginRight: 6, marginTop: 4 });
const btn: React.CSSProperties = { minHeight: 44, padding: '0 0.9rem', borderRadius: 'var(--radius-md)', border: '1px solid #e6ddd2', background: 'white', color: 'var(--charcoal)', fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' };
const stageColour = (s: string) => s === 'collected' || s === 'packed' ? '#2E7D32' : s === 'damaged' ? '#C0392B' : s.startsWith('left out') ? '#A6761D' : s === 'out of the kiln' ? '#2b6fe0' : '#777';

export default function BookingPage() {
  const params = useParams();
  const router = useRouter();
  const code = decodeURIComponent(String(params?.code || ''));
  const [data, setData] = useState<PageData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/spec/bookings/${encodeURIComponent(code)}/page`);
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Could not load this booking'); return; }
      setData(d); setNewDate(d.booking.collection_date || '');
    } catch { setErr('Could not reach the server'); }
  }, [code]);
  useEffect(() => { load(); }, [load]);

  const saveDate = async () => {
    if (!newDate) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/spec/bookings/${encodeURIComponent(code)}/collection-date`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ collection_date: newDate }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); alertLine(d.error || 'Could not save the date'); return; }
      setDateOpen(false);
      await load();
    } finally { setSaving(false); }
  };
  const [notice, setNotice] = useState<string | null>(null);
  const alertLine = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 4000); };

  if (err) return <PageShell title="Booking" subtitle={code}><p style={{ color: '#C0392B' }}>{err}</p></PageShell>;
  if (!data) return <PageShell title="Booking" subtitle={code}><p style={{ color: '#777' }}>Loading…</p></PageShell>;

  const b = data.booking;
  const day = b.session_start ? b.session_start.slice(0, 10) : '';
  const sessionLine = [
    b.session_start ? new Date(b.session_start).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/London' }) : null,
    b.session_start ? new Date(b.session_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : null,
    b.space, b.table ? `table ${b.table}` : null, b.party_size ? `${b.party_size} ${b.party_size === 1 ? 'person' : 'people'}` : null,
  ].filter(Boolean).join(' · ');
  const s = data.shelf;
  const shelfStage = !s ? null : s.out_of_kiln_at ? 'Out of the kiln' : s.into_kiln_at ? `In the kiln${s.kilns?.length ? ` (${s.kilns.join(' + ')})` : ''}` : s.dipped_at ? 'Dipped, waiting for the kiln' : s.shelved_at ? 'On the shelf' : 'Shelf not started';
  const due = b.days_to_collect;
  const dueText = due == null ? '' : b.collected_at ? '' : due === 0 ? 'today' : due === 1 ? 'tomorrow' : due > 1 ? `in ${due} days` : `${-due} day${due === -1 ? '' : 's'} overdue`;

  return (
    <PageShell title={b.customer_name} subtitle={sessionLine}>
      {notice && <p style={{ ...card, color: '#C0392B', fontWeight: 700 }}>{notice}</p>}

      {/* Status and contact */}
      <div style={card}>
        <div>
          {b.collected_at ? <span style={chip('#e7f4e8', '#2E7D32')}>Collected {when(b.collected_at)}</span>
            : b.arrived_at ? <span style={chip('#eef3fb', '#2b6fe0')}>Came in</span> : <span style={chip('#f3efe9', '#777')}>{b.status || 'Booked'}</span>}
          {b.wheel && <span style={chip('#f6ece1', '#a0522d')}>Wheel</span>}
          {b.postal && <span style={chip('#fdf3e0', '#A6761D')}>Posting</span>}
          {b.ready_email_sent_at && <span style={chip('#e7f4e8', '#2E7D32')}>Told it is ready</span>}
          <span style={chip('#f3efe9', '#777')}>{b.booking_code}</span>
        </div>
        {(b.phone || b.email) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.7rem' }}>
            {b.phone && <a href={`tel:${b.phone}`} style={{ ...btn, textDecoration: 'none' }}><Phone size={15} /> {b.phone}</a>}
            {b.email && <a href={`mailto:${b.email}`} style={{ ...btn, textDecoration: 'none', maxWidth: '100%', overflow: 'hidden' }}><Mail size={15} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.email}</span></a>}
          </div>
        )}
        {b.postal && b.shipping && <p style={{ margin: '0.6rem 0 0', fontSize: 'var(--text-sm)', display: 'flex', gap: '0.4rem' }}><Truck size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {b.shipping}</p>}
        {b.notes && <p style={{ margin: '0.6rem 0 0', fontSize: 'var(--text-sm)', color: '#555' }}>{b.notes}</p>}
        {b.collection_notes && <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--text-sm)', color: '#C0392B', fontWeight: 600 }}>{b.collection_notes}</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.8rem' }}>
          <button style={btn} onClick={() => router.push(`/packing?code=${encodeURIComponent(b.booking_code)}`)}><Package size={15} /> Pack</button>
          {day && <button style={btn} onClick={() => router.push(`/daily-cards?date=${day}&code=${encodeURIComponent(b.booking_code)}&open=1`)}><Printer size={15} /> Card</button>}
        </div>
      </div>

      {/* Collection date and kiln shelf */}
      <div style={card}>
        <h2 style={h2}><Calendar size={14} /> Collection</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 800 }}>{b.collection_date ? dayName(b.collection_date) : 'No date yet'}</p>
            {dueText && <p style={{ margin: '0.1rem 0 0', fontSize: 'var(--text-sm)', color: due != null && due < 0 ? '#C0392B' : '#777', fontWeight: 600 }}>{dueText}</p>}
          </div>
          {!b.collected_at && <button style={btn} onClick={() => setDateOpen((v) => !v)}>{dateOpen ? 'Cancel' : 'Change date'}</button>}
        </div>
        {dateOpen && (
          <div style={{ marginTop: '0.7rem' }}>
            <DateSlider value={newDate} onChange={setNewDate} mark={b.collection_date || undefined} busy={saving} />
            <button onClick={saveDate} disabled={saving || !newDate || newDate === b.collection_date}
              style={{ width: '100%', minHeight: 48, marginTop: '0.5rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', opacity: !newDate || newDate === b.collection_date ? 0.5 : 1 }}>
              {saving ? 'Saving…' : newDate ? `Move to ${dayName(newDate)}` : 'Pick a day'}
            </button>
            <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--text-xs)', color: '#777' }}>The pieces move to that date's kiln shelf. Re-label them if they are already on a shelf.</p>
          </div>
        )}
        {s && (
          <button onClick={() => router.push(`/kiln?date=${s.collection_date}`)}
            style={{ ...btn, width: '100%', justifyContent: 'space-between', marginTop: '0.7rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Flame size={15} /> Kiln shelf: {shelfStage}</span>
            {s.plan_fire_date && !s.into_kiln_at && <span style={{ fontWeight: 600, color: '#777', fontSize: 'var(--text-xs)' }}>firing {dayName(s.plan_fire_date)}</span>}
          </button>
        )}
      </div>

      {/* Pieces */}
      <div style={card}>
        <h2 style={h2}>{data.pieces.length} piece{data.pieces.length === 1 ? '' : 's'}{data.total_cents ? ` · ${money(data.total_cents)}` : ''}</h2>
        {data.pieces.length === 0 && <p style={{ margin: 0, color: '#777', fontSize: 'var(--text-sm)' }}>No pieces photographed yet.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.6rem' }}>
          {data.pieces.map((p, i) => (
            <button key={p.id} onClick={() => setViewer(i)} style={{ textAlign: 'left', border: '1px solid #ece5db', borderRadius: 'var(--radius-sm)', background: 'white', padding: '0.5rem', cursor: 'pointer', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <PieceThumb url={p.photo} box={p.box} size={56} ring={pieceColour(i)} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--charcoal)' }}>{i + 1}. {p.shape || p.piece_type || 'Piece'}</span>
                {p.description && p.description !== p.shape && <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: '#555' }}>{p.description}</span>}
                <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: '#777' }}>
                  {p.price_cents ? money(p.price_cents) : ''}{p.shape && !p.shape_sure ? `${p.price_cents ? ' · ' : ''}guess` : ''}
                  {p.parts > 1 ? ` · ${p.parts} parts` : ''}{p.box_number ? ` · box ${p.box_number}` : ''}
                </span>
                <span style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, color: stageColour(p.stage) }}>{p.stage}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table photos */}
      {data.photos.length > 0 && (
        <div style={card}>
          <h2 style={h2}>Table photo{data.photos.length === 1 ? '' : 's'}</h2>
          {data.photos.map((ph) => (
            <div key={ph.url} style={{ marginBottom: '0.6rem' }}>
              <PhotoWithBoxes src={ph.url} pieces={ph.pieces.map((p) => ({ index: p.n, piece_type: p.piece_type, description: p.description, box: p.box }))}
                onPick={(k) => setViewer(ph.pieces[k].n - 1)} />
              {ph.taken_at && <p style={{ margin: '0.3rem 0 0', fontSize: 'var(--text-xs)', color: '#777' }}>Taken {when(ph.taken_at)}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Till */}
      <div style={card}>
        <h2 style={h2}><Receipt size={14} /> Till</h2>
        {data.tickets.length === 0
          ? <p style={{ margin: 0, color: '#777', fontSize: 'var(--text-sm)' }}>No till ticket linked yet.</p>
          : data.tickets.map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.35rem 0', borderTop: i ? '1px solid #f3efe9' : 'none', fontSize: 'var(--text-sm)' }}>
              <span><b>{t.ticket_name || 'Unnamed ticket'}</b> <span style={{ color: '#777' }}>{when(t.at)}{t.basis ? ` · ${t.basis}` : ''}</span></span>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{money(t.total_cents)}{t.state && t.state !== 'COMPLETED' ? ` (${t.state.toLowerCase()})` : ''}</span>
            </div>
          ))}
        {(b.paid_piece_count || b.payment) && <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--text-xs)', color: '#777' }}>{[b.paid_piece_count ? `${b.paid_piece_count} pieces paid` : null, b.payment].filter(Boolean).join(' · ')}</p>}
      </div>

      {/* Timeline */}
      {data.timeline.length > 0 && (
        <div style={card}>
          <h2 style={h2}>What has happened</h2>
          {data.timeline.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.7rem', fontSize: 'var(--text-sm)', padding: '0.25rem 0' }}>
              <span style={{ color: '#777', minWidth: 120, flexShrink: 0 }}>{when(t.at)}</span>
              <span>{t.what}{t.who ? <span style={{ color: '#777' }}> · {t.who}</span> : null}</span>
            </div>
          ))}
        </div>
      )}

      {/* iPad photos read for this booking */}
      {data.backfill.length > 0 && (
        <div style={card}>
          <h2 style={h2}>iPad photos</h2>
          {data.backfill.map((f) => (
            <p key={f.id} style={{ margin: '0.2rem 0', fontSize: 'var(--text-sm)' }}>
              {when(f.taken_at)} · <span style={{ fontWeight: 700, color: f.status === 'done' ? '#2E7D32' : f.status === 'error' ? '#C0392B' : '#A6761D' }}>{f.status}</span>
              {f.pieces_created ? ` · ${f.pieces_created} pieces` : ''}{f.error_message ? ` · ${f.error_message}` : ''}
            </p>
          ))}
        </div>
      )}

      {/* Other visits */}
      {data.others.length > 0 && (
        <div style={card}>
          <h2 style={h2}>Other visits</h2>
          {data.others.map((o) => (
            <button key={o.booking_code} onClick={() => router.push(`/booking/${encodeURIComponent(o.booking_code)}`)}
              style={{ ...btn, width: '100%', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span>{o.session_start ? new Date(o.session_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : o.booking_code}</span>
              <span style={{ fontWeight: 600, color: o.collected_at ? '#2E7D32' : '#777', fontSize: 'var(--text-xs)' }}>{o.collected_at ? 'collected' : o.status || ''}</span>
            </button>
          ))}
        </div>
      )}

      {viewer != null && (
        <PieceViewer
          pieces={data.pieces.map((p) => ({ photo: p.photo, box: p.box, piece_type: p.shape || p.piece_type, description: p.description, note: [p.stage, p.notes].filter(Boolean).join(' · ') }))}
          start={viewer} title={b.customer_name} onClose={() => setViewer(null)} />
      )}
    </PageShell>
  );
}
