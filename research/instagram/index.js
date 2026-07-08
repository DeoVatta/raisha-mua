/**
 * Instagram Prospector - Main Pipeline
 *
 * Confirmed working flow:
 * 1. Playwright → /explore/search/keyword/?q=%23{hashtag} → post URLs
 * 2. API → /api/v1/media/{mediaId}/info/ → username, likes, comments, caption
 * 3. Playwright → /{username}/ → bio, followers, following, category
 * 4. Playwright → profile grid scroll → more post URLs
 * 5. GraphQL → /graphql/query/?query_hash=bc3296d1... → individual comment text
 * 6. Classify: competitor/vendor/client from bio + hashtags
 * 7. Discovery: collabs + mentions → classify each → save to correct sheet
 * 8. Write new hashtags to VendorHashtags sheet
 * 9. Write to Google Sheets immediately
 *
 * Run: node index.js
 */

import {
    initBrowser,
    closeBrowser,
    refreshCookieStr,
    enrichPostFromApi,
    enrichProfileFromPage,
    enrichPostsBatch,
    scrapeProfilePosts,
    scrapeHashtags,
} from './src/scraper.js';
import { enrichProfile, enrichProfilesBatch } from './src/enricher.js';
import { extractClientsFromPosts } from './src/comments.js';
import {
    initSheets,
    readHashtags,
    readVisitedProfiles,
    readLastIndex,
    updateLastIndex,
    writeProfile,
    writeClientFromComment,
    persistState,
} from './src/sheets.js';
import {
    HASHTAGS_PER_RUN,
    MAX_PROFILES_PER_RUN,
    MAX_COLLAB_DEPTH,
    REQUEST_DELAY,
    MAX_DISCOVERY_PROFILES,
    MAX_API_ERRORS_CONSECUTIVE,
    MAX_NEW_PROFILE_THRESHOLD,
    PHASE2_TIMEOUT_MIN,
    PHASE3_TIMEOUT_MIN,
    SESSION_CHECK_EVERY,
    PROFILES_PER_HASHTAG,
} from './src/config.js';

// ============== STATE ==============
const state = {
    visited: new Set(),
    found: { competitor: new Set(), vendor: new Set(), client: new Set() },
    discoveryQueue: [],
    profilesScraped: 0,
    discoveryScraped: 0,
    newProfiles: 0,
    errors: 0,
};

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ============== MAIN ==============
async function run() {
    console.log('='.repeat(60));
    console.log('INSTAGRAM PROSPECTOR - Raisha MUA');
    console.log('='.repeat(60));

    // 1. Init
    console.log('\n[1] Initializing...');
    await initSheets();
    await initBrowser();
    await refreshCookieStr(); // sync browser cookies → HTTP API client

    // 2. Load state from sheets
    console.log('\n[2] Loading state...');
    const approvedHashtags = await readHashtags();
    if (approvedHashtags.length === 0) {
        console.log('[ERROR] No approved hashtags in VendorHashtags sheet');
        process.exit(1);
    }

    state.visited = await readVisitedProfiles();
    let lastIndex = await readLastIndex();

    // 3. Select hashtags for this run
    const selected = [];
    for (let i = 0; i < HASHTAGS_PER_RUN; i++) {
        const idx = (lastIndex + i) % approvedHashtags.length;
        selected.push(approvedHashtags[idx]);
    }
    const nextIndex = (lastIndex + HASHTAGS_PER_RUN) % approvedHashtags.length;

    console.log(`\n[3] Hashtags: ${selected.join(', ')}`);
    console.log(`    Index: ${lastIndex} → ${nextIndex}\n`);

    // 4. Phase 1: Scrape hashtags → post URLs → enrich via API
    console.log('-'.repeat(60));
    console.log('[PHASE 1] HASHTAG SCRAPING + POST ENRICHMENT');
    console.log('-'.repeat(60));

    const allPosts = await scrapeHashtags(selected);
    console.log(`\n  Total unique posts: ${allPosts.length}`);

    // Filter to unvisited + exclude own account (dedup by shortcode + username)
    const newPosts = allPosts.filter(p => {
        if (p.username === 'deovatta') return false;
        // Check both shortcode and username for visited dedup
        if (p.shortcode && state.visited.has(p.shortcode)) return false;
        if (p.username && state.visited.has(p.username)) return false;
        return true;
    });
    console.log(`  New posts: ${newPosts.length}`);

    if (newPosts.length === 0) {
        console.log('\n[INFO] No new posts. Try updating hashtags.');
    }

    // 5. Phase 2: Profile Enrichment + Classify (parallel batches)
    console.log('\n' + '-'.repeat(60));
    console.log('[PHASE 2] PROFILE ENRICHMENT + CLASSIFICATION');
    console.log('-'.repeat(60));

    // Safety: unlimited unless config says otherwise
    const phase2Limit = (MAX_PROFILES_PER_RUN !== null && MAX_PROFILES_PER_RUN !== undefined)
        ? MAX_PROFILES_PER_RUN
        : newPosts.length;
    const phase2Posts = newPosts.slice(0, phase2Limit);
    const phase2Start = Date.now();
    let phase2Errors = 0;

    // Batch enrichment: 2 profiles concurrently, 3s between batches
    const enrichedProfiles = await enrichProfilesBatch(phase2Posts, phase2Limit, 2, 3000);

    for (const profile of enrichedProfiles) {
        if (!profile) {
            phase2Errors++;
            state.errors++;
            if (phase2Errors >= (MAX_API_ERRORS_CONSECUTIVE || 20)) {
                console.log(`\n[STOP] Phase 2: ${phase2Errors} consecutive errors — stopping.`);
                break;
            }
            continue;
        }

        state.visited.add(profile.username);

        // Queue collabs + mentions for discovery
        const discovered = new Set([
            ...(profile.collabs || []),
            ...(profile.mentions || [])
        ]);

        for (const d of discovered) {
            if (!state.visited.has(d) &&
                !state.discoveryQueue.find(q => q.username === d)) {
                state.discoveryQueue.push({ username: d, depth: 1, source: profile.username });
            }
        }

        // Write to sheets — classified correctly as competitor/vendor/client
        await writeProfile(profile, state.found[profile.type]);
        state.found[profile.type].add(profile.username);
        state.newProfiles++;
        state.profilesScraped++;

        // Safety: Phase 2 timeout
        const elapsedMin = (Date.now() - phase2Start) / 60000;
        if (elapsedMin >= (PHASE2_TIMEOUT_MIN || 60)) {
            console.log(`\n[STOP] Phase 2: ${elapsedMin.toFixed(1)} min timeout reached.`);
            break;
        }
    }

    // 6. Phase 3: Discovery (collab + mention deep dive)
    if (state.discoveryQueue.length > 0) {
        console.log('\n' + '-'.repeat(60));
        console.log(`[PHASE 3] DISCOVERY (${state.discoveryQueue.length} queued)`);
        console.log('-'.repeat(60));

        const phase3Start = Date.now();
        const maxDisc = (MAX_DISCOVERY_PROFILES !== null && MAX_DISCOVERY_PROFILES !== undefined)
            ? MAX_DISCOVERY_PROFILES
            : 999999;
        const maxApiErrors = MAX_API_ERRORS_CONSECUTIVE || 20;
        let phase3Errors = 0;
        let consecutiveSeen = 0;
        let sessionChecked = 0;

        while (state.discoveryQueue.length > 0 && state.discoveryScraped < maxDisc) {
            const item = state.discoveryQueue.shift();
            if (state.visited.has(item.username) || item.depth > (MAX_COLLAB_DEPTH || 2)) continue;

            // Session health check
            sessionChecked++;
            if (sessionChecked % (SESSION_CHECK_EVERY || 50) === 0) {
                console.log(`\n[CHECK] Verifying session cookies...`);
                await refreshCookieStr();
                console.log(`[CHECK] Session OK — ${state.discoveryScraped} discovery profiles processed`);
            }

            state.visited.add(item.username);
            state.discoveryScraped++;

            console.log(`\n[DISCOVER ${state.discoveryScraped}] @${item.username} (via @${item.source})`);

            const profile = await enrichProfile(item.username);

            if (!profile) {
                phase3Errors++;
                state.errors++;
                consecutiveSeen = 0;
                if (phase3Errors >= maxApiErrors) {
                    console.log(`\n[STOP] Phase 3: ${phase3Errors} consecutive API errors — stopping.`);
                    break;
                }
                continue;
            }

            phase3Errors = 0;

            // Queue more
            const newDiscoveries = [];
            const discovered = new Set([...(profile.collabs || []), ...(profile.mentions || [])]);
            for (const d of discovered) {
                if (!state.visited.has(d) &&
                    !state.discoveryQueue.find(q => q.username === d) &&
                    item.depth < (MAX_COLLAB_DEPTH || 2)) {
                    state.discoveryQueue.push({ username: d, depth: item.depth + 1, source: item.username });
                    newDiscoveries.push(d);
                }
            }

            if (newDiscoveries.length === 0) {
                consecutiveSeen++;
                if (consecutiveSeen >= (MAX_NEW_PROFILE_THRESHOLD || 10)) {
                    console.log(`\n[STOP] Phase 3: ${consecutiveSeen} consecutive queue sweeps with no new profiles — stopping.`);
                    break;
                }
            } else {
                consecutiveSeen = 0;
            }

            // Write profile to correct sheet (competitor/vendor/client — enrichProfile classifies)
            await writeProfile(profile, state.found[profile.type]);
            state.found[profile.type].add(profile.username);
            state.newProfiles++;

            // Safety: Phase 3 timeout
            const elapsedMin = (Date.now() - phase3Start) / 60000;
            if (elapsedMin >= (PHASE3_TIMEOUT_MIN || 90)) {
                console.log(`\n[STOP] Phase 3: ${elapsedMin.toFixed(1)} min timeout reached.`);
                break;
            }
        }

        if (state.discoveryQueue.length > 0) {
            console.log(`\n[PHASE 3] Done — ${state.discoveryQueue.length} still queued, budget spent`);
        }
    }

    // 7. Phase 4: Comment Extraction → Client Discovery
    console.log('\n' + '-'.repeat(60));
    console.log('[PHASE 4] COMMENT EXTRACTION → CLIENT DISCOVERY');
    console.log('-'.repeat(60));

    const postsForClients = newPosts.slice(0, 10); // max 10 posts for comments
    const clients = await extractClientsFromPosts(postsForClients);
    console.log(`\n  Found ${clients.length} potential clients from comments`);

    // Save top clients to sheet (max 20)
    // Check both state.visited (from previous runs) and state.found.client (this run)
    const maxClients = 20;
    for (const client of clients.slice(0, maxClients)) {
        const key = client.username.toLowerCase();
        if (state.found.client.has(key)) {
            console.log(`  [SKIP CLIENT] @${key} already saved in this run`);
            continue;
        }
        if (state.visited.has(key)) {
            console.log(`  [SKIP CLIENT] @${key} already saved in previous runs`);
            continue;
        }
        await writeClientFromComment(client, state.found.client);
        state.found.client.add(key);
        state.visited.add(key);
        state.newProfiles++;
    }

    // 8. Update hashtag index
    await updateLastIndex(nextIndex);

    // 8. Cleanup
    await closeBrowser();

    // 9. Persist row state to Setting sheet, then summary
    await persistState();

    console.log('\n' + '='.repeat(60));
    console.log('[DONE] SCAN COMPLETE');
    console.log('='.repeat(60));
    console.log(`  Phase 2 profiles: ${state.profilesScraped}`);
    console.log(`  Phase 3 discovery: ${state.discoveryScraped}`);
    console.log(`  Competitors found: ${state.found.competitor.size}`);
    console.log(`  Vendors found: ${state.found.vendor.size}`);
    console.log(`  Clients found: ${state.found.client.size}`);
    console.log(`  Total new: ${state.newProfiles}`);
    console.log(`  Errors: ${state.errors}`);
    console.log(`  Hashtag index: ${lastIndex} → ${nextIndex}`);
    console.log(`  Next hashtags: ${selected.join(', ')}`);
    console.log('='.repeat(60));
}

// ============== HANDLE ERRORS ==============
process.on('SIGINT', async () => {
    console.log('\n[ABORT] Closing...');
    await closeBrowser();
    process.exit(1);
});

run().catch(async (e) => {
    console.error('[FATAL]', e.message);
    await closeBrowser();
    process.exit(1);
});
