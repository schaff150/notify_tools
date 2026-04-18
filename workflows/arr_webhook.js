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

// ─── Gemini AI Text Generation ────────────────────────────────────────────────

async function generateGeminiScript(personality, mediaInfo, apiKey) {
    if (!apiKey) {
        log('No Gemini API key — using fallback message.');
        return null;
    }

    const genreStr = (mediaInfo.genres || []).join(', ') || 'Unknown';
    const typeLabel = mediaInfo.type === 'series' ? 'TV Series' : 'Movie';

    const prompt =
        `${personality}\n\n` +
        `Write a short, fun, enthusiastic SMS announcement (under 160 characters) ` +
        `for this new ${typeLabel} that was just added to the JellyDad media server:\n\n` +
        `Title: ${mediaInfo.title}\n` +
        `Year: ${mediaInfo.year}\n` +
        `Genres: ${genreStr}\n\n` +
        `Write ONLY the message text. No quotes, no labels, just the message.`;

    try {
        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 120, temperature: 0.9 }
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
            log(`Gemini generated: "${text}"`);
            return text;
        }
    } catch (e) {
        log(`Gemini fetch error: ${e.message}`);
    }
    return null;
}

// ─── ElevenLabs TTS Generation ────────────────────────────────────────────────

async function generateElevenLabsAudio(text, elevenConfig, audioDir) {
    const { api_key, voice_id } = elevenConfig || {};
    if (!api_key || !voice_id || !text) return null;

    log(`Requesting TTS for: "${text.substring(0, 60)}..."`);

    try {
        const resp = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
            {
                method: 'POST',
                headers: {
                    'xi-api-key': api_key,
                    'Content-Type': 'application/json',
                    'Accept': 'audio/mpeg'
                },
                body: JSON.stringify({
                    text,
                    model_id: 'eleven_multilingual_v2',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                        style: 0.4,
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
        const filename = `jellydad_${Date.now()}.mp3`;
        const filePath = path.join(audioDir, filename);
        fs.writeFileSync(filePath, audioBuffer);
        log(`Audio saved: ${filename} (${audioBuffer.length} bytes)`);
        return filename;
    } catch (e) {
        log(`ElevenLabs fetch error: ${e.message}`);
        return null;
    }
}

// ─── Fallback Message (no Gemini) ─────────────────────────────────────────────

function buildFallbackMessage(mediaInfo) {
    const emoji = mediaInfo.type === 'series' ? '📺' : '🎬';
    return `${emoji} JellyDad Alert! "${mediaInfo.title}" (${mediaInfo.year}) just added to the server!`;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

/**
 * Handle a Sonarr (Series Add) or Radarr (Movie Added) webhook.
 * @param {object} data       - Raw webhook payload from Sonarr/Radarr
 * @param {object} config     - Full app config
 * @param {'sonarr'|'radarr'} type
 * @param {string} audioDir   - Absolute path to /app/audio
 * @param {string} dataDir    - Absolute path to /app/data
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
    // Allow through if eventType is missing (some webhook test payloads omit it)
    if (eventType && eventType !== expectedEvent) {
        log(`[${type}] Ignored event type: "${eventType}" (expected "${expectedEvent}")`);
        return;
    }

    log(`[${type}] Processing: "${mediaInfo.title}" (${mediaInfo.year})`);

    // ── Resolve recipients ───────────────────────────────────────────────────

    const arrConfig = config[type] || {};
    const notifyMap = {};
    (config.notify_map || []).forEach(m => { if (m.phone) notifyMap[m.tag] = m.phone; });

    let recipientPhones = [];
    if (!arrConfig.recipients || arrConfig.recipients === 'all') {
        // Notify everyone with a configured phone number
        recipientPhones = Object.values(notifyMap);
    } else {
        // arrConfig.recipients is a comma-separated string of tags
        const tags = String(arrConfig.recipients).split(',').map(t => t.trim()).filter(Boolean);
        recipientPhones = tags.map(tag => notifyMap[tag]).filter(Boolean);
    }

    if (recipientPhones.length === 0) {
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

    // ── Generate AI message text ─────────────────────────────────────────────

    const arrCfg = config.arr || {};
    let messageText = await generateGeminiScript(
        arrCfg.gemini_personality || 'You are JellyDad, an enthusiastic home media announcer.',
        mediaInfo,
        config.gemini?.api_key
    );

    if (!messageText) {
        messageText = buildFallbackMessage(mediaInfo);
    }

    // ── Generate ElevenLabs audio (optional) ─────────────────────────────────

    let audioUrl = null;
    const hasElevenLabs = config.elevenlabs?.api_key && config.elevenlabs?.voice_id;
    const hasAudioBase  = arrCfg.audio_base_url;

    if (hasElevenLabs && hasAudioBase) {
        const filename = await generateElevenLabsAudio(messageText, config.elevenlabs, audioDir);
        if (filename) {
            audioUrl = `${arrCfg.audio_base_url.replace(/\/$/, '')}/${filename}`;
            log(`[${type}] Audio URL: ${audioUrl}`);
        }
    } else {
        if (!hasElevenLabs) log(`[${type}] ElevenLabs not configured — sending text only.`);
        if (!hasAudioBase)  log(`[${type}] No audio_base_url set — skipping MMS attachment.`);
    }

    // ── Dispatch SMS/MMS ─────────────────────────────────────────────────────

    let sentCount = 0;
    for (const phone of recipientPhones) {
        try {
            await sendSMS(phone, messageText, audioUrl, config.twilio);
            sentCount++;
        } catch (e) {
            log(`[${type}] Error sending to ${phone}: ${e.message}`);
        }
    }

    if (sentCount > 0) {
        history.push(histKey);
        if (history.length > 2000) history.splice(0, history.length - 2000);
        saveHistory(historyFile, history);
        log(`[${type}] Sent to ${sentCount}/${recipientPhones.length} recipient(s).`);
    }
}

module.exports = { handleArrWebhook };
