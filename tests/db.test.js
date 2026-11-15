/**
 * Database Unit & Integration Test
 * Verifies that groups and leads tables, constraints, upserts,
 * queries, search filters, and delete operations execute with 100% reliability.
 */

const assert = require('node:assert');
const {
  upsertGroup,
  getGroups,
  getGroup,
  insertLead,
  getLeads,
  updateLead,
  deleteLead
} = require('../src/db.js');

console.log('🧪 Starting Database Schema & CRUD Tests...\n');

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

let testGroupId = null;
let testLeadId = null;

// 1. Group Upsert & Retrieval
runTest('Upsert Facebook Group record', () => {
  const grp = upsertGroup({
    name: 'Ibadan Real Estate Test Group',
    url: 'https://web.facebook.com/share/g/testgroup123/',
    last_scraped_at: new Date().toISOString()
  });
  assert(grp, 'Group should be returned');
  assert(grp.id, 'Group must have an ID');
  assert.strictEqual(grp.name, 'Ibadan Real Estate Test Group');
  testGroupId = grp.id;
});

runTest('Fetch Group by ID', () => {
  const grp = getGroup(testGroupId);
  assert(grp, 'Group should exist');
  assert.strictEqual(grp.id, testGroupId);
});

// 2. Lead Insertion
runTest('Insert Lead into Database', () => {
  const lead = insertLead({
    groupId: testGroupId,
    agentName: 'Adebayo Ogunlesi',
    phoneNumber: '+2348039998877',
    formattedWhatsApp: 'https://wa.me/2348039998877',
    email: 'adebayo@ibadanproperties.ng',
    postSnippet: '3 Bedroom flat at Bodija Ibadan for rent, ₦1.2m',
    postUrl: 'https://web.facebook.com/groups/testgroup/posts/101',
    status: 'New'
  });

  assert(lead, 'Lead must be created');
  assert(lead.id, 'Lead must have an ID');
  assert.strictEqual(lead.agentName, 'Adebayo Ogunlesi');
  assert.strictEqual(lead.phoneNumber, '+2348039998877');
  assert.strictEqual(lead.status, 'New');
  testLeadId = lead.id;
});

// 3. Query & Filters
runTest('Query Leads with Search Term', () => {
  const res = getLeads({ search: 'Adebayo' });
  assert(res.leads.length >= 1, 'Should find lead by agentName');
  assert.strictEqual(res.leads[0].phoneNumber, '+2348039998877');
});

runTest('Filter Leads by hasPhone, hasWhatsApp, hasEmail', () => {
  const res = getLeads({ hasPhone: true, hasWhatsApp: true, hasEmail: true });
  assert(res.leads.length >= 1, 'Should find lead matching contact filters');
});

runTest('Filter Leads by Group ID', () => {
  const res = getLeads({ groupId: testGroupId });
  assert(res.leads.length >= 1, 'Should find lead matching groupId');
});

// 4. Update Lead Status
runTest('Update Lead Status to Contacted and Closed', () => {
  const updated1 = updateLead(testLeadId, { status: 'Contacted' });
  assert.strictEqual(updated1.status, 'Contacted');

  const updated2 = updateLead(testLeadId, { status: 'Closed' });
  assert.strictEqual(updated2.status, 'Closed');
});

// 5. Delete Lead
runTest('Delete Lead record', () => {
  const deleted = deleteLead(testLeadId);
  assert.strictEqual(deleted, true);

  const check = getLeads({ search: '+2348039998877' });
  assert.strictEqual(check.leads.length, 0, 'Deleted lead should not appear in query');
});

console.log(`\n========================================`);
console.log(`DATABASE TEST RESULTS: ${testsPassed}/${testsTotal} passed`);
console.log(`========================================\n`);

if (testsPassed === testsTotal) {
  process.exit(0);
} else {
  process.exit(1);
}
