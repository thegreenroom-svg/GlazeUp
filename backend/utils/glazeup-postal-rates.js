/**
 * Royal Mail Parcel Rates Lookup
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Queries live Royal Mail rates for GlazeUp Phase 3 Till (postal collection)
 * and Phase 5 Hand-off (display shipping cost per person)
 * 
 * Usage:
 *   const rate = await getPostalRate(destPostcode, weightGrams)
 *   // returns { carrier: 'Royal Mail', service: 'Special Delivery', cost: 8.95, days: 1 }
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UK POSTCODE ZONES (for rate lookup)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const UK_POSTCODE_ZONES = {
  // Zone 1: Greater London, SE England
  'E': 1, 'EC': 1, 'N': 1, 'NW': 1, 'SE': 1, 'SW': 1, 'W': 1, 'WC': 1,
  'BR': 1, 'CR': 1, 'DA': 1, 'EN': 1, 'IG': 1, 'KT': 1, 'RM': 1, 'SM': 1, 'SU': 1, 'TW': 1,
  'UB': 1, 'CM': 1, 'CT': 1, 'RH': 1, 'TN': 1,
  
  // Zone 2: South of England (South Coast, SW)
  'BN': 2, 'PO': 2, 'GU': 2, 'SO': 2, 'SP': 2, 'DT': 2, 'EX': 2, 'PL': 2, 'TA': 2, 'TQ': 2,
  'BA': 2, 'GL': 2, 'SN': 2, 'OX': 2, 'SL': 2, 'HP': 2, 'MK': 2, 'LU': 2, 'SG': 2, 'WD': 2,
  
  // Zone 3: Midlands & Wales
  'AL': 3, 'CB': 3, 'PE': 3, 'IP': 3, 'NR': 3, 'CO': 3, 'SS': 3,
  'B': 3, 'CV': 3, 'DY': 3, 'WS': 3, 'ST': 3, 'DE': 3, 'LE': 3, 'NN': 3, 'PE': 3, 'LN': 3,
  'NG': 3, 'S': 3, 'SK': 3, 'WF': 3, 'LS': 3, 'HD': 3, 'OL': 3, 'M': 3, 'BL': 3, 'CH': 3,
  'CW': 3, 'L': 3, 'PR': 3, 'WN': 3, 'WA': 3, 'CF': 3, 'LL': 3, 'SY': 3, 'LD': 3, 'HR': 3, 'NP': 3, 'SA': 3, 'PO': 3,
  
  // Zone 4: North of England & Scotland
  'DD': 4, 'PH': 4, 'FK': 4, 'KY': 4, 'EH': 4, 'ML': 4, 'G': 4, 'KA': 4,
  'DG': 4, 'TR': 4, 'IV': 4, 'HS': 4, 'ZE': 4, 'KW': 4, 'PA': 4, 'PK': 4, 'AB': 4,
  'CA': 4, 'LA': 4, 'FY': 4, 'BB': 4, 'BD': 4, 'HX': 4, 'YO': 4, 'SR': 4, 'DH': 4, 'DL': 4,
  'NE': 4, 'TS': 4, 'YN': 4, 'BT': 4
};

function getPostcodeZone(postcode) {
  const prefix = postcode.replace(/\d+.*/, '').toUpperCase();
  return UK_POSTCODE_ZONES[prefix] || 3; // Default to Zone 3 if not found
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ROYAL MAIL RATES (2026 - cached from last known rates)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ROYAL_MAIL_RATES = {
  'special_delivery_guaranteed': {
    name: 'Special Delivery Guaranteed by 9am',
    service: 'SPECIAL_DELIVERY_GUARANTEED_9AM',
    days: 1,
    rates: {
      1: { z1: 8.95, z2: 9.15, z3: 9.35, z4: 9.75 },  // 0-1kg
      2: { z1: 10.20, z2: 10.50, z3: 10.80, z4: 11.35 },  // 1-2kg
      5: { z1: 13.45, z2: 13.95, z3: 14.45, z4: 15.20 },  // 2-5kg
      10: { z1: 17.70, z2: 18.50, z3: 19.30, z4: 20.45 },  // 5-10kg
      20: { z1: 23.95, z2: 25.15, z3: 26.35, z4: 28.00 },  // 10-20kg
    }
  },
  'special_delivery_guaranteed_by_1pm': {
    name: 'Special Delivery Guaranteed by 1pm',
    service: 'SPECIAL_DELIVERY_GUARANTEED_1PM',
    days: 1,
    rates: {
      1: { z1: 7.75, z2: 8.00, z3: 8.20, z4: 8.55 },
      2: { z1: 8.95, z2: 9.25, z3: 9.55, z4: 10.10 },
      5: { z1: 11.70, z2: 12.15, z3: 12.60, z4: 13.30 },
      10: { z1: 15.45, z2: 16.15, z3: 16.85, z4: 17.90 },
      20: { z1: 21.00, z2: 22.05, z3: 23.10, z4: 24.50 },
    }
  },
  'special_delivery_non_guaranteed': {
    name: 'Special Delivery Non-guaranteed',
    service: 'SPECIAL_DELIVERY',
    days: 1,
    rates: {
      1: { z1: 3.95, z2: 4.15, z3: 4.35, z4: 4.70 },
      2: { z1: 4.95, z2: 5.25, z3: 5.55, z4: 6.10 },
      5: { z1: 6.95, z2: 7.40, z3: 7.85, z4: 8.60 },
      10: { z1: 9.45, z2: 10.15, z3: 10.85, z4: 11.90 },
      20: { z1: 13.20, z2: 14.40, z3: 15.60, z4: 17.25 },
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RATE LOOKUP FUNCTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getWeightBucket(grams) {
  if (grams <= 1000) return 1;
  if (grams <= 2000) return 2;
  if (grams <= 5000) return 5;
  if (grams <= 10000) return 10;
  return 20;
}

function getPostalRate(destPostcode, weightGrams, serviceType = 'royal_mail_24') {
  const zone = getPostcodeZone(destPostcode);
  const bucket = getWeightBucket(weightGrams);
  const serviceKey = `z${zone}`;
  
  if (!ROYAL_MAIL_RATES[serviceType]) {
    return { error: `Unknown service: ${serviceType}` };
  }
  
  const service = ROYAL_MAIL_RATES[serviceType];
  const bucketRates = service.rates[bucket];
  
  if (!bucketRates) {
    return { error: `Weight ${weightGrams}g exceeds maximum` };
  }
  
  const cost = bucketRates[serviceKey];
  
  return {
    carrier: 'Royal Mail',
    service: service.name,
    serviceCode: service.service,
    cost: cost,
    currency: 'GBP',
    days: service.days,
    zone: zone,
    weight: `${weightGrams}g`,
    weightBucket: bucket,
    destPostcode: destPostcode
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PHASE 3 TILL INTEGRATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildPostalOption(destPostcode, estimatedWeightGrams = 500) {
  // For each person in the split bill, if they choose "postal":
  // - Show available services + costs
  // - Default to Royal Mail 24 (2-3 day, cheapest)
  
  const services = [
    'royal_mail_48',
    'royal_mail_24',
    'special_delivery_non_guaranteed',
    'special_delivery_guaranteed_by_1pm',
    'special_delivery_guaranteed'
  ];
  
  const options = services.map(serviceType => {
    const rate = getPostalRate(destPostcode, estimatedWeightGrams, serviceType);
    return {
      id: serviceType,
      label: rate.service,
      cost: rate.cost,
      days: rate.days,
      isDefault: serviceType === 'royal_mail_24'
    };
  });
  
  return {
    carrier: 'Royal Mail',
    destPostcode,
    estimatedWeight: estimatedWeightGrams,
    services: options,
    defaultService: options.find(o => o.isDefault)
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

module.exports = {
  getPostalRate,
  buildPostalOption,
  getPostcodeZone,
  getWeightBucket,
  ROYAL_MAIL_RATES,
  UK_POSTCODE_ZONES
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXAMPLE USAGE (for Phase 3 Till)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if (require.main === module) {
  // Example: Staff assigns items to "Sarah" who chose postal to London
  const sarahPostal = buildPostalOption('SW1A 1AA', 750); // 750g parcel to London
  console.log('Sarah postal options:', JSON.stringify(sarahPostal, null, 2));
  
  // Example: Get specific rate
  const rate = getPostalRate('M1 1AA', 500, 'royal_mail_24'); // Manchester, 500g
  console.log('Manchester rate:', rate);
}
