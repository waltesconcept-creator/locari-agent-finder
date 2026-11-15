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

    CREATE INDEX IF NOT EXISTS idx_agents_phone ON agents(primary_phone);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_agents_city ON agents(primary_city);
    CREATE INDEX IF NOT EXISTS idx_agents_lead_score ON agents(lead_score);
    CREATE INDEX IF NOT EXISTS idx_ads_agent ON advertisements(agent_id);
    CREATE INDEX IF NOT EXISTS idx_ads_hash ON advertisements(content_hash);
    CREATE INDEX IF NOT EXISTS idx_outreach_agent ON outreach_logs(agent_id);
  `);

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

// Run DB initialization immediately upon module import
initDatabase();

module.exports = {
  db,
  generateId,
  computeHash,
  initDatabase
};
