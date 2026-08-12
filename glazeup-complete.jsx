import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, LogOut, Home, Camera, X } from 'lucide-react';

const BRAND = {
  charcoal: '#2B2724',
  clay: '#B87946',
  sand: '#E8D9C4',
  ivory: '#F7F4EE',
  stone: '#C8BFB2'
};

export default function GlazeUpComplete() {
  const [authenticated, setAuthenticated] = useState(false);
  const [phase, setPhase] = useState(null);
  const [pin, setPin] = useState('');
  
  const [bookings, setBookings] = useState([]);
  const [currentBooking, setCurrentBooking] = useState(null);
  const [tableItems, setTableItems] = useState(0);
  const [loading, setLoading] = useState(false);
  
  const [shelfMode, setShelfMode] = useState(false);
  const [shelfPhoto, setShelfPhoto] = useState(null);
  const [shelfPieces, setShelfPieces] = useState([]);
  const [matchedPieces, setMatchedPieces] = useState([]);
  const canvasRef = useRef(null);

  // LOGIN
  const handleLogin = () => {
    if (pin === '0000') {
      setAuthenticated(true);
      setPin('');
    }
  };

  // LOAD BOOKINGS
  const loadBookings = async () => {
    setLoading(true);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `Generate 8 pottery studio bookings for today. Return ONLY JSON array:
            [{id, name, time, table, size, space, pieces}]`
          }]
        })
      });
      const data = await response.json();
      const parsed = JSON.parse(data.content[0].text.trim());
      setBookings(parsed);
    } catch (err) {
      setBookings([
        { id: 1, name: 'Sarah & kids', time: '10:30', table: 'T1', size: 3, space: 'Main Studio', pieces: 4 },
        { id: 2, name: 'David', time: '14:00', table: 'L1', size: 1, space: 'Lounge', pieces: 2 },
        { id: 3, name: 'Johnsons', time: '15:30', table: 'T2', size: 4, space: 'Main Studio', pieces: 6 },
      ]);
    }
    setLoading(false);
  };

  // SHELF RECOGNITION - Describe pieces from shelf photo
  const describeShelfPieces = async (photoData) => {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: photoData }
              },
              {
                type: 'text',
                text: `Inventory each piece on this shelf. For each: shape, primary colours, patterns, grid position (A1-H8).
                Then match to these bookings:
                ${bookings.map(b => `${b.id}: ${b.name} (${b.pieces} pieces)`).join('; ')}
                
                Return JSON: {
                  inventory: [{shape, colours, pattern, position}],
                  matches: [{booking_id, piece_index, confidence}]
                }`
              }
            ]
          }]
        })
      });
      const data = await response.json();
      const result = JSON.parse(data.content[0].text.trim());
      setShelfPieces(result.inventory);
      setMatchedPieces(result.matches);
    } catch (err) {
      console.error('Shelf recognition error:', err);
    }
  };

  // PHOTO UPLOAD - convert to base64
  const handlePhotoUpload = async (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      setShelfPhoto(e.target.result);
      describeShelfPieces(base64);
    };
    reader.readAsDataURL(file);
  };

  // DRAW GRID ON CANVAS
  const drawGrid = (canvas, photo) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
      // Draw 8x8 magenta grid
      const cellW = canvas.width / 8;
      const cellH = canvas.height / 8;
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 2;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellW, 0);
        ctx.lineTo(i * cellW, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cellH);
        ctx.lineTo(canvas.width, i * cellH);
        ctx.stroke();
      }
      
      // Draw match circles
      matchedPieces.forEach(m => {
        const colIdx = m.position.charCodeAt(0) - 65; // A-H
        const rowIdx = parseInt(m.position[1]) - 1; // 1-8
        ctx.fillStyle = 'rgba(255, 0, 255, 0.3)';
        ctx.beginPath();
        ctx.arc((colIdx + 0.5) * cellW, (rowIdx + 0.5) * cellH, cellW * 0.3, 0, Math.PI * 2);
        ctx.fill();
      });
    };
    img.src = photo;
  };

  useEffect(() => {
    if (shelfPhoto && canvasRef.current) {
      drawGrid(canvasRef.current, shelfPhoto);
    }
  }, [shelfPhoto, matchedPieces]);

  const handleLogout = () => {
    setAuthenticated(false);
    setPhase(null);
    setCurrentBooking(null);
    setShelfMode(false);
    setShelfPhoto(null);
  };

  // ============ LOGIN ============
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BRAND.charcoal }}>
        <div className="w-full max-w-sm p-8">
          <div className="text-center mb-12">
            <span className="text-4xl">🎨</span>
            <h1 className="text-3xl font-bold mt-4" style={{ color: BRAND.ivory }}>GlazeUp</h1>
          </div>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="PIN"
            className="w-full px-4 py-3 rounded-lg text-center text-2xl tracking-widest mb-4"
            style={{ backgroundColor: BRAND.ivory }}
          />
          <button
            onClick={handleLogin}
            className="w-full py-3 rounded-lg font-bold"
            style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // ============ SHELF RECOGNITION ============
  if (shelfMode) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: BRAND.charcoal }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-6 pt-4">
            <button onClick={() => setShelfMode(false)} className="p-2" style={{ color: BRAND.clay }}>
              <X size={20} />
            </button>
            <h2 style={{ color: BRAND.ivory }} className="text-xl font-bold">Shelf Scan</h2>
            <button onClick={handleLogout} className="p-2" style={{ color: BRAND.clay }}>
              <LogOut size={20} />
            </button>
          </div>

          {!shelfPhoto ? (
            <div className="rounded-lg p-8 text-center" style={{ backgroundColor: BRAND.sand + '15', border: `2px solid ${BRAND.clay}` }}>
              <span className="text-5xl">📸</span>
              <h3 className="text-xl font-bold mt-4" style={{ color: BRAND.ivory }}>Photograph shelf</h3>
              <p style={{ color: BRAND.stone }} className="text-sm mt-2">Capture all pieces for matching</p>
              <label className="inline-block mt-6 px-6 py-3 rounded-lg font-bold cursor-pointer" style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}>
                Choose Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files && handlePhotoUpload(e.target.files[0])}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden" style={{ border: `2px solid ${BRAND.clay}` }}>
              <canvas ref={canvasRef} className="w-full" />
            </div>
          )}

          {shelfPieces.length > 0 && (
            <div className="mt-6 rounded-lg p-6" style={{ backgroundColor: BRAND.sand + '15' }}>
              <h3 style={{ color: BRAND.ivory }} className="font-bold mb-4">Pieces Found: {shelfPieces.length}</h3>
              <div className="space-y-2">
                {shelfPieces.map((piece, idx) => (
                  <div key={idx} className="p-3 rounded" style={{ backgroundColor: BRAND.charcoal }}>
                    <p style={{ color: BRAND.ivory }} className="font-semibold text-sm">{piece.shape}</p>
                    <p style={{ color: BRAND.sand }} className="text-xs">{piece.colours} • {piece.pattern}</p>
                    <p style={{ color: BRAND.stone }} className="text-xs mt-1">Grid: {piece.position}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {matchedPieces.length > 0 && (
            <div className="mt-6 rounded-lg p-6" style={{ backgroundColor: BRAND.clay + '20' }}>
              <h3 style={{ color: BRAND.ivory }} className="font-bold mb-4">Matched to Bookings</h3>
              <div className="space-y-2">
                {matchedPieces.map((match, idx) => {
                  const booking = bookings.find(b => b.id === match.booking_id);
                  return (
                    <div key={idx} className="p-3 rounded flex justify-between items-center" style={{ backgroundColor: BRAND.charcoal }}>
                      <div>
                        <p style={{ color: BRAND.ivory }} className="font-semibold text-sm">{booking?.name}</p>
                        <p style={{ color: BRAND.stone }} className="text-xs">Piece {match.piece_index + 1}</p>
                      </div>
                      <p style={{ color: BRAND.clay }} className="text-sm font-bold">{Math.round(match.confidence * 100)}%</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {shelfPhoto && (
            <button
              onClick={() => {
                setShelfPhoto(null);
                setShelfPieces([]);
                setMatchedPieces([]);
              }}
              className="w-full mt-6 py-3 rounded-lg font-bold"
              style={{ backgroundColor: BRAND.stone, color: BRAND.ivory }}
            >
              Scan Another Shelf
            </button>
          )}
        </div>
      </div>
    );
  }

  // ============ PHASE 1: LOAD ============
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
              <span className="text-5xl">📋</span>
              <h2 className="text-2xl font-bold mt-4" style={{ color: BRAND.ivory }}>Daily Load</h2>
              <p style={{ color: BRAND.stone }} className="mt-2 text-sm">Ready to work the floor</p>
            </div>

            <div className="space-y-3 mb-8">
              <button
                onClick={() => {
                  loadBookings();
                  setPhase(2);
                }}
                disabled={loading}
                className="w-full py-4 rounded-lg font-bold flex items-center justify-center gap-2"
                style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}
              >
                {loading ? 'Loading...' : 'Start Floor →'}
                {!loading && <ChevronRight size={20} />}
              </button>

              <button
                onClick={() => setShelfMode(true)}
                className="w-full py-4 rounded-lg font-bold flex items-center justify-center gap-2"
                style={{ backgroundColor: BRAND.stone, color: BRAND.ivory }}
              >
                <Camera size={20} />
                Shelf Scan
              </button>
            </div>
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
            <p style={{ color: BRAND.stone }} className="text-sm">Phase 2/3</p>
            <button onClick={handleLogout} className="p-2" style={{ color: BRAND.clay }}>
              <LogOut size={20} />
            </button>
          </div>

          <div className="rounded-lg p-8" style={{ backgroundColor: BRAND.sand + '15', border: `2px solid ${BRAND.clay}` }}>
            <div className="text-center mb-6">
              <span className="text-4xl">🎨</span>
              <h2 className="text-2xl font-bold mt-4" style={{ color: BRAND.ivory }}>Table</h2>
            </div>

            {!currentBooking ? (
              <div className="space-y-2">
                {bookings.map((booking) => (
                  <button
                    key={booking.id}
                    onClick={() => setCurrentBooking(booking)}
                    className="w-full text-left p-4 rounded-lg"
                    style={{ backgroundColor: BRAND.charcoal, borderLeft: `4px solid ${BRAND.clay}` }}
                  >
                    <div style={{ color: BRAND.ivory }} className="font-bold">{booking.name}</div>
                    <div style={{ color: BRAND.stone }} className="text-sm">{booking.time} • {booking.space}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: BRAND.charcoal }}>
                <h3 style={{ color: BRAND.ivory }} className="font-bold text-lg">{currentBooking.name}</h3>
                <p style={{ color: BRAND.stone }} className="text-sm mb-4">{currentBooking.time}</p>
                <div className="mb-4">
                  <label style={{ color: BRAND.sand }} className="text-sm">Pieces</label>
                  <input
                    type="number"
                    min="0"
                    value={tableItems}
                    onChange={(e) => setTableItems(parseInt(e.target.value) || 0)}
                    className="w-full mt-2 px-3 py-2 rounded"
                    style={{ backgroundColor: BRAND.ivory, color: BRAND.charcoal }}
                  />
                </div>
                <button
                  onClick={() => setCurrentBooking(null)}
                  className="text-sm"
                  style={{ color: BRAND.clay }}
                >
                  ← Change
                </button>
              </div>
            )}

            {currentBooking && (
              <button
                onClick={() => setPhase(3)}
                className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2"
                style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}
              >
                Finish →
                <ChevronRight size={20} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ============ PHASE 3: HAND-OFF ============
  if (phase === 3) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: BRAND.charcoal }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-6 pt-4">
            <button onClick={() => setPhase(2)} className="p-2" style={{ color: BRAND.clay }}>
              <Home size={20} />
            </button>
            <p style={{ color: BRAND.stone }} className="text-sm">Phase 3/3</p>
            <button onClick={handleLogout} className="p-2" style={{ color: BRAND.clay }}>
              <LogOut size={20} />
            </button>
          </div>

          <div className="rounded-lg p-8" style={{ backgroundColor: BRAND.sand + '15', border: `2px solid ${BRAND.clay}` }}>
            <div className="text-center mb-8">
              <span className="text-4xl">🖨️</span>
              <h2 className="text-2xl font-bold mt-4" style={{ color: BRAND.ivory }}>Hand-off</h2>
            </div>

            <div className="space-y-4 mb-8">
              <div className="p-4 rounded-lg" style={{ backgroundColor: BRAND.charcoal }}>
                <p style={{ color: BRAND.ivory }} className="font-bold text-sm">Booking Card</p>
                <p style={{ color: BRAND.sand }} className="text-xs font-mono mt-2">QR:{currentBooking?.id}</p>
                <p style={{ color: BRAND.stone }} className="text-xs mt-2">{currentBooking?.name}</p>
              </div>

              <div className="p-4 rounded-lg" style={{ backgroundColor: BRAND.charcoal }}>
                <p style={{ color: BRAND.ivory }} className="font-bold text-sm">Piece Cards</p>
                <p style={{ color: BRAND.stone }} className="text-xs mt-2">{tableItems} pieces ready to print</p>
              </div>
            </div>

            <button
              onClick={() => {
                setPhase(2);
                setCurrentBooking(null);
                setTableItems(0);
              }}
              className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2"
              style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}
            >
              Next Booking →
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }
}
