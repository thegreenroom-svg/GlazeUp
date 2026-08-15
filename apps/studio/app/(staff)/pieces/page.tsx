'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { SkeletonGrid } from '@/components/Skeleton';

interface Piece {
  id: string;
  piece_type: string;
  status: string;
  is_complete: boolean;
  created_at: string;
  scheduled_firing_date: string | null;
  reference_photo_url: string | null;
  mark_code: string | null;
  description: string | null;
  damaged: boolean;
  requires_second_firing: boolean;
  transfer_stage: string | null;
  glaze_fired_at: string | null;
  photo_phash: string | null;
  booking_id: string | null;
}

interface Match {
  id: string;
  piece_type: string;
  reference_photo_url: string | null;
  mark_code: string | null;
  distance: number;
}

export default function PiecesPage() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Piece | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const saveDescription = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${selected.id}/description`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: descDraft }),
      });
      if (!res.ok) throw new Error();
      setPieces((ps) => ps.map((p) => (p.id === selected.id ? { ...p, description: descDraft } : p)));
      setSelected({ ...selected, description: descDraft });
      setEditingDesc(false);
    } catch {
      setError('Could not save that description.');
    } finally {
      setSaving(false);
    }
  };

  const archivePiece = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/${selected.id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) throw new Error();
      setPieces((ps) => ps.filter((p) => p.id !== selected.id));
      setSelected(null);
    } catch {
      setError('Could not archive that piece.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!selected || !selected.photo_phash) {
      setMatches([]);
      return;
    }
    setMatchesLoading(true);
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/pieces/${selected.id}/matches`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setMatches)
      .catch(() => setMatches([]))
      .finally(() => setMatchesLoading(false));
  }, [selected]);

  const filteredPieces = pieces.filter((p) =>
    p.piece_type.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.mark_code || '').toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/pieces`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load');
        return res.json();
      })
      .then(setPieces)
      .catch(() => setError('Could not load pieces.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem' }}>
      <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Demo view — read-only. Showing your 50 most recent pieces.
      </div>

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '1rem' }}>Pieces</h1>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by type, description, or kiln code..."
        style={{ width: '100%', maxWidth: '400px', padding: '0.6rem 0.9rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '1.5rem', fontSize: '0.9rem', boxSizing: 'border-box' }}
      />

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1rem' }}>{error}</div>}

      {loading ? (
        <SkeletonGrid count={8} />
      ) : filteredPieces.length === 0 ? (
        <p style={{ color: '#999' }}>{pieces.length === 0 ? 'No pieces found.' : 'No pieces match your search.'}</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
          {filteredPieces.map((piece) => (
            <div
              key={piece.id}
              onClick={() => setSelected(piece)}
              style={{ backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer' }}
            >
              <div style={{ width: '100%', aspectRatio: '1', backgroundColor: '#f0f0f0', position: 'relative' }}>
                {piece.reference_photo_url ? (
                  <img src={piece.reference_photo_url} alt={piece.piece_type} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: '0.75rem' }}>No photo</div>
                )}
                {piece.damaged && (
                  <div style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', backgroundColor: '#c33', color: 'white', borderRadius: '9999px', padding: '0.25rem' }}>
                    <AlertTriangle size={14} />
                  </div>
                )}
              </div>
              <div style={{ padding: '0.75rem' }}>
                <h3 style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '0.25rem' }}>{piece.piece_type}</h3>
                {piece.mark_code && <p style={{ fontSize: '0.75rem', color: 'var(--clay)', fontFamily: 'monospace', marginBottom: '0.25rem' }}>№ {piece.mark_code}</p>}
                <span style={{ display: 'inline-block', padding: '0.15rem 0.6rem', backgroundColor: '#eef', borderRadius: '9999px', fontSize: '0.7rem', textTransform: 'capitalize' }}>
                  {piece.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: '8px', maxWidth: '500px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
            {selected.reference_photo_url && (
              <img src={selected.reference_photo_url} alt={selected.piece_type} style={{ width: '100%', maxHeight: '350px', objectFit: 'cover' }} />
            )}
            <div style={{ padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{selected.piece_type}</h2>
              {editingDesc ? (
                <div style={{ marginBottom: '1rem' }}>
                  <textarea
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.875rem', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                    <button onClick={saveDescription} disabled={saving} style={{ padding: '0.35rem 0.8rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button onClick={() => setEditingDesc(false)} style={{ padding: '0.35rem 0.8rem', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ color: '#666' }}>{selected.description || <span style={{ color: '#bbb' }}>No description yet</span>}</p>
                  <button
                    onClick={() => { setDescDraft(selected.description || ''); setEditingDesc(true); }}
                    style={{ background: 'none', border: 'none', color: 'var(--clay)', fontSize: '0.78rem', cursor: 'pointer', padding: 0, marginTop: '0.25rem' }}
                  >
                    Edit description
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#999' }}>Status</span>
                  <span style={{ textTransform: 'capitalize' }}>{selected.status.replace(/_/g, ' ')}</span>
                </div>
                {selected.mark_code && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#999' }}>Kiln code</span>
                    <span style={{ fontFamily: 'monospace' }}>№ {selected.mark_code}</span>
                  </div>
                )}
                {selected.booking_id && (
                  <div style={{ padding: '0.5rem', backgroundColor: '#f9f9f9', borderRadius: '4px', fontSize: '0.8rem' }}>
                    Labelled for <strong>{selected.booking_id}</strong> — no matching current booking record (likely an older booking no longer in the system).
                  </div>
                )}
                {selected.transfer_stage && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#999' }}>Transfer stage</span>
                    <span style={{ textTransform: 'capitalize' }}>{selected.transfer_stage.replace(/_/g, ' ')}</span>
                  </div>
                )}
                {selected.scheduled_firing_date && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#999' }}>Firing scheduled</span>
                    <span>{new Date(selected.scheduled_firing_date).toLocaleDateString()}</span>
                  </div>
                )}
                {selected.glaze_fired_at && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#999' }}>Glaze fired</span>
                    <span>{new Date(selected.glaze_fired_at).toLocaleDateString()}</span>
                  </div>
                )}
                {selected.requires_second_firing && (
                  <div style={{ padding: '0.5rem', backgroundColor: '#fff3cd', borderRadius: '4px', fontSize: '0.8rem' }}>Requires a second firing</div>
                )}
                {selected.damaged && (
                  <div style={{ padding: '0.5rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', fontSize: '0.8rem' }}>Marked as damaged</div>
                )}
              </div>

              {selected.photo_phash && (
                <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #eee' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '0.75rem' }}>Possible Matches</h3>
                  {matchesLoading ? (
                    <p style={{ fontSize: '0.8rem', color: '#999' }}>Comparing photos...</p>
                  ) : matches.length === 0 ? (
                    <p style={{ fontSize: '0.8rem', color: '#999' }}>No close matches found among other pieces with photos.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                      {matches.map((m) => (
                        <div key={m.id} style={{ border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: '100%', aspectRatio: '1', backgroundColor: '#f0f0f0' }}>
                            {m.reference_photo_url && (
                              <img src={m.reference_photo_url} alt={m.piece_type} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            )}
                          </div>
                          <div style={{ padding: '0.4rem' }}>
                            <p style={{ fontSize: '0.7rem', fontWeight: '500' }}>{Math.round((1 - m.distance) * 100)}% similar</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button
                  onClick={() => setSelected(null)}
                  style={{ flex: 1, padding: '0.6rem', backgroundColor: '#f0f0f0', color: '#333', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Close
                </button>
                <button
                  onClick={archivePiece}
                  disabled={saving}
                  title="Removes it from the list but keeps the record"
                  style={{ padding: '0.6rem 0.9rem', backgroundColor: 'white', color: '#c33', border: '1px solid #f0c8c8', borderRadius: '4px', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}
                >
                  {saving ? '...' : 'Archive'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
