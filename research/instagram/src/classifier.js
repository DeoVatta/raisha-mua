/**
 * Instagram Prospector - Profile Classifier
 *
 * Classify accounts based on bio keywords:
 * - Competitor: MUA/Makeup keywords
 * - Vendor: Other wedding services
 * - Client: Everyone else
 *
 * Also detect location from bio text
 */


// ============== KEYWORDS ==============
export const COMPETITOR_KEYWORDS = [
    'mua', 'makeup', 'rias', 'riasd', 'bridalmakeup',
    'hairstylist', 'hairdo', 'makeup artist'
];

export const VENDOR_KEYWORDS = [
    'fotografer', 'fotography', 'foto', 'videografer', 'videografi',
    'catering', 'katering', 'dekorasi', 'dekor', 'gaun', 'kebaya',
    'bouquet', 'venue', 'gedung', 'ballroom', 'organizer', 'planner',
    'mc', 'seserahan', 'salon', 'beauty', 'nails', 'lash',
    'undangan', 'invitation', 'rias'
];

export const TARGET_CITIES = [
    'semarang', 'salatiga', 'solo', 'surakarta', 'boja',
    'kendal', 'ungaran', 'pekalongan', 'demak', 'kudus', 'pati'
];

// ============== CLASSIFIER ==============
function wordBoundaryMatch(text, keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(text);
}

export function classifyAccount(bio, displayName = '') {
    const text = ((bio || '') + ' ' + (displayName || '')).toLowerCase();

    for (const kw of COMPETITOR_KEYWORDS) {
        if (wordBoundaryMatch(text, kw)) {
            return 'competitor';
        }
    }
    for (const kw of VENDOR_KEYWORDS) {
        if (wordBoundaryMatch(text, kw)) {
            return 'vendor';
        }
    }
    return 'client';
}

export function detectCategory(bio, displayName, accountType) {
    const text = ((bio || '') + ' ' + (displayName || '')).toLowerCase();

    if (accountType === 'competitor') {
        for (const kw of COMPETITOR_KEYWORDS) {
            if (wordBoundaryMatch(text, kw)) {
                return kw.toUpperCase();
            }
        }
        return 'MUA';
    }
    if (accountType === 'vendor') {
        for (const kw of VENDOR_KEYWORDS) {
            if (wordBoundaryMatch(text, kw)) {
                return capitalize(kw);
            }
        }
        return 'Wedding Services';
    }
    return 'Client';
}

export function detectLocation(bio, displayName, locationFromPost = '') {
    const text = ((bio || '') + ' ' + (displayName || '') + ' ' + (locationFromPost || '')).toLowerCase();

    for (const city of TARGET_CITIES) {
        if (wordBoundaryMatch(text, city)) {
            return capitalize(city);
        }
    }
    return '';
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============== ENGAGEMENT ==============
export function calculateEngagement(likes, comments, followers) {
    if (!followers || followers === 0) return 0;
    return ((likes + comments) / followers * 100).toFixed(2);
}

export function classifyByEngagement(engagementRate) {
    if (engagementRate >= 5) return 'High';
    if (engagementRate >= 2) return 'Medium';
    if (engagementRate > 0) return 'Low';
    return 'N/A';
}
