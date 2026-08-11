'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Camera, Loader, Package, Printer, CheckCircle2 } from 'lucide-react';

interface SweepMatch {
  inventory_item: string;
  likely_booking_code: string | null;
  likely_customer_name: string | null;
  confidence: 'high' | 'medium' | 'low';
}

interface SweepResult {
  inventory: string;
  matches: SweepMatch[];
  wanted_count: number;
}

const confidenceColor: Record<string, string> = {
  high: '#1a8a3c',
  medium: '#b8860b',
  low: '#999',
};

const confidenceBg: Record<string, string> = {
  high: '#eafaf0',
  medium: '#fdf6e3',
  low: '#f5f5f5',
};

export default function ShelfSweepPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SweepResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [packedItems, setPackedItems] = useState<Set<string>>(new Set());
  const [labelItem, setLabelItem] = useState<SweepMatch | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
    setPackedItems(new Set());
    setLoading(true);

    const formData = new FormData();
    formData.append('photo', file);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/shelf-sweep`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to process photo');
      }
      const data = await response.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const togglePacked = (item: string) => {
    setPackedItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '2rem', maxWidth: '600px' }}>
      <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Test tool — uses real AI vision (small per-photo cost, two calls). Photograph a whole table of jumbled fired pieces at once; it checks against real bookings from the last 31 days. Writes nothing anywhere. Doesn't attempt to point at individual pieces in the photo — that was tried and found unreliable — it names the booking and shows you the same photo to work from.
      </div>

      <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Shelf Sweep</h1>
      <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Lay everything out from the kiln, photograph the table, see what&apos;s ready to pack.
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        style={{
          width: '100%',
          padding: '2rem',
          border: '2px dashed #ccc',
          borderRadius: '8px',
          backgroundColor: 'white',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <Camera size={32} color="var(--clay)" />
        <span style={{ color: '#666' }}>Tap to photograph the table</span>
      </button>

      {preview && (
        <img src={preview} alt="Table preview" style={{ width: '100%', maxHeight: '340px', objectFit: 'cover', borderRadius: '8px', marginBottom: '1.5rem' }} />
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666', marginBottom: '1.5rem' }}>
          <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Reading the table, then checking against bookings...
        </div>
      )}

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1.5rem' }}>{error}</div>}

      {result && (
        <div style={{ backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem' }}>
          <p style={{ fontSize: '0.8rem', color: '#999', marginBottom: '1rem' }}>
            Checked against {result.wanted_count} real bookings from the last 31 days.
          </p>

          {result.matches.length === 0 ? (
            <p style={{ fontSize: '0.9rem', color: '#999' }}>
              Nothing on the table looked like a plausible match for any booking in that window.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {result.matches.map((m, i) => {
                const key = m.inventory_item + i;
                const isPacked = packedItems.has(key);
                return (
                  <div
                    key={key}
                    style={{
                      padding: '0.8rem',
                      backgroundColor: isPacked ? '#f0f0f0' : confidenceBg[m.confidence] || '#f9f9f9',
                      borderRadius: '6px',
                      opacity: isPacked ? 0.7 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.15rem' }}>{m.inventory_item}</p>
                        <p style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                          {m.likely_customer_name || 'No confident booking'}
                        </p>
                      </div>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: confidenceColor[m.confidence] || '#999',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.confidence} confidence
                      </span>
                    </div>

                    {m.likely_booking_code && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
                        {isPacked ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#1a8a3c', fontSize: '0.8rem' }}>
                            <CheckCircle2 size={14} /> Packed, ready for collection
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => togglePacked(key)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.3rem',
                                padding: '0.4rem 0.7rem', backgroundColor: 'var(--clay)', color: 'white',
                                border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer',
                              }}
                            >
                              <Package size={14} /> Mark packed
                            </button>
                            <button
                              onClick={() => setLabelItem(m)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '0.3rem',
                                padding: '0.4rem 0.7rem', backgroundColor: 'white', color: '#333',
                                border: '1px solid #ccc', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer',
                              }}
                            >
                              <Printer size={14} /> Print label
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <details style={{ marginTop: '1.25rem', fontSize: '0.8rem', color: '#888' }}>
            <summary style={{ cursor: 'pointer' }}>Full inventory read from the photo</summary>
            <p style={{ marginTop: '0.5rem', whiteSpace: 'pre-wrap' }}>{result.inventory}</p>
          </details>
        </div>
      )}

      {labelItem && (
        <div
          onClick={() => setLabelItem(null)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', zIndex: 50 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: 'white', borderRadius: '8px', padding: '1.5rem', maxWidth: '360px', width: '100%', border: '2px dashed #333' }}>
            <p style={{ fontSize: '0.7rem', color: '#999', marginBottom: '0.5rem' }}>THE KILN CAFE — COLLECTION LABEL</p>
            <p style={{ fontSize: '1.4rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>{labelItem.likely_customer_name}</p>
            <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>{labelItem.likely_booking_code}</p>
            <p style={{ fontSize: '0.8rem', color: '#444', marginBottom: '1rem' }}>{labelItem.inventory_item}</p>
            <p style={{ fontSize: '0.7rem', color: '#999' }}>Print dialog would open here on a real printer-connected device.</p>
            <button
              onClick={() => setLabelItem(null)}
              style={{ marginTop: '1rem', width: '100%', padding: '0.5rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
