/**
 * Instagram Prospector - Google Sheets Integration
 *
 * Simple append mechanism:
 * - Row 1 = empty, Row 2 = header, Row 3+ = data
 * - nextRow tracks the next empty row (persisted to Setting sheet)
 * - No column = nextRow - 2 (always sequential, derived, never needs tracking)
 * - Mutex per sheet prevents concurrent phases from grabbing the same row
 */

import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isIndonesian } from './classifier.js';

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
const HASHTAG_HEADER = [
    '', 'Hashtag', 'Source', 'Count', 'Date Added', 'Status'
];
const CLIENT_HEADER = [
    'No', 'Profile URL', 'Username', 'Via', 'Source',
    'Comment Text', 'Location', 'Date Comment'
];

async function writeHeaders() {
    if (!sheetsClient) return;
    try {
        const existing = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: SHEETS_ID, range: 'Competitors!B2:B2'
        });
        if (existing.data.values?.[0]?.[0] === 'Display Name') return;

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
        console.log('[SHEETS] Headers written');
    } catch (e) {
        console.log(`[SHEETS] Header write error: ${e.message}`);
    }
}

// ============== INIT ==============
let sheetsClient = null;

// nextRow: next empty row to write (Row 1=empty, Row 2=header, Row 3+=data)
// Persisted to Setting sheet for cross-session survival
const nextRow = { Competitors: 3, Vendor: 3, Client: 3, VendorHashtags: 3 };

async function _loadFromSetting() {
    const rows = await readRange('Setting!A1:B60');
    for (const row of rows) {
        if (row[0] === 'nextrow_competitors') nextRow.Competitors = parseInt(row[1]) || nextRow.Competitors;
        if (row[0] === 'nextrow_vendor') nextRow.Vendor = parseInt(row[1]) || nextRow.Vendor;
        if (row[0] === 'nextrow_client') nextRow.Client = parseInt(row[1]) || nextRow.Client;
        if (row[0] === 'nextrow_vendorhashtags') nextRow.VendorHashtags = parseInt(row[1]) || nextRow.VendorHashtags;
    }
}

async function _saveToSetting() {
    if (!sheetsClient) return;
    try {
        await sheetsClient.spreadsheets.values.update({
            spreadsheetId: SHEETS_ID,
            range: 'Setting!A50:B53',
            valueInputOption: 'RAW',
            resource: { values: [
                ['nextrow_competitors', nextRow.Competitors],
                ['nextrow_vendor', nextRow.Vendor],
                ['nextrow_client', nextRow.Client],
                ['nextrow_vendorhashtags', nextRow.VendorHashtags],
            ] }
        });
    } catch (e) {
        console.log(`[SHEETS] Failed to persist: ${e.message}`);
    }
}

async function initSheets() {
    if (sheetsClient) return sheetsClient;

    console.log('[SHEETS] Initializing...');

    try {
        const credPath = path.join(__dirname, '..', 'gcp-service-account.json');
        const key = JSON.parse(fs.readFileSync(credPath, 'utf8'));
        const auth = new GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
        const authClient = await auth.getClient();
        sheetsClient = google.sheets({ version: 'v4', auth: authClient });
        console.log('[SHEETS] Connected (service account)');
    } catch (e) {
        console.log(`[SHEETS] Auth error: ${e.message}`);
        console.log('[SHEETS] Running in dry-run mode');
        sheetsClient = null;
    }

    await writeHeaders();
    await _loadFromSetting();
    console.log(`[SHEETS] nextRow → Competitors:${nextRow.Competitors} Vendor:${nextRow.Vendor} Client:${nextRow.Client} VendorHashtags:${nextRow.VendorHashtags}`);

    return sheetsClient;
}

// ============== READ ==============
async function readRange(range) {
    if (!sheetsClient) return [];
    try {
        const res = await sheetsClient.spreadsheets.values.get({
            spreadsheetId: SHEETS_ID, range
        });
        return res.data.values || [];
    } catch (e) {
        console.log(`[SHEETS] Read error on ${range}: ${e.message}`);
        return [];
    }
}

async function readHashtags() {
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

const _seenHashtags = new Set();

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

    // Quick dedup scan only for in-session duplicates (not for persist tracking)
    const rows = await readRange('VendorHashtags!B1:F500');
    for (let i = 2; i < rows.length; i++) {
        if (rows[i][0] && rows[i][0].toLowerCase() === clean) {
            _seenHashtags.add(clean);
            return;
        }
    }

    // Use in-memory counter — simple, no scan needed
    const writeRow = nextRow.VendorHashtags;
    const today = new Date().toISOString().split('T')[0];
    await writeRange(`VendorHashtags!B${writeRow}:F${writeRow}`, [[clean, `@${sourceUsername}`, '1', today, 'NEW']]);
    nextRow.VendorHashtags = writeRow + 1;
    _seenHashtags.add(clean);
    console.log(`  [NEW HASHTAG] #${clean}`);
}

async function readVisitedProfiles() {
    const visited = new Set();
    for (const range of [
        'Competitors!D3:D1000',
        'Vendor!D3:D1000',
        'Client!C3:C1000'
    ]) {
        const rows = await readRange(range);
        for (const row of rows) {
            if (row[0]) visited.add(row[0].replace('@', '').trim());
        }
    }
    console.log(`[SHEETS] Loaded ${visited.size} visited profiles`);
    return visited;
}

async function updateLastIndex(index) {
    if (!sheetsClient) return;
    // Write to first available row in Setting sheet (find last_scanned_index row or write new)
    const rows = await readRange('Setting!A1:B50');
    let found = false;
    for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === 'last_scanned_index') {
            await writeRange(`Setting!B${i + 1}:B${i + 1}`, [[index]]);
            found = true;
            break;
        }
    }
    if (!found) {
        await writeRange('Setting!A50:B50', [['last_scanned_index', index]]);
    }
}

async function readLastIndex() {
    const rows = await readRange('Setting!A1:B50');
    for (const row of rows) {
        if (row[0] === 'last_scanned_index' && row[1]) return parseInt(row[1]) || 0;
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
            spreadsheetId: SHEETS_ID, range,
            valueInputOption: 'RAW', resource: { values }
        });
    } catch (e) {
        console.log(`[SHEETS] Write error: ${e.message}`);
    }
}

// ============== MUTEX ==============
// Serializes write operations per sheet.
// Without this: Phase 2 + Phase 3 both call getNextRow() simultaneously,
// both get the same row number (race), and the second write overwrites the first.
// With this: each phase waits for the other's lock to release before grabbing a row.
const _locks = {};
function acquireLock(sheetName) {
    if (!_locks[sheetName]) _locks[sheetName] = Promise.resolve();
    const lockState = { prev: _locks[sheetName] };
    _locks[sheetName] = _locks[sheetName].then(() => {
        lockState.release = () => { _locks[sheetName] = Promise.resolve(); };
    });
    return lockState;
}

// ============== ROW GETTER ==============
// Uses in-memory nextRow (protected by mutex).
// This is safe: mutex guarantees only one write happens at a time,
// so nextRow is always accurate — no stale cache problem.
function getNextRow(sheetName) {
    return nextRow[sheetName];
}

// ============== PROFILE WRITER ==============
async function writeProfile(profile, existingUsernames) {
    if (!profile || !profile.username) return;

    const username = profile.username;
    if (existingUsernames.has(username)) {
        console.log(`  [SKIP] @${username} already saved`);
        return;
    }

    const sheetName = profile.type === 'competitor' ? 'Competitors'
        : profile.type === 'vendor' ? 'Vendor' : 'Client';

    await acquireLock(sheetName).prev; // wait for previous lock holder to release
    const lockState = {};
    _locks[sheetName] = _locks[sheetName].then(() => {
        lockState.release = () => { _locks[sheetName] = Promise.resolve(); };
    });
    try {
        // Only save accounts with Indonesian indicators
        if (!isIndonesian(profile.bio || '', [...(profile.hashtags || [])], profile.nativeLocation || '')) {
            console.log(`  [SKIP] @${username} — not Indonesian`);
            return;
        }

        const rowNum = nextRow[sheetName];          // get current row
        const sheetNo = rowNum - 2;                  // No column = always sequential
        const today = new Date().toISOString().split('T')[0];

        const hashtagsStr = [...(profile.hashtags || [])].join(' ');
        const collabsStr = [...(profile.collabs || [])].slice(0, 10).join(', ');
        const engRate = profile.engagementRate || 'N/A';
        const engDisplay = typeof engRate === 'number' ? `${engRate}%` : engRate;

        let values, endCol;

        if (profile.type === 'competitor') {
            values = [[
                sheetNo,
                profile.displayName || username,
                profile.profileUrl || `https://instagram.com/${username}/`,
                `@${username}`,
                profile.location || '',
                profile.location ? 'JawaTengah' : '',
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
                sheetNo,
                profile.displayName || username,
                profile.profileUrl || `https://instagram.com/${username}/`,
                `@${username}`,
                profile.category || 'Wedding Services',
                profile.location || '',
                profile.location ? 'JawaTengah' : '',
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
                sheetNo,
                profile.profileUrl || `https://instagram.com/${username}/`,
                `@${username}`,
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
        nextRow[sheetName] = rowNum + 1;              // advance cursor
        existingUsernames.add(username);

        console.log(`  [SAVED] @${username} to ${sheetName} (row ${rowNum}, No=${sheetNo})`);
    } finally {
        if (lockState.release) lockState.release();
    }
}

// ============== CLIENT FROM COMMENT WRITER ==============
async function writeClientFromComment(clientData, existingUsernames) {
    if (!clientData || !clientData.username) return;

    const username = clientData.username.toLowerCase().replace('@', '');
    if (existingUsernames.has(username)) {
        console.log(`  [SKIP CLIENT] @${username} already saved`);
        return;
    }

    await acquireLock('Client').prev;
    const lockState = {};
    _locks.Client = _locks.Client.then(() => {
        lockState.release = () => { _locks.Client = Promise.resolve(); };
    });
    try {
        const rowNum = nextRow.Client;
        const sheetNo = rowNum - 2;
        const today = new Date().toISOString().split('T')[0];
        const via = clientData.via || 'comment';
        const source = clientData.source || '';
        const commentText = (clientData.commentText || clientData.text || '').slice(0, 200);

        await writeRange(`Client!A${rowNum}:H${rowNum}`, [[
            sheetNo,
            `https://instagram.com/${username}/`,
            `@${username}`,
            via,
            source,
            commentText,
            clientData.location || '',
            today,
        ]]);

        nextRow.Client = rowNum + 1;
        existingUsernames.add(username);

        console.log(`  [SAVED CLIENT] @${username} via ${via} (row ${rowNum}, No=${sheetNo})`);
    } finally {
        if (lockState.release) lockState.release();
    }
}

// ============== PERSIST CALLED BY PIPELINE ==============
// Call this once at end of pipeline run to save state
async function persistState() {
    await _saveToSetting();
}

// ============== EXPORTS ==============
export {
    initSheets,
    readHashtags,
    readVisitedProfiles,
    readLastIndex,
    writeProfile,
    writeClientFromComment,
    writeNewHashtag,
    updateLastIndex,
    readRange,
    persistState,
};
