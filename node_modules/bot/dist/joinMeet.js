"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const playwright_extra_1 = require("playwright-extra");
const puppeteer_extra_plugin_stealth_1 = __importDefault(require("puppeteer-extra-plugin-stealth"));
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
playwright_extra_1.chromium.use((0, puppeteer_extra_plugin_stealth_1.default)());
const MEET_URL = process.env.MEET_URL;
const MEETING_ID = process.env.MEETING_ID;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
async function run() {
    console.log('Starting bot...');
    const browser = await playwright_extra_1.chromium.launch({
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
    }
    catch (e) {
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
            const res = await axios_1.default.post(`${BACKEND_URL}/api/meetings`, { meet_url: MEET_URL });
            meetingId = res.data.id;
            console.log(`Registered meeting: ${meetingId}`);
        }
        catch (e) {
            console.error('Failed to register meeting. Is backend running?');
            await browser.close();
            return;
        }
    }
    else {
        console.log(`Using existing meeting ID: ${meetingId}`);
    }
    async function navigateWithRetries(url) {
        for (let i = 0; i < 3; i++) {
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                return;
            }
            catch (e) {
                if (i === 2)
                    throw e;
                await page.waitForTimeout(3000);
            }
        }
    }
    await navigateWithRetries(MEET_URL);
    // Handle "Ask to join" or "Join now"
    try {
        // Check if we are on the pre-join screen
        // Input name might be required if not logged in
        const nameInput = await page.$('input[placeholder="Your name"]');
        if (nameInput) {
            await nameInput.fill('AI Note Taker');
            await page.click('span:has-text("Ask to join")');
        }
        else {
            // Logged in or name not asked
            try {
                await page.waitForSelector('span:has-text("Join now")', { timeout: 5000 });
                await page.click('span:has-text("Join now")');
            }
            catch {
                await page.click('span:has-text("Ask to join")');
            }
        }
        console.log('Clicked Join/Ask to join');
    }
    catch (e) {
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
            }
            catch { }
        }
        if (!enabled) {
            try {
                await page.click('button[aria-label="More options"]');
                await page.waitForSelector('div[role="menu"]', { timeout: 5000 });
                await page.click('span:has-text("Turn on captions")');
                enabled = true;
            }
            catch { }
        }
        if (enabled) {
            console.log('Captions enabled');
        }
        else {
            console.log('Could not enable captions');
        }
    }
    catch (e) {
        console.log('Could not enable captions:', e);
    }
    // Expose function to send data to node context
    await page.exposeFunction('sendCaption', async (speaker, text) => {
        console.log(`[${speaker}] ${text}`);
        try {
            await axios_1.default.post(`${BACKEND_URL}/api/transcripts`, {
                meeting_id: meetingId,
                speaker,
                text,
                timestamp: new Date().toISOString(),
            });
        }
        catch (e) {
            // Silent error or log
        }
    });
    await page.evaluate(() => {
        const state = { speaker: '', buffer: '', lastText: '', timer: null, seen: new Set() };
        const uiPattern = /(format[_\s]?size|font\s?size|font\s?color|open\s?caption[s]?|caption[s]?\s?settings|settings|arrow[_\s]?downward|jump\s?to\s?bottom|closed\s?captions|turn\s?on\s?captions|turn\s?off\s?captions|translate|language[s]?|more\s?options|default|tiny|small|medium|large|huge|jumbo|circle|white|black|blue|green|red|yellow|cyan|magenta|beta)/i;
        const languagePattern = /(english|afrikaans|albanian|amharic|armenian|azerbaijani|basque|catalan|galician|georgian|icelandic|javanese|kazakh|kinyarwanda|macedonian|mongolian|northern\s?sotho|sesotho|slovenian|sundanese|swahili|swati|tshivenda|tswana|uzbek|xhosa|xitsonga|zulu|portuguese|spanish|french|german|italian|mandarin|cantonese|chinese|japanese|korean|hindi|arabic|russian|turkish|vietnamese|thai|indonesian|bengali|urdu|punjabi|tamil|telugu|marathi|gujarati|kannada|malayalam|sinhala|filipino|tagalog|malay|burmese|khmer|lao|nepali|pashto|farsi|persian|hebrew|greek|dutch|swedish|norwegian|danish|finnish|polish|czech|slovak|hungarian|romanian|bulgarian|serbian|croatian|ukrainian|lithuanian|latvian|estonian)/i;
        const normalize = (s) => (s || '').toLowerCase().trim();
        const isGarbage = (t) => {
            const s = normalize(t);
            const noSpace = s.replace(/\s+/g, '');
            if (s.length < 3)
                return true;
            if (uiPattern.test(s))
                return true;
            if (languagePattern.test(s))
                return true;
            if (/defaulttinysmallmediumlargehugejumbo/.test(noSpace))
                return true;
            if (/defaultwhiteblackbluegreenredyellowcyanmagenta/.test(noSpace))
                return true;
            if ((s.match(/beta/g) || []).length >= 2)
                return true;
            if (s.includes('language') && s.length > 80)
                return true;
            return false;
        };
        const isInMenu = (node) => {
            if (!node)
                return false;
            const menu = node.closest('[role="menu"], [role="listbox"], [role="combobox"], [role="dialog"]');
            if (menu)
                return true;
            const labeled = node.closest('[aria-label*="caption"], [aria-label*="language"], [aria-label*="font"], [aria-label*="settings"]');
            return !!labeled;
        };
        const flush = () => {
            const t = (state.buffer || '').trim();
            if (!t)
                return;
            if (isGarbage(t)) {
                state.buffer = '';
                state.lastText = '';
                return;
            }
            const norm = normalize(t);
            if (state.seen.has(norm)) {
                state.buffer = '';
                state.lastText = '';
                return;
            }
            state.seen.add(norm);
            window.sendCaption(state.speaker || 'Unknown Speaker', t);
            state.buffer = '';
            state.lastText = '';
        };
        const schedule = () => {
            if (state.timer)
                clearTimeout(state.timer);
            state.timer = setTimeout(flush, 1600);
        };
        const observer = new MutationObserver(() => {
            const containers = document.querySelectorAll('[aria-live="polite"], [aria-live="assertive"], .iOzk7, .a4cQT, .VbkSUe');
            containers.forEach((container) => {
                const nodes = container.querySelectorAll('span, div');
                nodes.forEach((node) => {
                    const text = node.textContent?.trim();
                    if (!text)
                        return;
                    if (isInMenu(node))
                        return;
                    if (isGarbage(text))
                        return;
                    let speaker = 'Unknown Speaker';
                    const img = node.closest('.a4cQT')?.querySelector('img');
                    if (img)
                        speaker = img.getAttribute('alt') || speaker;
                    if (state.speaker && speaker === state.speaker) {
                        if (text === state.lastText) {
                            schedule();
                            return;
                        }
                        if (state.lastText && text.startsWith(state.lastText)) {
                            state.buffer = text;
                            state.lastText = text;
                            schedule();
                            return;
                        }
                        state.buffer = text;
                        state.lastText = text;
                        schedule();
                        return;
                    }
                    flush();
                    state.speaker = speaker;
                    state.buffer = text;
                    state.lastText = text;
                    schedule();
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
    // Keep running
    await new Promise(() => { });
}
run();
