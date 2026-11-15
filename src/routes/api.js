/**
 * Locari Agent Finder - REST API Router
 * Provides all endpoints for dashboard analytics, lead discovery, CRM outreach,
 * source tracking, ingestion, and Locari platform integration.
 */

const express = require('express');
const router = express.Router();
const {
  db,
  generateId,
  insertLead,
  getLeads,
  updateLead,
  deleteLead,
  upsertGroup,
  getGroups,
  getGroup,
  resetAllData
} = require('../db.js');
const {
  extractContacts,
  parsePost,
  formatWhatsAppUrl,
  stripHtml
} = require('../nlp/contactExtractor.js');
const { parseRawPost, previewBatchPaste, ingestBatch, parseCSV, splitMultiplePosts } = require('../services/ingestionService.js');
const { resolveAndSaveListing, mergeAgents, refreshAgentProfile } = require('../services/deduplicationService.js');
const {
  checkProfileStatus,
  launchLoginBrowser,
  saveFacebookCookies,
  loadFacebookCookies,
  clearFacebookCookies,
  scanUserJoinedGroups,
  scrapeFacebookGroup,
  scrapeFacebookGroupBatch,
  scrapePropertyPortal,
  sanitizeFacebookGroupUrl,
  getActiveScrapeStatus,
  stopScrapeJob
} = require('../services/facebookScraper.js');

// ==========================================
// 1. DASHBOARD ANALYTICS & STATS
// ==========================================
router.get('/dashboard/stats', (req, res) => {
  try {
    // Lead status counts
    const totalLeads = db.prepare('SELECT COUNT(*) as count FROM agents').get().count;
    const newLeads = db.prepare("SELECT COUNT(*) as count FROM agents WHERE status = 'New'").get().count;
    const qualifiedAgents = db.prepare("SELECT COUNT(*) as count FROM agents WHERE status = 'Qualified' OR likely_role = 'Likely Property Agent'").get().count;
    const contactedLeads = db.prepare("SELECT COUNT(*) as count FROM agents WHERE status = 'Contacted'").get().count;
    const interestedLeads = db.prepare("SELECT COUNT(*) as count FROM agents WHERE status = 'Interested'").get().count;
    const registeredLocari = db.prepare("SELECT COUNT(*) as count FROM agents WHERE status = 'Registered on Locari'").get().count;
    const doNotContact = db.prepare('SELECT COUNT(*) as count FROM agents WHERE do_not_contact = 1').get().count;

    // Advertisement counts
    const totalAds = db.prepare('SELECT COUNT(*) as count FROM advertisements').get().count;

    // City distribution
    const cityBreakdown = db.prepare(`
      SELECT 
        COALESCE(primary_city, 'Unknown') as city, 
        COUNT(*) as count,
        ROUND(AVG(lead_score), 1) as avg_score
      FROM agents
      GROUP BY primary_city
      ORDER BY count DESC
      LIMIT 6
    `).all();

    // Likely role distribution
    const roleBreakdown = db.prepare(`
      SELECT 
        COALESCE(likely_role, 'Unclear') as role, 
        COUNT(*) as count
      FROM agents
      GROUP BY likely_role
      ORDER BY count DESC
    `).all();

    // Top discovery sources by agent yield
    const topSources = db.prepare(`
      SELECT 
        s.id,
        s.name,
        s.platform,
        s.location_covered,
        COUNT(a.id) as total_ads,
        COUNT(DISTINCT a.agent_id) as total_agents
      FROM sources s
      LEFT JOIN advertisements a ON s.id = a.source_id
      GROUP BY s.id
      ORDER BY total_agents DESC, total_ads DESC
      LIMIT 8
    `).all();

    // Recent property advertisements
    const recentAds = db.prepare(`
      SELECT 
        ad.id,
        ad.property_type,
        ad.rent_amount,
        ad.rent_period,
        ad.city,
        ad.neighbourhood,
        ad.raw_text,
        ad.posted_at,
        ad.collected_at,
        ad.original_post_url,
        ag.id as agent_id,
        ag.name as agent_name,
        ag.primary_phone,
        ag.likely_role,
        ag.lead_score,
        s.name as source_name
      FROM advertisements ad
      JOIN agents ag ON ad.agent_id = ag.id
      LEFT JOIN sources s ON ad.source_id = s.id
      ORDER BY ad.collected_at DESC
      LIMIT 10
    `).all();

    // Most active agents
    const mostActiveAgents = db.prepare(`
      SELECT 
        id, name, primary_phone, primary_city, likely_role,
        advertisements_count, lead_score, status, last_active_at
      FROM agents
      ORDER BY advertisements_count DESC, lead_score DESC
      LIMIT 6
    `).all();

    // Ingestion batches summary
    const recentBatches = db.prepare(`
      SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 5
    `).all();

    res.json({
      success: true,
      data: {
        summary: {
          totalLeads,
          newLeads,
          qualifiedAgents,
          contactedLeads,
          interestedLeads,
          registeredLocari,
          doNotContact,
          totalAds
        },
        cityBreakdown,
        roleBreakdown,
        topSources,
        recentAds,
        mostActiveAgents,
        recentBatches
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. AGENTS / LEADS DIRECTORY
// ==========================================
router.get('/agents', (req, res) => {
  try {
    const {
      search = '',
      status = '',
      city = '',
      role = '',
      min_score = 0,
      sort_by = 'last_active_at',
      sort_order = 'DESC',
      page = 1,
      limit = 20
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let whereClauses = ['1=1'];
    let params = [];

    if (search.trim()) {
      whereClauses.push('(name LIKE ? OR primary_phone LIKE ? OR secondary_phone LIKE ? OR primary_location LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    if (status.trim()) {
      whereClauses.push('status = ?');
      params.push(status.trim());
    }

    if (city.trim()) {
      whereClauses.push('primary_city = ?');
      params.push(city.trim());
    }

    if (role.trim()) {
      whereClauses.push('likely_role = ?');
      params.push(role.trim());
    }

    if (parseInt(min_score, 10) > 0) {
      whereClauses.push('lead_score >= ?');
      params.push(parseInt(min_score, 10));
    }

    const whereSql = whereClauses.join(' AND ');

    // Allowed sort columns
    const allowedSort = ['lead_score', 'advertisements_count', 'last_active_at', 'first_discovered_at', 'name'];
    const validSortCol = allowedSort.includes(sort_by) ? sort_by : 'last_active_at';
    const validOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Total matching count
    const countSql = `SELECT COUNT(*) as count FROM agents WHERE ${whereSql}`;
    const totalCount = db.prepare(countSql).get(...params).count;

    // Fetch agents page
    const querySql = `
      SELECT * FROM agents 
      WHERE ${whereSql}
      ORDER BY ${validSortCol} ${validOrder}
      LIMIT ? OFFSET ?
    `;
    const agents = db.prepare(querySql).all(...params, limitNum, offset);

    res.json({
      success: true,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum)
      },
      data: agents
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Single agent details with full ad history and outreach logs
router.get('/agents/:id', (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    const advertisements = db.prepare(`
      SELECT 
        ad.*,
        s.name as source_name,
        s.platform as source_platform
      FROM advertisements ad
      LEFT JOIN sources s ON ad.source_id = s.id
      WHERE ad.agent_id = ?
      ORDER BY ad.posted_at DESC
    `).all(req.params.id);

    const outreachLogs = db.prepare(`
      SELECT * FROM outreach_logs 
      WHERE agent_id = ? 
      ORDER BY contacted_at DESC
    `).all(req.params.id);

    res.json({
      success: true,
      data: {
        agent,
        advertisements,
        outreachLogs
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update agent details or status
router.patch('/agents/:id', (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    const {
      name,
      status,
      primary_city,
      primary_location,
      notes,
      do_not_contact,
      likely_role,
      locari_agent_id
    } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }

    if (primary_city !== undefined) {
      updates.push('primary_city = ?');
      params.push(primary_city);
    }

    if (primary_location !== undefined) {
      updates.push('primary_location = ?');
      params.push(primary_location);
    }

    if (notes !== undefined) {
      updates.push('notes = ?');
      params.push(notes);
    }

    if (do_not_contact !== undefined) {
      updates.push('do_not_contact = ?');
      params.push(do_not_contact ? 1 : 0);
      if (do_not_contact) {
        updates.push("status = 'Do Not Contact'");
      }
    }

    if (likely_role !== undefined) {
      updates.push('likely_role = ?');
      params.push(likely_role);
    }

    if (locari_agent_id !== undefined) {
      updates.push('locari_agent_id = ?');
      params.push(locari_agent_id);
    }

    if (updates.length > 0) {
      updates.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(req.params.id);

      db.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Merge duplicate agents
router.post('/agents/merge', (req, res) => {
  try {
    const { sourceAgentId, targetAgentId } = req.body;
    if (!sourceAgentId || !targetAgentId) {
      return res.status(400).json({ success: false, error: 'Both sourceAgentId and targetAgentId are required.' });
    }

    const merged = mergeAgents(sourceAgentId, targetAgentId);
    res.json({ success: true, data: merged });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete an agent
router.delete('/agents/:id', (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Agent deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. OUTREACH & CONVERSION MANAGEMENT
// ==========================================
router.post('/agents/:id/outreach', (req, res) => {
  try {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    if (agent.do_not_contact === 1) {
      return res.status(400).json({ success: false, error: 'Cannot contact: This lead is on the Do Not Contact list.' });
    }

    const {
      channel = 'Phone Call',
      direction = 'Outbound',
      outcome = 'Conversation',
      notes = '',
      follow_up_date = null,
      conducted_by = 'Locari Scout',
      update_agent_status = null
    } = req.body;

    const logId = generateId('outreach');
    db.prepare(`
      INSERT INTO outreach_logs (
        id, agent_id, channel, direction, outcome, notes,
        follow_up_date, conducted_by, contacted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      agent.id,
      channel,
      direction,
      outcome,
      notes,
      follow_up_date || null,
      conducted_by,
      new Date().toISOString()
    );

    // Auto-update agent status based on outreach outcome if provided
    let newStatus = update_agent_status;
    if (!newStatus) {
      if (outcome === 'Interested') newStatus = 'Interested';
      else if (outcome === 'Not Interested') newStatus = 'Not Interested';
      else if (outcome === 'Registered') newStatus = 'Registered on Locari';
      else if (agent.status === 'New' || agent.status === 'Qualified') newStatus = 'Contacted';
    }

    if (newStatus && newStatus !== agent.status) {
      db.prepare("UPDATE agents SET status = ?, updated_at = ? WHERE id = ?").run(newStatus, new Date().toISOString(), agent.id);
    }

    const logs = db.prepare('SELECT * FROM outreach_logs WHERE agent_id = ? ORDER BY contacted_at DESC').all(agent.id);
    const updatedAgent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id);

    res.json({
      success: true,
      data: {
        agent: updatedAgent,
        outreachLogs: logs
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Pending follow-ups
router.get('/outreach/pending-followups', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const followups = db.prepare(`
      SELECT 
        o.*,
        a.name as agent_name,
        a.primary_phone,
        a.primary_city,
        a.status as agent_status,
        a.lead_score
      FROM outreach_logs o
      JOIN agents a ON o.agent_id = a.id
      WHERE o.follow_up_date IS NOT NULL 
        AND o.follow_up_date <= ?
        AND a.do_not_contact = 0
        AND a.status != 'Registered on Locari'
        AND a.status != 'Not Interested'
      ORDER BY o.follow_up_date ASC
      LIMIT 20
    `).all(today);

    res.json({ success: true, data: followups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. INGESTION PIPELINE
// ==========================================
// Preview multi-post text before saving
router.post('/ingest/preview', (req, res) => {
  try {
    const { rawText, sourceId } = req.body;
    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ success: false, error: 'rawText is required.' });
    }

    let sourceLocation = null;
    if (sourceId) {
      const src = db.prepare('SELECT location_covered FROM sources WHERE id = ?').get(sourceId);
      if (src) sourceLocation = src.location_covered;
    }

    const preview = previewBatchPaste(rawText, { sourceId, sourceLocation });
    res.json({ success: true, data: preview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ingest multi-post text
router.post('/ingest/quick-paste', (req, res) => {
  try {
    const { rawText, sourceId } = req.body;
    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ success: false, error: 'rawText is required.' });
    }

    let sourceLocation = null;
    if (sourceId) {
      const src = db.prepare('SELECT location_covered FROM sources WHERE id = ?').get(sourceId);
      if (src) sourceLocation = src.location_covered;
    }

    const segments = splitMultiplePosts(rawText);
    const summary = ingestBatch(segments, {
      sourceId,
      sourceLocation,
      method: 'Quick-Paste'
    });

    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ingest single post (used by Browser Clipper and Manual Modal)
router.post('/ingest/single', (req, res) => {
  try {
    const {
      rawText,
      posterName,
      sourceId,
      originalPostUrl,
      postedAt,
      method = 'Manual'
    } = req.body;

    if (!rawText) {
      return res.status(400).json({ success: false, error: 'rawText is required.' });
    }

    let sourceLocation = null;
    if (sourceId) {
      const src = db.prepare('SELECT location_covered FROM sources WHERE id = ?').get(sourceId);
      if (src) sourceLocation = src.location_covered;
    }

    const summary = ingestBatch([
      {
        rawText,
        posterName,
        sourceId,
        originalPostUrl,
        postedAt
      }
    ], {
      sourceId,
      sourceLocation,
      method
    });

    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ingest CSV content
router.post('/ingest/csv', (req, res) => {
  try {
    const { csvContent, sourceId } = req.body;
    if (!csvContent || typeof csvContent !== 'string') {
      return res.status(400).json({ success: false, error: 'csvContent is required.' });
    }

    let sourceLocation = null;
    if (sourceId) {
      const src = db.prepare('SELECT location_covered FROM sources WHERE id = ?').get(sourceId);
      if (src) sourceLocation = src.location_covered;
    }

    const items = parseCSV(csvContent, { sourceId, sourceLocation });
    if (items.length === 0) {
      return res.status(400).json({ success: false, error: 'Could not extract valid rows from CSV.' });
    }

    const summary = ingestBatch(items, {
      sourceId,
      sourceLocation,
      method: 'CSV-Upload'
    });

    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5. SOURCES MANAGEMENT
// ==========================================
router.get('/sources', (req, res) => {
  try {
    const sources = db.prepare(`
      SELECT 
        s.*,
        COUNT(a.id) as total_ads,
        COUNT(DISTINCT a.agent_id) as total_agents
      FROM sources s
      LEFT JOIN advertisements a ON s.id = a.source_id
      GROUP BY s.id
      ORDER BY total_agents DESC, s.name ASC
    `).all();

    res.json({ success: true, data: sources });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/sources', (req, res) => {
  try {
    const {
      name,
      platform = 'Facebook',
      group_url,
      location_covered = 'Ibadan',
      source_type = 'Public Group',
      collection_method = 'Browser Clipper / Quick Paste',
      access_status = 'Active'
    } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Source name is required.' });
    }

    const sourceId = generateId('src');
    db.prepare(`
      INSERT INTO sources (
        id, name, platform, group_url, location_covered,
        source_type, collection_method, access_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sourceId,
      name.trim(),
      platform,
      group_url || null,
      location_covered,
      source_type,
      collection_method,
      access_status
    );

    const created = db.prepare('SELECT * FROM sources WHERE id = ?').get(sourceId);
    res.json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/sources/:id', (req, res) => {
  try {
    const { name, group_url, location_covered, access_status, collection_method } = req.body;
    const updates = [];
    const params = [];

    if (name) { updates.push('name = ?'); params.push(name.trim()); }
    if (group_url !== undefined) { updates.push('group_url = ?'); params.push(group_url); }
    if (location_covered) { updates.push('location_covered = ?'); params.push(location_covered); }
    if (access_status) { updates.push('access_status = ?'); params.push(access_status); }
    if (collection_method) { updates.push('collection_method = ?'); params.push(collection_method); }

    if (updates.length > 0) {
      params.push(req.params.id);
      db.prepare(`UPDATE sources SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = db.prepare('SELECT * FROM sources WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/sources/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM sources WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Source deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 6. LOCARI INTEGRATION & CSV EXPORT
// ==========================================
// Export filtered agents as CSV
router.get('/export/csv', (req, res) => {
  try {
    const { status = '', city = '', min_score = 0 } = req.query;

    let whereClauses = ['1=1'];
    let params = [];

    if (status.trim()) {
      whereClauses.push('status = ?');
      params.push(status.trim());
    }
    if (city.trim()) {
      whereClauses.push('primary_city = ?');
      params.push(city.trim());
    }
    if (parseInt(min_score, 10) > 0) {
      whereClauses.push('lead_score >= ?');
      params.push(parseInt(min_score, 10));
    }

    const agents = db.prepare(`
      SELECT 
        id, name, primary_phone, secondary_phone, whatsapp_phone,
        primary_city, primary_location, likely_role, advertisements_count,
        lead_score, status, first_discovered_at, last_active_at,
        do_not_contact, notes
      FROM agents
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY lead_score DESC
    `).all(...params);

    // Build CSV
    const headers = [
      'Agent ID', 'Name', 'Primary Phone', 'Secondary Phone', 'WhatsApp',
      'City', 'Location', 'Likely Role', 'Ads Count', 'Lead Score',
      'Status', 'First Discovered', 'Last Active', 'Do Not Contact', 'Notes'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [headers.join(',')];
    for (const a of agents) {
      csvRows.push([
        escapeCsv(a.id),
        escapeCsv(a.name),
        escapeCsv(a.primary_phone),
        escapeCsv(a.secondary_phone),
        escapeCsv(a.whatsapp_phone),
        escapeCsv(a.primary_city),
        escapeCsv(a.primary_location),
        escapeCsv(a.likely_role),
        escapeCsv(a.advertisements_count),
        escapeCsv(a.lead_score),
        escapeCsv(a.status),
        escapeCsv(a.first_discovered_at),
        escapeCsv(a.last_active_at),
        escapeCsv(a.do_not_contact ? 'Yes' : 'No'),
        escapeCsv(a.notes)
      ].join(','));
    }

    const csvData = csvRows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="locari_agents_${Date.now()}.csv"`);
    res.send(csvData);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mark agent as registered on Locari / sync payload
router.post('/locari/sync/:id', (req, res) => {
  try {
    const { locari_agent_id = null } = req.body;
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    if (!agent) {
      return res.status(404).json({ success: false, error: 'Agent not found' });
    }

    const assignedId = locari_agent_id || `locari_${Date.now()}`;
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE agents SET 
        status = 'Registered on Locari',
        locari_agent_id = ?,
        updated_at = ?
      WHERE id = ?
    `).run(assignedId, now, agent.id);

    // Log the conversion
    db.prepare(`
      INSERT INTO outreach_logs (
        id, agent_id, channel, direction, outcome, notes, conducted_by, contacted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      generateId('outreach'),
      agent.id,
      'Locari Platform Sync',
      'Inbound',
      'Registered',
      `Registered as verified Locari agent (Locari ID: ${assignedId})`,
      'System Sync',
      now
    );

    const updated = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id);
    res.json({
      success: true,
      message: 'Agent successfully synced to Locari platform',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 7. BROWSER CLIPPER BOOKMARKLET GENERATOR
// ==========================================
router.get('/clipper/bookmarklet', (req, res) => {
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol || 'http';
  const serverUrl = `${protocol}://${host}/api/ingest/single`;

  // JavaScript bookmarklet code that captures selected text or current post and posts to the API
  const bookmarkletCode = `javascript:(function(){
    var selectedText = window.getSelection().toString().trim();
    var currentUrl = window.location.href;
    var postText = selectedText;
    if(!postText) {
      postText = prompt("Paste or confirm the Facebook / property post text to send to Locari Agent Finder:");
    }
    if(!postText) return;
    
    var posterName = prompt("Poster Name (leave blank to auto-detect):", "");
    
    fetch('${serverUrl}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: postText,
        posterName: posterName || undefined,
        originalPostUrl: currentUrl,
        method: 'Browser-Clipper'
      })
    })
    .then(function(r){ return r.json(); })
    .then(function(res){
      if(res.success && res.data.postsImported > 0) {
        alert("✅ Successfully clipped to Locari Agent Finder! Discovered/Updated: " + res.data.results[0].agentName + " (" + res.data.results[0].propertyType + ")");
      } else if(res.data && res.data.duplicatesDetected > 0) {
        alert("ℹ️ Post was already recorded in Locari Agent Finder (Duplicate prevented).");
      } else {
        alert("⚠️ Locari Notice: " + (res.data.errors && res.data.errors[0] ? res.data.errors[0].reason : "No phone number found in post."));
      }
    })
    .catch(function(err){
      alert("❌ Could not connect to Locari Agent Finder. Ensure the local server is running on " + '${serverUrl}');
    });
  })();`;

  res.json({
    success: true,
    data: {
      serverUrl,
      bookmarkletCode
    }
  });
});

// ==========================================
// 8. AUTOMATED FACEBOOK & PORTAL SCRAPER
// ==========================================
// Scraper status & active job polling
router.get('/scraper/status', (req, res) => {
  try {
    const profile = checkProfileStatus();
    const activeJob = getActiveScrapeStatus();
    res.json({
      success: true,
      data: {
        profile,
        activeJob
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Launch visible Chrome for user to log into Facebook once and auto-save session
router.post('/scraper/launch-login', (req, res) => {
  try {
    launchLoginBrowser().catch(err => {
      console.error('Interactive login error:', err);
    });
    res.json({
      success: true,
      message: 'Interactive Chrome login window opened. Please log into Facebook in the opened window.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Save Facebook session cookies
router.post('/scraper/cookies', (req, res) => {
  try {
    const { cookies } = req.body;
    if (!cookies) {
      return res.status(400).json({ success: false, error: 'Please provide Facebook cookies (c_user and xs)' });
    }
    const result = saveFacebookCookies(cookies);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Clear Facebook session cookies
router.delete('/scraper/cookies', (req, res) => {
  try {
    const result = clearFacebookCookies();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start scraping a Facebook Group URL
router.post('/scraper/start-group', (req, res) => {
  try {
    const {
      groupUrl,
      maxPosts = 25,
      maxScrolls = 10,
      headless = false,
      sourceId = null
    } = req.body;

    const cleanUrl = sanitizeFacebookGroupUrl(groupUrl);
    if (!cleanUrl) {
      return res.status(400).json({
        success: false,
        error: `Please provide a valid Facebook group URL (e.g. https://www.facebook.com/groups/... or https://web.facebook.com/share/g/...)`
      });
    }

    const currentJob = getActiveScrapeStatus();
    if (currentJob.running) {
      return res.status(400).json({
        success: false,
        error: 'A scrape job is already currently running. Please wait for it to finish or stop it.'
      });
    }

    // Run scraper asynchronously in background with clean sanitized URL
    scrapeFacebookGroup(cleanUrl, {
      maxPosts: parseInt(maxPosts, 10) || 25,
      maxScrolls: parseInt(maxScrolls, 10) || 10,
      headless: Boolean(headless),
      sourceId
    }).catch(err => {
      console.error('Scraper async run failed:', err);
    });

    res.json({
      success: true,
      message: 'Automated Facebook group scrape initiated.',
      data: {
        groupUrl: cleanUrl,
        maxPosts,
        headless
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Scan user's joined Facebook Groups
router.post('/scraper/my-groups', async (req, res) => {
  try {
    const { headless = true } = req.body;
    const groups = await scanUserJoinedGroups({ headless });
    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Start batch scrape across multiple Facebook Groups
router.post('/scraper/start-batch', (req, res) => {
  try {
    const { groupUrls, maxPosts = 25, maxScrolls = 8, headless = true } = req.body;
    if (!Array.isArray(groupUrls) || groupUrls.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide a list of group URLs' });
    }

    const cleanedUrls = groupUrls.map(u => sanitizeFacebookGroupUrl(u)).filter(Boolean);
    if (cleanedUrls.length === 0) {
      return res.status(400).json({ success: false, error: 'None of the provided URLs are valid Facebook group links.' });
    }

    const currentJob = getActiveScrapeStatus();
    if (currentJob.running) {
      return res.status(400).json({ success: false, error: 'A scrape job is already currently running.' });
    }

    scrapeFacebookGroupBatch(cleanedUrls, {
      maxPosts: parseInt(maxPosts, 10) || 25,
      maxScrolls: parseInt(maxScrolls, 10) || 8,
      headless: Boolean(headless)
    }).catch(err => {
      console.error('Batch scrape failed:', err);
    });

    res.json({ success: true, message: `Batch scrape across ${cleanedUrls.length} groups started.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start scraping a property portal
router.post('/scraper/start-portal', (req, res) => {
  try {
    const { portalUrl, maxPages = 3, headless = true, sourceId = null } = req.body;
    if (!portalUrl) {
      return res.status(400).json({ success: false, error: 'portalUrl is required' });
    }

    const currentJob = getActiveScrapeStatus();
    if (currentJob.running) {
      return res.status(400).json({ success: false, error: 'A scrape job is already running.' });
    }

    scrapePropertyPortal(portalUrl.trim(), {
      maxPages: parseInt(maxPages, 10) || 3,
      headless: Boolean(headless),
      sourceId
    }).catch(err => {
      console.error('Portal scraper async run failed:', err);
    });

    res.json({
      success: true,
      message: 'Portal scrape initiated.',
      data: { portalUrl, maxPages }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stop active scrape job
router.post('/scraper/stop', (req, res) => {
  const result = stopScrapeJob();
  res.json({ success: true, message: result.message });
});

// Reset / wipe all test and lead records from database
router.post('/database/reset', (req, res) => {
  try {
    resetAllData();
    res.json({
      success: true,
      message: 'All test, agent, and lead records successfully wiped from database.'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 8. LEADS & FACEBOOK GROUPS CRM ENDPOINTS
// ==========================================

// Get all leads with search, filters, and pagination
router.get('/leads', (req, res) => {
  try {
    const {
      search = '',
      groupId = '',
      hasPhone,
      hasWhatsApp,
      hasEmail,
      status = '',
      page = 1,
      limit = 20
    } = req.query;

    const result = getLeads({
      search,
      groupId,
      hasPhone: hasPhone === 'true' || hasPhone === true,
      hasWhatsApp: hasWhatsApp === 'true' || hasWhatsApp === true,
      hasEmail: hasEmail === 'true' || hasEmail === true,
      status,
      page,
      limit
    });

    res.json({
      success: true,
      pagination: result.pagination,
      data: result.leads
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create lead manually
router.post('/leads', (req, res) => {
  try {
    const {
      groupId = null,
      agentName = 'Verified Agent',
      phoneNumber = null,
      formattedWhatsApp = null,
      email = null,
      postSnippet = '',
      postUrl = null,
      status = 'New'
    } = req.body;

    if (!agentName && !phoneNumber) {
      return res.status(400).json({ success: false, error: 'agentName or phoneNumber is required.' });
    }

    const lead = insertLead({
      groupId,
      agentName,
      phoneNumber,
      formattedWhatsApp: formattedWhatsApp || (phoneNumber ? formatWhatsAppUrl(phoneNumber) : null),
      email,
      postSnippet,
      postUrl,
      status: status || 'New'
    });

    res.status(201).json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update lead (status, contact, details)
router.put('/leads/:id', (req, res) => {
  try {
    const updated = updateLead(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Lead not found.' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete lead
router.delete('/leads/:id', (req, res) => {
  try {
    const ok = deleteLead(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Lead not found.' });
    }
    res.json({ success: true, message: 'Lead deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Export Leads as CSV
router.get('/leads/export/csv', (req, res) => {
  try {
    const { search = '', groupId = '', status = '', hasPhone, hasWhatsApp, hasEmail } = req.query;
    const { leads } = getLeads({
      search,
      groupId,
      status,
      hasPhone: hasPhone === 'true' || hasPhone === true,
      hasWhatsApp: hasWhatsApp === 'true' || hasWhatsApp === true,
      hasEmail: hasEmail === 'true' || hasEmail === true,
      page: 1,
      limit: 10000
    });

    const headers = [
      'Lead ID', 'Group ID', 'Group Name', 'Agent Name', 'Phone Number',
      'WhatsApp URL', 'Email', 'Post Snippet', 'Post URL', 'Scraped At', 'Status'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = [headers.join(',')];
    for (const l of leads) {
      csvRows.push([
        escapeCsv(l.id),
        escapeCsv(l.groupId),
        escapeCsv(l.groupName || ''),
        escapeCsv(l.agentName),
        escapeCsv(l.phoneNumber || ''),
        escapeCsv(l.formattedWhatsApp || ''),
        escapeCsv(l.email || ''),
        escapeCsv(l.postSnippet || ''),
        escapeCsv(l.postUrl || ''),
        escapeCsv(l.scrapedAt),
        escapeCsv(l.status)
      ].join(','));
    }

    const csvData = csvRows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="locarie_leads_${Date.now()}.csv"`);
    res.status(200).send(csvData);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Groups list
router.get('/groups', (req, res) => {
  try {
    const groups = getGroups();
    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Upsert Group
router.post('/groups', (req, res) => {
  try {
    const { name, url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'url is required.' });
    }
    const group = upsertGroup({ name, url });
    res.status(201).json({ success: true, data: group });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 9. RAW HTML / TEXT DIRECT INGEST (FAIL-SAFE)
// ==========================================
router.post('/ingest/raw', (req, res) => {
  try {
    const { rawContent, groupUrl, groupName } = req.body;
    if (!rawContent || typeof rawContent !== 'string') {
      return res.status(400).json({ success: false, error: 'rawContent (text or HTML) is required.' });
    }

    // Register or upsert group
    let group = null;
    if (groupUrl || groupName) {
      group = upsertGroup({
        name: groupName || 'Direct Ingest Group',
        url: groupUrl || `https://web.facebook.com/groups/direct_ingest_${Date.now()}`,
        last_scraped_at: new Date().toISOString()
      });
    }

    // Split content into posts if multiple posts pasted
    let rawSegments = [];
    if (/<article\b|role=["']article["']/i.test(rawContent)) {
      const parts = rawContent.split(/<article\b|role=["']article["']/i);
      rawSegments = parts.filter(s => s && s.trim().length > 30);
    } else {
      rawSegments = splitMultiplePosts(rawContent);
    }

    if (rawSegments.length === 0) {
      rawSegments = [rawContent];
    }

    const savedLeads = [];
    for (const segment of rawSegments) {
      const parsed = parsePost(segment, { groupId: group ? group.id : null });
      if (parsed.phoneNumber || parsed.email || parsed.formattedWhatsApp) {
        const lead = insertLead({
          groupId: group ? group.id : null,
          agentName: parsed.agentName,
          phoneNumber: parsed.phoneNumber,
          formattedWhatsApp: parsed.formattedWhatsApp,
          email: parsed.email,
          postSnippet: parsed.postSnippet,
          postUrl: group ? group.url : null,
          status: 'New'
        });
        savedLeads.push(lead);
      }
    }

    // If split did not yield any contact, parse whole content as single block
    if (savedLeads.length === 0) {
      const parsed = parsePost(rawContent, { groupId: group ? group.id : null });
      if (parsed.phoneNumber || parsed.email || parsed.formattedWhatsApp) {
        const lead = insertLead({
          groupId: group ? group.id : null,
          agentName: parsed.agentName,
          phoneNumber: parsed.phoneNumber,
          formattedWhatsApp: parsed.formattedWhatsApp,
          email: parsed.email,
          postSnippet: parsed.postSnippet,
          postUrl: group ? group.url : null,
          status: 'New'
        });
        savedLeads.push(lead);
      }
    }

    res.json({
      success: true,
      data: {
        totalSegments: rawSegments.length,
        leadsCreated: savedLeads.length,
        leads: savedLeads,
        group
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
