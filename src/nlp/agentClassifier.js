/**
 * Agent Identification & Lead Scoring Engine
 * Analyzes posting patterns, linguistic markers, and listing volume to estimate
 * role (Likely Agent, Landlord, etc.) and calculate a 0-100 Lead Score with an audit breakdown.
 */

const AGENT_JARGON_PATTERNS = [
  /\bdirect\s+brief\b/i,
  /\bmandate\b/i,
  /\binspection\s+fee\b/i,
  /(?<!no\s+)\bagency\s+(?:and|&)\s+legal\b/i,
  /(?<!no\s+)\blegal\s+(?:and|&)\s+agency\b/i,
  /(?<!no\s+)\b10%\s+(?:agency|commission)\b/i,
  /\btotal\s+package\b/i,
  /\bconsultancy\s+fee\b/i,
  /\bfacilitator\s+fee\b/i,
  /\bstrictly\s+(?:for\s+)?direct\s+client\b/i,
  /\bdirect\s+clients?\s+only\b/i,
  /\brealtor\b/i,
  /\bproperty\s+consultant\b/i,
  /\breal\s+estate\s+consultant\b/i,
  /\bcommission\s+applies\b/i
];

const LANDLORD_PATTERNS = [
  /\bmy\s+(?:own\s+)?(?:house|property|apartment|flat)\b/i,
  /\bi\s+am\s+the\s+owner\b/i,
  /\bdirect\s+(?:from|with)\s+landlord\b/i,
  /\bno\s+agency(?:\s+fee)?\b/i,
  /\bno\s+commission\b/i,
  /\bowner\s+direct\b/i,
  /\blandlord\s+direct\b/i,
  /\bdealing\s+directly\s+with\s+owner\b/i
];

const PROPERTY_MANAGER_PATTERNS = [
  /\bproperty\s+manager\b/i,
  /\bfacility\s+manager\b/i,
  /\bcaretaker\b/i,
  /\bmanaged\s+by\b/i,
  /\bestate\s+management\b/i,
  /\bdeveloper\s+brief\b/i
];

/**
 * Classifies the likely role of a lead based on aggregate listing data
 * @param {Object} params
 * @param {number} params.adCount - Total number of advertisements found for this contact
 * @param {Array<string>} params.allTexts - Raw texts from all advertisements
 * @param {Array<string>} params.locations - Distinct locations/cities covered
 * @param {Array<string>} params.propertyTypes - Distinct property types advertised
 * @returns {string} One of: 'Likely Property Agent', 'Possible Property Agent', 'Landlord', 'Property Manager', 'Unclear'
 */
function classifyAgentRole({ adCount = 1, allTexts = [], locations = [], propertyTypes = [] }) {
  const combinedText = allTexts.join(' ');

  const agentJargonHits = AGENT_JARGON_PATTERNS.filter(regex => regex.test(combinedText)).length;
  const landlordHits = LANDLORD_PATTERNS.filter(regex => regex.test(combinedText)).length;
  const managerHits = PROPERTY_MANAGER_PATTERNS.filter(regex => regex.test(combinedText)).length;

  const distinctLocations = new Set(locations.filter(Boolean));
  const distinctTypes = new Set(propertyTypes.filter(t => t && t !== 'Unspecified'));

  // 1. Explicit landlord language without agent jargon
  if (landlordHits > 0 && agentJargonHits === 0 && adCount <= 2) {
    return 'Landlord';
  }

  // 2. Property manager / developer terminology
  if (managerHits > 0 && managerHits >= agentJargonHits) {
    return 'Property Manager';
  }

  // 3. Likely Property Agent: strong signals
  if (
    adCount >= 3 ||
    (adCount >= 2 && (distinctLocations.size > 1 || distinctTypes.size > 1)) ||
    agentJargonHits >= 2
  ) {
    return 'Likely Property Agent';
  }

  // 4. Possible Property Agent: some signals
  if (adCount >= 2 || agentJargonHits === 1 || distinctTypes.size >= 1) {
    return 'Possible Property Agent';
  }

  return 'Unclear';
}

/**
 * Computes an objective 0-100 Lead Score with transparent justification
 * @param {Object} params
 * @param {number} params.adCount - Total number of advertisements
 * @param {Date|string} params.lastActiveDate - Date of the most recent advertisement
 * @param {number} params.distinctLocationsCount - Number of distinct locations covered
 * @param {number} params.distinctTypesCount - Number of distinct property types
 * @param {boolean} params.hasName - Whether a contact name is identified
 * @param {boolean} params.hasWhatsapp - Whether a WhatsApp number is identified
 * @param {string} params.primaryCity - Primary city (Ibadan, Lagos, etc.)
 * @returns {{ score: number, breakdown: Object, explanation: string }}
 */
function calculateLeadScore({
  adCount = 1,
  lastActiveDate = new Date(),
  distinctLocationsCount = 1,
  distinctTypesCount = 1,
  hasName = false,
  hasWhatsapp = false,
  primaryCity = 'Unknown'
}) {
  const breakdown = {
    volumeScore: 0,
    recencyScore: 0,
    diversityScore: 0,
    completenessScore: 0,
    targetCityScore: 0,
    total: 0
  };

  const explanations = [];

  // 1. Advertising Volume (Max 30 pts)
  if (adCount >= 10) {
    breakdown.volumeScore = 30;
    explanations.push(`High listing volume (10+ ads): +30`);
  } else if (adCount >= 4) {
    breakdown.volumeScore = 20;
    explanations.push(`Active advertiser (${adCount} ads): +20`);
  } else if (adCount >= 2) {
    breakdown.volumeScore = 12;
    explanations.push(`Repeat advertiser (${adCount} ads): +12`);
  } else {
    breakdown.volumeScore = 5;
    explanations.push(`Single listing discovered: +5`);
  }

  // 2. Recency / Activity Freshness (Max 25 pts)
  const lastActive = new Date(lastActiveDate);
  const now = new Date();
  const diffDays = Math.max(0, Math.floor((now - lastActive) / (1000 * 60 * 60 * 24)));

  if (diffDays <= 2) {
    breakdown.recencyScore = 25;
    explanations.push('Very recent activity (last 48 hours): +25');
  } else if (diffDays <= 7) {
    breakdown.recencyScore = 20;
    explanations.push('Active this past week: +20');
  } else if (diffDays <= 30) {
    breakdown.recencyScore = 12;
    explanations.push('Active within 30 days: +12');
  } else {
    breakdown.recencyScore = 5;
    explanations.push('Older listing (> 30 days): +5');
  }

  // 3. Portfolio Diversity (Max 20 pts)
  let diversity = 0;
  if (distinctLocationsCount > 1) diversity += 10;
  if (distinctTypesCount > 1) diversity += 10;
  breakdown.diversityScore = Math.min(20, diversity);
  if (diversity > 0) {
    explanations.push(`Portfolio diversity (${distinctLocationsCount} locations, ${distinctTypesCount} types): +${breakdown.diversityScore}`);
  }

  // 4. Contact Completeness (Max 15 pts)
  let completeness = 5;
  if (hasName) completeness += 5;
  if (hasWhatsapp) completeness += 5;
  breakdown.completenessScore = completeness;
  explanations.push(`Contact data completeness (phone, ${hasName ? 'name, ' : ''}${hasWhatsapp ? 'WhatsApp' : ''}): +${completeness}`);

  // 5. Target City Alignment (Max 10 pts)
  const normalizedCity = (primaryCity || '').toLowerCase();
  if (normalizedCity.includes('ibadan') || normalizedCity.includes('lagos')) {
    breakdown.targetCityScore = 10;
    explanations.push(`Priority Locari target market (${primaryCity}): +10`);
  } else if (normalizedCity.includes('abuja') || normalizedCity.includes('abeokuta')) {
    breakdown.targetCityScore = 5;
    explanations.push(`Secondary target market (${primaryCity}): +5`);
  }

  // Calculate Total (capped at 100)
  const total = Math.min(
    100,
    breakdown.volumeScore +
    breakdown.recencyScore +
    breakdown.diversityScore +
    breakdown.completenessScore +
    breakdown.targetCityScore
  );

  breakdown.total = total;

  return {
    score: total,
    breakdown,
    explanation: explanations.join('; ')
  };
}

module.exports = {
  classifyAgentRole,
  calculateLeadScore,
  AGENT_JARGON_PATTERNS,
  LANDLORD_PATTERNS,
  PROPERTY_MANAGER_PATTERNS
};
