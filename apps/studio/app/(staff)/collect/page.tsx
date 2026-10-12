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
import { PieceBox } from '@/components/PieceBoxes';
import { Row as ListRow, RowAction, Chip } from '@/components/Row';
import { Section, Tally, Tool, Toolbar } from '@/components/Toolbar';
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
const dueTone = (r: Row) => (r.days != null && r.days < 0 ? 'late' : r.days != null && r.days <= 0 ? 'post' : 'quiet');

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
    <ListRow
      title={r.customer_name}
      photo={r.thumb?.url ?? null}
      box={r.thumb?.box ?? null}
      tone={r.days != null && r.days < 0 ? 'late' : 'plain'}
      detail={
        <>
          {`${r.pieces} piece${r.pieces === 1 ? '' : 's'}`}
          {r.packed > 0 && r.packed < r.pieces ? ` · ${r.packed} packed` : ''}
          {r.boxes.length ? ` · box ${r.boxes.join(', ')}` : ''}
        </>
      }
      chips={
        <>
          <Chip tone={dueTone(r)}>{dueText(r)}</Chip>
          {r.postal && <Chip tone="post">Posting</Chip>}
        </>
      }
      onClick={() => router.push(`/booking/${encodeURIComponent(r.booking_code)}`)}
      action={
        <>
          {r.days != null && r.days < 0 && r.phone && (
            <a href={`tel:${r.phone}`} aria-label={`Call ${r.customer_name}`}
              style={{ flexShrink: 0, minHeight: 40, padding: '0 0.6rem', borderRadius: 'var(--radius-md)', border: '1px solid #e6ddd2', background: 'white', color: 'var(--charcoal)', display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
              <Phone size={15} />
            </a>
          )}
          {action}
        </>
      }
    />
  );

  return (
    <PageShell title="Collect" subtitle="Whose pottery is ready, and what happens next">
      {/* [11 Oct] The three big number tiles that used to sit here said
          exactly what the three headings below them say, in 28px type:
          "5 to pack" directly above "To pack" with five rows under it. The
          numbers are a sentence now, and tapping overdue filters to it. */}
      <Tally
        items={[
          { label: 'to hand over', n: board.hand_over.length, tone: 'good' },
          { label: 'to pack', n: board.to_pack.length, tone: 'clay' },
          { label: 'overdue', n: overdue, tone: 'late', onClick: () => setOnlyDue(true) },
          { label: 'through the kiln', n: board.in_kiln_count, tone: 'quiet' },
        ]}
      />

      <Toolbar>
        <Tool onClick={() => setOnlyDue(false)} active={!onlyDue} tone="dark">Everything</Tool>
        <Tool onClick={() => setOnlyDue(true)} active={onlyDue} tone="dark">Due now</Tool>
        <Tool onClick={() => router.push('/returns')} icon={<RotateCcw size={15} />}>
          Returns{board.returns_waiting ? ` ${board.returns_waiting}` : ''}
        </Tool>
        <Tool onClick={() => router.push('/shelves')} icon={<Layers size={15} />}>Packing shots</Tool>
        <Tool onClick={() => router.push('/out-of-kiln')}>Out of the kiln</Tool>
      </Toolbar>

      <Section icon={<Check size={14} />} n={hand.length}>Hand over</Section>
      {hand.length === 0 && <p style={{ color: '#777', fontSize: 'var(--text-sm)', margin: 0 }}>Nothing packed and waiting.</p>}
      {hand.map((r) => (
        <RowCard key={r.booking_code} r={r} action={
          <RowAction onClick={() => router.push(`/collection?code=${encodeURIComponent(r.booking_code)}`)}>
            {r.postal ? <><Truck size={15} /> Post</> : 'Hand over'}
          </RowAction>
        } />
      ))}

      <Section icon={<Package size={14} />} n={pack.length}>To pack</Section>
      {pack.length === 0 && <p style={{ color: '#777', fontSize: 'var(--text-sm)', margin: 0 }}>Nothing out of the kiln waiting to be packed.</p>}
      {pack.map((r) => (
        <RowCard key={r.booking_code} r={r} action={
          <RowAction onClick={() => router.push(`/packing?code=${encodeURIComponent(r.booking_code)}`)}>Pack</RowAction>
        } />
      ))}

      {board.kiln_late.length > 0 && (
        <>
          <Section icon={<AlertTriangle size={14} />} tone="warn" n={board.kiln_late.length}>Due soon, still in the kiln</Section>
          {board.kiln_late.map((r) => (
            <RowCard key={r.booking_code} r={r} action={
              <RowAction tone="quiet" onClick={() => router.push(r.due ? `/kiln?date=${r.due}` : '/kiln')}>Kiln</RowAction>
            } />
          ))}
        </>
      )}

      <div style={{ paddingBottom: '4.5rem' }} />
    </PageShell>
  );
}
