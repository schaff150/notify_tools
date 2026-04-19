const fs   = require('fs');
const path = require('path');
const { sendSMS } = require('../notifier');

function log(msg) { console.log(`[arr] ${msg}`); }

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
async function generateVoiceScript(personality, mediaInfo, recipientName, apiKey) {
    if (!apiKey) {
        log(`No Gemini API key — using fallback for ${recipientName}.`);
        return null;
    }

    const genreStr  = (mediaInfo.genres || []).join(', ') || 'Unknown';
    const typeLabel = mediaInfo.type === 'series' ? 'TV series' : 'movie';

    const prompt =
        `${personality}\n\n` +
        `You are speaking directly to ${recipientName}. Address them by name.\n\n` +
        `A new ${typeLabel} was just added to the media server:\n` +
        `Title: ${mediaInfo.title}\n` +
        `Year: ${mediaInfo.year}\n` +
        `Genres: ${genreStr}\n\n` +
        `Write ONLY the spoken script — no emojis (this will be read aloud), no labels, just the words.`;

    try {
        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 200, temperature: 0.9 }
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

    let recipientPairs = []; // [{tag, phone}]
    if (!arrConfig.recipients || arrConfig.recipients === 'all') {
        recipientPairs = Object.entries(notifyMap).map(([tag, phone]) => ({ tag, phone }));
    } else {
        const tags = String(arrConfig.recipients).split(',').map(t => t.trim()).filter(Boolean);
        recipientPairs = tags
            .filter(tag => notifyMap[tag])
            .map(tag => ({ tag, phone: notifyMap[tag] }));
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
    const personality  = arrCfg.gemini_personality || 'You are JellyDad, an enthusiastic and fun home media server announcer.';
    const geminiKey    = config.gemini?.api_key;
    const hasElevenLabs = !!(config.elevenlabs?.api_key && config.elevenlabs?.voice_id);
    const hasAudioBase  = !!arrCfg.audio_base_url;

    let sentCount = 0;

    for (const { tag, phone } of recipientPairs) {
        const recipientName = extractName(tag);
        log(`[${type}] Building message for ${recipientName}…`);

        // 1. Generate personalized voice script via Gemini
        const voiceScript = await generateVoiceScript(personality, mediaInfo, recipientName, geminiKey)
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
