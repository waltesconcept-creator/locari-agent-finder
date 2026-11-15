/**
 * Nigerian Property & Location NLP Parser
 * Extracts property types, Nigerian cities, neighbourhoods, prices, and amenities.
 */

// Property Type Definitions and Keywords (Ordered by specificity)
const PROPERTY_PATTERNS = [
  {
    type: 'Room and Parlour',
    regex: /\b(room\s+(?:and|&)\s+parlou?r(?:\s+self[\s-]?contain(?:ed)?)?|r\s+(?:and|&)\s+p|room\s+parlou?r)\b/i
  },
  {
    type: '4-Bedroom Flat',
    regex: /\b(4[\s-]?bed(?:room)?(?:\s+flat|\s+apartment)?|four[\s-]?bed(?:room)?)\b/i
  },
  {
    type: '3-Bedroom Flat',
    regex: /\b(3[\s-]?bed(?:room)?(?:\s+flat|\s+apartment)?|three[\s-]?bed(?:room)?)\b/i
  },
  {
    type: '2-Bedroom Flat',
    regex: /\b(2[\s-]?bed(?:room)?(?:\s+flat|\s+apartment)?|two[\s-]?bed(?:room)?)\b/i
  },
  {
    type: '1-Bedroom Flat',
    regex: /\b(1[\s-]?bed(?:room)?(?:\s+flat|\s+apartment)?|one[\s-]?bed(?:room)?|mini[\s-]?flat)\b/i
  },
  {
    type: 'Self-contained',
    regex: /\b(self[\s-]?contain(?:ed)?|single[\s-]?room|a[\s-]room\s+self|room\s+self)\b/i
  },
  {
    type: 'Duplex',
    regex: /\b((?:semi[\s-]detached|fully[\s-]detached|terrace|penthouse)?\s*duplex|terrace(?:d)?\s+house|townhouse|mansion)\b/i
  },
  {
    type: 'Commercial / Shop / Office',
    regex: /\b(commercial|shop|office\s+space|store|warehouse|plaza|open\s+space|complex)\b/i
  },
  {
    type: 'Land',
    regex: /\b(plot\s+of\s+land|acres?|land\s+for\s+(?:sale|lease|rent))\b/i
  }
];

// Nigerian Cities and their primary neighbourhoods
const NIGERIAN_LOCATIONS = {
  'Ibadan': [
    'old bodija', 'new bodija', 'bodija', 'akobo ojurin', 'akobo', 'oluyole estate', 'oluyole',
    'samonda', 'university of ibadan', 'ui', 'agbowo', 'jericho', 'ring road', 'eleyele',
    'dugbe', 'challenge', 'iwo road', 'alakia', 'moniya', 'apata', 'ojoo', 'sango',
    'mokola', 'iyaganku gra', 'iyaganku', 'new garage', 'ologuneru', 'kuola', 'felele',
    'ashi', 'bashorun', 'alete', 'idi ishaye', 'poly road', 'alabebe', 'alata', 'onireke',
    'agodi gra', 'agodi', 'secretariat', 'aerodrome', 'alafia', 'yemetu', 'lead city'
  ],
  'Lagos': [
    'lekki phase 1', 'lekki phase 2', 'lekki', 'banana island', 'victoria island', 'vi',
    'osapa london', 'osapa', 'chevron', 'sangotedo', 'agungi', 'ikoyi', 'yaba', 'surulere',
    'ikeja gra', 'ikeja', 'maryland', 'magodo phase 1', 'magodo phase 2', 'magodo', 'gbagada',
    'ogudu', 'festac', 'ikorodu', 'alausa', 'ogba', 'ilupeju', 'anthony', 'ojodu',
    'berger', 'agege', 'isolo', 'okota', 'egbeda', 'ipaja', 'badore', 'abijo', 'awoyaya',
    'epe', 'oniru', 'ajah', 'ikate'
  ],
  'Abuja': [
    'maitama', 'wuse 2', 'wuse', 'gwarinpa', 'asokoro', 'jabi', 'utako', 'lugbe',
    'apo', 'lokogoma', 'kubwa', 'guzape', 'katampe', 'mpape', 'dawaki', 'life camp', 'central area'
  ],
  'Abeokuta': [
    'ibara', 'oke mosan', 'kuto', 'isale igbein', 'adatan', 'camp', 'obantoko', 'lalubu'
  ],
  'Port Harcourt': [
    'gra', 'peter odili', 'trans amadi', 'woji', 'rumuola', 'choba', 'ada george', 'd-line'
  ]
};

// Feature detection keywords
const FEATURE_MAP = {
  'Ensuite': /\b(all\s+rooms?\s+ensuite|ensuite|master\s+bedroom\s+ensuite)\b/i,
  'POP Ceiling': /\b(pop|p\.o\.p|pop\s+ceiling)\b/i,
  'Tiled Floor': /\b(tiled|tiles|all\s+round\s+tiles|fully\s+tiled)\b/i,
  'Borehole / Water': /\b(borehole|running\s+water|water\s+supply|clean\s+water)\b/i,
  'Fenced & Gated': /\b(fenced|fenced\s+(?:and|&)\s+gated|gated|gate|compound)\b/i,
  'Prepaid Meter': /\b(prepaid\s+meter|prepaid|separate\s+meter)\b/i,
  'Security': /\b(security|security\s+guard|uniformed\s+guard|estate\s+security|gated\s+estate)\b/i,
  'Wardrobe': /\b(wardrobe|fitted\s+wardrobe)\b/i,
  'Kitchen Cabinet': /\b(kitchen\s+cabinet|fitted\s+kitchen)\b/i,
  'Car Parking': /\b(car\s+park|parking\s+space|adequate\s+parking|spacious\s+compound)\b/i,
  'Balcony': /\b(balcony|verandah)\b/i
};

/**
 * Extracts property type from text
 */
function extractPropertyType(text) {
  if (!text) return 'Unspecified';

  for (const item of PROPERTY_PATTERNS) {
    if (item.regex.test(text)) {
      return item.type;
    }
  }

  // Fallback checks
  if (/\bflat\b/i.test(text)) return 'Apartment / Flat';
  if (/\bhouse\b/i.test(text)) return 'House';

  return 'Unspecified';
}

/**
 * Capitalizes every word in a title/area name
 */
function capitalizeWords(str) {
  return str.replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Extracts Nigerian city and specific neighbourhood
 */
function extractLocation(text) {
  if (!text) return { city: 'Unknown', neighbourhood: null };

  const lower = text.toLowerCase();
  let foundCity = null;
  let foundNeighbourhood = null;

  const allHoods = [];
  for (const [city, neighbourhoods] of Object.entries(NIGERIAN_LOCATIONS)) {
    for (const hood of neighbourhoods) {
      allHoods.push({ hood, city, len: hood.length });
    }
  }
  allHoods.sort((a, b) => b.len - a.len);

  for (const item of allHoods) {
    const regex = new RegExp(`\\b${item.hood}\\b`, 'i');
    if (regex.test(lower)) {
      foundNeighbourhood = capitalizeWords(item.hood);
      foundCity = item.city;
      break;
    }
  }

  if (!foundCity) {
    for (const city of Object.keys(NIGERIAN_LOCATIONS)) {
      const regex = new RegExp(`\\b${city}\\b`, 'i');
      if (regex.test(lower)) {
        foundCity = city;
        break;
      }
    }
  }

  return {
    city: foundCity || 'Unknown',
    neighbourhood: foundNeighbourhood
  };
}

/**
 * Extracts rental price and payment period
 */
function extractRentPrice(text) {
  if (!text) return { amount: null, period: 'annum', rawText: null };

  let period = 'annum';
  if (/\b(per\s+month|monthly|\/month|\/m)\b/i.test(text)) {
    period = 'month';
  } else if (/\b(total\s+package|all\s+inclusive)\b/i.test(text)) {
    period = 'total package';
  }

  const priceRegex = /(?:rent|price|asking|pay)?\s*(?:(?:₦|ngn|n)\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m|million|thousand)?\s*(?:\/|\s*per|\s*p\.a\.?)?\s*(?:annum|year|month|yr)?/gi;

  let bestAmount = null;
  let rawMatched = null;

  let match;
  while ((match = priceRegex.exec(text)) !== null) {
    const numPart = match[1].replace(/,/g, '');
    const multiplier = (match[2] || '').toLowerCase();
    let numericVal = parseFloat(numPart);

    if (isNaN(numericVal)) continue;

    if (multiplier === 'k' || multiplier === 'thousand') {
      numericVal *= 1000;
    } else if (multiplier === 'm' || multiplier === 'million') {
      numericVal *= 1000000;
    }

    if (numericVal >= 50000 && numericVal <= 500000000) {
      const snippet = text.slice(Math.max(0, match.index - 20), Math.min(text.length, match.index + match[0].length + 15)).toLowerCase();
      if (snippet.includes('rent') || snippet.includes('price') || snippet.includes('asking') || snippet.includes('p.a') || snippet.includes('annum')) {
        bestAmount = numericVal;
        rawMatched = match[0].trim();
        break;
      } else if (!bestAmount) {
        bestAmount = numericVal;
        rawMatched = match[0].trim();
      }
    }
  }

  return {
    amount: bestAmount,
    period,
    rawText: rawMatched
  };
}

/**
 * Extracts recognized property features
 */
function extractFeatures(text) {
  if (!text) return [];

  const foundFeatures = [];
  for (const [featureName, regex] of Object.entries(FEATURE_MAP)) {
    if (regex.test(text)) {
      foundFeatures.push(featureName);
    }
  }
  return foundFeatures;
}

/**
 * Comprehensive parser combining all extraction rules
 */
function parsePropertyListing(rawText, metadata = {}) {
  const propertyType = extractPropertyType(rawText);
  const location = extractLocation(rawText);
  const rent = extractRentPrice(rawText);
  const features = extractFeatures(rawText);

  const finalCity = (location.city !== 'Unknown') ? location.city : (metadata.sourceLocation || 'Unknown');

  return {
    propertyType,
    city: finalCity,
    neighbourhood: location.neighbourhood,
    rentAmount: rent.amount,
    rentPeriod: rent.period,
    features,
    featuresJson: JSON.stringify(features)
  };
}

module.exports = {
  extractPropertyType,
  extractLocation,
  extractRentPrice,
  extractFeatures,
  parsePropertyListing,
  PROPERTY_PATTERNS,
  NIGERIAN_LOCATIONS
};
