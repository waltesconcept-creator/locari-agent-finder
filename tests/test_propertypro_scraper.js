const puppeteer = require('puppeteer-core');
const { extractPhones, resolveContactPhones } = require('../src/nlp/phoneParser.js');
const { parsePropertyListing } = require('../src/nlp/propertyParser.js');
const { resolveAndSaveListing } = require('../src/services/deduplicationService.js');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testPropertyProScraper(url) {
  console.log('Testing PropertyPro Scraper on:', url);
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });

  const isSingleListing = url.includes('/property/') && !url.includes('/property-for-rent') && !url.includes('/property-for-sale');

  if (isSingleListing) {
    console.log('Detected SINGLE listing page!');
    const data = await page.evaluate(() => {
      const title = (document.querySelector('h1, h2')?.textContent || document.title).trim();
      const price = (document.querySelector('.price, [itemprop="price"], h3')?.textContent || '').trim();

      const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]')).map(a => a.href.replace(/^tel:\s*/i, '').trim());
      const waLinks = Array.from(document.querySelectorAll('a[href*="phone="], a[href*="wa.me/"]')).map(a => {
        const m = a.href.match(/phone=([0-9+]+)/) || a.href.match(/wa\.me\/([0-9+]+)/);
        return m ? m[1] : null;
      }).filter(Boolean);

      const agentLink = document.querySelector('a[href*="/agent/"]');
      let agentName = '';
      if (agentLink) {
        const slug = agentLink.href.split('/agent/')[1]?.split(/[#/?]/)[0] || '';
        agentName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }

      return {
        title,
        price,
        phones: Array.from(new Set([...telLinks, ...waLinks])),
        agentName,
        bodyText: document.body.innerText
      };
    });

    console.log('Found phones:', data.phones);
    console.log('Found agent name:', data.agentName);
    console.log('Found title:', data.title);

    const fullText = `${data.title}\n${data.price}\n${data.agentName}\n${data.phones.join(' ')}\n${data.bodyText.slice(0, 500)}`;
    const extractedPhones = extractPhones(data.phones.join(' ') + ' ' + fullText);
    const contacts = resolveContactPhones(extractedPhones);
    const prop = parsePropertyListing(fullText);

    if (contacts.primaryPhone) {
      const saved = resolveAndSaveListing({
        rawText: fullText,
        posterName: data.agentName || 'PropertyPro Agent',
        primaryPhone: contacts.primaryPhone,
        secondaryPhone: contacts.secondaryPhone,
        whatsappPhone: contacts.whatsappPhone,
        propertyType: prop.propertyType,
        rentAmount: prop.rentAmount,
        rentPeriod: prop.rentPeriod,
        city: prop.city || 'Lagos',
        neighbourhood: prop.neighbourhood,
        originalPostUrl: url,
        method: 'PropertyPro-Scraper'
      });
      console.log('✅ Successfully saved agent:', saved.agent.name, saved.agent.primary_phone, '| New Agent:', saved.isNewAgent);
    }

  } else {
    console.log('Detected MULTI-listing search page!');
    const cards = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('.property-listing, .property-listing-grid, .property-list, article'));
      return elements.map(el => {
        const title = (el.querySelector('h2, h3, h4, .property-title')?.textContent || '').trim();
        const price = (el.querySelector('.price, [itemprop="price"], h3')?.textContent || '').trim();

        const telLink = el.querySelector('a[href^="tel:"]');
        const tel = telLink ? telLink.href.replace(/^tel:\s*/i, '').trim() : '';

        const waLink = el.querySelector('a[href*="phone="], a[href*="wa.me/"]');
        let wa = '';
        if (waLink) {
          const m = waLink.href.match(/phone=([0-9+]+)/) || waLink.href.match(/wa\.me\/([0-9+]+)/);
          if (m) wa = m[1];
        }

        const agentLink = el.querySelector('a[href*="/agent/"]');
        let agentName = '';
        if (agentLink) {
          const slug = agentLink.href.split('/agent/')[1]?.split(/[#/?]/)[0] || '';
          agentName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }

        const linkEl = el.querySelector('a[href*="/property/"], a[href*="/for-rent/"]');
        const listingUrl = linkEl ? linkEl.href : null;

        return {
          title,
          price,
          phones: [tel, wa].filter(Boolean),
          agentName,
          listingUrl,
          text: el.innerText
        };
      });
    });

    console.log(`Found ${cards.length} cards on search page!`);
    let savedCount = 0;
    for (const card of cards) {
      const fullText = `${card.title}\n${card.price}\n${card.agentName}\n${card.phones.join(' ')}\n${card.text}`;
      const extractedPhones = extractPhones(card.phones.join(' ') + ' ' + fullText);
      const contacts = resolveContactPhones(extractedPhones);
      const prop = parsePropertyListing(fullText);

      if (contacts.primaryPhone) {
        const saved = resolveAndSaveListing({
          rawText: fullText,
          posterName: card.agentName || 'Property Agent',
          primaryPhone: contacts.primaryPhone,
          secondaryPhone: contacts.secondaryPhone,
          whatsappPhone: contacts.whatsappPhone,
          propertyType: prop.propertyType,
          rentAmount: prop.rentAmount,
          rentPeriod: prop.rentPeriod,
          city: prop.city || 'Nigeria',
          neighbourhood: prop.neighbourhood,
          originalPostUrl: card.listingUrl || url,
          method: 'PropertyPro-Scraper'
        });
        savedCount++;
        console.log(`Saved [${savedCount}]: ${saved.agent.name} | Phone: ${saved.agent.primary_phone} | Score: ${saved.agent.lead_score}`);
      }
    }
    console.log(`Total agents saved from search page: ${savedCount}`);
  }

  await browser.close();
}

(async () => {
  // Test 1: Single listing
  await testPropertyProScraper('https://propertypro.ng/property/commercial-property-for-rent-berger-ojodu-lagos-6QLZS');
  // Test 2: Search page
  await testPropertyProScraper('https://propertypro.ng/property-for-rent/flat-apartments/oyo/ibadan');
})();
