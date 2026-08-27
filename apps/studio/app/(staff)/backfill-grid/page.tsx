'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { PageShell } from '@/components/PageShell';
import { AiCostCounter } from '@/components/AiCostCounter';
import { Camera, Loader, Check, AlertTriangle, Trash2 } from 'lucide-react';

// Deliberately NOT compressed on the way up, unlike every other photo upload
// in this app. The client-side resize targets 1024px, which is right for a
// single table photo but would destroy the very thing that makes a grid of
// ~640x500 tiles readable at all. The screenshot goes up as captured.

interface TilePiece {
  piece_type: string;
  description: string;
}

interface TileResult {
  customer_name: string;
  session_date: string | null;
  table_number: string | null;
  tag_confidence: string;
  pieces: TilePiece[];
  matched_booking: string | null;
  created_booking?: boolean;
  created: boolean;
  skipped_reason: string | null;
  photo_url?: string;
}

interface RunResult {
  read: number;
  created: number;
  skipped: number;
  dry_run: boolean;
  tiles: TileResult[];
  note?: string;
}

export default function BackfillGridPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rollbackMsg, setRollbackMsg] = useState<string | null>(null);

  const run = async (dryRun: boolean, f?: File) => {
    const target = f || file;
    if (!target) return;
    setLoading(true);
    setError(null);
    if (!dryRun) setResult(null);

    const controller = new AbortController();
    const killSwitch = setTimeout(() => controller.abort(), 90000); // a whole grid is more work than one table
    try {
      const fd = new FormData();
      fd.append('photo', target);
      if (dryRun) fd.append('dry_run', 'true');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/backfill/grid`, {
        method: 'POST',
        body: fd,
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not read the screenshot');
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      clearTimeout(killSwitch);
      setLoading(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setError(null);
    setRollbackMsg(null);
    run(true, f); // always preview first -- nothing is written until confirmed
  };

  const rollback = async () => {
    if (!confirm('Remove everything created by grid backfill? Real Square bookings and any pottery photographed live are not touched.')) return;
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/backfill/grid`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Rollback failed');
      setRollbackMsg(`Removed ${data.pieces_removed} piece(s) and ${data.bookings_removed} walk-in booking(s).`);
      setResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell title="Backfill from photos" subtitle="Screenshot a page of your Photos grid and it reads the chalk tags, then fills in the bookings and pieces.">
      <AiCostCounter />

      <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: 6, fontSize: '0.8rem', marginBottom: '1rem' }}>
        Grid tiles are much smaller than the original photos, so descriptions may be less detailed than a proper table photo. Nothing is saved until you press Create, and everything it makes can be removed again in one tap.
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', padding: '1.2rem', border: '2px dashed #ccc', borderRadius: 8, cursor: 'pointer', marginBottom: '1rem' }}>
        <Camera size={26} color="var(--clay)" />
        <span style={{ color: '#666', fontSize: '0.85rem' }}>Choose a screenshot of your Photos grid</span>
        <input type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
      </label>

      {preview && (
        <img src={preview} alt="" style={{ width: '100%', borderRadius: 8, marginBottom: '1rem' }} />
      )}

      {loading && (
        <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
          <Loader size={16} className="animate-spin" /> Reading the tags…
        </p>
      )}

      {error && (
        <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#fdecea', border: '1px solid #f5c2c0', borderRadius: 6, fontSize: '0.85rem', color: '#a5342f', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {rollbackMsg && (
        <div style={{ padding: '0.7rem 0.9rem', backgroundColor: '#F1F8F1', border: '1px solid #9CC79C', borderRadius: 6, fontSize: '0.85rem', marginBottom: '1rem' }}>
          {rollbackMsg}
        </div>
      )}

      {result && (
        <>
          <p style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.6rem' }}>
            {result.dry_run ? `Read ${result.read} tag${result.read === 1 ? '' : 's'} — nothing saved yet` : `Created ${result.created} of ${result.read}`}
            {result.skipped ? ` · ${result.skipped} skipped` : ''}
          </p>
          {result.note && <p style={{ fontSize: '0.8rem', color: '#777', marginBottom: '0.6rem' }}>{result.note}</p>}

          {result.tiles.map((t, i) => (
            <div key={i} style={{ border: '1px solid #eee', borderRadius: 8, padding: '0.7rem 0.85rem', marginBottom: '0.6rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t.customer_name}</span>
                <span style={{ fontSize: '0.72rem', color: t.tag_confidence === 'high' ? '#2E7D32' : t.tag_confidence === 'low' ? '#B3261E' : '#A6761D', fontWeight: 700 }}>
                  tag {t.tag_confidence}
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#777', margin: '0.1rem 0 0.4rem' }}>
                {[t.session_date, t.table_number].filter(Boolean).join(' · ') || 'no date read'}
                {t.matched_booking ? (t.created_booking ? ' · new walk-in' : ' · matched a real booking') : ''}
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem' }}>
                {t.pieces.map((p, j) => (
                  <li key={j} style={{ marginBottom: '0.15rem' }}>{p.description}</li>
                ))}
              </ul>
              {t.skipped_reason && (
                <p style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#A6761D', marginTop: '0.4rem' }}>
                  <AlertTriangle size={13} /> {t.skipped_reason}
                </p>
              )}
              {t.created && (
                <p style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: '#2E7D32', marginTop: '0.4rem' }}>
                  <Check size={13} /> Created
                </p>
              )}
            </div>
          ))}

          {result.dry_run && result.read > 0 && (
            <button
              onClick={() => run(false)}
              disabled={loading}
              style={{ width: '100%', padding: '0.8rem', borderRadius: 8, border: 'none', background: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', marginTop: '0.5rem' }}
            >
              Create these {result.read} booking{result.read === 1 ? '' : 's'}
            </button>
          )}
        </>
      )}

      <button
        onClick={rollback}
        disabled={loading}
        style={{ width: '100%', padding: '0.7rem', borderRadius: 8, border: '1px solid #f5c2c0', background: 'white', color: '#a5342f', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}
      >
        <Trash2 size={15} /> Remove everything backfilled from photos
      </button>
    </PageShell>
  );
}
