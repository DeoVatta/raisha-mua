# Raisha MUA

Website portfolio for Raisha Makeup Artist (MUA) Semarang.

## Instagram Prospector

Automated prospecting tool untuk menemukan:
- **Competitors** - MUA/Makeup accounts
- **Vendors** - Other wedding services
- **Clients** - Potential customers from comment engagement

### Architecture

```
Instagram → Playwright Scraper → Google Sheets
                                 ├── Setting (config)
                                 ├── VendorHashtags (hashtags OK/NO filter)
                                 ├── Competitors (MUA accounts)
                                 ├── Vendors (wedding services)
                                 └── Clients (prospects)
```

### Spreadsheet

**ID:** `1xljNVmDBRHTVI7kQUCE4ALfc1Fbzue9-kiyHA0lYGwM`

**Sheets:**
| Sheet | Purpose |
|-------|---------|
| Setting | Config: province, city, hashtags, limits, keywords |
| VendorHashtags | Hashtags from vendors with OK/NO filter |
| Competitors | MUA/Makeup accounts |
| Vendors | Other wedding services |
| Clients | Potential customers |

### How It Works

1. **Vendor Scan** (current phase)
   - Read hashtags from `VendorHashtags` (Status=OK only)
   - Scrape posts from each hashtag
   - Visit post authors → extract bio, location
   - Detect vendor keywords in bio → save to `Vendors`
   - Extract hashtags from captions → update `VendorHashtags`

2. **Area Filter**
   - Province: JawaTengah
   - Cities: Semarang, Salatiga, Solo, Boja

3. **Detection**
   - Competitor: bio contains `mua`, `makeup`, `rias`, `bridalmakeup`
   - Vendor: bio contains `fotografer`, `catering`, `dekorasi`, etc.

### Manual Review Cycle

1. Scanner extracts hashtags from vendor captions
2. Hashtags appear in `VendorHashtags` (Status=blank)
3. User reviews → sets Status to OK or NO
4. Next scan only uses Status=OK hashtags

### Setup

```bash
cd ../instagram-scrape
node scanner.js
```

### Files

```
instagram-scrape/
├── scanner.js                     # Main scraper
├── test-sheets.js               # Test Sheets connection
├── setup-competitor-sheet.js    # Setup Competitor headers
├── setup-vendor-sheet.js        # Setup Vendor headers
├── create-vendor-hashtags-sheet.js  # Create VendorHashtags
├── populate-initial-hashtags.js  # Populate initial hashtags
├── cleanup-sheets.js             # Clean all sheets
└── package.json
```

### Documentation

`research/instagram-prospector-method.md`

## Tech Stack

- HTML/CSS (Website)
- Node.js + Playwright (Scraper)
- Google Sheets API v4 (Data storage)
- Google Service Account (Auth)
