'use client';

// [11 Oct] COLLECT, ON ONE SCREEN. Daisy: "merge collect into one screen".
// Packing, Collection, Overdue and the returns shelf answered one question
// between them -- whose pottery is ready, and what has to happen to it
// next -- across four pages. This is that answer on one: hand over, pack,
// and the few that are due soon but not out of the kiln yet. Each name
// opens the booking page; the buttons go straight to the job.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { PieceThumb, PieceBox } from '@/components/PieceBoxes';
import { AlertTriangle, Check, Layers, Package, Phone, RotateCcw, Truck } from 'lucide-react';

export const dynamic = 'force-dynamic';
const API = process.env.NEXT_PUBLIC_API_URL;

interface Row {
  booking_code: string; customer_name: string; phone: string | null; painted: string | null;
  due: string | null; days: number | null; pieces: number; packed: number; out: number; boxes: (string | number)[];
  postal: boolean; thumb: { url: string; box: PieceBox | null } | null;
}
interface Board { today: string; hand_over: Row[]; to_pack: Row[]; kiln_late: Row[]; in_kiln_count: number; returns_waiting: number }

const dueText = (r: Row) => {
  if (r.days == null) return 'No date';
  if (r.days < 0) return `${-r.days} day${r.days === -1 ? '' : 's'} overdue`;
  if (r.days === 0) return 'Due today';
  if (r.days === 1) return 'Due tomorrow';
  return `Due ${new Date(`${r.due}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
};
const dueColour = (r: Row) => (r.days != null && r.days < 0 ? '#C0392B' : r.days != null && r.days <= 0 ? '#A6761D' : '#777');
const section: React.CSSProperties = { margin: '1.2rem 0 0.5rem', fontSize: 'var(--text-sm)', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#8a8178', display: 'flex', alignItems: 'center', gap: '0.4rem' };
const actBtn: React.CSSProperties = { flexShrink: 0, minHeight: 40, padding: '0 0.85rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' };

export default function CollectPage() {
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [onlyDue, setOnlyDue] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/spec/collect/board`, { cache: 'no-store' })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || 'failed'); setBoard(d); })
      .catch(() => setErr('Could not load. Pull down to try again.'));
  }, []);

  if (err) return <PageShell title="Collect"><p style={{ color: '#C0392B' }}>{err}</p></PageShell>;
  if (!board) return <PageShell title="Collect" subtitle="Whose pottery is ready, and what happens next"><p style={{ color: '#777' }}>Loading…</p></PageShell>;

  const keep = (r: Row) => !onlyDue || (r.days != null && r.days <= 1);
  const hand = board.hand_over.filter(keep);
  const pack = board.to_pack.filter(keep);
  const overdue = [...board.hand_over, ...board.to_pack, ...board.kiln_late].filter((r) => r.days != null && r.days < 0).length;

  const RowCard = ({ r, action }: { r: Row; action: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'white', border: `1px solid ${r.days != null && r.days < 0 ? '#f0c9c3' : '#ece5db'}`, borderRadius: 'var(--radius-md)', padding: '0.55rem 0.6rem', marginBottom: '0.45rem' }}>
      <button onClick={() => router.push(`/booking/${encodeURIComponent(r.booking_code)}`)}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '0.6rem', border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
        <PieceThumb url={r.thumb?.url} box={r.thumb?.box} size={44} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--charcoal)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customer_name}</span>
          <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: '#777' }}>
            <b style={{ color: dueColour(r) }}>{dueText(r)}</b>
            {` · ${r.pieces} piece${r.pieces === 1 ? '' : 's'}`}
            {r.packed > 0 && r.packed < r.pieces ? ` · ${r.packed} packed` : ''}
            {r.boxes.length ? ` · box ${r.boxes.join(', ')}` : ''}
            {r.postal ? ' · posting' : ''}
          </span>
        </span>
      </button>
      {r.days != null && r.days < 0 && r.phone && (
        <a href={`tel:${r.phone}`} aria-label={`Call ${r.customer_name}`} style={{ ...actBtn, background: 'white', color: 'var(--charcoal)', border: '1px solid #e6ddd2', padding: '0 0.6rem', textDecoration: 'none' }}><Phone size={15} /></a>
      )}
      {action}
    </div>
  );

  return (
    <PageShell title="Collect" subtitle="Whose pottery is ready, and what happens next">
      {/* The day at a glance */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        {[
          ['To hand over', board.hand_over.length, '#2E7D32'],
          ['To pack', board.to_pack.length, 'var(--clay)'],
          ['Overdue', overdue, overdue ? '#C0392B' : '#777'],
        ].map(([label, n, c]) => (
          <div key={String(label)} style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.6rem', textAlign: 'center' }}>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: String(c) }}>{n}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: '#777', fontWeight: 600 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.8rem' }}>
        {[['Everything', false], ['Due now', true]].map(([label, v]) => (
          <button key={String(label)} onClick={() => setOnlyDue(v as boolean)}
            style={{ minHeight: 36, padding: '0 0.9rem', borderRadius: 999, border: '1px solid #e6ddd2', background: onlyDue === v ? 'var(--charcoal)' : 'white', color: onlyDue === v ? 'white' : 'var(--charcoal)', fontWeight: 700, fontSize: 'var(--text-sm)', cursor: 'pointer' }}>
            {label as string}
          </button>
        ))}
      </div>

      <h2 style={section}><Check size={14} /> Hand over</h2>
      {hand.length === 0 && <p style={{ color: '#777', fontSize: 'var(--text-sm)', margin: 0 }}>Nothing packed and waiting.</p>}
      {hand.map((r) => (
        <RowCard key={r.booking_code} r={r} action={
          r.postal
            ? <button style={actBtn} onClick={() => router.push(`/collection?code=${encodeURIComponent(r.booking_code)}`)}><Truck size={15} /> Post</button>
            : <button style={actBtn} onClick={() => router.push(`/collection?code=${encodeURIComponent(r.booking_code)}`)}>Hand over</button>
        } />
      ))}

      <h2 style={section}><Package size={14} /> To pack</h2>
      {pack.length === 0 && <p style={{ color: '#777', fontSize: 'var(--text-sm)', margin: 0 }}>Nothing out of the kiln waiting to be packed.</p>}
      {pack.map((r) => (
        <RowCard key={r.booking_code} r={r} action={
          <button style={actBtn} onClick={() => router.push(`/packing?code=${encodeURIComponent(r.booking_code)}`)}>Pack</button>
        } />
      ))}

      {board.kiln_late.length > 0 && (
        <>
          <h2 style={{ ...section, color: '#A6761D' }}><AlertTriangle size={14} /> Due soon, not out of the kiln</h2>
          {board.kiln_late.map((r) => (
            <RowCard key={r.booking_code} r={r} action={
              <button style={{ ...actBtn, background: 'white', color: 'var(--charcoal)', border: '1px solid #e6ddd2' }}
                onClick={() => router.push(r.due ? `/kiln?date=${r.due}` : '/kiln')}>Kiln</button>
            } />
          ))}
        </>
      )}
      {board.in_kiln_count > board.kiln_late.length && (
        <p style={{ fontSize: 'var(--text-xs)', color: '#777', margin: '0.6rem 0 0' }}>
          {board.in_kiln_count - board.kiln_late.length} more booking{board.in_kiln_count - board.kiln_late.length === 1 ? '' : 's'} on the way through the kiln.
        </p>
      )}

      {/* Where things are kept */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1.4rem', paddingBottom: '4.5rem' }}>
        <button onClick={() => router.push('/returns')} style={{ ...actBtn, background: 'white', color: 'var(--charcoal)', border: '1px solid #e6ddd2', minHeight: 44 }}>
          <RotateCcw size={15} /> Returns shelf{board.returns_waiting ? ` (${board.returns_waiting})` : ''}
        </button>
        <button onClick={() => router.push('/shelves')} style={{ ...actBtn, background: 'white', color: 'var(--charcoal)', border: '1px solid #e6ddd2', minHeight: 44 }}>
          <Layers size={15} /> Wall of shelves
        </button>
        <button onClick={() => router.push('/out-of-kiln')} style={{ ...actBtn, background: 'white', color: 'var(--charcoal)', border: '1px solid #e6ddd2', minHeight: 44 }}>
          Out of the kiln
        </button>
      </div>
    </PageShell>
  );
}
