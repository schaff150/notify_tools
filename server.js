const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const ts = () => new Date().toISOString().replace('T', ' ').substring(0, 23);
console.log(`[${ts()}] === Notify Tools server.js v1.0 ===`);

const app = express();
const PORT = process.env.PORT || 8085;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Fallback: Jellyfin sends webhooks as text/plain (not application/json).
// express.text captures anything that express.json didn't consume.
app.use(express.text({ type: '*/*', limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
// Serve generated audio files publicly at /audio/<filename>
// e.g. https://audio.dadtv.me/audio/jellydad_anna_1234.mp3
app.use('/audio', express.static(path.join(__dirname, 'audio')));

// ─── Directory Setup ──────────────────────────────────────────────────────────

const dataDir = path.join(__dirname, 'data');
const audioDir = path.join(__dirname, 'audio');
[dataDir, audioDir].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ─── Config Bootstrap ─────────────────────────────────────────────────────────

const configFile = path.join(dataDir, 'config.json');

const defaultConfig = {
    // Global user → phone mapping (used by ALL tools)
    notify_map: [
        { tag: 'notify-dad', phone: '' },
        { tag: 'notify-anna', phone: '' },
        { tag: 'notify-jack', phone: '' },
        { tag: 'notify-gin', phone: '' }
    ],
    // Overseerr username → notify tag mapping
    seerr_user_map: [
        { seerr_username: '1-geocode',   tag: 'notify-dad' },
        { seerr_username: '2-jellyanna', tag: 'notify-anna' },
        { seerr_username: '4-jellyjack', tag: 'notify-jack' },
        { seerr_username: '3-jellygin',  tag: 'notify-gin' }
    ],
    jellyfin: {
        enable: false,
        url: 'http://192.168.0.87:8096',
        api_key: ''
    },
    sonarr: {
        enable: false,
        url: '',         // e.g. http://192.168.0.87:8989
        api_key: '',
        recipients: 'all'   // 'all' or comma-separated tag names e.g. 'notify-dad,notify-anna'
    },
    radarr: {
        enable: false,
        url: '',         // e.g. http://192.168.0.87:7878
        api_key: '',
        recipients: 'all'
    },
    arr: {
        gemini_personality: 'You are a friendly home media server assistant. Keep messages brief and natural.',
        audio_base_url: ''  // e.g. https://yourdomain.com/audio — must be publicly accessible for MMS
    },
    sms_gateway: {
        base_url:  '',   // Local: "http://192.168.0.X:8080"  |  Cloud: "https://api.sms-gate.app"
        username:  '',   // Shown on the app Home screen
        password:  ''    // Shown on the app Home screen
    },
    email_sms: {
        smtp_host: 'smtp.gmail.com',
        smtp_port: 587,
        smtp_user: '',          // Gmail address (e.g. you@gmail.com)
        smtp_pass: '',          // Gmail App Password (not your regular password)
        from_name: 'JellyDad',  // Shows as sender name
        carrier_gateway: 'msg.fi.google.com'   // Google Fi SMS gateway
    },
    elevenlabs: {
        api_key: '',
        voice_id: 'EXAVITQu4vr4xnSDxMaL'  // Default: "Bella" voice
    },
    gemini: {
        api_key: '',
        model:   'deepseek-v4-flash',
        base_url: 'https://api.deepseek.com/v1'   // OpenAI-compatible endpoint
    },
    ha: {
        host: '192.168.0.138',
        port: 22,
        user: 'root',
        ssh_key: '/app/ssh/id_ed25519',     // mount private key here
        api_token: '',                       // HA long-lived access token
        speaker: 'media_player.upstairs_landing_speaker'
    }
};

// Initialize config if missing, otherwise non-destructively merge new defaults
if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
    console.log(`[${ts()}] [config] Created default config.json`);
} else {
    try {
        const existing = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        let changed = false;
        for (const key of Object.keys(defaultConfig)) {
            if (existing[key] === undefined) {
                existing[key] = defaultConfig[key];
                changed = true;
                console.log(`[${ts()}] [config] Seeded missing key: ${key}`);
            }
        }
        if (changed) fs.writeFileSync(configFile, JSON.stringify(existing, null, 2));
    } catch (e) {
        console.error(`[${ts()}] [config] Merge error:`, e.message);
    }
}

// ─── Load Workflows ───────────────────────────────────────────────────────────

const { handleJellyfinWebhook } = require('./workflows/jellyfin');
const { handleArrWebhook }      = require('./workflows/arr_webhook');
const famguessr                 = require('./workflows/famguessr');
const announcements             = require('./workflows/announcements');

// ─── Config API ───────────────────────────────────────────────────────────────

app.get('/api/config', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        res.json(config);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read config' });
    }
});

app.post('/api/config', (req, res) => {
    try {
        const oldConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const wasFgEnabled = oldConfig.famguessr?.enable;
        fs.writeFileSync(configFile, JSON.stringify(req.body, null, 2));
        console.log(`[${ts()}] [config] Configuration saved.`);
        // Toggle Famguessr scheduler if enable state changed
        const newFgEnabled = req.body.famguessr?.enable;
        if (wasFgEnabled !== newFgEnabled) {
            if (newFgEnabled) {
                console.log(`[${ts()}] [config] Famguessr enabled — starting scheduler.`);
                famguessr.setupScheduler(dataDir);
            } else {
                console.log(`[${ts()}] [config] Famguessr disabled — stopping scheduler.`);
                famguessr.stopScheduler();
            }
        }
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to write config' });
    }
});

// ─── Webhook Routes ───────────────────────────────────────────────────────────

app.post('/api/webhooks/jellyfin', async (req, res) => {
    // Always respond 200 immediately so Jellyfin doesn't retry
    res.status(200).send('OK');
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (!config.jellyfin?.enable) {
            console.log(`[${ts()}] [jellyfin] Webhook received but tool is disabled.`);
            return;
        }

        // Jellyfin sends webhooks as text/plain, not application/json.
        // express.json() only fires on Content-Type: application/json, so we
        // may receive the body as a raw string — coerce it here.
        const contentType = req.headers['content-type'] || '(none)';
        console.log(`[${ts()}] [jellyfin] Incoming Content-Type: ${contentType}`);

        let body = req.body;
        if (typeof body === 'string') {
            console.log(`[${ts()}] [jellyfin] Body arrived as string — parsing as JSON.`);
            try {
                body = JSON.parse(body);
            } catch (parseErr) {
                console.error(`[${ts()}] [jellyfin] Failed to parse body string as JSON: ${parseErr.message}`);
                console.error(`[${ts()}] [jellyfin] Raw body: ${String(body).substring(0, 500)}`);
                return;
            }
        } else if (!body || typeof body !== 'object' || Array.isArray(body)) {
            console.error(`[${ts()}] [jellyfin] Unexpected body type: ${typeof body} — value: ${JSON.stringify(body)}`);
            return;
        }

        await handleJellyfinWebhook(body, config, dataDir);
    } catch (e) {
        console.error(`[${ts()}] [jellyfin webhook] Unhandled error:`, e.message);
    }
});

app.post('/api/webhooks/sonarr', async (req, res) => {
    res.status(200).send('OK');
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (!config.sonarr?.enable) {
            console.log(`[${ts()}] [sonarr] Webhook received but tool is disabled.`);
            return;
        }
        await handleArrWebhook(req.body, config, 'sonarr', audioDir, dataDir);
    } catch (e) {
        console.error(`[${ts()}] [sonarr webhook] Unhandled error:`, e.message);
    }
});

app.post('/api/webhooks/radarr', async (req, res) => {
    res.status(200).send('OK');
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (!config.radarr?.enable) {
            console.log(`[${ts()}] [radarr] Webhook received but tool is disabled.`);
            return;
        }
        await handleArrWebhook(req.body, config, 'radarr', audioDir, dataDir);
    } catch (e) {
        console.error(`[${ts()}] [radarr webhook] Unhandled error:`, e.message);
    }
});

// ─── Test / Utility API ───────────────────────────────────────────────────────

// Send a test SMS to a specific tag's phone number
app.post('/api/test/sms', async (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const { tag } = req.body;
        const { sendSMS, sendEmailSMS } = require('./notifier');

        const entry = (config.notify_map || []).find(m => m.tag === tag);
        if (!entry?.phone) {
            return res.status(400).json({ error: `Tag "${tag}" not found or has no phone number configured.` });
        }

        // Try email-to-SMS first if configured
        if (config.email_sms?.smtp_user && config.email_sms?.smtp_pass) {
            await sendEmailSMS(
                entry.phone,
                '🎬 JellyDad is online! Test notification working perfectly.',
                null,
                config.email_sms
            );
            res.json({ success: true, message: `Test email-to-SMS sent to ${entry.phone}@${config.email_sms.carrier_gateway}` });
        } else {
            await sendSMS(
                entry.phone,
                '🎬 JellyDad is online! Test notification working perfectly.',
                null,
                config.sms_gateway
            );
            res.json({ success: true, message: `Test SMS sent to ${entry.phone}` });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// List available AI models from the configured endpoint
app.get('/api/test/gemini-models', async (req, res) => {
    try {
        const config  = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const aiCfg   = config.gemini || {};
        const apiKey  = aiCfg.api_key;
        const baseUrl = (aiCfg.base_url || 'https://api.deepseek.com/v1').replace(/\/$/, '');
        if (!apiKey) return res.status(400).json({ error: 'No AI API key configured.' });

        const resp = await fetch(`${baseUrl}/models`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch { data = {}; }

        if (!resp.ok) {
            const errMsg = typeof data.error === 'object' ? JSON.stringify(data.error) : (data.error || text);
            return res.status(resp.status).json({ error: String(errMsg).substring(0, 500) });
        }
        const models = (data.data || [])
            .filter(m => m.id && !m.id.includes('embed') && !m.id.includes('moderation'))
            .map(m => m.id)
            .sort();
        if (models.length === 0) return res.json({ models: ['(no models returned)'] });
        res.json({ models });
    } catch (e) {
        res.status(500).json({ error: e.message || String(e) });
    }
});

// Simulate a Jellyfin ItemAdded event for testing
app.post('/api/test/jellyfin-mock', async (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const { type, tag } = req.body; // type: 'movie' | 'episode'

        const mockMovie = {
            NotificationType: 'ItemAdded',
            Name: 'The Grand Budapest Hotel',
            ItemId: 'mock-item-id',
            Tags: [tag || 'notify-dad']
        };
        const mockEpisode = {
            NotificationType: 'ItemAdded',
            Name: 'Pilot',
            SeriesName: 'Breaking Bad',
            SeasonNumber: 1,
            EpisodeNumber: 1,
            ItemId: 'mock-item-id',
            Tags: [tag || 'notify-dad']
        };

        const payload = type === 'episode' ? mockEpisode : mockMovie;
        await handleJellyfinWebhook(payload, config, dataDir);
        res.json({ success: true, message: 'Mock Jellyfin webhook processed. Check server logs.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Simulate a Radarr MovieAdded event — runs the full pipeline (Gemini → ElevenLabs → SMS)
app.post('/api/test/arr-mock', async (req, res) => {
    // Respond immediately — this can take 10-20s with Gemini + ElevenLabs
    res.json({ success: true, message: 'Arr test fired — check server logs and your phone shortly.' });
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

        // Remove the dedup history entry for this test movie so repeated tests work
        const historyFile = require('path').join(dataDir, 'arr_history.json');
        if (fs.existsSync(historyFile)) {
            let history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
            history = history.filter(h => !h.startsWith('radarr::Interstellar'));
            fs.writeFileSync(historyFile, JSON.stringify(history));
        }

        const mockPayload = {
            eventType: 'MovieAdded',
            movie: {
                title:  'Interstellar',
                year:   2014,
                genres: ['Science Fiction', 'Adventure', 'Drama']
            }
        };

        // Override type to radarr and send to Dad for testing.
        // Clear url/api_key so the API tag lookup is skipped (the mock has no movie.id anyway).
        const testConfig = { ...config, radarr: { ...config.radarr, enable: true, url: '', api_key: '', recipients: 'notify-dad' } };
        await handleArrWebhook(mockPayload, testConfig, 'radarr', audioDir, dataDir);
    } catch (e) {
        console.error('[arr-mock test] Error:', e.message);
    }
});

// ─── Famguessr Routes ──────────────────────────────────────────────────────────

// Get famguessr config section
app.get('/api/famguessr/config', (req, res) => {
    try {
        const fc = famguessr.getFamguessrConfig(dataDir);
        res.json(fc);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read famguessr config: ' + e.message });
    }
});

// Save famguessr config (enable, message_template, etc.)
app.post('/api/famguessr/config', (req, res) => {
    try {
        const fullConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        fullConfig.famguessr = { ...fullConfig.famguessr, ...req.body };
        fs.writeFileSync(configFile, JSON.stringify(fullConfig, null, 2));
        console.log(`[${ts()}] [famguessr] Config saved.`);

        // Handle enable/disable toggle: start or stop scheduler
        if (req.body.enable !== undefined) {
            if (req.body.enable) {
                famguessr.setupScheduler(dataDir);
            } else {
                famguessr.stopScheduler();
            }
        }

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to save famguessr config: ' + e.message });
    }
});

// Manually trigger a Famguessr send now
app.post('/api/famguessr/send', async (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const { sendEmailSMS } = require('./notifier');
        const result = await famguessr.sendFamguessr(config, dataDir, { sendEmailSMS }, true);
        if (result.success) {
            res.json({ success: true, place: result.place, sentCount: result.sentCount, message: result.message });
        } else {
            res.status(500).json({ error: result.error || 'Send failed' });
        }
    } catch (e) {
        console.error(`[${ts()}] [famguessr] Manual send error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Send a test Famguessr to Dad only
app.post('/api/famguessr/test-dad', async (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const { sendEmailSMS } = require('./notifier');
        const result = await famguessr.sendFamguessrToTag(config, 'notify-dad', dataDir, { sendEmailSMS });
        if (result.success) {
            res.json({ success: true, message: result.message, place: result.place, tag: result.tag });
        } else {
            res.status(500).json({ error: result.error || 'Test send failed' });
        }
    } catch (e) {
        console.error(`[${ts()}] [famguessr] Test-to-Dad error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Get scheduler status
app.get('/api/famguessr/status', (req, res) => {
    try {
        const status = famguessr.getStatus(dataDir);
        res.json(status);
    } catch (e) {
        res.status(500).json({ error: 'Failed to get famguessr status: ' + e.message });
    }
});

// Preview today's message without sending
app.get('/api/famguessr/preview', async (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const fc = famguessr.getFamguessrConfig(dataDir);
        const place = famguessr.CITIES[Math.floor(Math.random() * famguessr.CITIES.length)];

        // Synchronous — uses Intl, no network dependency
        const localData = famguessr.getLocalTimeAndDay(place.timezone);
        const nyDay = famguessr.getNyDay();

        const effectiveLocalData = localData || { time: 'local time', day: null, date: null };
        const message = famguessr.buildMessage(
            place,
            effectiveLocalData,
            nyDay,
            fc.message_template
        );

        res.json({
            place: { city: place.city, country: place.country, timezone: place.timezone, emoji: place.emoji },
            localTime: effectiveLocalData.time,
            localDay: effectiveLocalData.day,
            nyDay: nyDay,
            dayDiffers: nyDay && effectiveLocalData.day ? effectiveLocalData.day !== nyDay : null,
            message
        });
    } catch (e) {
        res.status(500).json({ error: 'Failed to generate preview: ' + e.message });
    }
});

// ─── HA Auto-Deploy ────────────────────────────────────────────────────────────

const { execSync } = require('child_process');

/**
 * Push announcements.yaml to Home Assistant via SCP and reload scripts via API.
 * Silently fails if HA is unreachable or not configured.
 */
async function pushToHA(config) {
    const ha = config.ha || {};
    if (!ha.host || !ha.ssh_key || !ha.api_token) {
        console.log(`[${ts()}] [announcements] HA push skipped — host/ssh_key/api_token not configured.`);
        return;
    }

    const fs = require('fs');
    if (!fs.existsSync(ha.ssh_key)) {
        console.log(`[${ts()}] [announcements] HA push skipped — SSH key not found at ${ha.ssh_key}`);
        return;
    }

    try {
        // 1. Generate YAML
        const yaml = announcements.generateHAConfig(config, ha.speaker);

        // 2. Write temp file
        const tmpFile = '/tmp/announcements.yaml';
        fs.writeFileSync(tmpFile, yaml);

        // 3. SCP to HA
        const host = ha.host;
        const port = ha.port || 22;
        const user = ha.user || 'root';
        const target = `${user}@${host}:/config/packages/announcements.yaml`;

        console.log(`[${ts()}] [announcements] SCP to HA: ${target}`);
        execSync(
            `scp -o StrictHostKeyChecking=accept-new -o IdentitiesOnly=yes -i ${ha.ssh_key} -P ${port} ${tmpFile} ${target}`,
            { timeout: 15000 }
        );
        console.log(`[${ts()}] [announcements] ✅ YAML pushed to HA.`);

        // 4. Reload scripts via HA REST API
        const reloadResp = await fetch(`http://${host}:8123/api/services/homeassistant/reload_all`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${ha.api_token}`,
                'Content-Type': 'application/json'
            }
        });
        if (reloadResp.ok) {
            console.log(`[${ts()}] [announcements] ✅ HA scripts reloaded.`);
        } else {
            console.log(`[${ts()}] [announcements] HA reload returned ${reloadResp.status} — scripts may need manual reload.`);
        }

        // Clean up temp file
        fs.unlinkSync(tmpFile);
    } catch (e) {
        console.error(`[${ts()}] [announcements] HA push failed: ${e.message}`);
        // Silently fail — user still gets "config saved" confirmation
    }
}

// ─── Announcements Routes ──────────────────────────────────────────────────────

// List available announcement types
app.get('/api/announcements/types', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        res.json(announcements.listMessageTypes(config));
    } catch (e) {
        res.status(500).json({ error: 'Failed to list announcement types: ' + e.message });
    }
});

// Get/set announcement config (prompts, etc.)
app.get('/api/announcements/config', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        res.json(announcements.getAnnouncementsConfig(config));
    } catch (e) {
        res.status(500).json({ error: 'Failed to read announcements config: ' + e.message });
    }
});

app.post('/api/announcements/config', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        config.announcements = { ...config.announcements, ...req.body };
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        console.log(`[${ts()}] [announcements] Config saved.`);

        // Auto-push to HA if configured
        pushToHA(config).catch(e => console.error(`[${ts()}] [announcements] HA push error: ${e.message}`));

        res.json({ success: true });
    } catch (e) {
        console.error(`[${ts()}] [announcements] Config save error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Generate full announcement (LLM variant → ElevenLabs TTS → MP3)
app.post('/api/announcements/generate/:type', async (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const { core, tone } = req.body || {};

        const result = await announcements.generateAnnouncement(
            req.params.type, config, audioDir, { coreOverride: core, toneOverride: tone }
        );

        res.json(result);
    } catch (e) {
        console.error(`[${ts()}] [announcements] Generate error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Preview announcement text only (no audio generated)
app.get('/api/announcements/preview/:type', async (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const result = await announcements.previewAnnouncement(req.params.type, config);
        res.json(result);
    } catch (e) {
        console.error(`[${ts()}] [announcements] Preview error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// List available random English voices (from ElevenLabs)
app.get('/api/announcements/voices', async (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const voices = await announcements.getEnglishVoices(config.elevenlabs || {});
        res.json({
            count: voices.length,
            voices: voices.map(v => ({ name: v.name, voice_id: v.voice_id, category: v.category }))
        });
    } catch (e) {
        console.error(`[${ts()}] [announcements] Voices error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Generate Home Assistant packages/announcements.yaml from current prompts
app.get('/api/announcements/ha-config', (req, res) => {
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const speaker = req.query.speaker || undefined;
        const yaml = announcements.generateHAConfig(config, speaker);
        res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="announcements.yaml"');
        res.send(yaml);
    } catch (e) {
        console.error(`[${ts()}] [announcements] HA config error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Notify Tools running on port ${PORT}`);
    console.log(`  Jellyfin webhook: POST /api/webhooks/jellyfin`);
    console.log(`  Sonarr webhook:   POST /api/webhooks/sonarr`);
    console.log(`  Radarr webhook:   POST /api/webhooks/radarr`);

    // Bootstrap Famguessr scheduler if enabled
    try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (config.famguessr?.enable) {
            console.log(`[${ts()}] [famguessr] Bootstrapping scheduler on startup...`);
            famguessr.setupScheduler(dataDir);
        } else {
            console.log(`[${ts()}] [famguessr] Disabled — scheduler not started.`);
        }
    } catch (e) {
        console.error(`[${ts()}] [famguessr] Bootstrap error: ${e.message}`);
    }
});
