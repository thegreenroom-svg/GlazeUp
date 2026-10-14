'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageShell } from '@/components/PageShell';
import { Chip } from '@/components/Row';
import { Count, Section, Tally, Tool, Toolbar } from '@/components/Toolbar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { PhotoWithBoxes, PieceThumb, PieceBox, PIECE_COLOURS } from '@/components/PieceBoxes';
import { postOrQueue } from '@/lib/outbox';
import { Check, ChevronDown, ChevronRight, Flame, Package, Printer } from 'lucide-react';

// [14 Oct] PACKING, ON ONE PAGE, WITH NOTHING TO SEARCH FOR.
//
// David: "what I need really is one page for packing... which shows the out
// of the kiln picture for identification and the original table photo for
// identification. I'm not going to use the photo recognition for the table
// to find the pieces for this stage, so we can cut that bit out."
//
// What this screen used to be: a queue, a shelf camera, an AI sweep that
// read a photograph and guessed whose pottery was on it, a found-so-far
// tally across multiple photos, a second camera for another shelf, a
// per-booking "photograph the shelf to find them", and three levels of
// drill-down. All of that existed to answer ONE question -- where is this
// booking's pottery -- and it answered it by searching.
//
// That question is now answered before anyone walks anywhere. Every piece is
// photographed as its shelf comes out of the kiln, so the app already knows
// what is out and what is not. Packing stops being a search and becomes a
// list: these bookings are complete, here is each piece as it was painted
// and as it came out, tick them off.
//
// What is left in the periphery is deliberate. Breakage stays, because a
// piece that broke in the kiln is the one thing that will never appear in a
// kiln photo and would otherwise hold a booking open forever.
//
// [14 Oct, evening] And nothing is behind a tap any more. Opening a booking
// opens the table photograph itself, big, with every piece numbered on it,
// and the same numbers beside it against the pieces as they came out of the
// kiln. David: "this needs to open on big pic of table photo and alongside
// pics of fired pieces and this section can just be called packing so merge
// them." So the booking came in too -- phone, address, notes -- because
// opening a second screen to read an address is how a parcel goes out to the
// wrong one.
//
// Nothing on this page calls the AI.

interface Piece {
  id: string;
  piece_type: string | null;
  description: string | null;
  assigned_to: string | null;
  notes: string | null;
  posting: boolean;
  packed: boolean;
  out: boolean;
  out_at: string | null;
  box_number: string | number | null;
  table_photo_url: string | null;
  table_box: PieceBox | null;
  kiln_photo_url: string | null;
  kiln_box: PieceBox | null;
}

interface BookingRow {
  booking_code: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  collection_notes: string | null;
  fulfilment_method: string | null;
  address: string[];
  collection_date: string | null;
  session_start: string | null;
  total: number;
  out: number;
  packed: number;
  on_hold: number;
  posting: number;
  postal_postcode: string | null;
  shelf_label: string | null;
  photo_taken_by: string | null;
  table_photo_taken_at: string | null;
  pieces: Piece[];
}

interface Board { today: string; ready: BookingRow[]; waiting: BookingRow[] }

const dueChip = (b: BookingRow, today: string) => {
  if (!b.collection_date) return null;
  const late = b.collection_date < today;
  const when = new Date(`${b.collection_date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return <Chip tone={late ? 'late' : 'clay'}>{late ? `Was due ${when}` : `Collect ${when}`}</Chip>;
};

export default function PackingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedCode = searchParams.get('code');

  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<null | { title: string; body?: string; confirmLabel: string; destructive?: boolean; run: () => void }>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/packing/board`, { cache: 'no-store' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Could not load packing (${res.status})`);
      setBoard(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load packing');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Opened from Collect, from a booking, or from the unload screen, which all
  // arrive with ?code= -- that booking opens itself rather than leaving
  // someone to find the name again in a list of sixty.
  const jumped = useRef(false);
  useEffect(() => {
    if (!linkedCode || jumped.current || !board) return;
    jumped.current = true;
    setOpen(linkedCode);
  }, [linkedCode, board]);

  // Selection belongs to whichever booking is open. Carrying it across would
  // mean ticking off someone else's pottery.
  useEffect(() => { setSelected(new Set()); }, [open]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const markPacked = async (b: BookingRow, ids: string[]) => {
    setSaving(true);
    try {
      for (const id of ids) {
        // Through the outbox: with no wifi the tick is kept and sent when
        // the connection is back, which matters in a kiln room.
        const piece = b.pieces.find((p) => p.id === id);
        await postOrQueue(
          `${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${id}/packed`,
          { packed: true },
          `Packed: ${piece?.piece_type || 'piece'}`,
        );
      }
      setBoard((prev) => prev && {
        ...prev,
        ready: prev.ready.map((r) => (r.booking_code === b.booking_code
          ? { ...r, packed: r.packed + ids.length, pieces: r.pieces.map((p) => (ids.includes(p.id) ? { ...p, packed: true } : p)) }
          : r)),
      });
      setSelected(new Set());
      const left = b.pieces.filter((p) => !p.packed && !ids.includes(p.id)).length;
      if (left === 0) {
        setPendingConfirm({
          title: 'All packed',
          body: 'Print the label for this booking now?',
          confirmLabel: 'Print label',
          run: () => router.push(`/print-label?code=${encodeURIComponent(b.booking_code)}`),
        });
      }
    } finally { setSaving(false); }
  };

  const markBroken = async (b: BookingRow, p: Piece) => {
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${p.id}/breakage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    await load();
  };

  if (error) {
    return (
      <PageShell title="Packing">
        <p style={{ color: 'var(--danger)' }}>{error}</p>
        <Toolbar><Tool onClick={load} tone="dark">Try again</Tool></Toolbar>
      </PageShell>
    );
  }
  if (!board) return <PageShell title="Packing" subtitle="Everything the kiln photos have accounted for"><p style={{ color: '#777' }}>Loading…</p></PageShell>;

  const piecesReady = board.ready.reduce((n, b) => n + b.pieces.filter((p) => !p.packed).length, 0);
  const piecesInKiln = board.waiting.reduce((n, b) => n + b.pieces.filter((p) => !p.out).length, 0);

  // ---------- one booking, opened ----------
  const Card = ({ b, kind }: { b: BookingRow; kind: 'ready' | 'waiting' }) => {
    const isOpen = open === b.booking_code;
    const toPack = b.pieces.filter((p) => !p.packed);
    const stillIn = b.pieces.filter((p) => !p.out);
    const photo = b.pieces.map((p) => p.table_photo_url).find(Boolean) || null;
    const allSelected = selected.size > 0 && selected.size === toPack.length;
    return (
      <div style={{
        border: `1px solid ${kind === 'ready' ? '#dfe8df' : '#ece2d4'}`,
        background: kind === 'ready' ? '#F7FBF7' : '#FDFBF7',
        borderRadius: 'var(--radius-md)', marginBottom: '0.5rem', overflow: 'hidden',
      }}>
        <button
          onClick={() => setOpen(isOpen ? null : b.booking_code)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', minHeight: 56, padding: '0.6rem 0.7rem', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
        >
          {isOpen ? <ChevronDown size={16} style={{ flexShrink: 0, color: '#8a8178' }} /> : <ChevronRight size={16} style={{ flexShrink: 0, color: '#8a8178' }} />}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 'var(--text-base)', fontWeight: 700 }}>{b.customer_name}</span>
            <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: '#8a8178' }}>
              {kind === 'ready'
                ? `${toPack.length} to pack${b.packed ? ` · ${b.packed} done` : ''}`
                : `${b.out} of ${b.total} out of the kiln`}
              {b.shelf_label ? ` · ${b.shelf_label}` : ''}
              {b.posting > 0 ? ` · ${b.posting} to post` : ''}
              {b.on_hold > 0 ? ` · ${b.on_hold} held back` : ''}
            </span>
          </span>
          <span style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>{dueChip(b, board.today)}</span>
        </button>

        {isOpen && (
          <div style={{ padding: '0 0.7rem 0.7rem' }}>
            {/* [14 Oct] THE TABLE PHOTO IS THE SCREEN, NOT A TOGGLE.
                David: "this needs to open on big pic of table photo and
                alongside pics of fired pieces and this section can just be
                called packing so merge them."
                Jenny packs by looking at the table shot and finding each
                piece, so it leads, big, with every piece numbered on it.
                Beside it, the same numbers against the pieces as they came
                out of the kiln: the photo says where it was, the crop says
                what is in your hand. The per-row table crop went with it --
                the whole table is right there, so cropping it again into a
                50px square beside its own photograph was saying the same
                thing twice.
                And the booking came with it. Opening a second screen to read
                an address is how a parcel goes to the wrong one. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-start' }}>
              {photo && (
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <p style={{ fontSize: 'var(--text-xs)', color: '#8a8178', margin: 0 }}>On the table</p>
                    <p style={{ fontSize: 'var(--text-xs)', color: '#8a8178', margin: 0, textAlign: 'right' }}>
                      {b.photo_taken_by ? <>by <strong style={{ color: 'var(--charcoal)' }}>{b.photo_taken_by}</strong></> : 'photographer not recorded'}
                      {b.table_photo_taken_at && ` · ${new Date(b.table_photo_taken_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>
                  <PhotoWithBoxes
                    src={photo}
                    pieces={b.pieces.map((p) => ({ piece_type: p.piece_type, description: p.description, box: p.table_box }))}
                  />
                </div>
              )}

              <div style={{ flex: '1 1 260px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <p style={{ fontSize: 'var(--text-xs)', color: '#8a8178', margin: '0 0 0.05rem' }}>Out of the kiln</p>
                {b.pieces.map((p, i) => {
                  const picked = selected.has(p.id);
                  const canPick = kind === 'ready' && !p.packed;
                  return (
                    <div
                      key={p.id}
                      onClick={canPick ? () => toggle(p.id) : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.55rem', minHeight: 52,
                        padding: '0.4rem 0.5rem', borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${picked ? 'var(--clay)' : '#efe8df'}`,
                        background: p.packed ? '#F1F6F1' : picked ? '#FBF2EA' : 'white',
                        cursor: canPick ? 'pointer' : 'default',
                        opacity: p.packed ? 0.65 : 1,
                      }}
                    >
                      {canPick && (
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={() => toggle(p.id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ width: 24, height: 24, flexShrink: 0, cursor: 'pointer' }}
                          aria-label={`Select ${p.piece_type || 'piece'} ${i + 1}`}
                        />
                      )}
                      {/* The same number and colour as its box on the photo,
                          which is the only thing tying the two together. */}
                      <span style={{ position: 'relative', flexShrink: 0 }}>
                        <PieceThumb
                          url={p.out ? p.kiln_photo_url : p.table_photo_url}
                          box={p.out ? p.kiln_box : p.table_box}
                          size={60}
                          ring={PIECE_COLOURS[i % 6]}
                        />
                        <span style={{ position: 'absolute', top: -7, left: -7, width: 20, height: 20, borderRadius: '50%', background: PIECE_COLOURS[i % 6], color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px white' }}>
                          {i + 1}
                        </span>
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600 }}>{p.piece_type || 'Piece'}</span>
                        {p.description && (
                          <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: '#8a8178' }}>{p.description}</span>
                        )}
                        {p.assigned_to && <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--clay)', fontWeight: 600 }}>For {p.assigned_to}</span>}
                        {p.notes && <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: '#A6761D' }}>{p.notes}</span>}
                        {!p.out && <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: '#A6761D', fontWeight: 600 }}>Still in the kiln</span>}
                        {p.out && p.box_number != null && <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: '#8a8178' }}>Box {p.box_number}</span>}
                      </span>
                      {p.packed && <Check size={17} style={{ color: '#2E7D32', flexShrink: 0 }} />}
                      {/* The only way a piece leaves this list without ever
                          being photographed out of the kiln. Without it a
                          broken piece holds its booking in "waiting" for
                          good. */}
                      {!p.out && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingConfirm({
                              title: 'It broke in the kiln?',
                              body: 'The booking stops waiting on it, and a message to the customer is drafted on the booking page for someone to send.',
                              confirmLabel: 'It broke',
                              destructive: true,
                              run: () => { void markBroken(b, p); },
                            });
                          }}
                          style={{ flexShrink: 0, minHeight: 36, padding: '0 0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid #e6ddd2', background: 'white', color: '#A33', fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer' }}
                        >
                          Broke
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* The booking, as much of it as packing ever needs. Phone and
                email are tappable, because the two reasons to want them here
                are "they are at the counter and this is wrong" and "this one
                broke". */}
            <div style={{ marginTop: '0.6rem', padding: '0.55rem 0.65rem', borderRadius: 'var(--radius-md)', background: 'white', border: '1px solid #efe8df', display: 'flex', flexWrap: 'wrap', gap: '0.3rem 1.1rem' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: '#8a8178' }}>
                <strong style={{ color: 'var(--charcoal)', fontSize: 'var(--text-sm)' }}>{b.customer_name}</strong>
                {b.collection_date && ` · collect ${new Date(`${b.collection_date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`}
                {b.session_start && ` · painted ${new Date(b.session_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
              </span>
              {b.phone && (
                <a href={`tel:${b.phone}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--clay)', textDecoration: 'none' }}>{b.phone}</a>
              )}
              {b.email && (
                <a href={`mailto:${b.email}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--clay)', textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.email}</a>
              )}
              {b.posting > 0 && (
                <span style={{ flexBasis: '100%', fontSize: 'var(--text-xs)', color: 'var(--charcoal)' }}>
                  <strong style={{ color: '#8a4a2a' }}>Posting:</strong>{' '}
                  {b.address.length ? b.address.join(', ') : 'no address on the booking yet'}
                </span>
              )}
              {(b.collection_notes || b.notes) && (
                <span style={{ flexBasis: '100%', fontSize: 'var(--text-xs)', color: '#A6761D' }}>
                  {[b.collection_notes, b.notes].filter(Boolean).join(' · ')}
                </span>
              )}
              {b.on_hold > 0 && (
                <span style={{ flexBasis: '100%', fontSize: 'var(--text-xs)', color: '#A6761D' }}>
                  {b.on_hold} piece{b.on_hold === 1 ? '' : 's'} held back for a return visit, not in this parcel.
                </span>
              )}
            </div>

            <Toolbar style={{ marginTop: '0.55rem' }}>
              {kind === 'ready' && toPack.length > 0 && (
                <Tool
                  tone="dark"
                  active={allSelected}
                  onClick={() => setSelected((prev) => (prev.size === toPack.length ? new Set() : new Set(toPack.map((p) => p.id))))}
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </Tool>
              )}
              <Tool onClick={() => router.push(`/print-label?code=${encodeURIComponent(b.booking_code)}`)} icon={<Printer size={15} />}>
                Print label
              </Tool>
            </Toolbar>

            {kind === 'ready' && selected.size > 0 && (
              <button
                onClick={() => markPacked(b, Array.from(selected))}
                disabled={saving}
                style={{
                  width: '100%', minHeight: 48, marginTop: '0.55rem', padding: '0.7rem',
                  borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)',
                  color: 'white', fontWeight: 700, fontSize: 'var(--text-md)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                }}
              >
                <Check size={16} />
                {saving ? 'Packing…' : `Mark ${selected.size} packed`}
              </button>
            )}

            {kind === 'waiting' && (
              <p style={{ fontSize: 'var(--text-xs)', color: '#8a8178', marginTop: '0.5rem' }}>
                {stillIn.length} piece{stillIn.length === 1 ? '' : 's'} not photographed out of the kiln yet. It moves up to Ready on its own once the shelf it is on is unloaded and photographed.
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <PageShell title="Packing" subtitle="Everything the kiln photos have accounted for">
      <Tally
        items={[
          { label: board.ready.length === 1 ? 'booking ready' : 'bookings ready', n: board.ready.length, tone: 'good' },
          { label: piecesReady === 1 ? 'piece to pack' : 'pieces to pack', n: piecesReady, tone: 'clay' },
          { label: 'still in the kiln', n: piecesInKiln, tone: 'warn' },
        ]}
      />

      <Toolbar>
        <Tool onClick={() => router.push('/out-of-kiln')} icon={<Flame size={15} />}>Unloading a kiln</Tool>
        <Tool onClick={load}>Refresh</Tool>
      </Toolbar>

      <Section icon={<Package size={14} />} tone="good" n={board.ready.length}>Ready to pack</Section>
      {board.ready.length === 0 ? (
        <EmptyState
          icon={<Package size={24} />}
          title="Nothing complete yet"
          hint={board.waiting.length
            ? 'Bookings appear here the moment every one of their pieces has been photographed coming out of the kiln.'
            : 'Nothing is waiting to be packed.'}
        />
      ) : (
        board.ready.map((b) => <Card key={b.booking_code} b={b} kind="ready" />)
      )}

      {board.waiting.length > 0 && (
        <>
          <Section icon={<Flame size={14} />} tone="warn" n={board.waiting.length} right={<Count>{piecesInKiln} piece{piecesInKiln === 1 ? '' : 's'}</Count>}>
            Waiting on the kiln
          </Section>
          {board.waiting.map((b) => <Card key={b.booking_code} b={b} kind="waiting" />)}
        </>
      )}

      <div style={{ paddingBottom: '4.5rem' }} />

      <ConfirmDialog
        open={!!pendingConfirm}
        title={pendingConfirm?.title || ''}
        body={pendingConfirm?.body}
        confirmLabel={pendingConfirm?.confirmLabel}
        destructive={pendingConfirm?.destructive}
        onConfirm={() => { const r = pendingConfirm?.run; setPendingConfirm(null); r?.(); }}
        onCancel={() => setPendingConfirm(null)}
      />
    </PageShell>
  );
}
