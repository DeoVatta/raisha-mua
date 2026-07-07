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
// PRIORITY: Competitor (MUA) → Vendor (wedding services) → Client (everyone else)
// Check in order: MUA keywords = competitor, photographer/vendor keywords = vendor, rest = client

export const COMPETITOR_KEYWORDS = [
    'mua', 'makeup artist', 'make-up', 'rias pengantin', 'riasd',
    'hairstylist', 'hairdo', 'bridalmakeup', 'muahid', 'muasl',
    'rias by', 'by mua', '@mua', 'makeuppro', 'makeupartist',
];

export const VENDOR_KEYWORDS = [
    // Photography
    'fotografer', 'photographer', 'fotografi', 'fotography', 'foto',
    'videografer', 'videografi', 'videography', 'video',
    'editor photo', 'photo editor', 'cameraman',
    'wedding photo', 'wedding video', 'prewedding photo',
    // Venue & Deco
    'venue', 'gedung', 'ballroom', 'ballrom', 'hotel',
    'dekorasi', 'dekor', 'decorator', 'decoration',
    'gaun', 'kebaya', 'wedding gown', 'dress',
    // Food & Catering
    'catering', 'katering', 'jajanan', 'wedding cake', 'cake',
    'tumpeng', 'nasi box', 'nasi box',
    // Other Services
    'mc', 'moderator', 'seserahan', 'bouquet',
    'undangan', 'invitation', 'invite', 'print',
    'salon', 'nails', 'lash', 'beauty',
    'organizer', 'planner', 'koor', 'entertainment',
    'sound system', 'musik', 'band', 'djuara',
    'soundsystem', 'lighting', 'lighting',
    'cars', 'car', 'transportasi', 'antareja',
    // Souvenir
    'souvenir', 'gift', 'bantal', 'bantalcouple',
    'parfume', 'parfum',
    // Religious
    'khotmil', 'penceramah', 'ustadz', 'pengajian',
];

// Used for fallback: classify by hashtag text when bio is empty
export const VENDOR_HASHTAGS = [
    '#fotografer', '#fotografi', '#photographer', '#videografer',
    '#catering', '#katering', '#dekorasi', '#venue', '#gedung',
    '#gaun', '#kebaya', '#weddingdress', '#mc', '#undangan',
    '#weddingplanner', '#weddingorganizer', '#weddingvendor',
    '#weddingvenue', '#weddingcatering', '#weddingdecoration',
    '#bouquet', '#weddingcake', '#souvenir', '#weddingmusic',
    '#salon', '#weddingnails',
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

    // 1. MUA = Competitor
    for (const kw of COMPETITOR_KEYWORDS) {
        if (wordBoundaryMatch(text, kw)) {
            return 'competitor';
        }
    }
    // 2. Service provider = Vendor
    for (const kw of VENDOR_KEYWORDS) {
        if (wordBoundaryMatch(text, kw)) {
            return 'vendor';
        }
    }
    // 3. Everything else = Client
    return 'client';
}

// Classify from hashtags when bio is empty
export function classifyFromHashtags(hashtags) {
    const tagText = hashtags.map(h => '#' + h.toLowerCase()).join(' ');
    for (const tag of VENDOR_HASHTAGS) {
        if (tagText.includes(tag.toLowerCase())) {
            return 'vendor';
        }
    }
    return 'client';
}

export function detectCategory(bio, displayName, accountType) {
    const text = ((bio || '') + ' ' + (displayName || '')).toLowerCase();

    if (accountType === 'competitor') {
        // MUA category detection
        if (wordBoundaryMatch(text, 'hairstylist') || wordBoundaryMatch(text, 'hairdo')) return 'HAIRSTYLIST';
        if (wordBoundaryMatch(text, 'bridalmakeup')) return 'BRIDAL';
        if (wordBoundaryMatch(text, 'makeup') || wordBoundaryMatch(text, 'mua')) return 'MUA';
        if (wordBoundaryMatch(text, 'rias')) return 'RIAS';
        return 'MUA';
    }
    if (accountType === 'vendor') {
        // Vendor category detection
        const cats = [
            ['photographer', 'foto', 'fotografer', 'fotografi', 'fotography'], 'PHOTOGRAPHER',
            ['videografer', 'videografi', 'videography', 'video', 'cameraman'], 'VIDEOGRAPHER',
            ['catering', 'katering', 'cake', 'tumpeng', 'nasi box'], 'CATERING',
            ['dekorasi', 'dekor', 'decorator', 'decoration'], 'DECORATOR',
            ['venue', 'gedung', 'ballroom', 'hotel'], 'VENUE',
            ['gaun', 'kebaya', 'gown', 'dress', 'wedding dress'], 'GAUN/KEBAYA',
            ['undangan', 'invitation', 'invite', 'print'], 'UNDANGAN',
            ['organizer', 'planner', 'koor', 'entertainment'], 'ORGANIZER',
            ['mc', 'moderator'], 'MC',
            ['salon', 'nails', 'lash', 'beauty'], 'SALON/BEAUTY',
            ['bouquet', 'gift', 'souvenir'], 'SOUVENIR',
            ['sound', 'music', 'musik', 'band', 'djuara'], 'MUSIC/ENTERTAINMENT',
            ['car', 'cars', 'transport'], 'TRANSPORT',
            ['khotmil', 'penceramah', 'ustadz', 'pengajian'], 'RELIGIOUS',
        ];
        for (let i = 0; i < cats.length; i += 2) {
            for (const kw of cats[i]) {
                if (wordBoundaryMatch(text, kw)) return cats[i + 1];
            }
        }
        return 'VENDOR';
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
