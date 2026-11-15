/**
 * Deduplication & Entity Resolution Service
 * Ensures contacts are unified by normalized phone number across different groups,
 * preserves comprehensive advertisement history, and updates lead score dynamically.
 */

const { db, generateId, computeHash } = require('../db.js');
const { classifyAgentRole, calculateLeadScore } = require('../nlp/agentClassifier.js');

/**
 * Ingests a single parsed advertisement, resolves or creates the agent entity,
 * updates lead statistics, and stores the advertisement record.
 * 
 * @param {Object} data
 * @param {string} data.rawText
 * @param {string} data.posterName
 * @param {string} data.primaryPhone
 * @param {string} [data.secondaryPhone]
 * @param {string} [data.whatsappPhone]
 * @param {string} data.propertyType
 * @param {number} [data.rentAmount]
 * @param {string} [data.rentPeriod]
 * @param {string} data.city
 * @param {string} [data.neighbourhood]
 * @param {Array<string>} [data.features]
 * @param {string} [data.sourceId]
 * @param {string} [data.originalPostUrl]
 * @param {string|Date} [data.postedAt]
 * @returns {Object} { agent, advertisement, isNewAgent, isDuplicatePost }
 */
function resolveAndSaveListing(data) {
  const {
    rawText,
    posterName,
    primaryPhone,
    secondaryPhone,
    whatsappPhone,
    propertyType,
    rentAmount,
    rentPeriod = 'annum',
    city,
    neighbourhood,
    features = [],
    sourceId,
    originalPostUrl,
    postedAt = new Date().toISOString()
  } = data;

  if (!primaryPhone) {
    throw new Error('A valid normalized phone number is required to resolve or create an agent.');
  }

  // 1. Check for identical post duplicate via content hash
  const contentHash = computeHash(rawText);
  const existingAd = db.prepare('SELECT * FROM advertisements WHERE content_hash = ?').get(contentHash);

  if (existingAd) {
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(existingAd.agent_id);
    return {
      agent,
      advertisement: existingAd,
      isNewAgent: false,
      isDuplicatePost: true
    };
  }

  // 2. Find existing agent by primary_phone (or secondary / whatsapp)
  let agent = db.prepare(`
    SELECT * FROM agents 
    WHERE primary_phone = ? OR secondary_phone = ? OR whatsapp_phone = ?
  `).get(primaryPhone, primaryPhone, primaryPhone);

  let isNewAgent = false;
  const now = new Date().toISOString();
  const adPostedAt = postedAt ? new Date(postedAt).toISOString() : now;

  if (!agent) {
    // Create new agent
    isNewAgent = true;
    const newAgentId = generateId('agent');
    const initialName = posterName ? posterName.trim() : `Agent (${primaryPhone.slice(-4)})`;
    const initialCity = city || 'Unknown';

    db.prepare(`
      INSERT INTO agents (
        id, name, primary_phone, secondary_phone, whatsapp_phone,
        primary_city, primary_location, likely_role, advertisements_count,
        lead_score, score_breakdown, status, first_discovered_at, last_active_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newAgentId,
      initialName,
      primaryPhone,
      secondaryPhone || null,
      whatsappPhone || primaryPhone,
      initialCity,
      neighbourhood || null,
      'Unclear',
      1,
      0,
      '{}',
      'New',
      adPostedAt,
      adPostedAt,
      now
    );

    agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(newAgentId);
  } else {
    // Update existing agent metadata if new information is more complete
    let updateFields = [];
    let updateParams = [];

    // If poster has a real name and existing agent has default or empty name
    if (posterName && (!agent.name || agent.name.startsWith('Agent ('))) {
      updateFields.push('name = ?');
      updateParams.push(posterName.trim());
    }

    if (secondaryPhone && !agent.secondary_phone && secondaryPhone !== agent.primary_phone) {
      updateFields.push('secondary_phone = ?');
      updateParams.push(secondaryPhone);
    }

    if (whatsappPhone && !agent.whatsapp_phone) {
      updateFields.push('whatsapp_phone = ?');
      updateParams.push(whatsappPhone);
    }

    // Update last_active_at if this post is newer
    if (new Date(adPostedAt) > new Date(agent.last_active_at)) {
      updateFields.push('last_active_at = ?');
      updateParams.push(adPostedAt);
    }

    if (city && city !== 'Unknown' && (!agent.primary_city || agent.primary_city === 'Unknown')) {
      updateFields.push('primary_city = ?');
      updateParams.push(city);
    }

    if (neighbourhood && !agent.primary_location) {
      updateFields.push('primary_location = ?');
      updateParams.push(neighbourhood);
    }

    if (updateFields.length > 0) {
      updateFields.push('updated_at = ?');
      updateParams.push(now);
      updateParams.push(agent.id);
      db.prepare(`UPDATE agents SET ${updateFields.join(', ')} WHERE id = ?`).run(...updateParams);
      agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id);
    }
  }

  // 3. Insert the new advertisement
  const newAdId = generateId('ad');
  db.prepare(`
    INSERT INTO advertisements (
      id, agent_id, source_id, raw_text, property_type, rent_amount,
      rent_period, city, neighbourhood, features_json, original_post_url,
      posted_at, content_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    newAdId,
    agent.id,
    sourceId || null,
    rawText,
    propertyType || 'Unspecified',
    rentAmount || null,
    rentPeriod,
    city || 'Unknown',
    neighbourhood || null,
    JSON.stringify(features),
    originalPostUrl || null,
    adPostedAt,
    contentHash
  );

  const savedAd = db.prepare('SELECT * FROM advertisements WHERE id = ?').get(newAdId);

  // 4. Update source's last_successful_collection timestamp if sourceId was provided
  if (sourceId) {
    db.prepare('UPDATE sources SET last_successful_collection = ? WHERE id = ?').run(now, sourceId);
  }

  // 5. Recalculate agent aggregate metrics, role classification, and lead score
  refreshAgentProfile(agent.id);

  const updatedAgent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agent.id);

  return {
    agent: updatedAgent,
    advertisement: savedAd,
    isNewAgent,
    isDuplicatePost: false
  };
}

/**
 * Re-analyzes all advertisements for an agent and recalculates role & lead score
 * @param {string} agentId 
 */
function refreshAgentProfile(agentId) {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
  if (!agent) return;

  const ads = db.prepare(`
    SELECT * FROM advertisements 
    WHERE agent_id = ? 
    ORDER BY posted_at DESC
  `).all(agentId);

  const adCount = ads.length;
  if (adCount === 0) return;

  const allTexts = ads.map(a => a.raw_text);
  const locations = [...new Set(ads.map(a => a.neighbourhood || a.city).filter(Boolean))];
  const propertyTypes = [...new Set(ads.map(a => a.property_type).filter(t => t && t !== 'Unspecified'))];
  const mostRecentAd = ads[0];

  // 1. Role Classification
  const likelyRole = classifyAgentRole({
    adCount,
    allTexts,
    locations,
    propertyTypes
  });

  // 2. Lead Scoring
  const hasName = Boolean(agent.name && !agent.name.startsWith('Agent ('));
  const hasWhatsapp = Boolean(agent.whatsapp_phone);
  const scoreResult = calculateLeadScore({
    adCount,
    lastActiveDate: mostRecentAd.posted_at || agent.last_active_at,
    distinctLocationsCount: locations.length || 1,
    distinctTypesCount: propertyTypes.length || 1,
    hasName,
    hasWhatsapp,
    primaryCity: agent.primary_city || 'Unknown'
  });

  // 3. Status adjustment: If currently 'New' and score >= 60, qualify lead
  let newStatus = agent.status;
  if (agent.status === 'New' && scoreResult.score >= 50 && likelyRole === 'Likely Property Agent') {
    newStatus = 'Qualified';
  }

  db.prepare(`
    UPDATE agents SET
      advertisements_count = ?,
      likely_role = ?,
      lead_score = ?,
      score_breakdown = ?,
      status = ?,
      last_active_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    adCount,
    likelyRole,
    scoreResult.score,
    JSON.stringify(scoreResult.breakdown),
    newStatus,
    mostRecentAd.posted_at || agent.last_active_at,
    new Date().toISOString(),
    agentId
  );
}

/**
 * Manually merges two agent records
 * Moves all advertisements and outreach logs from sourceAgentId into targetAgentId
 */
function mergeAgents(sourceAgentId, targetAgentId) {
  if (sourceAgentId === targetAgentId) {
    throw new Error('Cannot merge an agent into itself.');
  }

  const source = db.prepare('SELECT * FROM agents WHERE id = ?').get(sourceAgentId);
  const target = db.prepare('SELECT * FROM agents WHERE id = ?').get(targetAgentId);

  if (!source || !target) {
    throw new Error('Source or target agent not found.');
  }

  // Move all advertisements
  db.prepare('UPDATE advertisements SET agent_id = ? WHERE agent_id = ?').run(targetAgentId, sourceAgentId);

  // Move all outreach logs
  db.prepare('UPDATE outreach_logs SET agent_id = ? WHERE agent_id = ?').run(targetAgentId, sourceAgentId);

  // Combine notes if any
  if (source.notes) {
    const combinedNotes = target.notes 
      ? `${target.notes}\n[Merged Note]: ${source.notes}` 
      : `[Merged from ${source.name}]: ${source.notes}`;
    db.prepare('UPDATE agents SET notes = ? WHERE id = ?').run(combinedNotes, targetAgentId);
  }

  // Delete source agent
  db.prepare('DELETE FROM agents WHERE id = ?').run(sourceAgentId);

  // Refresh target agent
  refreshAgentProfile(targetAgentId);

  return db.prepare('SELECT * FROM agents WHERE id = ?').get(targetAgentId);
}

module.exports = {
  resolveAndSaveListing,
  refreshAgentProfile,
  mergeAgents
};
