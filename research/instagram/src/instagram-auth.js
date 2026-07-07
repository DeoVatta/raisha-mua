/**
 * Instagram Auth - Auto cookie refresh via Playwright login
 *
 * Reads IG_USERNAME + IG_PASSWORD from environment or .env file.
 * If cookies are invalid/expired, auto-login and save new cookies.
 *
 * Usage:
 *   IG_USERNAME=your_username IG_PASSWORD=your_password node index.js
 *   # or put in .env:
 *   IG_USERNAME=your_username
 *   IG_PASSWORD=your_password
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIES_FILE = path.join(__dirname, 'instagram-cookies.json');
const IG_USERNAME = process.env.IG_USERNAME || '';
const IG_PASSWORD = process.env.IG_PASSWORD || '';

async function saveCookies(cookies) {
    // Fix sameSite: no_restriction → None
    const fixed = cookies.map(c => ({
        ...c,
        sameSite: c.sameSite === 'no_restriction' ? 'None' : (c.sameSite || 'None')
    }));
    fs.writeFileSync(COOKIES_FILE, JSON.stringify(fixed, null, 4));
    console.log(`[AUTH] Cookies saved to ${COOKIES_FILE}`);
}

async function loadCookies() {
    if (!fs.existsSync(COOKIES_FILE)) return null;
    try {
        return JSON.parse(fs.readFileSync(COOKIES_FILE, 'utf8'));
    } catch {
        return null;
    }
}

/**
 * Quick session check — validate sessionid expiration.
 * Returns true if session is still valid (>7 days left).
 */
async function checkSessionValidity(cookies) {
    if (!cookies || cookies.length === 0) return false;
    const sessionCookie = cookies.find(c => c.name === 'sessionid');
    if (!sessionCookie?.expirationDate) return false;
    if (!sessionCookie?.value) return false;

    const now = Date.now() / 1000;
    const daysLeft = Math.round((sessionCookie.expirationDate - now) / 86400);
    console.log(`[AUTH] sessionid expires in ~${daysLeft} days`);
    return daysLeft > 7;
}

async function loginInstagram(username, password) {
    console.log(`[AUTH] Attempting login for @${username}...`);
    const browser = await chromium.launch({
        headless: false, // Need visible browser for login
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-blink-features=AutomationControlled',
        ]
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    // Stealth: hide automation flags
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
    });

    try {
        // Navigate to login page
        await page.goto('https://www.instagram.com/accounts/login/', { timeout: 30000 });
        await page.waitForTimeout(3000);

        // Fill username
        const usernameInput = page.locator('input[name="username"], input[aria-label="Username"]').first();
        await usernameInput.waitFor({ timeout: 10000 });
        await usernameInput.fill(username);
        await page.waitForTimeout(500);

        // Fill password
        const passwordInput = page.locator('input[name="password"], input[aria-label="Password"]').first();
        await passwordInput.fill(password);
        await page.waitForTimeout(500);

        // Click login button
        const loginBtn = page.locator('button[type="submit"]').first();
        await loginBtn.click();
        await page.waitForTimeout(5000);

        // Check if login succeeded (URL changed away from login)
        const url = page.url();
        if (url.includes('/accounts/login')) {
            // Might need to handle "Save Info" prompt or "Not Now"
            const saveInfoBtn = page.locator('button:has-text("Save Info"), button:has-text("Not Now")').first();
            try {
                await saveInfoBtn.waitFor({ timeout: 5000 });
                await saveInfoBtn.click();
                await page.waitForTimeout(2000);
            } catch (e) { /* no prompt */ }

            const finalUrl = page.url();
            if (finalUrl.includes('/accounts/login')) {
                console.log('[AUTH] Login FAILED — check credentials');
                await browser.close();
                return null;
            }
        }

        console.log(`[AUTH] Login SUCCESS — URL: ${page.url()}`);
        await page.waitForTimeout(3000);

        // Extract cookies
        const cookies = await context.cookies('https://www.instagram.com');
        console.log(`[AUTH] Extracted ${cookies.length} cookies`);
        await browser.close();
        return cookies;

    } catch (e) {
        console.log(`[AUTH] Login error: ${e.message}`);
        await browser.close();
        return null;
    }
}

/**
 * Main auth function:
 * 1. Load existing cookies
 * 2. If valid (>7 days) → use them
 * 3. If IG_USERNAME + IG_PASSWORD provided → auto-login
 * 4. If no credentials → exit with instructions
 */
export async function ensureAuth() {
    const existingCookies = await loadCookies();
    const hasSessionId = existingCookies?.some(c => c.name === 'sessionid' && c.value);

    if (hasSessionId) {
        const isValid = await checkSessionValidity(existingCookies);
        if (isValid) {
            console.log('[AUTH] Session valid — using existing cookies');
            return existingCookies;
        }
    }

    // Need fresh login
    if (!IG_USERNAME || !IG_PASSWORD) {
        console.log('\n[AUTH] No valid cookies and no credentials provided.');
        console.log('[AUTH] Set IG_USERNAME and IG_PASSWORD to enable auto-login:');
        console.log('  Option 1: export IG_USERNAME=xxx IG_PASSWORD=xxx');
        console.log('  Option 2: Add to .env file in instagram/ folder:');
        console.log('    IG_USERNAME=your_username');
        console.log('    IG_PASSWORD=your_password');
        console.log('\n[AUTH] Or manually refresh cookies in browser and update instagram-cookies.json');
        process.exit(1);
    }

    const newCookies = await loginInstagram(IG_USERNAME, IG_PASSWORD);
    if (!newCookies || newCookies.length === 0) {
        console.log('[AUTH] Could not obtain new cookies — check credentials');
        process.exit(1);
    }

    await saveCookies(newCookies);
    console.log('[AUTH] New cookies saved — ready to run');
    return newCookies;
}
