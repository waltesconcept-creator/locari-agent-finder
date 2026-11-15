process.env.LOCARI_DB_PATH = ':memory:';

const assert = require('node:assert');
const { db } = require('../src/db.js');
const { splitMultiplePosts, previewBatchPaste, ingestBatch, parseCSV } = require('../src/services/ingestionService.js');
const { resolveAndSaveListing, mergeAgents } = require('../src/services/deduplicationService.js');

console.log('Testing ingestionService and deduplicationService...');

// Test 1: Batch paste splitting & preview
const multiPostText = `
DIRECT BRIEF IN BODIJA
2 Bedroom flat, pop, running borehole, fenced.
Rent: ₦1,200,000 p.a.
Call: 08031112233

---

DIRECT BRIEF IN AKOBO
Room and parlour self contain, running water.
Rent: 450k per year.
Inspection fee: 2k.
WhatsApp: 08031112233

---

LEKKI PHASE 1 LUXURY
3 Bedroom flat with elevator and 24/7 power.
Rent: 5m per annum.
Call agent Segun: 07098887766
`;

const preview = previewBatchPaste(multiPostText);
assert.strictEqual(preview.totalSegments, 3);
assert.strictEqual(preview.validContactsCount, 3);
assert.strictEqual(preview.missingContactsCount, 0);

// Test 2: Ingest the batch
const batchResult = ingestBatch(splitMultiplePosts(multiPostText), {
  sourceId: 'src_ibadan_prop_1',
  method: 'Quick-Paste'
});

assert.strictEqual(batchResult.postsImported, 3);
assert.strictEqual(batchResult.duplicatesDetected, 0);
assert.strictEqual(batchResult.agentsCreated, 2);
assert.strictEqual(batchResult.agentsUpdated, 1);

// Test 3: Verify the deduplicated agent in database
const sharedAgent = db.prepare('SELECT * FROM agents WHERE primary_phone = ?').get('+2348031112233');
assert(sharedAgent);
assert.strictEqual(sharedAgent.advertisements_count, 2);
assert(sharedAgent.lead_score > 0);
assert.strictEqual(sharedAgent.likely_role, 'Likely Property Agent');

// Test 4: Ingest exact duplicate post -> should detect duplicate
const duplicateResult = ingestBatch([
  `DIRECT BRIEF IN BODIJA
2 Bedroom flat, pop, running borehole, fenced.
Rent: ₦1,200,000 p.a.
Call: 08031112233`
]);

assert.strictEqual(duplicateResult.duplicatesDetected, 1);
assert.strictEqual(duplicateResult.agentsCreated, 0);

// Test 5: CSV Parsing test
const sampleCsv = `name,phone,text,location
Tunde Properties,08023456789,"Commercial shop at Dugbe Ibadan. Rent 300k",Ibadan
Mama Landlord,08145678901,"My personal flat at Challenge Ibadan. 600k rent. Dealing directly with owner.",Ibadan
`;

const parsedCsvItems = parseCSV(sampleCsv);
assert.strictEqual(parsedCsvItems.length, 2);
const csvBatchResult = ingestBatch(parsedCsvItems, { method: 'CSV-Upload' });
assert.strictEqual(csvBatchResult.postsImported, 2);

console.log('✅ ingestionService and deduplicationService tests passed successfully!');
