const fs   = require('fs');
const path = require('path');
const { sendSMS } = require('../notifier');

// ─── Logger ───────────────────────────────────────────────────────────────────

function ts() {
    return new Date().toISOString().replace('T', ' ').substring(0, 23);
}

function log(msg)  { console.log(`[${ts()}] [jellyfin] ${msg}`); }
function warn(msg) { console.warn(`[${ts()}] [jellyfin] ⚠ ${msg}`); }
function err(msg)  { console.error(`[${ts()}] [jellyfin] ✗ ${msg}`); }

// ─── History Helpers ──────────────────────────────────────────────────────────

function loadHistory(historyFile) {
    if (fs.existsSync(historyFile)) {
        try { return JSON.parse(fs.readFileSync(historyFile, 'utf8')); }
        catch (e) { err(`Error reading history: ${e.message}`); }
    }
    return [];
}

function saveHistory(historyFile, history) {
    try { fs.writeFileSync(historyFile, JSON.stringify(history)); }
    catch (e) { err(`Error saving history: ${e.message}`); }
}

// ─── Jellyfin API ─────────────────────────────────────────────────────────────

async function getTagsFromApi(jellyfinUrl, apiKey, itemId, label) {
    if (!itemId || !apiKey || !jellyfinUrl) {
        log(`API tag fetch skipped for ${label} — missing itemId, apiKey, or url.`);
        return [];
    }
    const url = `${jellyfinUrl}/Items?Ids=${itemId}&Fields=Tags&api_key=${apiKey}`;
    log(`Fetching tags from Jellyfin API for ${label} (id: ${itemId})…`);
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            warn(`Jellyfin API returned HTTP ${resp.status} for ${label} (id: ${itemId})`);
            return [];
        }
        const data = await resp.json();
        if (data.Items && data.Items.length > 0) {
            const tags = data.Items[0].Tags || [];
            log(`  API tags for ${label}: [${tags.join(', ') || '(none)'}]`);
            return tags;
        } else {
            warn(`  Jellyfin API returned no Items for ${label} (id: ${itemId})`);
        }
    } catch (e) {
        err(`Error fetching tags for ${label} (id: ${itemId}): ${e.message}`);
    }
    return [];
}

// ─── Message Builder ──────────────────────────────────────────────────────────

function buildMessage(data) {
    const isTv = !!data.SeriesName;
    const name = data.Name || 'Unknown';

    if (isTv) {
        const series = data.SeriesName;
        const s = String(data.SeasonNumber || 0).padStart(2, '0');
        const e = String(data.EpisodeNumber || 0).padStart(2, '0');
        const variants = [
            `🎬 Oh Yeah! ${series} S${s}E${e} - "${name}" just dropped on JellyDad!`,
            `📺 JellyDad here! ${series} (S${s}E${e}) is ready to watch. Enjoy!`,
            `🎉 ${series} S${s}E${e} "${name}" just landed on JellyDad!`
        ];
        return variants[Math.floor(Math.random() * variants.length)];
    } else {
        const variants = [
            `🎬 Oh Yeah! The movie "${name}" just dropped on JellyDad!`,
            `🍿 JellyDad here! "${name}" is now ready. Grab the popcorn!`,
            `🎉 "${name}" just landed on JellyDad. Enjoy the show!`
        ];
        return variants[Math.floor(Math.random() * variants.length)];
    }
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

async function handleJellyfinWebhook(data, config, dataDir) {
    const historyFile = path.join(dataDir, 'jellyfin_history.json');

    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    log('Webhook received — full payload:');
    log(JSON.stringify(data, null, 2));
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // ── Step 1: Gate on event type ────────────────────────────────────────────
    const notifType = data.NotificationType || '';
    log(`Step 1 — NotificationType: "${notifType}"`);
    if (notifType && notifType !== 'ItemAdded') {
        log(`  → Ignored (not ItemAdded). Done.`);
        return;
    }

    // ── Step 2: Extract core fields ───────────────────────────────────────────
    const itemName = data.Name    || 'Unknown Item';
    const itemId   = data.ItemId  || '';
    const seriesId = data.SeriesId || '';
    const isTv     = !!data.SeriesName;

    log(`Step 2 — Core fields:`);
    log(`  Name:      "${itemName}"`);
    log(`  ItemId:    "${itemId || '(empty)'}"`);
    log(`  SeriesId:  "${seriesId || '(empty)'}"`);
    log(`  SeriesName:"${data.SeriesName || '(none)'}"`);
    log(`  Type:      ${isTv ? 'TV Episode' : 'Movie'}`);

    // Build dedup key — based on content identity, not Jellyfin item ID
    const mediaUid = isTv
        ? `${data.SeriesName}_S${data.SeasonNumber || 0}E${data.EpisodeNumber || 0}`
        : itemName;
    log(`  DedupeKey: "${mediaUid}"`);

    // ── Step 3: Collect tags from all sources ─────────────────────────────────
    function cleanTags(val, source) {
        if (!val) return [];
        const raw = Array.isArray(val)
            ? val.map(v => String(v).trim()).filter(Boolean)
            : String(val).split(',').map(t => t.trim()).filter(Boolean);
        if (raw.length > 0) {
            log(`  Tags from ${source}: [${raw.join(', ')}]`);
        } else {
            log(`  Tags from ${source}: (none / empty)`);
        }
        return raw;
    }

    log(`Step 3 — Collecting tags from all sources:`);

    // Detect missing Tags field — this happens when the Jellyfin webhook template
    // does not include {{Tags}} / {{SeriesTags}}. Without these, Jellyfin-tag-based
    // routing (e.g. "notify-gin") can ONLY work via the API fallback below.
    if (data.Tags === undefined && data.SeriesTags === undefined) {
        warn(`  !! payload.Tags and payload.SeriesTags are BOTH MISSING from the webhook.`);
        warn(`  !! This means Jellyfin tag routing (notify-gin, etc.) depends ENTIRELY on the API fallback.`);
        warn(`  !! FIX: Add  "Tags": "{{Tags}}"  and  "SeriesTags": "{{SeriesTags}}"  to the Jellyfin webhook template.`);
    }

    let tags = [
        ...cleanTags(data.Tags,       'payload.Tags'),
        ...cleanTags(data.SeriesTags, 'payload.SeriesTags')
    ];

    // Augment with tags fetched directly from the Jellyfin API
    if (itemId) {
        if (!config.jellyfin?.api_key) {
            warn(`  Skipping Jellyfin API call for ItemId — no api_key configured`);
        } else {
            tags.push(...await getTagsFromApi(config.jellyfin.url, config.jellyfin.api_key, itemId, 'Item'));
        }
    } else {
        log(`  ItemId is empty — skipping item API call`);
    }

    if (seriesId) {
        if (!config.jellyfin?.api_key) {
            warn(`  Skipping Jellyfin API call for SeriesId — no api_key configured`);
        } else {
            tags.push(...await getTagsFromApi(config.jellyfin.url, config.jellyfin.api_key, seriesId, 'Series'));
        }
    } else {
        log(`  SeriesId is empty — skipping series API call`);
    }

    // If Overseerr sent the webhook, map the requester username to a notify tag
    const seerrUser = data.requestedBy_username;
    if (seerrUser) {
        log(`  Overseerr requestedBy_username: "${seerrUser}" — adding to tag list`);
        tags.push(seerrUser);
    } else {
        log(`  No requestedBy_username in payload`);
    }

    log(`  All collected tags before mapping: [${tags.join(', ') || '(none)'}]`);

    // ── Step 4: Resolve tags through seerr → notify-tag map ──────────────────
    log(`Step 4 — Resolving via seerr_user_map:`);
    const seerrMap = {};
    (config.seerr_user_map || []).forEach(m => { seerrMap[m.seerr_username] = m.tag; });
    log(`  Configured seerr_user_map: ${JSON.stringify(seerrMap)}`);

    const finalTags = new Set();
    for (const tag of tags) {
        const mapped = seerrMap[tag];
        if (mapped) {
            log(`  "${tag}" → mapped to "${mapped}"`);
            finalTags.add(mapped);
        } else {
            finalTags.add(tag);
        }
    }
    log(`  Final resolved tags: [${[...finalTags].join(', ') || '(none)'}]`);

    // ── Step 5: Resolve notify-tags to phone numbers ──────────────────────────
    log(`Step 5 — Resolving tags to phone numbers via notify_map:`);
    const notifyMap = {};
    (config.notify_map || []).forEach(m => {
        if (m.phone) {
            notifyMap[m.tag] = m.phone;
        } else {
            warn(`  notify_map entry "${m.tag}" has no phone number configured — will be skipped`);
        }
    });
    log(`  Configured notify_map (tags with phones): [${Object.keys(notifyMap).join(', ') || '(none)'}]`);

    // ── Step 6: Send notifications ────────────────────────────────────────────
    log(`Step 6 — Processing ${finalTags.size} resolved tag(s)…`);
    const history  = loadHistory(historyFile);
    let sentCount  = 0;
    let skipCount  = 0;
    let missCount  = 0;

    for (const tag of finalTags) {
        const phone = notifyMap[tag];
        if (!phone) {
            warn(`  Tag "${tag}" not found in notify_map (or no phone set) — skipping`);
            missCount++;
            continue;
        }

        const histKey = `${phone}::${mediaUid}`;
        if (history.includes(histKey)) {
            log(`  Tag "${tag}" → ${phone}: Already notified about "${mediaUid}" — skipping (dedup)`);
            skipCount++;
            continue;
        }

        log(`  Tag "${tag}" → ${phone}: Sending SMS…`);
        try {
            const message = buildMessage(data);
            log(`  Message: "${message}"`);
            await sendSMS(phone, message, null, config.sms_gateway);
            history.push(histKey);
            sentCount++;

            // Trim history to last 2000 entries
            if (history.length > 2000) history.splice(0, history.length - 2000);
            saveHistory(historyFile, history);
        } catch (e) {
            err(`  Failed to send to ${phone} (tag "${tag}"): ${e.message}`);
        }
    }

    // ── Step 7: Summary ───────────────────────────────────────────────────────
    log(`Step 7 — Done. Sent: ${sentCount}, Skipped (dedup): ${skipCount}, No phone/tag: ${missCount}`);
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

module.exports = { handleJellyfinWebhook };
