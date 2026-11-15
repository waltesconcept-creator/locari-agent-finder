const puppeteer = require('puppeteer-core');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  console.log('Testing Facebook public group access...');
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

  console.log('Loading group https://web.facebook.com/groups/320272456356519/ ...');
  await page.goto('https://web.facebook.com/groups/320272456356519/', { waitUntil: 'domcontentloaded', timeout: 35000 });
  await new Promise(r => setTimeout(r, 4000));

  console.log('Page loaded:', page.url());

  // Check login wall
  const hasLoginWall = await page.evaluate(() => {
    return document.body.innerText.includes('See more on Facebook') || document.body.innerText.includes('Log in');
  });
  console.log('Has Login Wall:', hasLoginWall);

  // Try dismissing / removing login overlays
  await page.evaluate(() => {
    // 1. Click close buttons if any
    const closeBtns = Array.from(document.querySelectorAll('[aria-label="Close"], [role="button"]'))
      .filter(b => (b.innerText || b.getAttribute('aria-label') || '').toLowerCase().includes('close'));
    closeBtns.forEach(b => { try { b.click(); } catch (_) {} });

    // 2. Remove fixed modal dialogs
    document.querySelectorAll('div[role="dialog"]').forEach(el => el.remove());
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';
  });

  await new Promise(r => setTimeout(r, 1000));

  // Try scrolling 3 times to see if Facebook loads more posts for unauthenticated visitors
  for (let i = 1; i <= 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 1000));
    await new Promise(r => setTimeout(r, 2000));
  }

  const posts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('div[role="article"], div[role="feed"] > div'))
      .map(el => (el.innerText || '').slice(0, 100).replace(/\s+/g, ' '))
      .filter(t => t.length > 25);
  });

  console.log(`Total post containers found: ${posts.length}`);
  posts.slice(0, 5).forEach((p, idx) => console.log(`  Post ${idx + 1}: ${p}`));

  await browser.close();
  console.log('Test completed.');
})();
