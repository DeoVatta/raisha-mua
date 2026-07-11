/**
 * AI Classifier — Olagon Gateway (Claude Haiku)
 *
 * Two use cases:
 * 1. classifyHashtagsBatch()  — filter hashtags to wedding/wisuda only
 * 2. classifyProfilesBatch()     — classify profiles + Indonesian detection
 */

import https from 'https';

export const OLAGON_API_KEY = 'rk_live_a8622697bdd840cf450c792ad0ea102b2fd186a8bcbffab2';
export const OLAGON_BASE_URL = 'https://gateway.olagon.site';
const MODEL = 'claude-haiku-4-20250514';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 5000;

// ===== HTTP CLIENT =====
function aiRequest(messages, systemPrompt, maxTokens = 8192, retries = 0) {
    return new Promise((resolve, reject) => {
        const reqBody = {
            model: MODEL,
            max_tokens: maxTokens,
            messages: [
                ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
                ...messages
            ]
        };
        const data = JSON.stringify(reqBody);

        const baseUrl = OLAGON_BASE_URL || 'https://gateway.olagon.site';
        const url = new URL(`${baseUrl}/anthropic/v1/messages`);

        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OLAGON_API_KEY}`,
                'Content-Length': Buffer.byteLength(data),
                'anthropic-version': '2023-06-01'
            }
        };

        const req = https.request(options, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                if (res.statusCode === 429) {
                    if (retries < MAX_RETRIES) {
                        const delay = BASE_DELAY_MS * Math.pow(2, retries);
                        console.log(`  [AI] Rate limited (${res.statusCode}) -- retry ${retries + 1}/${MAX_RETRIES} in ${delay / 1000}s...`);
                        setTimeout(() => {
                            resolve(aiRequest(messages, systemPrompt, maxTokens, retries + 1));
                        }, delay);
                    } else {
                        reject(new Error(`Rate limited after ${MAX_RETRIES} retries`));
                    }
                    return;
                }
                if (res.statusCode !== 200) {
                    if (retries < MAX_RETRIES) {
                        const delay = BASE_DELAY_MS * Math.pow(2, retries);
                        console.log(`  [AI] Non-200 (${res.statusCode}) -- retry ${retries + 1}/${MAX_RETRIES} in ${delay / 1000}s...`);
                        setTimeout(() => {
                            resolve(aiRequest(messages, systemPrompt, maxTokens, retries + 1));
                        }, delay);
                    } else {
                        reject(new Error(`AI request failed: ${res.statusCode} -- ${body.slice(0, 200)}`));
                    }
                    return;
                }
                try {
                    const json = JSON.parse(body);
                    const text = extractText(json);
                    resolve(text);
                } catch (e) {
                    if (retries < MAX_RETRIES) {
                        const delay = BASE_DELAY_MS * Math.pow(2, retries);
                        console.log(`  [AI] Parse error -- retry ${retries + 1}/${MAX_RETRIES} in ${delay / 1000}s...`);
                        setTimeout(() => {
                            resolve(aiRequest(messages, systemPrompt, maxTokens, retries + 1));
                        }, delay);
                    } else {
                        reject(new Error(`AI parse error: ${e.message} -- body: ${body.slice(0, 300)}`));
                    }
                }
            });
        });
        req.on('error', e => {
            if (retries < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * Math.pow(2, retries);
                console.log(`  [AI] Network error -- retry ${retries + 1}/${MAX_RETRIES} in ${delay / 1000}s...`);
                setTimeout(() => resolve(aiRequest(messages, systemPrompt, maxTokens, retries + 1)), delay);
            } else {
                reject(e);
            }
        });
        req.setTimeout(120000, () => {
            req.destroy();
            if (retries < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * Math.pow(2, retries);
                setTimeout(() => {
                    resolve(aiRequest(messages, systemPrompt, maxTokens, retries + 1));
                }, delay);
            } else {
                reject(new Error('AI request timeout'));
            }
        });
        req.write(data);
        req.end();
    });
}

function extractText(json) {
    const content = json.content || [];
    for (const block of content) {
        if (block.type === 'text') return block.text || '';
    }
    return '';
}

function stripMarkdown(text) {
    return text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .replace(/\n+/g, ' ')
        .trim();
}

function parseAiResponse(text) {
    const stripped = stripMarkdown(text);
    try {
        return JSON.parse(stripped);
    } catch (_) {}

    // Format: objects on separate lines without commas
    const lines = stripped.split('\n').map(l => l.trim()).filter(l => l.startsWith('{'));
    if (lines.length >= 2) {
        const normalized = '[' + lines.map(l => l.endsWith(',') ? l.slice(0, -1) : l).join(',') + ']';
        try {
            return JSON.parse(normalized);
        } catch (_) {
            const results = [];
            for (const line of lines) {
                const trimmed = line.endsWith(',') ? line.slice(0, -1) : line;
                try { results.push(JSON.parse(trimmed)); } catch (_) {}
            }
            if (results.length > 0) return results;
        }
    }

    const startIdx = stripped.indexOf('[');
    const endIdx = stripped.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        try {
            return JSON.parse(stripped.slice(startIdx, endIdx + 1));
        } catch (e2) {
            throw new Error(`No JSON array in response: ${stripped.slice(0, 200)}`);
        }
    }
    throw new Error(`No JSON array in response: ${stripped.slice(0, 200)}`);
}

// ===== HASHTAG CLASSIFICATION =====
const HT_SYSTEM_PROMPT = `You are a hashtag classifier for Indonesian WEDDING & GRADUATION (wisuda) industry ONLY.

Classify each hashtag as business=true ONLY if it is clearly a wedding or graduation service/product hashtag.

business=true if:
- MUA / Makeup Artist: #makeupartist, #mua, #muasemarang, #riaspengantin, #bridalmakeup, #hairstylist
- Photographer / Videographer: #fotografer, #fotografi, #photographer, #videografer, #weddingphoto, #prewedding
- Catering / Wedding Cake: #catering, #katering, #nasbox, #weddingcake, #tumpeng
- Decorator / Venue: #dekorasi, #dekorator, #weddingdekor, #venue, #gedungpernikahan
- Wedding Organizer: #weddingorganizer, #wo, #woplanner, #eventorganizer, #eo
- Gaun / Kebaya / Dress: #gaunpengantin, #kebaya, #weddingdress, #dresswisuda
- Undangan / Invitation: #undangan, #undanganpernikahan, #weddinginvitation
- MC / Celebrant: #mcpernikahan, #mcu, #celebrant
- Souvenir / Seserahan: #souvenirpernikahan, #seserahan, #bantalcouple, #bouquet
- Florist / Flower: #flowerdecoration, #florist, #buket
- Graduation / Wisuda: #wisuda, #toga, #wisuda2024, #graduationphoto, #sesifotowisuda
- Location-based vendor: #muasemarang, #fotografersolo, #cateringjogja

business=false if:
- Generic lifestyle: #love, #beautiful, #happy, #couple, #nature
- Generic fashion unrelated to wedding: #fashion, #ootd, #bajumurah, #dress
- Generic food unrelated to catering: #kue, #makanan, #resep, #kuliner
- Personal wedding posts: #weddingday, #weddingceremony, #pernikahan kami (personal, not vendor)
- Generic beauty without wedding context: #skincare, #makeupoftheday
- General hashtags: #instagood, #viral, #reels, #explore

Return JSON array ONLY — no thinking, no markdown.

Format: [{"h":"hashtag_name_without_#","b":true_or_false,"r":"short reason"}]</parameter>

const HT_BATCH_MAX = 30;

export async function classifyHashtagsBatch(hashtags) {
    if (!hashtags || hashtags.length === 0) return [];
    if (!OLAGON_API_KEY) {
        console.warn('[AI] OLAGON_API_KEY not set -- hashtag classification skipped');
        return hashtags.map(t => ({ tag: t, business: true, reason: 'no-key' }));
    }

    const unique = [...new Set(hashtags.map(t => t.replace(/^#/, '').toLowerCase().trim()))].filter(Boolean);
    if (unique.length === 0) return [];

    const batches = [];
    for (let i = 0; i < unique.length; i += HT_BATCH_MAX) {
        batches.push(unique.slice(i, i + HT_BATCH_MAX));
    }

    console.log(`[AI] Classifying ${unique.length} hashtags in ${batches.length} batch(es)`);

    const allResults = [];

    for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        const batchNum = b + 1;
        console.log(`[AI] HT batch ${batchNum}/${batches.length}: ${batch.length} hashtags...`);

        const messages = [{
            role: 'user',
            content: JSON.stringify(batch.map(t => '#' + t)) + '\n\nJSON array only. No thinking. No markdown.'
        }];

        try {
            const text = await aiRequest(messages, HT_SYSTEM_PROMPT);
            const parsed = parseAiResponse(text);

            for (const item of parsed) {
                const tag = item.h?.startsWith('#') ? item.h : '#' + (item.h || '');
                allResults.push({
                    tag,
                    business: item.b === true || item.b === 'true',
                    reason: item.r || '',
                });
            }

            console.log(`  [AI] HT batch ${batchNum}: ${parsed.length} results`);
        } catch (e) {
            console.warn(`  [AI] HT batch ${batchNum} failed: ${e.message} -- keeping all as business=true`);
            for (const t of batch) {
                allResults.push({ tag: '#' + t, business: true, reason: 'parse-error' });
            }
        }
    }

    const approved = allResults.filter(r => r.business);
    console.log(`[AI] ${approved.length}/${allResults.length} hashtags approved (wedding/wisuda)`);
    return approved;
}

// ===== PROFILE CLASSIFICATION =====
const PROFILE_SYSTEM_PROMPT = `You are a data extraction assistant for Indonesian WEDDING & GRADUATION business Instagram profiles.

Analyze and return JSON array ONLY -- no thinking, no explanation, no markdown.

Each entry:
{"u":"username","c":"category","l":"location","w":"whatsapp","i":true_or_false,"note":"1-line in Indonesian"}

Rules:
- u: Match exactly as input username.
- c: Wedding/graduation category. Examples:
  * "MUA / Rias" -- makeup artist, bridal makeup, hairstylist
  * "Photographer" -- fotografer, videografer, wedding photo
  * "Catering" -- catering, wedding cake, nasi box
  * "Decorator" -- dekorasi, dekorator, decoration
  * "Venue" -- ballroom, hotel, resort pengantin
  * "Wedding Organizer" -- WO, event organizer, EO
  * "Gaun / Kebaya" -- gaun pengantin, kebaya, dress, gown
  * "Undangan" -- undangan nikah, invitation
  * "MC" -- MC pernikahan
  * "Souvenir / Seserahan" -- souvenir, seserahan, buket
  * "Florist" -- flower, buket, florist
  * "Wisuda Photographer" -- fotografer wisuda, sesi foto wisuda
  * "Toga / Grad" -- sewa toga, graduation gear
  Return "Other" if NOT a wedding/graduation business.
- l: City name (Jakarta, Semarang, Yogyakarta, Surabaya, dll). Empty if not found.
- w: Phone from bio. Format: 08xx... or +62... Empty if not found.
- i (isIndonesian): TRUE if Indonesian (Indonesian words in bio, +62 phone, city names, RP currency). FALSE if foreign or personal wedding/graduation post (not a business).
- note: 1 sentence describing what they sell/offer (max 100 chars, Indonesian).

Return ALL profiles in the batch.`;

const PROFILE_BATCH_MAX = 50;

export async function classifyProfilesBatch(profiles) {
    if (!profiles || profiles.length === 0) return profiles;
    if (!OLAGON_API_KEY) {
        console.warn('[AI] OLAGON_API_KEY not set -- skipping AI profile classification');
        return profiles;
    }

    const results = [];

    for (let i = 0; i < profiles.length; i += PROFILE_BATCH_MAX) {
        const batch = profiles.slice(i, i + PROFILE_BATCH_MAX);
        const batchNum = Math.floor(i / PROFILE_BATCH_MAX) + 1;
        const totalBatches = Math.ceil(profiles.length / PROFILE_BATCH_MAX);

        console.log(`[AI] Profile batch ${batchNum}/${totalBatches}: ${batch.length} profiles...`);

        const input = batch.map(p => ({
            u: p.username || '',
            b: ((p.bio || '') + ' ' + (p.caption || '')).slice(0, 400),
            f: p.followers || 0,
            h: [...(p.hashtags || [])].slice(0, 10).join(' '),
            l: p.location || '',
        }));

        try {
            const text = await aiRequest(
                [{ role: 'user', content: 'Extract from this batch:\n' + JSON.stringify(input) }],
                PROFILE_SYSTEM_PROMPT
            );
            const parsed = parseAiResponse(text);

            const lookup = {};
            for (const item of parsed) {
                lookup[item.u?.toLowerCase()] = item;
            }

            for (const profile of batch) {
                const key = (profile.username || '').toLowerCase();
                const ai = lookup[key] || {};

                const cat = ai.c || 'Other';
                const isIndonesian = ai.i === true;
                const isWedding = cat !== 'Other';

                if (!isIndonesian || !isWedding) {
                    // Non-Indonesian or non-wedding → skip
                    results.push({ ...profile, aiCategory: cat, aiNote: ai.note || '', isIndonesian, isWedding });
                } else {
                    results.push({
                        ...profile,
                        aiCategory: cat,
                        aiLocation: ai.l || profile.location || '',
                        aiWhatsApp: ai.w || '',
                        aiNote: ai.note || '',
                        isIndonesian: true,
                        isWedding: true,
                    });
                }
            }

            if (parsed[0]) {
                const first = parsed[0];
                console.log(`  [AI DEBUG] @${first.u} --> cat="${first.c}", loc="${first.l}", indonesian=${first.i}`);
            }
        } catch (e) {
            console.warn(`  [AI] Profile batch ${batchNum} failed: ${e.message} -- using rule-based`);
            for (const p of batch) {
                results.push({ ...p, aiCategory: 'Other', isIndonesian: true, isWedding: false });
            }
        }
    }

    return results;
}
