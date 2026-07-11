/**
 * Instagram Prospector - Infinite Loop Pipeline v3
 *
 * OUTER LOOP: while(true) — processes all hashtags in VendorHashtags sheet,
 * then resets and starts over. Auto-resumes from last Executed hashtag on restart.
 *
 * PER-HASHTAG FLOW:
 *
 * PHASE 1  — Scrape hashtag → get all post data
 * PHASE 2  — Loop posts sequentially: enrich + Indonesian check
 * PHASE 3  — Buffer discovered hashtags (batch, no immediate write)
 * PHASE 4  — Enrich profile → classify → write to sheet
 * PHASE 5  — Collect @mentions + collabs → collab queue
 * PHASE 6  — Collect vendor post URLs for comment extraction
 * PHASE 7  — AI classify buffered hashtags → flush ONLY approved ones
 * PHASE 8  — Loop hashtag posts + vendor posts: extract comments → filter clients → write
 * PHASE 9  — Collab/mention queue: enrich each → PHASE 4
 * PHASE 10 — Mark G column: Executing → Executed (DD-MM-YY HH:MM WIB)
 *
 * Key principle: batch AI hashtag classification — collect all hashtags during
 * Phase 2 → AI classify → flush only wedding/wisuda approved hashtags.
 */

import {
    initBrowser,
    closeBrowser,
    refreshCookieStr,
    enrichPost,
    scrapeHashtag,
    fetchAllPostCommentsGraphQL,
} from './src/scraper.js';
import { enrichProfile } from './src/enricher.js';
import { filterClients } from './src/comments.js';
import {
    initSheets,
    readHashtags,
    readVisitedProfiles,
    findNextHashtagIndex,
    writeProfile,
    writeClientFromComment,
    bufferHashtag,
    flushHashtagBuffer,
    persistState,
    clearExecutingMarkers,
    markHashtagExecuting,
    markHashtagDone,
} from './src/sheets.js';
import { classifyHashtagsBatch } from './src/ai-classifier.js';
import { isIndonesian } from './src/classifier.js';
import {
    MAX_COLLAB_DEPTH,
    MAX_API_ERRORS_CONSECUTIVE,
    PHASE2_TIMEOUT_MIN,
    PHASE3_TIMEOUT_MIN,
    SESSION_CHECK_EVERY,
} from './src/config.js';

// Track current hashtag for SIGINT crash handler
let _currentHashtag = null;

// ============== MAIN ==============
async function run() {
    console.log('='.repeat(60));
    console.log('INSTAGRAM PROSPECTOR v3 — Infinite Loop Pipeline');
    console.log('='.repeat(60));

    // INIT
    console.log('\n[INIT] Starting...\n');
    await initSheets();
    await initBrowser();

    // Load state — readHashtags FIRST to populate _seenHashtags,
    // so clearExecutingMarkers can find and clear stale 'Executing' rows
    const approvedHashtags = await readHashtags();
    if (approvedHashtags.length === 0) {
        console.log('[ERROR] No approved hashtags in VendorHashtags sheet');
        process.exit(1);
    }

    await clearExecutingMarkers();
    const visited = await readVisitedProfiles();

    // Global stats
    let runCount = 0;
    let totalCompetitors = 0;
    let totalVendors = 0;
    let totalClients = 0;

    // ================================================================
    // OUTER LOOP — infinite loop, processes all hashtags, auto-resets
    // ================================================================
    while (true) {
        runCount++;
        console.log('\n' + '#'.repeat(60));
        console.log(`[OUTER LOOP] Run #${runCount} — ${approvedHashtags.length} hashtags in queue`);
        console.log('#'.repeat(60));

        // Find next hashtag: scan G column for last "Executed" → start after it
        const hashtagIdx = await findNextHashtagIndex(approvedHashtags);
        const hashtag = approvedHashtags[hashtagIdx];
        _currentHashtag = hashtag;

        console.log('-'.repeat(60));
        console.log(`[RUN #${runCount}] Hashtag: #${hashtag} | index: ${hashtagIdx}/${approvedHashtags.length - 1}`);
        console.log('-'.repeat(60));

        await markHashtagExecuting(hashtag);
        await refreshCookieStr(); // fresh session for this hashtag

        // Per-run stats
        let stats = { competitors: 0, vendors: 0, clients: 0, errors: 0 };
        let globalErrorCount = 0;
        let phase2Start = Date.now();
        let postCount = 0;

        // ================================================================
        // PHASE 1 — Scrape hashtag → get all post data
        // ================================================================
        console.log('\n[PHASE 1] Scraping hashtag...\n');
        const posts = await scrapeHashtag(hashtag);
        console.log(`\n  → Found ${posts.length} posts\n`);

        if (posts.length === 0) {
            console.log('[PHASE 1] No posts found. Skipping hashtag.');
            await markHashtagDone(hashtag, true);
            await closeBrowser();
            await initBrowser(); // reopen browser for next run
            await persistState();
            printSummary(stats, hashtag, hashtagIdx, hashtagIdx + 1, approvedHashtags.length, runCount);
            continue;
        }

        // ================================================================
        // PHASE 2-6 — Loop posts sequentially: enrich → classify → write
        // ================================================================
        console.log('-'.repeat(60));
        console.log('[PHASE 2-6] Processing posts sequentially...');
        console.log('-'.repeat(60) + '\n');

        const collabQueue = [];
        const seenInQueue = new Set();
        const vendorPostUrls = new Set();

        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];

            // PHASE 10 — Every 20 posts: re-login to refresh cookies
            if (postCount > 0 && postCount % 20 === 0) {
                console.log(`\n[PHASE 10] Re-login every 20 posts (count=${postCount})...`);
                await refreshCookieStr();
            }
            postCount++;

            // Phase 2 timeout check
            const elapsedMin = (Date.now() - phase2Start) / 60000;
            if (elapsedMin >= (PHASE2_TIMEOUT_MIN || 60)) {
                console.log(`\n[STOP] Phase 2-6: ${elapsedMin.toFixed(1)} min timeout.`);
                break;
            }

            const postNum = i + 1;
            const shortcode = post.shortcode || '';
            const postUrl = `https://www.instagram.com/p/${shortcode}/`;
            console.log(`\n[POST ${postNum}/${posts.length}] ${shortcode}`);

            // Skip own account
            const username = (post.username || '').toLowerCase();
            if (username === 'deovatta' || !username) {
                console.log(`  [SKIP] Own account or empty username`);
                continue;
            }

            // PHASE 2 — Enrich post (API first, browser fallback)
            const postData = await enrichPost(postUrl);
            if (!postData || !postData.username) {
                console.log(`  [SKIP] No username from post`);
                globalErrorCount++;
                continue;
            }

            const enrichedUsername = postData.username.toLowerCase();
            if (enrichedUsername === 'deovatta') continue;

            const isNewProfile = !visited.has(enrichedUsername);

            // PHASE 3 — Indonesian check via hashtags/caption
            const postText = ((postData.caption || '') + ' ' + (postData.hashtags || []).join(' ')).toLowerCase();
            if (!isIndonesian(postText, [], '')) {
                console.log(`  [SKIP] @${enrichedUsername} — not Indonesian`);
                continue;
            }

            // PHASE 3b — Buffer hashtags for AI batch classification (no immediate write)
            for (const tag of postData.hashtags || []) {
                bufferHashtag(tag, enrichedUsername);
            }

            // PHASE 4 — Enrich profile → classify
            const profile = await enrichProfile(enrichedUsername, postData);
            if (!profile) {
                globalErrorCount++;
                if (globalErrorCount >= (MAX_API_ERRORS_CONSECUTIVE || 20)) {
                    console.log(`\n[STOP] Phase 2-6: ${globalErrorCount} consecutive errors.`);
                    break;
                }
                continue;
            }

            // Reset error count on success
            globalErrorCount = 0;

            // PHASE 3c — Indonesian check via profile bio/location
            if (!isIndonesian(profile.bio || '', [...(profile.hashtags || [])], profile.nativeLocation || '')) {
                console.log(`  [SKIP] @${enrichedUsername} — profile not Indonesian`);
                continue;
            }

            // PHASE 4 — Write to sheet ONLY if new profile
            const typeKey = profile.type || 'client';
            const isClient = typeKey === 'client';

            if (isNewProfile) {
                await writeProfile(profile, visited);
                visited.add(enrichedUsername);

                if (typeKey === 'competitor') { stats.competitors++; totalCompetitors++; }
                else if (typeKey === 'vendor') { stats.vendors++; totalVendors++; }
                else { stats.clients++; totalClients++; }

                console.log(`  [SAVED] @${enrichedUsername} → ${typeKey}`);
            } else {
                console.log(`  [REVISIT] @${enrichedUsername} — already saved`);
            }

            // Collect @mentions + collabs + vendor posts — ALWAYS
            if (!isClient) {
                const mentions = [...(postData.mentions || [])];
                const collabs = [...(postData.collabs || [])];

                // Nested vendor post URL collection for Phase 8
                const profilePostUrls = [...(profile.profilePostUrls || [])];
                if (profilePostUrls.length > 0) {
                    const MAX_VENDOR_POSTS = 12;
                    for (const url of profilePostUrls.slice(0, MAX_VENDOR_POSTS)) {
                        vendorPostUrls.add(url);
                    }
                    console.log(`  [NESTED] Collected ${Math.min(profilePostUrls.length, MAX_VENDOR_POSTS)} posts from @${enrichedUsername}`);
                }

                for (const m of mentions) {
                    const mLower = m.toLowerCase();
                    if (!visited.has(mLower) && !seenInQueue.has(mLower)) {
                        seenInQueue.add(mLower);
                        collabQueue.push({ username: mLower, depth: 1, source: enrichedUsername });
                    }
                }
                for (const c of collabs) {
                    const cLower = c.toLowerCase();
                    if (!visited.has(cLower) && !seenInQueue.has(cLower)) {
                        seenInQueue.add(cLower);
                        collabQueue.push({ username: cLower, depth: 1, source: enrichedUsername });
                    }
                }
            }
        }

        // ================================================================
        // PHASE 7 — AI batch classify buffered hashtags → flush approved only
        // ================================================================
        console.log('\n' + '-'.repeat(60));
        console.log('[PHASE 7] AI hashtag classification (batch)...');
        console.log('-'.repeat(60) + '\n');

        const approvedTags = await classifyHashtagsBatch([]);
        await flushHashtagBuffer(approvedTags);

        // ================================================================
        // PHASE 8 — Comment extraction: hashtag posts + vendor posts → clients
        // ================================================================
        console.log('\n' + '-'.repeat(60));
        const commentPosts = posts.slice(-20).map(p => ({ ...p, _source: 'hashtag' }));

        const vendorPostArray = [...vendorPostUrls].map(url => {
            const shortcode = url.split('/p/')[1]?.replace(/\/$/, '') || '';
            return { shortcode, postUrl: url, username: '', _source: 'vendor' };
        });
        commentPosts.push(...vendorPostArray);

        console.log(`[PHASE 8] ${posts.length} hashtag posts + ${vendorPostUrls.size} vendor posts = ${commentPosts.length} total for comments`);
        console.log('-'.repeat(60) + '\n');

        let commentCount = 0;

        for (let i = 0; i < commentPosts.length; i++) {
            const post = commentPosts[i];
            const shortcode = post.shortcode || '';
            const postUrl = `https://www.instagram.com/p/${shortcode}/`;
            const pNum = i + 1;
            const sourceTag = post._source === 'vendor' ? ' [VENDOR]' : '';
            console.log(`\n[COMMENT ${pNum}/${commentPosts.length}${sourceTag}] ${shortcode}`);

            const postAuthor = (post.username || '').toLowerCase();
            const allComments = await fetchAllPostCommentsGraphQL(shortcode, 100);
            if (!allComments || allComments.length === 0) {
                console.log(`  → 0 comments`);
                continue;
            }
            console.log(`  → ${allComments.length} comments${postAuthor ? ` from @${postAuthor}` : ''}`);

            const clients = filterClients(allComments, postAuthor || null);
            if (clients.length === 0) {
                console.log(`  → 0 filtered clients`);
                continue;
            }
            console.log(`  → ${clients.length} potential clients`);

            for (const client of clients) {
                const cUser = client.username.toLowerCase();
                if (visited.has(cUser)) continue;

                const clientData = {
                    username: cUser,
                    via: 'comment',
                    source: hashtag,
                    commentText: (client.text || '').slice(0, 200),
                    location: '',
                    profileUrl: `https://instagram.com/${cUser}/`,
                };

                await writeClientFromComment(clientData, visited);
                stats.clients++;
                totalClients++;
                commentCount++;
                console.log(`    [CLIENT SAVED] @${cUser} (score: ${client.score})`);
            }
        }

        console.log(`\n  → ${commentCount} clients saved from comments\n`);

        // ================================================================
        // PHASE 9 — Collab/mention queue: enrich each → PHASE 4
        // ================================================================
        console.log('\n' + '-'.repeat(60));
        console.log(`[PHASE 9] Collab/mention discovery (${collabQueue.length} queued)...`);
        console.log('-'.repeat(60) + '\n');

        let discCount = 0;
        let discErrors = 0;
        let consecutiveSeen = 0;
        let discPostCount = 0;
        const phase9Start = Date.now();

        while (collabQueue.length > 0) {
            const item = collabQueue.shift();
            if (visited.has(item.username)) {
                consecutiveSeen++;
                if (consecutiveSeen >= 10) {
                    console.log(`\n[STOP] Phase 9: 10 consecutive already-seen profiles.`);
                    break;
                }
                continue;
            }
            if (item.depth > (MAX_COLLAB_DEPTH || 2)) continue;

            visited.add(item.username);
            discCount++;

            // Phase 9 timeout
            const discElapsedMin = (Date.now() - phase9Start) / 60000;
            if (discElapsedMin >= (PHASE3_TIMEOUT_MIN || 90)) {
                console.log(`\n[STOP] Phase 9: ${discElapsedMin.toFixed(1)} min timeout.`);
                break;
            }

            // PHASE 10 — Every 20 discovery profiles: re-login
            if (discPostCount > 0 && discPostCount % 20 === 0) {
                console.log(`\n[PHASE 10] Re-login (discovery count=${discCount})...`);
                await refreshCookieStr();
            }
            discPostCount++;

            console.log(`\n[DISCOVER ${discCount}] @${item.username} (via @${item.source}, depth=${item.depth})`);

            const profile = await enrichProfile(item.username);
            if (!profile) {
                discErrors++;
                globalErrorCount++;
                if (discErrors >= (MAX_API_ERRORS_CONSECUTIVE || 20)) {
                    console.log(`\n[STOP] Phase 9: ${discErrors} consecutive errors.`);
                    break;
                }
                continue;
            }

            discErrors = 0;
            globalErrorCount = 0;

            // Indonesian check via profile
            if (!isIndonesian(profile.bio || '', [...(profile.hashtags || [])], profile.nativeLocation || '')) {
                console.log(`  [SKIP] @${item.username} — not Indonesian`);
                continue;
            }

            // PHASE 4 — Write immediately
            const typeKey = profile.type || 'client';
            const isClient = typeKey === 'client';

            await writeProfile(profile, visited);

            if (typeKey === 'competitor') { stats.competitors++; totalCompetitors++; }
            else if (typeKey === 'vendor') { stats.vendors++; totalVendors++; }
            else { stats.clients++; totalClients++; }

            console.log(`  [SAVED] @${item.username} → ${typeKey}`);

            // Collect more mentions/collab for next depth
            if (item.depth < (MAX_COLLAB_DEPTH || 2)) {
                for (const m of [...(profile.mentions || []), ...(profile.collabs || [])]) {
                    const mLower = m.toLowerCase();
                    if (!visited.has(mLower) && !seenInQueue.has(mLower)) {
                        seenInQueue.add(mLower);
                        collabQueue.push({ username: mLower, depth: item.depth + 1, source: item.username });
                    }
                }
            }
        }

        // ================================================================
        // PHASE 10 — Mark G column: Executed DD-MM-YY HH:MM WIB
        // ================================================================
        await markHashtagDone(hashtag, true);

        const nextIdx = (hashtagIdx + 1) % approvedHashtags.length;

        // Cleanup — close browser, persist state, reopen for next hashtag
        await closeBrowser();
        await persistState();

        printSummary(stats, hashtag, hashtagIdx, nextIdx, approvedHashtags.length, runCount);
        console.log(`  Total so far: ${totalCompetitors} competitors | ${totalVendors} vendors | ${totalClients} clients\n`);

        // Re-init browser for next hashtag run
        await initBrowser();
    }
}

// ============== SUMMARY ==============
function printSummary(stats, hashtag, lastIdx, nextIdx, totalHashtags, runCount) {
    console.log('\n' + '='.repeat(60));
    console.log(`[RUN #${runCount}] DONE — #${hashtag}`);
    console.log('='.repeat(60));
    console.log(`  Index:      ${lastIdx} of ${totalHashtags} → next: ${nextIdx}`);
    console.log(`  Competitors: ${stats.competitors}`);
    console.log(`  Vendors:    ${stats.vendors}`);
    console.log(`  Clients:    ${stats.clients}`);
    console.log(`  Errors:     ${stats.errors}`);
    console.log('='.repeat(60));
}

// ============== HANDLE ERRORS ==============
process.on('SIGINT', async () => {
    console.log('\n[ABORT] Closing...');
    if (_currentHashtag) {
        await markHashtagDone(_currentHashtag, false).catch(() => {});
    }
    await closeBrowser().catch(() => {});
    process.exit(1);
});

run().catch(async (e) => {
    console.error('[FATAL]', e.message);
    await closeBrowser().catch(() => {});
    process.exit(1);
});
