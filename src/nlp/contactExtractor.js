/**
 * Contact Extraction Engine (High-Accuracy NLP & Regex)
 * Extracts phone numbers (Nigerian, US, UK, international, obfuscated),
 * WhatsApp links, emails, agent names, property types, locations, and prices from raw text or HTML.
 */

const { extractPropertyType, extractLocation, extractRentPrice } = require('./propertyParser.js');

// Nigerian mobile prefixes
const NIGERIAN_PREFIXES = [
  '0802', '0803', '0805', '0806', '0807', '0808', '0809',
  '0701', '0702', '0703', '0704', '0705', '0706', '0707', '0708', '0709',
  '0810', '0811', '0812', '0813', '0814', '0815', '0816', '0817', '0818',
  '0901', '0902', '0903', '0904', '0905', '0906', '0907', '0908', '0909',
  '0911', '0912', '0913', '0914', '0915', '0916'
];

/**
 * Clean HTML tags out of a string
 */
function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Standardize phone number into E.164 or cleaned international format
 */
function normalizePhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return null;

  // Remove parentheses, spaces, hyphens, dots
  let cleaned = rawPhone.trim().replace(/[^\d+]/g, '');

  // 1. Nigerian +234 / 234 / 00234
  if (cleaned.startsWith('00234')) {
    cleaned = '+234' + cleaned.slice(5);
  } else if (cleaned.startsWith('234')) {
    cleaned = '+234' + cleaned.slice(3);
  }

  if (cleaned.startsWith('+234')) {
    let local = cleaned.slice(4);
    if (local.startsWith('0')) local = local.slice(1);
    if (local.length === 10) {
      return `+234${local}`;
    }
  }

  // Nigerian standard local 11 digits: 080XXXXXXXX
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    const prefix = cleaned.slice(0, 4);
    if (NIGERIAN_PREFIXES.includes(prefix)) {
      return `+234${cleaned.slice(1)}`;
    }
  }

  // Nigerian 10 digits without leading zero: 80XXXXXXXX
  if (cleaned.length === 10 && !cleaned.startsWith('0') && !cleaned.startsWith('+')) {
    const withZero = '0' + cleaned;
    if (NIGERIAN_PREFIXES.includes(withZero.slice(0, 4))) {
      return `+234${cleaned}`;
    }
  }

  // 2. US / Canada (+1...)
  // Format: +1XXXXXXXXXX (11 digits) or 10 digits in US format
  if (cleaned.startsWith('+1') && cleaned.length === 12) {
    return cleaned;
  }
  if (cleaned.startsWith('1') && cleaned.length === 11 && !cleaned.startsWith('+')) {
    return `+${cleaned}`;
  }
  // Standard 10 digit US number without country code
  if (cleaned.length === 10 && /^[2-9]\d{2}[2-9]\d{6}$/.test(cleaned)) {
    return `+1${cleaned}`;
  }

  // 3. UK (+44...)
  if (cleaned.startsWith('0044')) {
    cleaned = '+44' + cleaned.slice(4);
  } else if (cleaned.startsWith('44') && cleaned.length >= 12) {
    cleaned = '+44' + cleaned.slice(2);
  }
  if (cleaned.startsWith('+44')) {
    let local = cleaned.slice(3);
    if (local.startsWith('0')) local = local.slice(1);
    if (local.length >= 9 && local.length <= 11) {
      return `+44${local}`;
    }
  }
  // UK local mobile: 07XXXXXXXXX (11 digits)
  if (cleaned.startsWith('07') && cleaned.length === 11) {
    return `+44${cleaned.slice(1)}`;
  }

  // 4. Other valid international E.164 numbers (+ followed by 7 to 15 digits)
  if (cleaned.startsWith('+') && cleaned.length >= 8 && cleaned.length <= 16) {
    return cleaned;
  }

  return null;
}

/**
 * Formats a phone number into an official WhatsApp click-to-chat URL
 * wa.me/<number> requires country code with no +, spaces, or dashes
 */
function formatWhatsAppUrl(phoneOrLink) {
  if (!phoneOrLink) return null;

  // If already a wa.me or api.whatsapp URL
  if (typeof phoneOrLink === 'string' && (phoneOrLink.includes('wa.me/') || phoneOrLink.includes('whatsapp.com/send'))) {
    const match = phoneOrLink.match(/(?:wa\.me\/|phone=)([+\d]+)/);
    if (match) {
      const digits = match[1].replace(/[^\d]/g, '');
      if (digits.length >= 7) {
        return `https://wa.me/${digits}`;
      }
    }
  }

  // Format from standard normalized phone e.g. +2348031234567 -> https://wa.me/2348031234567
  const normalized = normalizePhone(phoneOrLink);
  if (normalized) {
    const digits = normalized.replace(/[^\d]/g, '');
    return `https://wa.me/${digits}`;
  }

  return null;
}

/**
 * Extracts emails using standard RFC 5322 regex
 */
function extractEmails(text) {
  if (!text || typeof text !== 'string') return [];
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const matches = text.match(emailRegex) || [];
  return Array.from(new Set(matches.map(e => e.toLowerCase())));
}

/**
 * Extract obfuscated numbers written with spaces, dots, or dashes
 * e.g., "0 8 0 3 1 2 3 4 5 6 7" or "0 8 0 - 3 1 2 3 - 4 5 6"
 */
function extractObfuscatedNumbers(text) {
  if (!text || typeof text !== 'string') return [];
  const found = [];

  // Match digit sequences of 9 to 15 digits separated by spaces, dots, or hyphens
  const obfuscatedRegex = /(?:(?<=\s|^|[^\d]))(\d[\s.-]{1,2}){9,13}\d(?=\s|$|[^\d])/g;
  let match;
  while ((match = obfuscatedRegex.exec(text)) !== null) {
    const raw = match[0].trim();
    const collapsed = raw.replace(/[\s.-]/g, '');
    const normalized = normalizePhone(collapsed);
    if (normalized) {
      found.push({
        raw,
        normalized,
        position: match.index
      });
    }
  }

  return found;
}

/**
 * Extract WhatsApp links from text
 */
function extractWhatsAppLinks(text) {
  if (!text || typeof text !== 'string') return [];
  const found = [];
  const waRegex = /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?([+\d\s\-\(\)]+)/gi;
  let match;
  while ((match = waRegex.exec(text)) !== null) {
    const raw = match[0];
    const candidateDigits = match[1].replace(/[^\d+]/g, '');
    const normalized = normalizePhone(candidateDigits) || (candidateDigits.length >= 9 ? `+${candidateDigits.replace(/^\+/, '')}` : null);
    if (normalized) {
      found.push({
        raw,
        normalized,
        formattedWhatsApp: `https://wa.me/${normalized.replace(/[^\d]/g, '')}`,
        position: match.index
      });
    }
  }
  return found;
}

/**
 * Extract all contact information from arbitrary post text or HTML
 */
function extractContacts(content) {
  if (!content || typeof content !== 'string') {
    return {
      phoneNumbers: [],
      primaryPhone: null,
      formattedWhatsApp: null,
      emails: [],
      primaryEmail: null,
      rawWhatsAppLinks: []
    };
  }

  // Pre-strip HTML if looks like HTML
  const isHtml = /<[a-z][\s\S]*>/i.test(content);
  const text = isHtml ? stripHtml(content) : content;

  const phoneCandidates = [];

  // 1. WhatsApp links
  const waLinks = extractWhatsAppLinks(content + ' ' + text);
  for (const item of waLinks) {
    phoneCandidates.push({
      raw: item.raw,
      normalized: item.normalized,
      isWhatsApp: true,
      formattedWhatsApp: item.formattedWhatsApp,
      position: item.position
    });
  }

  // 2. Obfuscated numbers (0 8 0 3...)
  const obfuscated = extractObfuscatedNumbers(text);
  for (const item of obfuscated) {
    phoneCandidates.push({
      raw: item.raw,
      normalized: item.normalized,
      isWhatsApp: false,
      position: item.position
    });
  }

  // 3. International & standard local phone patterns
  // Examples: +234 803 123 4567, +1 (555) 000-0000, 08031234567, +44 7911 123456
  const standardPhoneRegex = /(?:\+?234[\s.-]?)?(?:0?[789][01]\d[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\b0\d{10}\b|\b234\d{10}\b)|\+?1[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\(\d{3}\)[\s.-]?\d{3}[\s.-]?\d{4}|\+?44[\s.-]?\(?0?\)?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\+\d{1,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}[\s.-]?\d{2,4}/g;

  let match;
  while ((match = standardPhoneRegex.exec(text)) !== null) {
    const raw = match[0].trim();
    const normalized = normalizePhone(raw);
    if (normalized) {
      // Check surrounding context for WhatsApp indication
      const start = Math.max(0, match.index - 30);
      const end = Math.min(text.length, match.index + raw.length + 30);
      const snippet = text.slice(start, end).toLowerCase();
      const isWa = snippet.includes('whatsapp') || snippet.includes('wa.me') || snippet.includes('dm') || snippet.includes('chat');

      phoneCandidates.push({
        raw,
        normalized,
        isWhatsApp: isWa,
        position: match.index
      });
    }
  }

  // Deduplicate phone numbers preserving order
  const uniquePhones = [];
  const seenPhones = new Set();
  let explicitWhatsAppUrl = waLinks.length > 0 ? waLinks[0].formattedWhatsApp : null;

  for (const item of phoneCandidates) {
    if (!seenPhones.has(item.normalized)) {
      seenPhones.add(item.normalized);
      uniquePhones.push(item);
    }
    if (item.isWhatsApp && !explicitWhatsAppUrl) {
      explicitWhatsAppUrl = formatWhatsAppUrl(item.normalized);
    }
  }

  // 4. RFC Emails
  const emails = extractEmails(text);

  const primaryPhone = uniquePhones.length > 0 ? uniquePhones[0].normalized : null;
  const formattedWhatsApp = explicitWhatsAppUrl || (primaryPhone ? formatWhatsAppUrl(primaryPhone) : null);
  const primaryEmail = emails.length > 0 ? emails[0] : null;

  return {
    phoneNumbers: uniquePhones.map(p => p.normalized),
    primaryPhone,
    formattedWhatsApp,
    emails,
    primaryEmail,
    rawWhatsAppLinks: waLinks.map(w => w.raw)
  };
}

/**
 * Extracts poster / agent name from text or HTML
 */
function extractAgentName(content) {
  if (!content || typeof content !== 'string') return 'Independent Agent';

  // 1. If HTML, look for header / strong / author elements
  if (/<[a-z][\s\S]*>/i.test(content)) {
    const authorMatch = content.match(/<h\d[^>]*>([^<]+)<\/h\d>|<strong[^>]*>([^<]+)<\/strong>|<span[^>]*class="[^"]*(?:author|poster|user|name)[^"]*"[^>]*>([^<]+)<\/span>/i);
    if (authorMatch) {
      const candidate = (authorMatch[1] || authorMatch[2] || authorMatch[3] || '').trim();
      if (candidate.length >= 3 && candidate.length <= 40 && !candidate.toLowerCase().includes('http')) {
        return candidate;
      }
    }
  }

  // 2. Explicit labeling on single line: "Agent: John Doe", "Posted by: Sarah", etc.
  // Prioritize explicit agent/poster labels first
  const labelPatterns = [
    /(?:Agent|Posted by|Realtor)\s*[:\-–]\s*([A-Za-z0-9 .'-]{2,40})(?:\r?\n|$|[,\.;])/i,
    /(?:Contact Person|Contact|Direct Agent|Name)\s*[:\-–]\s*([A-Za-z0-9 .'-]{2,40})(?:\r?\n|$|[,\.;])/i
  ];

  for (const pat of labelPatterns) {
    const labelMatch = content.match(pat);
    if (labelMatch) {
      const candidate = labelMatch[1].trim();
      const lower = candidate.toLowerCase();
      // Must not be a phone number or contain many digits
      const digitCount = (candidate.match(/\d/g) || []).length;
      if (digitCount <= 3 && !lower.includes('bedroom') && !lower.includes('rent') && !lower.includes('flat') && !lower.includes('house') && !lower.includes('phone') && !lower.includes('email') && !lower.includes('http') && /[A-Za-z]{2,}/.test(candidate)) {
        return candidate;
      }
    }
  }

  // 3. Check first line if short and looks like a name
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    const firstLine = lines[0].replace(/[^\w\s]/g, '').trim();
    const words = firstLine.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && firstLine.length <= 35) {
      const looksLikeName = words.every(w => /^[A-Z][a-z]+$/.test(w));
      if (looksLikeName && !['For', 'Rent', 'House', 'Flat', 'Available', 'Bedroom', 'Property'].includes(words[0])) {
        return firstLine;
      }
    }
  }

  return 'Verified Agent';
}

/**
 * Extracts a clean, concise post snippet
 */
function extractSnippet(content, maxLength = 180) {
  if (!content) return '';
  const text = stripHtml(content);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Complete parsing of a single post item
 */
function parsePost(content, metadata = {}) {
  const contacts = extractContacts(content);
  const agentName = metadata.agentName || extractAgentName(content);
  const snippet = extractSnippet(content);

  const propType = extractPropertyType(content);
  const loc = extractLocation(content);
  const rent = extractRentPrice(content);

  let formattedLoc = null;
  if (loc.neighbourhood && loc.city && loc.city !== 'Unknown') {
    formattedLoc = `${loc.neighbourhood}, ${loc.city}`;
  } else if (loc.neighbourhood) {
    formattedLoc = loc.neighbourhood;
  } else if (loc.city && loc.city !== 'Unknown') {
    formattedLoc = loc.city;
  }

  let formattedPrice = null;
  if (rent && rent.amount) {
    formattedPrice = `₦${Number(rent.amount).toLocaleString()}${rent.period ? '/' + rent.period : ''}`;
  }

  return {
    agentName,
    phoneNumber: contacts.primaryPhone,
    allPhones: contacts.phoneNumbers,
    formattedWhatsApp: contacts.formattedWhatsApp,
    email: contacts.primaryEmail,
    allEmails: contacts.emails,
    propertyType: propType !== 'Unspecified' ? propType : null,
    location: formattedLoc,
    price: formattedPrice,
    postSnippet: snippet,
    postUrl: metadata.postUrl || null,
    groupId: metadata.groupId || null,
    rawText: content
  };
}

module.exports = {
  extractContacts,
  normalizePhone,
  formatWhatsAppUrl,
  extractEmails,
  extractObfuscatedNumbers,
  extractWhatsAppLinks,
  extractAgentName,
  extractSnippet,
  parsePost,
  stripHtml
};
