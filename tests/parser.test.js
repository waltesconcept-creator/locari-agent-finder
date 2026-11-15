/**
 * Unit Test Suite for Contact Extraction Engine
 * Tests 5 realistic Facebook real estate posts covering:
 * 1. Nigerian Akobo Ibadan rental with local format and wa.me link
 * 2. US luxury rental with +1 format and email
 * 3. UK London flat with +44 format and email
 * 4. Obfuscated Nigerian phone number (0 8 0 3...) in noisy text
 * 5. Multi-contact listing with api.whatsapp.com link and phone
 */

const assert = require('node:assert');
const { extractContacts, parsePost, normalizePhone, formatWhatsAppUrl } = require('../src/nlp/contactExtractor.js');

console.log('🧪 Starting Parser Unit Tests (5 Realistic Real Estate Posts)...\n');

let testsPassed = 0;
let testsTotal = 0;

function runTest(testName, fn) {
  testsTotal++;
  try {
    fn();
    console.log(`  ✅ PASS: ${testName}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${testName}`);
    console.error(`     Error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------
// TEST CASE 1: Nigerian Akobo Ibadan flat rental (local format & wa.me)
// ---------------------------------------------------------------------
const post1 = `
🏠 DIRECT BRIEF AT AKOBO, IBADAN 🏠
Executive 3 Bedroom Flat to let at Akobo, near General Gas, Ibadan.
All rooms ensuite, POP ceiling, running borehole water, fenced and gated with security.
Rent: ₦800,000 per annum
Total package: ₦1,100,000
If interested, kindly call us for inspection: 0803 123 4567
Or chat directly on WhatsApp: https://wa.me/2348031234567
Agent: Babatunde Adeleke
No unverified inspection, direct clients only!
`;

runTest('Post 1 (Akobo Ibadan) - Nigerian phone + wa.me link + agent name', () => {
  const result = parsePost(post1);
  assert.strictEqual(result.phoneNumber, '+2348031234567', 'Primary phone should be +2348031234567');
  assert.strictEqual(result.formattedWhatsApp, 'https://wa.me/2348031234567', 'Formatted WhatsApp should match wa.me link');
  assert.strictEqual(result.agentName, 'Babatunde Adeleke', 'Agent name should be extracted');
  assert(result.postSnippet.includes('Executive 3 Bedroom Flat to let at Akobo'), 'Snippet should contain property info');
});

// ---------------------------------------------------------------------
// TEST CASE 2: US Luxury Condo (Miami, FL) with +1 phone & RFC email
// ---------------------------------------------------------------------
const post2 = `
🌟 MIAMI LUXURY WATERFRONT CONDO FOR LEASE 🌟
Stunning 2 Bed / 2 Bath on Brickell Bay Dr, Miami FL 33131.
Unobstructed ocean views, marble floors, private balcony, 24/7 valet & concierge.
Price: $4,500/month. Available Dec 1st.
Contact Agent: Michael Harrison
Phone: +1 (555) 019-2834
Email inquiries: leasing@miamibayproperties.com
Showing by appointment only. Must pass credit check.
`;

runTest('Post 2 (US Miami Condo) - US phone + RFC email + agent name', () => {
  const result = parsePost(post2);
  assert.strictEqual(result.phoneNumber, '+15550192834', 'Primary phone should be +15550192834');
  assert.strictEqual(result.email, 'leasing@miamibayproperties.com', 'Email should match RFC standard');
  assert.strictEqual(result.formattedWhatsApp, 'https://wa.me/15550192834', 'WhatsApp link formatted for US number');
  assert.strictEqual(result.agentName, 'Michael Harrison', 'Agent name should be Michael Harrison');
});

// ---------------------------------------------------------------------
// TEST CASE 3: UK Flat Rental (London) with +44 phone & business email
// ---------------------------------------------------------------------
const post3 = `
🇬🇧 MODERN 2-BED FLAT IN CANARY WHARF, LONDON E14 🇬🇧
Newly refurbished second-floor apartment. 2 double bedrooms, 2 bathrooms, modern fitted kitchen.
Close to tube station and DLR.
Rent: £2,400 PCM (bills excluded). Deposit: 5 weeks.
Agent: Emma Watson Lets
Direct Tel: +44 7911 123456
Email: enquiries@canarywharflets.co.uk
Virtual tour available upon request.
`;

runTest('Post 3 (UK London Flat) - UK +44 phone + email + agent name', () => {
  const result = parsePost(post3);
  assert.strictEqual(result.phoneNumber, '+447911123456', 'Primary phone should be +447911123456');
  assert.strictEqual(result.email, 'enquiries@canarywharflets.co.uk', 'Email extracted correctly');
  assert.strictEqual(result.formattedWhatsApp, 'https://wa.me/447911123456', 'Formatted WhatsApp matches UK number');
  assert.strictEqual(result.agentName, 'Emma Watson Lets', 'Agent name extracted');
});

// ---------------------------------------------------------------------
// TEST CASE 4: Obfuscated Nigerian phone number (0 8 0 3...) in noisy text
// ---------------------------------------------------------------------
const post4 = `
HOT DISTRESS DEAL IN LEKKI PHASE 1 🔥🔥🔥
Spacious room and parlour self contain for rent!
Constant light, treated water, clean compound.
Pay and pack in immediately!
Rent: 1.5m, Agreement & Commission: 10/10
Call or WhatsApp the direct manager now on:
0 8 0 3 4 5 6 7 8 9 0
Please serious prospective tenants only, no time wasters!
`;

runTest('Post 4 (Obfuscated Number) - De-obfuscation of 0 8 0 3 4 5 6 7 8 9 0', () => {
  const contacts = extractContacts(post4);
  assert(contacts.phoneNumbers.includes('+2348034567890'), 'Obfuscated digits must resolve to +2348034567890');
  assert.strictEqual(contacts.primaryPhone, '+2348034567890', 'Primary phone should match normalized obfuscated number');
  assert.strictEqual(contacts.formattedWhatsApp, 'https://wa.me/2348034567890', 'Formatted WhatsApp URL created');
});

// ---------------------------------------------------------------------
// TEST CASE 5: Multi-contact post with api.whatsapp.com link & phone
// ---------------------------------------------------------------------
const post5 = `
DIRECT MANDATE: 4 BEDROOM DUPLEX FOR SALE AT OLUYOLE ESTATE, IBADAN
Title: C of O, Survey Plan.
Price: ₦95,000,000 asking.
For full video walkthrough and documents:
WhatsApp Link: https://api.whatsapp.com/send?phone=2349012345678
Office Call line: 08123456789
Email: deals@ibadanrealtors.ng
Contact: Engr Kolapo Adeleke
`;

runTest('Post 5 (Multi-Contact & api.whatsapp.com) - Full extraction', () => {
  const result = parsePost(post5);
  assert(result.allPhones.includes('+2349012345678'), 'Should extract WhatsApp number');
  assert(result.allPhones.includes('+2348123456789'), 'Should extract office call line');
  assert.strictEqual(result.formattedWhatsApp, 'https://wa.me/2349012345678', 'Should extract and format WhatsApp URL');
  assert.strictEqual(result.email, 'deals@ibadanrealtors.ng', 'Should extract email');
  assert.strictEqual(result.agentName, 'Engr Kolapo Adeleke', 'Should extract agent name');
});

// ---------------------------------------------------------------------
// FINAL SUMMARY
// ---------------------------------------------------------------------
console.log(`\n========================================`);
console.log(`PARSER TEST RESULTS: ${testsPassed}/${testsTotal} passed (100% target)`);
console.log(`========================================\n`);

if (testsPassed === testsTotal) {
  process.exit(0);
} else {
  process.exit(1);
}
