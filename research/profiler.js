import { google } from 'googleapis';
import { Client } from 'instagrapi';

const SERVICE_ACCOUNT = {
  type: 'service_account',
  project_id: 'cogent-range-458804-r9',
  private_key_id: 'ae19ee9eed01ba922729a5cef21b6c2e01cfea53',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC9+GGvuH86x6wS\nQqNSUtYpF/IczJXiClQnq62wYIu2c4S9K/UV3fBB2doFw3Mp4lIc9pbfSYOfNzws\nXi2e9CMrcaF9FotW700sWHCB7MaXXIWyUnsGt3s6ADDJpQFX0tkuYr2SPfoYq3te\nvbidXU15pADVal6BInt20PhXD/rYvD0R5EdK78az3ptK0KRcPToJ/Q2ft7Y/riAD\n+d4c6rwXTOnkXIuhyomJpxUlLyz7KvFxPPHudVm6CkyK5V4/t+YbCBmbUqZgCX91\nDp3ZYpAh72sISCrB2Ptx8iaCAN/RZtk977HH+BGsCh3CzuWg0d6C+MZmAD+xmUfm\nHSqzh4t/AgMBAAECggEAQAQFwyW8dg3YLdUX3UN92J4xn8PPVDsfzbh8EL4QBp0Z\n43d/IO3HqyEi56NL2RbjjdAI2liXCp2d4OOhovlpKpghj5n7vYFpc6Kf0yB7cYEj\nqopB2+sTkuGCj0jT0YkDV669bB0HfK24pp3vKtRIqc962m/8Ra7dhRX5QbloUgVT\n7tXU0lONf3uGmUMrQWX/6hwnxVyvaMtw5qGqj7AgBoFLfAmlNPNvWuZI/2z+k+ND\n0vTtw63x9Ny15l0Pswnau/6rShT0GvcMnEdiLAhWZUfcY2YxqJQhAH3a4672DQek\nWUVG2BSnkT2/V5GWvmg91PdwMdxSY+XZxgwvWvqYEQKBgQDrDaxIo/armjjUIXUN\nFJIiaT/w8Vf9flD21XI1bByNx07nzwVrAQiPsiF0laAy5iY5jWjM0Xl9iDDluCV1\n+dcm8ADP2SRC728EqUNMLuNcSmzFr10lksIQZJY7jxocZRO12dIXmsKTCXj6b44Y\n5A7idimRX1mR4SC17ZVN0ed7bwKBgQDO5jdKpv3uGyYAC5BLBDZjR9/221VYBwbc\n9u3K2/ofg5P3UoDQjmOIntkMjlvo4xCyLyfEFRxMXwbH2hT5KrqtDUGFsPPyLUsq\n3FjxYR1YU2ak0pu1TSlF3fesQ/h/BRF11VB1yp1VKR8SxLWFKeA1633HQ+KB4POn\n+qcKSl0o8QKBgQDelw4lpA/+JYfXau+buXVB3QXON96pkas+dJc4++52XN3eK2/o\nCwx+d6Oy8qroiIZ+TemGvIAeXpBfmmjvNe+HUhSSwADU2kT51wiB5o0sYtZqxkyh\nPj9EotyZ/kQty5JEzcdkzwufjoLgNjAMZjuqPVfT8MWzncwKPLj8/uAFRQKBgD1v\nVpOwKk59eTciN+JOiefI+9PNJPZSf9M07z8BOrAI3fLeaKmE3kE/CawUyW3JnreK\nEQDEU/bJcLX/J6Mk8PFZsk8EUCtlD6DWdQKXl6MWgLAIaXvYQZ0hX92jATKWSqz2\nfkG7vCQBZdyo1E2KNa1NE7gLjEKMjU0fvGHt2uPBAoGAOV4EqKQpGQlQVZSD/o3u\nlzkIlVtqbDZuE9adGi+14c8EkHA6EH26ePKTOZuFQ01KYFmnof08y01UekZLuRUt\n/0Az9PIOF4dvnT6siW5hluoUjyl41hJY5j9ov32RiyjvEYKxxFF3rw1U8K7GRe/V\nmOUC/y4Cp84B8c91tP4HRTY=\n-----END PRIVATE KEY-----\n',
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
const TARGET_CITIES = ['semarang', 'salatiga', 'solo', 'surakarta', 'boja', 'kendal', 'ungaran', 'pekalongan'];

const MAX_PROFILES_PER_RUN = 30;
const MAX_COLLAB_DEPTH = 4;
const REQUEST_DELAY = 5000;
const PROFILES_PER_HASHTAG = 10;

let sheets;
let ig;
let state = {
  visitedProfiles: new Set(),
  foundCompetitors: new Set(),
  foundVendors: new Set(),
  foundClients: new Set(),
  collabQueue: [],
  profileQueue: [],
  hashtags: [],
  lastIndex: 0,
  profilesScraped: 0,
  newProfiles: 0
};

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function initSheets() {
  const auth = new google.auth.GoogleAuth({ credentials: SERVICE_ACCOUNT, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
  console.log('✅ Google Sheets connected');
}

async function initInstagram() {
  ig = new Client();
  const session = await ig.login('raisha_makeup', process.env.IG_PASSWORD || 'devata_auto_2024');
  console.log('✅ Instagram logged in as:', session.username);
}

async function readHashtags() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEETS_ID, range: 'VendorHashtags!A1:G200' });
  const rows = res.data.values || [];
  return rows.slice(2).filter(r => r[1] && r[5] === 'OK').map(r => r[1]);
}

async function readVisitedProfiles() {
  const ranges = ['Competitors!C3:C1000', 'Vendor!C3:C1000', 'Client!B3:B1000'];
  for (const range of ranges) {
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEETS_ID, range });
      const rows = res.data.values || [];
      for (const row of rows) {
        if (row[0]) {
          const username = row[0].replace('@', '').trim();
          state.visitedProfiles.add(username);
        }
      }
    } catch (e) {
      // Sheet might not exist yet
    }
  }
  console.log(`📋 Loaded ${state.visitedProfiles.size} visited profiles`);
}

async function readLastIndex() {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEETS_ID, range: 'Setting!A1:Z100' });
    const rows = res.data.values || [];
    for (const row of rows) {
      if (row[0] === 'last_scanned_index') {
        state.lastIndex = parseInt(row[1]) || 0;
      }
    }
  } catch (e) {}
  console.log(`📍 Starting from hashtag index: ${state.lastIndex}`);
}

async function updateLastIndex(newIndex) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEETS_ID, range: 'Setting!A1:B50' });
    const rows = res.data.values || [];
    let found = false;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i][0] === 'last_scanned_index') {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEETS_ID, range: `Setting!B${i + 1}`, valueInputOption: 'RAW',
          resource: { values: [[newIndex.toString()]] }
        });
        found = true;
        break;
      }
    }
    if (!found) {
      const nextRow = rows.length + 1;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEETS_ID, range: `Setting!A${nextRow}:B${nextRow}`, valueInputOption: 'RAW',
        resource: { values: [['last_scanned_index', newIndex.toString()]] }
      });
    }
  } catch (e) {
    console.log('⚠️ Could not update last_scanned_index');
  }
}

function getAccountType(bio) {
  const bioLower = (bio || '').toLowerCase();
  if (COMPETITOR_KEYWORDS.some(k => bioLower.includes(k))) return 'competitor';
  if (VENDOR_KEYWORDS.some(k => bioLower.includes(k))) return 'vendor';
  return 'client';
}

function detectCategory(bio, type) {
  const bioLower = (bio || '').toLowerCase();
  if (type === 'competitor') {
    for (const k of COMPETITOR_KEYWORDS) {
      if (bioLower.includes(k)) return k.toUpperCase();
    }
    return 'MUA';
  } else if (type === 'vendor') {
    for (const k of VENDOR_KEYWORDS) {
      if (bioLower.includes(k)) return k.charAt(0).toUpperCase() + k.slice(1);
    }
    return 'Wedding Services';
  }
  return 'Client';
}

function detectLocation(bio) {
  const bioLower = (bio || '').toLowerCase();
  for (const city of TARGET_CITIES) {
    if (bioLower.includes(city)) return city.charAt(0).toUpperCase() + city.slice(1);
  }
  return '';
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

async function scrapeHashtagPosts(hashtag, tab = 'recent') {
  console.log(`\n🔍 #${hashtag} (${tab})`);
  const authors = [];
  const seenAuthors = new Set();
  let postCount = 0;
  const maxPosts = 100;

  try {
    const medias = await ig.hashtag_medias_recent(hashtag, 50);
    for (const media of medias) {
      postCount++;
      const username = media.user?.username || 'unknown';

      if (!seenAuthors.has(username)) {
        seenAuthors.add(username);
        authors.push({
          username,
          pk: media.user?.pk,
          likes: media.like_count || 0,
          comments: media.comment_count || 0,
          hashtags: media.caption?.match(/#[\w]+/g)?.join(' ') || ''
        });
        console.log(`   ✅ ${username} (${media.like_count} likes)`);
      } else {
        console.log(`   ⏭️  ${username} (duplicate, skipped)`);
      }

      if (authors.length >= PROFILES_PER_HASHTAG) break;
      if (postCount >= maxPosts) break;
    }
  } catch (e) {
    console.log(`   ❌ Error: ${e.message}`);
  }

  return authors;
}

async function scrapeProfile(username, depth = 0) {
  if (state.visitedProfiles.has(username)) {
    console.log(`   ⏭️  @${username} already visited`);
    return null;
  }

  if (state.profilesScraped >= MAX_PROFILES_PER_RUN) {
    console.log(`   🛑 Max profiles reached (${MAX_PROFILES_PER_RUN})`);
    return null;
  }

  console.log(`   👤 @${username} (depth: ${depth})`);
  state.profilesScraped++;
  state.visitedProfiles.add(username);
  await delay(REQUEST_DELAY);

  try {
    const user = await ig.user_info_by_username(username);

    const profile = {
      username: user.username,
      displayName: user.full_name || user.username,
      bio: user.biography || '',
      followers: user.follower_count || 0,
      following: user.following_count || 0,
      posts: user.media_count || 0,
      profileUrl: `https://instagram.com/${user.username}/`,
      location: detectLocation(user.biography),
      type: getAccountType(user.biography),
      category: detectCategory(user.biography, getAccountType(user.biography)),
      collabs: [],
      hashtags: new Set(),
      avgLikes: 0,
      avgComments: 0,
      totalLikes: 0,
      totalComments: 0,
      postsAnalyzed: 0
    };

    if (!profile.bio) {
      console.log(`   ⚠️  Bio empty, retrying...`);
      await delay(3000);
      const retry = await ig.user_info_by_username(username);
      profile.bio = retry.biography || '';
      profile.type = getAccountType(profile.bio);
      profile.category = detectCategory(profile.bio, profile.type);
    }

    console.log(`      📊 ${profile.followers.toLocaleString()} followers | ${profile.posts} posts`);
    console.log(`      📝 ${profile.bio?.slice(0, 60) || '-'}...`);

    // Get recent posts for engagement & collabs
    try {
      const medias = await ig.user_medias(user.pk, 20);
      profile.postsAnalyzed = medias.length;

      for (const media of medias) {
        profile.totalLikes += media.like_count || 0;
        profile.totalComments += media.comment_count || 0;

        // Collect hashtags
        const postHashtags = (media.caption?.match(/#[\w]+/g) || []);
        postHashtags.forEach(h => profile.hashtags.add(h.toLowerCase()));

        // Collect tagged users (collabs)
        if (media.user_tags?.length > 0) {
          for (const tag of media.user_tags) {
            if (!state.visitedProfiles.has(tag.user?.username) && tag.user?.username !== username) {
              profile.collabs.push(tag.user.username);
            }
          }
        }
      }

      if (profile.postsAnalyzed > 0) {
        profile.avgLikes = Math.round(profile.totalLikes / profile.postsAnalyzed);
        profile.avgComments = Math.round(profile.totalComments / profile.postsAnalyzed);
      }

      console.log(`      💬 Avg: ${profile.avgLikes} likes | ${profile.avgComments} comments`);
      console.log(`      🏷️  ${profile.hashtags.size} hashtags | ${profile.collabs.length} collabs`);

    } catch (e) {
      console.log(`   ⚠️  Could not get posts: ${e.message}`);
    }

    return profile;

  } catch (e) {
    console.log(`   ❌ Error scraping @${username}: ${e.message}`);
    state.visitedProfiles.delete(username);
    state.profilesScraped--;
    return null;
  }
}

async function writeProfile(profile) {
  if (!profile) return;

  const existingCheck = profile.type === 'competitor' ? state.foundCompetitors :
                        profile.type === 'vendor' ? state.foundVendors : state.foundClients;

  if (existingCheck.has(profile.username)) {
    console.log(`      ⏭️  Already saved`);
    return;
  }

  const engagement = profile.followers > 0 && profile.postsAnalyzed > 0
    ? (((profile.avgLikes + profile.avgComments) / profile.followers) * 100).toFixed(2) + '%'
    : 'N/A';

  const hashtagsStr = [...profile.hashtags].slice(0, 20).join(' ');
  const collabsStr = [...new Set(profile.collabs)].slice(0, 10).join(', ');
  const lastUpdated = new Date().toISOString().split('T')[0];

  if (profile.type === 'competitor') {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEETS_ID, range: 'Competitors!A:A' });
    const row = (res.data.values?.length || 0) + 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID, range: `Competitors!A${row}:P${row}`, valueInputOption: 'RAW',
      resource: { values: [[
        row - 1,
        profile.displayName,
        profile.profileUrl,
        '@' + profile.username,
        profile.location || 'JawaTengah',
        'JawaTengah',
        profile.followers.toString(),
        profile.following.toString(),
        profile.posts.toString(),
        '',
        engagement,
        hashtagsStr,
        profile.bio,
        'Pending',
        collabsStr,
        lastUpdated
      ]] }
    });
    state.foundCompetitors.add(profile.username);
    console.log(`      ✅ Saved to Competitors (row ${row})`);

  } else if (profile.type === 'vendor') {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEETS_ID, range: 'Vendor!A:A' });
    const row = (res.data.values?.length || 0) + 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID, range: `Vendor!A${row}:Q${row}`, valueInputOption: 'RAW',
      resource: { values: [[
        row - 1,
        profile.displayName,
        profile.profileUrl,
        '@' + profile.username,
        profile.category,
        profile.location || 'JawaTengah',
        'JawaTengah',
        profile.followers.toString(),
        profile.following.toString(),
        profile.posts.toString(),
        '',
        engagement,
        hashtagsStr,
        profile.bio,
        'Pending',
        collabsStr,
        lastUpdated
      ]] }
    });
    state.foundVendors.add(profile.username);
    console.log(`      ✅ Saved to Vendors (row ${row})`);

  } else {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEETS_ID, range: 'Client!A:A' });
    const row = (res.data.values?.length || 0) + 1;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEETS_ID, range: `Client!A${row}:Q${row}`, valueInputOption: 'RAW',
      resource: { values: [[
        row - 1,
        profile.profileUrl,
        '@' + profile.username,
        '',
        profile.bio,
        profile.followers.toString(),
        '',
        'Pending',
        hashtagsStr,
        engagement,
        profile.avgLikes.toString(),
        profile.avgComments.toString(),
        collabsStr,
        lastUpdated,
        '',
        ''
      ]] }
    });
    state.foundClients.add(profile.username);
    console.log(`      ✅ Saved to Clients (row ${row})`);
  }

  state.newProfiles++;

  // Queue collabs for processing
  if (depth < MAX_COLLAB_DEPTH) {
    for (const collab of profile.collabs) {
      if (!state.visitedProfiles.has(collab) && !state.collabQueue.includes(collab)) {
        state.collabQueue.push({ username: collab, depth: depth + 1 });
      }
    }
  }

  await delay(REQUEST_DELAY);
}

async function processProfile(username, depth = 0) {
  if (state.visitedProfiles.has(username)) return;

  const profile = await scrapeProfile(username, depth);
  if (profile) {
    await writeProfile(profile);
  }
}

async function run() {
  console.log('═'.repeat(60));
  console.log('🚀 INSTAGRAM PROFILER - Full Pipeline with instagrapi');
  console.log('═'.repeat(60));

  await initSheets();
  await initInstagram();

  // Load state
  state.hashtags = await readHashtags();
  console.log(`📋 Total hashtags: ${state.hashtags.length}`);

  if (state.hashtags.length === 0) {
    console.log('❌ No hashtags with Status=OK found');
    return;
  }

  await readVisitedProfiles();
  await readLastIndex();

  // Select hashtags based on index
  const selectedHashtags = [];
  for (let i = 0; i < 3 && state.hashtags.length > 0; i++) {
    const idx = (state.lastIndex + i) % state.hashtags.length;
    selectedHashtags.push(state.hashtags[idx]);
  }

  console.log(`\n📍 Selected hashtags: ${selectedHashtags.join(', ')}`);
  console.log(`📍 Next index will be: ${(state.lastIndex + 3) % state.hashtags.length}\n`);

  // Process each hashtag
  for (const hashtag of selectedHashtags) {
    if (state.profilesScraped >= MAX_PROFILES_PER_RUN) break;

    console.log('\n' + '─'.repeat(60));

    // Scrape latest posts
    const authors = await scrapeHashtagPosts(hashtag, 'latest');

    // Add to queue
    for (const author of authors) {
      if (!state.visitedProfiles.has(author.username)) {
        state.profileQueue.push({ username: author.username, depth: 0, source: hashtag });
      }
    }

    console.log(`   📊 Found ${authors.length} unique profiles`);
  }

  // Process profile queue
  console.log('\n' + '─'.repeat(60));
  console.log('📋 Processing profile queue...');

  while (state.profileQueue.length > 0 && state.profilesScraped < MAX_PROFILES_PER_RUN) {
    const item = state.profileQueue.shift();
    await processProfile(item.username, item.depth);
  }

  // Process collab queue
  console.log('\n' + '─'.repeat(60));
  console.log('🔄 Processing collab queue...');

  while (state.collabQueue.length > 0 && state.profilesScraped < MAX_PROFILES_PER_RUN) {
    const item = state.collabQueue.shift();
    await processProfile(item.username, item.depth);
  }

  // Update index
  const newIndex = (state.lastIndex + 3) % state.hashtags.length;
  await updateLastIndex(newIndex);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 SCAN COMPLETE');
  console.log('─'.repeat(60));
  console.log(`   Profiles scraped: ${state.profilesScraped}/${MAX_PROFILES_PER_RUN}`);
  console.log(`   New profiles saved: ${state.newProfiles}`);
  console.log(`   Competitors: ${state.foundCompetitors.size}`);
  console.log(`   Vendors: ${state.foundVendors.size}`);
  console.log(`   Clients: ${state.foundClients.size}`);
  console.log(`   Hashtag index: ${state.lastIndex} → ${newIndex}`);
  console.log(`   Next run will scan: ${selectedHashtags.join(', ')}`);
  console.log('─'.repeat(60));
  console.log('📝 All data written to Google Sheets immediately');
  console.log('🔗 https://docs.google.com/spreadsheets/d/' + SHEETS_ID);
  console.log('='.repeat(60));
}

run().catch(console.error);
