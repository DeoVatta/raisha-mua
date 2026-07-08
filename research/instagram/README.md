# Instagram Prospector - Raisha MUA

Automated Instagram prospecting using Playwright + Instagram GraphQL/API (no instagrapi npm).

## Google Sheets Append Mechanism

**Simple append: write to next empty row, advance counter, persist at end of run.**

```
Row 1 = empty (buffer)
Row 2 = header
Row 3+ = data (appended sequentially)
```

- `nextRow` — in-memory counter for next empty row, protected by mutex per sheet
- `No` column — derived from `nextRow - 2` (always sequential, no separate counter needed)
- Mutex — serializes concurrent Phase 2 + Phase 3 writes to same sheet
- `persistState()` — called once at end of pipeline to save `nextRow` to Setting sheet
- `_loadFromSetting()` — called once at startup to restore `nextRow` from Setting sheet

```
Writing flow:
1. Acquire lock for sheet
2. Get nextRow value
3. Write to that row
4. Increment nextRow
5. Release lock
6. Repeat for next profile

End of run:
- persistState() saves { Competitors: X, Vendor: Y, Client: Z } to Setting!A50:B52
- On next run, _loadFromSetting() restores these values
```

No fresh scan needed (mutex prevents stale cache). No per-write persistence (one persist at end is enough). No separate `No` counter (always derived from `nextRow - 2`).

## Methods Confirmed Working

| Step | Method | Success |
|------|--------|---------|
| Hashtag discovery | Playwright → `/explore/search/keyword/?q=%23hashtag` + scroll + `img[alt]` username extraction | ✅ |
| Username extraction | `img[alt="@username caption #hashtag..."]` inside `a[href="/p/"]` (React client-side rendering) | ✅ |
| Post URLs | Extract `/p/SHORTCODE/` links (up to max scroll 50x) | ✅ |
| Post enrichment | API → `/api/v1/media/{mediaId}/info/` | ✅ 100% |
| Profile enrichment | Playwright → `/{username}/` (og:meta + body) | ✅ |
| Profile post grid | Playwright → scroll → post URLs (up to 12 per profile) | ✅ |
| **Comment extraction** | **GraphQL → `/graphql/query/?query_hash=bc3296d1ce80a24b1b6e40b1e72903f5`** | ✅ |
| Client discovery | Comment filtering + scoring (MUA excluded) | ✅ |
| **Hashtag collection** | **Write new hashtags → VendorHashtags sheet** | ✅ |
| **Scroll lazy-load** | **Hashtag search scrolls up to 50x (configurable)** | ✅ |
| Sheets append | Mutex + in-memory nextRow + persist at end of run | ✅ |

## Classification System

**Priority: Competitor (MUA) → Vendor (wedding services) → Client (everyone else)**

| Type | Keywords / Triggers |
|------|--------------------|
| **Competitor** | mua, makeup artist, hairstylist, bridalmakeup, rias pengantin, hairmakeup |
| **Vendor** | photographer, fotografer, videografer, catering, venue, dekorasi, gaun, kebaya, mc, organizer, salon, souvenir |
| **Client** | Everyone else (also: fallback when bio empty + hashtag-based vendor detection) |

> Photographer/fotografer → **Vendor** (PHOTOGRAPHER category), not Client. Videographer → **Vendor** (VIDEOGRAPHER).

**Hashtag-based fallback:** When bio is empty or type is client, hashtags are scanned for vendor indicators (`#fotografer`, `#catering`, `#venue`, etc.) and type is upgraded accordingly.

## Location Detection

**Scope: Jawa Tengah only.** Accounts outside Jawa Tengah return empty Location (not incorrectly tagged).

**Detection priority:**
1. Native location from Instagram JSON-LD schema (`address.addressLocality`) on profile page
2. Bio text match against 105 Jawa Tengah cities/daerah
3. Alias shortcuts: `smg`/`smgku` → Semarang, `solo`/`sby`/`surakarta` → Solo, `slg`/`slt` → Salatiga, `klt`/`kltn` → Klaten, `pkl` → Pekalongan, `jateng` → JawaTengah

**Columns:** Location = specific city (e.g. "Semarang"), Region = hardcoded "JawaTengah"

## Indonesian Filter

Accounts are filtered via `isIndonesian()` in `classifier.js` before being saved. An account must show Indonesian indicators:

1. **City match** — bio/hashtags/location contains Indonesian city name (100+ cities)
2. **Word match** — bio contains: menikah, pernikahan, resepsi, +62, wa.me, whatsapp, islamic vocabulary
3. **Phone format** — `+62` or `62XXXXXXXX`

Foreign accounts (USA, India, Pakistan, etc.) are skipped with `[SKIP] @username — not Indonesian`.

## Google Sheets Structure

**Spreadsheet:** `1xljNVmDBRHTVI7kQUCE4ALfc1Fbzue9-kiyHA0lYGwM`

| Sheet | Columns | Append Row |
|-------|---------|------------|
| Competitors | No, Display Name, Profile URL, Username, Location, Region, Followers, Following, Posts, Avg Likes, Engagement Rate, Hashtags, Bio, Status, Collabs, Date | nextRow.Competitors |
| Vendor | No, Display Name, Profile URL, Username, Category, Location, Region, Followers, Following, Posts, Avg Likes, Engagement Rate, Hashtags, Bio, Status, Collabs, Date | nextRow.Vendor |
| Client | No, Profile URL, Username, Via, Source, Comment Text, Location, Date Comment | nextRow.Client |
| VendorHashtags | (empty), Hashtag, Source, Count, Date Added, Status | nextRow.VendorHashtags |
| Setting | `nextrow_competitors` (row 50), `nextrow_vendor` (row 51), `nextrow_client` (row 52), `nextrow_vendorhashtags` (row 53) | Persisted at end of run |

## Pipeline Flow

```
1x RUN (1 hashtag × unlimited scroll)

├─ PHASE 1: Hashtag Scrape + Post Enrichment
│   → Playwright: scroll hashtag search page (lazy-load, up to 50 scrolls)
│   → API: enrich each post (username, likes, comments, caption, hashtags, @mentions)
│
├─ PHASE 2: Profile Enrichment + Classification (unlimited)
│   → Playwright: extract bio, followers, following, posts, category, WA link
│   → Playwright: scrape profile post grid (scroll) for collab discovery
│   → Classify: competitor / vendor / client → save to correct sheet
│   → Write new hashtags → VendorHashtags sheet
│   → Safety: error threshold (20), phase timeout (60 min)
│
├─ PHASE 3: Discovery (collab + mention deep dive, depth=2)
│   → Queue collabs + mentions from posts
│   → Enrich discovered profiles (depth ≤ 2)
│   → Classify each → save to correct sheet
│   → Write new hashtags → VendorHashtags sheet
│   → Safety: error threshold (20), new-profile threshold (10), timeout (90 min), session check every 50
│
├─ PHASE 4: Comment Extraction → Client Discovery
│   → GraphQL: fetch ALL comments per post (with pagination)
│   → Filter: exclude post author + MUA accounts
│   → Score: location keywords, booking keywords, engagement quality
│   → Save top scorers to Client sheet
│
├─ persistState() — save nextRow to Setting sheet
└─ Summary report
```

## Directory Structure

```
instagram/
├── index.js                 # Main pipeline
├── package.json
├── instagram-cookies.json   # Session cookies (sameSite: Strict/Lax/None)
├── gcp-service-account.json # GCP service account for Sheets API
├── .env                     # Optional: IG_USERNAME + IG_PASSWORD for auto re-login
└── src/
    ├── config.js            # Limits, paths, sheet ID, safety guards
    ├── scraper.js           # Hashtag scrape, post enrich, profile, GraphQL comments
    ├── enricher.js          # Profile enrichment (bio, collabs, mentions, classification)
    ├── comments.js          # Comment filtering + client scoring
    ├── sheets.js            # Google Sheets read/write + append mechanism
    ├── classifier.js        # Account type classification + Indonesian filter
    └── instagram-auth.js    # Browser session management
```

## Configuration

Edit `src/config.js`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `HASHTAGS_PER_RUN` | 1 | Hashtags scanned per run |
| `POSTS_PER_HASHTAG` | `null` | `null` = no limit (scroll until lazy-load exhausts) |
| `PROFILES_PER_HASHTAG` | `null` | `null` = no limit (all usernames from hashtag) |
| `MAX_PROFILES_PER_RUN` | `null` | `null` = no limit (all Phase 2 profiles) |
| `MAX_DISCOVERY_PROFILES` | `null` | `null` = unlimited Phase 3 (guarded by safety) |
| `MAX_COLLAB_DEPTH` | 2 | Discovery depth (Phase 3) |
| `MAX_SCROLL_HASHTAG` | 50 | Max scrolls on hashtag search page |
| `REQUEST_DELAY` | 5 | Seconds between API calls |
| `NAVIGATE_DELAY` | 2000 | ms wait after page navigation |
| `MAX_API_ERRORS_CONSECUTIVE` | 20 | Stop phase after N consecutive API errors |
| `MAX_NEW_PROFILE_THRESHOLD` | 10 | Stop Phase 3 if N consecutive queue sweeps with no new profiles |
| `PHASE2_TIMEOUT_MIN` | 60 | Phase 2 timeout in minutes |
| `PHASE3_TIMEOUT_MIN` | 90 | Phase 3 timeout in minutes |
| `SESSION_CHECK_EVERY` | 50 | Verify session cookies every N enrichments |

**Null = unlimited:** Set any limit to `null` to disable that specific cap.

## Safety Guards

Pipeline automatically stops under these conditions:

| Guard | Phase | Trigger |
|-------|-------|---------|
| `MAX_API_ERRORS_CONSECUTIVE` | 2 & 3 | 20 consecutive failed enrichments (rate limit / session expired) |
| `MAX_NEW_PROFILE_THRESHOLD` | 3 | 10 consecutive queue sweeps with no new unique profiles |
| `PHASE2_TIMEOUT_MIN` | 2 | 60 minutes elapsed |
| `PHASE3_TIMEOUT_MIN` | 3 | 90 minutes elapsed |
| `SESSION_CHECK_EVERY` | 3 | Every 50 profiles, cookies are verified; re-login if needed |

## Cookie Format

`sameSite` must be `Strict`, `Lax`, or `None` — NOT `no_restriction`.
Get cookies: Browser DevTools → Application → Cookies → instagram.com

## Notes

- Mobile API `/media/{id}/comments/` is BLOCKED from browser sessions — use GraphQL instead
- Profile page (`/{username}/`) works 50-70% of the time — fallback to hashtag data
- DNS errors (`EAI_AGAIN`) are transient — igFetch auto-retries once after 3s
- Session cookies expire — re-login if 401/403 errors appear
- Generic hashtags (`#fyp`, `#instagood`, `#reels`, etc.) are filtered automatically
- Foreign accounts are automatically skipped by Indonesian filter

## Performance

Pipeline uses **parallel batch processing**:

| Operation | Concurrency | Batch Delay |
|-----------|-------------|-------------|
| Post enrichment (API) | 5 concurrent | 2s |
| Profile enrichment | 2 concurrent | 3s |
| Comment extraction | 3 concurrent | 3s |

Estimated run time: **30-120 minutes** (depending on hashtag popularity and Phase 3 discovery scope).

## Sheets Append Mechanism (Developer Notes)

### Why not fresh scan per write?

Because Phase 2 and Phase 3 run concurrently. If both scan independently before writing, they might both see the same last row and write to the same cell. The **mutex** solves this by ensuring writes are serialized — only one write happens at a time per sheet, so the in-memory counter is always accurate.

### Why not persist per write?

Because the mutex already guarantees no race condition. Persisting every write adds API overhead and is unnecessary — if the pipeline crashes mid-run, the worst case is a small number of duplicate entries (caught by `existingUsernames` Set), which is acceptable.

### Why derive No from nextRow - 2?

Because `nextRow` always points to the next empty row. The first data row is row 3, which should be `No=1`. So `No = nextRow - 2`. This is always sequential regardless of gaps.

### Why rows 50-53 for Setting persistence?

Rows 50-53 are fixed positions far from other data, unlikely to be overwritten by normal use of the Setting sheet.
