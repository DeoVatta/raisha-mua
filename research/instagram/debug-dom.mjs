import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function debug() {
    // Load cookies
    const cookieFile = path.join(__dirname, 'instagram-cookies.json');
    const cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-proxy-client-cert-request']
    });
    const ctx = await browser.newContext();
    const fixed = cookies.map(c => ({ ...c, sameSite: c.sameSite === 'no_restriction' ? 'None' : (c.sameSite || 'None') }));
    await ctx.addCookies(fixed);
    const page = await ctx.newPage();

    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {} };
    });

    console.log('[DEBUG] Navigating to hashtag search...');
    await page.goto('https://www.instagram.com/explore/search/keyword/?q=%23muasemarang', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    const info = await page.evaluate(() => {
        // Check for shared data
        const results = {
            pLinks: document.querySelectorAll('a[href*="/p/"]').length,
            articleTags: document.querySelectorAll('article').length,
            // Try to find the React/Apollo state
            hasSharedData: typeof window._sharedData !== 'undefined',
            hasServerJS: document.querySelectorAll('script[type="application/json"]').length,
            bodyLen: document.body.innerHTML.length,
            // Get body text snippet
            bodyText: document.body.innerText.substring(0, 500),
        };

        // Try __NEXT_DATA__
        const nextDataEl = document.getElementById('__NEXT_DATA__');
        if (nextDataEl) {
            results.nextData = nextDataEl.textContent.substring(0, 500);
        }

        // Try script tags
        const scripts = Array.from(document.querySelectorAll('script:not([src])'))
            .filter(s => s.textContent && s.textContent.includes('edge_web_feed'))
            .map(s => s.textContent.substring(0, 300));
        if (scripts.length > 0) {
            results.webFeedScripts = scripts;
        }

        // Try to find any JSON with posts
        const jsonScripts = Array.from(document.querySelectorAll('script'))
            .map(s => s.textContent || '')
            .filter(t => t.includes('edge_hashtag_to_media') || t.includes('recent'))
            .map(t => t.substring(0, 400));
        results.jsonWithMedia = jsonScripts;

        return results;
    });

    console.log('[DEBUG] Page info:');
    console.log('  a[href*="/p/"] count:', info.pLinks);
    console.log('  article tags:', info.articleTags);
    console.log('  body length:', info.bodyLen);
    console.log('  has _sharedData:', info.hasSharedData);
    console.log('  has __NEXT_DATA__:', info.nextData ? 'YES' : 'NO');
    console.log('  body text snippet:', info.bodyText.replace(/\n/g, ' | ').substring(0, 200));

    if (info.jsonWithMedia && info.jsonWithMedia.length > 0) {
        console.log('\n[DEBUG] Found JSON with media:');
        console.log(info.jsonWithMedia[0]);
    }

    // Deep dive into _sharedData structure
    const sharedDataDeep = await page.evaluate(() => {
        if (typeof window._sharedData === 'undefined') return null;
        const d = window._sharedData;
        return {
            keys: Object.keys(d),
            entry_data_keys: Object.keys(d.entry_data || {}),
            searchDirectory: d.entry_data?.SearchDirectory ? JSON.stringify(d.entry_data.SearchDirectory).substring(0, 2000) : 'NOT FOUND',
            // Try to find sections data
            sections: d.entry_data?.SearchDirectory?.[0]?.data?.sections ? JSON.stringify(d.entry_data.SearchDirectory[0].data.sections).substring(0, 1000) : 'NOT FOUND',
            // Try hashtag data
            hashtagData: d.entry_data?.TagPage ? JSON.stringify(d.entry_data.TagPage).substring(0, 1000) : 'NOT FOUND',
            // Top search results
            toplists: d.entry_data?.TopSearchDirectory ? JSON.stringify(d.entry_data.TopSearchDirectory).substring(0, 1000) : 'NOT FOUND',
        };
    });

    console.log('\n[DEBUG] _sharedData deep:');
    console.log(JSON.stringify(sharedDataDeep, null, 2));

    // Try parsing the script tags for post data
    const scriptData = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script:not([src])'))
            .map(s => s.textContent || '')
            .filter(t => t.includes('edge_hashtag_to_media') || t.includes('shortcode_media') || t.includes('edge_media'));

        if (scripts.length === 0) return 'No scripts found';

        // Try to find JSON with post data
        for (const script of scripts) {
            try {
                // Look for the pattern: {"__bbox":{"define":[[...
                const bboxMatch = script.match(/\{[^{}]*"__bbox"[^{}]*/);
                if (bboxMatch) {
                    return 'Found __bbox: ' + bboxMatch[0].substring(0, 500);
                }
            } catch (e) { /* skip */ }
        }
        return 'scripts found but no bbox';
    });

    console.log('\n[DEBUG] Script data:', scriptData);

    // Try extracting from any JSONLD or script data
    const extractedPosts = await page.evaluate(() => {
        // Look for window.__BBOX_DEFINE or similar
        if (typeof window.__bbox !== 'undefined') {
            return 'window.__bbox found: ' + JSON.stringify(window.__bbox).substring(0, 500);
        }

        // Look for embedded JSON in scripts
        const allText = Array.from(document.querySelectorAll('script'))
            .map(s => s.textContent)
            .join('\n');

        // Try to find JSON objects with shortcode_media
        const matches = allText.match(/\{[^}]{0,500}"shortcode_media"[^}]{0,500}\}/g);
        if (matches && matches.length > 0) {
            return 'shortcode_media found: ' + matches[0].substring(0, 300);
        }

        return 'No shortcode_media found in scripts';
    });

    console.log('\n[DEBUG] Extracted posts:', extractedPosts);

    // Also check: what's in the raw scripts with shortcode patterns
    const shortcodes = await page.evaluate(() => {
        const allText = Array.from(document.querySelectorAll('script'))
            .map(s => s.textContent)
            .join('\n');

        // Find Instagram shortcode patterns (11 chars alphanumeric + _-)
        const shorts = allText.match(/"([A-Za-z0-9_-]{11})"/g) || [];
        const unique = [...new Set(shorts.map(s => s.replace(/"/g, '')))].slice(0, 20);
        return unique;
    });

    console.log('\n[DEBUG] Shortcodes found in scripts:', shortcodes.slice(0, 20));

    // Check: what are the actual hrefs on the page
    const pLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href*="/p/"]'))
            .slice(0, 10)
            .map(a => ({
                href: a.href,
                text: a.innerText?.substring(0, 50),
                parent: a.parentElement?.tagName,
                grandparent: a.parentElement?.parentElement?.tagName,
            }));
    });
    console.log('\n[DEBUG] Actual /p/ links:', JSON.stringify(pLinks, null, 2));

    await browser.close();
}

debug().catch(e => { console.error('[ERROR]', e.message); process.exit(1); });
