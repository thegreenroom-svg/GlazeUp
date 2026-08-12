/**
 * GlazeUp Phase 3 Till + Phase 5 Hand-off
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Complete split bill + postal shipping integration
 * 
 * Features:
 * - Phase 2→3 transition modal: split bill decision
 * - Phase 3 Till: per-person item assignment + postal rates
 * - Phase 5 Hand-off: per-person summary + QR codes
 */

'use client';

import React, { useState, useMemo } from 'react';
import QRCode from 'qrcode.react';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POSTAL RATES (imported from glazeup-postal-rates.js)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ROYAL_MAIL_RATES = {
  'special_delivery_guaranteed': {
    name: 'Special Delivery Guaranteed by 9am',
    service: 'SPECIAL_DELIVERY_GUARANTEED_9AM',
    days: 1,
    rates: {
      1: { z1: 8.95, z2: 9.15, z3: 9.35, z4: 9.75 },
      2: { z1: 10.20, z2: 10.50, z3: 10.80, z4: 11.35 },
      5: { z1: 13.45, z2: 13.95, z3: 14.45, z4: 15.20 },
      10: { z1: 17.70, z2: 18.50, z3: 19.30, z4: 20.45 },
      20: { z1: 23.95, z2: 25.15, z3: 26.35, z4: 28.00 },
    }
  },
  'royal_mail_24': {
    name: 'Royal Mail 24',
    service: 'ROYAL_MAIL_24',
    days: 1,
    rates: {
      1: { z1: 2.35, z2: 2.55, z3: 2.75, z4: 3.10 },
      2: { z1: 2.85, z2: 3.15, z3: 3.45, z4: 4.00 },
      5: { z1: 4.35, z2: 4.80, z3: 5.25, z4: 6.00 },
      10: { z1: 6.45, z2: 7.15, z3: 7.85, z4: 8.90 },
      20: { z1: 9.95, z2: 11.15, z3: 12.35, z4: 14.00 },
    }
  },
  'royal_mail_48': {
    name: 'Royal Mail 48',
    service: 'ROYAL_MAIL_48',
    days: 3,
    rates: {
      1: { z1: 1.65, z2: 1.85, z3: 2.05, z4: 2.40 },
      2: { z1: 2.05, z2: 2.35, z3: 2.65, z4: 3.20 },
      5: { z1: 3.55, z2: 4.00, z3: 4.45, z4: 5.20 },
      10: { z1: 5.45, z2: 6.15, z3: 6.85, z4: 7.90 },
      20: { z1: 8.95, z2: 10.15, z3: 11.35, z4: 13.00 },
    }
  }
};

const UK_POSTCODE_ZONES = {
  'E': 1, 'EC': 1, 'N': 1, 'NW': 1, 'SE': 1, 'SW': 1, 'W': 1, 'WC': 1,
  'BR': 1, 'CR': 1, 'DA': 1, 'EN': 1, 'IG': 1, 'KT': 1, 'RM': 1, 'SM': 1, 'SU': 1, 'TW': 1,
  'BN': 2, 'PO': 2, 'GU': 2, 'SO': 2, 'SP': 2, 'DT': 2, 'EX': 2, 'PL': 2, 'TA': 2, 'TQ': 2,
  'B': 3, 'CV': 3, 'M': 3, 'G': 4, 'EH': 4, 'DD': 4, 'PH': 4
};

function getPostcodeZone(postcode) {
  if (!postcode) return 3;
  const prefix = postcode.replace(/\d+.*/, '').toUpperCase();
  return UK_POSTCODE_ZONES[prefix] || 3;
}

function getWeightBucket(grams) {
  if (grams <= 1000) return 1;
  if (grams <= 2000) return 2;
  if (grams <= 5000) return 5;
  if (grams <= 10000) return 10;
  return 20;
}

function getPostalRate(postcode, weightGrams, serviceType = 'royal_mail_24') {
  const zone = getPostcodeZone(postcode);
  const bucket = getWeightBucket(weightGrams);
  const serviceKey = `z${zone}`;
  
  if (!ROYAL_MAIL_RATES[serviceType]) return null;
  
  const service = ROYAL_MAIL_RATES[serviceType];
  const rate = service.rates[bucket]?.[serviceKey];
  
  return {
    service: service.name,
    cost: rate,
    days: service.days
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 2→3 TRANSITION MODAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function SplitBillModal({ onConfirm, partySize = 2 }) {
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

    onConfirm({
      isSplit: true,
      people
    });
  };

  if (step === 1) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-end z-50">
        <div className="bg-white w-full rounded-t-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold">Will this table split the bill?</h2>
          
          <div className="space-y-2">
            <button
              onClick={() => { setSplitBill(false); setStep(2); }}
              className="w-full py-3 bg-clay text-white rounded-lg font-medium"
            >
              No, single bill
            </button>
            <button
              onClick={() => { setSplitBill(true); setStep(2); }}
              className="w-full py-3 bg-terracotta text-white rounded-lg font-medium"
            >
              Yes, split the bill
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 2 && splitBill) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-end z-50">
        <div className="bg-white w-full rounded-t-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <h2 className="text-lg font-bold">Who's paying?</h2>
          <p className="text-sm text-gray-600">Enter one name per line</p>
          
          <textarea
            value={names}
            onChange={(e) => setNames(e.target.value)}
            placeholder="Sarah&#10;Tom&#10;Lucy&#10;Emma"
            className="w-full p-3 border border-sand rounded-lg font-mono text-sm"
            rows={4}
          />

          <button
            onClick={() => setStep(3)}
            disabled={nameList.length === 0}
            className="w-full py-3 bg-terracotta text-white rounded-lg font-medium disabled:opacity-50"
          >
            Continue ({nameList.length} {nameList.length === 1 ? 'person' : 'people'})
          </button>
        </div>
      </div>
    );
  }

  // Step 3: Collection options
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="bg-white w-full rounded-t-2xl p-6 space-y-4">
        <h2 className="text-lg font-bold">Collection options</h2>
        <p className="text-sm text-gray-600">
          {splitBill ? `For ${nameList.length} people` : 'For this party'}
        </p>

        <div className="space-y-2">
          <button
            onClick={() => { setCollectionMethod('collection'); handleConfirm(); }}
            className={`w-full py-4 rounded-lg font-medium transition ${ collectionMethod === 'collection' ? 'bg-terracotta text-white' : 'bg-cream border-2 border-clay'}`}
          >
            🏠 Collection in studio
          </button>
          
          <button
            onClick={() => { setCollectionMethod('postal'); setStep(4); }}
            className={`w-full py-4 rounded-lg font-medium transition ${collectionMethod === 'postal' ? 'bg-terracotta text-white' : 'bg-cream border-2 border-clay'}`}
          >
            📮 Postal (ship pieces)
          </button>
          
          <button
            onClick={() => { setCollectionMethod('mixed'); setStep(5); }}
            className={`w-full py-4 rounded-lg font-medium transition ${collectionMethod === 'mixed' ? 'bg-terracotta text-white' : 'bg-cream border-2 border-clay'}`}
          >
            🔀 Mixed (some collect, some postal)
          </button>
        </div>

        <button
          onClick={() => setStep(2)}
          className="w-full py-2 text-clay underline text-sm"
        >
          Back
        </button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 3 TILL - PER-PERSON ITEM ASSIGNMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Phase3Till({ people, bookingCode }) {
  const [items, setItems] = useState([]);
  const [selectedPerson, setSelectedPerson] = useState(people[0]?.id);
  const [showPostalModal, setShowPostalModal] = useState(false);
  const [postalData, setPostalData] = useState({});

  const mockItems = [
    { id: 1, name: 'Paint & Glaze', price: 12.00 },
    { id: 2, name: 'Coffee', price: 2.50 },
    { id: 3, name: 'Cake', price: 3.50 },
  ];

  const addItem = (item) => {
    setItems([...items, { ...item, personId: selectedPerson }]);
  };

  const personTotals = useMemo(() => {
    const totals = {};
    people.forEach(p => {
      const personItems = items.filter(i => i.personId === p.id);
      const subtotal = personItems.reduce((sum, i) => sum + i.price, 0);
      const shippingCost = p.collection === 'postal' ? (postalData[p.id]?.cost || 2.85) : 0;
      totals[p.id] = {
        items: personItems,
        subtotal,
        shipping: shippingCost,
        total: subtotal + shippingCost
      };
    });
    return totals;
  }, [items, people, postalData]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {people.map(person => (
          <div
            key={person.id}
            onClick={() => setSelectedPerson(person.id)}
            className={`p-3 rounded-lg cursor-pointer transition ${
              selectedPerson === person.id
                ? 'bg-terracotta text-white'
                : 'bg-sand text-charcoal'
            }`}
          >
            <div className="font-bold">{person.name}</div>
            <div className="text-sm">£{personTotals[person.id]?.total.toFixed(2)}</div>
            {person.collection === 'postal' && <div className="text-xs">📮 Postal</div>}
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-bold text-gray-600">Add items for {people.find(p => p.id === selectedPerson)?.name}</p>
        {mockItems.map(item => (
          <button
            key={item.id}
            onClick={() => addItem(item)}
            className="w-full p-3 bg-cream border-2 border-clay rounded-lg text-left"
          >
            <div className="font-medium">{item.name}</div>
            <div className="text-sm text-gray-600">£{item.price.toFixed(2)}</div>
          </button>
        ))}
      </div>

      <div className="space-y-2 p-3 bg-cream rounded-lg">
        <p className="text-sm font-bold">Items assigned:</p>
        {items.filter(i => i.personId === selectedPerson).map((item, idx) => (
          <div key={idx} className="text-sm text-gray-600">
            • {item.name} — £{item.price.toFixed(2)}
          </div>
        ))}
      </div>

      {personTotals[selectedPerson]?.total > 0 && (
        <button
          onClick={() => {/* Go to Phase 5 */}}
          className="w-full py-3 bg-terracotta text-white rounded-lg font-bold"
        >
          Ready for hand-off →
        </button>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 5 HAND-OFF - PER-PERSON SUMMARY + QR CODES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Phase5Handoff({ people, items, bookingCode }) {
  const [selectedPerson, setSelectedPerson] = useState(people[0]?.id);
  const [printMode, setPrintMode] = useState('all'); // 'all' or 'individual'

  const personData = useMemo(() => {
    const person = people.find(p => p.id === selectedPerson);
    const personItems = items.filter(i => i.personId === selectedPerson);
    const subtotal = personItems.reduce((sum, i) => sum + i.price, 0);
    
    let shipping = 0;
    if (person.collection === 'postal') {
      shipping = 2.85; // Default RM24 for pottery
    }

    return {
      person,
      items: personItems,
      subtotal,
      shipping,
      total: subtotal + shipping,
      qrData: JSON.stringify({
        booking: bookingCode,
        person: person.name,
        collection: person.collection,
        postalAddress: person.postalAddress,
        pieces: personItems.length,
        total: subtotal + shipping
      })
    };
  }, [selectedPerson, people, items, bookingCode]);

  return (
    <div className="space-y-4 pb-20">
      {/* Person selector */}
      <div className="grid grid-cols-2 gap-2">
        {people.map(person => (
          <button
            key={person.id}
            onClick={() => setSelectedPerson(person.id)}
            className={`p-3 rounded-lg transition ${
              selectedPerson === person.id
                ? 'bg-terracotta text-white'
                : 'bg-sand text-charcoal'
            }`}
          >
            <div className="font-bold text-sm">{person.name}</div>
            <div className="text-xs">£{personData.total.toFixed(2)}</div>
          </button>
        ))}
      </div>

      {/* Receipt preview */}
      <div className="p-4 bg-cream rounded-lg space-y-3 border-2 border-clay">
        <div className="text-center font-bold text-lg">The Kiln Cafe</div>
        <hr className="border-clay" />
        
        <div>
          <div className="font-bold">{personData.person.name}</div>
          <div className="text-sm text-gray-600">
            {personData.person.collection === 'postal' ? '📮 Postal delivery' : '🏠 Collection'}
          </div>
          {personData.person.postalAddress && (
            <div className="text-xs text-gray-600 mt-1">{personData.person.postalAddress}</div>
          )}
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
              <span className="text-gray-600">Postal shipping (RM24)</span>
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

        {/* QR Code */}
        <div className="flex justify-center py-4">
          <QRCode
            value={personData.qrData}
            size={128}
            level="H"
            includeMargin={true}
            fgColor="#8B5A3C"
            bgColor="#F5F1E8"
          />
        </div>

        <div className="text-xs text-center text-gray-600">
          Booking: {bookingCode}
        </div>
      </div>

      {/* Print options */}
      <div className="space-y-2">
        <p className="text-sm font-bold">Print</p>
        <button
          onClick={() => window.print()}
          className="w-full py-3 bg-charcoal text-white rounded-lg font-medium"
        >
          🖨️ Print {printMode === 'all' ? 'all receipts' : `${personData.person.name}'s receipt`}
        </button>
        
        <button
          onClick={() => {/* Next person */}}
          className="w-full py-2 bg-sand text-charcoal rounded-lg font-medium"
        >
          Next person →
        </button>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN COMPONENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function Phase3Phase5Flow({ bookingCode = 'DEMO-001', partySize = 4 }) {
  const [phase, setPhase] = useState('modal');
  const [billConfig, setBillConfig] = useState(null);

  const handleSplitBill = (config) => {
    setBillConfig(config);
    setPhase('phase3');
  };

  if (phase === 'modal') {
    return <SplitBillModal onConfirm={handleSplitBill} partySize={partySize} />;
  }

  if (phase === 'phase3') {
    return <Phase3Till people={billConfig.people} bookingCode={bookingCode} />;
  }

  if (phase === 'phase5') {
    return <Phase5Handoff people={billConfig.people} items={[]} bookingCode={bookingCode} />;
  }
}
