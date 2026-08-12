'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { PageHeader, StatusBlock } from '@/components/PageStatus';

interface Piece {
  id: string;
  booking_id: string | null;
  piece_type: string | null;
  status: string | null;
  mark_code: string | null;
  reference_photo_url: string | null;
  description: string | null;
  damaged: boolean | null;
}

interface StageData {
  stages: string[];
  by_stage: Record<string, Piece[]>;
  counts: Record<string, number>;
  total: number;
}

const STAGE_LABELS: Record<string, string> = {
  painting: 'Painting',
  ready_for_dip: 'Ready for dip',
  dipped: 'Dipped',
  kiln_queue: 'Kiln queue',
  firing: 'Firing',
  fired: 'Fired',
  packed: 'Packed',
  ready_for_pickup: 'Ready for pickup',
  collected: 'Collected',
  other: 'Other / legacy',
};

export default function LifecyclePage() {
  const [data, setData] = useState<StageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openStage, setOpenStage] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/pieces/by-stage`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError('Could not load pieces.'))
      .finally(() => setLoading(false));
  }, []);

  const stageOrder = data ? [...data.stages, 'other'] : [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '700px' }}>
      <PageHeader title="Piece Lifecycle" subtitle="Every piece, by where it is in the journey. Tap a stage to see what&apos;s in it." />

      <StatusBlock loading={loading} error={error} />

      {data && (
        <>
          <p style={{ fontSize: '0.8rem', color: '#999', marginBottom: '1rem' }}>{data.total} active pieces</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {stageOrder.map((stage) => {
              const count = data.counts[stage] || 0;
              const pieces = data.by_stage[stage] || [];
              const isOpen = openStage === stage;
              return (
                <div key={stage} style={{ border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}>
                  <button
                    onClick={() => setOpenStage(isOpen ? null : stage)}
                    style={{
                      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.8rem 1rem', background: count > 0 ? 'white' : '#fafafa',
                      border: 'none', cursor: 'pointer', fontSize: '0.95rem',
                    }}
                  >
                    <span style={{ fontWeight: count > 0 ? 600 : 400, color: count > 0 ? '#222' : '#999' }}>
                      {STAGE_LABELS[stage] || stage}
                    </span>
                    <span style={{
                      minWidth: '2rem', textAlign: 'center', padding: '0.15rem 0.5rem', borderRadius: '999px',
                      backgroundColor: count > 0 ? 'var(--clay)' : '#eee', color: count > 0 ? 'white' : '#999',
                      fontSize: '0.8rem', fontWeight: 600,
                    }}>
                      {count}
                    </span>
                  </button>

                  {isOpen && pieces.length > 0 && (
                    <div style={{ padding: '0.5rem 1rem 1rem', borderTop: '1px solid #f0f0f0' }}>
                      {pieces.slice(0, 40).map((p) => (
                        <div key={p.id} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid #f7f7f7' }}>
                          {p.reference_photo_url && (
                            <img src={p.reference_photo_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '0.85rem', fontWeight: 500 }}>{p.booking_id || 'Unassigned'}</p>
                            <p style={{ fontSize: '0.75rem', color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.description || p.piece_type || 'Piece'}
                            </p>
                          </div>
                          {p.mark_code && (
                            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#666' }}>Nº{p.mark_code}</span>
                          )}
                          {p.damaged && <span style={{ fontSize: '0.7rem', color: '#c33' }}>damaged</span>}
                        </div>
                      ))}
                      {pieces.length > 40 && (
                        <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '0.5rem' }}>
                          + {pieces.length - 40} more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </motion.div>
  );
}
