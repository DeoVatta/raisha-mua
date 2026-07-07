"""
Instagram Prospector - Full Pipeline
Uses instagrapi (Python) for Instagram Private API access
"""
import os
import sys
import re
import json
import time
from datetime import datetime

# Fix Windows UTF-8 output
if sys.platform == 'win32':
    os.system('chcp 65001 >nul 2>&1')
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

from instagrapi import Client
from instagrapi.exceptions import (
    LoginRequired, PrivateAccount, ClientError,
    BadCredentials, ChallengeError, FeedbackRequired, RateLimitError
)
from google.oauth2 import service_account
from googleapiclient.discovery import build

# ============== CONFIGURATION ==============
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), 'gcp-service-account.json')
COOKIES_FILE = os.path.join(os.path.dirname(__file__), 'instagram-cookies.json')
SHEETS_ID = '1xljNVmDBRHTVI7kQUCE4ALfc1Fbzue9-kiyHA0lYGwM'

IG_USERNAME = os.environ.get('IG_USERNAME', 'deovatta')
IG_PASSWORD = os.environ.get('IG_PASSWORD', 'DevataHEHE01')

COMPETITOR_KEYWORDS = ['mua', 'makeup', 'rias', 'riasd', 'bridalmakeup', 'hairstylist', 'hairdo', 'makeup artist']
VENDOR_KEYWORDS = ['fotografer', 'fotography', 'foto', 'videografer', 'videografi', 'catering', 'katering',
                   'dekorasi', 'dekor', 'gaun', 'kebaya', 'bouquet', 'venue', 'gedung', 'ballroom',
                   'organizer', 'planner', 'mc', 'seserahan', 'salon', 'beauty', 'nails', 'lash',
                   'undangan', 'invitation']
TARGET_CITIES = ['semarang', 'salatiga', 'solo', 'surakarta', 'boja', 'kendal', 'ungaran', 'pekalongan']

MAX_PROFILES_PER_RUN = 30
MAX_COLLAB_DEPTH = 4
REQUEST_DELAY = 5
PROFILES_PER_HASHTAG = 10
HASHTAGS_PER_RUN = 3
MAX_RETRIES = 3
BACKOFF_BASE = 10

# ============== STATE ==============
class State:
    def __init__(self):
        self.visited_profiles = set()
        self.found_competitors = set()
        self.found_vendors = set()
        self.found_clients = set()
        self.collab_queue = []
        self.profile_queue = []
        self.hashtags = []
        self.last_index = 0
        self.profiles_scraped = 0
        self.new_profiles = 0
        self.errors = 0

state = State()

# ============== UTILS ==============
def safe_retry(func, *args, **kwargs):
    """Retry with exponential backoff for transient errors"""
    for attempt in range(MAX_RETRIES):
        try:
            return func(*args, **kwargs)
        except (ClientError, LoginRequired) as e:
            if attempt < MAX_RETRIES - 1:
                wait = BACKOFF_BASE * (2 ** attempt)
                print(f'      [RETRY] {e}, waiting {wait}s...')
                time.sleep(wait)
            else:
                raise
    return None

# ============== GOOGLE SHEETS ==============
def init_sheets():
    """Initialize Google Sheets API"""
    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=['https://www.googleapis.com/auth/spreadsheets']
    )
    service = build('sheets', 'v4', credentials=credentials)
    print('[OK] Google Sheets connected')
    return service

def get_next_row(sheets, sheet_name):
    """Find the next empty row in a sheet (skip headers)"""
    result = sheets.spreadsheets().values().get(
        spreadsheetId=SHEETS_ID, range=f'{sheet_name}!A:A'
    ).execute()
    rows = result.get('values', [])
    # Row 1 = empty, Row 2 = headers, Row 3+ = data
    # Find first empty row after row 2
    for i in range(2, max(len(rows), 2) + 1):
        if i >= len(rows) or not rows[i-1] or not any(rows[i-1]):
            return i
    return len(rows) + 1

def read_hashtags(sheets):
    """Read approved hashtags from VendorHashtags sheet"""
    result = sheets.spreadsheets().values().get(
        spreadsheetId=SHEETS_ID, range='VendorHashtags!A1:G200'
    ).execute()
    rows = result.get('values', [])

    hashtags = []
    for row in rows[2:]:
        if len(row) >= 6 and row[1] and row[5] == 'OK':
            hashtags.append(row[1])

    print('[OK] Loaded', len(hashtags), 'approved hashtags')
    return hashtags

def read_visited_profiles(sheets):
    """Load already-visited profiles from all sheets"""
    ranges = ['Competitors!D3:D1000', 'Vendor!D3:D1000', 'Client!C3:C1000']
    for range_name in ranges:
        try:
            result = sheets.spreadsheets().values().get(
                spreadsheetId=SHEETS_ID, range=range_name
            ).execute()
            rows = result.get('values', [])
            for row in rows:
                if row and row[0]:
                    username = row[0].replace('@', '').strip()
                    state.visited_profiles.add(username)
        except Exception:
            pass

    print('[OK] Loaded', len(state.visited_profiles), 'visited profiles')

def read_last_index(sheets):
    """Read last scanned hashtag index from Setting sheet"""
    try:
        result = sheets.spreadsheets().values().get(
            spreadsheetId=SHEETS_ID, range='Setting!A1:Z100'
        ).execute()
        rows = result.get('values', [])
        for row in rows:
            if row and row[0] == 'last_scanned_index' and len(row) > 1:
                state.last_index = int(row[1]) or 0
    except Exception:
        pass

    print(f'[OK] Starting from hashtag index: {state.last_index}')

def update_last_index(sheets, new_index):
    """Save new hashtag index to Setting sheet"""
    try:
        result = sheets.spreadsheets().values().get(
            spreadsheetId=SHEETS_ID, range='Setting!A1:B50'
        ).execute()
        rows = result.get('values', [])

        for i, row in enumerate(rows):
            if row and row[0] == 'last_scanned_index':
                sheets.spreadsheets().values().update(
                    spreadsheetId=SHEETS_ID, range=f'Setting!B{i+1}',
                    valueInputOption='RAW', body={'values': [[str(new_index)]]}
                )
                return

        next_row = len(rows) + 1
        sheets.spreadsheets().values().update(
            spreadsheetId=SHEETS_ID, range=f'Setting!A{next_row}:B{next_row}',
            valueInputOption='RAW', body={'values': [['last_scanned_index', str(new_index)]]}
        )
    except Exception as e:
        print(f'[WARN] Could not update index: {e}')

# ============== INSTAGRAM ==============
def load_session_id():
    """Extract sessionid from cookies JSON"""
    if not os.path.exists(COOKIES_FILE):
        return None
    try:
        with open(COOKIES_FILE) as f:
            cookies = json.load(f)
        for c in cookies:
            if c.get('name') == 'sessionid':
                return c['value']
        return None
    except Exception as e:
        print(f'[WARN] Could not load cookies: {e}')
        return None

def save_session_id(ig):
    """Save sessionid from instagrapi to JSON file"""
    try:
        sessionid = ig.sessionid
        if sessionid:
            # Read existing cookies and update sessionid
            cookies = []
            if os.path.exists(COOKIES_FILE):
                with open(COOKIES_FILE) as f:
                    cookies = json.load(f)
            # Update or add sessionid
            found = False
            for c in cookies:
                if c.get('name') == 'sessionid':
                    c['value'] = sessionid
                    found = True
            if not found:
                cookies.append({
                    'name': 'sessionid', 'value': sessionid,
                    'domain': '.instagram.com', 'hostOnly': False,
                    'httpOnly': True, 'secure': True, 'session': False
                })
            with open(COOKIES_FILE, 'w') as f:
                json.dump(cookies, f, indent=2)
            print('[OK] Session saved')
    except Exception as e:
        print(f'[WARN] Could not save session: {e}')

def init_instagram():
    """Initialize Instagram session"""
    ig = Client()

    # Try sessionid from cookies file
    sessionid = load_session_id()
    if sessionid:
        print('[INFO] Trying session login...')
        try:
            ig.login_by_sessionid(sessionid)
            print(f'[OK] Logged in via session')
            save_session_id(ig)
            return ig
        except Exception as e:
            print(f'[WARN] Session failed: {e}')

    # Try password login
    if IG_PASSWORD:
        for attempt in range(3):
            try:
                print(f'[INFO] Trying password login (attempt {attempt+1})...')
                ig.login(IG_USERNAME, IG_PASSWORD)
                print(f'[OK] Logged in as: {IG_USERNAME}')
                save_session_id(ig)
                return ig
            except BadCredentials as e:
                print(f'[ERROR] Bad password: {e}')
                raise
            except (ChallengeError, FeedbackRequired) as e:
                print(f'[ERROR] Challenge required: {e}')
                raise
            except Exception as e:
                wait = 15 * (attempt + 1)
                print(f'[WARN] Login attempt {attempt+1} failed: {e}, waiting {wait}s...')
                if attempt < 2:
                    time.sleep(wait)
                else:
                    raise
    else:
        print('[ERROR] No Instagram session available')
        raise Exception('No auth')

# ============== PROFILE ANALYSIS ==============
def get_account_type(bio):
    """Classify account type based on bio keywords (word boundary)"""
    bio_lower = (bio or '').lower()
    for k in COMPETITOR_KEYWORDS:
        if re.search(r'\b' + re.escape(k) + r'\b', bio_lower):
            return 'competitor'
    for k in VENDOR_KEYWORDS:
        if re.search(r'\b' + re.escape(k) + r'\b', bio_lower):
            return 'vendor'
    return 'client'

def detect_category(bio, acc_type):
    """Detect specific category from bio"""
    bio_lower = (bio or '').lower()
    if acc_type == 'competitor':
        for k in COMPETITOR_KEYWORDS:
            if re.search(r'\b' + re.escape(k) + r'\b', bio_lower):
                return k.upper()
        return 'MUA'
    elif acc_type == 'vendor':
        for k in VENDOR_KEYWORDS:
            if re.search(r'\b' + re.escape(k) + r'\b', bio_lower):
                return k.capitalize()
        return 'Wedding Services'
    return 'Client'

def detect_location(bio):
    """Detect location from bio"""
    bio_lower = (bio or '').lower()
    for city in TARGET_CITIES:
        if re.search(r'\b' + re.escape(city) + r'\b', bio_lower):
            return city.capitalize()
    return ''

def extract_hashtags(text):
    """Extract hashtags from text"""
    if not text:
        return []
    return re.findall(r'#(\w+)', text.lower())

# ============== SCRAPING ==============
def scrape_hashtag_posts(ig, hashtag):
    """Scrape unique authors from hashtag posts"""
    print(f'\n[SCAN] Hashtag: #{hashtag}')
    authors = []
    seen_authors = set()
    post_count = 0

    for tab in ['recent', 'top']:
        if len(authors) >= PROFILES_PER_HASHTAG:
            break
        if tab == 'recent':
            fetch_func = lambda n=50: ig.hashtag_medias_recent(hashtag, n)
        else:
            fetch_func = lambda: ig.hashtag_medias_top(hashtag, 50)

        try:
            medias = safe_retry(fetch_func)
            if not medias:
                continue

            for media in medias:
                post_count += 1

                # Get username safely
                try:
                    if media.user:
                        # user might be a User object with username, or dict, or just pk
                        if hasattr(media.user, 'username'):
                            username = media.user.username
                        elif isinstance(media.user, dict):
                            username = media.user.get('username', '')
                        else:
                            # It's a pk, need to fetch
                            username = ig.username_from_user_id(media.user.pk)
                    else:
                        username = ig.username_from_user_id(media.pk)
                except Exception:
                    username = f'unknown_{post_count}'

                if not username or username in seen_authors:
                    print(f'   [SKIP] {username or "unknown"} (duplicate/skipped)')
                    continue

                seen_authors.add(username)

                # caption is already a string in instagrapi
                caption_text = media.caption or ''
                hashtags_in_post = ' '.join(extract_hashtags(caption_text))

                authors.append({
                    'username': username,
                    'likes': media.like_count or 0,
                    'comments': media.comment_count or 0,
                    'hashtags': hashtags_in_post
                })
                print(f'   [NEW] {username} ({media.like_count} likes)')

                if len(authors) >= PROFILES_PER_HASHTAG:
                    break

        except Exception as e:
            print(f'   [ERROR] {tab}: {e}')
            state.errors += 1

    print(f'   [INFO] Found {len(authors)} unique profiles from {post_count} posts')
    return authors

def scrape_profile(ig, username, depth=0):
    """Scrape full profile data with engagement metrics"""
    if username in state.visited_profiles:
        print(f'   [SKIP] @{username} already visited')
        return None

    if state.profiles_scraped >= MAX_PROFILES_PER_RUN:
        print(f'   [LIMIT] Max profiles reached ({MAX_PROFILES_PER_RUN})')
        return None

    print(f'   [PROC] @{username} (depth: {depth})')
    state.profiles_scraped += 1
    state.visited_profiles.add(username)
    time.sleep(REQUEST_DELAY)

    try:
        user = safe_retry(ig.user_info_by_username, username)
        if not user:
            raise Exception('User not found')

        profile = {
            'username': user.username,
            'display_name': user.full_name or user.username,
            'bio': user.biography or '',
            'followers': user.follower_count or 0,
            'following': user.following_count or 0,
            'posts': user.media_count or 0,
            'profile_url': f'https://instagram.com/{user.username}/',
            'location': detect_location(user.biography),
            'type': get_account_type(user.biography),
            'category': detect_category(user.biography, get_account_type(user.biography)),
            'collabs': [],
            'hashtags': set(),
            'avg_likes': 0,
            'avg_comments': 0,
            'total_likes': 0,
            'total_comments': 0,
            'posts_analyzed': 0
        }

        print(f'      [STATS] {profile["followers"]:,} followers | {profile["posts"]} posts')
        print(f'      [BIO] {profile["bio"][:60] or "-"}...')

        # Get recent posts for engagement & collabs
        try:
            medias = safe_retry(ig.user_medias, user.pk, 20)
            if not medias:
                medias = []

            profile['posts_analyzed'] = len(medias)

            for media in medias:
                profile['total_likes'] += media.like_count or 0
                profile['total_comments'] += media.comment_count or 0

                # Collect hashtags - caption is already a string
                caption_text = media.caption or ''
                for tag in extract_hashtags(caption_text):
                    profile['hashtags'].add(f'#{tag}')

                # Collect tagged users (collabs) - instagrapi uses user_tags
                if hasattr(media, 'user_tags') and media.user_tags:
                    try:
                        for tag in media.user_tags:
                            if tag and hasattr(tag, 'user') and tag.user:
                                tag_username = tag.user.username if hasattr(tag.user, 'username') else None
                                if tag_username and tag_username != username and tag_username not in state.visited_profiles:
                                    profile['collabs'].append(tag_username)
                    except Exception:
                        pass

            if profile['posts_analyzed'] > 0:
                profile['avg_likes'] = round(profile['total_likes'] / profile['posts_analyzed'])
                profile['avg_comments'] = round(profile['total_comments'] / profile['posts_analyzed'])

            print(f'      [ENG] Avg: {profile["avg_likes"]} likes | {profile["avg_comments"]} comments')
            print(f'      [TAGS] {len(profile["hashtags"])} hashtags | {len(profile["collabs"])} collabs')

        except PrivateAccount:
            print(f'      [WARN] Private account, cannot get posts')
        except Exception as e:
            print(f'      [WARN] Could not get posts: {e}')

        return profile

    except PrivateUser:
        print(f'   [SKIP] @{username} is private')
        state.visited_profiles.discard(username)
        state.profiles_scraped -= 1
        return None
    except ChallengeError:
        print(f'   [ERROR] Challenge required for @{username} - session may be invalid')
        state.visited_profiles.discard(username)
        state.profiles_scraped -= 1
        return None
    except Exception as e:
        print(f'   [ERROR] @{username}: {e}')
        state.visited_profiles.discard(username)
        state.profiles_scraped -= 1
        return None

# ============== WRITE TO SHEETS ==============
def write_profile(sheets, profile, depth=0):
    """Write profile data to appropriate sheet"""
    if not profile:
        return

    existing = (state.found_competitors if profile['type'] == 'competitor' else
                state.found_vendors if profile['type'] == 'vendor' else state.found_clients)

    if profile['username'] in existing:
        print(f'      [SKIP] Already saved')
        return

    # Calculate engagement rate
    if profile['followers'] > 0 and profile['posts_analyzed'] > 0:
        engagement = f'{((profile["avg_likes"] + profile["avg_comments"]) / profile["followers"] * 100):.2f}%'
    else:
        engagement = 'N/A'

    hashtags_str = ' '.join(sorted(list(profile['hashtags']))[:20])
    collabs_str = ', '.join(sorted(list(set(profile['collabs'])))[:10])
    last_updated = datetime.now().strftime('%Y-%m-%d')

    sheet_name = {'competitor': 'Competitors', 'vendor': 'Vendor', 'client': 'Client'}[profile['type']]

    # Get correct next row
    row_num = get_next_row(sheets, sheet_name)

    if profile['type'] == 'competitor':
        values = [[
            row_num - 2, profile['display_name'], profile['profile_url'], f'@{profile["username"]}',
            profile['location'] or 'JawaTengah', 'JawaTengah', profile['followers'], profile['following'],
            profile['posts'], '', engagement, hashtags_str, profile['bio'], 'Pending',
            collabs_str, last_updated
        ]]
        end_col = 'P'
    elif profile['type'] == 'vendor':
        values = [[
            row_num - 2, profile['display_name'], profile['profile_url'], f'@{profile["username"]}',
            profile['category'], profile['location'] or 'JawaTengah', 'JawaTengah', profile['followers'],
            profile['following'], profile['posts'], '', engagement, hashtags_str, profile['bio'],
            'Pending', collabs_str, last_updated
        ]]
        end_col = 'Q'
    else:  # client
        values = [[
            row_num - 2, profile['profile_url'], f'@{profile["username"]}', '',
            profile['bio'], profile['followers'], '', 'Pending', hashtags_str,
            engagement, profile['avg_likes'], profile['avg_comments'], collabs_str,
            last_updated, '', ''
        ]]
        end_col = 'Q'

    sheets.spreadsheets().values().update(
        spreadsheetId=SHEETS_ID, range=f'{sheet_name}!A{row_num}:{end_col}{row_num}',
        valueInputOption='RAW', body={'values': values}
    )

    existing.add(profile['username'])
    state.new_profiles += 1
    print(f'      [SAVED] {sheet_name} (row {row_num})')

    # Queue collabs
    if depth < MAX_COLLAB_DEPTH:
        for collab in set(profile['collabs']):
            if collab not in state.visited_profiles:
                if not any(c['username'] == collab for c in state.collab_queue):
                    state.collab_queue.append({'username': collab, 'depth': depth + 1})

    time.sleep(REQUEST_DELAY)

def process_profile(ig, sheets, username, depth=0):
    """Scrape and write a single profile"""
    if username in state.visited_profiles:
        return

    profile = scrape_profile(ig, username, depth)
    if profile:
        write_profile(sheets, profile, depth)

# ============== MAIN PIPELINE ==============
def run():
    print('=' * 60)
    print('[RUN] INSTAGRAM PROFILER - instagrapi pipeline')
    print('=' * 60)

    # Initialize
    sheets = init_sheets()
    ig = init_instagram()

    # Load state
    state.hashtags = read_hashtags(sheets)
    if not state.hashtags:
        print('[ERROR] No hashtags with Status=OK found')
        return

    read_visited_profiles(sheets)
    read_last_index(sheets)

    # Select hashtags for this run
    selected = []
    for i in range(HASHTAGS_PER_RUN):
        idx = (state.last_index + i) % len(state.hashtags)
        selected.append(state.hashtags[idx])

    next_index = (state.last_index + HASHTAGS_PER_RUN) % len(state.hashtags)

    print(f'\n[INFO] Selected hashtags: {", ".join(selected)}')
    print(f'[INFO] Next index will be: {next_index}\n')

    # Phase 1: Scrape hashtags, collect profile queue
    print('-' * 60)
    print('[PHASE 1] Hashtag Scanning')
    print('-' * 60)

    for hashtag in selected:
        if state.profiles_scraped >= MAX_PROFILES_PER_RUN:
            break

        authors = scrape_hashtag_posts(ig, hashtag)

        for author in authors:
            if author['username'] not in state.visited_profiles:
                state.profile_queue.append({
                    'username': author['username'],
                    'depth': 0,
                    'source': hashtag
                })

    if not state.profile_queue:
        print('\n[INFO] No new profiles found. Try updating hashtags in VendorHashtags sheet.')

    # Phase 2: Process profile queue
    print('\n' + '-' * 60)
    print('[PHASE 2] Profile Processing')
    print('-' * 60)

    while state.profile_queue and state.profiles_scraped < MAX_PROFILES_PER_RUN:
        item = state.profile_queue.pop(0)
        process_profile(ig, sheets, item['username'], item['depth'])

    # Phase 3: Process collab queue
    print('\n' + '-' * 60)
    print('[PHASE 3] Collab Discovery')
    print('-' * 60)

    while state.collab_queue and state.profiles_scraped < MAX_PROFILES_PER_RUN:
        item = state.collab_queue.pop(0)
        process_profile(ig, sheets, item['username'], item['depth'])

    # Update index
    update_last_index(sheets, next_index)

    # Save session
    save_session_id(ig)

    # Summary
    print('\n' + '=' * 60)
    print('[DONE] SCAN COMPLETE')
    print('-' * 60)
    print(f'   Profiles scraped: {state.profiles_scraped}/{MAX_PROFILES_PER_RUN}')
    print(f'   New profiles saved: {state.new_profiles}')
    print(f'   Competitors: {len(state.found_competitors)}')
    print(f'   Vendors: {len(state.found_vendors)}')
    print(f'   Clients: {len(state.found_clients)}')
    print(f'   Errors: {state.errors}')
    print(f'   Hashtag index: {state.last_index} -> {next_index}')
    print(f'   Next run will scan: {", ".join(selected)}')
    print('-' * 60)
    print('   All data written to Google Sheets immediately')
    print(f'   https://docs.google.com/spreadsheets/d/{SHEETS_ID}')
    print('=' * 60)

if __name__ == '__main__':
    run()
