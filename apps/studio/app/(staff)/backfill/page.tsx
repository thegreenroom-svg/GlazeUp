'use client';

// [6 Sep] BACKFILL FROM THE CAMERA ROLL.
//
// Two faults Daisy found, both real:
//
// 1. "It only shows one booking." A photo can hold SEVERAL tables --
//    always true of a library screenshot, and true in the studio when
//    someone stands back far enough to catch the next table along. The
//    old page read one photo as one table, which quietly put other
//    customers' pieces onto one booking. Identification is now two
//    steps: find every chalk board, then assign each piece to the
//    board it sits with. Each table saves separately, with the photo
//    CROPPED to that table, so a booking's reference image shows its
//    own pottery and nobody else's.
//
// 2. "Do we need to see the photos in a huge scroll down -- can there
//    not be a smaller grid to expand?" Right. Full-bleed photos meant
//    scrolling four screens to reach the one needing a decision. Now
//    it is a thumbnail grid, each tile badged with what was found and
//    whether a person is still needed, and only the opened tile draws
//    its boxes.
//
// It stays after the backlog clears: any day the iPad gets used the
// normal way instead of the app is recoverable through this.

import { useEffect, useRef, useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { compressPhotoForUpload } from '@/lib/compressPhoto';
import { Camera, Loader, Check, AlertCircle } from 'lucide-react';
import { PhotoWithBoxes, PieceList, pieceColour, type PieceBox } from '@/components/PieceBoxes';

export const dynamic = 'force-dynamic';

// Box and the colour palette now come from the shared component, so a
// piece is the same colour here as it is on packing and on the floor.
type Box = PieceBox;
interface Piece { index: number; piece_type: string; description: string; box: Box | null }
interface Table {
  tag_name: string | null;
  box: Box | null;
  pieces: Piece[];
  bookingCode: string | null;
  saved: boolean;
}
interface Booking { booking_code: string; customer_name: string; session_start: string }
interface Shot {
  file: File;
  url: string;
  status: 'waiting' | 'reading' | 'read' | 'saving' | 'failed';
  tables: Table[];
  error: string | null;
}

function scoreName(tag: string, name: string) {
  const a = tag.toLowerCase().replace(/[^a-z ]/g, '').trim();
  const b = name.toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  const at = a.split(/\s+/), bt = b.split(/\s+/);
  const shared = at.filter((t) => t.length > 2 && bt.some((u) => u.startsWith(t) || t.startsWith(u)));
  return shared.length / Math.max(at.length, bt.length);
}

// A booking's reference photo must show that booking's table and
// nothing else, or the shelf matcher ends up comparing against other
// people's pottery. Padded slightly so an edge piece is not sliced.
async function cropToTable(file: File, box: Box | null): Promise<Blob> {
  if (!box) return compressPhotoForUpload(file, 1600);
  const bmp = await createImageBitmap(file);
  const pad = 2;
  const l = Math.max(0, box.left_pct - pad) / 100 * bmp.width;
  const t = Math.max(0, box.top_pct - pad) / 100 * bmp.height;
  const r = Math.min(100, box.right_pct + pad) / 100 * bmp.width;
  const b = Math.min(100, box.bottom_pct + pad) / 100 * bmp.height;
  const w = Math.max(1, Math.round(r - l)), h = Math.max(1, Math.round(b - t));
  const scale = Math.min(1, 1600 / Math.max(w, h));
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
  cv.getContext('2d')!.drawImage(bmp, l, t, w, h, 0, 0, cv.width, cv.height);
  bmp.close();
  return new Promise((res) => cv.toBlob((bl) => res(bl!), 'image/jpeg', 0.85));
}

// A piece box is measured against the WHOLE photo; once the photo is
// cropped to one table it has to be re-expressed against the crop, or
// every box on the booking page points at empty space.
function reboxToTable(piece: Box, table: Box | null): Box {
  if (!table) return piece;
  const pad = 2;
  const l = Math.max(0, table.left_pct - pad), t = Math.max(0, table.top_pct - pad);
  const r = Math.min(100, table.right_pct + pad), b = Math.min(100, table.bottom_pct + pad);
  const w = Math.max(0.01, r - l), h = Math.max(0.01, b - t);
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  return {
    left_pct: clamp((piece.left_pct - l) / w * 100),
    top_pct: clamp((piece.top_pct - t) / h * 100),
    right_pct: clamp((piece.right_pct - l) / w * 100),
    bottom_pct: clamp((piece.bottom_pct - t) / h * 100),
  };
}

export default function BackfillPage() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const [prog, setProg] = useState<{ on_disk: number; total: number; pending: number; done: number; unmatched: number; failed: number; duplicate: number; pieces: number } | null>(null);
  const [running, setRunning] = useState(false);

  const loadProgress = () =>
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/backfill/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setProg(d))
      .catch(() => {});

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setBookings(Array.isArray(d) ? d : []))
      .catch(() => {});
    loadProgress();
  }, []);

  const runBatch = async () => {
    setRunning(true);
    try {
      for (let pass = 0; pass < 30; pass++) {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/backfill/run`, { method: 'POST' });
        const d = await res.json();
        await loadProgress();
        // Stop on a run that is matching nothing. Continuing would just
        // spend the remaining AI calls to reach the same answer.
        if (!res.ok || !d.remaining || d.stalled) break;
      }
    } finally { setRunning(false); loadProgress(); }
  };

  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    setShots((s) => [...s, ...Array.from(files).map((file) => ({
      file, url: URL.createObjectURL(file),
      status: 'waiting' as const, tables: [] as Table[], error: null,
    }))]);
  };

  const update = (i: number, patch: Partial<Shot>) =>
    setShots((s) => s.map((sh, n) => (n === i ? { ...sh, ...patch } : sh)));

  const readAll = async () => {
    setBusy(true);
    // Elimination across the whole batch, not just within one photo:
    // overlapping screenshots show the same table twice, and the second
    // sighting should not compete for a booking already claimed.
    const claimed = new Set<string>();
    for (const sh of shots) for (const t of sh.tables) if (t.bookingCode) claimed.add(t.bookingCode);

    for (let i = 0; i < shots.length; i++) {
      if (shots[i].status === 'read' || shots[i].status === 'reading') continue;
      update(i, { status: 'reading', error: null });
      try {
        const small = await compressPhotoForUpload(shots[i].file, 1600);
        const fd = new FormData();
        fd.append('photo', small, 'table.jpg');
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/backfill/identify-tables`, { method: 'POST', body: fd });
        const d = await res.json();
        if (!res.ok) throw new Error(d?.error || 'Could not read that photo');

        const tables: Table[] = (d.tables || []).map((t: Omit<Table, 'bookingCode' | 'saved'>) => {
          let code: string | null = null;
          if (t.tag_name) {
            const ranked = bookings
              .map((b) => ({ b, sc: scoreName(t.tag_name as string, b.customer_name) }))
              .filter((x) => x.sc >= 0.5 && !claimed.has(x.b.booking_code))
              .sort((x, y) => y.sc - x.sc);
            // Only on a clear winner. A tie is when a person should
            // decide, so it drops to the dropdown rather than gambling
            // someone's pottery onto the wrong name.
            if (ranked.length === 1 || (ranked.length > 1 && ranked[0].sc > ranked[1].sc)) {
              code = ranked[0].b.booking_code;
              claimed.add(code);
            }
          }
          return { ...t, bookingCode: code, saved: false };
        });
        update(i, { status: 'read', tables });
      } catch (err) {
        update(i, { status: 'failed', error: err instanceof Error ? err.message : 'Could not read that photo' });
      }
    }
    setBusy(false);
  };

  const saveShot = async (i: number) => {
    const sh = shots[i];
    update(i, { status: 'saving' });
    const tables = [...sh.tables];
    for (let t = 0; t < tables.length; t++) {
      const tb = tables[t];
      if (tb.saved || !tb.bookingCode || !tb.pieces.length) continue;
      try {
        const crop = await cropToTable(sh.file, tb.box);
        const fd = new FormData();
        fd.append('photo', crop, 'table.jpg');
        fd.append('booking_code', tb.bookingCode);
        fd.append('description', `${tb.pieces.length} pieces, photographed at table`);
        fd.append('confirmed_by', 'backfill');
        fd.append('piece_count', String(tb.pieces.length));
        fd.append('pieces_json', JSON.stringify(tb.pieces.map((p) => ({
          piece_type: p.piece_type,
          description: p.description,
          box: p.box ? reboxToTable(p.box, tb.box) : null,
        }))));
        fd.append('replace_backfilled', 'true');
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/photo-match/confirm`, { method: 'POST', body: fd });
        if (!res.ok) throw new Error('save failed');
        tables[t] = { ...tb, saved: true };
      } catch {
        // Left unsaved rather than ticked off, so a retry picks it up.
      }
    }
    update(i, { status: 'read', tables });
  };

  const ready = (sh: Shot) => sh.tables.filter((t) => t.bookingCode && !t.saved).length;
  const needsLook = (sh: Shot) => sh.tables.filter((t) => !t.bookingCode).length;

  const field = { width: '100%', minHeight: 44, padding: '0.5rem', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', background: 'white', color: 'var(--charcoal)' } as const;

  return (
    <PageShell title="Backfill from photos" subtitle="Tables photographed outside the app">
      {prog && (prog.total > 0 || prog.on_disk > 0) && (
        <div style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.9rem', marginBottom: '1rem' }}>
          <p style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: '0 0 0.3rem' }}>The 27 Aug – 5 Sep backlog</p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)', margin: '0 0 0.6rem' }}>
            {prog.done} of {prog.total} done · {prog.pieces} piece{prog.pieces === 1 ? '' : 's'} with photos
            {prog.duplicate ? ` · ${prog.duplicate} second shots skipped` : ''}
            {prog.unmatched ? ` · ${prog.unmatched} need a look` : ''}
            {prog.failed ? ` · ${prog.failed} failed` : ''}
          </p>
          {prog.pending === 0 && prog.done > 0 && (
            <p style={{ fontSize: 'var(--text-sm)', color: '#2E7D32', fontWeight: 700, margin: 0 }}>
              All done — nothing left to run.
            </p>
          )}
          {prog.pending > 0 && (
            <button onClick={runBatch} disabled={running}
              style={{ width: '100%', minHeight: 48, borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', opacity: running ? 0.6 : 1 }}>
              {running ? `Working… ${prog.pending} left` : `Run the AI over ${prog.pending} photo${prog.pending === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}

      <input ref={picker} type="file" accept="image/*" multiple onChange={(e) => pick(e.target.files)} style={{ display: 'none' }} />

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button onClick={() => picker.current?.click()}
          style={{ flex: '1 1 auto', minHeight: 48, padding: '0.8rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
          <Camera size={18} /> Choose photos
        </button>
        {shots.some((s) => s.status === 'waiting' || s.status === 'failed') && (
          <button onClick={readAll} disabled={busy}
            style={{ flex: '1 1 auto', minHeight: 48, padding: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--clay)', background: 'white', color: 'var(--clay)', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Reading…' : `Identify ${shots.filter((s) => s.status === 'waiting' || s.status === 'failed').length}`}
          </button>
        )}
      </div>

      {/* Thumbnails rather than full-bleed photos, each badged with what
          is in it, so the ones needing a decision can be found without
          scrolling past the ones that are fine. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
        {shots.map((sh, i) => {
          const r = ready(sh), n = needsLook(sh);
          const done = sh.tables.length > 0 && sh.tables.every((t) => t.saved);
          return (
            <button key={i} onClick={() => setOpen(open === i ? null : i)}
              style={{ position: 'relative', padding: 0, border: open === i ? '2px solid var(--clay)' : '1px solid #ece5db', borderRadius: 'var(--radius-sm)', overflow: 'hidden', cursor: 'pointer', background: 'white', aspectRatio: '1' }}>
              <img src={sh.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: done ? 0.55 : 1 }} />
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0.2rem 0.3rem', fontSize: 'var(--text-xs)', fontWeight: 700, color: 'white', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                {sh.status === 'reading' && <Loader size={11} className="animate-spin" />}
                {sh.status === 'waiting' && 'not read'}
                {sh.status === 'failed' && <AlertCircle size={11} />}
                {sh.status === 'saving' && 'saving'}
                {done && <Check size={11} />}
                {sh.status === 'read' && !done && `${sh.tables.length} table${sh.tables.length === 1 ? '' : 's'}`}
              </span>
              {n > 0 && (
                <span style={{ position: 'absolute', top: 3, right: 3, minWidth: 18, height: 18, borderRadius: 9, background: '#A6761D', color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  {n}
                </span>
              )}
              {r > 0 && n === 0 && (
                <span style={{ position: 'absolute', top: 3, right: 3, minWidth: 18, height: 18, borderRadius: 9, background: '#2E7D32', color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                  {r}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {open !== null && shots[open] && (() => {
        const sh = shots[open];
        const idx = open;
        return (
          <div style={{ marginTop: '1rem', background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <PhotoWithBoxes
              src={sh.url}
              pieces={sh.tables.map((t) => ({ box: t.box, description: t.tag_name || '?' }))}
              label={(_, ti) => `${sh.tables[ti].tag_name || '?'} · ${sh.tables[ti].pieces.length}`}
            />

            <div style={{ padding: '0.8rem' }}>
              {sh.error && <p style={{ fontSize: 'var(--text-sm)', color: '#C0392B', margin: '0 0 0.5rem' }}>{sh.error}</p>}

              {sh.tables.map((t, ti) => (
                <div key={ti} style={{ borderTop: ti ? '1px solid #f0ece6' : 'none', paddingTop: ti ? '0.7rem' : 0, marginTop: ti ? '0.7rem' : 0 }}>
                  <p style={{ fontSize: 'var(--text-sm)', fontWeight: 700, margin: '0 0 0.3rem', color: pieceColour(ti) }}>
                    {t.tag_name ? `Board reads "${t.tag_name}"` : 'Board not readable'} · {t.pieces.length} piece{t.pieces.length === 1 ? '' : 's'}
                    {t.saved ? ' · saved' : ''}
                  </p>
                  <select
                    value={t.bookingCode || ''}
                    disabled={t.saved}
                    onChange={(e) => {
                      const tables = [...sh.tables];
                      tables[ti] = { ...t, bookingCode: e.target.value || null };
                      update(idx, { tables });
                    }}
                    style={{ ...field, marginBottom: '0.4rem', border: t.bookingCode ? '1px solid #ece5db' : '2px solid #A6761D' }}
                  >
                    <option value="">Which booking?</option>
                    {bookings.map((b) => (
                      <option key={b.booking_code} value={b.booking_code}>
                        {b.customer_name} · {new Date(b.session_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </option>
                    ))}
                  </select>
                  <PieceList pieces={t.pieces} />
                </div>
              ))}

              {ready(sh) > 0 && (
                <button onClick={() => saveShot(idx)} disabled={sh.status === 'saving'}
                  style={{ width: '100%', minHeight: 48, marginTop: '0.8rem', borderRadius: 'var(--radius-md)', border: 'none', background: '#2E7D32', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', opacity: sh.status === 'saving' ? 0.6 : 1 }}>
                  {sh.status === 'saving' ? 'Saving…' : `Save ${ready(sh)} booking${ready(sh) === 1 ? '' : 's'}`}
                </button>
              )}
              {needsLook(sh) > 0 && (
                <p style={{ fontSize: 'var(--text-xs)', color: '#A6761D', marginTop: '0.5rem' }}>
                  {needsLook(sh)} table{needsLook(sh) === 1 ? '' : 's'} here had no readable name — skipped until you pick
                  the booking, rather than guessed at.
                </p>
              )}
            </div>
          </div>
        );
      })()}
    </PageShell>
  );
}
