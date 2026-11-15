const puppeteer = require('puppeteer-core');
const { extractPhones, resolveContactPhones } = require('../src/nlp/phoneParser.js');
const { parsePropertyListing } = require('../src/nlp/propertyParser.js');
const { resolveAndSaveListing } = require('../src/services/deduplicationService.js');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'https://web.facebook.com/share/g/1R1HwscPr5/';

(async () => {
  console.log('Testing end-to-end scraper on user group URL:', TARGET_URL);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-notifications'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

  console.log('Navigating to group URL...');
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4000));

  const resolvedUrl = page.url();
  console.log('Resolved Group URL:', resolvedUrl);

  // Remove login overlay
  await page.evaluate(() => {
    document.querySelectorAll('div[role="dialog"]').forEach(d => d.remove());
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
  });

  // Scroll and expand "See more"
  console.log('Scrolling feed and expanding "See more" buttons...');
  for (let i = 1; i <= 5; i++) {
    // Click See more buttons
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('div[role="button"], span'))
        .filter(b => (b.innerText || '').trim().toLowerCase() === 'see more')
        .forEach(b => { try { b.click(); } catch (_) {} });
    });

    await page.evaluate(() => window.scrollBy(0, 1200));
    await new Promise(r => setTimeout(r, 2000));
  }

  // Extract posts
  const posts = await page.evaluate(() => {
    const articles = document.querySelectorAll('div[role="article"], div[role="feed"] > div');
    const results = [];
    articles.forEach(a => {
      const text = a.innerText || '';
      if (text.length < 40) return;

      const authorEl = a.querySelector('h2, h3, h4, strong a, a[role="link"] > strong');
      const name = authorEl ? authorEl.textContent.trim() : null;

      const linkEl = a.querySelector('a[href*="/posts/"], a[href*="/permalink/"], a[href*="story_fbid"]');
      const url = linkEl ? linkEl.href : null;

      results.push({ text, name, url });
    });
    return results;
  });

  console.log(`Found ${posts.length} raw posts in group!`);

  let discoveredWithPhone = 0;
  for (const p of posts) {
    const phones = extractPhones(p.text);
    if (phones.length > 0) {
      discoveredWithPhone++;
      const contacts = resolveContactPhones(phones);
      const property = parsePropertyListing(p.text);

      console.log('----------------------------------------------------');
      console.log('👤 Poster/Agent:', p.name || 'Anonymous');
      console.log('📞 Phone Number:', contacts.primaryPhone);
      console.log('🏠 Property:', property.propertyType, '| Area:', property.neighbourhood || property.city);
      console.log('💰 Rent:', property.rentAmount || 'Unspecified');
      console.log('🔗 Link:', p.url || resolvedUrl);

      // Save to real database
      const saveRes = resolveAndSaveListing({
        rawText: p.text,
        posterName: p.name,
        primaryPhone: contacts.primaryPhone,
        secondaryPhone: contacts.secondaryPhone,
        whatsappPhone: contacts.whatsappPhone,
        propertyType: property.propertyType,
        rentAmount: property.rentAmount,
        rentPeriod: property.rentPeriod,
        city: property.city,
        neighbourhood: property.neighbourhood,
        features: property.features,
        originalPostUrl: p.url || resolvedUrl
      });

      console.log(`💾 Saved to DB! (Agent ID: ${saveRes.agent.id}, Score: ${saveRes.agent.lead_score})`);
    }
  }

  console.log('====================================================');
  console.log(`✅ TEST COMPLETE: ${discoveredWithPhone} agent leads extracted and saved to DB!`);
  await browser.close();
})();
