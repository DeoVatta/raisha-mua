# Raisha MUA - Instagram Prospecting Research

## Overview

Automated Instagram prospecting tool untuk Raisha MUA (Makeup Artist Semarang). System ini scraping hashtag untuk menemukan:
- **Competitors** - MUA/Makeup accounts
- **Vendors** - Other wedding services
- **Clients** - Potential customers (commenters)

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GOOGLE SHEETS                             │
│  ┌─────────┐ ┌─────────────┐ ┌─────────┐ ┌─────────────┐ │
│  │ Setting │ │ Competitors │ │ Vendors │ │   Clients    │ │
│  │ (Config)│ │  (MUA/MUA)  │ │(Other)  │ │(Prospects)  │ │
│  └─────────┘ └─────────────┘ └─────────┘ └─────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ Read/Write
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                  INSTAGRAM SCRAPER                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Playwright Browser                                    │  │
│  │  - Load cookies (session)                             │  │
│  │  - Navigate hashtags                                   │  │
│  │  - Extract posts/authors/comments                     │  │
│  │  - Visit profiles for bio/followers                   │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Google Sheets Integration

### Service Account Setup

1. Create Service Account di Google Cloud Console
2. Download JSON key file
3. Share spreadsheet ke service account email

**Service Account Email:**
```
claude@cogent-range-458804-r9.iam.gserviceaccount.com
```

### Spreadsheet Structure

```
Spreadsheet ID: 1xljNVmDBRHTVI7kQUCE4ALfc1Fbzue9-kiyHA0lYGwM

├── Setting (row 1)
│   └── Configuration parameters
├── Competitors (row 1)
│   └── MUA/Makeup accounts
├── Vendors (row 1)
│   └── Other wedding services
└── Clients (row 1 = empty, row 2 = headers)
    ├── Profile
    ├── Username
    ├── Source
    ├── Comment
    ├── Date
    ├── Location
    ├── Private
    ├── Followers
    ├── Bio
    ├── Status
    └── Notes
```

## Instagram Cookies Setup

### How to Get Cookies

1. Open Instagram in browser (logged in as Raisha)
2. Open DevTools (F12)
3. Go to Application > Cookies > instagram.com
4. Export all cookies as JSON
5. Copy to `cookies` array in scanner

### Required Cookies

| Cookie | Purpose | Expires |
|--------|---------|---------|
| sessionid | Main session | ~1 year |
| csrftoken | CSRF protection | ~6 months |
| datr | Facebook datr | ~2 years |
| mid | Machine ID | ~2 years |
| ig_did | Device ID | ~6 months |
| ps_n/ps_l | Login state | ~1 year |
| ds_user_id | User ID | ~6 months |

### Cookie Format

```javascript
const COOKIES = [
  {
    name: 'sessionid',
    value: '4864280079%3A...',
    domain: '.instagram.com',
    path: '/',
    expires: 1814308284.532215,
    httpOnly: true,
    secure: true,
    sameSite: 'None'
  },
  // ... other cookies
];
```

## Detection Logic

### Competitor Detection (MUA/Makeup)

Account yang mengandung keyword berikut di bio → **Competitors sheet**

```javascript
const COMPETITOR_KEYWORDS = [
  'mua', 'makeup', 'rias', 'riasd', 'bridalmakeup',
  'hairstylist', 'hairdo'
];
```

### Vendor Detection (Other Wedding Services)

Account yang mengandung keyword berikut di bio → **Vendors sheet**

```javascript
const VENDOR_KEYWORDS = [
  'fotografer', 'fotography', 'foto', 'videografer',
  'catering', 'katering',
  'dekorasi', 'dekor',
  'gaun', 'kebaya', 'bouquet',
  'venue', 'gedung', 'ballroom',
  'organizer', 'planner', 'mc',
  'seserahan',
  'salon', 'beauty', 'nails', 'lash',
  'undangan', 'invitation'
];
```

### Client Detection (Potential Customers)

- Commenters yang **TIDAK** mengandung competitor/vendor keywords
- Comment mengandung keyword婚礼-related (optional): `wedding, nikah, rias, pengantin`
- Exclude patterns: `Tags, Like, Follow, jawab, jawaban`

## Scraping Method

### Phase 1: Hashtag Exploration

1. Navigate to hashtag page: `https://www.instagram.com/explore/tags/{hashtag}/`
2. Wait for content load (networkidle)
3. Scroll 3x to load more posts
4. Extract post links from grid

### Phase 2: Post Analysis

For each post:
1. Navigate to post
2. Extract:
   - Post author (from header)
   - Caption + hashtags
   - Date posted
   - Commenters list
   - Comment texts

### Phase 3: Profile Scraping

For each detected account:
1. Navigate to profile
2. Extract:
   - Bio text
   - Location (if available)
   - Followers count
   - Is private (check for "This account is private")

### Phase 4: Classification

Based on bio analysis:
- Competitor keywords → Competitors sheet
- Vendor keywords → Vendors sheet
- Neither → Check if commenting on wedding posts → Clients sheet

## Files

```
instagram-scrape/
├── scanner.js           # Main scraper (reads Setting, writes to sheets)
├── test-sheets.js       # Test Google Sheets connection
├── setup-client-sheet.js # Setup Client headers
├── cleanup-sheets.js     # Clean spreadsheet
├── package.json
└── node_modules/
```

## Running the Scanner

```bash
cd C:\Users\Devata\Documents\GitHub\instagram-scrape
node scanner.js
```

## Limitations

### Cannot Get (Instagram API Restriction)

- ❌ Who viewed profile
- ❌ Who liked post (unless API access)
- ❌ Who saved post
- ❌ Private account followers (unless following)

### Can Get

- ✅ Public post data
- ✅ Public profile info (bio, followers, location)
- ✅ Comments (public posts)
- ✅ Hashtags used

## Notes

- Instagram UI changes frequently - selectors may need updates
- Rate limiting: Add delays between requests
- Session expiry: Cookies may expire, re-login required
- Account safety: Don't scrape too aggressively (risk of ban)

## Update Log

- 2026-07-07: Initial setup with Google Sheets integration
- Added Competitors/Vendors/Clients detection
- Service Account authentication working
