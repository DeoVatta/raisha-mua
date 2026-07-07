# Instagram Prospector - Raisha MUA

Automated Instagram prospecting using Playwright + Instagram GraphQL/API (no instagrapi npm).

## Methods Confirmed Working

| Step | Method | Success |
|------|--------|---------|
| Hashtag discovery | Playwright → `/explore/search/keyword/?q=%23hashtag` + scroll | ✅ |
| Post URLs | Extract `/p/SHORTCODE/` links (up to 50 per hashtag) | ✅ |
| Post enrichment | API → `/api/v1/media/{mediaId}/info/` | ✅ 100% |
| Profile enrichment | Playwright → `/{username}/` (og:meta + body) | ✅ |
| Profile post grid | Playwright → scroll → post URLs (up to 12 per profile) | ✅ |
| **Comment extraction** | **GraphQL → `/graphql/query/?query_hash=bc3296d1ce80a24b1b6e40b1e72903f5`** | ✅ |
| Client discovery | Comment filtering + scoring (MUA excluded) | ✅ |
| **Hashtag collection** | **Write new hashtags → VendorHashtags sheet** | ✅ |
| **Scroll lazy-load** | **Hashtag search scrolls up to 10x to load ~50 posts** | ✅ |
| Write to Sheets | Google Sheets API v4 | ✅ |

## Pipeline Flow

```
1x RUN (2 hashtags × ~50 posts with scroll)

├─ PHASE 1: Hashtag Scrape + Post Enrichment
│   → Playwright: scroll hashtag search page (lazy-load, up to 50 posts)
│   → API: enrich each post (username, likes, comments, caption, hashtags, @mentions)
│
├─ PHASE 2: Profile Enrichment + Classification
│   → Playwright: extract bio, followers, following, posts, category, WA link
│   → Playwright: scrape profile post grid (scroll) for collab discovery
│   → Classify: competitor / vendor / client
│   → Write new hashtags → VendorHashtags sheet (Hashtag | Category | Status | Source | Date)
│
├─ PHASE 3: Discovery (collab + mention deep dive)
│   → Queue collabs + mentions from posts
│   → Enrich discovered profiles (depth ≤ 4, up to 30 profiles)
│   → Classify each: competitor / vendor / client → save to correct sheet
│   → Write new hashtags → VendorHashtags sheet
│
├─ PHASE 4: Comment Extraction → Client Discovery
│   → GraphQL: fetch ALL comments per post (with pagination)
│   → Filter: exclude post author + MUA accounts
│   → Score: location keywords, booking keywords, engagement quality
│   → Save top scorers to Client sheet
│
└─ WRITE: Immediate to Google Sheets (Competitors, Vendor, Client, VendorHashtags)
```

## Directory Structure

```
instagram/
├── index.js                 # Main pipeline
├── package.json
├── instagram-cookies.json   # Session cookies (sameSite: Strict/Lax/None)
├── gcp-service-account.json # GCP service account for Sheets API
├── src/
│   ├── config.js            # Limits, paths, sheet ID
│   ├── scraper.js          # Hashtag scrape (with scroll), post enrich, profile, GraphQL comments
│   ├── enricher.js         # Profile enrichment (bio, collabs, mentions, classification)
│   ├── comments.js          # Comment filtering + client scoring
│   ├── sheets.js            # Google Sheets read/write + hashtag collection
│   └── classifier.js        # Account type classification
└── README.md
```

## Setup

```bash
cd research/instagram
npm install
```

## Run

```bash
node index.js
```

## Requirements

- `instagram-cookies.json` — Session cookies from logged-in browser
  - `sameSite` must be `Strict`, `Lax`, or `None` — NOT `no_restriction`
  - Get cookies from browser DevTools → Application → Cookies → instagram.com
- `gcp-service-account.json` — GCP service account for Sheets API

## Configuration

Edit `src/config.js`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `HASHTAGS_PER_RUN` | 2 | Hashtags scanned per run |
| `MAX_PHASE2_PROFILES` | 20 | Max profiles in Phase 2 |
| `MAX_DISCOVERY_PROFILES` | 30 | Max profiles in Phase 3 (separate budget) |
| `MAX_COLLAB_DEPTH` | 4 | Discovery depth |
| `REQUEST_DELAY` | 5 | Seconds between API calls |

## Google Sheets

Spreadsheet: `1xljNVmDBRHTVI7kQUCE4ALfc1Fbzue9-kiyHA0lYGwM`

| Sheet | Data | Header Row |
|-------|------|------------|
| Setting | last_scanned_index, hashtags | - |
| VendorHashtags | Hashtags (Hashtag, Category, Status=OK, Source Username, Date Added) | Row 2 |
| Competitors | MUA/Makeup accounts | Row 2 |
| Vendor | Wedding service accounts | Row 2 |
| Client | Potential clients from comments (8 columns) | Row 2 |

### VendorHashtags Sheet

Every hashtag found from any profile post caption or bio is written here:
- **Hashtag** — clean hashtag text (no #)
- **Category** — auto-detected: Location / Wedding / Graduation / Party / Hair / Beauty / MUA / General
- **Status** — always `OK`
- **Source Username** — which profile discovered this hashtag
- **Date Added** — ISO date

### Client Sheet Columns

`No | Profile URL | Username | Via | Source | Comment Text | Location | Date Comment`

## Key Methods

**Shortcode → Media ID:**
```javascript
function decodeShortcode(shortcode) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let n = 0n;
  for (const c of shortcode) n = n * 64n + BigInt(a.indexOf(c));
  return n.toString();
}
```

**Post Enrichment (Mobile API):**
```
GET https://i.instagram.com/api/v1/media/{mediaId}/info/
Headers: Cookie, X-CSRFToken, X-IG-App-ID: 936619743392459
```

**Comment Extraction (GraphQL — confirmed working):**
```
GET https://www.instagram.com/graphql/query/?query_hash=bc3296d1ce80a24b1b6e40b1e72903f5&variables={shortcode,first:50,after}
Headers: Cookie, X-CSRFToken, X-IG-App-ID: 936619743392459
```

Returns: `data.shortcode_media.edge_media_to_parent_comment.edges[].node`
- `text`, `user.username`, `created_at`, `edge_liked_by.count`, `edge_threaded_comments.count`

## Client Scoring

Comments scored on:
- **+4**: Booking/price/availability keywords (harga, booking, DM, WA, etc.)
- **+3**: Location keywords (semarang, solo, jogja, jateng, etc.)
- **+1-2**: Long comment (genuine engagement)
- **-5**: MUA keywords in comment (another MUA, not a client)
- **-3**: Suspicious keywords (dropship, reseller, promo, etc.)

Filtered out:
- Post author
- MUA-like usernames (contains `mua`, `makeup`, `rias`, `hair`, `bridal`)
- Brand-like usernames (`official`, `studio`, `by_`, `the_`)

## Cookie Format

`sameSite` must be `Strict`, `Lax`, or `None` — NOT `no_restriction`.
Get cookies: Browser DevTools → Application → Cookies → instagram.com

## Notes

- Mobile API `/media/{id}/comments/` is BLOCKED from browser sessions — use GraphQL instead
- Profile page (`/{username}/`) works 50-70% of the time — fallback to hashtag data
- DNS errors (`EAI_AGAIN`) are transient — igFetch auto-retries once after 3s
- Session cookies expire — re-login if 401/403 errors appear
- Phase 3 has its own budget (`MAX_DISCOVERY_PROFILES=30`) separate from Phase 2 — vendors and clients discovered via collab/mention paths are saved to their correct sheets
- Hashtag search uses scroll lazy-load (up to 50 posts, 10 scrolls max) — more posts = better discovery coverage

## Performance

Pipeline uses **parallel batch processing** for speed:

| Operation | Concurrency | Batch Delay |
|-----------|-------------|-------------|
| Post enrichment (API) | 5 concurrent | 2s |
| Profile enrichment | 2 concurrent | 3s |
| Comment extraction | 3 concurrent | 3s |

Estimated run time: **10–20 minutes** (vs hours with sequential processing).

Generic hashtags (`#fyp`, `#instagood`, `#reels`, etc.) are filtered automatically and not written to VendorHashtags.
