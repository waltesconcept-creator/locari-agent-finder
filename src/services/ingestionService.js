/**
 * Multi-Channel Ingestion Service
 * Handles Quick-Paste multi-post parsing, CSV batch imports, and Browser Clipper payloads.
 */

const { db, generateId } = require('../db.js');
const { extractPhones, resolveContactPhones } = require('../nlp/phoneParser.js');
const { parsePropertyListing } = require('../nlp/propertyParser.js');
const { resolveAndSaveListing } = require('./deduplicationService.js');

/**
 * Splits a raw pasted blob of multiple posts into individual post segments
 * Delimiters can be ---, ===, ***, or double/triple blank lines
 */
function splitMultiplePosts(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  // Check for explicit dividers like --- or ===
  const dividerRegex = /(?:\r?\n){1,}[=-]{3,}(?:\r?\n){1,}/g;
  if (dividerRegex.test(rawText)) {
    return rawText
      .split(dividerRegex)
      .map(t => t.trim())
      .filter(t => t.length > 25);
  }

  // Check for multiple blank lines (2 or more consecutive newlines)
  const paragraphBlocks = rawText
    .split(/(?:\r?\n\s*){2,}/)
    .map(t => t.trim())
    .filter(t => t.length > 25);

  if (paragraphBlocks.length > 1) {
    return paragraphBlocks;
  }

  // Single post
  return [rawText.trim()];
}

/**
 * Extracts poster name from text if prefixed like "Poster: Segun" or "Posted by: John"
 */
function extractPosterName(text) {
  if (!text) return null;
  const nameMatch = text.match(/(?:poster|posted by|agent name|contact person|scout)\s*[:\-]\s*([a-zA-Z\s]{3,35})/i);
  if (nameMatch) {
    return nameMatch[1].trim();
  }
  return null;
}

/**
 * Parses a single raw post text into structured listing candidate
 */
function parseRawPost(rawText, metadata = {}) {
  const extractedPhones = extractPhones(rawText);
  const contacts = resolveContactPhones(extractedPhones);
  const propertyInfo = parsePropertyListing(rawText, metadata);
  const detectedName = extractPosterName(rawText) || metadata.posterName || null;

  // Check for URL in the text
  const urlMatch = rawText.match(/https?:\/\/[^\s]+/i);
  const postUrl = metadata.originalPostUrl || (urlMatch ? urlMatch[0] : null);

  return {
    rawText,
    posterName: detectedName,
    primaryPhone: contacts.primaryPhone,
    secondaryPhone: contacts.secondaryPhone,
    whatsappPhone: contacts.whatsappPhone,
    hasContact: contacts.hasContact,
    propertyType: propertyInfo.propertyType,
    city: propertyInfo.city,
    neighbourhood: propertyInfo.neighbourhood,
    rentAmount: propertyInfo.rentAmount,
    rentPeriod: propertyInfo.rentPeriod,
    features: propertyInfo.features,
    featuresJson: propertyInfo.featuresJson,
    sourceId: metadata.sourceId || null,
    originalPostUrl: postUrl,
    postedAt: metadata.postedAt || new Date().toISOString()
  };
}

/**
 * Previews parsed items from a multi-post paste without saving
 */
function previewBatchPaste(rawText, metadata = {}) {
  const segments = splitMultiplePosts(rawText);
  const items = segments.map(seg => parseRawPost(seg, metadata));
  return {
    totalSegments: segments.length,
    validContactsCount: items.filter(i => i.hasContact).length,
    missingContactsCount: items.filter(i => !i.hasContact).length,
    items
  };
}

/**
 * Ingests a batch of raw posts (Quick-Paste or CSV items)
 * @param {Array<string|Object>} rawItems
 * @param {Object} metadata
 * @returns {Object} batch summary
 */
function ingestBatch(rawItems, metadata = {}) {
  const batchId = generateId('batch');
  const sourceId = metadata.sourceId || null;
  const method = metadata.method || 'Quick-Paste';

  let postsReceived = rawItems.length;
  let postsImported = 0;
  let duplicatesDetected = 0;
  let agentsCreated = 0;
  let agentsUpdated = 0;
  const results = [];
  const errors = [];

  for (const item of rawItems) {
    try {
      const rawText = typeof item === 'string' ? item : (item.rawText || item.text || item.description || '');
      if (!rawText || rawText.trim().length < 15) continue;

      const itemMeta = typeof item === 'object' ? { ...metadata, ...item } : metadata;
      const parsed = parseRawPost(rawText, itemMeta);

      if (!parsed.hasContact || !parsed.primaryPhone) {
        errors.push({
          textSnippet: rawText.slice(0, 70),
          reason: 'No valid Nigerian phone number found in advertisement.'
        });
        continue;
      }

      const saveResult = resolveAndSaveListing(parsed);
      postsImported++;

      if (saveResult.isDuplicatePost) {
        duplicatesDetected++;
      } else if (saveResult.isNewAgent) {
        agentsCreated++;
      } else {
        agentsUpdated++;
      }

      results.push({
        agentId: saveResult.agent.id,
        agentName: saveResult.agent.name,
        primaryPhone: saveResult.agent.primary_phone,
        propertyType: parsed.propertyType,
        city: parsed.city,
        isNewAgent: saveResult.isNewAgent,
        isDuplicatePost: saveResult.isDuplicatePost
      });
    } catch (err) {
      errors.push({
        textSnippet: typeof item === 'string' ? item.slice(0, 70) : 'Item parsing error',
        reason: err.message
      });
    }
  }

  // Record batch in audit table
  db.prepare(`
    INSERT INTO import_batches (
      id, source_id, method, posts_received, posts_imported,
      duplicates_detected, agents_created, agents_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    batchId,
    sourceId,
    method,
    postsReceived,
    postsImported,
    duplicatesDetected,
    agentsCreated,
    agentsUpdated
  );

  return {
    batchId,
    postsReceived,
    postsImported,
    duplicatesDetected,
    agentsCreated,
    agentsUpdated,
    results,
    errors
  };
}

/**
 * Parses simple CSV content (with comma or semicolon separator)
 */
function parseCSV(csvContent, defaultMetadata = {}) {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';
  const headers = headerLine.split(delimiter).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // Simple CSV row parser (handles quoted fields)
    const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
    const values = [];
    let match;
    while ((match = regex.exec(rawLine)) !== null) {
      let val = match[1] || '';
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1).replace(/""/g, '"');
      }
      values.push(val.trim());
      if (regex.lastIndex >= rawLine.length) break;
    }

    if (values.length < 1 || !values.some(v => v.length > 0)) continue;

    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] || '';
    });

    // Map common CSV columns to listing fields
    const rawText = rowObj['raw_text'] || rowObj['text'] || rowObj['post'] || rowObj['description'] || rowObj['content'] || '';
    const phone = rowObj['phone'] || rowObj['phone_number'] || rowObj['mobile'] || '';
    const name = rowObj['name'] || rowObj['poster'] || rowObj['agent'] || '';
    const city = rowObj['city'] || rowObj['location'] || defaultMetadata.sourceLocation;
    const url = rowObj['url'] || rowObj['post_url'] || rowObj['link'] || '';

    // If phone exists in separate column, append it to rawText if not present
    let finalText = rawText;
    if (phone && !finalText.includes(phone)) {
      finalText = `${finalText} Phone: ${phone}`;
    }

    items.push({
      rawText: finalText,
      posterName: name || null,
      city: city || 'Unknown',
      originalPostUrl: url || null,
      ...defaultMetadata
    });
  }

  return items;
}

module.exports = {
  splitMultiplePosts,
  parseRawPost,
  previewBatchPaste,
  ingestBatch,
  parseCSV
};
