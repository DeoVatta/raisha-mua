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
const COOKIES_FILE = path.join(__dirname, '..', 'instagram-cookies.json');
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

    async function findInput(selector, label) {
        const selectors = typeof selector === 'string'
            ? [selector]
            : selector;
        for (const s of selectors) {
            try {
                const el = page.locator(s).first();
                if (await el.isVisible({ timeout: 3000 })) {
                    console.log(`[AUTH] Found ${label} via: ${s}`);
                    return el;
                }
            } catch { /* try next */ }
        }
        return null;
    }

    try {
        // Navigate to login page
        await page.goto('https://www.instagram.com/accounts/login/', { timeout: 30000 });
        await page.waitForTimeout(3000);

        // Check for "This was you?" challenge page
        const challengeText = await page.locator('text="This was you?"').isVisible().catch(() => false);
        if (challengeText) {
            console.log('[AUTH] Detected "This was you?" challenge — clicking Yes');
            await page.locator('button:has-text("Yes")').first().click();
            await page.waitForTimeout(3000);
        }

        // Try multiple selectors for username input
        const usernameSelectors = [
            'input[name="username"]',
            'input[aria-label="Username"]',
            'input[placeholder*="username" i]',
            'input[placeholder*="Phone" i]',
            'input[type="text"]',
            'input#email',
        ];
        const usernameInput = await findInput(usernameSelectors, 'username');
        if (!usernameInput) throw new Error('Could not find username input');
        await usernameInput.fill(username);
        await page.waitForTimeout(500);

        // Try multiple selectors for password input
        const passwordSelectors = [
            'input[name="password"]',
            'input[aria-label="Password"]',
            'input[placeholder*="password" i]',
            'input[type="password"]',
        ];
        const passwordInput = await findInput(passwordSelectors, 'password');
        if (!passwordInput) throw new Error('Could not find password input');
        await passwordInput.fill(password);
        await page.waitForTimeout(500);

        // Submit: try multiple submit buttons
        const submitSelectors = [
            'button[type="submit"]',
            'button:has-text("Log in")',
            'button:has-text("Log in")',
            'button:has-text("Sign in")',
            'div[role="button"]:has-text("Log in")',
        ];
        let clicked = false;
        for (const s of submitSelectors) {
            try {
                const btn = page.locator(s).first();
                if (await btn.isVisible({ timeout: 2000 })) {
                    await btn.click();
                    clicked = true;
                    console.log(`[AUTH] Clicked submit: ${s}`);
                    break;
                }
            } catch { /* try next */ }
        }
        if (!clicked) {
            // Try pressing Enter on password field
            await passwordInput.press('Enter');
            console.log('[AUTH] Pressed Enter on password field');
        }

        await page.waitForTimeout(6000);

        // Handle "Save Info" / "Not Now" prompt
        try {
            const saveBtn = page.locator('button:has-text("Save Info"), button:has-text("Not Now")').first();
            if (await saveBtn.isVisible({ timeout: 5000 })) {
                await saveBtn.click();
                console.log('[AUTH] Handled save info prompt');
                await page.waitForTimeout(2000);
            }
        } catch { /* no prompt */ }

        const url = page.url();
        console.log(`[AUTH] After login URL: ${url}`);

        if (url.includes('/accounts/login')) {
            // Still on login page — check for error message
            const errorText = await page.locator('#slfErrorAlert, [role="alert"]').textContent().catch(() => '');
            console.log(`[AUTH] Login FAILED — ${errorText || 'check credentials'}`);
            await browser.close();
            return null;
        }

        console.log(`[AUTH] Login SUCCESS`);
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

    // Only save if login actually succeeded with a sessionid
    const loginHasSessionId = newCookies.some(c => c.name === 'sessionid' && c.value);
    if (loginHasSessionId) {
        await saveCookies(newCookies);
        console.log('[AUTH] New cookies saved — ready to run');
    } else {
        console.log('[AUTH] Login did not return sessionid — cookies NOT saved');
    }
    return newCookies;
}
