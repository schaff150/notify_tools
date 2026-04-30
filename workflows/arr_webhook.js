const fs   = require('fs');
const path = require('path');
const { sendSMS } = require('../notifier');

function log(msg) {
    const ts = new Date().toISOString().replace('T',' ').substring(0,19);
    console.log(`[${ts}] [arr] ${msg}`);
}

// ─── Arr API Helpers ──────────────────────────────────────────────────────────

/**
 * Fetch tag definitions from a Sonarr/Radarr instance.
 * Returns a Map of tagId → tagLabel (e.g. 1 → "notify-dad").
 */
async function fetchTagDefinitions(arrUrl, apiKey) {
    const url = `${arrUrl.replace(/\/$/, '')}/api/v3/tag`;
    log(`Fetching tag definitions from ${url}`);
    const resp = await fetch(url, { headers: { 'X-Api-Key': apiKey } });
    if (!resp.ok) throw new Error(`Tag API ${resp.status}: ${await resp.text()}`);
    const tags = await resp.json();
    const map = new Map();
    for (const t of tags) map.set(t.id, t.label);
    log(`Loaded ${map.size} tag definition(s): ${[...map.values()].join(', ')}`);
    return map;
}

/**
 * Fetch the full series or movie object from the Sonarr/Radarr API.
 * Returns the tag IDs assigned to that item.
 */
async function fetchItemTagIds(arrUrl, apiKey, type, itemId) {
    const endpoint = type === 'sonarr' ? 'series' : 'movie';
    const url = `${arrUrl.replace(/\/$/, '')}/api/v3/${endpoint}/${itemId}`;
    log(`Fetching ${endpoint}/${itemId} from ${url}`);
    const resp = await fetch(url, { headers: { 'X-Api-Key': apiKey } });
    if (!resp.ok) throw new Error(`${endpoint} API ${resp.status}: ${await resp.text()}`);
    const item = await resp.json();
    return item.tags || [];
}

/**
 * Resolve the notify-tag labels assigned to a series/movie by calling the *arr API.
 * Returns an array of lowercase tag labels (e.g. ["notify-dad", "notify-anna"]).
 * Returns null if API credentials are not configured.
 */
async function resolveArrTags(arrConfig, type, data) {
    const url = arrConfig.url;
    const apiKey = arrConfig.api_key;
    if (!url || !apiKey) {
        log(`[${type}] No API URL/key configured — cannot resolve tags from *arr API.`);
        return null;
    }

    // Get the item ID from the webhook payload
    const itemId = type === 'sonarr'
        ? (data.series?.id)
        : (data.movie?.id);

    if (!itemId) {
        log(`[${type}] No item ID in webhook payload — cannot look up tags.`);
        return null;
    }

    try {
        // Fetch tag definitions (id → label map) and item's tag IDs in parallel
        const [tagMap, tagIds] = await Promise.all([
            fetchTagDefinitions(url, apiKey),
            fetchItemTagIds(url, apiKey, type, itemId)
        ]);

        if (!tagIds.length) {
            log(`[${type}] Item has no tags assigned.`);
            return [];
        }

        const labels = tagIds
            .map(id => tagMap.get(id))
            .filter(Boolean)
            .map(l => l.toLowerCase());

        log(`[${type}] Resolved tag labels: ${labels.join(', ')}`);
        return labels;
    } catch (e) {
        log(`[${type}] Error resolving tags from API: ${e.message}`);
        return null;
    }
}

// ─── History Helpers ──────────────────────────────────────────────────────────

function loadHistory(historyFile) {
    if (fs.existsSync(historyFile)) {
        try { return JSON.parse(fs.readFileSync(historyFile, 'utf8')); }
        catch (e) { log(`Error reading history: ${e.message}`); }
    }
    return [];
}

function saveHistory(historyFile, history) {
    try { fs.writeFileSync(historyFile, JSON.stringify(history)); }
    catch (e) { log(`Error saving history: ${e.message}`); }
}

// ─── Name Extraction ──────────────────────────────────────────────────────────

/**
 * Extract a display name from a notify tag.
 * "notify-dad"  → "Dad"
 * "notify-anna" → "Anna"
 */
function extractName(tag) {
    const parts = tag.split('-');
    if (parts.length >= 2) {
        const raw = parts.slice(1).join(' ');
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return tag;
}

// ─── Gemini Voice Script Generation ──────────────────────────────────────────

/**
 * Ask Gemini to write a spoken voice announcement tailored to one recipient.
 * This is meant to be read aloud by ElevenLabs, not sent as an SMS body,
 * so it can be conversational, expressive, and longer than 160 chars.
 */
async function generateVoiceScript(personality, mediaInfo, recipientName, apiKey, model) {
    if (!apiKey) {
        log(`No Gemini API key — using fallback for ${recipientName}.`);
        return null;
    }

    const genreStr  = (mediaInfo.genres || []).join(', ') || 'Unknown';
    const typeLabel = mediaInfo.type === 'series' ? 'TV series' : 'movie';

    const prompt =
        `PERSONALITY AND TONE (follow this strictly):\n${personality}\n\n` +
        `TASK:\n` +
        `You are speaking directly to ${recipientName}. Address them by name.\n` +
        `A new ${typeLabel} was just added to the media server:\n` +
        `Title: ${mediaInfo.title}\n` +
        `Year: ${mediaInfo.year}\n` +
        `Genres: ${genreStr}\n\n` +
        `RULES:\n` +
        `- Write ONLY the spoken script — no emojis, no labels, no quotation marks, just the words to be read aloud.\n` +
        `- Stay completely in the character and tone described above. Do NOT be generic or enthusiastic unless the personality says so.\n` +
        `- Follow any length instructions in the personality. If none are given, aim for 2-3 sentences.`;

    try {
        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
                })
            }
        );

        if (!resp.ok) {
            const errText = await resp.text();
            log(`Gemini API error ${resp.status}: ${errText}`);
            return null;
        }

        const data = await resp.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) {
            log(`Gemini script for ${recipientName}: "${text.substring(0, 80)}…"`);
            return text;
        }
    } catch (e) {
        log(`Gemini fetch error: ${e.message}`);
    }
    return null;
}

// ─── Fallback Script (no Gemini) ─────────────────────────────────────────────

function buildFallbackScript(mediaInfo, recipientName) {
    const typeStr = mediaInfo.type === 'series' ? 'a new TV series' : 'a new movie';
    return `Hey ${recipientName}! JellyDad here. Just wanted to let you know that ${mediaInfo.title} ` +
           `has just been added to the media server. Hope you enjoy it!`;
}

// ─── ElevenLabs TTS Generation ────────────────────────────────────────────────

async function generateElevenLabsAudio(script, elevenConfig, audioDir, recipientName) {
    const { api_key, voice_id } = elevenConfig || {};
    if (!api_key || !voice_id || !script) return null;

    const safeName = (recipientName || 'shared').toLowerCase().replace(/[^a-z0-9]/g, '');
    const filename = `jellydad_${safeName}_${Date.now()}.mp3`;

    log(`Requesting TTS for ${recipientName}: "${script.substring(0, 60)}…"`);

    try {
        const resp = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
            {
                method: 'POST',
                headers: {
                    'xi-api-key':   api_key,
                    'Content-Type': 'application/json',
                    'Accept':       'audio/mpeg'
                },
                body: JSON.stringify({
                    text: script,
                    model_id: 'eleven_multilingual_v2',
                    voice_settings: {
                        stability:        0.5,
                        similarity_boost: 0.75,
                        style:            0.4,
                        use_speaker_boost: true
                    }
                })
            }
        );

        if (!resp.ok) {
            const errText = await resp.text();
            log(`ElevenLabs error ${resp.status}: ${errText}`);
            return null;
        }

        const audioBuffer = Buffer.from(await resp.arrayBuffer());
        const filePath = path.join(audioDir, filename);
        fs.writeFileSync(filePath, audioBuffer);
        log(`Audio saved for ${recipientName}: ${filename} (${audioBuffer.length} bytes)`);
        return filename;

    } catch (e) {
        log(`ElevenLabs fetch error: ${e.message}`);
        return null;
    }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

/**
 * Handle a Sonarr (Series Add) or Radarr (Movie Added) webhook.
 *
 * Per-recipient flow:
 *   1. Gemini writes a personalized spoken script for each person by name
 *   2. ElevenLabs converts it to a unique audio file per person
 *   3. SMS is sent with just the audio link (no text body other than a teaser line)
 *      Falls back gracefully if Gemini or ElevenLabs are not configured.
 */
async function handleArrWebhook(data, config, type, audioDir, dataDir) {
    const historyFile = path.join(dataDir, 'arr_history.json');

    // ── Extract media info & validate event type ─────────────────────────────

    let mediaInfo;
    let expectedEvent;

    if (type === 'sonarr') {
        expectedEvent = 'SeriesAdd';
        const s = data.series || {};
        mediaInfo = {
            title:  s.title  || data.title  || 'Unknown Series',
            year:   s.year   || data.year   || '',
            type:   'series',
            genres: s.genres || []
        };
    } else {
        expectedEvent = 'MovieAdded';
        const m = data.movie || {};
        mediaInfo = {
            title:  m.title  || data.title  || 'Unknown Movie',
            year:   m.year   || data.year   || '',
            type:   'movie',
            genres: m.genres || []
        };
    }

    const eventType = data.eventType || '';
    if (eventType && eventType !== expectedEvent) {
        log(`[${type}] Ignored event type: "${eventType}" (expected "${expectedEvent}")`);
        return;
    }

    log(`[${type}] Processing: "${mediaInfo.title}" (${mediaInfo.year})`);

    // ── Resolve recipients ───────────────────────────────────────────────────

    const arrConfig = config[type] || {};
    const notifyMap = {};
    (config.notify_map || []).forEach(m => { if (m.phone) notifyMap[m.tag] = m.phone; });

    // Build a reverse lookup: Jellyseerr/Overseerr username → notify tag
    // e.g. "1-geocode" → "notify-dad"
    const seerrToNotify = {};
    (config.seerr_user_map || []).forEach(m => {
        if (m.seerr_username && m.tag) seerrToNotify[m.seerr_username.toLowerCase()] = m.tag;
    });

    let recipientPairs = []; // [{tag, phone}]
    
    // Call the Sonarr/Radarr API to resolve tag IDs → tag labels,
    // then match those labels against notify_map (directly or via seerr_user_map).
    const resolvedLabels = await resolveArrTags(arrConfig, type, data);

    if (resolvedLabels !== null && resolvedLabels.length > 0) {
        // For each resolved tag label, check:
        //   1. Direct match in notify_map (tag is "notify-dad" etc.)
        //   2. Jellyseerr username match via seerr_user_map (tag is "1-geocode" → "notify-dad")
        const matchedNotifyTags = new Set();
        for (const label of resolvedLabels) {
            if (notifyMap[label]) {
                matchedNotifyTags.add(label);
                log(`[${type}] Direct tag match: "${label}"`);
            } else if (seerrToNotify[label]) {
                const notifyTag = seerrToNotify[label];
                if (notifyMap[notifyTag]) {
                    matchedNotifyTags.add(notifyTag);
                    log(`[${type}] Jellyseerr tag match: "${label}" → "${notifyTag}"`);
                }
            }
        }

        if (matchedNotifyTags.size > 0) {
            log(`[${type}] Resolved recipients: ${[...matchedNotifyTags].join(', ')}`);
            recipientPairs = [...matchedNotifyTags].map(tag => ({ tag, phone: notifyMap[tag] }));
        } else {
            log(`[${type}] Tags resolved (${resolvedLabels.join(', ')}) but none match notify_map or seerr_user_map — no recipients.`);
            return;
        }
    } else if (resolvedLabels !== null && resolvedLabels.length === 0) {
        // API call succeeded but item has no tags — fall back to static recipients
        log(`[${type}] Item has no tags — falling back to static recipients setting.`);
        if (!arrConfig.recipients || arrConfig.recipients === 'all') {
            recipientPairs = Object.entries(notifyMap).map(([tag, phone]) => ({ tag, phone }));
        } else {
            const tags = String(arrConfig.recipients).split(',').map(t => t.trim()).filter(Boolean);
            recipientPairs = tags
                .filter(tag => notifyMap[tag])
                .map(tag => ({ tag, phone: notifyMap[tag] }));
        }
    } else {
        // resolvedLabels is null — API not configured or failed, use static setting
        log(`[${type}] Could not resolve tags from API — using static recipients setting.`);
        if (!arrConfig.recipients || arrConfig.recipients === 'all') {
            recipientPairs = Object.entries(notifyMap).map(([tag, phone]) => ({ tag, phone }));
        } else {
            const tags = String(arrConfig.recipients).split(',').map(t => t.trim()).filter(Boolean);
            recipientPairs = tags
                .filter(tag => notifyMap[tag])
                .map(tag => ({ tag, phone: notifyMap[tag] }));
        }
    }

    if (recipientPairs.length === 0) {
        log(`[${type}] No recipients configured or no phone numbers set.`);
        return;
    }

    // ── Dedup check ──────────────────────────────────────────────────────────

    const history = loadHistory(historyFile);
    const histKey = `${type}::${mediaInfo.title}::${mediaInfo.year}`;

    if (history.includes(histKey)) {
        log(`[${type}] Already sent for "${mediaInfo.title}". Skipping.`);
        return;
    }

    // ── Per-recipient: script → audio → SMS ─────────────────────────────────

    const arrCfg       = config.arr || {};
    const personality  = arrCfg.gemini_personality || 'You are a friendly home media server assistant. Keep messages brief and natural.';
    const geminiKey    = config.gemini?.api_key;
    const geminiModel  = config.gemini?.model || 'gemini-1.5-flash';
    const hasElevenLabs = !!(config.elevenlabs?.api_key && config.elevenlabs?.voice_id);
    const hasAudioBase  = !!arrCfg.audio_base_url;

    let sentCount = 0;

    for (const { tag, phone } of recipientPairs) {
        const recipientName = extractName(tag);
        log(`[${type}] Building message for ${recipientName}…`);

        // 1. Generate personalized voice script via Gemini
        const voiceScript = await generateVoiceScript(personality, mediaInfo, recipientName, geminiKey, geminiModel)
            || buildFallbackScript(mediaInfo, recipientName);

        // 2. Generate unique audio file for this recipient via ElevenLabs
        let audioUrl = null;
        if (hasElevenLabs && hasAudioBase) {
            const filename = await generateElevenLabsAudio(
                voiceScript, config.elevenlabs, audioDir, recipientName
            );
            if (filename) {
                audioUrl = `${arrCfg.audio_base_url.replace(/\/$/, '')}/${filename}`;
                log(`[${type}] ${recipientName} audio: ${audioUrl}`);
            }
        } else {
            if (!hasElevenLabs) log(`[${type}] ElevenLabs not configured — text-only SMS.`);
            if (!hasAudioBase)  log(`[${type}] No audio_base_url — skipping audio.`);
        }

        // 3. SMS body:
        //    - If audio was generated: brief teaser line (the link is appended by notifier.js)
        //    - If no audio: send the voice script as the text message
        const smsBody = audioUrl
            ? `📻 JellyDad has a personal message for ${recipientName}!`
            : voiceScript;

        try {
            await sendSMS(phone, smsBody, audioUrl, config.sms_gateway);
            sentCount++;
            log(`[${type}] Sent to ${recipientName} (${phone}).`);
        } catch (e) {
            log(`[${type}] Error sending to ${recipientName} (${phone}): ${e.message}`);
        }
    }

    if (sentCount > 0) {
        history.push(histKey);
        if (history.length > 2000) history.splice(0, history.length - 2000);
        saveHistory(historyFile, history);
        log(`[${type}] Done. Sent to ${sentCount}/${recipientPairs.length} recipient(s).`);
    }
}

module.exports = { handleArrWebhook };
