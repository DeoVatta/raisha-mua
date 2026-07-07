/**
 * Instagram Prospector - Config
 */

// Use service account file from parent directory
export const SERVICE_ACCOUNT_FILE = './gcp-service-account.json';
export const COOKIES_FILE = './instagram-cookies.json';
export const SHEETS_ID = '1xljNVmDBRHTVI7kQUCE4ALfc1Fbzue9-kiyHA0lYGwM';

// Limits
export const MAX_PROFILES_PER_RUN = 30;
export const MAX_COLLAB_DEPTH = 4;
export const POSTS_PER_HASHTAG = 10;
export const HASHTAGS_PER_RUN = 2;
export const PROFILES_PER_HASHTAG = 10;
export const REQUEST_DELAY = 5; // seconds between API calls
export const NAVIGATE_DELAY = 2000; // ms wait after page navigation
export const MAX_DISCOVERY_PROFILES = 30; // Phase 3 budget (separate from Phase 2)
