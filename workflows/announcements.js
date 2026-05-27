const fs   = require('fs');
const path = require('path');

function log(msg) {
    const ts = new Date().toISOString().replace('T',' ').substring(0,19);
    console.log(`[${ts}] [announcements] ${msg}`);
}

// ─── Default Prompts (fallback when config has none) ─────────────────────────

const DEFAULT_PROMPTS = {
    take_out_trash: {
        core: "Take out the trash.",
        tone: "slightly snarky but helpful, like a Scottish sysadmin who's seen this movie before",
        examples: [
            "The bin bags are staging a coup in the kitchen, and frankly they're gaining ground. Time to quell the rebellion before it spreads to the living room.",
            "Right, trash collection. The bin's full, the bag's heavy, and I can smell it from here. Don't make me come over there and do it myself."
        ]
    },
    dinner_time: {
        core: "Dinner is ready.",
        tone: "warm, inviting, makes you actually want to come to the table",
        examples: [
            "Food's up, and it's actually good tonight. First one to the table gets the good chair — second place gets whatever's left.",
            "Dinner is served. Well, 'served' is a strong word — but it's hot, it's here, and it won't stay that way forever."
        ]
    },
    bedtime: {
        core: "Time for bed.",
        tone: "gentle but firm, parental energy, maybe a touch of humor",
        examples: [
            "The day is done, the screens are tired, and your pillow has been asking about you. Time to give it some attention.",
            "Bedtime, troops. Tomorrow's adventures require a full charge, and you can't run on 10% forever."
        ]
    },
    wake_up: {
        core: "Time to wake up.",
        tone: "energetic but not obnoxious, morning motivation",
        examples: [
            "Rise and shine! The coffee's already been working harder than you for the past hour, and that's just embarrassing.",
            "Good morning! The world's been up for hours and it's starting to talk about you. Time to get out there and show it what you've got."
        ]
    },
    general_reminder: {
        core: "Hey, don't forget about this.",
        tone: "friendly nudge, casual, not nagging",
        examples: [
            "Just a friendly tap on the shoulder from the universe — there's something on your list that's been looking at you sideways for a while now.",
            "This is your brain on remembering things. It's not perfect, but it's trying, and right now it's telling you there's something you should probably handle."
        ]
    }
};

// ─── Config Helpers ────────────────────────────────────────────────────────────

/**
 * Get announcement prompts from config, falling back to defaults.
 * Always returns a clone so callers can't mutate the originals.
 */
function getPrompts(config) {
    const cfg = (config && config.announcements) || {};
    const prompts = cfg.prompts || {};
    const merged = {};

    // Only seed defaults on first run (config has zero prompts)
    if (Object.keys(prompts).length === 0) {
        for (const key of Object.keys(DEFAULT_PROMPTS)) {
            merged[key] = DEFAULT_PROMPTS[key];
        }
    } else {
        // Use exactly what the user configured — no forced defaults
        for (const key of Object.keys(prompts)) {
            merged[key] = prompts[key];
        }
    }
    return JSON.parse(JSON.stringify(merged));
}

/**
 * Get the full announcements config section.
 */
function getAnnouncementsConfig(config) {
    const cfg = (config && config.announcements) || {};
    return {
        enable: cfg.enable !== false,  // default true
        prompts: getPrompts(config)
    };
}

function listMessageTypes(config) {
    const prompts = getPrompts(config);
    return Object.keys(prompts).map(key => ({
        type: key,
        core: prompts[key].core,
        tone: prompts[key].tone
    }));
}

// ─── HA Config Generator ──────────────────────────────────────────────────────

/**
 * Generate Home Assistant packages/announcements.yaml from current prompts.
 * Creates one rest_command + one script per announcement type.
 */
function generateHAConfig(config, speakerEntityId) {
    const prompts = getPrompts(config);
    const types = Object.keys(prompts);
    const speaker = speakerEntityId || 'media_player.upstairs_landing_speaker';

    // Emoji icons per type — map by keyword matching
    const emojiMap = {
        trash: '🚮', dinner: '🍽️', bedtime: '🌙', wake: '☀️', morning: '☀️',
        reminder: '🔔', feed: '🐱', cat: '🐱', dog: '🐕', homework: '📚',
        chore: '🧹', laundry: '🧺', clean: '🧹', shower: '🚿', bath: '🛁',
        school: '🏫', bus: '🚌', leave: '🚗', lunch: '🥪', snack: '🍪'
    };

    function keyToLabel(key) {
        return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    function keyToEmoji(key) {
        for (const [kw, emoji] of Object.entries(emojiMap)) {
            if (key.includes(kw)) return emoji;
        }
        return '📢';
    }

    let yaml = `# Auto-generated by Notify Tools — Announcements Pipeline
# Regenerate: http://192.168.0.87:3322/api/announcements/ha-config
# ${new Date().toISOString().split('T')[0]} — ${types.length} announcement types

script:
`;

    for (const type of types) {
        const prompt = prompts[type];
        const label = keyToLabel(type);
        const emoji = keyToEmoji(type);
        const scriptId = `announce_${type}`;

        yaml += `  ${scriptId}:
    alias: "${emoji} ${label}"
    icon: mdi:bullhorn
    sequence:
      - action: shell_command.announce_${type}

`;
    }

    return yaml;
}

// ─── Voice Caching ────────────────────────────────────────────────────────────

let voiceCache = [];
let voiceCacheTime = 0;
const VOICE_CACHE_TTL = 3600 * 1000;

async function getEnglishVoices(elevenConfig) {
    const now = Date.now();
    if (voiceCache.length > 0 && (now - voiceCacheTime) < VOICE_CACHE_TTL) {
        return voiceCache;
    }

    const { api_key } = elevenConfig || {};
    if (!api_key) {
        log('No ElevenLabs API key configured — cannot fetch voices.');
        return [];
    }

    try {
        const resp = await fetch('https://api.elevenlabs.io/v1/voices', {
            headers: { 'xi-api-key': api_key }
        });
        if (!resp.ok) {
            log(`ElevenLabs voices API error ${resp.status}: ${await resp.text().then(t => t.substring(0,200))}`);
            return [];
        }
        const data = await resp.json();

        const voices = (data.voices || []).filter(v => {
            const labels = v.labels || {};
            const lang = (labels.language || '').toLowerCase();
            const category = (v.category || '').toLowerCase();
            if (!lang.startsWith('en')) return false;
            if (category === 'prime') return false;
            if (labels.use_case === 'high_quality') return false;
            return true;
        });

        voiceCache = voices;
        voiceCacheTime = now;
        log(`Cached ${voices.length} English voices (non-Prime).`);
        return voices;
    } catch (e) {
        log(`Error fetching voices: ${e.message}`);
        return [];
    }
}

// ─── AI Variant Generation ────────────────────────────────────────────────────

async function generateVariant(messageType, aiConfig, prompts, coreOverride, toneOverride) {
    const prompt = prompts[messageType];
    if (!prompt) {
        throw new Error(`Unknown message type: ${messageType}`);
    }

    const { api_key, model, base_url } = aiConfig || {};
    if (!api_key) {
        log('No AI API key configured — using core message as fallback.');
        return prompt.core;
    }

    const core = coreOverride || prompt.core;
    const tone = toneOverride || prompt.tone;
    const examples = (prompt.examples || []).slice(0, 2);
    const exampleText = examples.length > 0
        ? `\nStyle reference (match this vibe, don't copy verbatim):\n${examples.map(e => `  - "${e}"`).join('\n')}`
        : '';

    const systemPrompt =
        'You are a home announcement generator. Your job is to rephrase a simple ' +
        'household message in a creative, memorable way. Write 1-2 sentences — not just ' +
        'a few words. This is a voice broadcast over speakers, so it needs enough substance ' +
        'to be engaging. Output ONLY the rephrased message — no quotes, no attribution, ' +
        'no markdown, no explanation. Make it sound natural when spoken aloud.';

    const userPrompt =
        `Core message: "${core}"\nTone: ${tone}${exampleText}`;

    const apiUrl = `${(base_url || 'https://api.deepseek.com/v1').replace(/\/$/, '')}/chat/completions`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    // Retry once if content filter blocks the first attempt
    for (let attempt = 0; attempt < 2; attempt++) {
        const temp = attempt === 0 ? 0.9 : 0.7; // cooler retry
        try {
            const resp = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${api_key}`
                },
                body: JSON.stringify({
                    model: model || 'deepseek-chat',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    max_tokens: 150,
                    temperature: temp
                }),
                signal: controller.signal
            });

            if (!resp.ok) {
                const errText = await resp.text();
                log(`AI API error ${resp.status} on ${model || 'deepseek-chat'}: ${errText.substring(0, 200)}`);
                clearTimeout(timeout);
                return prompt.core;
            }

            const data = await resp.json();
            const rawText = (data.choices?.[0]?.message?.content || '').trim();
            const text = rawText.replace(/^["']|["']$/g, '');
            const finishReason = data.choices?.[0]?.finish_reason || 'none';

            if (text) {
                log(`AI variant for "${messageType}" (finish=${finishReason}, attempt=${attempt + 1}): "${text}"`);
                clearTimeout(timeout);
                return text;
            }

            // Empty content — if content-filter (finish_reason=length), retry once
            log(`AI empty content for "${messageType}" — finish_reason=${finishReason}, attempt=${attempt + 1}/2`);
            if (finishReason !== 'length') break; // only retry content-filter blocks

        } catch (e) {
            clearTimeout(timeout);
            if (e.name === 'AbortError') {
                log(`AI fetch timeout (15s) for "${messageType}" on ${model || 'deepseek-chat'} — using fallback`);
            } else {
                log(`AI fetch error: ${e.message}`);
            }
            return prompt.core;
        }
    }

    clearTimeout(timeout);
    return prompt.core;
}

// ─── ElevenLabs TTS ───────────────────────────────────────────────────────────

async function generateTTS(text, voiceId, elevenConfig, audioDir) {
    const { api_key } = elevenConfig || {};
    if (!api_key || !voiceId || !text) return null;

    const safeText = text.substring(0, 100).toLowerCase().replace(/[^a-z0-9]/g, '');
    const filename = `announce_${safeText}_${Date.now()}.mp3`;

    try {
        const resp = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
            {
                method: 'POST',
                headers: {
                    'xi-api-key':   api_key,
                    'Content-Type': 'application/json',
                    'Accept':       'audio/mpeg'
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_multilingual_v2',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.8,
                        use_speaker_boost: true
                    }
                })
            }
        );

        if (!resp.ok) {
            const errText = await resp.text();
            log(`ElevenLabs TTS error ${resp.status}: ${errText.substring(0, 200)}`);
            return null;
        }

        const audioBuffer = Buffer.from(await resp.arrayBuffer());
        const filePath = path.join(audioDir, filename);
        fs.writeFileSync(filePath, audioBuffer);
        log(`Audio saved: ${filename} (${audioBuffer.length} bytes)`);
        return filename;
    } catch (e) {
        log(`ElevenLabs TTS fetch error: ${e.message}`);
        return null;
    }
}

// ─── Main Handlers ────────────────────────────────────────────────────────────

async function generateAnnouncement(messageType, config, audioDir, opts = {}) {
    const aiConfig      = config.gemini || {};
    const elevenConfig  = config.elevenlabs || {};
    const audioBaseUrl  = (config.arr?.audio_base_url || 'https://audio.dadtv.me/audio').replace(/\/$/, '');
    const prompts       = getPrompts(config);

    // 1. Generate creative variant via AI
    const variant = await generateVariant(
        messageType, aiConfig, prompts, opts.coreOverride, opts.toneOverride
    );

    // 2. Pick random English voice
    const voices = await getEnglishVoices(elevenConfig);
    let voiceName = 'default';
    let voiceId = elevenConfig.voice_id;

    if (voices.length > 0) {
        const pick = voices[Math.floor(Math.random() * voices.length)];
        voiceName = pick.name;
        voiceId = pick.voice_id;
        log(`Random voice: ${voiceName} (${voiceId})`);
    } else {
        log('No random voices available — using configured default voice.');
    }

    // 3. Generate TTS audio
    const filename = await generateTTS(variant, voiceId, elevenConfig, audioDir);
    const audioUrl = filename ? `${audioBaseUrl}/${filename}` : null;

    return {
        original: prompts[messageType]?.core || '(custom)',
        variant,
        voice: voiceName,
        audio_url: audioUrl,
        filename: filename || null
    };
}

async function previewAnnouncement(messageType, config, opts = {}) {
    const aiConfig     = config.gemini || {};
    const elevenConfig = config.elevenlabs || {};
    const prompts      = getPrompts(config);

    const variant = await generateVariant(
        messageType, aiConfig, prompts, opts.coreOverride, opts.toneOverride
    );

    const voices = await getEnglishVoices(elevenConfig);
    const voiceName = voices.length > 0
        ? voices[Math.floor(Math.random() * voices.length)].name
        : '(default voice)';

    return {
        type: messageType,
        original: prompts[messageType]?.core || '(custom)',
        variant,
        would_use_voice: voiceName
    };
}

module.exports = {
    DEFAULT_PROMPTS,
    getPrompts,
    getAnnouncementsConfig,
    listMessageTypes,
    generateHAConfig,
    generateAnnouncement,
    previewAnnouncement,
    getEnglishVoices
};
