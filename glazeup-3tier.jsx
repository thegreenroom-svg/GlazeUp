import React, { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

export default function GlazeUp3Tier() {
  const [phase, setPhase] = useState(1);
  const [bookings, setBookings] = useState([]);
  const [currentBooking, setCurrentBooking] = useState(null);
  const [tableItems, setTableItems] = useState(0);
  const [loading, setLoading] = useState(false);

  // Simulate API booking load
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
          max_tokens: 500,
          messages: [
            {
              role: 'user',
              content: 'Generate 5 realistic pottery studio bookings for today (names, times, table numbers, group sizes). Return as JSON array with fields: name, time, table, size.'
            }
          ]
        })
      });

      const data = await response.json();
      const text = data.content[0].text;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setBookings(parsed);
      }
    } catch (err) {
      console.error('Failed to load bookings:', err);
      setBookings([
        { name: 'Sarah & kids', time: '10:30', table: 'T1', size: 3 },
        { name: 'David (adult)', time: '14:00', table: 'L1', size: 1 },
        { name: 'The Johnsons', time: '15:30', table: 'T2', size: 4 }
      ]);
    }
    setLoading(false);
  };

  const handleNext = () => {
    if (phase === 1) {
      loadBookings();
      setPhase(2);
    } else if (phase === 2) {
      setPhase(3);
    } else {
      setPhase(2);
      setCurrentBooking(null);
      setTableItems(0);
    }
  };

  const selectBooking = (booking) => {
    setCurrentBooking(booking);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-2xl mx-auto">
        
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">GlazeUp Studio</h1>
          <p className="text-slate-400">Phase {phase} of 3</p>
          <div className="w-full bg-slate-700 h-1 rounded-full mt-4">
            <div 
              className="bg-gradient-to-r from-amber-500 to-orange-500 h-1 rounded-full transition-all"
              style={{ width: `${(phase / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* Phase 1: Daily Booking Load */}
        {phase === 1 && (
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 shadow-xl">
            <div className="text-center mb-8">
              <div className="inline-block p-4 bg-blue-500/20 rounded-lg mb-4">
                <span className="text-4xl">📋</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Daily Booking Load</h2>
              <p className="text-slate-400">Pull all bookings. Ready to work the floor.</p>
            </div>

            <div className="space-y-3 mb-8 p-4 bg-slate-700/50 rounded-lg">
              <p className="text-sm text-slate-300">✓ API pulls all bookings</p>
              <p className="text-sm text-slate-300">✓ Populates table picker</p>
              <p className="text-sm text-slate-300">✓ Customer search ready</p>
            </div>

            <button
              onClick={handleNext}
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? 'Loading bookings...' : 'Ready to work →'}
              {!loading && <ChevronRight size={20} />}
            </button>
          </div>
        )}

        {/* Phase 2: Table Workflow */}
        {phase === 2 && (
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 shadow-xl">
            <div className="text-center mb-8">
              <div className="inline-block p-4 bg-green-500/20 rounded-lg mb-4">
                <span className="text-4xl">🎨</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Table Workflow</h2>
              <p className="text-slate-400">Select table. Process booking. Record pieces.</p>
            </div>

            {!currentBooking ? (
              <div className="space-y-2 mb-8">
                <p className="text-sm text-slate-400 mb-4">Select a booking:</p>
                {bookings.map((booking, idx) => (
                  <button
                    key={idx}
                    onClick={() => selectBooking(booking)}
                    className="w-full text-left p-4 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors border border-slate-600"
                  >
                    <div className="font-bold text-white">{booking.name}</div>
                    <div className="text-sm text-slate-400">{booking.time} • Table {booking.table} • {booking.size} person{booking.size > 1 ? 's' : ''}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mb-8 p-4 bg-slate-700/50 rounded-lg">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-white">{currentBooking.name}</h3>
                  <p className="text-sm text-slate-400">{currentBooking.time} • Table {currentBooking.table}</p>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 p-3 bg-slate-600/50 rounded">
                    <span>📸</span>
                    <div>
                      <p className="text-sm font-semibold text-white">Photograph table</p>
                      <p className="text-xs text-slate-400">Capture room state + chalk tag</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-slate-600/50 rounded">
                    <span>🤖</span>
                    <div>
                      <p className="text-sm font-semibold text-white">AI reads chalk tag</p>
                      <p className="text-xs text-slate-400">OCR + booking match</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-slate-600/50 rounded">
                    <span>🎯</span>
                    <div>
                      <p className="text-sm font-semibold text-white">Add items</p>
                      <input
                        type="number"
                        min="0"
                        value={tableItems}
                        onChange={(e) => setTableItems(parseInt(e.target.value) || 0)}
                        placeholder="Pieces painted"
                        className="mt-1 w-full bg-slate-700 text-white px-2 py-1 rounded text-sm"
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setCurrentBooking(null)}
                  className="w-full text-left p-2 text-blue-400 hover:text-blue-300 text-sm mb-4"
                >
                  ← Change booking
                </button>
              </div>
            )}

            {currentBooking && (
              <button
                onClick={handleNext}
                className="w-full bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-all"
              >
                Done with table →
                <ChevronRight size={20} />
              </button>
            )}
          </div>
        )}

        {/* Phase 3: Finish & Hand-off */}
        {phase === 3 && (
          <div className="bg-slate-800 rounded-lg p-8 border border-slate-700 shadow-xl">
            <div className="text-center mb-8">
              <div className="inline-block p-4 bg-orange-500/20 rounded-lg mb-4">
                <span className="text-4xl">🖨️</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Finish & Hand-off</h2>
              <p className="text-slate-400">Print cards. Hand to customer. Log pieces.</p>
            </div>

            <div className="space-y-3 mb-8 p-4 bg-slate-700/50 rounded-lg">
              <div className="flex items-start gap-3 p-3 bg-slate-600/50 rounded">
                <span>📇</span>
                <div>
                  <p className="text-sm font-semibold text-white">Booking card</p>
                  <p className="text-xs text-slate-400">QR + name + time + day + seats</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-600/50 rounded">
                <span>🔖</span>
                <div>
                  <p className="text-sm font-semibold text-white">Piece cards</p>
                  <p className="text-xs text-slate-400">Per-piece QR code. {tableItems > 0 ? `${tableItems} cards` : 'No pieces logged'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-600/50 rounded">
                <span>📸</span>
                <div>
                  <p className="text-sm font-semibold text-white">Photo-finish OCR</p>
                  <p className="text-xs text-slate-400">Pieces flow to shelf search</p>
                </div>
              </div>
            </div>

            <button
              onClick={handleNext}
              className="w-full bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-all"
            >
              Next booking →
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
