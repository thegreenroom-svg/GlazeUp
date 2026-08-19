'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef } from 'react';
import { AiCostCounter } from '@/components/AiCostCounter';
import { PageShell } from '@/components/PageShell';
import { Camera, Loader, CheckCircle } from 'lucide-react';

interface Candidate {
  booking_code: string;
  customer_name: string;
  session_start: string;
  status: string;
  score: number;
}

interface MatchResult {
  chalk_tag_name: string | null;
  description: string;
  candidates: Candidate[];
}

export default function PhotoMatchPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmedCode, setConfirmedCode] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
    setConfirmedCode(null);
    setLoading(true);

    const formData = new FormData();
    formData.append('photo', file);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/photo-match`, {
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

  const handleConfirm = async (bookingCode: string) => {
    if (!selectedFile || !result) return;
    setConfirming(bookingCode);

    const formData = new FormData();
    formData.append('photo', selectedFile);
    formData.append('booking_code', bookingCode);
    formData.append('chalk_tag_name', result.chalk_tag_name || '');
    formData.append('description', result.description || '');

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/demo/photo-match/confirm`, {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Failed to save');
      setConfirmedCode(bookingCode);
    } catch (err) {
      setError('Could not save the confirmed match.');
    } finally {
      setConfirming(null);
    }
  };

  return (
    <PageShell title="Photo Match">
      <AiCostCounter />
      <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: '4px', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Identify whose pieces these are. Uses real AI vision (small per-photo cost). Reads the chalk tag and pieces, checks against recent bookings. Confirming a match saves the photo to that booking.
      </div>

      

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
        <span style={{ color: '#666' }}>Tap to take or choose a photo</span>
      </button>

      {preview && (
        <img src={preview} alt="Preview" style={{ width: '100%', maxHeight: '300px', objectFit: 'cover', borderRadius: '8px', marginBottom: '1.5rem' }} />
      )}

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666', marginBottom: '1.5rem' }}>
          <Loader size={18} style={{ animation: 'spin 1s linear infinite' }} /> Reading photo...
        </div>
      )}

      {error && <div style={{ padding: '1rem', backgroundColor: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '1.5rem' }}>{error}</div>}

      {result && (
        <div style={{ backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem' }}>
          <div style={{ marginBottom: '1rem' }}>
            <p style={{ fontSize: '0.75rem', color: '#999', marginBottom: '0.25rem' }}>Chalk tag read</p>
            <p style={{ fontWeight: '600', fontSize: '1.1rem' }}>{result.chalk_tag_name || 'Not legible'}</p>
          </div>
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ fontSize: '0.75rem', color: '#999', marginBottom: '0.25rem' }}>AI description</p>
            <p style={{ color: '#444' }}>{result.description}</p>
          </div>

          <div style={{ paddingTop: '1rem', borderTop: '1px solid #eee' }}>
            <p style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.75rem' }}>Matching bookings</p>
            {result.candidates.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: '#999' }}>No close match found among recent bookings.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {result.candidates.map((c) => (
                  <div key={c.booking_code} style={{ padding: '0.6rem', backgroundColor: '#f9f9f9', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: '500', fontSize: '0.9rem' }}>{c.customer_name}</p>
                        <p style={{ fontSize: '0.75rem', color: '#999' }}>{new Date(c.session_start).toLocaleDateString()}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        {c.score >= 0.9 && <CheckCircle size={16} color="#00aa00" />}
                        <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>{Math.round(c.score * 100)}%</span>
                      </div>
                    </div>
                    {confirmedCode === c.booking_code ? (
                      <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#00aa00', fontSize: '0.8rem' }}>
                        <CheckCircle size={14} /> Saved to this booking
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConfirm(c.booking_code)}
                        disabled={confirming === c.booking_code}
                        style={{
                          marginTop: '0.5rem',
                          width: '100%',
                          padding: '0.4rem',
                          backgroundColor: 'var(--clay)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          cursor: confirming === c.booking_code ? 'not-allowed' : 'pointer',
                          opacity: confirming === c.booking_code ? 0.6 : 1,
                        }}
                      >
                        {confirming === c.booking_code ? 'Saving...' : 'Confirm — this is the right booking'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
