const assert = require('node:assert');
const { extractPhones, normalizeNigerianPhone, resolveContactPhones } = require('../src/nlp/phoneParser.js');

console.log('Testing phoneParser.js...');

// 1. Standard local 11 digits
assert.strictEqual(normalizeNigerianPhone('08031234567'), '+2348031234567');
assert.strictEqual(normalizeNigerianPhone('07065554433'), '+2347065554433');
assert.strictEqual(normalizeNigerianPhone('09021112233'), '+2349021112233');

// 2. Spaces, hyphens, dots
assert.strictEqual(normalizeNigerianPhone('0803 123 4567'), '+2348031234567');
assert.strictEqual(normalizeNigerianPhone('080-3123-4567'), '+2348031234567');
assert.strictEqual(normalizeNigerianPhone('080.3123.4567'), '+2348031234567');

// 3. International format
assert.strictEqual(normalizeNigerianPhone('+2348031234567'), '+2348031234567');
assert.strictEqual(normalizeNigerianPhone('+234 803 123 4567'), '+2348031234567');
assert.strictEqual(normalizeNigerianPhone('2348031234567'), '+2348031234567');
assert.strictEqual(normalizeNigerianPhone('+23408031234567'), '+2348031234567'); // extra zero

// 4. Extraction from sample Nigerian FB post
const post1 = `
Direct Brief in Bodija Ibadan!
Very neat 2 bedroom flat, all room ensuite, running borehole, pop ceiling, fenced and gated.
Rent: 800k per annum.
Inspection fee: 3k.
Call or WhatsApp: 0803 987 6543 or wa.me/2347012345678
`;

const extracted1 = extractPhones(post1);
assert.strictEqual(extracted1.length, 2);
assert.strictEqual(extracted1[0].normalized, '+2348039876543');
assert.strictEqual(extracted1[1].normalized, '+2347012345678');
assert.strictEqual(extracted1[1].isWhatsapp, true);

const contacts = resolveContactPhones(extracted1);
assert.strictEqual(contacts.primaryPhone, '+2348039876543');
assert.strictEqual(contacts.secondaryPhone, '+2347012345678');
assert.strictEqual(contacts.hasContact, true);

console.log('✅ phoneParser.js tests passed successfully!');
