/**
 * Instagram Prospector - Profile Enricher
 *
 * Combines Playwright profile page + API post data to build complete profile.
 * No instagrapi npm — uses Playwright + /api/v1/media/{id}/info/
 */

import {
    enrichProfileFromPage,
    enrichPostFromApi,
    scrapeProfilePosts,
    initBrowser,
} from './scraper.js';
import { classifyAccount, detectCategory, detectLocation, calculateEngagement } from './classifier.js';
import { REQUEST_DELAY } from './config.js';
import { writeNewHashtag } from './sheets.js';

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ============== ENRICH PROFILE ==============
/**
 * Full profile enrichment:
 * 1. Get profile data from profile page (bio, followers, following, posts, category)
 * 2. Scrape recent posts from profile grid (for collab/mention discovery)
 * 3. Classify: competitor/vendor/client
 * 4. Calculate engagement
 */
async function enrichProfile(username, postData = null) {
    try {
        // Get profile page data
        const profile = await enrichProfileFromPage(username);

        if (!profile || profile.followers === 0) {
            console.log(`  [WARN] Could not load profile @${username}`);
        } else {
            console.log(`  [PROFILE] @${username} | ${profile.followers} followers | ${profile.posts} posts`);
            console.log(`  [BIO] ${(profile.bio || '').substring(0, 80)}`);
        }

        // Merge with post data if provided
        if (postData) {
            profile.hashtags = new Set(postData.hashtags || []);
            profile.mentions = new Set((postData.mentions || []).map(m => m.toLowerCase()));
            profile.collabs = new Set(postData.collabs || []);
            profile.postLikes = postData.likes || 0;
            profile.postComments = postData.comments || 0;
            profile.caption = postData.caption || '';
        } else {
            profile.hashtags = new Set();
            profile.mentions = new Set();
            profile.collabs = new Set();
            profile.postLikes = 0;
            profile.postComments = 0;
        }

        // Scrape posts from profile for collab/mention discovery
        try {
            const profilePostUrls = await scrapeProfilePosts(username, 12);
            console.log(`  [POSTS] Found ${profilePostUrls.length} posts on profile`);

            // Enrich a few recent posts for extra collabs/mentions
            const postsToEnrich = profilePostUrls.slice(0, 6);
            let extraHashtags = [];
            let extraMentions = [];
            let extraCollabs = [];

            for (const url of postsToEnrich) {
                const pd = await enrichPostFromApi(url);
                if (pd) {
                    extraHashtags.push(...pd.hashtags);
                    extraMentions.push(...pd.mentions);
                    extraCollabs.push(...pd.collabs);
                }
            }

            extraHashtags.forEach(h => profile.hashtags.add(h));
            extraMentions.forEach(m => profile.mentions.add(m));
            extraCollabs.forEach(c => profile.collabs.add(c));
        } catch (e) {
            console.log(`  [WARN] Could not scrape profile posts @${username}: ${e.message}`);
        }

        // Classify
        const fullText = (profile.bio || '') + ' ' + (profile.displayName || '') + ' ' + (profile.category || '');
        profile.type = classifyAccount(profile.bio || '', profile.displayName || '');
        profile.location = detectLocation(profile.bio || '', profile.displayName || '');
        profile.category = detectCategory(profile.bio || '', profile.displayName || '', profile.type);

        // Engagement (use post likes/comments as proxy, or from profile data)
        if (profile.followers > 0) {
            profile.engagementRate = calculateEngagement(
                profile.postLikes,
                profile.postComments,
                profile.followers
            );
        } else {
            profile.engagementRate = 0;
        }

        // If bio is empty, try to classify from hashtags
        if (profile.type === 'client' && profile.hashtags.size > 0) {
            const tagText = [...profile.hashtags].join(' ');
            profile.type = classifyAccount(tagText, '');
            profile.category = detectCategory(tagText, '', profile.type);
        }

        console.log(`  [CLASSIFY] ${profile.type} | ${profile.category} | ${profile.location || 'N/A'}`);
        console.log(`  [ENGAGEMENT] ${profile.engagementRate}% (${profile.postLikes} likes, ${profile.postComments} comments / ${profile.followers} followers)`);
        console.log(`  [TAGS] Hashtags: ${[...profile.hashtags].slice(0, 5).join(' ')}`);
        console.log(`  [DISC] Mentions: ${[...profile.mentions].slice(0, 3).join(', ') || 'none'}`);
        console.log(`  [DISC] Collabs: ${[...profile.collabs].slice(0, 3).join(', ') || 'none'}`);

        // Write new hashtags to VendorHashtags sheet
        for (const tag of profile.hashtags) {
            await writeNewHashtag(tag, username);
        }

        return profile;

    } catch (e) {
        console.log(`  [ERROR] Failed to enrich @${username}: ${e.message}`);
        return null;
    }
}

// ============== EXPORTS ==============
export { enrichProfile, initBrowser };
