'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Flame, Search, Mail, Package, CalendarDays } from 'lucide-react';

interface BookingInfo {
  booking_code: string;
  customer_name: string;
  session_start: string;
  party_size: number | null;
  notes: string | null;
  collection_date: string | null;
}

// SIMPLIFIED per Daisy directly: the old packed -> dipped -> fired staged
// tracking (and QR scanning at any point) is no longer needed. Photos are
// already linked to the booking from completion, and the real AI
// shelf-matching (Shelf Sweep) finds pieces on the shelf once a batch is
// out. All that's actually needed here: look up the booking, set/confirm
// the collection date, and send the ready-for-collection email once
// staff have confirmed the batch is out and found.
export default function KilnPage() {
  const [bookingRef, setBookingRef] = useState('');
  const [booking, setBooking] = useState<BookingInfo | null>(null);
  const [collectionDate, setCollectionDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailResult, setEmailResult] = useState<{ sent: boolean; reason?: string } | null>(null);

  const lookup = async () => {
    const ref = bookingRef.trim();
    if (!ref) return;
    setLoading(true);
    setError(null);
    setBooking(null);
    setEmailResult(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/booking-lookup?booking=${encodeURIComponent(ref)}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Could not find that booking.'); return; }
      setBooking(d);
      setCollectionDate(d.collection_date || '');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  };

  const saveDate = async () => {
    if (!booking || !collectionDate) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/bookings/${booking.booking_code}/collection-date`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection_date: collectionDate }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Could not save the collection date.'); return; }
      setBooking((prev) => (prev ? { ...prev, collection_date: collectionDate } : prev));
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const sendEmail = async () => {
    if (!booking) return;
    setSending(true);
    setEmailResult(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/spec/kiln/send-ready-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_code: booking.booking_code }),
      });
      const d = await res.json();
      setEmailResult(d);
    } catch {
      setEmailResult({ sent: false, reason: 'Could not reach the server.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Flame size={22} color="var(--clay)" /> Kiln — Collection &amp; Post
      </h1>
      <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
        Look up the booking, set the collection date, and send the ready-for-collection email once a batch is out and found on the shelf.
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

      {booking && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ padding: '0.9rem', border: '1px solid #eee', borderRadius: 8, marginBottom: '0.8rem' }}>
            <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>{booking.customer_name}</p>
            <p style={{ fontSize: '0.78rem', color: '#999', fontFamily: 'monospace' }}>{booking.booking_code}</p>
            <p style={{ fontSize: '0.82rem', color: '#666', marginTop: '0.3rem' }}>
              {new Date(booking.session_start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
              {booking.party_size ? ` · party of ${booking.party_size}` : ''}
            </p>
            {booking.notes && (
              <div style={{ marginTop: '0.6rem', padding: '0.6rem', backgroundColor: '#fff8e1', border: '1px solid #ffca28', borderRadius: 6 }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#8a5a00', marginBottom: '0.15rem' }}>Booking notes</p>
                <p style={{ fontSize: '0.82rem', color: '#333' }}>{booking.notes}</p>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
            <CalendarDays size={16} color="var(--clay)" />
            <label style={{ fontSize: '0.85rem', color: '#666' }}>Collection date</label>
            <input
              type="date"
              value={collectionDate}
              onChange={(e) => setCollectionDate(e.target.value)}
              style={{ padding: '0.4rem 0.6rem', borderRadius: 6, border: '1px solid #ddd', fontSize: '0.85rem' }}
            />
            <button
              onClick={saveDate}
              disabled={saving || !collectionDate || collectionDate === booking.collection_date}
              style={{ padding: '0.4rem 0.8rem', borderRadius: 6, border: 'none', backgroundColor: collectionDate && collectionDate !== booking.collection_date ? 'var(--clay)' : '#ccc', color: 'white', fontSize: '0.8rem', cursor: collectionDate && collectionDate !== booking.collection_date ? 'pointer' : 'default' }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>

          <button
            onClick={sendEmail}
            disabled={sending}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', width: '100%', padding: '0.7rem', borderRadius: 8, border: 'none', backgroundColor: 'var(--clay)', color: 'white', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            <Mail size={15} /> {sending ? 'Sending...' : 'Send ready-for-collection email'}
          </button>

          {emailResult && (
            <div style={{ marginTop: '0.6rem', padding: '0.7rem', borderRadius: 8, fontSize: '0.8rem', backgroundColor: emailResult.sent ? '#e8f5e9' : '#fff3e0', border: `1px solid ${emailResult.sent ? '#66bb6a' : '#e0a020'}` }}>
              {emailResult.sent ? 'Email sent.' : emailResult.reason === 'not_configured' ? "Email isn't connected yet — needs a real Resend API key added to the server." : emailResult.reason === 'no_customer_email' ? 'This booking has no email address on file.' : (emailResult.reason || 'Could not send the email.')}
            </div>
          )}
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
