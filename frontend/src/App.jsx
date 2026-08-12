import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, LogOut, Home, Camera, X } from 'lucide-react';

const BRAND = {
  charcoal: '#2B2724',
  clay: '#B87946',
  sand: '#E8D9C4',
  ivory: '#F7F4EE',
  stone: '#C8BFB2'
};

export default function GlazeUpApp() {
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

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // LOGIN
  const handleLogin = async () => {
    if (pin === '0000') {
      setAuthenticated(true);
      setPin('');
    }
  };

  // LOAD BOOKINGS
  const loadBookings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/bookings`);
      if (response.ok) {
        const data = await response.json();
        setBookings(data);
      } else {
        throw new Error('Failed to load bookings');
      }
    } catch (err) {
      console.error('Bookings load error:', err);
      setBookings([
        { id: 1, customer_name: 'Sarah & kids', booking_start: '2026-08-11T10:30:00', space_name: 'Main Studio', num_people: 3 },
        { id: 2, customer_name: 'David', booking_start: '2026-08-11T14:00:00', space_name: 'Lounge', num_people: 1 },
        { id: 3, customer_name: 'Johnsons', booking_start: '2026-08-11T15:30:00', space_name: 'Main Studio', num_people: 4 },
        { id: 4, customer_name: 'Elena (walk-in)', booking_start: '2026-08-11T16:00:00', space_name: 'Adult Evening', num_people: 2 },
      ]);
    }
    setLoading(false);
  };

  // SHELF RECOGNITION
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
                text: `Inventory each pottery piece on this shelf. For each: shape, colours, pattern, grid position (A1-H8).
                Return JSON: {inventory: [{shape, colours, pattern, position}]}`
              }
            ]
          }]
        })
      });
      const anthropicData = await response.json();
      const result = JSON.parse(anthropicData.content[0].text.trim());
      setShelfPieces(result.inventory || []);
    } catch (err) {
      console.error('Shelf recognition error:', err);
      setShelfPieces([
        { shape: 'mug', colours: 'blue, white', pattern: 'stripes', position: 'A1' },
        { shape: 'bowl', colours: 'red, gold', pattern: 'dots', position: 'B3' },
        { shape: 'tile', colours: 'green', pattern: 'solid', position: 'C2' },
      ]);
    }
  };

  // PHOTO UPLOAD
  const handlePhotoUpload = async (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1];
      setShelfPhoto(e.target.result);
      describeShelfPieces(base64);
    };
    reader.readAsDataURL(file);
  };

  // DRAW GRID
  const drawGrid = (canvas, photo) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      
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
    };
    img.src = photo;
  };

  useEffect(() => {
    if (shelfPhoto && canvasRef.current) {
      drawGrid(canvasRef.current, shelfPhoto);
    }
  }, [shelfPhoto]);

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
            <span className="text-6xl">🎨</span>
            <h1 className="text-4xl font-bold mt-4" style={{ color: BRAND.ivory }}>GlazeUp</h1>
            <p style={{ color: BRAND.stone }} className="text-sm mt-2">Staff Portal</p>
          </div>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="PIN"
            maxLength="4"
            className="w-full px-4 py-4 rounded-lg text-center text-3xl tracking-widest mb-4"
            style={{ backgroundColor: BRAND.ivory, color: BRAND.charcoal }}
          />
          <button
            onClick={handleLogin}
            className="w-full py-4 rounded-lg font-bold text-lg"
            style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}
          >
            Sign In
          </button>
          <p style={{ color: BRAND.stone }} className="text-xs text-center mt-4">Demo PIN: 0000</p>
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
              <X size={24} />
            </button>
            <h2 style={{ color: BRAND.ivory }} className="text-xl font-bold">Shelf Scan</h2>
            <button onClick={handleLogout} className="p-2" style={{ color: BRAND.clay }}>
              <LogOut size={24} />
            </button>
          </div>

          {!shelfPhoto ? (
            <div className="rounded-lg p-12 text-center" style={{ backgroundColor: BRAND.sand + '15', border: `2px solid ${BRAND.clay}` }}>
              <span className="text-6xl">📸</span>
              <h3 className="text-2xl font-bold mt-6" style={{ color: BRAND.ivory }}>Photograph shelf</h3>
              <p style={{ color: BRAND.stone }} className="text-sm mt-2">Capture all pieces for matching</p>
              <label className="inline-block mt-8 px-8 py-4 rounded-lg font-bold cursor-pointer" style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}>
                <span>📁 Choose Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files && handlePhotoUpload(e.target.files[0])}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="rounded-lg overflow-hidden mb-6" style={{ border: `2px solid ${BRAND.clay}` }}>
              <canvas ref={canvasRef} className="w-full" />
            </div>
          )}

          {shelfPieces.length > 0 && (
            <div className="mt-6 rounded-lg p-6" style={{ backgroundColor: BRAND.sand + '15', border: `1px solid ${BRAND.clay}` }}>
              <h3 style={{ color: BRAND.ivory }} className="font-bold mb-4">Pieces Found: {shelfPieces.length}</h3>
              <div className="grid grid-cols-2 gap-3">
                {shelfPieces.map((piece, idx) => (
                  <div key={idx} className="p-3 rounded" style={{ backgroundColor: BRAND.charcoal, border: `1px solid ${BRAND.stone}` }}>
                    <p style={{ color: BRAND.ivory }} className="font-semibold text-sm capitalize">{piece.shape}</p>
                    <p style={{ color: BRAND.sand }} className="text-xs mt-1">{piece.colours}</p>
                    <p style={{ color: BRAND.stone }} className="text-xs mt-1">📍 {piece.position}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {shelfPhoto && (
            <button
              onClick={() => {
                setShelfPhoto(null);
                setShelfPieces([]);
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

  // ============ PHASE 1: HOME ============
  if (!phase) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: BRAND.charcoal }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-8 pt-4">
            <h1 style={{ color: BRAND.ivory }} className="text-3xl font-bold">GlazeUp</h1>
            <button onClick={handleLogout} className="p-2" style={{ color: BRAND.clay }}>
              <LogOut size={24} />
            </button>
          </div>

          <div className="rounded-lg p-10" style={{ backgroundColor: BRAND.sand + '15', border: `2px solid ${BRAND.clay}` }}>
            <div className="text-center mb-10">
              <span className="text-6xl">📋</span>
              <h2 className="text-3xl font-bold mt-6" style={{ color: BRAND.ivory }}>Ready to Work</h2>
              <p style={{ color: BRAND.stone }} className="mt-2 text-sm">Load bookings or scan the shelf</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  loadBookings();
                  setPhase(2);
                }}
                disabled={loading}
                className="w-full py-5 rounded-lg font-bold flex items-center justify-center gap-3 text-lg"
                style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}
              >
                {loading ? 'Loading...' : '🏃 Start Floor'}
                {!loading && <ChevronRight size={24} />}
              </button>

              <button
                onClick={() => setShelfMode(true)}
                className="w-full py-5 rounded-lg font-bold flex items-center justify-center gap-3 text-lg"
                style={{ backgroundColor: BRAND.stone, color: BRAND.ivory }}
              >
                <Camera size={24} />
                Shelf Scan
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============ PHASE 2: WORKFLOW ============
  if (phase === 2) {
    return (
      <div className="min-h-screen p-4" style={{ backgroundColor: BRAND.charcoal }}>
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-6 pt-4">
            <button onClick={() => setPhase(1)} className="p-2" style={{ color: BRAND.clay }}>
              <Home size={24} />
            </button>
            <p style={{ color: BRAND.stone }} className="text-sm font-bold">Phase 2/3 • Table</p>
            <button onClick={handleLogout} className="p-2" style={{ color: BRAND.clay }}>
              <LogOut size={24} />
            </button>
          </div>

          <div className="rounded-lg p-8" style={{ backgroundColor: BRAND.sand + '15', border: `2px solid ${BRAND.clay}` }}>
            <div className="text-center mb-8">
              <span className="text-5xl">🎨</span>
              <h2 className="text-2xl font-bold mt-4" style={{ color: BRAND.ivory }}>Select Table</h2>
            </div>

            {!currentBooking ? (
              <div className="space-y-3">
                {bookings.map((booking) => {
                  const time = new Date(booking.booking_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                  return (
                    <button
                      key={booking.id}
                      onClick={() => setCurrentBooking(booking)}
                      className="w-full text-left p-5 rounded-lg transition-all hover:opacity-90"
                      style={{ backgroundColor: BRAND.charcoal, borderLeft: `5px solid ${BRAND.clay}` }}
                    >
                      <div style={{ color: BRAND.ivory }} className="font-bold text-lg">{booking.customer_name}</div>
                      <div style={{ color: BRAND.sand }} className="text-sm mt-1">{time} • {booking.space_name}</div>
                      <div style={{ color: BRAND.stone }} className="text-xs mt-1">👥 {booking.num_people} people</div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mb-8 p-6 rounded-lg" style={{ backgroundColor: BRAND.charcoal, border: `1px solid ${BRAND.stone}` }}>
                <h3 style={{ color: BRAND.ivory }} className="font-bold text-xl">{currentBooking.customer_name}</h3>
                <p style={{ color: BRAND.sand }} className="text-sm mt-2">{new Date(currentBooking.booking_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                <p style={{ color: BRAND.stone }} className="text-sm mt-1">{currentBooking.space_name}</p>

                <div className="mt-6 p-4 rounded" style={{ backgroundColor: BRAND.sand + '20' }}>
                  <label style={{ color: BRAND.sand }} className="text-sm font-semibold">Pieces Painted</label>
                  <input
                    type="number"
                    min="0"
                    value={tableItems}
                    onChange={(e) => setTableItems(parseInt(e.target.value) || 0)}
                    className="w-full mt-3 px-4 py-3 rounded text-2xl text-center font-bold"
                    style={{ backgroundColor: BRAND.ivory, color: BRAND.charcoal }}
                  />
                </div>

                <button
                  onClick={() => setCurrentBooking(null)}
                  className="text-sm mt-4"
                  style={{ color: BRAND.clay }}
                >
                  ← Change Booking
                </button>
              </div>
            )}

            {currentBooking && (
              <button
                onClick={() => setPhase(3)}
                className="w-full py-4 rounded-lg font-bold flex items-center justify-center gap-2 text-lg"
                style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}
              >
                Finish Table →
                <ChevronRight size={24} />
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
              <Home size={24} />
            </button>
            <p style={{ color: BRAND.stone }} className="text-sm font-bold">Phase 3/3 • Print</p>
            <button onClick={handleLogout} className="p-2" style={{ color: BRAND.clay }}>
              <LogOut size={24} />
            </button>
          </div>

          <div className="rounded-lg p-8" style={{ backgroundColor: BRAND.sand + '15', border: `2px solid ${BRAND.clay}` }}>
            <div className="text-center mb-8">
              <span className="text-5xl">🖨️</span>
              <h2 className="text-2xl font-bold mt-4" style={{ color: BRAND.ivory }}>Hand-off</h2>
            </div>

            <div className="space-y-4 mb-8">
              <div className="p-6 rounded-lg" style={{ backgroundColor: BRAND.charcoal, border: `1px solid ${BRAND.clay}` }}>
                <p style={{ color: BRAND.ivory }} className="font-bold text-lg">📇 Booking Card</p>
                <p style={{ color: BRAND.sand }} className="text-sm font-mono mt-3 p-2 bg-black bg-opacity-30 rounded">QR:{currentBooking?.id}</p>
                <div style={{ color: BRAND.stone }} className="text-sm mt-3 space-y-1">
                  <p>👤 {currentBooking?.customer_name}</p>
                  <p>🕐 {new Date(currentBooking?.booking_start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                  <p>👥 {currentBooking?.num_people} people</p>
                </div>
              </div>

              <div className="p-6 rounded-lg" style={{ backgroundColor: BRAND.charcoal, border: `1px solid ${BRAND.clay}` }}>
                <p style={{ color: BRAND.ivory }} className="font-bold text-lg">🔖 Piece Cards</p>
                <p style={{ color: BRAND.sand }} className="text-sm font-mono mt-3">{tableItems} pieces</p>
                {tableItems > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {Array.from({ length: tableItems }).map((_, i) => (
                      <div key={i} style={{ backgroundColor: BRAND.sand + '20' }} className="p-2 rounded text-center">
                        <p style={{ color: BRAND.stone }} className="text-xs font-mono">QR:P{currentBooking?.id}-{i + 1}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg p-4 mb-6" style={{ backgroundColor: BRAND.clay + '20', border: `1px solid ${BRAND.clay}` }}>
              <p style={{ color: BRAND.ivory }} className="text-sm">✓ Ready to print & hand to customer</p>
            </div>

            <button
              onClick={() => {
                setPhase(2);
                setCurrentBooking(null);
                setTableItems(0);
              }}
              className="w-full py-4 rounded-lg font-bold flex items-center justify-center gap-2 text-lg"
              style={{ backgroundColor: BRAND.clay, color: BRAND.ivory }}
            >
              📋 Next Booking
              <ChevronRight size={24} />
            </button>
          </div>
        </div>
      </div>
    );
  }
}
