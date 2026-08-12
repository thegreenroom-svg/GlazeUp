/**
 * GlazeUp Studio Floor — Complete Final
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Seated bookings quick access + Phase 3 Till + Phase 5 completion
 * With nudges integrated, running totals, Square integration ready
 */

'use client';

import React, { useState } from 'react';
import QRCode from 'qrcode.react';
import { NudgeCard, HelpButton, HelpPanel } from '@/lib/nudge-system-global';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DASHBOARD — START VIEW
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Dashboard({ onViewSeated }) {
  const todayRevenue = 156.50;
  const activeBookings = 3;

  return (
    <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Studio Dashboard</h1>
        <HelpButton />
      </div>

      <div className="space-y-2">
        <div className="p-4 bg-clay rounded-lg">
          <p className="text-sm text-white/80">Today's Revenue</p>
          <p className="text-3xl font-bold">£{todayRevenue.toFixed(2)}</p>
        </div>

        <div className="p-4 bg-clay rounded-lg">
          <p className="text-sm text-white/80">Active Tables</p>
          <p className="text-3xl font-bold">{activeBookings}</p>
        </div>
      </div>

      <button
        onClick={onViewSeated}
        className="w-full py-4 bg-terracotta rounded-lg font-bold text-lg text-white mt-6"
      >
        🪑 Seated Bookings
      </button>

      <NudgeCard nudgeId="floor_start" />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SEATED BOOKINGS VIEW
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SeatedBookings({ onSelectBooking, onBack, bookings = [] }) {
  return (
    <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">🪑 Active Tables</h1>
        <button onClick={onBack} className="text-sand text-sm">Back</button>
      </div>

      <p className="text-sm text-sand">Tap a table to add items to their till</p>

      {bookings.length === 0 ? (
        <div className="p-6 text-center text-sand">No active tables</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {bookings.map(booking => (
            <button
              key={booking.id}
              onClick={() => onSelectBooking(booking)}
              className="p-4 bg-clay rounded-lg text-left hover:bg-terracotta transition"
            >
              <div className="font-bold text-lg">#{booking.tableNumber}</div>
              <div className="text-xs text-white/80">{booking.customerName}</div>
              <div className="text-xs text-white/80">👥 {booking.partySize}</div>
              <div className="text-xs mt-2 text-terracotta font-bold">£{booking.runningTotal.toFixed(2)}</div>
            </button>
          ))}
        </div>
      )}

      <NudgeCard nudgeId="floor_booking" />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POTTERY BLANKS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const POTTERY_BLANKS = {
  mugs_cups: {
    name: 'Mugs And Cups',
    icon: '☕',
    items: [
      { id: 'mug-std', name: 'Standard Mug', price: 8.50, weight: 600 },
      { id: 'mug-tall', name: 'Tall Mug', price: 9.00, weight: 650 },
      { id: 'cup-small', name: 'Small Cup', price: 7.00, weight: 400 },
    ]
  },
  plates_platters: {
    name: 'Plates & Platters',
    icon: '🍽️',
    items: [
      { id: 'plate-side', name: 'Side Plate', price: 6.50, weight: 350 },
      { id: 'plate-dinner', name: 'Dinner Plate', price: 8.00, weight: 500 },
    ]
  },
  animal_bisque: {
    name: 'Animal Bisque',
    icon: '🐰',
    items: [
      { id: 'bunny', name: 'Bunny', price: 7.50, weight: 300 },
      { id: 'cat', name: 'Cat', price: 8.00, weight: 350 },
    ]
  },
  bowls: {
    name: 'Bowls',
    icon: '🥣',
    items: [
      { id: 'bowl-small', name: 'Small Bowl', price: 6.00, weight: 250 },
      { id: 'bowl-medium', name: 'Medium Bowl', price: 7.50, weight: 400 },
    ]
  },
  drinks: {
    name: 'Drinks & Food',
    icon: '☕',
    items: [
      { id: 'coffee', name: 'Coffee', price: 2.50, weight: 0 },
      { id: 'tea', name: 'Tea', price: 2.00, weight: 0 },
      { id: 'cake', name: 'Cake', price: 3.50, weight: 0 },
    ]
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 3 TILL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Phase3Till({ booking, items, setItems, selectedCategory, setSelectedCategory, onComplete, onBack }) {
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
        <NudgeCard nudgeId="phase3_add" />
      </div>
    );
  }

  const total = items.reduce((sum, i) => sum + i.price, 0);

  return (
    <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-bold">{booking.customerName}</h1>
        <div className="text-2xl font-bold text-terracotta">£{total.toFixed(2)}</div>
      </div>

      <div className="p-3 bg-clay rounded-lg">
        <p className="text-xs font-bold">Table {booking.tableNumber} • {booking.partySize} people</p>
        {items.length === 0 ? (
          <p className="text-xs text-white/60 mt-2">No items yet</p>
        ) : (
          <div className="space-y-1 mt-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs">
                <span>{item.name}</span>
                <span>£{item.price.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-sand font-bold">Add items</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(POTTERY_BLANKS).map(([key, category]) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              className="p-3 bg-clay rounded-lg text-center text-xs"
            >
              <div className="text-lg">{category.icon}</div>
              <div className="font-bold mt-1 text-xs">{category.name}</div>
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => onComplete('till')}
        className="w-full py-3 bg-terracotta rounded-lg font-bold text-white"
      >
        ✓ Complete & Photo
      </button>

      <button onClick={onBack} className="w-full py-2 text-sand underline text-sm">
        ← Back to Tables
      </button>

      <NudgeCard nudgeId="phase3_category" />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 4 PHOTO + PHASE 5 COMPLETION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Phase4Photo({ booking, items, onPhotoTaken, onBack }) {
  return (
    <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
      <h1 className="text-xl font-bold">📸 Photograph Pieces</h1>
      <p className="text-sm text-sand">Take clear photo of all {items.length} items</p>

      <div className="p-6 bg-clay rounded-lg text-center space-y-4">
        <div className="text-6xl">📷</div>
        <p className="font-bold">Table {booking.tableNumber}</p>
        <p className="text-xs text-white/60">{items.length} items</p>

        <button
          onClick={onPhotoTaken}
          className="w-full py-3 bg-terracotta rounded-lg font-bold mt-4"
        >
          ✓ Photo Taken
        </button>
      </div>

      <button onClick={onBack} className="w-full py-2 text-sand underline text-sm">
        ← Back to Till
      </button>

      <NudgeCard nudgeId="phase4_photo" />
    </div>
  );
}

function Phase5Completion({ booking, items, onFinish, onBack }) {
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [splitBill, setSplitBill] = useState(false);

  const total = items.reduce((sum, i) => sum + i.price, 0);
  const totalWeight = items.reduce((sum, i) => sum + (i.weight || 0), 0);

  // Mock postal rate
  const postalRate = totalWeight > 500 ? 5.25 : 2.75;

  if (!paymentMethod) {
    return (
      <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
        <h1 className="text-xl font-bold">Payment & Collection</h1>

        <div className="space-y-3">
          <div className="p-3 bg-clay rounded-lg">
            <p className="text-xs font-bold">Table {booking.tableNumber}</p>
            <p className="text-xs text-white/80">{booking.customerName}</p>
            <hr className="border-charcoal my-2" />
            {items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs mb-1">
                <span>{item.name}</span>
                <span>£{item.price.toFixed(2)}</span>
              </div>
            ))}
            <hr className="border-charcoal my-2" />
            <div className="flex justify-between font-bold">
              <span>Subtotal</span>
              <span>£{total.toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold">Collection</p>
            <button
              onClick={() => setSplitBill(false)}
              className={`w-full py-2 rounded-lg text-xs font-medium ${splitBill ? 'bg-clay' : 'bg-terracotta'}`}
            >
              🏠 Collection in studio
            </button>
            <button
              onClick={() => setSplitBill(true)}
              className={`w-full py-2 rounded-lg text-xs font-medium ${splitBill ? 'bg-terracotta' : 'bg-clay'}`}
            >
              📮 Postal (£{postalRate.toFixed(2)})
            </button>
          </div>

          <div className="p-3 bg-clay rounded-lg">
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>£{(total + (splitBill ? postalRate : 0)).toFixed(2)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold">Payment</p>
            <button
              onClick={() => setPaymentMethod('card')}
              className="w-full py-3 bg-clay rounded-lg font-bold text-sm"
            >
              💳 Card (Square)
            </button>
            <button
              onClick={() => setPaymentMethod('cash')}
              className="w-full py-3 bg-clay rounded-lg font-bold text-sm"
            >
              💵 Cash
            </button>
          </div>
        </div>

        <button onClick={onBack} className="w-full py-2 text-sand underline text-sm">
          ← Back to Photo
        </button>

        <NudgeCard nudgeId="phase5_receipt" />
      </div>
    );
  }

  const finalTotal = total + (splitBill ? postalRate : 0);

  return (
    <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
      <h1 className="text-xl font-bold">✅ Complete</h1>

      <div className="p-4 bg-cream text-charcoal rounded-lg space-y-2 border-2 border-clay">
        <div className="text-center font-bold">The Kiln Cafe</div>
        <hr className="border-clay" />
        <div>
          <div className="font-bold text-sm">{booking.customerName}</div>
          <div className="text-xs text-gray-600">Table {booking.tableNumber}</div>
        </div>
        <hr className="border-clay" />
        <div className="space-y-1">
          {items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-xs">
              <span>{item.name}</span>
              <span>£{item.price.toFixed(2)}</span>
            </div>
          ))}
        </div>
        {splitBill && (
          <>
            <hr className="border-sand" />
            <div className="flex justify-between text-xs">
              <span>📮 Postal</span>
              <span>£{postalRate.toFixed(2)}</span>
            </div>
          </>
        )}
        <hr className="border-clay" />
        <div className="flex justify-between font-bold text-sm">
          <span>Total</span>
          <span>£{finalTotal.toFixed(2)}</span>
        </div>
        <div className="text-xs text-center text-gray-600 mt-2">
          {paymentMethod === 'card' ? '💳 Card' : '💵 Cash'} • {splitBill ? '📮 Postal' : '🏠 Collection'}
        </div>
        <hr className="border-clay" />
        <div className="flex justify-center py-3">
          <QRCode
            value={JSON.stringify({ table: booking.tableNumber, customer: booking.customerName, total: finalTotal, items: items.length, collection: splitBill ? 'postal' : 'collection' })}
            size={100}
            level="H"
            fgColor="#8B5A3C"
            bgColor="#F5F1E8"
          />
        </div>
      </div>

      <button
        onClick={() => window.print()}
        className="w-full py-2 border-2 border-sand rounded-lg font-medium text-sm"
      >
        🖨️ Print Receipt
      </button>

      <button
        onClick={onFinish}
        className="w-full py-3 bg-terracotta rounded-lg font-bold"
      >
        🎉 Finish & Next Table
      </button>

      <NudgeCard nudgeId="phase5_print" />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN FLOOR COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function StudioFloor() {
  const [view, setView] = useState('dashboard');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const [seatedBookings, setSeatedBookings] = useState([
    { id: 1, tableNumber: 1, customerName: 'Sarah Jones', partySize: 4, runningTotal: 0 },
    { id: 2, tableNumber: 2, customerName: 'Tom Wilson', partySize: 2, runningTotal: 12.50 },
    { id: 3, tableNumber: 3, customerName: 'Lucy Green', partySize: 6, runningTotal: 28.75 },
  ]);

  const handleSelectBooking = (booking) => {
    setSelectedBooking(booking);
    setItems([]);
    setSelectedCategory(null);
    setView('till');
  };

  const handleComplete = (nextView) => {
    if (nextView === 'till') {
      setView('photo');
    }
  };

  const handlePhotoTaken = () => {
    setView('completion');
  };

  const handleFinish = () => {
    setView('seated');
    setSelectedBooking(null);
    setItems([]);
  };

  return (
    <div className="bg-charcoal text-white min-h-screen">
      <HelpPanel
        nudgeIds={['floor_start', 'floor_booking', 'phase3_split', 'phase3_category', 'phase3_add', 'phase4_photo', 'phase5_receipt', 'phase5_print']}
        title="Studio Floor Workflow"
      />

      {view === 'dashboard' && (
        <Dashboard onViewSeated={() => setView('seated')} />
      )}

      {view === 'seated' && (
        <SeatedBookings
          bookings={seatedBookings}
          onSelectBooking={handleSelectBooking}
          onBack={() => setView('dashboard')}
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
          onBack={() => setView('seated')}
        />
      )}

      {view === 'photo' && selectedBooking && (
        <Phase4Photo
          booking={selectedBooking}
          items={items}
          onPhotoTaken={handlePhotoTaken}
          onBack={() => setView('till')}
        />
      )}

      {view === 'completion' && selectedBooking && (
        <Phase5Completion
          booking={selectedBooking}
          items={items}
          onFinish={handleFinish}
          onBack={() => setView('photo')}
        />
      )}
    </div>
  );
}
