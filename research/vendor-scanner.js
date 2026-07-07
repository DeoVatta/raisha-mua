import { google } from 'googleapis';
import { chromium } from 'playwright';

const SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'cogent-range-458804-r9',
  private_key_id: 'ae19ee9eed01ba922729a5cef21b6c2e01cfea53',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC9+GGvuH86x6wS\nQqNSUtYpF/IczJXiClQnq62wYIu2c4S9K/UV3fBB2doFw3Mp4lIc9pbfSYOfNzws\nXi2e9CMrcaF9FotW700sWHCB7MaXXIWyUnsGt3s6ADDJpQFX0tkuYr2SPfoYq3te\nvbidXU15pADVal6BInt20PhXD/rYvD0R5EdK78az3ptK0KRcPToJ/Q2ft7Y/riAD\n+d4c6rwXTOnkXIuhyomJpxUlLyz7KvFxPPHudVm6CkyK5V4/t+YbCBmbUqZgCX91\nDp3ZYpAh72sISCrB2Ptx8iaCAN/RZtk977HH+BGsCh3CzuWg0d6C+MZmAD+xmUfm\nHSqzh4t/AgMBAAECggEAQAQFwyW8dg3YLdUX3UN92J4xn8PPVDsfzbh8EL4QBp0Z\n43d/IO3HqyEi56NL2RbjjdAI2liXCp2d4OOhovlpKpghj5n7vYFpc6Kf0yB7cYEj\nqopB2+sTkuGCj0jT0YkDV669bB0HfK24pp3vKtRIqc962m/8Ra7dhRX5QbloUgVT\n7tXU0lONf3uGmUMrQWX/6hwnxVyvaMtw5qGqj7AgBoFLfAmlNPNvWuZI/2z+k+ND\n0vTtw63x9Ny15l0Pswnau/6rShT0GvcMnEdiLAhWZUfcY2YxqJQhAH3a4672DQek\nWUVG2BSnkT2/V5GWvmg91PdwMdxSY+XZxgwvWvqYEQKBgQDrDaxIo/armjjUIXUN\nFJIiaT/w8Vf9flD21XI1bByNx07nzwVrAQiPsiF0loAy5iY5jWjM0Xl9iDDluCV1\n+dcm8ADP2SRC728EqUNMLuNcSmzFr10lksIQZJY7jxocZRO12dIXmsKTCXj6b44Y\n5A7idimRX1mR4SC17ZVN0ed7bwKBgQDO5jdKpv3uGyYAC5BLBDZjR9/221VYBwbc\n9u3K2/ofg5P3UoDQjmOIntkMjlvo4xCyLyfEFRxMXwbH2hT5KrqtDUGFsPPyLUsq\n3FjxYR1YU2ak0pu1TSlF3fesQ/h/BRF11VB1yp1VKR8SxLWFKeA1633HQ+KB4POn\n+qcKSl0o8QKBgQDelw4lpA/+JYfXau+buXVB3QXON96pkas+dJc4++52XN3eK2/o\nCwx+d6Oy8qroiIZ+TemGvIAeXpBfmmjvNe+HUhSSwADU2kT51wiB5o0sYtZqxkyh\nPj9EotyZ/kQty5JEzcdkzwufjoLgNjAMZjuqPVfT8MWzncwKPLj8/uAFRQKBgD1v\nVpOwKk59eTciN+JOiefI+9PNJPZSf9M07z8BOrAI3fLeaKmE3kE/CawUyW3JnreK\nEQDEU/bJcLX/J6Mk8PFZsk8EUCtlD6DWdQKXl6MWgLAIaXvYQZ0hX92jATKWSqz2\nfkG7vCQBZdyo1E2KNa1NE7gLjEKMjU0fvGHt2uPBAoGAOV4EqKQpGQlQVZSD/o3u\nlzkIlVtqbDZuE9adGi+14c8EkHA6EH26ePKTOZuFQ01KYFmnof08y01UekZLuRUt\n/0Az9PIOF4dvnT6siW5hluoUjyl41hJY5j9ov32RiyjvEYKxxFF3rw1U8K7GRe/V\nmOUC/y4Cp84B8c91tP4HRTY=\n-----END PRIVATE KEY-----\n',
  client_email: 'claude@cogent-range-458804-r9.iam.gserviceaccount.com',
  client_id: '111307777876072591411',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
  token_uri: 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: 'https://www.googleapis.com/robot/v1/metadata/x509/claude%40cogent-range-458804-r9.iam.gserviceaccount.com',
};

const SHEETS_ID = '1xljNVmDBRHTVI7kQUCE4ALfc1Fbzue9-kiyHA0lYGwM';

const COMPETITOR_KEYWORDS = ['mua', 'makeup', 'rias', 'riasd', 'bridalmakeup', 'hairstylist', 'hairdo', 'makeup artist'];
const VENDOR_KEYWORDS = ['fotografer', 'fotography', 'foto', 'videografer', 'videografi', 'catering', 'katering', 'dekorasi', 'dekor', 'gaun', 'kebaya', 'bouquet', 'venue', 'gedung', 'ballroom', 'organizer', 'planner', 'mc', 'seserahan', 'salon', 'beauty', 'nails', 'lash', 'undangan', 'invitation'];

const COMPETITOR_CATEGORIES = {
  'mua': 'MUA', 'makeup': 'MUA', 'makeup artist': 'MUA',
  'rias': 'Rias', 'riasd': 'Rias', 'bridalmakeup': 'Bridal MUA',
  'hairstylist': 'Hairstylist', 'hairdo': 'Hairdo'
};

const VENDOR_CATEGORIES = {
  'fotografer': 'Fotografer', 'fotography': 'Fotografer', 'foto': 'Fotografer',
  'videografer': 'Videografer', 'videografi': 'Videografer',
  'catering': 'Catering', 'katering': 'Catering',
  'dekorasi': 'Dekorasi', 'dekor': 'Dekorasi',
  'gaun': 'Gaun Kebaya', 'kebaya': 'Gaun Kebaya', 'bouquet': 'Bouquet',
  'venue': 'Venue', 'gedung': 'Venue', 'ballroom': 'Venue',
  'organizer': 'Wedding Organizer', 'planner': 'Wedding Planner',
  'mc': 'MC', 'seserahan': 'Seserahan',
  'salon': 'Salon', 'beauty': 'Beauty', 'nails': 'Nails', 'lash': 'Lash',
  'undangan': 'Undangan', 'invitation': 'Undangan'
};

const TARGET_PROVINCES = ['jawatengah', 'jateng', 'central java'];
const TARGET_CITIES = ['semarang', 'salatiga', 'solo', 'surakarta', 'boja', 'kendal', 'ungaran', 'pekalongan'];

let sheets;
let browser;
let foundAccounts = [];
let taggedVendors = [];

async function initSheets() {
  const auth = new google.auth.GoogleAuth({ credentials: SERVICE_ACCOUNT, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  console.log('✅ Google Sheets connected');
}

async function readHashtags() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEETS_ID, range: 'VendorHashtags!A1:G100' });
  return (res.data.values || []).slice(2).filter(r => r[1] && r[5] === 'OK').map(r => r[1]);
}

function parseNumber(str) {
  if (!str) return 0;
  str = str.toString().replace(/,/g, '');
  const match = str.match(/([\d.]+)([KMB])?/i);
  if (!match) return 0;
  let num = parseFloat(match[1]);
  if (match[2]?.toUpperCase() === 'K') num *= 1000;
  else if (match[2]?.toUpperCase() === 'M') num *= 1000000;
  return Math.round(num);
}

function calculateEngagement(followers, likes, comments, saves) {
  const f = parseNumber(followers);
  const interactions = parseNumber(likes) + parseNumber(comments) + parseNumber(saves);
  if (f === 0 || interactions === 0) return 'N/A - no post data';
  return ((interactions / f) * 100).toFixed(2) + '%';
}

function getAccountType(bio) {
  const bioLower = (bio || '').toLowerCase();
  if (COMPETITOR_KEYWORDS.some(k => bioLower.includes(k))) return 'competitor';
  if (VENDOR_KEYWORDS.some(k => bioLower.includes(k))) return 'vendor';
  return null;
}

function detectCategory(bio, type) {
  const bioLower = (bio || '').toLowerCase();
  const keywords = type === 'competitor' ? COMPETITOR_KEYWORDS : VENDOR_KEYWORDS;
  const cats = type === 'competitor' ? COMPETITOR_CATEGORIES : VENDOR_CATEGORIES;
  for (const k of keywords) {
    if (bioLower.includes(k)) return cats[k] || k;
  }
  return type === 'competitor' ? 'MUA' : 'Wedding Services';
}

function detectLocation(bio) {
  const bioLower = (bio || '').toLowerCase();
  for (const city of TARGET_CITIES) {
    if (bioLower.includes(city)) return city.charAt(0).toUpperCase() + city.slice(1);
  }
  return '';
}

async function writeCompetitor(comp) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEETS_ID, range: 'Competitors!A:A' });
  const row = (res.data.values?.length || 0) + 1;
  const engagement = calculateEngagement(comp.followers, comp.avgLikes, comp.avgComments, comp.avgSaves);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID, range: `Competitors!A${row}:O${row}`, valueInputOption: 'RAW',
    resource: { values: [[row - 1, comp.displayName, comp.profile, '@' + comp.username, comp.location || '', comp.province || 'JawaTengah', comp.followers || '0', comp.following || '0', comp.posts || '0', comp.lastPost || '', engagement, comp.hashtags || '', comp.bio || '', 'Pending', '']] }
  });
}

async function writeVendor(vendor) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEETS_ID, range: 'Vendor!A:A' });
  const row = (res.data.values?.length || 0) + 1;
  const engagement = calculateEngagement(vendor.followers, vendor.avgLikes, vendor.avgComments, vendor.avgSaves);
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEETS_ID, range: `Vendor!A${row}:P${row}`, valueInputOption: 'RAW',
    resource: { values: [[row - 1, vendor.displayName, vendor.profile, '@' + vendor.username, vendor.category || 'Wedding Services', vendor.location || '', vendor.province || 'JawaTengah', vendor.followers || '0', vendor.following || '0', vendor.posts || '0', vendor.lastPost || '', engagement, vendor.hashtags || '', vendor.bio || '', 'Pending', '']] }
  });
}

async function writeHashtag(tag, source) {
  tag = tag.replace('#', '').toLowerCase().trim();
  if (tag.length < 3) return;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEETS_ID, range: 'VendorHashtags!A1:G100' });
  const rows = res.data.values || [];
  const existingRow = rows.findIndex(r => r[1]?.toLowerCase() === tag);
  if (existingRow >= 2) {
    const times = parseInt(rows[existingRow][3] || '0') + 1;
    const sourceList = (rows[existingRow][2] || '').split(',').filter(s => s.trim());
    if (!sourceList.includes(source)) sourceList.push(source);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID, range: `VendorHashtags!C${existingRow + 1}:E${existingRow + 1}`, valueInputOption: 'RAW',
      resource: { values: [[sourceList.join(', '), times, new Date().toISOString().split('T')[0]]] }
    });
  }
}

async function getPostData(page, postUrl) {
  await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);

  return await page.evaluate(() => {
    // Get author from og:description format: "XX likes, X comments - username on Date"
    let authorUsername = '';
    const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
    const authorMatch = ogDesc.match(/ - ([a-zA-Z0-9._]+) on /);
    if (authorMatch) authorUsername = authorMatch[1];

    // If no og:description author, try JSON-LD
    if (!authorUsername) {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.author?.alternateName) {
            authorUsername = data.author.alternateName;
            break;
          }
          if (data.author?.name) {
            authorUsername = data.author.name.replace('@', '');
            break;
          }
        } catch {}
      }
    }

    const text = document.body.innerText;

    // Likes
    let likes = '0';
    const likePatterns = [
      /([\d.,]+[KMB]?)\s*(?:like|likes)/i,
      /liked by.*?([\d.,]+[KMB]?)/i,
      /([\d.,]+)\s*likes/i
    ];
    for (const p of likePatterns) {
      const m = text.match(p);
      if (m) { likes = m[1]; break; }
    }

    // Comments
    let comments = '0';
    const commentMatch = text.match(/([\d.,]+[KMB]?)\s*(?:comment|comments)/i);
    if (commentMatch) comments = commentMatch[1];

    // Saves
    let saves = '0';
    const saveMatch = text.match(/([\d.,]+[KMB]?)\s*(?:save|saves|saved)/i);
    if (saveMatch) saves = saveMatch[1];

    // Date
    let date = '';
    const dateMatch = text.match(/(\d+\s*(?:second|minute|hour|day|week|month|year)s?\s*ago)/i);
    if (dateMatch) date = dateMatch[1];

    // Tagged users (excluding author)
    const tagged = [...document.querySelectorAll('a[href]')]
      .map(a => a.getAttribute('href'))
      .filter(h => h && h.match(/^\/[a-zA-Z0-9._]+\/$/) && !h.match(/^\/(p|explore|tags|reels|accounts|support)\//))
      .map(h => h.replace(/\//g, ''))
      .filter(u => u && u.length > 2 && !u.match(/^[a-z]{2}$/) && u !== authorUsername);

    // Caption hashtags
    const hashtags = [...document.body.innerText.match(/#[\w]+/g) || []].slice(0, 30);

    return { likes, comments, saves, date, authorUsername, tagged: [...new Set(tagged)], hashtags: hashtags.join(' ') };
  });
}

async function getProfileData(page, username) {
  await page.goto(`https://www.instagram.com/${username}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(3000);

  return await page.evaluate(() => {
    const text = document.body.innerText;
    const lines = text.split('\n');

    // Find display name (first line with @username pattern or proper name)
    let displayName = username;
    for (let i = 0; i < Math.min(lines.length, 5); i++) {
      const l = lines[i].trim();
      if (l && l.length > 1 && l.length < 50 && !l.match(/Follow/i) && !l.match(/Following/i)) {
        displayName = l;
        break;
      }
    }

    // Bio: text between display name and "Followers"
    let bio = '';
    const bioLines = [];
    let capture = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (l.match(/Followers/i)) break;
      if (capture && l) bioLines.push(l);
      // Start capturing after display name, before any Follow/Following
      if (!capture && l === displayName) capture = true;
    }
    bio = bioLines.join(' ').replace(/\s+/g, ' ').trim();

    // Clean bio - remove stat-like text
    bio = bio.replace(/\d[\d,.]*[KMB]?\s*(Followers|Following|Posts|likes|comments|saves)/gi, '');
    bio = bio.replace(/^\d+\s*/g, '').trim();

    // Stats
    const followMatch = text.match(/([\d.,]+[KMB]?)\s*Followers/i);
    const followingMatch = text.match(/([\d.,]+[KMB]?)\s*Following/i);
    const postsMatch = text.match(/([\d.,]+[KMB]?)\s*Posts/i);

    // First post link from grid
    const postLinks = [...document.querySelectorAll('article a[href*="/p/"]')]
      .slice(0, 1)
      .map(a => 'https://www.instagram.com' + a.getAttribute('href'));
    const lastPostUrl = postLinks[0] || '';

    return {
      followers: followMatch ? followMatch[1] : '0',
      following: followingMatch ? followingMatch[1] : '0',
      posts: postsMatch ? postsMatch[1] : '0',
      bio: bio || displayName,
      displayName,
      lastPostUrl
    };
  });
}

async function scrapeHashtag(page, hashtag) {
  console.log(`\n🔍 Scraping #${hashtag}...`);

  try {
    await page.goto(`https://www.instagram.com/explore/tags/${hashtag}/`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    // Get posts from the grid
    const postLinks = await page.$$eval('a[href]', links =>
      links
        .map(l => l.href)
        .filter(h => h && h.includes('/p/'))
        .map(h => {
          const match = h.match(/\/p\/([^\/\?]+)/);
          return match ? `https://www.instagram.com/p/${match[1]}/` : null;
        })
        .filter(h => h)
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 30)
    );

    console.log(`   Found ${postLinks.length} posts`);

    for (const postUrl of postLinks) {
      if (foundAccounts.length >= 5) break;

      try {
        console.log(`   📝 ${postUrl}`);

        // Get post data
        const postData = await getPostData(page, postUrl);

        if (!postData.authorUsername) {
          console.log(`      ❌ No author found`);
          continue;
        }

        const authorUsername = postData.authorUsername;
        if (foundAccounts.some(a => a.username === authorUsername)) {
          console.log(`      ⏭️  Already scanned`);
          continue;
        }

        console.log(`      👤 @${authorUsername}`);

        // Get profile data
        const profileData = await getProfileData(page, authorUsername);

        if (!profileData.bio || profileData.bio.length < 5) {
          console.log(`      ❌ No bio`);
          continue;
        }

        const accountType = getAccountType(profileData.bio);
        if (!accountType) {
          console.log(`      ❌ Not a vendor/competitor`);
          continue;
        }

        // Engagement calculation
        const engagement = calculateEngagement(profileData.followers, postData.likes, postData.comments, postData.saves);

        const account = {
          username: authorUsername,
          profile: `https://www.instagram.com/${authorUsername}/`,
          displayName: profileData.displayName,
          category: detectCategory(profileData.bio, accountType),
          location: detectLocation(profileData.bio),
          province: 'JawaTengah',
          followers: profileData.followers,
          following: profileData.following,
          posts: profileData.posts,
          lastPost: postData.date || profileData.lastPostUrl,
          lastPostUrl: profileData.lastPostUrl,
          avgLikes: postData.likes,
          avgComments: postData.comments,
          avgSaves: postData.saves,
          hashtags: postData.hashtags,
          bio: profileData.bio,
          type: accountType
        };

        foundAccounts.push(account);

        if (accountType === 'competitor') {
          await writeCompetitor(account);
        } else {
          await writeVendor(account);
        }

        // Save hashtags
        const tags = (account.hashtags.match(/#[\w]+/g) || []).map(t => t.replace('#', '')).filter(t => t.length > 2);
        for (const tag of [...new Set(tags)].slice(0, 15)) {
          await writeHashtag(tag, authorUsername);
        }

        // Track tagged users (potential vendors/collaborators)
        for (const tagged of postData.tagged) {
          if (!taggedVendors.includes(tagged) && tagged !== authorUsername) {
            taggedVendors.push(tagged);
            console.log(`      🏷️  Tagged vendor: @${tagged}`);
          }
        }

        console.log(`      ✅ @${authorUsername} (${accountType}: ${account.category})`);
        console.log(`         📊 ${profileData.followers} followers | ${profileData.posts} posts`);
        console.log(`         📍 ${account.location || '-'} | Last: ${postData.date || 'recent'}`);
        console.log(`         💬 ${postData.likes} likes | ${postData.comments} comments | ${postData.saves} saves`);
        console.log(`         🔗 ${profileData.lastPostUrl}`);
        console.log(`         📝 ${profileData.bio.slice(0, 80)}...`);

      } catch (e) {
        console.log(`      ❌ ${e.message.slice(0, 100)}`);
      }
    }

  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
  }
}

async function loadCookies(context) {
  await context.addCookies([
    { name: "ps_n", value: "1", domain: ".instagram.com", path: "/", secure: true, httpOnly: false },
    { name: "datr", value: "mWr0aUsBtFcDfpLEKJO41Kpq", domain: ".instagram.com", path: "/", secure: true, httpOnly: true },
    { name: "ig_nrcb", value: "1", domain: ".instagram.com", path: "/", secure: true, httpOnly: false },
    { name: "ds_user_id", value: "4864280079", domain: ".instagram.com", path: "/", secure: true, httpOnly: false },
    { name: "csrftoken", value: "3beAQoZeDaydDNFfGpl6sMfN1CQcEb0d", domain: ".instagram.com", path: "/", secure: true, httpOnly: false },
    { name: "ig_did", value: "AF02F634-811B-444C-869C-23A4D6F98F1B", domain: ".instagram.com", path: "/", secure: true, httpOnly: true },
    { name: "ps_l", value: "1", domain: ".instagram.com", path: "/", secure: true, httpOnly: false },
    { name: "wd", value: "1528x698", domain: ".instagram.com", path: "/", secure: true, httpOnly: false },
    { name: "mid", value: "afRqmwALAAHIzzrfhb6W90RqlVpw", domain: ".instagram.com", path: "/", secure: true, httpOnly: false },
    { name: "sessionid", value: "4864280079%3AxIA99vCEEamXAw%3A10%3AAYi9spo4yCyVsv4claqP3boI9i2eec1gamd2eAvLCQ", domain: ".instagram.com", path: "/", secure: true, httpOnly: true },
    { name: "dpr", value: "1.25", domain: ".instagram.com", path: "/", secure: true, httpOnly: false },
    { name: "rur", value: "\"CCO\\0544864280079\\0541814928646:01ffc63edbd26151e9dc318214cfddcfa1c9e569719a8d4d5c9de84ebf3ce91f56fbcba4\"", domain: ".instagram.com", path: "/", secure: true, httpOnly: true }
  ]);
}

async function run() {
  console.log('🚀 Instagram Scanner - Full Profile + Post Analysis\n');

  await initSheets();
  const hashtags = await readHashtags();
  console.log(`📋 Hashtags: ${hashtags.join(', ')}\n`);

  browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext();
  await loadCookies(context);
  const page = await context.newPage();

  await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  if (page.url().includes('/accounts/login/')) {
    console.log('❌ Session expired');
    await browser.close();
    return;
  }

  console.log('✅ Logged in!\n');

  for (const hashtag of hashtags) {
    if (foundAccounts.length >= 5) break;
    await scrapeHashtag(page, hashtag);
  }

  await browser.close();

  console.log('\n' + '='.repeat(80));
  console.log('📊 SCAN COMPLETE');
  console.log(`   Accounts: ${foundAccounts.length}/5`);
  console.log(`   Tagged vendors found: ${taggedVendors.length}\n`);

  foundAccounts.forEach((a, i) => {
    const engagement = calculateEngagement(a.followers, a.avgLikes, a.avgComments, a.avgSaves);
    console.log(`${i + 1}. @${a.username} (${a.type}: ${a.category})`);
    console.log(`   📍 Location: ${a.location || '-'} | Province: ${a.province}`);
    console.log(`   👥 ${a.followers} followers | ${a.following} following | ${a.posts} posts`);
    console.log(`   📈 Engagement: ${engagement}`);
    console.log(`   🔗 Last post: ${a.lastPostUrl}`);
    console.log(`   🏷️  Hashtags: ${a.hashtags || '-'}`);
    console.log(`   📝 Bio: ${a.bio}`);
    console.log('');
  });

  console.log('='.repeat(80));
  if (taggedVendors.length > 0) {
    console.log(`📌 Tagged vendors for next scan: ${taggedVendors.slice(0, 10).join(', ')}`);
  }
  console.log('📝 Data written to Google Sheets');
}

run().catch(console.error);
