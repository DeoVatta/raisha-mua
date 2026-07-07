import { google } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initSheets, updateLastIndex, readHashtags } from './src/sheets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHEETS_ID = '1xljNVmDBRHTVI7kQUCE4ALfc1Fbzue9-kiyHA0lYGwM';

async function main() {
    const key = JSON.parse(fs.readFileSync(path.join(__dirname, 'gcp-service-account.json'), 'utf8'));
    const auth = new GoogleAuth({ credentials: key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    await initSheets();

    // Read all rows to find next empty row
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEETS_ID, range: 'VendorHashtags!A1:F50' });
    const rows = res.data.values || [];

    // Check if wosemarang exists
    const hasWo = rows.some(r => r[1] === 'wosemarang');
    console.log(`Has wosemarang: ${hasWo}`);

    if (!hasWo) {
        const today = new Date().toISOString().split('T')[0];
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEETS_ID,
            range: `VendorHashtags!B${rows.length + 1}:F${rows.length + 1}`,
            valueInputOption: 'RAW',
            resource: { values: [['wosemarang', '', '', today, 'OK']] }
        });
        console.log(`Added wosemarang at row ${rows.length + 1}`);
    }

    // Set index to tutorialmakeup (so next run picks tutorialmakeup + wosemarang)
    const hashtags = await readHashtags();
    console.log('Approved:', hashtags);
    const tutIdx = hashtags.indexOf('tutorialmakeup');
    console.log(`Will select: ${hashtags[tutIdx]} + ${hashtags[(tutIdx + 1) % hashtags.length]}`);
    await updateLastIndex(tutIdx);
    console.log(`Set last_scanned_index to ${tutIdx}`);
}

main().catch(console.error);
