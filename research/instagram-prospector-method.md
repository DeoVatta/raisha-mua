# Raisha MUA - Instagram Prospecting Research

## Overview

Automated Instagram prospecting tool untuk Raisha MUA (Makeup Artist Semarang). System ini scraping hashtag untuk menemukan:
- **Competitors** - MUA/Makeup accounts
- **Vendors** - Other wedding services
- **Clients** - Potential customers (commenters)

## Goals

1. **Competitor Analysis** - Know your competition in the MUA space
2. **Vendor Partnership** - Find potential wedding vendor partners
3. **Client Prospecting** - Find potential customers from hashtag engagement

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

**Service Account Email:**
```
claude@cogent-range-458804-r9.iam.gserviceaccount.com
```

**Spreadsheet ID:** `1xljNVmDBRHTVI7kQUCE4ALfc1Fbzue9-kiyHA0lYGwM`

Share spreadsheet to service account email with Editor access.

## Spreadsheet Structure

All data sheets use: **Row 1 = empty, Row 2 = headers, Row 3+ = data**

### Setting Sheet

Configuration parameters (read at runtime by scanner).

| Parameter | Default | Description |
|----------|---------|-------------|
| province | JawaTengah | Target province |
| city | Semarang,Salatiga,Solo,Boja | Target cities |
| hashtags | muasemarang,muasurabaya,... | Hashtags to scrape |
| daily_client_limit | 5 | Max clients per scan |
| daily_vendor_limit | 5 | Max vendors per scan |
| daily_competitor_limit | 10 | Max competitors per scan |
| competitor_keywords | mua,makeup,rias,... | MUA/Makeup keywords |
| vendor_keywords | fotografer,catering,... | Wedding vendor keywords |
| comment_length_min | 5 | Min comment characters |
| exclude_patterns | Tags,Like,Follow | Patterns to exclude |

### Clients Sheet

Potential customers (people who commented on posts, not vendors).

**Columns (Row 1 empty, Row 2 headers):**

| # | Column | Source |
|---|--------|--------|
| A | (empty) | - |
| B | Profile | Instagram URL |
| C | Username | Extracted from URL |
| D | Source | Post URL where commented |
| E | Comment | Comment text |
| F | Date | Comment date |
| G | Location | From bio (if available) |
| H | Private | Yes/No |
| I | Followers | Follower count |
| J | Bio | Full bio text |
| K | Status | Potential Client / Contacted / etc |
| L | Notes | Manual notes |

### Competitors Sheet

MUA/Makeup accounts (direct competitors).

**Columns (Row 1 empty, Row 2 headers):**

| # | Column | Source |
|---|--------|--------|
| A | No | Auto-number |
| B | MUA | Display name from bio |
| C | Profile | Instagram URL |
| D | Username | @username |
| E | Location | City from bio |
| F | Province | From Setting |
| G | Followers | Follower count |
| H | Following | Following count |
| I | Posts | Total posts |
| J | Last Post | Most recent post date |
| K | Engagement | Calculated (likes+comments)/followers |
| L | Hashtags | Hashtags they use |
| M | Bio | Full bio |
| N | Status | Open/Closed/Pending |
| O | Notes | Manual notes |

### Vendors Sheet

Other wedding services (partnership opportunities).

**Columns (Row 1 empty, Row 2 headers):**

| # | Column | Source |
|---|--------|--------|
| A | No | Auto-number |
| B | Vendor | Display name |
| C | Profile | Instagram URL |
| D | Username | @username |
| E | Category | Detected (Fotografer/Catering/etc) |
| F | Location | City from bio |
| G | Province | From Setting |
| H | Followers | Follower count |
| I | Following | Following count |
| J | Posts | Total posts |
| K | Last Post | Most recent post date |
| L | Engagement | Calculated |
| M | Hashtags | Hashtags they use |
| N | Bio | Full bio |
| O | Status | Open/Closed/Pending |
| P | Notes | Manual notes |

## Detection Logic

### Competitor Detection (MUA/Makeup)

Account dengan keyword berikut di bio → **Competitors sheet**

```javascript
const COMPETITOR_KEYWORDS = [
  'mua', 'makeup', 'rias', 'riasd', 'bridalmakeup',
  'hairstylist', 'hairdo'
];
```

### Vendor Detection (Other Wedding Services)

Account dengan keyword berikut di bio → **Vendors sheet**

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
- Comment mengandung wedding-related keywords (optional)
- Exclude patterns: `Tags, Like, Follow, jawab, jawaban`

## Instagram Cookies Setup

### How to Get Cookies

1. Open Instagram in browser (logged in as Raisha)
2. Open DevTools (F12)
3. Go to Application > Cookies > instagram.com
4. Export all cookies as JSON
5. Copy to `cookies` array in scanner

### Required Cookies

| Cookie | Purpose |
|--------|---------|
| sessionid | Main session |
| csrftoken | CSRF protection |
| datr | Facebook datr |
| mid | Machine ID |
| ig_did | Device ID |
| ps_n/ps_l | Login state |
| ds_user_id | User ID |

## Scraping Method

### Phase 1: Hashtag Exploration
1. Navigate to hashtag page
2. Wait for content load
3. Scroll to load more posts
4. Extract post links

### Phase 2: Post Analysis
- Post author
- Caption + hashtags
- Date posted
- Commenters + texts

### Phase 3: Profile Scraping
- Bio text
- Location
- Followers/Following/Posts
- Recent posts for hashtag extraction

### Phase 4: Classification
- Check bio against keywords
- Route to appropriate sheet

## Files

```
instagram-scrape/
├── scanner.js
├── test-sheets.js
├── setup-client-sheet.js
├── setup-vendor-sheet.js
├── setup-competitor-sheet.js
├── cleanup-sheets.js
├── package.json
└── node_modules/
```

## Running the Scanner

```bash
cd C:\Users\Devata\Documents\GitHub\instagram-scrape
node scanner.js
```

## Limitations

### Cannot Get
- ❌ Who viewed profile
- ❌ Who liked post
- ❌ Who saved post
- ❌ Private account details (unless following)

### Can Get
- ✅ Public post data
- ✅ Public profile info
- ✅ Comments (public posts)
- ✅ Hashtags used

## Update Log

- 2026-07-07: Initial setup with Google Sheets integration
- Added Competitors/Vendors/Clients detection
- Service Account authentication working
- Complete sheet structures defined (Clients, Competitors, Vendors)
- Row 1 = empty, Row 2 = headers convention established
