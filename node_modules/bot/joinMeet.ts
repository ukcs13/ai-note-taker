import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

chromium.use(stealthPlugin());

const MEET_URL = process.env.MEET_URL;
const MEETING_ID = process.env.MEETING_ID;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

async function run() {
  console.log('Starting bot...');
  const browser = await chromium.launch({
    headless: process.env.HEADLESS === 'true',
    args: [
      '--use-fake-ui-for-media-stream',
      '--disable-blink-features=AutomationControlled',
      '--disable-notifications',
      '--start-maximized' // Helpful for selectors visibility
    ],
  });

  let context;
  try {
    context = await browser.newContext({
      storageState: 'auth.json',
      viewport: { width: 1280, height: 720 },
      permissions: ['microphone'],
    });
    console.log('Loaded auth.json');
  } catch (e) {
    console.log('No auth.json found, starting fresh session (might need manual login if headless=false)');
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      permissions: ['microphone'],
    });
  }

  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(120000);

  if (!MEET_URL) {
    console.error('MEET_URL not provided');
    await browser.close();
    return;
  }

  // Register meeting
  let meetingId = MEETING_ID;
  if (!meetingId) {
    try {
      const res = await axios.post(`${BACKEND_URL}/api/meetings`, { meet_url: MEET_URL });
      meetingId = res.data.id;
      console.log(`Registered meeting: ${meetingId}`);
    } catch (e) {
      console.error('Failed to register meeting. Is backend running?');
      await browser.close();
      return;
    }
  } else {
    console.log(`Using existing meeting ID: ${meetingId}`);
  }

  async function navigateWithRetries(url: string) {
    for (let i = 0; i < 3; i++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        return;
      } catch (e) {
        if (i === 2) throw e;
        await page.waitForTimeout(3000);
      }
    }
  }
  await navigateWithRetries(MEET_URL);

  // Handle "Ask to join" or "Join now"
  try {
    // 1. Check for login wall immediately
    try {
        const bodyText = await page.textContent('body');
        if (bodyText && (bodyText.includes('Sign in') || bodyText.includes('Use your Google Account'))) {
             console.log('BOT DETECTED LOGIN WALL. Cannot join anonymously.');
             console.log('Attempting to find name input anyway...');
        }
    } catch {}

    // 2. Aggressive "Got it" dismissal loop (5 seconds)
    const gotItStart = Date.now();
    while (Date.now() - gotItStart < 5000) {
        try {
            const gotIt = await page.$('span:has-text("Got it")');
            if (gotIt && await gotIt.isVisible()) {
                await gotIt.click();
                console.log('Dismissed "Got it" popup');
                await page.waitForTimeout(500); // Wait for animation
            } else {
                await page.waitForTimeout(500);
            }
        } catch {
             await page.waitForTimeout(500);
        }
    }

    // 3. Main Join Logic
    // Check if we are on the pre-join screen
    // Input name might be required if not logged in
    const nameInput = await page.$('input[placeholder="Your name"]');
    if (nameInput) {
        console.log('Found name input, filling...');
        await nameInput.fill('AI Note Taker');
        // Wait a bit for the button to become active
        await page.waitForTimeout(1000);
        await page.click('span:has-text("Ask to join")');
    } else {
        // Logged in or name not asked
        // Try multiple selectors for the join button
        const joinSelectors = [
            'span:has-text("Join now")',
            'span:has-text("Ask to join")',
            'button:has-text("Join now")',
            'button:has-text("Ask to join")'
        ];
        
        let joined = false;
        // Try for 15 seconds to find a join button
        const joinStart = Date.now();
        while (Date.now() - joinStart < 15000 && !joined) {
             for (const selector of joinSelectors) {
                try {
                    const btn = await page.$(selector);
                    if (btn && await btn.isVisible()) {
                        await btn.click();
                        joined = true;
                        console.log(`Clicked join button: ${selector}`);
                        break;
                    }
                } catch {}
            }
            if (!joined) await page.waitForTimeout(1000);
        }
        
        if (!joined) {
             // Last resort: try to find any button with "Join" text
             try {
                await page.click('text=/Join (now|meeting)/i');
                console.log('Clicked text-based Join button');
             } catch(e) {
                 console.log('Could not find standard join buttons.');
                 
                 // DEBUG DUMP
                 const bodyText = await page.textContent('body');
                 console.log('--- PAGE DUMP START ---');
                 console.log(bodyText?.substring(0, 500) + '...'); // First 500 chars
                 console.log('--- PAGE DUMP END ---');
                 
                 const errorText = await page.textContent('div[role="alert"]');
                 if (errorText) console.log('Meet Error:', errorText);
                 throw new Error('Failed to find join button');
             }
        }
    }
    console.log('Clicked Join/Ask to join');
  } catch (e) {
    console.log('Error joining (maybe already joined?):', e);
  }

  // Turn on captions
  try {
    const selectors = [
      'button[aria-label="Turn on captions"]',
      'button[aria-label="Turn on closed captions"]'
    ];
    let enabled = false;
    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        await page.click(sel);
        enabled = true;
        break;
      } catch {}
    }
    if (!enabled) {
      try {
        await page.click('button[aria-label="More options"]');
        await page.waitForSelector('div[role="menu"]', { timeout: 5000 });
        await page.click('span:has-text("Turn on captions")');
        enabled = true;
      } catch {}
    }
    if (enabled) {
      console.log('Captions enabled');
    } else {
      console.log('Could not enable captions');
    }
  } catch (e) {
    console.log('Could not enable captions:', e);
  }

  // Expose function to send data to node context
  const uiPattern = /(format[_\s]?size|font\s?size|font\s?color|open\s?caption[s]?|caption[s]?\s?settings|settings|arrow[_\s]?downward|jump\s?to\s?bottom|closed\s?captions|turn\s?on\s?captions|turn\s?off\s?captions|translate|language[s]?|more\s?options|default|tiny|small|medium|large|huge|jumbo|circle|white|black|blue|green|red|yellow|cyan|magenta|beta)/i;
  const languagePattern = /(english|afrikaans|albanian|amharic|armenian|azerbaijani|basque|catalan|galician|georgian|icelandic|javanese|kazakh|kinyarwanda|macedonian|mongolian|northern\s?sotho|sesotho|slovenian|sundanese|swahili|swati|tshivenda|tswana|uzbek|xhosa|xitsonga|zulu|portuguese|spanish|french|german|italian|mandarin|cantonese|chinese|japanese|korean|hindi|arabic|russian|turkish|vietnamese|thai|indonesian|bengali|urdu|punjabi|tamil|telugu|marathi|gujarati|kannada|malayalam|sinhala|filipino|tagalog|malay|burmese|khmer|lao|nepali|pashto|farsi|persian|hebrew|greek|dutch|swedish|norwegian|danish|finnish|polish|czech|slovak|hungarian|romanian|bulgarian|serbian|croatian|ukrainian|lithuanian|latvian|estonian)/i;
  const normalize = (s: string) => (s || '').toLowerCase().trim();
  const isGarbageNode = (t: string) => {
    const s = normalize(t);
    const noSpace = s.replace(/\s+/g, '');
    if (s.length < 3) return true;
    if (uiPattern.test(s)) return true;
    if (languagePattern.test(s)) return true;
    if (/defaulttinysmallmediumlargehugejumbo/.test(noSpace)) return true;
    if (/defaultwhiteblackbluegreenredyellowcyanmagenta/.test(noSpace)) return true;
    if ((s.match(/beta/g) || []).length >= 2) return true;
    if (s.includes('language') && s.length > 80) return true;
    return false;
  };
  // Optimized debounce for network requests (Node context)
  let sendTimeout: any = null;
  const pendingUpdates = new Map<string, any>();
  const sendCaption = (id: string, speaker: string, text: string) => {
    if (isGarbageNode(text)) return;
    pendingUpdates.set(id, { id, speaker, text, timestamp: new Date().toISOString() });
    if (sendTimeout) clearTimeout(sendTimeout);
    sendTimeout = setTimeout(async () => {
      const payload = Array.from(pendingUpdates.values());
      pendingUpdates.clear();
      for (const item of payload) {
        console.log(`[${item.speaker}] ${item.text}`);
        try {
          await axios.post(`${BACKEND_URL}/api/transcripts`, {
            id: item.id,
            meeting_id: meetingId,
            speaker: item.speaker,
            text: item.text,
            timestamp: item.timestamp,
          });
        } catch (e) {
          // silent
        }
      }
    }, 500); // 500ms debounce
  };
  await page.exposeFunction('sendCaption', sendCaption);

  await page.evaluate(() => {
    const state: any = { speaker: '', buffer: '', lastText: '', currentId: '', timer: null, seen: new Set<string>() };
    const uuid = () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    };
    const uiPattern = /(format[_\s]?size|font\s?size|font\s?color|open\s?caption[s]?|caption[s]?\s?settings|settings|arrow[_\s]?downward|jump\s?to\s?bottom|closed\s?captions|turn\s?on\s?captions|turn\s?off\s?captions|translate|language[s]?|more\s?options|default|tiny|small|medium|large|huge|jumbo|circle|white|black|blue|green|red|yellow|cyan|magenta|beta)/i
    const languagePattern = /(english|afrikaans|albanian|amharic|armenian|azerbaijani|basque|catalan|galician|georgian|icelandic|javanese|kazakh|kinyarwanda|macedonian|mongolian|northern\s?sotho|sesotho|slovenian|sundanese|swahili|swati|tshivenda|tswana|uzbek|xhosa|xitsonga|zulu|portuguese|spanish|french|german|italian|mandarin|cantonese|chinese|japanese|korean|hindi|arabic|russian|turkish|vietnamese|thai|indonesian|bengali|urdu|punjabi|tamil|telugu|marathi|gujarati|kannada|malayalam|sinhala|filipino|tagalog|malay|burmese|khmer|lao|nepali|pashto|farsi|persian|hebrew|greek|dutch|swedish|norwegian|danish|finnish|polish|czech|slovak|hungarian|romanian|bulgarian|serbian|croatian|ukrainian|lithuanian|latvian|estonian)/i
    const normalize = (s: string) => (s || '').toLowerCase().trim()
    const isGarbage = (t: string) => {
      const s = normalize(t)
      const noSpace = s.replace(/\s+/g, '')
      if (s.length < 3) return true
      if (uiPattern.test(s)) return true
      if (languagePattern.test(s)) return true
      if (/defaulttinysmallmediumlargehugejumbo/.test(noSpace)) return true
      if (/defaultwhiteblackbluegreenredyellowcyanmagenta/.test(noSpace)) return true
      if ((s.match(/beta/g) || []).length >= 2) return true
      if (s.includes('language') && s.length > 80) return true
      return false
    }
    const isInMenu = (node: Element | null) => {
      if (!node) return false
      const menu = node.closest('[role="menu"], [role="listbox"], [role="combobox"], [role="dialog"]')
      if (menu) return true
      const labeled = node.closest('[aria-label*="caption"], [aria-label*="language"], [aria-label*="font"], [aria-label*="settings"]')
      return !!labeled
    }
    const flush = () => {
      const t = (state.buffer || '').trim();
      if (!t) return;
      if (isGarbage(t)) { state.buffer = ''; state.lastText = ''; return; }
      
      if (!state.currentId) state.currentId = uuid();

      (window as any).sendCaption(state.currentId, state.speaker || 'Unknown Speaker', t);
      
      state.buffer = '';
      state.lastText = '';
      state.currentId = ''; 
    };
    const schedule = () => {
      if (state.timer) clearTimeout(state.timer);
      state.timer = setTimeout(flush, 1600);
    };
    // Helper to check if text is a "correction" of lastText (e.g. > 60% overlap)
    const isCorrection = (oldT: string, newT: string) => {
       if (!oldT || !newT) return false;
       const oldWords = oldT.split(/\s+/);
       const newWords = newT.split(/\s+/);
       if (newWords.length === 0) return false;
       
       let matchCount = 0;
       const set = new Set(oldWords);
       for (const w of newWords) {
          if (set.has(w)) matchCount++;
       }
       const overlap = matchCount / Math.max(oldWords.length, newWords.length);
       return overlap > 0.6; // 60% overlap implies it's likely the same sentence being corrected
    };

    const observer = new MutationObserver(() => {
      const containers = document.querySelectorAll('[aria-live="polite"], [aria-live="assertive"], .iOzk7, .a4cQT, .VbkSUe');
      containers.forEach((container) => {
        const nodes = container.querySelectorAll('span, div');
        nodes.forEach((node) => {
          const text = node.textContent?.trim();
          if (!text) return;
          if (isInMenu(node)) return;
          if (isGarbage(text)) return;
          let speaker = 'Unknown Speaker';
          const img = node.closest('.a4cQT')?.querySelector('img');
          if (img) speaker = img.getAttribute('alt') || speaker;
          
          if (state.speaker && speaker === state.speaker) {
            if (text === state.lastText) { schedule(); return; }
            
            // 1. Prefix match (Extension)
            if (state.lastText && text.startsWith(state.lastText)) {
              state.buffer = text;
              state.lastText = text;
              if (!state.currentId) state.currentId = uuid();
              (window as any).sendCaption(state.currentId, state.speaker, text);
              schedule();
              return;
            }

            // 2. Correction match (Fuzzy reuse)
            if (state.lastText && isCorrection(state.lastText, text)) {
               state.buffer = text;
               state.lastText = text;
               // Reuse ID even if not prefix
               if (!state.currentId) state.currentId = uuid();
               (window as any).sendCaption(state.currentId, state.speaker, text);
               schedule();
               return;
            }
            
            // 3. New sentence / Major change
            flush(); 
            state.speaker = speaker;
            state.buffer = text;
            state.lastText = text;
            state.currentId = uuid();
            (window as any).sendCaption(state.currentId, state.speaker, text);
            schedule();
            return;
          }
          
          // Speaker changed
          flush();
          state.speaker = speaker;
          state.buffer = text;
          state.lastText = text;
          state.currentId = uuid();
          (window as any).sendCaption(state.currentId, state.speaker, text);
          schedule();
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // Keep running
  await new Promise(() => {}); 
}

run();
