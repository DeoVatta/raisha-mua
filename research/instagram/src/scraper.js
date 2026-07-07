/**
 * Instagram Prospector - Phase 1: Hashtag Discovery + Post Enrichment
 *
 * Confirmed working methods:
 * 1. Playwright → /explore/search/keyword/?q=%23{hashtag} → post URLs
 * 2. HTTP API → /api/v1/media/{mediaId}/info/ → full post data
 * 3. Playwright → /{username}/ → profile data (bio, followers, following)
 * 4. Playwright → profile page → scroll → post grid URLs
 *
 * Cookie path: ../instagram-cookies.json (parent directory)
 */

import { chromium } from 'playwright';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { REQUEST_DELAY, NAVIGATE_DELAY } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============== SHORTCODE → MEDIA ID ==============
function decodeShortcode(shortcode) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let n = 0n;
    for (const char of shortcode) { n = n * 64n + BigInt(alphabet.indexOf(char)); }
    return n.toString();
}

// ============== HTTP CLIENT ==============
let _cookies = null;
let _cookieStr = null;
let _csrftoken = null;
let _mobileHeaders = null;

function loadCookies() {
    if (_cookies) return;
    // __dirname = instagram/src/ → go up 1 level to instagram/ → ./instagram-cookies.json
    const cookieFile = path.join(__dirname, '..', 'instagram-cookies.json');
    _cookies = JSON.parse(fs.readFileSync(cookieFile, 'utf-8'));
    _cookieStr = _cookies.map(c => c.name + '=' + c.value).join('; ');
    _csrftoken = _cookies.find(c => c.name === 'csrftoken')?.value || '';

    // Mobile API headers (for comment fetching - works with session cookies only, no HMAC needed)
    _mobileHeaders = {
        'User-Agent': 'Instagram 276.0.0.0.0 Android (Android/13; SDK 33; x86; Xiaomi Redmi Note 11)',
        'Cookie': _cookieStr,
        'X-CSRFToken': _csrftoken,
        'X-IG-App-ID': '1217981644879628',
        'X-IG-App-Locale': 'en_US',
        'X-IG-Device-Locale': 'en_US',
        'Accept': 'application/json, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.instagram.com/',
    };
}

function igFetch(url, mobileHeaders = false) {
    return new Promise((resolve, reject) => {
        loadCookies();
        const u = new URL(url);
        const headers = mobileHeaders ? { ..._mobileHeaders } : {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            'Cookie': _cookieStr,
            'X-CSRFToken': _csrftoken,
            'X-IG-App-ID': '936619743392459',
            'Accept': 'application/json, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.instagram.com/',
        };
        const opts = { hostname: u.hostname, path: u.pathname + u.search, headers };
        const mod = u.protocol === 'https:' ? https : http;
        const req = mod.request(opts, res => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
        });
        req.on('error', err => {
            // Retry once on DNS/connection errors
            setTimeout(() => {
                const retryReq = mod.request(opts, res2 => {
                    let data2 = '';
                    res2.on('data', c => data2 += c);
                    res2.on('end', () => resolve({ status: res2.statusCode, body: data2 }));
                });
                retryReq.on('error', e2 => reject(e2));
                retryReq.on('timeout', () => { retryReq.destroy(); reject(new Error('timeout')); });
                retryReq.setTimeout(15000);
                retryReq.end();
            }, 3000);
        });
        req.setTimeout(15000);
        req.end();
    });
}

// ============== POST COMMENTS (GraphQL - confirmed working 2025) ==============
/**
 * Fetch comments via GraphQL (web API).
 * query_hash: bc3296d1ce80a24b1b6e40b1e72903f5 (stable, confirmed working)
 * Works with session cookies + desktop headers (no HMAC signing needed).
 *
 * Returns: { comments, pageInfo: { hasNextPage, endCursor }, totalCount }
 */
async function fetchPostCommentsGraphQL(shortcode, after = '') {
    await sleep(REQUEST_DELAY * 1000);
    const variables = JSON.stringify({ shortcode, first: 50, after });
    const url = `https://www.instagram.com/graphql/query/?query_hash=bc3296d1ce80a24b1b6e40b1e72903f5&variables=${encodeURIComponent(variables)}`;
    const res = await igFetch(url);

    if (res.status !== 200) {
        console.log(`  [GRAPHQL COMMENTS ERROR] ${res.status}: ${res.body.substring(0, 100)}`);
        return { comments: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: 0 };
    }

    try {
        const data = JSON.parse(res.body);
        const section = data.data?.shortcode_media?.edge_media_to_parent_comment;
        if (!section) return { comments: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: 0 };

        const edges = section.edges || [];
        const pageInfo = section.page_info || {};
        const totalCount = section.count || 0;

        const comments = edges.map(e => e.node).map(c => ({
            pk: c.id,
            username: c.owner?.username || '',
            fullName: c.owner?.username || '',
            text: c.text || '',
            createdAt: c.created_at,
            likeCount: c.edge_liked_by?.count || 0,
            childCount: c.edge_threaded_comments?.count || 0,
            isVerified: c.owner?.is_verified || false,
            profilePic: c.owner?.profile_pic_url || '',
        }));

        return {
            comments,
            pageInfo: {
                hasNextPage: pageInfo.has_next_page || false,
                endCursor: pageInfo.end_cursor || null,
            },
            totalCount,
        };
    } catch (e) {
        console.log(`  [GRAPHQL PARSE ERROR] ${e.message}`);
        return { comments: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: 0 };
    }
}

/**
 * Fetch ALL comments for a post via GraphQL pagination.
 */
async function fetchAllPostCommentsGraphQL(shortcode, maxComments = 100) {
    const allComments = [];
    let after = '';
    let page = 0;
    const maxPages = 10;

    while (page < maxPages && allComments.length < maxComments) {
        const { comments, pageInfo } = await fetchPostCommentsGraphQL(shortcode, after);
        if (comments.length === 0) break;
        allComments.push(...comments);
        if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
        after = pageInfo.endCursor;
        page++;
    }

    return allComments.slice(0, maxComments);
}

// ============== BROWSER ==============
let _browser = null;
let _context = null;
let _page = null;

function makeStealthContext() {
    return {
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        deviceScaleFactor: 1,
        hasTouch: false,
        isMobile: false,
        ignoreHTTPSErrors: true,
    };
}

async function initBrowser() {
    if (_browser) return;

    loadCookies();
    console.log('[BROWSER] Launching...');
    _browser = await chromium.launch({
        headless: true,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-proxy-client-cert-request',
            '--disable-features=DnsOverHttpsPinger',
        ]
    });

    _context = await _browser.newContext(makeStealthContext());

    // Apply sameSite fix for Playwright
    const fixedCookies = _cookies.map(c => ({
        ...c,
        sameSite: c.sameSite === 'no_restriction' ? 'None' : c.sameSite
    }));

    await _context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5], configurable: true });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'], configurable: true });
        window.chrome = { runtime: {} };
    });

    await _context.addCookies(fixedCookies);
    _page = await _context.newPage();

    // Establish session
    await _page.goto('https://www.instagram.com/', { waitUntil: 'networkidle', timeout: 30000 });
    await _page.waitForTimeout(2000);
    console.log('[BROWSER] Session ready, URL:', _page.url().substring(0, 50));
}

async function closeBrowser() {
    if (_browser) {
        await _browser.close();
        _browser = null;
        _context = null;
        _page = null;
    }
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ============== POST ENRICHMENT (API) — with batch concurrency ==============
async function enrichPostFromApi(postUrl) {
    // Extract shortcode
    const shortcode = postUrl.split('/p/')[1]?.replace('/', '') || '';
    if (!shortcode) return null;

    const mediaId = decodeShortcode(shortcode);
    // No per-request sleep — batch controller handles rate limiting
    const res = await igFetch(`https://i.instagram.com/api/v1/media/${mediaId}/info/`);
    if (res.status !== 200) {
        console.log(`  [API ERROR] ${shortcode}: ${res.status}`);
        return null;
    }

    try {
        const data = JSON.parse(res.body);
        const item = data.items?.[0];
        if (!item) return null;

        const caption = item.caption?.text || '';
        const hashtags = (caption.match(/#\w+/g) || []).map(h => h.toLowerCase());
        const mentions = (caption.match(/@([a-zA-Z0-9._]+)/g) || [])
            .map(m => m.slice(1).toLowerCase());

        // Collabs from tagged users
        const collabs = (item.usertags?.in || [])
            .map(t => t.user?.username)
            .filter(Boolean);

        // Remove author from mentions
        const authorUsername = item.user?.username?.toLowerCase() || '';
        const filteredMentions = mentions.filter(m => m !== authorUsername);

        return {
            username: item.user?.username || '',
            displayName: item.user?.full_name || '',
            userPk: item.user?.pk || '',
            likes: item.like_count || 0,
            comments: item.comment_count || 0,
            caption,
            hashtags,
            mentions: filteredMentions,
            collabs,
            date: new Date(item.taken_at * 1000).toISOString(),
            postUrl: `https://www.instagram.com/p/${shortcode}/`,
            shortcode,
            mediaId,
        };
    } catch (e) {
        console.log(`  [API PARSE ERROR] ${shortcode}: ${e.message}`);
        return null;
    }
}

/**
 * Enrich multiple posts in parallel batches.
 * @param {string[]} urls - Post URLs
 * @param {number} concurrency - Max concurrent requests per batch
 * @param {number} batchDelayMs - Delay between batches (ms)
 */
async function enrichPostsBatch(urls, concurrency = 5, batchDelayMs = 2000) {
    const results = [];
    for (let i = 0; i < urls.length; i += concurrency) {
        const batch = urls.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(url => enrichPostFromApi(url)));
        results.push(...batchResults);
        if (i + concurrency < urls.length) {
            await sleep(batchDelayMs);
        }
    }
    return results.filter(Boolean);
}

/**
 * Fetch ALL comments for a post via GraphQL pagination.
 * @param {string} shortcode
 * @param {number} maxComments
 */
async function fetchAllPostCommentsGraphQL(shortcode, maxComments = 100) {
    const allComments = [];
    let after = '';
    let page = 0;
    const maxPages = 10;

    while (page < maxPages && allComments.length < maxComments) {
        const { comments, pageInfo } = await fetchPostCommentsGraphQL(shortcode, after);
        if (comments.length === 0) break;
        allComments.push(...comments);
        if (!pageInfo.hasNextPage || !pageInfo.endCursor) break;
        after = pageInfo.endCursor;
        page++;
    }

    return allComments.slice(0, maxComments);
}

// ============== PROFILE ENRICHMENT (Playwright) ==============
async function enrichProfileFromPage(username) {
    if (!_page) await initBrowser();
    await sleep(REQUEST_DELAY * 1000);

    const profileUrl = `https://www.instagram.com/${username}/`;
    await _page.goto(profileUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await _page.waitForTimeout(3000);

    const bodyLen = await _page.evaluate(() => document.body.innerHTML.length);
    if (bodyLen < 100) {
        console.log(`  [PROFILE WARN] Empty page for @${username}`);
        return buildFallbackProfile(username);
    }

    // OG meta tags
    const ogTitle = await _page.evaluate(() => document.querySelector('meta[property="og:title"]')?.content || '');
    const ogDesc = await _page.evaluate(() => document.querySelector('meta[property="og:description"]')?.content || '');
    const ogImage = await _page.evaluate(() => document.querySelector('meta[property="og:image"]')?.content || '');

    // Parse og:description: "X Followers, Y Following, Z Posts"
    let followers = 0, following = 0, posts = 0;
    const ffpMatch = ogDesc.match(/([\d,]+)\s*Followers?,\s*([\d,]+)\s*Following?,\s*([\d,]+)\s*Posts?/);
    if (ffpMatch) {
        followers = parseInt(ffpMatch[1].replace(/,/g, ''));
        following = parseInt(ffpMatch[2].replace(/,/g, ''));
        posts = parseInt(ffpMatch[3].replace(/,/g, ''));
    }

    // Parse og:title: "Display Name (@username)"
    let displayName = ogTitle;
    const atIdx = ogTitle.indexOf('(@');
    if (atIdx > 0) displayName = ogTitle.substring(0, atIdx).trim();

    // Body text for bio, category, WA link
    const bodyText = await _page.evaluate(() => document.body.innerText || '');
    const lines = bodyText.split('\n').map(l => l.trim()).filter(Boolean);

    let bio = '';
    let category = '';
    let waLink = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Bio starts after follower/following/posts block
        if (line.match(/Followers?|Following|Post|Verified/i)) continue;
        if (line === username) continue;
        if (line.match(/Follow|Message|Edit Profile|Similar/i)) continue;
        if (line.match(/Meta|About|Blog|Jobs|Help|API|Privacy/i)) break;

        // Collect bio lines
        if (bio === '' && line.length > 5) {
            bio = line;
        } else if (bio !== '' && line.length > 2 && line.length < 300) {
            bio += ' ' + line;
        }
    }

    // Detect category (usually after display name)
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].toLowerCase();
        if (l.match(/makeup artist|hairstylist|mua|fotografer|catering|dekorasi|organizer/i)) {
            category = lines[i];
            break;
        }
    }

    // WA link
    const waMatch = bodyText.match(/(wa\.me\/[\d]+|whatsapp\.com\/[\w]+\/[\d]+|\+62[\d\s-]+)/i);
    if (waMatch) waLink = waMatch[0];

    return {
        username,
        displayName,
        bio,
        category,
        followers,
        following,
        posts,
        profileUrl: `https://www.instagram.com/${username}/`,
        ogImage,
        waLink,
    };
}

// ============== PROFILE POST SCRAPING (Playwright scroll) ==============
async function scrapeProfilePosts(username, maxPosts = 20) {
    if (!_page) await initBrowser();
    await sleep(REQUEST_DELAY * 1000);

    const profileUrl = `https://www.instagram.com/${username}/`;
    await _page.goto(profileUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await _page.waitForTimeout(2000);

    // Scroll to load posts
    let prevCount = 0;
    let scrollCount = 0;
    const maxScrolls = 15;

    while (scrollCount < maxScrolls) {
        const urls = await _page.$$eval('a[href*="/p/"]',
            els => [...new Set(els.map(e => e.href))]);
        const currentCount = urls.length;

        if (currentCount > maxPosts) break;
        if (currentCount === prevCount && scrollCount > 3) break;

        prevCount = currentCount;
        await _page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await _page.waitForTimeout(1500);
        scrollCount++;
    }

    const allUrls = await _page.$$eval('a[href*="/p/"]',
        els => [...new Set(els.map(e => e.href))]);
    return allUrls.slice(0, maxPosts);
}

function buildFallbackProfile(username) {
    return {
        username,
        displayName: username,
        bio: '',
        category: '',
        followers: 0,
        following: 0,
        posts: 0,
        profileUrl: `https://www.instagram.com/${username}/`,
        ogImage: '',
        waLink: '',
    };
}

// ============== SCRAPE HASHTAG ==============
async function scrapeHashtag(hashtag, maxPosts = 50) {
    if (!_page) await initBrowser();

    console.log(`[HASHTAG] #${hashtag}`);
    const searchUrl = `https://www.instagram.com/explore/search/keyword/?q=%23${encodeURIComponent(hashtag)}`;
    await _page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await _page.waitForTimeout(3000);

    // Scroll to load more posts (lazy loading)
    let prevCount = 0;
    let scrollCount = 0;
    const maxScrolls = 10;

    while (scrollCount < maxScrolls) {
        const urls = await _page.$$eval('a[href*="/p/"]',
            els => [...new Set(els.map(e => e.href.split('?')[0]))]);
        const currentCount = urls.length;

        if (currentCount >= maxPosts) break;
        if (currentCount === prevCount && scrollCount > 3) break;

        prevCount = currentCount;
        await _page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await _page.waitForTimeout(2000);
        scrollCount++;
    }

    // Extract post URLs
    const postUrls = await _page.$$eval('a[href*="/p/"]',
        els => [...new Set(els.map(e => e.href.split('?')[0]))]);

    console.log(`  Found ${postUrls.length} post URLs (${scrollCount} scrolls)`);
    if (postUrls.length === 0) return [];

    // Enrich all posts in parallel batches (5 concurrent, 2s between batches)
    const posts = await enrichPostsBatch(postUrls, 5, 2000);
    console.log(`  Enriched ${posts.length} posts`);
    return posts;
}

// ============== SCRAPE MULTIPLE HASHTAGS ==============
async function scrapeHashtags(hashtags) {
    await initBrowser();

    const allPosts = [];
    const seen = new Set();

    for (const hashtag of hashtags) {
        const posts = await scrapeHashtag(hashtag);
        for (const p of posts) {
            if (!seen.has(p.username)) {
                seen.add(p.username);
                allPosts.push({ ...p, sourceHashtag: hashtag });
            }
        }
    }

    return allPosts;
}

// ============== EXPORTS ==============
export {
    initBrowser,
    closeBrowser,
    enrichPostFromApi,
    enrichPostsBatch,
    enrichProfileFromPage,
    scrapeProfilePosts,
    scrapeHashtag,
    scrapeHashtags,
    decodeShortcode,
    fetchPostCommentsGraphQL,
    fetchAllPostCommentsGraphQL,
};
