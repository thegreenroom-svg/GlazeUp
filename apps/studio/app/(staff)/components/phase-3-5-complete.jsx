/**
 * GlazeUp Phase 3 Till — CORRECTED
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Staff adds items (pottery blanks) AS CUSTOMERS ORDER THEM
 * Photos come LATER in Phase 4 for verification/tracking
 */

'use client';

import React, { useState, useMemo } from 'react';
import QRCode from 'qrcode.react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POTTERY BLANK CATEGORIES + PRICING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const POTTERY_BLANKS = {
  'mugs_cups': {
    name: 'Mugs And Cups',
    icon: '☕',
    items: [
      { id: 'mug-std', name: 'Standard Mug', price: 8.50 },
      { id: 'mug-tall', name: 'Tall Mug', price: 9.00 },
      { id: 'cup-small', name: 'Small Cup', price: 7.00 },
      { id: 'mug-handle', name: 'Two-Handle Mug', price: 10.00 }
    ]
  },
  'plates_platters': {
    name: 'Plates & Platters',
    icon: '🍽️',
    items: [
      { id: 'plate-side', name: 'Side Plate', price: 6.50 },
      { id: 'plate-dinner', name: 'Dinner Plate', price: 8.00 },
      { id: 'platter-rect', name: 'Rectangular Platter', price: 12.00 },
      { id: 'platter-oval', name: 'Oval Platter', price: 11.50 }
    ]
  },
  'animal_bisque': {
    name: 'Animal Bisque',
    icon: '🐰',
    items: [
      { id: 'bunny', name: 'Bunny', price: 7.50 },
      { id: 'cat', name: 'Cat', price: 8.00 },
      { id: 'dog', name: 'Dog', price: 8.00 },
      { id: 'pig', name: 'Pig', price: 7.50 }
    ]
  },
  'bowls': {
    name: 'Bowls & Pet Bowls',
    icon: '🥣',
    items: [
      { id: 'bowl-small', name: 'Small Bowl', price: 6.00 },
      { id: 'bowl-medium', name: 'Medium Bowl', price: 7.50 },
      { id: 'bowl-large', name: 'Large Bowl', price: 9.00 },
      { id: 'petbowl', name: 'Pet Bowl', price: 7.00 }
    ]
  },
  'kitchen': {
    name: 'Kitchen',
    icon: '🍳',
    items: [
      { id: 'salt-pepper', name: 'Salt & Pepper Set', price: 6.00 },
      { id: 'butter-dish', name: 'Butter Dish', price: 5.50 },
      { id: 'teapot', name: 'Teapot', price: 12.00 },
      { id: 'trivet', name: 'Trivet', price: 4.50 }
    ]
  },
  'vases': {
    name: 'Vases',
    icon: '🌸',
    items: [
      { id: 'vase-tall', name: 'Tall Vase', price: 10.00 },
      { id: 'vase-round', name: 'Round Vase', price: 9.00 },
      { id: 'vase-small', name: 'Small Vase', price: 6.00 },
      { id: 'bud-vase', name: 'Bud Vase', price: 5.00 }
    ]
  },
  'boxes': {
    name: 'Boxes',
    icon: '📦',
    items: [
      { id: 'box-small', name: 'Small Box', price: 5.50 },
      { id: 'box-medium', name: 'Medium Box', price: 7.00 },
      { id: 'box-large', name: 'Large Box', price: 8.50 }
    ]
  },
  'planters': {
    name: 'Planters',
    icon: '🪴',
    items: [
      { id: 'planter-small', name: 'Small Planter', price: 6.00 },
      { id: 'planter-medium', name: 'Medium Planter', price: 8.00 },
      { id: 'planter-large', name: 'Large Planter', price: 10.00 }
    ]
  },
  'jugs': {
    name: 'Jugs',
    icon: '⚱️',
    items: [
      { id: 'jug-small', name: 'Small Jug', price: 7.00 },
      { id: 'jug-medium', name: 'Medium Jug', price: 8.50 },
      { id: 'jug-large', name: 'Large Jug', price: 10.00 }
    ]
  },
  'monsters': {
    name: 'Monsters And Magic',
    icon: '👹',
    items: [
      { id: 'dragon', name: 'Dragon', price: 9.00 },
      { id: 'unicorn', name: 'Unicorn', price: 8.50 },
      { id: 'wizard', name: 'Wizard', price: 8.00 },
      { id: 'fairy', name: 'Fairy', price: 7.50 }
    ]
  },
  'bathroom': {
    name: 'Bathroom',
    icon: '🛁',
    items: [
      { id: 'soap-dish', name: 'Soap Dish', price: 5.00 },
      { id: 'toothbrush', name: 'Toothbrush Holder', price: 6.00 },
      { id: 'sponge-holder', name: 'Sponge Holder', price: 5.50 }
    ]
  },
  'money_banks': {
    name: 'Money Banks',
    icon: '🏦',
    items: [
      { id: 'bank-piggy', name: 'Piggy Bank', price: 7.00 },
      { id: 'bank-house', name: 'House Bank', price: 8.00 }
    ]
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POSTAL RATES (from previous build)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getTillPostalRate(postcode, weightGrams) {
  const zones = { 
    'E': 1, 'EC': 1, 'SW': 1, 'N': 1, 'NW': 1, 'SE': 1, 'W': 1, 'WC': 1,
    'BN': 2, 'PO': 2, 'GU': 2, 'SO': 2, 'SP': 2, 'B': 3, 'M': 3, 'G': 4
  };
  const zone = zones[postcode?.substring(0, 2).toUpperCase()] || 3;
  const rates = {
    1: { 1: 2.35, 2: 2.85, 5: 4.35 },
    2: { 1: 2.55, 2: 3.15, 5: 4.80 },
    3: { 1: 2.75, 2: 3.45, 5: 5.25 },
    4: { 1: 3.10, 2: 4.00, 5: 6.00 }
  };
  let bucket = 1;
  if (weightGrams > 2000) bucket = 5;
  else if (weightGrams > 1000) bucket = 2;
  return rates[bucket]?.[zone] || 2.75;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SPLIT BILL MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SplitBillModal({ onConfirm }) {
  const [step, setStep] = useState(1);
  const [splitBill, setSplitBill] = useState(false);
  const [names, setNames] = useState('');
  const [collectionMethod, setCollectionMethod] = useState(null);
  const [addresses, setAddresses] = useState({});

  const nameList = names.split('\n').filter(n => n.trim()).map(n => ({ id: n.trim(), name: n.trim() }));

  const handleConfirm = () => {
    if (!splitBill) {
      onConfirm({
        isSplit: false,
        people: [{ id: 'party', name: 'Party', collection: collectionMethod }]
      });
      return;
    }

    if (nameList.length === 0) {
      alert('Please enter at least one name');
      return;
    }

    const people = nameList.map(({ id, name }) => ({
      id,
      name,
      collection: collectionMethod,
      postalAddress: addresses[id] || ''
    }));

    onConfirm({ isSplit: true, people });
  };

  if (step === 1) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-end z-50">
        <div className="bg-charcoal w-full rounded-t-2xl p-6 space-y-4 text-white">
          <h2 className="text-lg font-bold">Will this table split the bill?</h2>
          <button onClick={() => { setSplitBill(false); setStep(2); }} className="w-full py-3 bg-clay rounded-lg font-medium">
            No, single bill
          </button>
          <button onClick={() => { setSplitBill(true); setStep(2); }} className="w-full py-3 bg-terracotta rounded-lg font-medium">
            Yes, split the bill
          </button>
        </div>
      </div>
    );
  }

  if (step === 2 && splitBill) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-end z-50">
        <div className="bg-charcoal w-full rounded-t-2xl p-6 space-y-4 text-white max-h-[80vh] overflow-y-auto">
          <h2 className="text-lg font-bold">Who's painting?</h2>
          <p className="text-sm text-sand">Enter one name per line</p>
          <textarea
            value={names}
            onChange={(e) => setNames(e.target.value)}
            placeholder="Sarah&#10;Tom&#10;Lucy"
            className="w-full p-3 border-2 border-sand rounded-lg font-mono text-sm text-charcoal"
            rows={4}
          />
          <button
            onClick={() => setStep(3)}
            disabled={nameList.length === 0}
            className="w-full py-3 bg-terracotta rounded-lg font-medium disabled:opacity-50"
          >
            Continue ({nameList.length} {nameList.length === 1 ? 'person' : 'people'})
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-charcoal w-full rounded-t-2xl p-6 space-y-4 text-white">
        <h2 className="text-lg font-bold">Collection options</h2>
        <div className="space-y-2">
          <button
            onClick={() => { setCollectionMethod('collection'); handleConfirm(); }}
            className="w-full py-4 rounded-lg font-medium bg-clay"
          >
            🏠 Collection in studio
          </button>
          <button
            onClick={() => { setCollectionMethod('postal'); setStep(4); }}
            className="w-full py-4 rounded-lg font-medium bg-clay"
          >
            📮 Postal
          </button>
          <button
            onClick={() => { setCollectionMethod('mixed'); setStep(5); }}
            className="w-full py-4 rounded-lg font-medium bg-clay"
          >
            🔀 Mixed
          </button>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 3 TILL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Phase3Till({ people, bookingCode, customerName }) {
  const [items, setItems] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(people[0]?.id);
  const [selectedCategory, setSelectedCategory] = useState(null);

  const addItem = (item) => {
    setItems([...items, { ...item, personId: selectedPerson, id: Math.random() }]);
  };

  const personTotals = useMemo(() => {
    const totals = {};
    people.forEach(p => {
      const personItems = items.filter(i => i.personId === p.id);
      const subtotal = personItems.reduce((sum, i) => sum + i.price, 0);
      const shipping = p.collection === 'postal' ? getTillPostalRate(p.postalAddress || 'TA', personItems.length * 500) : 0;
      totals[p.id] = { items: personItems, subtotal, shipping, total: subtotal + shipping };
    });
    return totals;
  }, [items, people]);

  if (selectedCategory) {
    return (
      <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen">
        <button onClick={() => setSelectedCategory(null)} className="text-sand">← Back</button>
        <h2 className="text-xl font-bold">{POTTERY_BLANKS[selectedCategory].name}</h2>
        <div className="space-y-2">
          {POTTERY_BLANKS[selectedCategory].items.map(item => (
            <button
              key={item.id}
              onClick={() => { addItem(item); setSelectedCategory(null); }}
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

  return (
    <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
      <h1 className="text-xl font-bold">{customerName} — Phase 3 Till</h1>

      {/* Person tabs */}
      <div className="grid grid-cols-2 gap-2">
        {people.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedPerson(p.id)}
            className={`p-3 rounded-lg ${selectedPerson === p.id ? 'bg-terracotta' : 'bg-clay'}`}
          >
            <div className="font-bold text-sm">{p.name}</div>
            <div className="text-xs">£{personTotals[p.id]?.total.toFixed(2)}</div>
          </button>
        ))}
      </div>

      {/* Item categories grid */}
      <div className="space-y-2">
        <p className="text-sm text-sand">Add items as {people.find(p => p.id === selectedPerson)?.name} orders</p>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(POTTERY_BLANKS).map(([key, category]) => (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              className="p-3 bg-clay rounded-lg text-center"
            >
              <div className="text-2xl">{category.icon}</div>
              <div className="text-xs font-bold mt-1">{category.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Items for selected person */}
      {items.filter(i => i.personId === selectedPerson).length > 0 && (
        <div className="p-3 bg-clay rounded-lg space-y-2">
          <p className="text-sm font-bold">Items for {people.find(p => p.id === selectedPerson)?.name}</p>
          {items.filter(i => i.personId === selectedPerson).map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span>{item.name}</span>
              <span>£{item.price.toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t border-charcoal pt-2 flex justify-between font-bold">
            <span>Total</span>
            <span>£{personTotals[selectedPerson]?.total.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 5 HAND-OFF
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Phase5Handoff({ people, items, bookingCode }) {
  const [selectedPerson, setSelectedPerson] = useState(people[0]?.id);

  const personData = useMemo(() => {
    const person = people.find(p => p.id === selectedPerson);
    const personItems = items.filter(i => i.personId === selectedPerson);
    const subtotal = personItems.reduce((sum, i) => sum + i.price, 0);
    const shipping = person.collection === 'postal' ? getTillPostalRate(person.postalAddress || 'TA', personItems.length * 500) : 0;
    return { person, items: personItems, subtotal, shipping, total: subtotal + shipping };
  }, [selectedPerson, people, items]);

  return (
    <div className="space-y-4 p-4 bg-charcoal text-white min-h-screen pb-20">
      <h1 className="text-xl font-bold">Hand-off Receipts</h1>

      {/* Person selector */}
      <div className="grid grid-cols-2 gap-2">
        {people.map(p => (
          <button
            key={p.id}
            onClick={() => setSelectedPerson(p.id)}
            className={`p-3 rounded-lg ${selectedPerson === p.id ? 'bg-terracotta' : 'bg-clay'}`}
          >
            <div className="font-bold text-sm">{p.name}</div>
            <div className="text-xs">£{items.filter(i => i.personId === p.id).reduce((s, i) => s + i.price, 0).toFixed(2)}</div>
          </button>
        ))}
      </div>

      {/* Receipt */}
      <div className="p-4 bg-cream text-charcoal rounded-lg space-y-3 border-2 border-clay">
        <div className="text-center font-bold text-lg">The Kiln Cafe</div>
        <hr className="border-clay" />
        <div>
          <div className="font-bold">{personData.person?.name}</div>
          <div className="text-sm">
            {personData.person?.collection === 'postal' ? '📮 Postal delivery' : '🏠 Collection'}
          </div>
          {personData.person?.postalAddress && <div className="text-xs text-gray-600">{personData.person.postalAddress}</div>}
        </div>
        <hr className="border-clay" />
        <div className="space-y-1">
          {personData.items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span>{item.name}</span>
              <span>£{item.price.toFixed(2)}</span>
            </div>
          ))}
        </div>
        {personData.shipping > 0 && (
          <>
            <hr className="border-sand" />
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Postal shipping</span>
              <span>£{personData.shipping.toFixed(2)}</span>
            </div>
          </>
        )}
        <hr className="border-clay" />
        <div className="flex justify-between font-bold text-lg">
          <span>Total</span>
          <span>£{personData.total.toFixed(2)}</span>
        </div>
        <hr className="border-clay" />
        <div className="flex justify-center py-4">
          <QRCode value={JSON.stringify({ booking: bookingCode, person: personData.person?.name, items: personData.items.length, total: personData.total })} size={128} level="H" fgColor="#8B5A3C" bgColor="#F5F1E8" />
        </div>
      </div>

      <button onClick={() => window.print()} className="w-full py-3 bg-clay rounded-lg font-bold">
        🖨️ Print {personData.person?.name}'s receipt
      </button>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN EXPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function Phase3Till5Handoff({ bookingCode = 'DEMO-001', customerName = 'Linda Wright' }) {
  const [phase, setPhase] = useState('modal');
  const [billConfig, setBillConfig] = useState(null);

  const handleSplitBill = (config) => {
    setBillConfig(config);
    setPhase('phase3');
  };

  if (phase === 'modal') {
    return <SplitBillModal onConfirm={handleSplitBill} />;
  }

  if (phase === 'phase3') {
    return <Phase3Till people={billConfig.people} bookingCode={bookingCode} customerName={customerName} />;
  }

  if (phase === 'phase5') {
    return <Phase5Handoff people={billConfig.people} items={[]} bookingCode={bookingCode} />;
  }
}
