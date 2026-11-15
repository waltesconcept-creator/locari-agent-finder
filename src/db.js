const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.LOCARI_DB_PATH || path.join(DATA_DIR, 'locari_agent_finder.db');
const db = new DatabaseSync(DB_PATH);

// Enable Foreign Keys & WAL (Write-Ahead Logging) for concurrent read performance
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'Facebook',
      group_url TEXT,
      location_covered TEXT,
      source_type TEXT DEFAULT 'Public Group',
      collection_method TEXT DEFAULT 'Browser Clipper / Quick Paste',
      access_status TEXT DEFAULT 'Active',
      last_successful_collection DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT,
      primary_phone TEXT UNIQUE NOT NULL,
      secondary_phone TEXT,
      whatsapp_phone TEXT,
      primary_city TEXT,
      primary_location TEXT,
      likely_role TEXT DEFAULT 'Unclear',
      advertisements_count INTEGER DEFAULT 1,
      lead_score INTEGER DEFAULT 0,
      score_breakdown TEXT,
      status TEXT DEFAULT 'New',
      first_discovered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      do_not_contact INTEGER DEFAULT 0,
      notes TEXT,
      locari_agent_id TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS advertisements (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      source_id TEXT,
      raw_text TEXT NOT NULL,
      property_type TEXT,
      rent_amount NUMERIC,
      rent_period TEXT DEFAULT 'annum',
      city TEXT,
      neighbourhood TEXT,
      features_json TEXT,
      original_post_url TEXT,
      posted_at DATETIME,
      collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      content_hash TEXT UNIQUE,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS outreach_logs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      direction TEXT DEFAULT 'Outbound',
      outcome TEXT NOT NULL,
      notes TEXT,
      follow_up_date DATE,
      conducted_by TEXT DEFAULT 'Locari Scout',
      contacted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      source_id TEXT,
      method TEXT NOT NULL,
      posts_received INTEGER DEFAULT 0,
      posts_imported INTEGER DEFAULT 0,
      duplicates_detected INTEGER DEFAULT 0,
      agents_created INTEGER DEFAULT 0,
      agents_updated INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
    );

    -- Core Facebook Group & Lead Schema
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      last_scraped_at DATETIME,
      total_leads INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      groupId TEXT,
      agentName TEXT NOT NULL,
      phoneNumber TEXT,
      formattedWhatsApp TEXT,
      email TEXT,
      propertyType TEXT,
      location TEXT,
      price TEXT,
      postSnippet TEXT,
      postUrl TEXT,
      scrapedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'New' CHECK(status IN ('New', 'Contacted', 'Closed', 'Qualified', 'Interested', 'Do Not Contact')),
      FOREIGN KEY (groupId) REFERENCES groups(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agents_phone ON agents(primary_phone);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_agents_city ON agents(primary_city);
    CREATE INDEX IF NOT EXISTS idx_agents_lead_score ON agents(lead_score);
    CREATE INDEX IF NOT EXISTS idx_ads_agent ON advertisements(agent_id);
    CREATE INDEX IF NOT EXISTS idx_ads_hash ON advertisements(content_hash);
    CREATE INDEX IF NOT EXISTS idx_outreach_agent ON outreach_logs(agent_id);

    CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phoneNumber);
    CREATE INDEX IF NOT EXISTS idx_leads_group ON leads(groupId);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_scraped ON leads(scrapedAt);
    CREATE INDEX IF NOT EXISTS idx_groups_url ON groups(url);
  `);

  // Migrate leads table columns if they do not exist
  try {
    const leadCols = db.prepare('PRAGMA table_info(leads)').all().map(c => c.name);
    if (!leadCols.includes('propertyType')) db.exec('ALTER TABLE leads ADD COLUMN propertyType TEXT;');
    if (!leadCols.includes('location')) db.exec('ALTER TABLE leads ADD COLUMN location TEXT;');
    if (!leadCols.includes('price')) db.exec('ALTER TABLE leads ADD COLUMN price TEXT;');
  } catch (_) {}

  // Seed standard Nigerian property discovery sources if none exist
  seedDefaultSources();
}

function seedDefaultSources() {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM sources').get();
  if (countRow && countRow.count > 0) return;

  const defaultSources = [
    {
      id: 'src_ibadan_prop_1',
      name: 'Ibadan Real Estate & Houses For Rent',
      platform: 'Facebook',
      group_url: 'https://www.facebook.com/groups/ibadanrealestateandapartments',
      location_covered: 'Ibadan',
      source_type: 'Public Group',
      collection_method: 'Browser Clipper / Quick Paste',
      access_status: 'Active'
    },
    {
      id: 'src_ibadan_prop_2',
      name: 'Houses for Rent in Ibadan (Bodija, Akobo, UI, Oluyole)',
      platform: 'Facebook',
      group_url: 'https://www.facebook.com/groups/housesforrentinibadan',
      location_covered: 'Ibadan',
      source_type: 'Public Group',
      collection_method: 'Browser Clipper / Quick Paste',
      access_status: 'Active'
    },
    {
      id: 'src_lagos_rentals_1',
      name: 'Lagos Apartments & Flat Renters Club',
      platform: 'Facebook',
      group_url: 'https://www.facebook.com/groups/lagosapartmentsrentals',
      location_covered: 'Lagos',
      source_type: 'Public Group',
      collection_method: 'Browser Clipper / Quick Paste',
      access_status: 'Active'
    },
    {
      id: 'src_lagos_mainland',
      name: 'Yaba, Surulere & Ikeja Property Direct Agents',
      platform: 'Facebook',
      group_url: 'https://www.facebook.com/groups/lagosmainlandrentals',
      location_covered: 'Lagos',
      source_type: 'Public Group',
      collection_method: 'Browser Clipper / Quick Paste',
      access_status: 'Active'
    },
    {
      id: 'src_direct_whatsapp',
      name: 'Direct Agent WhatsApp Broadcast Groups',
      platform: 'WhatsApp',
      group_url: 'https://chat.whatsapp.com/',
      location_covered: 'Nationwide',
      source_type: 'WhatsApp Broadcast',
      collection_method: 'Quick Paste',
      access_status: 'Active'
    }
  ];

  const stmt = db.prepare(`
    INSERT INTO sources (id, name, platform, group_url, location_covered, source_type, collection_method, access_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const src of defaultSources) {
    stmt.run(src.id, src.name, src.platform, src.group_url, src.location_covered, src.source_type, src.collection_method, src.access_status);
  }
}

// Generate unique ID helper
function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

// Compute hash of content for duplicate detection
function computeHash(text) {
  const normalized = (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// ==========================================
// GROUPS & LEADS CRM HELPERS
// ==========================================

function upsertGroup({ id, name, url, last_scraped_at, total_leads }) {
  const existing = db.prepare('SELECT * FROM groups WHERE url = ? OR id = ?').get(url || '', id || '');
  const groupId = existing ? existing.id : (id || generateId('grp'));
  const groupName = name || (existing ? existing.name : 'Facebook Group');
  const scrapedAt = last_scraped_at || (existing ? existing.last_scraped_at : new Date().toISOString());

  if (existing) {
    db.prepare(`
      UPDATE groups 
      SET name = COALESCE(?, name),
          last_scraped_at = COALESCE(?, last_scraped_at),
          total_leads = (SELECT COUNT(*) FROM leads WHERE groupId = groups.id)
      WHERE id = ?
    `).run(name, scrapedAt, existing.id);
    return db.prepare('SELECT * FROM groups WHERE id = ?').get(existing.id);
  } else {
    db.prepare(`
      INSERT INTO groups (id, name, url, last_scraped_at, total_leads)
      VALUES (?, ?, ?, ?, ?)
    `).run(groupId, groupName, url, scrapedAt, total_leads || 0);
    return db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  }
}

function getGroups() {
  return db.prepare(`
    SELECT g.*, COUNT(l.id) as current_leads_count 
    FROM groups g
    LEFT JOIN leads l ON g.id = l.groupId
    GROUP BY g.id
    ORDER BY g.last_scraped_at DESC
  `).all();
}

function getGroup(id) {
  return db.prepare('SELECT * FROM groups WHERE id = ?').get(id);
}

function insertLead({
  groupId = null,
  agentName = 'Verified Agent',
  phoneNumber = null,
  formattedWhatsApp = null,
  email = null,
  propertyType = null,
  location = null,
  price = null,
  postSnippet = '',
  postUrl = null,
  status = 'New',
  scrapedAt = new Date().toISOString()
}) {
  const id = generateId('lead');

  // Check for duplicate by phone or postUrl if provided
  let existing = null;
  if (phoneNumber) {
    existing = db.prepare('SELECT * FROM leads WHERE phoneNumber = ?').get(phoneNumber);
  } else if (postUrl) {
    existing = db.prepare('SELECT * FROM leads WHERE postUrl = ?').get(postUrl);
  }

  if (existing) {
    // Update existing lead with latest info
    db.prepare(`
      UPDATE leads 
      SET agentName = COALESCE(?, agentName),
          formattedWhatsApp = COALESCE(?, formattedWhatsApp),
          email = COALESCE(?, email),
          propertyType = COALESCE(?, propertyType),
          location = COALESCE(?, location),
          price = COALESCE(?, price),
          postSnippet = COALESCE(?, postSnippet),
          scrapedAt = ?
      WHERE id = ?
    `).run(agentName, formattedWhatsApp, email, propertyType, location, price, postSnippet, scrapedAt, existing.id);
    return db.prepare('SELECT * FROM leads WHERE id = ?').get(existing.id);
  }

  db.prepare(`
    INSERT INTO leads (id, groupId, agentName, phoneNumber, formattedWhatsApp, email, propertyType, location, price, postSnippet, postUrl, scrapedAt, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, groupId, agentName, phoneNumber, formattedWhatsApp, email, propertyType, location, price, postSnippet, postUrl, scrapedAt, status);

  // Update total leads count in group if groupId provided
  if (groupId) {
    db.prepare('UPDATE groups SET total_leads = (SELECT COUNT(*) FROM leads WHERE groupId = ?) WHERE id = ?').run(groupId, groupId);
  }

  return db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
}

function getLeads({
  search = '',
  groupId = '',
  hasPhone = false,
  hasWhatsApp = false,
  hasEmail = false,
  status = '',
  page = 1,
  limit = 20
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;

  const where = ['1=1'];
  const params = [];

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    where.push('(agentName LIKE ? OR phoneNumber LIKE ? OR postSnippet LIKE ? OR email LIKE ? OR propertyType LIKE ? OR location LIKE ? OR price LIKE ?)');
    params.push(s, s, s, s, s, s, s);
  }

  if (groupId && groupId.trim()) {
    where.push('groupId = ?');
    params.push(groupId.trim());
  }

  if (status && status.trim()) {
    where.push('status = ?');
    params.push(status.trim());
  }

  if (hasPhone === true || hasPhone === 'true') {
    where.push("phoneNumber IS NOT NULL AND phoneNumber != ''");
  }

  if (hasWhatsApp === true || hasWhatsApp === 'true') {
    where.push("formattedWhatsApp IS NOT NULL AND formattedWhatsApp != ''");
  }

  if (hasEmail === true || hasEmail === 'true') {
    where.push("email IS NOT NULL AND email != ''");
  }

  const whereSql = where.join(' AND ');
  const totalCount = db.prepare(`SELECT COUNT(*) as count FROM leads WHERE ${whereSql}`).get(...params).count;

  const leads = db.prepare(`
    SELECT l.*, g.name as groupName, g.url as groupUrl
    FROM leads l
    LEFT JOIN groups g ON l.groupId = g.id
    WHERE ${whereSql}
    ORDER BY l.scrapedAt DESC
    LIMIT ? OFFSET ?
  `).all(...params, limitNum, offset);

  return {
    leads,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limitNum)
    }
  };
}

function updateLead(id, updates = {}) {
  const allowed = ['agentName', 'phoneNumber', 'formattedWhatsApp', 'email', 'propertyType', 'location', 'price', 'postSnippet', 'status'];
  const setClauses = [];
  const params = [];

  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }
  }

  if (setClauses.length === 0) return db.prepare('SELECT * FROM leads WHERE id = ?').get(id);

  params.push(id);
  db.prepare(`UPDATE leads SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
  return db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
}

function deleteLead(id) {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  if (!lead) return false;
  db.prepare('DELETE FROM leads WHERE id = ?').run(id);
  if (lead.groupId) {
    db.prepare('UPDATE groups SET total_leads = (SELECT COUNT(*) FROM leads WHERE groupId = ?) WHERE id = ?').run(lead.groupId, lead.groupId);
  }
  return true;
}

function resetAllData() {
  db.exec(`
    DELETE FROM leads;
    DELETE FROM advertisements;
    DELETE FROM outreach_logs;
    DELETE FROM import_batches;
    DELETE FROM agents;
    UPDATE groups SET total_leads = 0;
  `);
  return true;
}

// Run DB initialization immediately upon module import
initDatabase();

module.exports = {
  db,
  generateId,
  computeHash,
  initDatabase,
  upsertGroup,
  getGroups,
  getGroup,
  insertLead,
  getLeads,
  updateLead,
  deleteLead,
  resetAllData
};
