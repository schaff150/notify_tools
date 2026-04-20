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
        recipients: 'all'   // 'all' or comma-separated tag names e.g. 'notify-dad,notify-anna'
    },
    radarr: {
        enable: false,
        recipients: 'all'
    },
    arr: {
        gemini_personality: 'You are JellyDad, an enthusiastic and fun home media server announcer. Keep messages short and family-friendly.',
        audio_base_url: ''  // e.g. https://yourdomain.com/audio — must be publicly accessible for MMS
    },
    sms_gateway: {
        base_url:  '',   // Local: "http://192.168.0.X:8080"  |  Cloud: "https://api.sms-gate.app"
        username:  '',   // Shown on the app Home screen
        password:  ''    // Shown on the app Home screen
    },
    elevenlabs: {
        api_key: '',
        voice_id: 'EXAVITQu4vr4xnSDxMaL'  // Default: "Bella" voice
    },
    gemini: {
        api_key: '',
        model:   'gemini-1.5-flash'  // Change here if you need a different model
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
        fs.writeFileSync(configFile, JSON.stringify(req.body, null, 2));
        console.log(`[${ts()}] [config] Configuration saved.`);
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
        await handleJellyfinWebhook(req.body, config, dataDir);
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
        const { sendSMS } = require('./notifier');

        const entry = (config.notify_map || []).find(m => m.tag === tag);
        if (!entry?.phone) {
            return res.status(400).json({ error: `Tag "${tag}" not found or has no phone number configured.` });
        }

        await sendSMS(
            entry.phone,
            '🎬 JellyDad is online! Test notification working perfectly.',
            null,
            config.sms_gateway
        );
        res.json({ success: true, message: `Test SMS sent to ${entry.phone}` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// List available Gemini models for the configured API key
app.get('/api/test/gemini-models', async (req, res) => {
    try {
        const config  = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        const apiKey  = config.gemini?.api_key;
        if (!apiKey) return res.status(400).json({ error: 'No Gemini API key configured.' });

        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        const data = await resp.json();
        if (!resp.ok) return res.status(resp.status).json(data);

        // Filter to only generateContent-capable models, sort by name
        const models = (data.models || [])
            .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
            .map(m => m.name.replace('models/', ''))
            .sort();
        res.json({ models });
    } catch (e) {
        res.status(500).json({ error: e.message });
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

        // Override type to radarr and restrict to Gin only for testing
        const testConfig = { ...config, radarr: { ...config.radarr, enable: true, recipients: 'notify-gin' } };
        await handleArrWebhook(mockPayload, testConfig, 'radarr', audioDir, dataDir);
    } catch (e) {
        console.error('[arr-mock test] Error:', e.message);
    }
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Notify Tools running on port ${PORT}`);
    console.log(`  Jellyfin webhook: POST /api/webhooks/jellyfin`);
    console.log(`  Sonarr webhook:   POST /api/webhooks/sonarr`);
    console.log(`  Radarr webhook:   POST /api/webhooks/radarr`);
});
