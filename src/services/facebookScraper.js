/**
 * Automated Facebook & Property Portal Scraper Engine
 * Supports cookie-authenticated scraping, public group extraction,
 * joined-groups scanning, and resilient multi-group batch scraping.
 */

const puppeteer = require('puppeteer-core');
const path = require('node:path');
const fs = require('node:fs');
const { exec } = require('node:child_process');
const { ingestBatch } = require('./ingestionService.js');
const { extractPhones } = require('../nlp/phoneParser.js');
const { db } = require('../db.js');

function getChromeExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  if (process.platform === 'win32') {
    const winPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
    ];
    for (const p of winPaths) {
      if (fs.existsSync(p)) return p;
    }
  } else {
    // Linux / Render Docker paths
    const linuxPaths = [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome'
    ];
    for (const p of linuxPaths) {
      if (fs.existsSync(p)) return p;
    }
  }
  return process.env.CHROME_PATH || 'google-chrome-stable';
}

const CHROME_PATH = getChromeExecutablePath();
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const COOKIES_FILE = path.join(DATA_DIR, 'facebook_cookies.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Global active scrape job state
let activeScrapeJob = {
  running: false,
  targetUrl: '',
  sourceType: '',
  postsFound: 0,
  phonesFound: 0,
  logs: [],
  error: null,
  completedSummary: null
};

let activeBrowserInstance = null;

function getActiveScrapeStatus() {
  return activeScrapeJob;
}

function appendScrapeLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  const entry = `[${timestamp}] ${message}`;
  activeScrapeJob.logs.push(entry);
  if (activeScrapeJob.logs.length > 150) {
    activeScrapeJob.logs.shift();
  }
  console.log(`[SCRAPER] ${message}`);
}

function stopScrapeJob() {
  activeScrapeJob.running = false;
  appendScrapeLog('Scrape cancellation requested. Terminating browser session...');
  if (activeBrowserInstance) {
    try {
      activeBrowserInstance.close().catch(() => {});
    } catch (_) {}
    activeBrowserInstance = null;
  }
  return { success: true, message: 'Scrape job stopped.' };
}

/**
 * Saves Facebook cookies (from string "c_user=...; xs=..." or JSON array)
 */
function saveFacebookCookies(cookieInput) {
  let cookies = [];

  if (Array.isArray(cookieInput)) {
    cookies = cookieInput.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain || '.facebook.com',
      path: c.path || '/'
    }));
  } else if (typeof cookieInput === 'string') {
    const raw = cookieInput.trim();
    if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        const parsed = JSON.parse(raw);
        return saveFacebookCookies(parsed);
      } catch (_) {}
    }

    // Parse header style "c_user=12345; xs=abcdef; datr=..."
    const pairs = raw.split(';');
    for (const pair of pairs) {
      const idx = pair.indexOf('=');
      if (idx > 0) {
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (name && value) {
          cookies.push({
            name,
            value,
            domain: '.facebook.com',
            path: '/'
          });
        }
      }
    }
  }

  if (cookies.length === 0) {
    throw new Error('No valid cookies found in input. Please paste your c_user and xs cookies.');
  }

  fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2), 'utf8');
  const userCookie = cookies.find(c => c.name === 'c_user');
  const userIdMsg = userCookie ? ` (User ID: ${userCookie.value})` : '';
  appendScrapeLog(`✅ Saved ${cookies.length} Facebook session cookies${userIdMsg}! Scraper is now authenticated.`);
  return { success: true, count: cookies.length, userId: userCookie ? userCookie.value : null };
}

function loadFacebookCookies() {
  if (fs.existsSync(COOKIES_FILE)) {
    try {
      const data = fs.readFileSync(COOKIES_FILE, 'utf8');
      return JSON.parse(data);
    } catch (_) {}
  }
  return [];
}

function clearFacebookCookies() {
  if (fs.existsSync(COOKIES_FILE)) {
    try { fs.unlinkSync(COOKIES_FILE); } catch (_) {}
  }
  appendScrapeLog('Facebook session cookies removed. Returned to public visitor mode.');
  return { success: true };
}

function checkProfileStatus() {
  const cookies = loadFacebookCookies();
  const userCookie = cookies.find(c => c.name === 'c_user');
  return {
    chromeFound: fs.existsSync(CHROME_PATH),
    chromePath: CHROME_PATH,
    hasSavedCookies: cookies.length > 0,
    hasUserSession: Boolean(userCookie),
    userId: userCookie ? userCookie.value : null,
    cookiesCount: cookies.length
  };
}

/**
 * Opens Facebook in the user's interactive Windows desktop browser immediately
 */
function launchLoginBrowser() {
  appendScrapeLog('Opening Facebook in your interactive desktop browser...');
  try {
    exec('cmd.exe /c start https://www.facebook.com');
  } catch (err) {
    appendScrapeLog(`Error opening browser: ${err.message}`);
  }
  return {
    success: true,
    message: 'Facebook opened in your desktop browser. Log into your account and you are ready.'
  };
}

/**
 * Scans Facebook Groups followed/joined by the logged-in user
 */
async function scanUserJoinedGroups(options = {}) {
  const { headless = true } = options;
  const savedCookies = loadFacebookCookies();

  if (!savedCookies || savedCookies.length === 0) {
    throw new Error('No Facebook session found. Please connect your session or paste your c_user/xs cookies first.');
  }

  if (!fs.existsSync(CHROME_PATH)) {
    throw new Error(`Google Chrome executable not found at ${CHROME_PATH}`);
  }

  let browser = null;
  try {
    appendScrapeLog('Launching browser to scan groups you follow on Facebook...');
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: headless ? 'new' : false,
      defaultViewport: { width: 1280, height: 900 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-notifications'
      ]
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
    await page.setCookie(...savedCookies);

    appendScrapeLog('Navigating to your Facebook Groups directory...');
    await page.goto('https://www.facebook.com/groups/joins/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise(r => setTimeout(r, 4000));

    // Scroll slightly to trigger lazy-loaded groups
    await page.evaluate(() => window.scrollBy(0, 1000));
    await new Promise(r => setTimeout(r, 2000));

    const groups = await page.evaluate(() => {
      const results = [];
      const links = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
      const seen = new Set();

      links.forEach(a => {
        const href = a.href;
        const text = (a.innerText || a.textContent || '').trim();
        // Ignore generic FB navigation links
        if (!text || text.length < 3) return;
        if (text.toLowerCase().includes('feed') || text.toLowerCase().includes('discover') || text.toLowerCase().includes('notifications')) return;
        if (href.includes('/groups/feed') || href.includes('/groups/discover') || href.includes('/groups/create')) return;

        // Clean URL to standard group base
        const match = href.match(/https?:\/\/[^/]+\/groups\/([^/?]+)/);
        if (match) {
          const cleanUrl = `https://www.facebook.com/groups/${match[1]}/`;
          if (!seen.has(cleanUrl)) {
            seen.add(cleanUrl);
            results.push({
              name: text.split('\n')[0].trim(),
              url: cleanUrl
            });
          }
        }
      });

      return results;
    });

    appendScrapeLog(`Found ${groups.length} groups on your Facebook account!`);
    return groups;

  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Automates scraping a Facebook Group (supports standard URLs and /share/g/ links)
 */
async function scrapeFacebookGroup(groupUrl, options = {}) {
  const {
    maxPosts = 30,
    maxScrolls = 10,
    headless = true,
    sourceId = null
  } = options;

  if (!fs.existsSync(CHROME_PATH)) {
    throw new Error(`Google Chrome executable not found at ${CHROME_PATH}`);
  }

  activeScrapeJob = {
    running: true,
    targetUrl: groupUrl,
    sourceType: 'Facebook Group',
    postsFound: 0,
    phonesFound: 0,
    logs: [],
    error: null,
    completedSummary: null
  };

  const isHeadless = (headless === 'headless' || headless === true);
  appendScrapeLog(`Starting scraper for: ${groupUrl}`);
  appendScrapeLog(`Settings: Max Posts=${maxPosts}, Max Scrolls=${maxScrolls}, Mode=${isHeadless ? 'Background (Silent)' : 'Visible Window'}`);

  let browser = null;

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: isHeadless ? 'new' : false,
      defaultViewport: { width: 1280, height: 900 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-notifications',
        '--disable-blink-features=AutomationControlled',
        '--lang=en-US,en'
      ]
    });

    activeBrowserInstance = browser;

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // Inject saved cookies if present
    const savedCookies = loadFacebookCookies();
    if (savedCookies && savedCookies.length > 0) {
      try {
        await page.setCookie(...savedCookies);
        appendScrapeLog(`Injected ${savedCookies.length} Facebook session cookies (Authenticated session).`);
      } catch (cErr) {
        appendScrapeLog(`Note on cookies: ${cErr.message}`);
      }
    } else {
      appendScrapeLog('Scraping in public visitor mode (no session cookies attached).');
    }

    appendScrapeLog('Navigating to group feed...');
    await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 50000 });

    // Allow time for redirect
    await new Promise(r => setTimeout(r, 4000));
    if (!activeScrapeJob.running) return null;

    const finalUrl = page.url();
    appendScrapeLog(`Connected to group: ${finalUrl}`);

    // Automatically remove login modal overlay if public
    await page.evaluate(() => {
      document.querySelectorAll('div[role="dialog"]').forEach(d => d.remove());
      document.body.style.overflow = 'auto';
      document.documentElement.style.overflow = 'auto';
    });

    appendScrapeLog('Extracting posts and expanding "See more" text...');
    const collectedRawPosts = new Map();

    for (let scroll = 1; scroll <= maxScrolls; scroll++) {
      if (!activeScrapeJob.running) {
        appendScrapeLog('Scrape stopped by user.');
        break;
      }

      appendScrapeLog(`Scroll iteration ${scroll}/${maxScrolls}...`);

      // 1. Click all "See more" buttons to uncover hidden phone numbers
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('div[role="button"], span'))
          .filter(b => (b.innerText || '').trim().toLowerCase() === 'see more');
        btns.forEach(b => { try { b.click(); } catch (_) {} });
      });

      await new Promise(r => setTimeout(r, 1500));
      if (!activeScrapeJob.running) break;

      // 2. Extract visible post containers from DOM
      const extractedThisScroll = await page.evaluate(() => {
        const items = [];
        const articles = document.querySelectorAll('div[role="article"], div[role="feed"] > div');

        articles.forEach(article => {
          const rawText = article.innerText || article.textContent || '';
          if (rawText.length < 40) return;

          let posterName = null;
          const authorEl = article.querySelector('h2, h3, h4, strong a, a[role="link"] > strong');
          if (authorEl) {
            posterName = authorEl.textContent.trim();
          }

          let postUrl = null;
          const links = Array.from(article.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"]'));
          if (links.length > 0) {
            postUrl = links[0].href;
          }

          items.push({
            rawText,
            posterName,
            postUrl
          });
        });

        return items;
      });

      // 3. Process and deduplicate
      for (const item of extractedThisScroll) {
        const snippet = item.rawText.slice(0, 100).toLowerCase().replace(/\s+/g, ' ');
        if (!collectedRawPosts.has(snippet)) {
          collectedRawPosts.set(snippet, item);

          const phones = extractPhones(item.rawText);
          if (phones.length > 0) {
            activeScrapeJob.phonesFound++;
          }
        }
      }

      activeScrapeJob.postsFound = collectedRawPosts.size;
      appendScrapeLog(`Indexed ${collectedRawPosts.size} posts (${activeScrapeJob.phonesFound} with phone contacts).`);

      if (collectedRawPosts.size >= maxPosts) {
        appendScrapeLog(`Reached requested post volume (${maxPosts}). Processing extracted leads...`);
        break;
      }

      // Scroll down
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 0.9);
      });

      await new Promise(r => setTimeout(r, 1800));
    }

    const allPosts = Array.from(collectedRawPosts.values());
    appendScrapeLog(`Extraction complete. Total unique posts collected: ${allPosts.length}`);

    // Ingest into database
    appendScrapeLog('Parsing agent details, Nigerian phone numbers, property listings & scoring leads...');

    let sourceLocation = null;
    if (sourceId) {
      const src = db.prepare('SELECT location_covered FROM sources WHERE id = ?').get(sourceId);
      if (src) sourceLocation = src.location_covered;
    }

    const batchPayload = allPosts.map(p => ({
      rawText: p.rawText,
      posterName: p.posterName,
      originalPostUrl: p.postUrl || finalUrl,
      sourceId,
      sourceLocation
    }));

    const ingestSummary = ingestBatch(batchPayload, {
      sourceId,
      sourceLocation,
      method: 'Facebook-Scraper'
    });

    appendScrapeLog(`🎉 Scraping & Lead Discovery Finished Successfully!`);
    appendScrapeLog(`- Listings imported: ${ingestSummary.postsImported}`);
    appendScrapeLog(`- New agents discovered: ${ingestSummary.agentsCreated}`);
    appendScrapeLog(`- Existing agents updated: ${ingestSummary.agentsUpdated}`);
    appendScrapeLog(`- Duplicates merged: ${ingestSummary.duplicatesDetected}`);

    activeScrapeJob.running = false;
    activeScrapeJob.completedSummary = {
      totalScraped: allPosts.length,
      ...ingestSummary
    };

    return activeScrapeJob.completedSummary;

  } catch (err) {
    appendScrapeLog(`❌ Scraper Error: ${err.message}`);
    activeScrapeJob.running = false;
    activeScrapeJob.error = err.message;
    throw err;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    activeBrowserInstance = null;
  }
}

/**
 * Automates scraping a batch of Facebook Groups
 */
async function scrapeFacebookGroupBatch(groupUrls, options = {}) {
  const { maxPosts = 25, maxScrolls = 8, headless = true } = options;
  appendScrapeLog(`Starting batch scrape across ${groupUrls.length} groups...`);

  const results = [];
  for (let i = 0; i < groupUrls.length; i++) {
    const url = groupUrls[i];
    appendScrapeLog(`\n========================================`);
    appendScrapeLog(`Group [${i + 1}/${groupUrls.length}]: ${url}`);
    appendScrapeLog(`========================================`);

    try {
      const res = await scrapeFacebookGroup(url, { maxPosts, maxScrolls, headless });
      results.push({ url, success: true, summary: res });
    } catch (err) {
      appendScrapeLog(`Error on group ${url}: ${err.message}`);
      results.push({ url, success: false, error: err.message });
    }

    // Brief rest between groups
    await new Promise(r => setTimeout(r, 2000));
  }

  appendScrapeLog(`Batch complete. Scraped ${groupUrls.length} groups.`);
  return results;
}

/**
 * Automates scraping Nigerian Property Portals (e.g. PropertyPro, NigeriaPropertyCentre, etc.)
 * Supports both multi-listing search/category pages and single property listing URLs.
 */
async function scrapePropertyPortal(portalUrl, options = {}) {
  const { maxPages = 3, headless = true, sourceId = null } = options;

  activeScrapeJob = {
    running: true,
    targetUrl: portalUrl,
    sourceType: 'Property Portal',
    postsFound: 0,
    phonesFound: 0,
    logs: [],
    error: null,
    completedSummary: null
  };

  const isHeadless = (headless === 'headless' || headless === true);
  appendScrapeLog(`Starting portal scraper for: ${portalUrl}`);
  appendScrapeLog(`Settings: Max Pages=${maxPages}, Mode=${isHeadless ? 'Background (Silent)' : 'Visible Window'}`);

  let browser = null;

  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: isHeadless ? 'new' : false,
      defaultViewport: { width: 1280, height: 900 },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-notifications']
    });

    activeBrowserInstance = browser;
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

    // Check if URL is a single listing page
    const isSingleListing = portalUrl.includes('/property/') && 
      !portalUrl.includes('/property-for-rent') && 
      !portalUrl.includes('/property-for-sale') && 
      !portalUrl.includes('/flats-apartments');

    const collectedListings = [];

    if (isSingleListing) {
      appendScrapeLog('Detected single property listing URL. Scraping detailed listing & agent contact...');
      await page.goto(portalUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await new Promise(r => setTimeout(r, 2000));

      const singleData = await page.evaluate(() => {
        const title = (document.querySelector('h1, h2')?.textContent || document.title).trim();
        const price = (document.querySelector('.price, [itemprop="price"], h3')?.textContent || '').trim();

        // Extract phone numbers from tel: links
        const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'))
          .map(a => a.href.replace(/^tel:\s*/i, '').trim());

        // Extract from WhatsApp links
        const waLinks = Array.from(document.querySelectorAll('a[href*="phone="], a[href*="wa.me/"]')).map(a => {
          const m = a.href.match(/phone=([0-9+]+)/) || a.href.match(/wa\.me\/([0-9+]+)/);
          return m ? m[1] : null;
        }).filter(Boolean);

        // Extract from data-phone attributes
        const dataPhones = Array.from(document.querySelectorAll('[data-phone], [data-contact]'))
          .map(el => el.getAttribute('data-phone') || el.getAttribute('data-contact'))
          .filter(Boolean);

        // Extract agent name
        let agentName = '';
        const agentLink = document.querySelector('a[href*="/agent/"]');
        if (agentLink) {
          const slug = agentLink.href.split('/agent/')[1]?.split(/[#/?]/)[0] || '';
          agentName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        if (!agentName) {
          const agentEl = document.querySelector('.agent-name, .marketed-by, .agent-details, .user-name');
          if (agentEl) agentName = agentEl.textContent.trim();
        }

        const bodyText = document.body.innerText || '';

        return {
          title,
          price,
          phones: Array.from(new Set([...telLinks, ...waLinks, ...dataPhones])),
          agentName,
          bodyText
        };
      });

      appendScrapeLog(`Found listing: "${singleData.title}"`);
      if (singleData.phones.length > 0) {
        appendScrapeLog(`Discovered phone numbers: ${singleData.phones.join(', ')}`);
        activeScrapeJob.phonesFound += singleData.phones.length;
      }
      activeScrapeJob.postsFound = 1;

      const rawCombined = `${singleData.title}\n${singleData.price}\n${singleData.agentName}\n${singleData.phones.join(' ')}\n${singleData.bodyText.slice(0, 1000)}`;
      collectedListings.push({
        rawText: rawCombined,
        posterName: singleData.agentName || 'Portal Agent',
        originalPostUrl: portalUrl
      });

    } else {
      // Multi-listing search / category page
      for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
        if (!activeScrapeJob.running) break;
        const pageUrl = pageNum === 1 ? portalUrl : `${portalUrl}${portalUrl.includes('?') ? '&' : '?'}page=${pageNum}`;
        appendScrapeLog(`Navigating to portal page ${pageNum}: ${pageUrl}`);

        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await new Promise(r => setTimeout(r, 2500));

        const pageCards = await page.evaluate(() => {
          let elements = Array.from(document.querySelectorAll('.property-listing, .property-listing-grid, .property-list, [itemtype*="Product"], .listing-card, article'));
          if (elements.length === 0) {
            elements = Array.from(document.querySelectorAll('div')).filter(d => 
              (d.querySelector('a[href^="tel:"]') || d.querySelector('a[href*="/property/"]')) && 
              d.innerText.length > 40 && d.innerText.length < 2000
            );
          }

          return elements.map(card => {
            const titleEl = card.querySelector('h2, h3, h4, .property-title, [itemprop="name"]');
            const title = titleEl ? titleEl.textContent.trim() : '';

            const priceEl = card.querySelector('.price, [itemprop="price"], .property-price, h3');
            const price = priceEl ? priceEl.textContent.trim() : '';

            // Extract phone from tel: link
            const telEl = card.querySelector('a[href^="tel:"]');
            const tel = telEl ? telEl.href.replace(/^tel:\s*/i, '').trim() : '';

            // Extract from WhatsApp link
            const waEl = card.querySelector('a[href*="phone="], a[href*="wa.me/"]');
            let wa = '';
            if (waEl) {
              const m = waEl.href.match(/phone=([0-9+]+)/) || waEl.href.match(/wa\.me\/([0-9+]+)/);
              if (m) wa = m[1];
            }

            // Extract data-phone
            const phoneAttr = card.querySelector('[data-phone]')?.getAttribute('data-phone') || '';

            // Agent name
            let agentName = '';
            const agentLink = card.querySelector('a[href*="/agent/"]');
            if (agentLink) {
              const slug = agentLink.href.split('/agent/')[1]?.split(/[#/?]/)[0] || '';
              agentName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            }
            if (!agentName) {
              const agentEl = card.querySelector('.agent-name, .marketed-by, .property-agent, .agent-info');
              if (agentEl) agentName = agentEl.textContent.trim();
            }

            // Listing URL
            const linkEl = card.querySelector('a[href*="/property/"], a[href*="/for-rent/"], a[href*="/property-for-rent/"]');
            const listingUrl = linkEl ? linkEl.href : null;

            const text = card.innerText || '';
            const phones = [tel, wa, phoneAttr].filter(Boolean);

            return {
              title,
              price,
              phones,
              agentName,
              listingUrl,
              text
            };
          });
        });

        appendScrapeLog(`Found ${pageCards.length} property listing cards on page ${pageNum}.`);

        for (const c of pageCards) {
          const rawText = `${c.title}\n${c.price}\n${c.agentName}\n${c.phones.join(' ')}\n${c.text}`;
          const phones = extractPhones(c.phones.join(' ') + ' ' + rawText);
          if (phones.length > 0) {
            activeScrapeJob.phonesFound++;
          }
          collectedListings.push({
            rawText,
            posterName: c.agentName || 'Portal Agent',
            originalPostUrl: c.listingUrl || pageUrl
          });
        }

        activeScrapeJob.postsFound = collectedListings.length;
        appendScrapeLog(`Indexed ${collectedListings.length} total listings so far (${activeScrapeJob.phonesFound} with phone contacts).`);

        if (pageCards.length === 0) break;
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    appendScrapeLog(`Extraction finished. Ingesting ${collectedListings.length} listings into database...`);

    const summary = ingestBatch(collectedListings, {
      sourceId,
      method: 'Portal-Scraper'
    });

    appendScrapeLog(`🎉 Portal Lead Discovery Finished Successfully!`);
    appendScrapeLog(`- Listings imported: ${summary.postsImported}`);
    appendScrapeLog(`- New agents discovered: ${summary.agentsCreated}`);
    appendScrapeLog(`- Existing agents updated: ${summary.agentsUpdated}`);
    appendScrapeLog(`- Duplicates merged: ${summary.duplicatesDetected}`);

    activeScrapeJob.running = false;
    activeScrapeJob.completedSummary = {
      totalScraped: collectedListings.length,
      ...summary
    };

    return activeScrapeJob.completedSummary;

  } catch (err) {
    appendScrapeLog(`❌ Portal Scraper Error: ${err.message}`);
    activeScrapeJob.running = false;
    activeScrapeJob.error = err.message;
    throw err;
  } finally {
    if (browser) await browser.close().catch(() => {});
    activeBrowserInstance = null;
  }
}

module.exports = {
  checkProfileStatus,
  launchLoginBrowser,
  saveFacebookCookies,
  loadFacebookCookies,
  clearFacebookCookies,
  scanUserJoinedGroups,
  scrapeFacebookGroup,
  scrapeFacebookGroupBatch,
  scrapePropertyPortal,
  getActiveScrapeStatus,
  stopScrapeJob,
  appendScrapeLog,
  CHROME_PATH
};
