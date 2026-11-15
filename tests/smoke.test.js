/**
 * End-to-End Smoke Test Suite
 * Tests all backend API routes:
 * 1. Health check (/health)
 * 2. Groups API (GET /api/groups, POST /api/groups)
 * 3. Ingestion Fail-Safe (POST /api/ingest/raw)
 * 4. Leads Query & Filtering (GET /api/leads with search, filters)
 * 5. Leads Manual Create & Update (POST /api/leads, PUT /api/leads/:id)
 * 6. CSV Export (GET /api/leads/export/csv - headers and row formatting)
 * 7. Lead Deletion (DELETE /api/leads/:id)
 */

const assert = require('node:assert');
const http = require('node:http');
const app = require('../src/server.js');

let server;
const PORT = 3099; // Isolated test port
const BASE_URL = `http://localhost:${PORT}`;

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(rawData);
        } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
          raw: rawData
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

console.log('🧪 Starting End-to-End Backend API Smoke Tests...\n');

let testsPassed = 0;
let testsTotal = 0;

async function test(name, fn) {
  testsTotal++;
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function runAllTests() {
  await new Promise(resolve => {
    server = app.listen(PORT, resolve);
  });

  try {
    // 1. Health Check
    await test('GET /health returns healthy status', async () => {
      const res = await makeRequest('GET', '/health');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.status, 'healthy');
      assert.strictEqual(res.data.app, 'Locari Agent Finder');
    });

    // 2. Groups API
    let createdGroupId = null;
    await test('POST /api/groups creates or registers a Facebook Group', async () => {
      const res = await makeRequest('POST', '/api/groups', {
        name: 'Smoke Test Real Estate Group',
        url: 'https://web.facebook.com/groups/smoke_test_group_' + Date.now()
      });
      assert.strictEqual(res.statusCode, 201);
      assert(res.data.data.id);
      assert.strictEqual(res.data.data.name, 'Smoke Test Real Estate Group');
      createdGroupId = res.data.data.id;
    });

    await test('GET /api/groups lists active groups', async () => {
      const res = await makeRequest('GET', '/api/groups');
      assert.strictEqual(res.statusCode, 200);
      assert(Array.isArray(res.data.data));
      assert(res.data.data.length >= 1);
    });

    // 3. Fail-Safe Direct Raw Ingest
    const rawPostText = `
    DIRECT TO LET AT AKOBO IBADAN
    Clean 2 bedroom flat to let at Akobo, tarred road, water running 24/7.
    Rent: ₦750k per year.
    Call or WhatsApp direct scout: 0803 555 1234
    Or wa.me/2348035551234
    Agent: Prince Kunle Properties
    Email: kunle@akoborealestate.ng
    `;

    await test('POST /api/ingest/raw parses text and stores leads in SQLite', async () => {
      const res = await makeRequest('POST', '/api/ingest/raw', {
        rawContent: rawPostText,
        groupName: 'Akobo Real Estate Group'
      });
      assert.strictEqual(res.statusCode, 200);
      assert(res.data.success);
      assert.strictEqual(res.data.data.leadsCreated, 1);
      const lead = res.data.data.leads[0];
      assert.strictEqual(lead.phoneNumber, '+2348035551234');
      assert.strictEqual(lead.formattedWhatsApp, 'https://wa.me/2348035551234');
      assert.strictEqual(lead.agentName, 'Prince Kunle Properties');
      assert.strictEqual(lead.email, 'kunle@akoborealestate.ng');
    });

    // 4. Leads API Query & Filters
    await test('GET /api/leads with search filter', async () => {
      const res = await makeRequest('GET', '/api/leads?search=Prince+Kunle');
      assert.strictEqual(res.statusCode, 200);
      assert(res.data.data.length >= 1);
      assert.strictEqual(res.data.data[0].agentName, 'Prince Kunle Properties');
      assert.strictEqual(res.data.data[0].phoneNumber, '+2348035551234');
    });

    await test('GET /api/leads with hasPhone and hasWhatsApp filters', async () => {
      const res = await makeRequest('GET', '/api/leads?hasPhone=true&hasWhatsApp=true');
      assert.strictEqual(res.statusCode, 200);
      assert(res.data.data.length >= 1);
    });

    // 5. Manual Lead Create, Update Status, and Delete
    let manualLeadId = null;
    await test('POST /api/leads creates a manual lead record', async () => {
      const res = await makeRequest('POST', '/api/leads', {
        agentName: 'Aisha Bello',
        phoneNumber: '+2348149876543',
        formattedWhatsApp: 'https://wa.me/2348149876543',
        email: 'aisha@abujaapartments.com',
        postSnippet: 'Fully furnished duplex in Maitama Abuja',
        status: 'New'
      });
      assert.strictEqual(res.statusCode, 201);
      assert(res.data.data.id);
      manualLeadId = res.data.data.id;
    });

    await test('PUT /api/leads/:id updates lead status to Contacted', async () => {
      const res = await makeRequest('PUT', `/api/leads/${manualLeadId}`, {
        status: 'Contacted'
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.data.status, 'Contacted');
    });

    await test('PUT /api/leads/:id updates lead status to Closed', async () => {
      const res = await makeRequest('PUT', `/api/leads/${manualLeadId}`, {
        status: 'Closed'
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.data.status, 'Closed');
    });

    // 6. CSV Export
    await test('GET /api/leads/export/csv returns valid CSV file download', async () => {
      const res = await makeRequest('GET', '/api/leads/export/csv');
      assert.strictEqual(res.statusCode, 200);
      assert(res.headers['content-type'].includes('text/csv'));
      assert(res.headers['content-disposition'].includes('attachment; filename="locarie_leads_'));
      assert(res.raw.includes('Lead ID,Group ID,Group Name,Agent Name,Phone Number'));
      assert(res.raw.includes('+2348035551234') || res.raw.includes('+2348149876543'));
    });

    // 7. Delete Lead
    await test('DELETE /api/leads/:id removes the lead record', async () => {
      const res = await makeRequest('DELETE', `/api/leads/${manualLeadId}`);
      assert.strictEqual(res.statusCode, 200);
      assert(res.data.success);
    });

  } finally {
    server.close();
  }

  console.log(`\n========================================`);
  console.log(`E2E SMOKE TEST RESULTS: ${testsPassed}/${testsTotal} passed`);
  console.log(`========================================\n`);

  if (testsPassed === testsTotal) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
