import { chromium } from 'playwright';

(async () => {
  console.log('Launching browser for login...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('https://accounts.google.com');
  
  console.log('Please log in manually in the browser window.');
  console.log('When finished, press Enter here to save session and exit.');
  
  await new Promise(resolve => process.stdin.once('data', resolve));
  
  await context.storageState({ path: 'auth.json' });
  console.log('Auth state saved to auth.json');
  
  await browser.close();
  process.exit(0);
})();
