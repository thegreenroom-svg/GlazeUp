import React, { useState, useEffect } from 'react';
import { ChevronRight, LogOut, Home, Settings, QrCode, Camera, Plus, X } from 'lucide-react';

// Brand palette from LINK-App-Master-Reference.md
const BRAND = {
  charcoal: '#2B2724',
  clay: '#B87946',
  sand: '#E8D9C4',
  ivory: '#F7F4EE',
  stone: '#C8BFB2'
};

export default function GlazeUpApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [phase, setPhase] = useState(null); // 1=load, 2=workflow, 3=handoff
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  
  const [bookings, setBookings] = useState([]);
  const [currentBooking, setCurrentBooking] = useState(null);
  const [tableItems, setTableItems] = useState(0);
  const [pieces, setPieces] = useState([]);
  const [bookingPhoto, setBookingPhoto] = useState(null);
  const [loading, setLoading] = useState(false);

  // Authenticate with PIN
  const handleLogin = async () => {
    if (pin === '0000') {
      setAuthenticated(true);
      setPinError('');
      setPin('');
    } else {
      setPinError('Invalid PIN');
    }
  };

  // Load bookings via Anthropic API
  const loadBookings = async () => {
    setLoading(true);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          messages: [
            {
              role: 'user',
              content: `Generate 8 realistic pottery studio bookings for today (11 Aug 2026). Include: 
              - Family friendly bookings (Main Studio, The Lounge)
              - Adult only sessions (Adult only, Evening)
              - Mix of walk-ins and pre-booked
              Return ONLY valid JSON array with fields: 
              {id, name, time, table, size, space, email, phone, pieces, createdAt}
              No markdown, no explanation.`
            }
          ]
        })
      });

      const data = await response.json();
      const text = data.content[0].text.trim();
      const parsed = JSON.parse(text);
      setBookings(parsed);
    } catch (err) {
      console.error('API error:', err);
      // Fallback data
      setBookings([
        { id: 1, name: 'Sarah & kids', time: '10:30', table: 'T1', size: 3, space: 'Main Studio', pieces: 4, createdAt: '2026-08-11T10:30:00Z' },
        { id: 2, name: 'David (adult)', time: '14:00', table: 'L1', size: 1, space: 'The Lounge', pieces: 2, createdAt: '2026-08-11T14:00:00Z' },
        { id: 3, name: 'The Johnsons', time: '15:30', table: 'T2', size: 4, space: 'Main Studio', pieces: 6, createdAt: '2026-08-11T15:30:00Z' },
        { id: 4, name: 'Elena (walk-in)', time: '16:00', table: 'L2', size: 2, space: 'Adult Evening', pieces: 3, createdAt: '2026-08-11T16:00:00Z' }
      ]);
    }
    setLoading(false);
  };

  // Describe pieces via Anthropic vision
  const describePieces = async (photoData) => {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 500,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: 'image/jpeg',
                    data: photoData
                  }
                },
                {
                  type: 'text',
                  text: 'Identify each pottery piece in this photo. For each piece list: shape (mug/bowl/tile/etc), primary colours, patterns, estimated location in frame. Return as JSON array. Concise, no explanation.'
                }
              ]
            }
          ]
        })
      });

      const data = await response.json();
      const text = data.content[0].text.trim();
      const parsed = JSON.parse(text);
      setPieces(parsed);
      return parsed;
    } catch (err) {
      console.error('Vision error:', err);
      return [];
    }
  };

  // QR code generator (simple text-based for demo)
  const generateQRCode = (text) => {
    return `qr:${text}`;
  };

  // Logout
  const handleLogout = () => {
    setAuthenticated(false);
    setPhase(null);
    setCurrentBooking(null);
    setPin('');
    setPieces([]);
  };

  // ============ LOGIN SCREEN ============
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BRAND.charcoal }}>
        <div className="w-full max-w-sm p-8">
          <div className="text-center mb-12">
            <div className="inline-block p-4 mb-4" style={{ backgroundColor: BRAND.clay + '30' }}>
              <span className="text-4xl">🎨</span>
            </div>
            <h1 className="text-3xl font-bold" style={{ color: BRAND.ivory }}>GlazeUp</h1>
            <p style={{ color: BRAND.stone }} className="text-sm mt-2">Staff Portal</p>
          </div>

          <div className="space-y-4">
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Enter PIN"
              className="w-full px-4 py-3 rounded-lg text-center text-2xl tracking-widest"
              style={{ backgroundColor: BRAND.ivory, color: BRAND.charcoal }}
            />
            {pinError && <p style={{ color: '#ef4444' }} className="text-sm text-center">{pinError}</p>}
            <button
              onClick={handleLogin}
              className="w-full py-3 rounded-lg font-bold transition-all"
              style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}
            >
              Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ PHASE 1: DAILY BOOKING LOAD ============
  if (!phase) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: BRAND.charcoal }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-8 pt-4">
            <h1 style={{ color: BRAND.ivory }} className="text-2xl font-bold">GlazeUp</h1>
            <button onClick={handleLogout} className="p-2" style={{ color: BRAND.clay }}>
              <LogOut size={20} />
            </button>
          </div>

          <div className="rounded-lg p-8" style={{ backgroundColor: BRAND.sand + '15', border: `2px solid ${BRAND.clay}` }}>
            <div className="text-center mb-8">
              <div className="inline-block p-4 mb-4" style={{ backgroundColor: BRAND.clay + '30' }}>
                <span className="text-5xl">📋</span>
              </div>
              <h2 className="text-2xl font-bold" style={{ color: BRAND.ivory }}>Daily Booking Load</h2>
              <p style={{ color: BRAND.stone }} className="mt-2">Pull all bookings. Ready to work the floor.</p>
            </div>

            <div className="space-y-2 mb-8 p-4 rounded-lg" style={{ backgroundColor: BRAND.charcoal }}>
              <p style={{ color: BRAND.sand }} className="text-sm">✓ API pulls all bookings</p>
              <p style={{ color: BRAND.sand }} className="text-sm">✓ Populate table picker</p>
              <p style={{ color: BRAND.sand }} className="text-sm">✓ Customer search ready</p>
            </div>

            <button
              onClick={() => {
                loadBookings();
                setPhase(2);
              }}
              disabled={loading}
              className="w-full py-4 rounded-lg font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}
            >
              {loading ? 'Loading bookings...' : 'Ready to work →'}
              {!loading && <ChevronRight size={20} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============ PHASE 2: TABLE WORKFLOW ============
  if (phase === 2) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: BRAND.charcoal }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-6 pt-4">
            <button onClick={() => setPhase(1)} className="p-2" style={{ color: BRAND.clay }}>
              <Home size={20} />
            </button>
            <p style={{ color: BRAND.stone }} className="text-sm">Phase 2 of 3</p>
            <button onClick={handleLogout} className="p-2" style={{ color: BRAND.clay }}>
              <LogOut size={20} />
            </button>
          </div>

          <div className="rounded-lg p-8 mb-6" style={{ backgroundColor: BRAND.sand + '15', border: `2px solid ${BRAND.clay}` }}>
            <div className="text-center mb-6">
              <div className="inline-block p-3 mb-3" style={{ backgroundColor: BRAND.clay + '30' }}>
                <span className="text-4xl">🎨</span>
              </div>
              <h2 className="text-2xl font-bold" style={{ color: BRAND.ivory }}>Table Workflow</h2>
              <p style={{ color: BRAND.stone }} className="text-sm mt-1">Select table. Process booking. Record pieces.</p>
            </div>

            {!currentBooking ? (
              <div className="space-y-2">
                <p style={{ color: BRAND.stone }} className="text-sm mb-3">Select a booking:</p>
                {bookings.map((booking) => (
                  <button
                    key={booking.id}
                    onClick={() => setCurrentBooking(booking)}
                    className="w-full text-left p-4 rounded-lg transition-all"
                    style={{ backgroundColor: BRAND.charcoal, borderLeft: `4px solid ${BRAND.clay}` }}
                  >
                    <div style={{ color: BRAND.ivory }} className="font-bold">{booking.name}</div>
                    <div style={{ color: BRAND.stone }} className="text-sm">{booking.time} • {booking.space} • {booking.size} person{booking.size > 1 ? 's' : ''}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: BRAND.charcoal }}>
                <div className="mb-4">
                  <h3 style={{ color: BRAND.ivory }} className="text-lg font-bold">{currentBooking.name}</h3>
                  <p style={{ color: BRAND.stone }} className="text-sm">{currentBooking.time} • Table {currentBooking.table}</p>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 p-3 rounded" style={{ backgroundColor: BRAND.sand + '20' }}>
                    <span>📸</span>
                    <div>
                      <p style={{ color: BRAND.ivory }} className="text-sm font-semibold">Photograph table</p>
                      <p style={{ color: BRAND.stone }} className="text-xs">Capture room state + chalk tag</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded" style={{ backgroundColor: BRAND.sand + '20' }}>
                    <span>🤖</span>
                    <div>
                      <p style={{ color: BRAND.ivory }} className="text-sm font-semibold">AI reads chalk tag</p>
                      <p style={{ color: BRAND.stone }} className="text-xs">OCR + booking match</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded" style={{ backgroundColor: BRAND.sand + '20' }}>
                    <span>🎯</span>
                    <div>
                      <p style={{ color: BRAND.ivory }} className="text-sm font-semibold">Add items</p>
                      <input
                        type="number"
                        min="0"
                        value={tableItems}
                        onChange={(e) => setTableItems(parseInt(e.target.value) || 0)}
                        placeholder="Pieces painted"
                        className="mt-2 w-full px-2 py-1 rounded text-sm"
                        style={{ backgroundColor: BRAND.charcoal, color: BRAND.ivory, border: `1px solid ${BRAND.stone}` }}
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setCurrentBooking(null)}
                  className="text-sm mb-4 transition-all"
                  style={{ color: BRAND.clay }}
                >
                  ← Change booking
                </button>
              </div>
            )}

            {currentBooking && (
              <button
                onClick={() => {
                  setPhase(3);
                }}
                className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all"
                style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}
              >
                Done with table →
                <ChevronRight size={20} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============ PHASE 3: FINISH & HAND-OFF ============
  if (phase === 3) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: BRAND.charcoal }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-6 pt-4">
            <button onClick={() => setPhase(2)} className="p-2" style={{ color: BRAND.clay }}>
              <Home size={20} />
            </button>
            <p style={{ color: BRAND.stone }} className="text-sm">Phase 3 of 3</p>
            <button onClick={handleLogout} className="p-2" style={{ color: BRAND.clay }}>
              <LogOut size={20} />
            </button>
          </div>

          <div className="rounded-lg p-8 mb-6" style={{ backgroundColor: BRAND.sand + '15', border: `2px solid ${BRAND.clay}` }}>
            <div className="text-center mb-8">
              <div className="inline-block p-3 mb-3" style={{ backgroundColor: BRAND.clay + '30' }}>
                <span className="text-4xl">🖨️</span>
              </div>
              <h2 className="text-2xl font-bold" style={{ color: BRAND.ivory }}>Finish & Hand-off</h2>
              <p style={{ color: BRAND.stone }} className="text-sm mt-1">Print cards. Hand to customer. Log pieces.</p>
            </div>

            <div className="space-y-3 mb-8">
              <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: BRAND.charcoal }}>
                <span>📇</span>
                <div>
                  <p style={{ color: BRAND.ivory }} className="text-sm font-semibold">Booking Card</p>
                  <p style={{ color: BRAND.stone }} className="text-xs">QR + name + time + day + seats</p>
                  <div style={{ color: BRAND.sand }} className="text-xs font-mono mt-2">
                    {generateQRCode(`booking:${currentBooking?.id}`)}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: BRAND.charcoal }}>
                <span>🔖</span>
                <div>
                  <p style={{ color: BRAND.ivory }} className="text-sm font-semibold">Piece Cards</p>
                  <p style={{ color: BRAND.stone }} className="text-xs">{tableItems} cards generated</p>
                  {tableItems > 0 && (
                    <div style={{ color: BRAND.sand }} className="text-xs font-mono mt-2 space-y-1">
                      {Array.from({ length: tableItems }).map((_, i) => (
                        <div key={i}>{generateQRCode(`piece:${currentBooking?.id}-${i + 1}`)}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg" style={{ backgroundColor: BRAND.charcoal }}>
                <span>📸</span>
                <div>
                  <p style={{ color: BRAND.ivory }} className="text-sm font-semibold">Photo-finish OCR</p>
                  <p style={{ color: BRAND.stone }} className="text-xs">Pieces flow to shelf search</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setPhase(2);
                setCurrentBooking(null);
                setTableItems(0);
                setPieces([]);
              }}
              className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all"
              style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}
            >
              Next booking →
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }
}
