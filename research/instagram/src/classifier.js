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

// ============== INDONESIA DETECTION ==============
// All major Indonesian cities and regions
export const INDONESIAN_CITIES = [
    // Jawa
    'jakarta', 'jkt', 'jkart', 'tangerang', 'tangsel', 'bekasi', 'bogor', 'depok',
    'bandung', 'bdg', 'cirebon', 'cirebon', 'karawang', 'purwakarta', 'sukabumi',
    'subang', 'indramayu', 'majalengka', 'sumedang', 'garut', 'cianjur', 'bandung barat',
    'semarang', 'smg', 'solo', 'surakarta', 'yogyakarta', 'jogja', 'jogjakarta', 'yogya',
    'salatiga', 'slg', 'klaten', 'klt', 'wonogiri', 'sragen', 'boyolali', 'magelang',
    'pati', 'kudus', 'rembang', 'blora', 'grobogan', 'karanganyar', 'cepu',
    'ungaran', 'ung', 'pekalongan', 'pkl', 'tegal', 'tgl', 'brebes', 'pemalang',
    'batang', 'kendal', 'demak', 'jepara', 'pati', 'jombang', 'mojokerto', 'surabaya', 'sby',
    'sidoarjo', 'gresik', 'lamongan', 'tuban', 'bojonegoro', 'nganjuk', 'madiun',
    'ponorogo', 'ngawi', 'magetan', 'caruban', 'trenggalek', 'tulungagung', 'blitar',
    'malang', 'mlg', 'pasuruan', 'probolinggo', 'lumajang', 'jember', 'banyuwangi',
    'situbondo', 'bondowoso', 'besuki', 'ponorogo', 'kediri', 'kediri',
    'bali', 'denpasar', 'bali', 'kuta', 'ubud', 'sanur', 'nusa dua', 'nusa penida',
    'lombok', 'mataram', 'sumbawa',
    // Sumatera
    'medan', 'mdn', 'pekanbaru', 'pkp', 'padang', 'palembang', 'plm', 'palembang',
    'pekanbaru', 'riau', 'jambi', 'bengkulu', 'lampung', 'bandar lampung', 'lampung',
    'banjarmasin', 'bjb', 'kalimantan', 'samarinda', 'balikpapan', 'pontianak',
    // Sulawesi
    'makassar', 'mks', 'ujung pandang', 'parepare', 'palopo', 'manado', 'gorontalo',
    'kendari', 'palu', 'bau-bau',
    // Lainnya
    'mataram', 'kupang', 'ambon', 'ternate', 'sorong', 'jayapura', 'papua',
    'jawa', 'jatim', 'jateng', 'jabar', 'dki', 'indonesia', 'riau', 'ri',
];

// Indonesian words that strongly indicate account is Indonesian
// Note: Indonesian cities are in INDONESIAN_CITIES, not here (avoid duplication)
export const INDONESIAN_WORDS = [
    'menikah', 'pernikahan', 'resepsi', 'undangan nikah', 'akad',
    'suami', 'istri', 'mempelai', 'pengantin',
    '+62', 'wa.me', 'whatsapp', 'whats app', 'line:', 'telegram:',
    'allah', 'jannah', 'khotbah', 'pengajian', 'khotmil', 'dakwah',
    'mualaf', 'muslimah', 'muslim', 'islami', 'hijab', 'jilbab',
];

function wordBoundaryMatch(text, keyword) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(text);
}

/**
 * Check if an account is likely Indonesian.
 * Returns true if bio/hashtags/nativeLocation contain Indonesian indicators.
 */
export function isIndonesian(bio = '', hashtags = [], nativeLocation = '') {
    const text = ((bio || '') + ' ' + hashtags.join(' ') + ' ' + (nativeLocation || '')).toLowerCase();

    // Check for Indonesian cities
    for (const city of INDONESIAN_CITIES) {
        if (wordBoundaryMatch(text, city)) return true;
    }

    // Check for Indonesian words
    for (const word of INDONESIAN_WORDS) {
        if (text.includes(word)) return true;
    }

    // Check for +62 phone format
    if (/\+62|62\d{8,}/.test(text)) return true;

    return false;
}

// Semua kota, kabupaten & daerah di Jawa Tengah
export const JAWA_TENGAH_CITIES = [
    // Kota
    'semarang', 'salatiga', 'solo', 'surakarta', 'tegal', 'pekalongan',
    // Kabupaten / Kota Kabupaten
    'brebes', 'pemalang', 'batang', 'kendal', 'demak', 'kudus',
    'pati', 'rembang', 'blora', 'grobogan', 'sragen', 'wonogiri',
    'karanganyar', 'klaten', 'boyolali', 'magelang', 'temanggung',
    'ungaran', 'banyumas', 'cilacap', 'purwokerto', 'purbalingga',
    'banjarnegara', 'wonosobo', 'kebumen', 'purworejo',
    'wonogiri', 'cepu', 'jati', 'kaliori', 'bumiaji', 'jakenan',
    'jenggala', 'peterongan', 'sumobito', 'gudo', 'diwek',
    // Daerah / Kecamatan di Semarang
    'ambarawa', 'susukan', 'bergas', 'bawen', 'boja', 'tengaran',
    'kaliwulu', 'pabelokan', 'suruh', 'getasan', 'ledok',
    'ngaliyan', 'tembalang', 'banyumanik', 'candisari', 'gajahmungkur',
    'pringsurat', 'kaliwangi', 'jambu', 'sumowono', 'pakis',
    'ngablak', 'wonosegoro', 'jumo', 'sigaluh', 'keling',
    // Daerah / Kecamatan di Solo & sekitarnya
    'jebres', 'laweyan', 'banjarsari', 'grogol', 'mojosongo',
    'ngemplak', 'colomadu', 'gondangrejo', 'jatisrono', 'ngadiroyo',
    'ngadirojo', 'jatiroto', 'kismantoro', 'jatiyoso', 'giritontro',
    'bendosari', 'polokarto', 'sukuh', 'tasikmadu', 'kerjo',
    // Daerah / Kecamatan di Kudus, Pati, dll
    'jekulo', 'tanggal', 'dawe', 'bacin', 'kudus', 'kai',
    'winong', 'gabus', 'pagu', 'kayen', 'tambakromo', 'prawoto',
    // Alternatif / typo
    'jateng', 'jawa tengah', 'central java', 'karesidenan',
];

// Shortcuts / abbreviations
const CITY_ALIASES = {
    'smg': 'Semarang', 'smgku': 'Semarang', 'semarangku': 'Semarang',
    'slg': 'Salatiga', 'slt': 'Salatiga',
    'solo': 'Solo', 'surakarta': 'Solo', 'sby': 'Solo', 'sukuh': 'Solo', 'tasikmadu': 'Solo',
    'klt': 'Klaten', 'kltn': 'Klaten',
    'kudus': 'Kudus', 'kds': 'Kudus',
    'tegal': 'Tegal', 'tgl': 'Tegal',
    'pekalongan': 'Pekalongan', 'pkl': 'Pekalongan',
    'pati': 'Pati', 'brebes': 'Brebes', 'bbs': 'Brebes',
    'ungaran': 'Ungaran', 'ung': 'Ungaran',
    'jateng': 'JawaTengah', 'jawa tengah': 'JawaTengah',
    'cepu': 'Cepu', 'jati': 'Jati', 'bumiaji': 'Bumiaji',
};

export function detectLocation(bio = '', displayName = '', nativeLocation = '') {
    const raw = ((bio || '') + ' ' + (displayName || '')).toLowerCase();

    // Priority 1: native location from Instagram profile (JSON-LD / og:description)
    if (nativeLocation) {
        const normalized = nativeLocation.toLowerCase();
        // Check if native location is in Jawa Tengah
        for (const city of JAWA_TENGAH_CITIES) {
            if (normalized.includes(city)) {
                return capitalizeFirst(resolveAlias(city));
            }
        }
        // If native location exists but not Jawa Tengah → return empty (not in scope)
        return '';
    }

    // Priority 2: scan bio for Jawa Tengah cities
    for (const city of JAWA_TENGAH_CITIES) {
        if (wordBoundaryMatch(raw, city)) {
            return capitalizeFirst(resolveAlias(city));
        }
    }

    // Priority 3: check aliases
    for (const [alias, resolved] of Object.entries(CITY_ALIASES)) {
        if (wordBoundaryMatch(raw, alias)) {
            return resolved;
        }
    }

    return '';
}

function resolveAlias(city) {
    return CITY_ALIASES[city.toLowerCase()] || capitalizeFirst(city);
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============== CLASSIFIER ==============
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
