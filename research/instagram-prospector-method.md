# Instagram Prospector Method - Raisha MUA

## Overview

Automated Instagram prospecting tool for Raisha MUA (Makeup Artist Semarang) using **instagrapi** for full data extraction via Instagram Private API.

## Goals

1. **Competitor Analysis** - MUA/Makeup accounts
2. **Vendor Partnership** - Other wedding services
3. **Client Prospecting** - Potential customers via hashtags

## Pipeline Architecture

```
START
  │
  ├─→ Read existing profiles → visited Set
  ├─→ Read hashtags (Status=OK)
  ├─→ Read last_scanned_index from Setting
  └─→ Read existing counts
  │
  ▼
PHASE 1: HASHTAG SCANNING
  │
  ├─→ Select 3 hashtags (index-based rotation)
  ├─→ For each hashtag:
  │     ├─→ Scrape latest posts via instagrapi
  │     ├─→ Collect UNIQUE authors (10 per hashtag)
  │     ├─→ Skip duplicates, continue counting
  │     └─→ Add to profile queue
  │
  ▼
PHASE 2: PROFILE PROCESSING
  │
  ├─→ Process queue (max 30 profiles)
  ├─→ instagrapi.full_profile_data:
  │     ├─→ Username, Display Name, Bio
  │     ├─→ Followers, Following, Posts count
  │     ├─→ 20 posts with engagement
  │     ├─→ Collect hashtags
  │     └─→ Collect collabs (tagged users)
  ├─→ Classify: Competitor/Vendor/Client
  ├─→ WRITE IMMEDIATELY to sheet
  ├─→ Queue collabs (depth < 4)
  └─→ Delay 5 seconds between requests
  │
  ▼
PHASE 3: COLLAB DISCOVERY
  │
  ├─→ Process collab queue
  ├─→ Same processing as Phase 2
  └─→ Max depth 4
  │
  ▼
UPDATE SETTING SHEET
  ├─→ last_scanned_index += 3
  └─→ Save all state
```

## Configuration

### Google Sheets Structure

**Spreadsheet ID**: `1xljNVmDBRHTVI7kQUCE4ALfc1Fbzue9-kiyHA0lYGwM`

#### Setting Sheet
| Key | Value |
|-----|-------|
| last_scanned_index | Current hashtag rotation index |
| hashtags_total | Total approved hashtags count |
| profiles_scanned | Running total profiles scanned |

#### VendorHashtags Sheet
| Column | Description |
|--------|-------------|
| A | No |
| B | Hashtag (e.g., muasemarang) |
| C | Source Vendor |
| D | Times Found |
| E | Last Found |
| F | Status (OK/NO/blank) |
| G | Notes |

#### Competitors Sheet
| Column | Description |
|--------|-------------|
| A | No |
| B | Display Name |
| C | Profile URL |
| D | Username |
| E | Location |
| F | Region |
| G | Followers |
| H | Following |
| I | Posts |
| J | Last Post |
| K | Engagement Rate |
| L | Hashtags |
| M | Bio |
| N | Status |
| O | Collabs |
| P | Last Updated |

#### Vendor Sheet
Same as Competitors + Column E = Category

#### Client Sheet
| Column | Description |
|--------|-------------|
| A | No |
| B | Profile URL |
| C | Username |
| D | Display Name |
| E | Bio |
| F | Followers |
| G | Following |
| H | Status |
| I | Hashtags |
| J | Engagement Rate |
| K | Avg Likes |
| L | Avg Comments |
| M | Collabs |
| N | Last Updated |

### Classification Rules

**Competitor** (bio contains):
- mua, makeup, rias, riasd, bridalmakeup, hairstylist, hairdo, makeup artist

**Vendor** (bio contains):
- fotografer, fotography, foto, videografer, videografi, catering, katering
- dekorasi, dekor, gaun, kebaya, bouquet, venue, gedung, ballroom
- organizer, planner, mc, seserahan, salon, beauty, nails, lash, undangan, invitation

**Client**: Any other account found through hashtags

**Location** (detected from bio):
- semarang, salatiga, solo, surakarta, boja, kendal, ungaran, pekalongan

## Features

### Fair Hashtag Rotation
- Index-based selection (no hashtag left behind)
- 3 hashtags per run
- 10 unique profiles per hashtag
- Skip duplicates but continue counting

### Full Data Extraction (instagrapi)
- Username, Display Name, Bio
- Followers, Following, Posts count
- Engagement: avg likes/comments from 20 posts
- Engagement Rate: (avg_likes + avg_comments) / followers * 100
- Hashtags used in posts
- Collab profiles (tagged users)

### No Data Loss
- Write immediately to sheets (no buffering)
- Don't wipe existing data
- Continue appending from last position
- Visited profile tracking (prevents duplicates)

### Limits & Safety
- Max 30 profiles per run
- Max collab depth 4
- 5 second delay between requests
- No duplicate profiles across all sheets

## Setup

### 1. Install Python Dependencies
```bash
cd C:\Users\Devata\Documents\GitHub\raisha-mua\research
pip install -r requirements.txt
```

### 2. Set Environment Variables
```bash
# Windows
set IG_USERNAME=raisha_makeup
set IG_PASSWORD=your_password

# Or create .env file
IG_USERNAME=raisha_makeup
IG_PASSWORD=your_password
```

### 3. Configure Google Service Account
Place service account JSON at:
```
C:\Users\Devata\Documents\GitHub\keys\google-service-account.json
```

### 4. Run
```bash
python profiler.py
```

## Files

```
raisha-mua/research/
├── profiler.py              # Main Python scanner (instagrapi)
├── vendor-scanner.js        # Legacy Playwright scanner
├── requirements.txt         # Python dependencies
├── package.json             # Node.js (legacy)
├── instagram-prospector-method.md  # This file
└── google-sheets/
```

## Data Extracted Per Profile

Each profile written includes:
- Username, Display Name, Bio
- Followers, Following, Posts count
- Profile URL
- Location (detected from bio)
- Account type (Competitor/Vendor/Client)
- Category (MUA/Fotografer/Catering/etc)
- **Engagement Rate**: (avg_likes + avg_comments) / followers * 100
- **Avg Likes**: Average likes across last 20 posts
- **Avg Comments**: Average comments across last 20 posts
- **Hashtags**: Up to 20 hashtags from posts
- **Collabs**: Up to 10 tagged users in posts
- Timestamp

## Update Log

- 2026-07-07: New pipeline using instagrapi for full engagement data extraction
  - Python implementation (instagrapi library)
  - 20 posts analyzed per profile for engagement metrics
  - Collab detection from tagged users
  - Index-based hashtag rotation (fair scanning)
  - Write immediately pattern (no data loss)
  - Max 30 profiles, 5s delay, max depth 4
