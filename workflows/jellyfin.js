const fs   = require('fs');
const path = require('path');
const { sendSMS } = require('../notifier');

function log(msg) { console.log(`[jellyfin] ${msg}`); }

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

// ─── Jellyfin API ─────────────────────────────────────────────────────────────

async function getTagsFromApi(jellyfinUrl, apiKey, itemId) {
    if (!itemId || !apiKey || !jellyfinUrl) return [];
    const url = `${jellyfinUrl}/Items?Ids=${itemId}&Fields=Tags&api_key=${apiKey}`;
    try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (data.Items && data.Items.length > 0) {
            return data.Items[0].Tags || [];
        }
    } catch (e) {
        log(`Error fetching tags for ${itemId}: ${e.message}`);
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

    // Only handle ItemAdded events
    const notifType = data.NotificationType || '';
    if (notifType && notifType !== 'ItemAdded') {
        log(`Ignored event type: ${notifType}`);
        return;
    }

    const itemName  = data.Name || 'Unknown Item';
    const itemId    = data.ItemId || '';
    const seriesId  = data.SeriesId || '';
    const isTv      = !!data.SeriesName;

    log(`Received: ${itemName}`);

    // Build dedup key — based on content identity, not Jellyfin item ID
    // (prevents firing twice when Tdarr re-encodes the file)
    const mediaUid = isTv
        ? `${data.SeriesName}_S${data.SeasonNumber || 0}E${data.EpisodeNumber || 0}`
        : itemName;

    // Collect tags from webhook payload (tags can come in as a string or array)
    function cleanTags(val) {
        if (!val) return [];
        if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
        return String(val).split(',').map(t => t.trim()).filter(Boolean);
    }

    let tags = [
        ...cleanTags(data.Tags),
        ...cleanTags(data.SeriesTags)
    ];

    // Augment with tags fetched directly from the Jellyfin API
    if (itemId)  tags.push(...await getTagsFromApi(config.jellyfin.url, config.jellyfin.api_key, itemId));
    if (seriesId) tags.push(...await getTagsFromApi(config.jellyfin.url, config.jellyfin.api_key, seriesId));

    // If Overseerr sent the webhook, map the requester username to a notify tag
    const seerrUser = data.requestedBy_username;
    if (seerrUser) tags.push(seerrUser);

    // Build seerr → notify-tag lookup
    const seerrMap = {};
    (config.seerr_user_map || []).forEach(m => { seerrMap[m.seerr_username] = m.tag; });

    // Resolve all tags through the seerr map
    const finalTags = new Set();
    for (const tag of tags) {
        finalTags.add(seerrMap[tag] || tag);
    }

    log(`Resolved tags: ${[...finalTags].join(', ')}`);

    // Build notify-tag → phone lookup
    const notifyMap = {};
    (config.notify_map || []).forEach(m => { if (m.phone) notifyMap[m.tag] = m.phone; });

    const history = loadHistory(historyFile);
    let sentCount = 0;

    for (const tag of finalTags) {
        const phone = notifyMap[tag];
        if (!phone) continue;

        // Dedup check: skip if we've already notified this recipient about this exact media
        const histKey = `${phone}::${mediaUid}`;
        if (history.includes(histKey)) {
            log(`Already notified ${phone} about "${mediaUid}". Skipping.`);
            continue;
        }

        try {
            const message = buildMessage(data);
            await sendSMS(phone, message, null, config.sms_gateway);
            history.push(histKey);
            sentCount++;

            // Trim history to last 2000 entries
            if (history.length > 2000) history.splice(0, history.length - 2000);
            saveHistory(historyFile, history);
        } catch (e) {
            log(`Error sending to ${phone}: ${e.message}`);
        }
    }

    if (sentCount === 0) {
        log('No matching notify tags found, or all already notified.');
    } else {
        log(`Sent ${sentCount} notification(s) for "${mediaUid}".`);
    }
}

module.exports = { handleJellyfinWebhook };
