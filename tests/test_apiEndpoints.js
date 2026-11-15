process.env.LOCARI_DB_PATH = ':memory:';

const assert = require('node:assert');
const app = require('../src/server.js');
const http = require('node:http');

console.log('Testing API Endpoints with HTTP server...');

const server = http.createServer(app);

server.listen(0, async () => {
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Health check
    const healthRes = await fetch(`${baseUrl}/health`).then(r => r.json());
    assert.strictEqual(healthRes.status, 'healthy');

    // 2. Dashboard Stats
    const statsRes = await fetch(`${baseUrl}/api/dashboard/stats`).then(r => r.json());
    assert.strictEqual(statsRes.success, true);
    assert(statsRes.data.summary.totalLeads >= 0);
    assert(Array.isArray(statsRes.data.cityBreakdown));
    assert(Array.isArray(statsRes.data.topSources));

    // 3. Quick-Paste Ingest API
    const ingestRes = await fetch(`${baseUrl}/api/ingest/quick-paste`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: `
        DIRECT BRIEF IN BODIJA IBADAN!
        Clean 2 Bedroom flat, all ensuite, pop, borehole water.
        Rent: ₦900,000 p.a.
        Agency and legal 10%.
        Call agent Kola: 08055554433 or wa.me/2348055554433
        `
      })
    }).then(r => r.json());

    assert.strictEqual(ingestRes.success, true);
    assert.strictEqual(ingestRes.data.postsImported, 1);
    const agentId = ingestRes.data.results[0].agentId;

    // 4. Fetch Agent by ID
    const agentDetail = await fetch(`${baseUrl}/api/agents/${agentId}`).then(r => r.json());
    assert.strictEqual(agentDetail.success, true);
    assert.strictEqual(agentDetail.data.agent.primary_phone, '+2348055554433');
    assert.strictEqual(agentDetail.data.advertisements.length, 1);

    // 5. Outreach Logging
    const outreachRes = await fetch(`${baseUrl}/api/agents/${agentId}/outreach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'WhatsApp',
        outcome: 'Conversation',
        notes: 'Contacted agent Kola, introduced Locari inspection model. Very receptive.',
        follow_up_date: '2026-11-20',
        conducted_by: 'Scout Tope'
      })
    }).then(r => r.json());

    assert.strictEqual(outreachRes.success, true);
    assert.strictEqual(outreachRes.data.agent.status, 'Contacted');
    assert.strictEqual(outreachRes.data.outreachLogs.length, 1);

    // 6. Locari Platform Sync
    const syncRes = await fetch(`${baseUrl}/api/locari/sync/${agentId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locari_agent_id: 'loc_agt_999' })
    }).then(r => r.json());

    assert.strictEqual(syncRes.success, true);
    assert.strictEqual(syncRes.data.status, 'Registered on Locari');
    assert.strictEqual(syncRes.data.locari_agent_id, 'loc_agt_999');

    // 7. CSV Export
    const csvRes = await fetch(`${baseUrl}/api/export/csv`);
    assert.strictEqual(csvRes.status, 200);
    const csvText = await csvRes.text();
    assert(csvText.includes('Agent ID,Name,Primary Phone'));
    assert(csvText.includes('+2348055554433'));

    console.log('✅ All API endpoint integration tests passed successfully!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    server.close();
  }
});
