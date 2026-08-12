/**
 * GlazeUp Studio Floor — Complete Integrated
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Seated bookings + Phase 3 Till + Phase 5 completion
 * Staff workflow: View active tables → tap table → Phase 3 Till → Phase 5 completion
 */

'use client';

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode.react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEATED BOOKINGS VIEW
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SeatedBookings({ onSelectBooking, bookings = [] }) {
  return (
    <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
      <h1 className="text-2xl font-bold">🪑 Active Tables</h1>
      <p className="text-sm text-sand">Tap a table to add drinks/items to their till</p>

      {bookings.length === 0 ? (
        <div className="p-6 text-center text-sand">
          <p>No bookings seated right now</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {bookings.map(booking => (
            <button
              key={booking.id}
              onClick={() => onSelectBooking(booking)}
              className="p-4 bg-clay rounded-lg text-left hover:bg-terracotta transition"
            >
              <div className="font-bold text-lg">Table {booking.tableNumber}</div>
              <div className="text-xs text-white/80">{booking.customerName}</div>
              <div className="text-xs text-white/80">👥 {booking.partySize}</div>
              <div className="text-xs mt-1 text-white/60">
                {booking.timeSeated ? `Seated ${booking.timeSeated}` : 'Just seated'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POTTERY BLANKS (from Phase 3)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const POTTERY_BLANKS = {
  mugs_cups: {
    name: 'Mugs And Cups',
    icon: '☕',
    items: [
      { id: 'mug-std', name: 'Standard Mug', price: 8.50 },
      { id: 'mug-tall', name: 'Tall Mug', price: 9.00 },
    ]
  },
  plates_platters: {
    name: 'Plates & Platters',
    icon: '🍽️',
    items: [
      { id: 'plate-side', name: 'Side Plate', price: 6.50 },
      { id: 'plate-dinner', name: 'Dinner Plate', price: 8.00 },
    ]
  },
  animal_bisque: {
    name: 'Animal Bisque',
    icon: '🐰',
    items: [
      { id: 'bunny', name: 'Bunny', price: 7.50 },
      { id: 'cat', name: 'Cat', price: 8.00 },
    ]
  },
  bowls: {
    name: 'Bowls',
    icon: '🥣',
    items: [
      { id: 'bowl-small', name: 'Small Bowl', price: 6.00 },
      { id: 'bowl-medium', name: 'Medium Bowl', price: 7.50 },
    ]
  },
  drinks: {
    name: 'Drinks & Food',
    icon: '☕',
    items: [
      { id: 'coffee', name: 'Coffee', price: 2.50 },
      { id: 'tea', name: 'Tea', price: 2.00 },
      { id: 'juice', name: 'Juice', price: 3.00 },
      { id: 'cake', name: 'Cake', price: 3.50 },
    ]
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 3 TILL — SIMPLIFIED (No split for running till)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Phase3Till({ booking, items, setItems, selectedCategory, setSelectedCategory, onComplete }) {
  if (selectedCategory) {
    return (
      <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
        <button onClick={() => setSelectedCategory(null)} className="text-sand">← Back</button>
        <h2 className="text-xl font-bold">{POTTERY_BLANKS[selectedCategory].name}</h2>
        <div className="space-y-2">
          {POTTERY_BLANKS[selectedCategory].items.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setItems([...items, { ...item, id: Math.random() }]);
                setSelectedCategory(null);
              }}
              className="w-full p-3 bg-clay rounded-lg text-left flex justify-between"
            >
              <span>{item.name}</span>
              <span className="font-bold">£{item.price.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const total = items.reduce((sum, i) => sum + i.price, 0);

  return (
    <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">{booking.customerName} — Till</h1>
        <div className="text-2xl font-bold text-terracotta">£{total.toFixed(2)}</div>
      </div>

      <div className="p-3 bg-clay rounded-lg">
        <p className="text-sm font-bold mb-2">Table {booking.tableNumber} • {booking.partySize} people</p>
        {items.length === 0 ? (
          <p className="text-xs text-white/60">No items yet</p>
        ) : (
          <div className="space-y-1">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm">
                <span>{item.name}</span>
                <span>£{item.price.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm text-sand">Add items</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(POTTERY_BLANKS).map(([key, category]) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              className="p-3 bg-clay rounded-lg text-center text-xs"
            >
              <div className="text-xl">{category.icon}</div>
              <div className="font-bold mt-1">{category.name}</div>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => onComplete('till')}
        className="w-full py-3 bg-terracotta rounded-lg font-bold text-white"
      >
        → Complete Till & Photograph
      </button>

      <button
        onClick={() => onComplete('seated')}
        className="w-full py-2 text-sand underline text-sm"
      >
        Back to Tables
      </button>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 5 COMPLETION (Photo + Payment)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Phase5Completion({ booking, items, onBack, onFinish }) {
  const [photoTaken, setPhotoTaken] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);

  const total = items.reduce((sum, i) => sum + i.price, 0);

  if (!photoTaken) {
    return (
      <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
        <h1 className="text-xl font-bold">Phase 4: Photograph Pieces</h1>
        <p className="text-sm text-sand mb-4">Take a clear photo of all finished pieces</p>

        <div className="p-6 bg-clay rounded-lg text-center space-y-4">
          <div className="text-4xl">📸</div>
          <p className="font-bold">Table {booking.tableNumber}</p>
          <p className="text-xs text-white/60">{booking.customerName}</p>
          <p className="text-xs text-white/60">{items.length} items total</p>

          <button
            onClick={() => setPhotoTaken(true)}
            className="w-full py-3 bg-terracotta rounded-lg font-bold mt-4"
          >
            ✓ Photo Taken
          </button>
        </div>

        <button
          onClick={onBack}
          className="w-full py-2 text-sand underline text-sm"
        >
          Back to Till
        </button>
      </div>
    );
  }

  if (!paymentMethod) {
    return (
      <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
        <h1 className="text-xl font-bold">Phase 5: Collect Payment</h1>

        <div className="p-4 bg-clay rounded-lg space-y-2">
          <p className="font-bold">Table {booking.tableNumber}</p>
          <p className="text-sm text-white/80">{booking.customerName}</p>
          <hr className="border-charcoal" />
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span>{item.name}</span>
              <span>£{item.price.toFixed(2)}</span>
            </div>
          ))}
          <hr className="border-charcoal" />
          <div className="flex justify-between font-bold text-lg">
            <span>Total</span>
            <span>£{total.toFixed(2)}</span>
          </div>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => setPaymentMethod('card')}
            className="w-full py-3 bg-clay rounded-lg font-bold"
          >
            💳 Card
          </button>
          <button
            onClick={() => setPaymentMethod('cash')}
            className="w-full py-3 bg-clay rounded-lg font-bold"
          >
            💵 Cash
          </button>
        </div>

        <button
          onClick={onBack}
          className="w-full py-2 text-sand underline text-sm"
        >
          Back to Photo
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
      <h1 className="text-xl font-bold">Complete!</h1>

      <div className="p-4 bg-cream text-charcoal rounded-lg space-y-3 border-2 border-clay">
        <div className="text-center font-bold text-lg">The Kiln Cafe</div>
        <hr className="border-clay" />
        <div>
          <div className="font-bold">{booking.customerName}</div>
          <div className="text-xs text-gray-600">Table {booking.tableNumber}</div>
        </div>
        <hr className="border-clay" />
        <div className="space-y-1">
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span>{item.name}</span>
              <span>£{item.price.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <hr className="border-clay" />
        <div className="flex justify-between font-bold text-lg">
          <span>Total</span>
          <span>£{total.toFixed(2)}</span>
        </div>
        <div className="text-xs text-center text-gray-600 mt-2">
          Payment: {paymentMethod === 'card' ? '💳 Card' : '💵 Cash'}
        </div>
        <hr className="border-clay" />
        <div className="flex justify-center py-3">
          <QRCode
            value={JSON.stringify({ table: booking.tableNumber, customer: booking.customerName, total, items: items.length })}
            size={100}
            level="H"
            fgColor="#8B5A3C"
            bgColor="#F5F1E8"
          />
        </div>
      </div>

      <button
        onClick={onFinish}
        className="w-full py-3 bg-terracotta rounded-lg font-bold text-white"
      >
        🎉 Finish & Next Table
      </button>

      <button
        onClick={() => window.print()}
        className="w-full py-2 border-2 border-sand rounded-lg font-medium"
      >
        🖨️ Print Receipt
      </button>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN FLOOR COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function StudioFloor({ studioId = 'fab8b2d2-27b5-47ec-8c56-268bbf821dc3' }) {
  const [view, setView] = useState('seated'); // 'seated', 'till', 'completion'
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Mock seated bookings
  const seatedBookings = [
    { id: 1, tableNumber: 1, customerName: 'Sarah Jones', partySize: 4, timeSeated: '14:30' },
    { id: 2, tableNumber: 2, customerName: 'Tom Wilson', partySize: 2, timeSeated: '14:45' },
    { id: 3, tableNumber: 3, customerName: 'Lucy Green', partySize: 6, timeSeated: '15:00' },
  ];

  const handleSelectBooking = (booking) => {
    setSelectedBooking(booking);
    setItems([]);
    setSelectedCategory(null);
    setView('till');
  };

  const handleComplete = (nextView) => {
    if (nextView === 'till') {
      setView('completion');
    } else {
      setView('seated');
    }
  };

  const handleFinish = () => {
    setView('seated');
    setSelectedBooking(null);
    setItems([]);
  };

  return (
    <div className="bg-charcoal text-white min-h-screen">
      {view === 'seated' && (
        <SeatedBookings
          bookings={seatedBookings}
          onSelectBooking={handleSelectBooking}
        />
      )}

      {view === 'till' && selectedBooking && (
        <Phase3Till
          booking={selectedBooking}
          items={items}
          setItems={setItems}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          onComplete={handleComplete}
        />
      )}

      {view === 'completion' && selectedBooking && (
        <Phase5Completion
          booking={selectedBooking}
          items={items}
          onBack={() => setView('till')}
          onFinish={handleFinish}
        />
      )}
    </div>
  );
}
