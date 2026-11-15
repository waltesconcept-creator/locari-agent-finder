/**
 * Nigerian Phone Parser & Normalizer
 * Extracts, cleans, and standardizes Nigerian phone numbers from unstructured text.
 */

const NIGERIAN_MOBILE_PREFIXES = [
  '0802', '0803', '0805', '0806', '0807', '0808', '0809',
  '0701', '0702', '0703', '0704', '0705', '0706', '0707', '0708', '0709',
  '0810', '0811', '0812', '0813', '0814', '0815', '0816', '0817', '0818',
  '0901', '0902', '0903', '0904', '0905', '0906', '0907', '0908', '0909',
  '0911', '0912', '0913', '0914', '0915', '0916'
];

/**
 * Normalizes a candidate phone string to E.164 standard (+234XXXXXXXXXX)
 * @param {string} rawPhone
 * @returns {string|null} normalized phone or null if invalid
 */
function normalizeNigerianPhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return null;

  // Remove non-digit characters except leading plus
  let cleaned = rawPhone.trim().replace(/[^\d+]/g, '');

  // Handle +234... or 234... or 00234...
  if (cleaned.startsWith('00234')) {
    cleaned = '+234' + cleaned.slice(5);
  } else if (cleaned.startsWith('234')) {
    cleaned = '+234' + cleaned.slice(3);
  }

  if (cleaned.startsWith('+234')) {
    const localPart = cleaned.slice(4);
    // If user wrote +2340803..., strip the extra local leading zero
    const trimmedLocal = localPart.startsWith('0') ? localPart.slice(1) : localPart;
    if (trimmedLocal.length === 10) {
      return `+234${trimmedLocal}`;
    }
  }

  // Handle standard 11-digit local format: 080XXXXXXXX
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    const prefix = cleaned.slice(0, 4);
    if (NIGERIAN_MOBILE_PREFIXES.includes(prefix)) {
      return `+234${cleaned.slice(1)}`;
    }
  }

  // Handle 10-digit without leading zero: 80XXXXXXXX
  if (cleaned.length === 10 && !cleaned.startsWith('0')) {
    const withZero = '0' + cleaned;
    const prefix = withZero.slice(0, 4);
    if (NIGERIAN_MOBILE_PREFIXES.includes(prefix)) {
      return `+234${cleaned}`;
    }
  }

  return null;
}

/**
 * Replace spelled out numbers like 'zero eight zero' if present
 */
function replaceSpelledNumbers(text) {
  const wordsToDigits = {
    'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
    'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'
  };
  return text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/gi, (match) => {
    return wordsToDigits[match.toLowerCase()] || match;
  });
}

/**
 * Extracts all valid Nigerian phone numbers and identifies WhatsApp context
 * @param {string} text 
 * @returns {Array<{raw: string, normalized: string, isWhatsapp: boolean, context: string, position: number}>}
 */
function extractPhones(text) {
  if (!text || typeof text !== 'string') return [];

  const preprocessed = replaceSpelledNumbers(text);
  const foundItems = [];

  // Pattern 1: WhatsApp links (wa.me/... or api.whatsapp.com...)
  const waLinkRegex = /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?([+\d\s\-\(\)]+)/gi;
  let waMatch;
  while ((waMatch = waLinkRegex.exec(preprocessed)) !== null) {
    const candidate = waMatch[1];
    const normalized = normalizeNigerianPhone(candidate);
    if (normalized) {
      foundItems.push({
        raw: waMatch[0],
        normalized,
        isWhatsapp: true,
        context: 'WhatsApp Link',
        position: waMatch.index
      });
    }
  }

  // Pattern 2: Explicit phone patterns with delimiters (+234, 080, 070, 090, 081, 091)
  const phoneRegex = /(?:\+?234[\s.-]?)?(?:0?[789][01]\d[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\b0\d{10}\b|\b234\d{10}\b)/g;
  let match;
  while ((match = phoneRegex.exec(preprocessed)) !== null) {
    const raw = match[0];
    const normalized = normalizeNigerianPhone(raw);
    if (normalized) {
      const matchIndex = match.index;
      const surroundingSnippet = preprocessed.slice(Math.max(0, matchIndex - 35), Math.min(preprocessed.length, matchIndex + raw.length + 35)).toLowerCase();
      const isWhatsapp = surroundingSnippet.includes('whatsapp') || surroundingSnippet.includes('dm') || surroundingSnippet.includes('chat') || surroundingSnippet.includes('wa.me');

      foundItems.push({
        raw,
        normalized,
        isWhatsapp,
        context: surroundingSnippet.includes('call') ? 'Call / Phone' : (isWhatsapp ? 'WhatsApp' : 'General Contact'),
        position: matchIndex
      });
    }
  }

  // Sort items by their position of occurrence in the text
  foundItems.sort((a, b) => a.position - b.position);

  // Deduplicate by normalized number while preserving order and WhatsApp preference
  const results = [];
  const seenNormalized = new Map();

  for (const item of foundItems) {
    if (!seenNormalized.has(item.normalized)) {
      seenNormalized.set(item.normalized, item);
      results.push(item);
    } else {
      // If we saw it before but current occurrence has isWhatsapp true, upgrade it
      const existing = seenNormalized.get(item.normalized);
      if (!existing.isWhatsapp && item.isWhatsapp) {
        existing.isWhatsapp = true;
      }
    }
  }

  return results;
}

/**
 * Organizes extracted phone numbers into primary, secondary, and WhatsApp lines
 */
function resolveContactPhones(extractedList) {
  if (!extractedList || extractedList.length === 0) {
    return {
      primaryPhone: null,
      secondaryPhone: null,
      whatsappPhone: null,
      hasContact: false
    };
  }

  const primary = extractedList[0].normalized;
  const secondary = extractedList.length > 1 ? extractedList[1].normalized : null;

  // Find explicit WhatsApp or default to primary
  const waItem = extractedList.find(item => item.isWhatsapp);
  const whatsapp = waItem ? waItem.normalized : primary;

  return {
    primaryPhone: primary,
    secondaryPhone: secondary,
    whatsappPhone: whatsapp,
    hasContact: true
  };
}

module.exports = {
  extractPhones,
  normalizeNigerianPhone,
  resolveContactPhones,
  NIGERIAN_MOBILE_PREFIXES
};
