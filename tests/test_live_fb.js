const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { CHROME_PATH } = require('../src/services/facebookScraper.js');

async function test() {
  console.log('Testing live Facebook group navigation with Puppeteer...');
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-notifications',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
  
  // Inject saved cookies if available
  const cookiesPath = path.join(__dirname, '..', 'data', 'facebook_cookies.json');
  if (fs.existsSync(cookiesPath)) {
    try {
      const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));
      if (cookies.length > 0) {
        await page.setCookie(...cookies);
        console.log(`Injected ${cookies.length} cookies from facebook_cookies.json`);
      }
    } catch (e) {
      console.log('Error reading cookies:', e.message);
    }
  }

  const testUrl = 'https://web.facebook.com/share/g/19eXMFzEnq/';
  console.log('Navigating to:', testUrl);
  await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 35000 });
  
  const finalUrl = page.url();
  const pageTitle = await page.title();
  console.log('Final URL:', finalUrl);
  console.log('Page Title:', pageTitle);
  
  const screenshotPath = path.join(__dirname, '..', 'data', 'fb_test_screenshot.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log('Screenshot saved to:', screenshotPath);

  const evaluation = await page.evaluate(() => {
    const articles = document.querySelectorAll('div[role="article"], div[role="feed"] > div');
    const allText = document.body.innerText || '';
    const hasLoginButton = Array.from(document.querySelectorAll('a, button')).some(el => (el.innerText || '').toLowerCase().includes('log in'));
    const seeMoreButtons = Array.from(document.querySelectorAll('div[role="button"], span')).filter(b => (b.innerText || '').trim().toLowerCase() === 'see more').length;

    return {
      bodyLength: allText.length,
      bodyPreview: allText.slice(0, 300),
      articlesCount: articles.length,
      hasLoginButton,
      seeMoreButtons
    };
  });

  console.log('DOM Evaluation Result:', evaluation);

  await browser.close();
}

test().catch(err => console.error('Test failed with error:', err));
