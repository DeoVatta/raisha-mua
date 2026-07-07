/**
 * Instagram Prospector - Google Sheets Integration
 *
 * Handles all Google Sheets operations:
 * - Read hashtag list (VendorHashtags sheet)
 * - Read visited profiles (all sheets)
 * - Read/Write last scanned index (Setting sheet)
 * - Write profile data (Competitors, Vendor, Client sheets)
 */

import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHEETS_ID = '1xljNVmDBRHTVI7kQUCE4ALfc1Fbzue9-kiyHA0lYGwM';

// ============== HEADER WRITER ==============
const COMPETITORS_HEADER = [
    'No', 'Display Name', 'Profile URL', 'Username', 'Location', 'Region',
    'Followers', 'Following', 'Posts', 'Avg Likes', 'Engagement Rate',
    'Hashtags', 'Bio', 'Status', 'Collabs', 'Date'
];

const VENDOR_HEADER = [
    'No', 'Display Name', 'Profile URL', 'Username', 'Category', 'Location', 'Region',
    'Followers', 'Following', 'Posts', 'Avg Likes', 'Engagement Rate',
    'Hashtags', 'Bio', 'Status', 'Collabs', 'Date'
];

// Column B=Hashtag, C=Source, D=Count, E=Date Added, F=Status (OK=approved, NEW=newly discovered)
const HASHTAG_HEADER = [
    '', 'Hashtag', 'Source', 'Count', 'Date Added', 'Status'
];

const CLIENT_HEADER = [
    'No', 'Profile URL', 'Username', 'Via', 'Source',
    'Comment Text', 'Location', 'Date Comment'
];

// Check if headers already exist — only write if missing
async function writeHeaders() {
    if (!sheetsClient) return;
    try {
        // Check Competitors row 2 header
        const existing = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: SHEETS_ID,
            range: 'Competitors!B2:B2'
        });
        if (existing.data.values?.[0]?.[0] === 'Display Name') {
            return; // headers already correct, skip
        }

        // Write missing headers
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SHEETS_ID, range: 'Competitors!A1:P1',
            valueInputOption: 'RAW', resource: { values: [['']] }
        });
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SHEETS_ID, range: 'Competitors!A2:P2',
            valueInputOption: 'RAW', resource: { values: [COMPETITORS_HEADER] }
        });
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SHEETS_ID, range: 'Vendor!A1:Q1',
            valueInputOption: 'RAW', resource: { values: [['']] }
        });
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SHEETS_ID, range: 'Vendor!A2:Q2',
            valueInputOption: 'RAW', resource: { values: [VENDOR_HEADER] }
        });
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SHEETS_ID, range: 'Client!A1:H1',
            valueInputOption: 'RAW', resource: { values: [['']] }
        });
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SHEETS_ID, range: 'Client!A2:H2',
            valueInputOption: 'RAW', resource: { values: [CLIENT_HEADER] }
        });
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SHEETS_ID, range: 'VendorHashtags!A1:F1',
            valueInputOption: 'RAW', resource: { values: [['']] }
        });
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SHEETS_ID, range: 'VendorHashtags!A2:F2',
            valueInputOption: 'RAW', resource: { values: [HASHTAG_HEADER] }
        });
        console.log('[SHEETS] Headers written (Row 1=empty, Row 2=header)');
    } catch (e) {
        console.log(`[SHEETS] Header write error: ${e.message}`);
    }
}

// ============== INIT ==============
let sheetsClient = null;

// Row 1 = empty, Row 2 = header, Row 3+ = data
// Loaded from Setting sheet on startup to survive across pipeline runs
const nextRow = { Competitors: 3, Vendor: 3, Client: 3 };

async function _loadNextRowFromSetting() {
    const rows = await readRange('Setting!A1:B50');
    for (const row of rows) {
        if (row[0] === 'nextrow_competitors') nextRow.Competitors = parseInt(row[1]) || 3;
        if (row[0] === 'nextrow_vendor') nextRow.Vendor = parseInt(row[1]) || 3;
        if (row[0] === 'nextrow_client') nextRow.Client = parseInt(row[1]) || 3;
    }
}

async function _saveNextRowToSetting() {
    if (!sheetsClient) return;
    const rows = [
        ['nextrow_competitors', nextRow.Competitors],
        ['nextrow_vendor', nextRow.Vendor],
        ['nextrow_client', nextRow.Client],
    ];
    try {
        // Write to Setting sheet rows 50-52 (fixed positions)
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SHEETS_ID,
            range: 'Setting!A50:B52',
            valueInputOption: 'RAW',
            resource: { values: rows }
        });
    } catch (e) {
        // Non-critical — log and continue
        console.log(`[SHEETS] Failed to persist nextRow: ${e.message}`);
    }
}

async function initSheets() {
    if (sheetsClient) return sheetsClient;

    console.log('[SHEETS] Initializing...');

    try {
        const credPath = path.join(__dirname, '..', 'gcp-service-account.json');
        const key = JSON.parse(fs.readFileSync(credPath, 'utf8'));

        const auth = new GoogleAuth({
            credentials: key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const authClient = await auth.getClient();
        sheetsClient = google.sheets({ version: 'v4', auth: authClient });
        console.log('[SHEETS] Connected (service account)');
    } catch (e) {
        console.log(`[SHEETS] Auth error: ${e.message}`);
        console.log('[SHEETS] Running in dry-run mode (no actual writes)');
        sheetsClient = null;
    }

    // Write headers to Row 2 if not already present
    await writeHeaders();

    // Load persisted nextRow from Setting sheet
    await _loadNextRowFromSetting();
    console.log(`[SHEETS] nextRow → Competitors:${nextRow.Competitors} Vendor:${nextRow.Vendor} Client:${nextRow.Client}`);

    return sheetsClient;
}

// ============== READ ==============
async function readRange(range) {
    if (!sheetsClient) return [];
    try {
        const res = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: SHEETS_ID,
            range: range
        });
        return res.data.values || [];
    } catch (e) {
        console.log(`[SHEETS] Read error on ${range}: ${e.message}`);
        return [];
    }
}

async function readHashtags() {
    // Column B (index 1) = Hashtag, Column F (index 5) = Status
    const rows = await readRange('VendorHashtags!A1:F500');
    const hashtags = [];
    for (const row of rows.slice(2)) {
        if (row.length >= 6 && row[1] && (row[5] === 'OK' || row[5] === 'NEW')) {
            hashtags.push(row[1]);
        }
    }
    console.log(`[SHEETS] Loaded ${hashtags.length} hashtags (OK + NEW)`);
    return hashtags;
}

// Track hashtags written this session to avoid duplicates
const _seenHashtags = new Set();

// Generic/useless hashtags to ignore
const _genericHashtags = new Set([
    'instagram', 'instagood', 'instadaily', 'instapic', 'instalike', 'likeforlike',
    'like4like', 'likeforlikes', 'followme', 'followforfollow', 'follow4follow',
    'fyp', 'foryou', 'foryoupage', 'viral', 'explore', 'explorepage',
    'reels', 'reelsinstagram', 'trending', 'trendingnow', 'video',
    'photooftheday', 'picoftheday', 'instamood', 'instacool', 'instafashion',
    'ootd', 'style', 'fashion', 'beautiful', 'happy', 'love',
    'cute', 'beauty', 'makeup', 'selfie', 'girl', 'women',
    'photography', 'photo', 'art', 'artist', 'nature', 'travel',
    'lifestyle', 'motivation', 'inspiration', 'goals', 'life',
    'moderne', 'baby', 'kids', 'family', 'home', 'decoration',
]);

async function writeNewHashtag(hashtag, sourceUsername) {
    if (!sheetsClient || !hashtag) return;
    const clean = hashtag.replace(/^#/, '').toLowerCase().trim();
    if (!clean) return;
    if (_seenHashtags.has(clean)) return;
    if (_genericHashtags.has(clean)) return;

    // Read full range B:F to check for existing entries
    const rows = await readRange('VendorHashtags!A1:F500');
    // Check all rows (skip header row 2)
    for (let i = 2; i < rows.length; i++) {
        if (rows[i][1] && rows[i][1].toLowerCase() === clean) {
            _seenHashtags.add(clean);
            return; // already exists
        }
    }

    // Find next empty row in column B (after row 2 = header)
    let writeRow = rows.length + 1;
    for (let i = 2; i < rows.length; i++) {
        if (!rows[i] || !rows[i][1]) {
            writeRow = i + 1;
            break;
        }
    }

    const today = new Date().toISOString().split('T')[0];
    // Column B=Hashtag, C=Source, D=Count(1), E=Date Added, F=Status(NEW)
    const values = [[clean, `@${sourceUsername}`, '1', today, 'NEW']];
    await writeRange(`VendorHashtags!B${writeRow}:F${writeRow}`, values);
    _seenHashtags.add(clean);
    console.log(`  [NEW HASHTAG] #${clean}`);
}

async function readVisitedProfiles() {
    const visited = new Set();
    const ranges = [
        'Competitors!D3:D1000',
        'Vendor!D3:D1000',
        'Client!C3:C1000'
    ];

    for (const range of ranges) {
        const rows = await readRange(range);
        for (const row of rows) {
            if (row[0]) {
                const username = row[0].replace('@', '').trim();
                visited.add(username);
            }
        }
    }

    console.log(`[SHEETS] Loaded ${visited.size} visited profiles`);
    return visited;
}

async function readLastIndex() {
    const rows = await readRange('Setting!A1:B50');
    for (const row of rows) {
        if (row[0] === 'last_scanned_index' && row[1]) {
            return parseInt(row[1]) || 0;
        }
    }
    return 0;
}

// ============== WRITE ==============
async function writeRange(range, values) {
    if (!sheetsClient) {
        console.log(`[SHEETS DRY] ${range}:`, JSON.stringify(values).slice(0, 150));
        return;
    }
    try {
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SHEETS_ID,
            range: range,
            valueInputOption: 'RAW',
            resource: { values: values }
        });
    } catch (e) {
        console.log(`[SHEETS] Write error: ${e.message}`);
    }
}

async function getNextRow(sheetName) {
    if (!nextRow[sheetName]) {
        // Scan ALL columns to find first truly empty row (not just column A)
        const rows = await readRange(`${sheetName}!A:Z`);
        for (let i = 1; i <= rows.length + 1; i++) {
            const row = rows[i - 1];
            const hasContent = row && row.some(c => c && String(c).trim() !== '');
            if (!hasContent) {
                nextRow[sheetName] = i + 1; // array pos i-1 → row i+1
                break;
            }
        }
        if (!nextRow[sheetName]) {
            nextRow[sheetName] = rows.length + 2;
        }
    }
    return nextRow[sheetName];
}

async function writeProfile(profile, existingUsernames) {
    if (!profile || !profile.username) return;

    if (existingUsernames.has(profile.username)) {
        console.log(`  [SKIP] @${profile.username} already saved`);
        return;
    }

    const sheetName = profile.type === 'competitor' ? 'Competitors'
        : profile.type === 'vendor' ? 'Vendor' : 'Client';

    const rowNum = await getNextRow(sheetName);
    const today = new Date().toISOString().split('T')[0];

    const hashtagsStr = [...(profile.hashtags || [])].join(' ');
    const collabsStr = [...(profile.collabs || [])].slice(0, 10).join(', ');
    const engRate = profile.engagementRate || 'N/A';
    const engDisplay = typeof engRate === 'number' ? `${engRate}%` : engRate;

    let values;
    let endCol;

    if (profile.type === 'competitor') {
        values = [[
            rowNum - 2,
            profile.displayName || profile.username,
            profile.profileUrl || `https://instagram.com/${profile.username}/`,
            `@${profile.username}`,
            profile.location || '',
            'JawaTengah',
            profile.followers || 0,
            profile.following || 0,
            profile.posts || 0,
            '',
            engDisplay,
            hashtagsStr,
            profile.bio || '',
            'Pending',
            collabsStr,
            today
        ]];
        endCol = 'P';
    } else if (profile.type === 'vendor') {
        values = [[
            rowNum - 2,
            profile.displayName || profile.username,
            profile.profileUrl || `https://instagram.com/${profile.username}/`,
            `@${profile.username}`,
            profile.category || 'Wedding Services',
            profile.location || '',
            'JawaTengah',
            profile.followers || 0,
            profile.following || 0,
            profile.posts || 0,
            '',
            engDisplay,
            hashtagsStr,
            profile.bio || '',
            'Pending',
            collabsStr,
            today
        ]];
        endCol = 'Q';
    } else {
        values = [[
            rowNum - 2,
            profile.profileUrl || `https://instagram.com/${profile.username}/`,
            `@${profile.username}`,
            profile.sourceHashtag || '',
            profile.bio || '',
            profile.followers || 0,
            profile.following || '',
            'Pending',
            hashtagsStr,
            engDisplay,
            profile.avgLikes || profile.likes || 0,
            profile.avgComments || profile.comments || 0,
            collabsStr,
            today,
            profile.location || '',
            ''
        ]];
        endCol = 'Q';
    }

    await writeRange(`${sheetName}!A${rowNum}:${endCol}${rowNum}`, values);
    nextRow[sheetName] = rowNum + 1; // increment for next write
    existingUsernames.add(profile.username);
    await _saveNextRowToSetting();
    console.log(`  [SAVED] @${profile.username} to ${sheetName} (row ${rowNum})`);
}

async function writeClientFromComment(clientData, existingUsernames) {
    if (!clientData || !clientData.username) return;

    const username = clientData.username.toLowerCase().replace('@', '');
    if (existingUsernames.has(username)) {
        console.log(`  [SKIP CLIENT] @${username} already saved`);
        return;
    }

    const sheetName = 'Client';
    const rowNum = await getNextRow(sheetName);
    const today = new Date().toISOString().split('T')[0];

    const via = clientData.via || 'comment';
    const source = clientData.source || '';
    const commentText = (clientData.commentText || clientData.text || '').slice(0, 200);

    const values = [[
        rowNum - 2,                                                    // A: No
        `https://instagram.com/${username}/`,                           // B: Profile URL
        `@${username}`,                                                // C: Username
        via,                                                           // D: Via
        source,                                                        // E: Source (@postAuthor)
        commentText,                                                   // F: Comment Text
        clientData.location || '',                                     // G: Location
        today,                                                         // H: Date Comment
    ]];

    await writeRange(`${sheetName}!A${rowNum}:H${rowNum}`, values);
    nextRow[sheetName] = rowNum + 1;
    existingUsernames.add(username);
    await _saveNextRowToSetting();
    console.log(`  [SAVED CLIENT] @${username} via ${via} (row ${rowNum})`);
}

async function updateLastIndex(newIndex) {
    const rows = await readRange('Setting!A1:B50');
    let found = false;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === 'last_scanned_index') {
            await writeRange(`Setting!B${i + 1}`, [[String(newIndex)]]);
            found = true;
            break;
        }
    }
    if (!found) {
        await writeRange(`Setting!A${rows.length + 1}:B${rows.length + 1}`, [['last_scanned_index', String(newIndex)]]);
    }
}

// ============== EXPORTS ==============
export {
    initSheets,
    readHashtags,
    readVisitedProfiles,
    readLastIndex,
    getNextRow,
    writeProfile,
    writeClientFromComment,
    writeNewHashtag,
    updateLastIndex,
    readRange
};
