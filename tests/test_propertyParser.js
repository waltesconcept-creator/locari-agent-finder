const assert = require('node:assert');
const { parsePropertyListing, extractPropertyType, extractLocation, extractRentPrice, extractFeatures } = require('../src/nlp/propertyParser.js');

console.log('Testing propertyParser.js...');

// Test 1: Ibadan 2-bedroom in Bodija
const text1 = `
*DIRECT BRIEF*
Available for rent in Old Bodija, Ibadan.
Spacious 2 bedroom flat, all rooms ensuite with guest toilet.
POP ceiling, fully tiled, borehole water with dedicated prepaid meter.
Fenced and gated compound with ample car parking space.
Rent: ₦1,200,000 per annum.
Caution: 100k.
Inspection fee: 3k.
Call 08031234567.
`;

const parsed1 = parsePropertyListing(text1);
assert.strictEqual(parsed1.propertyType, '2-Bedroom Flat');
assert.strictEqual(parsed1.city, 'Ibadan');
assert.strictEqual(parsed1.neighbourhood, 'Old Bodija');
assert.strictEqual(parsed1.rentAmount, 1200000);
assert.strictEqual(parsed1.rentPeriod, 'annum');
assert(parsed1.features.includes('Ensuite'));
assert(parsed1.features.includes('POP Ceiling'));
assert(parsed1.features.includes('Tiled Floor'));
assert(parsed1.features.includes('Borehole / Water'));
assert(parsed1.features.includes('Prepaid Meter'));

// Test 2: Lagos self-contain / mini flat in Lekki
const text2 = `
Executive self contain apartment in Lekki Phase 1.
Clean water, 24/7 estate security, wardrobe, fitted kitchen.
Rent: 1.5m / year.
Contact WhatsApp: 08123456789
`;

const parsed2 = parsePropertyListing(text2);
assert.strictEqual(parsed2.propertyType, 'Self-contained');
assert.strictEqual(parsed2.city, 'Lagos');
assert.strictEqual(parsed2.neighbourhood, 'Lekki Phase 1');
assert.strictEqual(parsed2.rentAmount, 1500000);
assert(parsed2.features.includes('Security'));
assert(parsed2.features.includes('Wardrobe'));

// Test 3: Ibadan Room & Parlour with 450k rent
const text3 = `
Decent room and parlour self contain at Akobo Ibadan.
Fenced compound, running water.
Price: 450k per year.
Call 09012345678
`;
const parsed3 = parsePropertyListing(text3);
assert.strictEqual(parsed3.propertyType, 'Room and Parlour');
assert.strictEqual(parsed3.city, 'Ibadan');
assert.strictEqual(parsed3.neighbourhood, 'Akobo');
assert.strictEqual(parsed3.rentAmount, 450000);

console.log('✅ propertyParser.js tests passed successfully!');
