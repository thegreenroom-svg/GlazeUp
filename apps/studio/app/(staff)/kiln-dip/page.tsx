'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Flame, Search, Check, Mail, Package } from 'lucide-react';

interface Piece {
  id: string;
  booking_id: string;
  piece_type: string;
  status: string;
  created_at?: string;
  scheduled_firing_date?: string | null;
}

// Real dip-glaze -> fired transition, per Daisy's described kiln pipeline:
// pieces go into a box for underglaze dip, get looked up here (typed/
// selected -- real camera QR scanning would need a library like
// @zxing/browser added, separate follow-up, not stubbed here as if it
// exists), moved to 'dipped_waiting_firing' with a real firing date
// (auto-calculates collection date as firing date + 2 days), then marked
// 'fired' when they actually come out -- which is the real trigger point
// for the ready-for-collection email, IF a real email provider is
// configured (RESEND_API_KEY) -- checked and reported honestly if not.
export default function KilnDipPage() {
  const [bookingRef, setBookingRef] = useState('');
  const [packedPieces, setPackedPieces] = useState<Piece[]>([]);
  const [dippedPieces, setDippedPieces] = useState<Piece[]>([]);
  const [selectedPacked, setSelectedPacked] = useState<Set<string>>(new Set());
  const [selectedDipped, setSelectedDipped] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firingDate, setFiringDate] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [markingFired, setMarkingFired] = useState(false);
  const [dipResult, setDipResult] = useState<{ transitioned: number; collection_date: string; unmatched_booking_refs: string[] } | null>(null);
  const [firedResult, setFiredResult] = useState<{ marked_fired: number; email_results: { booking_code: string; sent: boolean; reason?: string }[] } | null>(null);

  const lookup = async () => {
    const ref = bookingRef.trim();
    if (!ref) return;
    setLoading(true);
    setError(null);
    setDipResult(null);
    setFiredResult(null);
    try {
      const [packedRes, dippedRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/packed-pieces?booking=${encodeURIComponent(ref)}`),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/dipped-pieces?booking=${encodeURIComponent(ref)}`),
      ]);
      const packedData = await packedRes.json();
      const dippedData = await dippedRes.json();
      const packed = packedData.pieces || [];
      const dipped = dippedData.pieces || [];
      setPackedPieces(packed);
      setDippedPieces(dipped);
      setSelectedPacked(new Set(packed.map((p: Piece) => p.id)));
      setSelectedDipped(new Set(dipped.map((p: Piece) => p.id)));
      if (!packed.length && !dipped.length) setError('Nothing packed or waiting for firing under that booking reference.');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  const togglePacked = (id: string) => {
    setSelectedPacked((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleDipped = (id: string) => {
    setSelectedDipped((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const confirmDip = async () => {
    if (selectedPacked.size === 0 || !firingDate) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/dip-transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_ids: Array.from(selectedPacked), firing_date: firingDate }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Could not confirm transition.'); return; }
      setDipResult(d);
      setPackedPieces((prev) => prev.filter((p) => !selectedPacked.has(p.id)));
      setSelectedPacked(new Set());
    } catch {
      setError('Could not reach the server.');
    } finally {
      setConfirming(false);
    }
  };

  const confirmFired = async () => {
    if (selectedDipped.size === 0) return;
    setMarkingFired(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/mark-fired`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_ids: Array.from(selectedDipped) }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Could not mark as fired.'); return; }
      setFiredResult(d);
      setDippedPieces((prev) => prev.filter((p) => !selectedDipped.has(p.id)));
      setSelectedDipped(new Set());
    } catch {
      setError('Could not reach the server.');
    } finally {
      setMarkingFired(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Flame size={22} color="var(--clay)" /> Kiln — Dip, Fire & Post
      </h1>
      <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        Look up the booking on the card. Confirm packed pieces going in for dip + firing, or mark waiting pieces as fired once they're out.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input
          type="text"
          value={bookingRef}
          onChange={(e) => setBookingRef(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && lookup()}
          placeholder="Booking code or name on the card"
          style={{ flex: 1, padding: '0.6rem 0.8rem', borderRadius: 8, border: '1px solid #ddd', fontSize: '0.9rem' }}
        />
        <button
          onClick={lookup}
          disabled={loading || !bookingRef.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', backgroundColor: 'var(--clay)', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
        >
          <Search size={15} /> {loading ? '...' : 'Look up'}
        </button>
      </div>

      {error && <div style={{ padding: '0.8rem', backgroundColor: '#fee', color: '#c33', borderRadius: 8, marginBottom: '1rem', fontSize: '0.85rem' }}>{error}</div>}

      {dipResult && (
        <div style={{ padding: '1rem', backgroundColor: '#e8f5e9', border: '1px solid #66bb6a', borderRadius: 8, marginBottom: '1.25rem' }}>
          <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.3rem' }}>
            <Check size={16} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
            {dipResult.transitioned} piece{dipResult.transitioned === 1 ? '' : 's'} moved to dipped, waiting for firing
          </p>
          <p style={{ fontSize: '0.8rem', color: '#333' }}>Collection date set: {new Date(dipResult.collection_date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
          {dipResult.unmatched_booking_refs.length > 0 && (
            <p style={{ fontSize: '0.75rem', color: '#8a5a00', marginTop: '0.3rem' }}>
              No real booking matched "{dipResult.unmatched_booking_refs.join(', ')}" -- pieces updated, no collection date attached anywhere.
            </p>
          )}
        </div>
      )}

      {firedResult && (
        <div style={{ padding: '1rem', backgroundColor: '#e8f5e9', border: '1px solid #66bb6a', borderRadius: 8, marginBottom: '1.25rem' }}>
          <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.3rem' }}>
            <Check size={16} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
            {firedResult.marked_fired} piece{firedResult.marked_fired === 1 ? '' : 's'} marked fired
          </p>
          {firedResult.email_results.map((r) => (
            <p key={r.booking_code} style={{ fontSize: '0.78rem', color: r.sent ? '#2e7d32' : '#8a5a00', marginTop: '0.2rem' }}>
              <Mail size={13} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
              {r.booking_code}: {r.sent ? 'ready-for-collection email sent' : r.reason === 'not_configured' ? 'email not sent -- no email provider configured yet' : `email not sent (${r.reason})`}
            </p>
          ))}
        </div>
      )}

      {packedPieces.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>Packed — going in for dip</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.8rem' }}>
            {packedPieces.map((p) => (
              <button
                key={p.id}
                onClick={() => togglePacked(p.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 0.9rem',
                  borderRadius: 8, border: selectedPacked.has(p.id) ? '2px solid var(--clay)' : '1px solid #ddd',
                  backgroundColor: selectedPacked.has(p.id) ? 'var(--clay-light, #f5e6d3)' : 'white', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid var(--clay)', backgroundColor: selectedPacked.has(p.id) ? 'var(--clay)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selectedPacked.has(p.id) && <Check size={12} color="white" />}
                </div>
                <span style={{ fontSize: '0.85rem' }}>{p.piece_type}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.8rem' }}>
            <label style={{ fontSize: '0.85rem', color: '#666' }}>Firing date</label>
            <input
              type="date"
              value={firingDate}
              onChange={(e) => setFiringDate(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              style={{ padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.85rem' }}
            />
          </div>
          <button
            onClick={confirmDip}
            disabled={confirming || selectedPacked.size === 0 || !firingDate}
            style={{ width: '100%', padding: '0.8rem', borderRadius: 8, border: 'none', backgroundColor: selectedPacked.size && firingDate ? 'var(--clay)' : '#ccc', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: selectedPacked.size && firingDate ? 'pointer' : 'default' }}
          >
            {confirming ? 'Saving...' : `Confirm ${selectedPacked.size} piece${selectedPacked.size === 1 ? '' : 's'} dipped & waiting for firing`}
          </button>
        </div>
      )}

      {dippedPieces.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <p style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem' }}>Waiting for firing — mark fired once out</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.8rem' }}>
            {dippedPieces.map((p) => (
              <button
                key={p.id}
                onClick={() => toggleDipped(p.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.7rem 0.9rem',
                  borderRadius: 8, border: selectedDipped.has(p.id) ? '2px solid var(--clay)' : '1px solid #ddd',
                  backgroundColor: selectedDipped.has(p.id) ? 'var(--clay-light, #f5e6d3)' : 'white', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <div style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid var(--clay)', backgroundColor: selectedDipped.has(p.id) ? 'var(--clay)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {selectedDipped.has(p.id) && <Check size={12} color="white" />}
                </div>
                <span style={{ fontSize: '0.85rem' }}>
                  {p.piece_type}
                  {p.scheduled_firing_date && <span style={{ display: 'block', fontSize: '0.7rem', color: '#999' }}>Firing: {new Date(p.scheduled_firing_date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>}
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={confirmFired}
            disabled={markingFired || selectedDipped.size === 0}
            style={{ width: '100%', padding: '0.8rem', borderRadius: 8, border: 'none', backgroundColor: selectedDipped.size ? 'var(--clay)' : '#ccc', color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: selectedDipped.size ? 'pointer' : 'default' }}
          >
            {markingFired ? 'Saving...' : `Mark ${selectedDipped.size} piece${selectedDipped.size === 1 ? '' : 's'} fired`}
          </button>
        </div>
      )}

      <PostageLabelForm defaultBookingCode={bookingRef} />
    </div>
  );
}

// Real Royal Mail Click & Drop order creation -- see the backend route's
// own comment for the full honesty note. Weight is entered by hand since
// no per-item weight is captured anywhere in this app; this is a real
// parcel someone should actually weigh, not an estimate.
function PostageLabelForm({ defaultBookingCode }: { defaultBookingCode: string }) {
  const [bookingCode, setBookingCode] = useState(defaultBookingCode);
  const [personName, setPersonName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [postcode, setPostcode] = useState('');
  const [weightGrams, setWeightGrams] = useState('');
  const [creating, setCreating] = useState(false);
  const [labelResult, setLabelResult] = useState<{ created: boolean; configured: boolean; tracking_number?: string | null; label_url?: string | null; error?: string } | null>(null);

  const createLabel = async () => {
    setCreating(true);
    setLabelResult(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/postal/create-label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_code: bookingCode.trim(),
          person_name: personName.trim() || undefined,
          recipient_name: recipientName.trim(),
          address_line1: addressLine1.trim(),
          city: city.trim() || undefined,
          postcode: postcode.trim(),
          weight_grams: Number(weightGrams),
        }),
      });
      const d = await res.json();
      setLabelResult({ created: !!d.created, configured: d.configured !== false, tracking_number: d.tracking_number, label_url: d.label_url, error: d.error });
    } catch {
      setLabelResult({ created: false, configured: true, error: 'Could not reach the server.' });
    } finally {
      setCreating(false);
    }
  };

  const ready = recipientName.trim() && addressLine1.trim() && postcode.trim() && Number(weightGrams) > 0;

  return (
    <div style={{ borderTop: '1px solid #eee', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
      <p style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Package size={17} color="var(--clay)" /> Postage label
      </p>
      <p style={{ fontSize: '0.75rem', color: '#999', marginBottom: '0.8rem' }}>
        No QR code on the label — kept to what a courier actually needs to read.
      </p>

      {labelResult && (
        <div style={{ padding: '0.8rem', borderRadius: 8, marginBottom: '0.8rem', backgroundColor: labelResult.created ? '#e8f5e9' : '#fff3e0', border: `1px solid ${labelResult.created ? '#66bb6a' : '#e0a020'}`, fontSize: '0.82rem' }}>
          {labelResult.created ? (
            <>
              <p style={{ fontWeight: 700 }}>Label created</p>
              {labelResult.tracking_number && <p>Tracking: {labelResult.tracking_number}</p>}
              {labelResult.label_url && <p><a href={labelResult.label_url} target="_blank" rel="noreferrer" style={{ color: 'var(--clay)' }}>Open label PDF →</a></p>}
            </>
          ) : !labelResult.configured ? (
            <p>Royal Mail isn't connected yet — needs a real Click &amp; Drop business account and API key added to the server before labels can actually be created.</p>
          ) : (
            <p>{labelResult.error || 'Could not create the label.'}</p>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <input type="text" value={bookingCode} onChange={(e) => setBookingCode(e.target.value)} placeholder="Booking code" style={{ padding: '0.5rem 0.7rem', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.82rem' }} />
        <input type="text" value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Person (if split)" style={{ padding: '0.5rem 0.7rem', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.82rem' }} />
      </div>
      <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Recipient name" style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.82rem', marginBottom: '0.5rem' }} />
      <input type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Address line 1" style={{ width: '100%', padding: '0.5rem 0.7rem', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.82rem', marginBottom: '0.5rem' }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.8rem' }}>
        <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" style={{ padding: '0.5rem 0.7rem', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.82rem' }} />
        <input type="text" value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Postcode" style={{ padding: '0.5rem 0.7rem', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.82rem' }} />
        <input type="number" value={weightGrams} onChange={(e) => setWeightGrams(e.target.value)} placeholder="Weight (g)" style={{ padding: '0.5rem 0.7rem', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.82rem' }} />
      </div>
      <button
        onClick={createLabel}
        disabled={creating || !ready}
        style={{ width: '100%', padding: '0.7rem', borderRadius: 8, border: 'none', backgroundColor: ready ? 'var(--clay)' : '#ccc', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: ready ? 'pointer' : 'default' }}
      >
        {creating ? 'Creating...' : 'Create postage label'}
      </button>
    </div>
  );
}
