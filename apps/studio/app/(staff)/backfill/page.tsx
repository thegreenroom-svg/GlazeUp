'use client';

// [6 Sep] BACKFILL FROM THE CAMERA ROLL.
//
// Daisy: "those photos need to be identified prompt as they are in
// anything else... the whole thing needs to be the same."
//
// So this is not a separate importer with its own logic. It calls the
// SAME identify-in-photo route the Floor screen calls at the end of a
// session, and posts to the SAME photo-match/confirm that stores the
// photo against the booking. Identical prompt, identical boxes,
// identical storage. The only difference is that the photo comes from
// the library rather than the camera, and the chalk tag is read to
// work out whose table it was, because nobody selected a booking first.
//
// It earns its place permanently, not just for the August backlog:
// whenever someone photographs tables on the iPad the normal way
// instead of going through the app, this is how that day gets
// recovered rather than lost.

import { useEffect, useRef, useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { compressPhotoForUpload } from '@/lib/compressPhoto';
import { Camera, Loader, Check } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Box { left_pct: number; top_pct: number; right_pct: number; bottom_pct: number }
interface Piece { index: number; piece_type: string; description: string; box: Box | null }
interface Booking { booking_code: string; customer_name: string; session_start: string }

interface Shot {
  file: File;
  url: string;
  takenOn: string;          // yyyy-mm-dd from the file's own timestamp
  status: 'waiting' | 'reading' | 'read' | 'saving' | 'saved' | 'failed';
  pieces: Piece[];
  tagName: string | null;
  bookingCode: string | null;
  error: string | null;
}

const COLOURS = ['#e0392b', '#1a8a3c', '#2b6fe0', '#c77a0a', '#8b3ec7', '#0a9aa8'];

// Loose enough to survive a chalk misread ("Jackie" for "Jack"), strict
// enough not to pair two different people. Deliberately conservative:
// no match at all is better than a confident wrong one, because a wrong
// name here attaches someone's pottery to another customer.
function scoreName(tag: string, name: string) {
  const a = tag.toLowerCase().replace(/[^a-z ]/g, '').trim();
  const b = name.toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (!a || !b) return 0;
  if (a === b) return 1;
  const at = a.split(/\s+/), bt = b.split(/\s+/);
  const shared = at.filter((t) => t.length > 2 && bt.some((u) => u.startsWith(t) || t.startsWith(u)));
  return shared.length / Math.max(at.length, bt.length);
}

export default function BackfillPage() {
  const [shots, setShots] = useState<Shot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [busy, setBusy] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/bookings`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setBookings(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const dayOf = (iso: string) => new Date(iso).toISOString().slice(0, 10);

  // [6 Sep] NAME FIRST, DATE ONLY AS A TIEBREAK.
  //
  // Daisy: "why do you need to check the dates... when you can just
  // check the booking name against the booking and use your common
  // sense and the process of elimination?" She is right, and my first
  // version was worse for a reason worth writing down: it filtered
  // candidates to bookings on the file's date. But a file's timestamp
  // is its MODIFICATION date, not when the shutter fired -- copying,
  // editing, airdropping or restoring from a backup all rewrite it. So
  // a wrong date silently emptied the candidate list and a perfectly
  // readable chalk name matched nothing at all.
  //
  // The name is the strong signal and the whole booking history is
  // searchable, so search all of it. The date only breaks ties between
  // equally good name matches, where it is a hint rather than a gate.
  const candidates = () => bookings;

  const pick = (files: FileList | null) => {
    if (!files?.length) return;
    const next: Shot[] = Array.from(files).map((file) => ({
      file,
      url: URL.createObjectURL(file),
      takenOn: new Date(file.lastModified).toISOString().slice(0, 10),
      status: 'waiting',
      pieces: [],
      tagName: null,
      bookingCode: null,
      error: null,
    }));
    setShots((s) => [...s, ...next]);
  };

  const update = (i: number, patch: Partial<Shot>) =>
    setShots((s) => s.map((sh, n) => (n === i ? { ...sh, ...patch } : sh)));

  const readAll = async () => {
    setBusy(true);
    for (let i = 0; i < shots.length; i++) {
      if (shots[i].status !== 'waiting' && shots[i].status !== 'failed') continue;
      update(i, { status: 'reading', error: null });
      try {
        const small = await compressPhotoForUpload(shots[i].file);
        const fd = new FormData();
        fd.append('photo', small, 'table.jpg');
        fd.append('read_tag', 'true');
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/identify-in-photo`, { method: 'POST', body: fd });
        const d = await res.json();
        if (!res.ok) throw new Error(d?.error || 'The AI could not read that photo');
        const tag: string | null = d.tag_name || null;
        let code: string | null = null;
        if (tag) {
          // Score every booking on the name, then eliminate: a booking
          // that already has a table photo is not the one being
          // recovered, so an earlier visit by a repeat customer stops
          // competing with the one that still needs its photo.
          const alreadyUsed = new Set(
            shots.filter((o, n) => n !== i && o.bookingCode).map((o) => o.bookingCode as string)
          );
          const scored = bookings
            .map((b) => ({ b, sc: scoreName(tag, b.customer_name) }))
            .filter((x) => x.sc >= 0.5 && !alreadyUsed.has(x.b.booking_code))
            .sort((x, y) => {
              if (y.sc !== x.sc) return y.sc - x.sc;
              // Equal names: prefer the session nearest the file's date.
              // A hint, never a filter -- if the timestamp is wrong the
              // match still stands, just possibly on the wrong visit,
              // which the dropdown can fix in one tap.
              const t = new Date(shots[i].takenOn).getTime();
              return Math.abs(new Date(x.b.session_start).getTime() - t)
                   - Math.abs(new Date(y.b.session_start).getTime() - t);
            });
          // Only auto-attach when one booking clearly wins. Two people
          // scoring the same on a chalk name is exactly when a human
          // should choose, so it drops to the dropdown instead.
          if (scored.length === 1 || (scored.length > 1 && scored[0].sc > scored[1].sc)) {
            code = scored[0].b.booking_code;
          }
        }
        update(i, { status: 'read', pieces: d.pieces || [], tagName: tag, bookingCode: code });
      } catch (err) {
        update(i, { status: 'failed', error: err instanceof Error ? err.message : 'Could not read that photo' });
      }
    }
    setBusy(false);
  };

  const saveAll = async () => {
    setBusy(true);
    for (let i = 0; i < shots.length; i++) {
      const sh = shots[i];
      if (sh.status !== 'read' || !sh.bookingCode || !sh.pieces.length) continue;
      update(i, { status: 'saving' });
      try {
        const fd = new FormData();
        fd.append('photo', sh.file);
        fd.append('booking_code', sh.bookingCode);
        fd.append('description', `${sh.pieces.length} pieces, photographed at table`);
        fd.append('confirmed_by', 'backfill');
        fd.append('piece_count', String(sh.pieces.length));
        fd.append('pieces_json', JSON.stringify(sh.pieces.map((p) => ({ piece_type: p.piece_type, description: p.description, box: p.box }))));
        // The whole point: text-only placeholders from the screenshot
        // read step give way to the real photo and its boxes.
        fd.append('replace_backfilled', 'true');
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/photo-match/confirm`, { method: 'POST', body: fd });
        if (!res.ok) throw new Error('Save failed');
        update(i, { status: 'saved' });
      } catch {
        update(i, { status: 'failed', error: 'Could not save that one' });
      }
    }
    setBusy(false);
  };

  const readable = shots.filter((s) => s.status === 'read' && s.bookingCode).length;
  const unmatched = shots.filter((s) => s.status === 'read' && !s.bookingCode).length;

  return (
    <PageShell title="Backfill from photos" subtitle="Tables photographed outside the app">
      <div style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', padding: '0.9rem', marginBottom: '1rem' }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--charcoal)', margin: 0, lineHeight: 1.4 }}>
          Pick the original table photos from the iPad library. Each one goes through exactly the
          same identification a live session uses, so the pieces get real photos and numbered boxes,
          not just descriptions.
        </p>
        <p style={{ fontSize: 'var(--text-xs)', color: '#777', margin: '0.5rem 0 0' }}>
          Choose the originals, not a screenshot of the library — a photo of a screen loses the detail
          the matching depends on.
        </p>
      </div>

      <input
        ref={picker}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => pick(e.target.files)}
        style={{ display: 'none' }}
      />

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => picker.current?.click()}
          style={{ flex: '1 1 auto', minHeight: 48, padding: '0.8rem', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
        >
          <Camera size={18} /> Choose photos
        </button>
        {shots.some((s) => s.status === 'waiting' || s.status === 'failed') && (
          <button
            onClick={readAll}
            disabled={busy}
            style={{ flex: '1 1 auto', minHeight: 48, padding: '0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--clay)', background: 'white', color: 'var(--clay)', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Reading…' : `Identify ${shots.filter((s) => s.status === 'waiting' || s.status === 'failed').length}`}
          </button>
        )}
      </div>

      {readable > 0 && (
        <button
          onClick={saveAll}
          disabled={busy}
          style={{ width: '100%', minHeight: 48, padding: '0.8rem', borderRadius: 'var(--radius-md)', border: 'none', background: '#2E7D32', color: 'white', fontWeight: 700, fontSize: 'var(--text-base)', cursor: 'pointer', marginBottom: '1rem', opacity: busy ? 0.6 : 1 }}
        >
          Save {readable} to their bookings
        </button>
      )}

      {unmatched > 0 && (
        <p style={{ fontSize: 'var(--text-sm)', color: '#A6761D', marginBottom: '1rem' }}>
          {unmatched} photo{unmatched === 1 ? '' : 's'} had no readable chalk name. Pick the booking by
          hand below — they are skipped until you do, rather than guessed at.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {shots.map((sh, i) => (
          <div key={i} style={{ background: 'white', border: '1px solid #ece5db', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ position: 'relative' }}>
              <img src={sh.url} alt="" style={{ width: '100%', display: 'block' }} />
              {sh.pieces.map((p, n) => p.box && (
                <div
                  key={n}
                  style={{
                    position: 'absolute',
                    left: `${p.box.left_pct}%`, top: `${p.box.top_pct}%`,
                    width: `${p.box.right_pct - p.box.left_pct}%`,
                    height: `${p.box.bottom_pct - p.box.top_pct}%`,
                    border: `3px solid ${COLOURS[n % 6]}`, borderRadius: 'var(--radius-sm)',
                    boxShadow: '0 0 0 1px rgba(255,255,255,0.9)', pointerEvents: 'none',
                  }}
                >
                  <span style={{ position: 'absolute', top: -9, left: -9, width: 20, height: 20, borderRadius: '50%', background: COLOURS[n % 6], color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 0 2px white' }}>
                    {p.index}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ padding: '0.8rem' }}>
              <p style={{ fontSize: 'var(--text-xs)', color: '#777', margin: '0 0 0.4rem' }}>
                Taken {new Date(sh.takenOn).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                {sh.tagName ? ` · chalk board reads "${sh.tagName}"` : ''}
              </p>

              {sh.status === 'reading' && (
                <p style={{ fontSize: 'var(--text-sm)', color: '#777', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Loader size={14} className="animate-spin" /> Identifying pieces…
                </p>
              )}

              {sh.status === 'saved' && (
                <p style={{ fontSize: 'var(--text-sm)', color: '#2E7D32', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Check size={15} /> Saved with {sh.pieces.length} piece{sh.pieces.length === 1 ? '' : 's'}
                </p>
              )}

              {sh.error && <p style={{ fontSize: 'var(--text-sm)', color: '#C0392B' }}>{sh.error}</p>}

              {(sh.status === 'read' || sh.status === 'saving') && (
                <>
                  <select
                    value={sh.bookingCode || ''}
                    onChange={(e) => update(i, { bookingCode: e.target.value || null })}
                    style={{ width: '100%', minHeight: 44, padding: '0.5rem', marginBottom: '0.5rem', borderRadius: 'var(--radius-sm)', border: sh.bookingCode ? '1px solid #ece5db' : '2px solid #A6761D', fontSize: 'var(--text-sm)', background: 'white', color: 'var(--charcoal)' }}
                  >
                    <option value="">Which booking?</option>
                    {candidates().map((b) => (
                      <option key={b.booking_code} value={b.booking_code}>
                        {b.customer_name} · {new Date(b.session_start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {new Date(b.session_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </option>
                    ))}
                  </select>
                  {sh.pieces.map((p, n) => (
                    <div key={n} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.2rem 0' }}>
                      <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', background: COLOURS[n % 6], color: 'white', fontSize: 'var(--text-xs)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                        {p.index}
                      </span>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--charcoal)' }}>
                        <b>{p.piece_type}</b> — {p.description}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
