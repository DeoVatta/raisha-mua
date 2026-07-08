# Instagram Prospector - Raisha MUA

Automated Instagram prospecting using Playwright + Instagram GraphQL (no instagrapi npm).

## Pipeline Architecture

**Sequential per-hashtag with real-time append write.** Every piece of data found is written to sheets immediately — no batch buffering.

```
1 RUN = 1 hashtag (scanned via G column "Executed" status)

Phase 1:     Scrape hashtag → collect all post URLs
Phase 2:     Loop posts sequentially (index 0 → N)
              ├─ Enrich post (oEmbed → browser fallback)
              ├─ Indonesian filter (caption + hashtags)
              ├─ Extract hashtags → append to VendorHashtags immediately
              ├─ Enrich profile → classify (competitor/vendor/client)
              ├─ Append to correct sheet immediately
              ├─ Collect @mentions + collabs into queue
              └─ Every 20 posts: re-login to refresh session

Phase 7:     Collect last 20 posts from Phase 1
Phase 8:     Loop last 20 posts: extract comments (GraphQL) → filter clients → append immediately

Phase 9:     Collab/mention queue (depth ≤ MAX_COLLAB_DEPTH = 2)
              └─ Loop queue: enrich → classify → append → collect more mentions
              └─ Every 20 discovery profiles: re-login

Phase 11:    Mark hashtag "Executed" in G column
```

## Google Sheets Append Mechanism

**Append API with INSERT_ROWS.** Google Sheets finds the first empty row and inserts a new row there — no row tracking, no grid limits, gaps are filled automatically.

```
Row 1 = empty (buffer)
Row 2 = header
Row 3+ = data (appended, gaps filled automatically)
```

- `sheetsAppend(sheetName, endCol, values)` — wraps Sheets append API with `insertDataOption: INSERT_ROWS`
- Column A (No) is empty string — Sheets auto-numbers via formula
- Mutex per sheet — serializes concurrent writes from any phase
- `persistState()` — called once at end of pipeline (clears stale `last_scanned_index` in Setting!B20)

## Methods Confirmed Working

| Step | Method | Status |
|------|--------|--------|
| Hashtag discovery | Playwright → `/explore/search/keyword/?q=%23hashtag` + scroll + `img[alt]` username | ✅ |
| Username extraction | `img[alt="@username caption #hashtag..."]` inside `a[href="/p/"]` (React SSR) | ✅ |
| Post URLs | Extract `/p/SHORTCODE/` links (up to 50x scroll) | ✅ |
| Post enrichment | oEmbed public API (`/api/oembed/?url=`) | ✅ ~97% success |
| Browser fallback | Playwright → `og:description` regex username extraction | ✅ |
| Profile enrichment | Playwright → `/{username}/` (og:meta + body) | ✅ 50-70% |
| Profile post grid | Playwright → scroll → post URLs (up to 12 per profile) | ✅ |
| **Comment extraction** | **GraphQL → `/graphql/query/?query_hash=bc3296d1ce80a24b1b6e40b1e72903f5`** | ✅ |
| Client discovery | Comment filtering + scoring | ✅ |
| **Hashtag collection** | **Append new hashtags → VendorHashtags** | ✅ |
| **Sheets append** | **sheetsAppend() with INSERT_ROWS** | ✅ verified 2026-07-09 |

## Classification System

**Priority: Competitor (MUA) → Vendor (wedding services) → Client (everyone else)**

| Type | Keywords / Triggers |
|------|--------------------|
| **Competitor** | mua, makeup artist, hairstylist, bridalmakeup, rias pengantin |
| **Vendor** | photographer, fotografer, videografer, catering, venue, dekorasi, gaun, kebaya, mc, organizer, salon, souvenir |
| **Client** | Everyone else (fallback: hashtag-based vendor detection when bio empty) |

## Location Detection

**Scope: Jawa Tengah only.** Accounts outside Jawa Tengah return empty Location.

**Detection priority:**
1. Native location from Instagram JSON-LD schema on profile page
2. Bio text match against 105 Jawa Tengah cities/daerah
3. Alias shortcuts: `smg` → Semarang, `solo`/`sby` → Solo, `slg` → Salatiga, `klt` → Klaten, `pkl` → Pekalongan

**Columns:** Location = specific city, Region = hardcoded "JawaTengah"

## Indonesian Filter

Accounts filtered via `isIndonesian()` before being saved:

1. **City match** — bio/hashtags/location contains Indonesian city name (100+ cities)
2. **Word match** — bio contains: menikah, pernikahan, resepsi, +62, wa.me, whatsapp, islamic vocabulary
3. **Phone format** — `+62` or `62XXXXXXXX`

Foreign accounts (USA, India, Pakistan, etc.) are skipped with `[SKIP] @username — not Indonesian`.

## Google Sheets Structure

**Spreadsheet:** `1xljNVmDBRHTVI7kQUCE4ALfc1Fbzue9-kiyHA0lYGwM`

| Sheet | Columns | Write |
|-------|---------|-------|
| Competitors | *(empty)*, Display Name, Profile URL, Username, Location, Region, Followers, Following, Posts, Avg Likes, Engagement Rate, Hashtags, Bio, Status, Collabs, Date | append |
| Vendor | *(empty)*, Display Name, Profile URL, Username, Category, Location, Region, Followers, Following, Posts, Avg Likes, Engagement Rate, Hashtags, Bio, Status, Collabs, Date | append |
| Client | *(empty)*, Profile URL, Username, Via, Source, Comment Text, Location, Date Comment | append |
| VendorHashtags | *(empty)*, Hashtag, Source, Count, Date Added, Status, **G column** | append |
| Setting | Setting sheet — clears `Setting!B20` stale index at end of run | update |

### G Column (Status2) in VendorHashtags

Tracks real-time pipeline execution:

| Value | Meaning |
|-------|---------|
| *(empty)* | Hashtag not yet processed |
| `Executing` | Pipeline currently processing this hashtag |
| `Executed 2026-07-09 14:32` | Finished successfully with timestamp |
| `Failed 2026-07-09 14:35` | Pipeline crashed/aborted while processing |

**Hashtag routing:** `findNextHashtagIndex()` scans G column for last `Executed` row → next run starts at the next OK/NEW hashtag. Set G to empty to restart from beginning.

## Directory Structure

```
instagram/
├── index.js                 # Main pipeline (sequential per hashtag)
├── package.json
├── instagram-cookies.json   # Session cookies (sameSite: Strict/Lax/None)
├── gcp-service-account.json # GCP service account for Sheets API
├── .env                     # Optional: IG_USERNAME + IG_PASSWORD for auto re-login
└── src/
    ├── config.js            # Limits, paths, sheet ID, safety guards
    ├── scraper.js           # Hashtag scrape, post enrich, GraphQL comments
    ├── enricher.js          # Profile enrichment (bio, collabs, mentions, classification)
    ├── comments.js          # Comment filtering + client scoring
    ├── sheets.js            # Google Sheets append + mutex + G column tracking
    ├── classifier.js        # Account type classification + Indonesian filter
    └── instagram-auth.js    # Browser session management
```

## Configuration

Edit `src/config.js`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `HASHTAGS_PER_RUN` | 1 | Hashtags scanned per run |
| `POSTS_PER_HASHTAG` | `null` | `null` = no limit (scroll until lazy-load exhausts) |
| `MAX_COLLAB_DEPTH` | 2 | Discovery depth (Phase 9) |
| `MAX_SCROLL_HASHTAG` | 50 | Max scrolls on hashtag search page |
| `REQUEST_DELAY` | 5 | Seconds between API calls |
| `MAX_API_ERRORS_CONSECUTIVE` | 20 | Stop phase after N consecutive errors |
| `PHASE2_TIMEOUT_MIN` | 60 | Phase 2-6 timeout in minutes |
| `PHASE3_TIMEOUT_MIN` | 90 | Phase 9 timeout in minutes |

**Null = unlimited.**

## Safety Guards

| Guard | Phase | Trigger |
|-------|-------|---------|
| `MAX_API_ERRORS_CONSECUTIVE` | 2-6 & 9 | 20 consecutive failed enrichments |
| `PHASE2_TIMEOUT_MIN` | 2-6 | 60 minutes elapsed |
| `PHASE3_TIMEOUT_MIN` | 9 | 90 minutes elapsed |
| Session refresh | 2-6 & 9 | Every 20 posts: re-login via `refreshCookieStr()` |

## Cookie Format

`sameSite` must be `Strict`, `Lax`, or `None` — NOT `no_restriction`.
Get cookies: Browser DevTools → Application → Cookies → instagram.com

## Notes

- Mobile API `/media/{id}/comments/` is BLOCKED — use GraphQL comment endpoint
- Profile page (`/{username}/`) works 50-70% — fallback to hashtag data when profile fails
- Session cookies expire — re-login every 20 posts
- Generic hashtags (`#fyp`, `#instagood`, `#reels`, etc.) filtered automatically
- Foreign accounts automatically skipped by Indonesian filter

## Run

```bash
node index.js
```

## Pipeline Run History

| Run | Hashtag | Competitors | Vendors | Clients | Notes |
|-----|---------|-------------|---------|---------|-------|
| 1 | #prewedding | 0 | 3 | 85 | append verified ✅, 41 posts → 83 clients from comments |
