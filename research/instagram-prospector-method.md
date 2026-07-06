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
│  ┌─────────┐ ┌──────────────┐ ┌─────────┐ ┌───────────┐ │
│  │ Setting │ │VendorHashtags│ │  Compet │ │ Vendors   │ │
│  │ (Config)│ │ (Hashtags)   │ │  (MUA)  │ │(Services) │ │
│  └─────────┘ └──────────────┘ └─────────┘ └───────────┘ │
│  ┌───────────┐                                                │
│  │ Clients  │                                                │
│  │(Prospects)                                                │
│  └───────────┘                                                │
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

### Service Account

**Service Account Email:**
```
claude@cogent-range-458804-r9.iam.gserviceaccount.com
```

**Spreadsheet ID:** `1xljNVmDBRHTVI7kQUCE4ALfc1Fbzue9-kiyHA0lYGwM`

## Spreadsheet Structure

All data sheets: **Row 1 = empty, Row 2 = headers, Row 3+ = data**

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

### VendorHashtags Sheet

Hashtags yang ditemukan dari vendor captions. User review dan set Status OK/NO untuk filter next scan.

| Column | Description |
|--------|-------------|
| No | Auto-number |
| Hashtag | Hashtag yang ditemukan |
| Source Vendor | Vendor yang pakai hashtag ini |
| Times Found | Berapa kali ditemukan |
| Last Found | Tanggal terakhir ditemukan |
| **Status** | **OK** (useful) / **NO** (not useful) / blank (belum review) |
| Notes | Catatan manual |

**Status Values:**
- `OK` = hashtag useful, scan next time
- `NO` = hashtag not useful, skip
- blank = belum di-review

### Clients Sheet

Potential customers (people who commented on posts, not vendors).

| Column | Source |
|--------|--------|
| Profile | Instagram URL |
| Username | Extracted from URL |
| Source | Post URL where commented |
| Comment | Comment text |
| Date | Comment date |
| Location | From bio (if available) |
| Private | Yes/No |
| Followers | Follower count |
| Bio | Full bio text |
| Status | Potential Client / Contacted / etc |
| Notes | Manual notes |

### Competitors Sheet

MUA/Makeup accounts (direct competitors).

| Column | Description |
|--------|-------------|
| No | Auto-number |
| MUA | Display name from bio |
| Profile | Instagram URL |
| Username | @username |
| Location | City from bio |
| Province | From Setting |
| Followers | Follower count |
| Following | Following count |
| Posts | Total posts |
| Last Post | Most recent post date |
| Engagement | Calculated |
| Hashtags | Hashtags they use |
| Bio | Full bio |
| Status | Open/Closed/Pending |
| Notes | Manual notes |

### Vendors Sheet

Other wedding services (partnership opportunities).

| Column | Description |
|--------|-------------|
| No | Auto-number |
| Vendor | Display name |
| Profile | Instagram URL |
| Username | @username |
| Category | Detected (Fotografer/Catering/etc) |
| Location | City from bio |
| Province | From Setting |
| Followers | Follower count |
| Following | Following count |
| Posts | Total posts |
| Last Post | Most recent post date |
| Engagement | Calculated |
| Hashtags | Hashtags they use |
| Bio | Full bio |
| Status | Open/Closed/Pending |
| Notes | Manual notes |

## Scraping Flow

### Vendor Scan Flow

```
HASHTAGS (VendorHashtags with Status=OK)
        │
        ▼
┌───────────────────────────────────────┐
│ SCRAPE POSTS from hashtag               │
│ Extract: post links + authors          │
└────────────────────┬──────────────────┘
                     │
                     ▼
┌───────────────────────────────────────┐
│ VISIT POST AUTHOR PROFILE              │
│ Extract: bio, location, followers      │
└────────────────────┬──────────────────┘
                     │
                     ▼
┌───────────────────────────────────────┐
│ CHECK AREA + KEYWORDS                 │
│                                         │
│ • Bio contains vendor keywords?         │
│ • Location in province/city?            │
│ • YA → SAVE VENDOR                    │
│ • TIDAK → skip                        │
└────────────────────┬──────────────────┘
                     │
                     ▼
┌───────────────────────────────────────┐
│ EXTRACT HASHTAGS FROM CAPTION          │
│ Add/Update to VendorHashtags sheet    │
│ (User reviews Status OK/NO later)     │
└───────────────────────────────────────┘
```

### Notes
- Vendor scan does NOT include client/comment extraction
- Only extract: post authors, bios, locations, hashtags
- Area filter: province + city must match Setting

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

## Files

```
instagram-scrape/
├── scanner.js                    # Main scraper
├── test-sheets.js               # Test Sheets connection
├── setup-client-sheet.js       # Setup Client headers
├── setup-vendor-sheet.js       # Setup Vendor headers
├── setup-competitor-sheet.js    # Setup Competitor headers
├── create-vendor-hashtags-sheet.js  # Create VendorHashtags
├── populate-initial-hashtags.js  # Populate initial hashtags
├── cleanup-sheets.js            # Clean all sheets
└── package.json
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
- Complete sheet structures defined
- Added VendorHashtags sheet with Status OK/NO for manual filtering
- Vendor scan flow documented (separate from client scan)
- Initial hashtags populated from Setting
