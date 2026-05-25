// ─── Tab Navigation ───────────────────────────────────────────────────────────

const PAGE_META = {
    'tab-jellyfin': { title: 'Jellyfin Notifier',    subtitle: 'Notify family members when new content appears on JellyDad.' },
    'tab-arr':      { title: 'Sonarr / Radarr',      subtitle: 'AI-powered announcements when shows or movies are added.' },
    'tab-settings': { title: 'Settings',              subtitle: 'Email-to-SMS, SMS Gateway, API keys, and system configuration.' },
    'tab-general':  { title: 'General Tools',         subtitle: 'Famguessr — daily geography reminder and other utilities.' }
};

document.querySelectorAll('.nav-links li').forEach(li => {
    li.addEventListener('click', () => {
        const tabId = li.dataset.tab;
        // Switch active nav
        document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
        li.classList.add('active');
        // Switch content
        document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
        document.getElementById(tabId)?.classList.add('active');
        // Update header
        const meta = PAGE_META[tabId] || {};
        document.getElementById('page-title').textContent     = meta.title    || '';
        document.getElementById('page-subtitle').textContent  = meta.subtitle || '';
    });
});

// ─── Webhook URL Generation ────────────────────────────────────────────────────

function setWebhookUrls() {
    const base = `${window.location.protocol}//${window.location.host}`;
    document.getElementById('jellyfin-webhook-url').textContent = `${base}/api/webhooks/jellyfin`;
    document.getElementById('sonarr-webhook-url').textContent   = `${base}/api/webhooks/sonarr`;
    document.getElementById('radarr-webhook-url').textContent   = `${base}/api/webhooks/radarr`;
}

setWebhookUrls();

function copyText(elementId) {
    const text = document.getElementById(elementId)?.textContent?.trim();
    if (text) {
        navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard!', 'info'));
    }
}

// ─── Toast System ─────────────────────────────────────────────────────────────

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    // Trigger animation
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('show'));
    });
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 350);
    }, 3500);
}

// ─── Config Load ──────────────────────────────────────────────────────────────

let currentConfig = {};

async function loadConfig() {
    try {
        const resp = await fetch('/api/config');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        currentConfig = await resp.json();
        populateUI(currentConfig);
    } catch (e) {
        showToast(`Failed to load config: ${e.message}`, 'error');
    }
}

function populateUI(cfg) {
    // ── Jellyfin
    setChecked('jellyfin-enable',    cfg.jellyfin?.enable    ?? false);
    setVal('jellyfin-url',           cfg.jellyfin?.url       ?? '');
    setVal('jellyfin-api-key',       cfg.jellyfin?.api_key   ?? '');

    // ── Notify Map table
    renderNotifyMap(cfg.notify_map || []);

    // ── Seerr Map table
    renderSeerrMap(cfg.seerr_user_map || []);

    // ── Sonarr / Radarr
    setChecked('sonarr-enable',      cfg.sonarr?.enable      ?? false);
    setVal('sonarr-url',             cfg.sonarr?.url         ?? '');
    setVal('sonarr-api-key',         cfg.sonarr?.api_key     ?? '');
    setVal('sonarr-recipients',      cfg.sonarr?.recipients  ?? 'all');
    setChecked('radarr-enable',      cfg.radarr?.enable      ?? false);
    setVal('radarr-url',             cfg.radarr?.url         ?? '');
    setVal('radarr-api-key',         cfg.radarr?.api_key     ?? '');
    setVal('radarr-recipients',      cfg.radarr?.recipients  ?? 'all');

    // ── Famguessr
    const fg = cfg.famguessr || {};
    setChecked('famguessr-enable',   fg.enable           ?? false);
    setVal('famguessr-template',     fg.message_template ?? 'Hey it is {day}{time} in {city}, {country}, have you done your FamGuessr yet?');

    // ── Arr AI / Audio
    setVal('arr-gemini-personality', cfg.arr?.gemini_personality ?? '');
    setVal('arr-audio-base-url',     cfg.arr?.audio_base_url    ?? '');

    // ── Email-to-SMS
    setVal('email-smtp-user',    cfg.email_sms?.smtp_user       ?? '');
    setVal('email-smtp-pass',    cfg.email_sms?.smtp_pass       ?? '');
    setVal('email-smtp-host',    cfg.email_sms?.smtp_host       ?? 'smtp.gmail.com');
    setVal('email-smtp-port',    cfg.email_sms?.smtp_port       ?? 587);
    setVal('email-from-name',    cfg.email_sms?.from_name       ?? 'JellyDad');
    setVal('email-carrier-gw',   cfg.email_sms?.carrier_gateway ?? 'msg.fi.google.com');

    // ── SMS Gateway
    setVal('sms-gw-url',             cfg.sms_gateway?.base_url  ?? '');
    setVal('sms-gw-user',            cfg.sms_gateway?.username  ?? '');
    setVal('sms-gw-pass',            cfg.sms_gateway?.password  ?? '');
    setVal('elevenlabs-key',         cfg.elevenlabs?.api_key  ?? '');
    setVal('elevenlabs-voice-id',    cfg.elevenlabs?.voice_id ?? '');
    setVal('gemini-key',             cfg.gemini?.api_key      ?? '');
    setVal('gemini-base-url',        cfg.gemini?.base_url     ?? 'https://api.deepseek.com/v1');
    setVal('gemini-model',           cfg.gemini?.model        ?? 'deepseek-v4-flash');

    // Update sidebar badges
    updateBadge('badge-jellyfin', cfg.jellyfin?.enable);
    updateBadge('badge-arr', cfg.sonarr?.enable || cfg.radarr?.enable);

    // Populate test SMS dropdown
    populateTestSmsDropdown(cfg.notify_map || []);
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
}

function setChecked(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
}

function updateBadge(id, active) {
    const el = document.getElementById(id);
    if (el) el.style.display = active ? 'inline-flex' : 'none';
}

// ─── Config Save ──────────────────────────────────────────────────────────────

document.getElementById('btn-save').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save');
    btn.innerHTML = '<span class="spinner"></span> Saving…';
    btn.disabled = true;

    const config = buildConfigFromUI();

    try {
        const resp = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        currentConfig = config;
        showToast('Configuration saved!', 'success');
        updateBadge('badge-jellyfin', config.jellyfin?.enable);
        updateBadge('badge-arr', config.sonarr?.enable || config.radarr?.enable);
        populateTestSmsDropdown(config.notify_map || []);
    } catch (e) {
        showToast(`Save failed: ${e.message}`, 'error');
    } finally {
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Save Configuration`;
        btn.disabled = false;
    }
});

function buildConfigFromUI() {
    return {
        notify_map:    collectNotifyMap(),
        seerr_user_map: collectSeerrMap(),
        jellyfin: {
            enable:  document.getElementById('jellyfin-enable').checked,
            url:     getVal('jellyfin-url'),
            api_key: getVal('jellyfin-api-key')
        },
        sonarr: {
            enable:     document.getElementById('sonarr-enable').checked,
            url:        getVal('sonarr-url'),
            api_key:    getVal('sonarr-api-key'),
            recipients: getVal('sonarr-recipients') || 'all'
        },
        radarr: {
            enable:     document.getElementById('radarr-enable').checked,
            url:        getVal('radarr-url'),
            api_key:    getVal('radarr-api-key'),
            recipients: getVal('radarr-recipients') || 'all'
        },
        arr: {
            gemini_personality: getVal('arr-gemini-personality'),
            audio_base_url:     getVal('arr-audio-base-url')
        },
        sms_gateway: {
            base_url: getVal('sms-gw-url'),
            username: getVal('sms-gw-user'),
            password: getVal('sms-gw-pass')
        },
        email_sms: {
            smtp_host:       getVal('email-smtp-host')  || 'smtp.gmail.com',
            smtp_port:       parseInt(getVal('email-smtp-port')) || 587,
            smtp_user:       getVal('email-smtp-user'),
            smtp_pass:       getVal('email-smtp-pass'),
            from_name:       getVal('email-from-name')  || 'JellyDad',
            carrier_gateway: getVal('email-carrier-gw') || 'msg.fi.google.com'
        },
        elevenlabs: {
            api_key:  getVal('elevenlabs-key'),
            voice_id: getVal('elevenlabs-voice-id')
        },
        gemini: {
            api_key:  getVal('gemini-key'),
            base_url: getVal('gemini-base-url') || 'https://api.deepseek.com/v1',
            model:    getVal('gemini-model') || 'deepseek-v4-flash'
        },
        famguessr: {
            enable:           document.getElementById('famguessr-enable').checked,
            message_template: getVal('famguessr-template') || 'Hey it is {day}{time} in {city}, {country}, have you done your FamGuessr yet?'
        }
    };
}

function getVal(id) {
    return document.getElementById(id)?.value?.trim() ?? '';
}

// ─── Dynamic Notify Map Table ─────────────────────────────────────────────────

function renderNotifyMap(rows) {
    const tbody = document.getElementById('notify-map-body');
    tbody.innerHTML = '';
    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="table-empty">No tags configured. Click "+ Add Tag" to add one.</td></tr>`;
        return;
    }
    rows.forEach((row, i) => {
        tbody.appendChild(makeNotifyRow(row.tag, row.phone, i));
    });
}

function makeNotifyRow(tag = '', phone = '', index = Date.now()) {
    const tr = document.createElement('tr');
    tr.dataset.rowId = index;
    tr.innerHTML = `
        <td><input type="text" class="form-control notify-tag" value="${escHtml(tag)}" placeholder="notify-dad"></td>
        <td><input type="text" class="form-control notify-phone" value="${escHtml(phone)}" placeholder="+15551234567"></td>
        <td><button class="map-row-del" title="Remove" onclick="this.closest('tr').remove(); fixEmptyTable('notify-map-body', 3, 'No tags configured. Click &quot;+ Add Tag&quot; to add one.')">✕</button></td>
    `;
    return tr;
}

document.getElementById('btn-add-notify-row').addEventListener('click', () => {
    const tbody = document.getElementById('notify-map-body');
    const empty = tbody.querySelector('.table-empty');
    if (empty) empty.closest('tr').remove();
    tbody.appendChild(makeNotifyRow());
});

function collectNotifyMap() {
    const rows = [];
    document.querySelectorAll('#notify-map-body tr').forEach(tr => {
        const tag   = tr.querySelector('.notify-tag')?.value?.trim();
        const phone = tr.querySelector('.notify-phone')?.value?.trim();
        if (tag) rows.push({ tag, phone: phone || '' });
    });
    return rows;
}

// ─── Dynamic Seerr Map Table ──────────────────────────────────────────────────

function renderSeerrMap(rows) {
    const tbody = document.getElementById('seerr-map-body');
    tbody.innerHTML = '';
    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="table-empty">No Overseerr users mapped yet.</td></tr>`;
        return;
    }
    rows.forEach((row, i) => {
        tbody.appendChild(makeSeerrRow(row.seerr_username, row.tag, i));
    });
}

function makeSeerrRow(username = '', tag = '', index = Date.now()) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><input type="text" class="form-control seerr-username" value="${escHtml(username)}" placeholder="1-geocode"></td>
        <td><input type="text" class="form-control seerr-tag" value="${escHtml(tag)}" placeholder="notify-dad"></td>
        <td><button class="map-row-del" title="Remove" onclick="this.closest('tr').remove(); fixEmptyTable('seerr-map-body', 3, 'No Overseerr users mapped yet.')">✕</button></td>
    `;
    return tr;
}

document.getElementById('btn-add-seerr-row').addEventListener('click', () => {
    const tbody = document.getElementById('seerr-map-body');
    const empty = tbody.querySelector('.table-empty');
    if (empty) empty.closest('tr').remove();
    tbody.appendChild(makeSeerrRow());
});

function collectSeerrMap() {
    const rows = [];
    document.querySelectorAll('#seerr-map-body tr').forEach(tr => {
        const username = tr.querySelector('.seerr-username')?.value?.trim();
        const tag      = tr.querySelector('.seerr-tag')?.value?.trim();
        if (username) rows.push({ seerr_username: username, tag: tag || '' });
    });
    return rows;
}

// ─── Test SMS ─────────────────────────────────────────────────────────────────

function populateTestSmsDropdown(notifyMap) {
    const sel = document.getElementById('test-sms-tag');
    const prev = sel.value;
    sel.innerHTML = '<option value="">— select tag —</option>';
    notifyMap.forEach(m => {
        if (m.tag) {
            const opt = document.createElement('option');
            opt.value = m.tag;
            opt.textContent = `${m.tag}  (${m.phone || 'no phone'})`;
            if (m.tag === prev) opt.selected = true;
            sel.appendChild(opt);
        }
    });
}

document.getElementById('btn-test-sms').addEventListener('click', async () => {
    const tag = document.getElementById('test-sms-tag').value;
    if (!tag) { showToast('Please select a tag first.', 'error'); return; }

    const btn = document.getElementById('btn-test-sms');
    btn.innerHTML = '<span class="spinner"></span> Sending…';
    btn.disabled = true;

    try {
        const resp = await fetch('/api/test/sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        showToast(`✓ Test SMS sent to ${tag}!`, 'success');
    } catch (e) {
        showToast(`Test failed: ${e.message}`, 'error');
    } finally {
        btn.textContent = 'Send Test SMS';
        btn.disabled = false;
    }
});

// ─── Test Arr Notification ────────────────────────────────────────────────────

document.getElementById('btn-test-arr').addEventListener('click', async () => {
    const btn = document.getElementById('btn-test-arr');
    btn.innerHTML = '<span class="spinner"></span> Firing pipeline…';
    btn.disabled = true;

    try {
        const resp = await fetch('/api/test/arr-mock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        showToast('🎬 Test fired! Generating audio & sending SMS… check your phone in ~15 seconds.', 'success');
    } catch (e) {
        showToast(`Test failed: ${e.message}`, 'error');
    } finally {
        btn.innerHTML = '🎬 Send Test Movie Notification';
        btn.disabled = false;
    }
});

// ─── List AI Models ────────────────────────────────────────────────────────────

document.getElementById('btn-list-models').addEventListener('click', async () => {
    const btn  = document.getElementById('btn-list-models');
    const hint = document.getElementById('gemini-model-hint');
    btn.textContent = 'Loading…';
    btn.disabled = true;
    try {
        const resp = await fetch('/api/test/gemini-models');
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        hint.innerHTML = '<strong>Available:</strong> ' + data.models.join(', ');
        hint.style.color = 'var(--success, #4ade80)';
    } catch (e) {
        hint.textContent = 'Error: ' + e.message;
        hint.style.color = 'var(--danger, #f87171)';
    } finally {
        btn.textContent = 'Check Available';
        btn.disabled = false;
    }
});

// ─── Famguessr ─────────────────────────────────────────────────────────────────

// Auto-refresh status when the General tab is active
let famguessrStatusInterval = null;

// Called on tab switch — start/stop status polling
document.querySelectorAll('.nav-links li').forEach(li => {
    li.addEventListener('click', () => {
        const tabId = li.dataset.tab;
        if (tabId === 'tab-general') {
            refreshFamguessrStatus();
            if (!famguessrStatusInterval) {
                famguessrStatusInterval = setInterval(refreshFamguessrStatus, 30000);
            }
        } else {
            if (famguessrStatusInterval) {
                clearInterval(famguessrStatusInterval);
                famguessrStatusInterval = null;
            }
        }
    });
});

async function refreshFamguessrStatus() {
    try {
        const resp = await fetch('/api/famguessr/status');
        if (!resp.ok) return;
        const status = await resp.json();
        const elEnabled = document.getElementById('famguessr-status-enabled');
        if (elEnabled) {
            elEnabled.textContent = status.enabled ? 'Enabled' : 'Disabled';
            elEnabled.className = 'status-pill ' + (status.enabled ? 'online' : 'offline');
        }
        const elNext = document.getElementById('famguessr-status-next');
        if (elNext) {
            elNext.textContent = status.nextSend
                ? new Date(status.nextSend).toLocaleString()
                : '—';
        }
        const elLast = document.getElementById('famguessr-status-last');
        if (elLast) elLast.textContent = status.lastSend || '—';
        const elPlace = document.getElementById('famguessr-status-place');
        if (elPlace) {
            if (status.lastPlace) {
                elPlace.textContent = status.lastPlace.emoji + ' ' + status.lastPlace.city + ', ' + status.lastPlace.country;
            } else {
                elPlace.textContent = '—';
            }
        }
    } catch (e) {
        // Silently ignore status poll errors
    }
}

// Manual send
document.getElementById('btn-famguessr-send').addEventListener('click', async () => {
    const btn = document.getElementById('btn-famguessr-send');
    btn.innerHTML = '<span class="spinner"></span> Sending…';
    btn.disabled = true;
    try {
        const resp = await fetch('/api/famguessr/send', { method: 'POST' });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        showToast('🌍 Famguessr sent to all family members!', 'success');
        refreshFamguessrStatus();
    } catch (e) {
        showToast(`Send failed: ${e.message}`, 'error');
    } finally {
        btn.innerHTML = 'Send Famguessr Now';
        btn.disabled = false;
    }
});

// Test-to-Dad
document.getElementById('btn-famguessr-test-dad').addEventListener('click', async () => {
    const btn = document.getElementById('btn-famguessr-test-dad');
    const orig = btn.textContent;
    btn.textContent = '⏳ Testing…';
    btn.disabled = true;
    try {
        const resp = await fetch('/api/famguessr/test-dad', { method: 'POST' });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
        showToast('🧪 Test sent to Dad! Check his phone.', 'success');
    } catch (e) {
        showToast(`Test failed: ${e.message}`, 'error');
    } finally {
        btn.textContent = orig;
        btn.disabled = false;
    }
});

// Preview
document.getElementById('btn-famguessr-preview').addEventListener('click', async () => {
    const btn = document.getElementById('btn-famguessr-preview');
    btn.innerHTML = '<span class="spinner"></span> Generating…';
    btn.disabled = true;
    try {
        const resp = await fetch('/api/famguessr/preview');
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

        const box = document.getElementById('famguessr-preview-box');
        const textEl = document.getElementById('famguessr-preview-text');
        const metaEl = document.getElementById('famguessr-preview-meta');

        textEl.textContent = data.message;
        const emoji = data.place.emoji || '';
        const dayInfo = data.dayDiffers
            ? `Day differs from NY (local: ${data.localDay}, NY: ${data.nyDay})`
            : (data.dayDiffers === false ? `Same day as NY (${data.localDay})` : 'Day comparison unavailable');
        metaEl.textContent = `${emoji} ${data.place.city}, ${data.place.country} — Local time: ${data.localTime} — ${dayInfo}`;
        box.style.display = 'block';
    } catch (e) {
        showToast(`Preview failed: ${e.message}`, 'error');
    } finally {
        btn.innerHTML = 'Preview Message';
        btn.disabled = false;
    }
});

// ─── Announcements ─────────────────────────────────────────────────────────────

let announceConfig = {};  // { enable, prompts: { type: { core, tone, examples[] } } }

// Load announcements config and populate UI
async function loadAnnounceConfig() {
    try {
        const resp = await fetch('/api/announcements/config');
        if (!resp.ok) return;
        announceConfig = await resp.json();
        populateAnnounceDropdown();
        renderPromptsEditor();
    } catch (e) { /* ignore */ }
}

function populateAnnounceDropdown() {
    const sel = document.getElementById('announce-type');
    const prompts = announceConfig.prompts || {};
    sel.innerHTML = '';
    for (const [key, p] of Object.entries(prompts)) {
        const opt = document.createElement('option');
        opt.value = key;
        const icons = { take_out_trash:'🚮', dinner_time:'🍽️', bedtime:'🌙', wake_up:'☀️', general_reminder:'🔔' };
        opt.textContent = `${icons[key] || '📢'} ${p.core}`;
        sel.appendChild(opt);
    }
}

function renderPromptsEditor() {
    const list = document.getElementById('announce-prompts-list');
    const prompts = announceConfig.prompts || {};
    list.innerHTML = '';

    for (const [key, p] of Object.entries(prompts)) {
        const card = document.createElement('div');
        card.className = 'prompt-card';
        card.dataset.type = key;
        card.innerHTML = `
            <div class="prompt-card-header">
                <div>
                    <strong>Type ID:</strong> <code>${escHtml(key)}</code>
                    <span style="margin-left:8px;font-size:12px;color:var(--text-secondary)">(used in HA script calls)</span>
                </div>
                <button class="btn-delete" onclick="deletePrompt('${escHtml(key)}')">🗑️ Delete</button>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Core Message</label>
                    <input type="text" class="form-control prompt-core" value="${escHtml(p.core || '')}" placeholder="Take out the trash.">
                </div>
                <div class="form-group">
                    <label>Tone / Style Direction</label>
                    <input type="text" class="form-control prompt-tone" value="${escHtml(p.tone || '')}" placeholder="slightly snarky Scottish sysadmin">
                </div>
            </div>
            <div class="form-row form-row-full">
                <div class="form-group">
                    <label>Example Scripts <span style="font-weight:400;color:var(--text-secondary)">(one per line — guides the AI's style)</span></label>
                    <textarea class="form-control prompt-examples" rows="3" placeholder="The bin bags are staging a coup...&#10;Right, trash collection. Don't make me...">${escHtml((p.examples || []).join('\n'))}</textarea>
                </div>
            </div>
        `;
        list.appendChild(card);
    }
}

function deletePrompt(key) {
    if (!confirm(`Delete announcement type "${key}"? This cannot be undone.`)) return;
    delete announceConfig.prompts[key];
    renderPromptsEditor();
    populateAnnounceDropdown();
    showToast(`Deleted "${key}". Click Save Prompts to persist.`, 'info');
}

document.getElementById('btn-announce-add').addEventListener('click', () => {
    const id = prompt('Enter a type ID (snake_case, e.g. "feeding_cats"):');
    if (!id) return;
    if (announceConfig.prompts[id]) {
        showToast(`"${id}" already exists.`, 'error');
        return;
    }
    announceConfig.prompts[id] = { core: '', tone: '', examples: [] };
    renderPromptsEditor();
    populateAnnounceDropdown();
    document.getElementById('announce-type').value = id;
    showToast(`Added "${id}". Fill in the fields and click Save Prompts.`, 'info');
});

// Save prompts to config
document.getElementById('btn-announce-save-prompts').addEventListener('click', async () => {
    // Collect from editor
    const prompts = {};
    document.querySelectorAll('.prompt-card').forEach(card => {
        const key = card.dataset.type;
        prompts[key] = {
            core: card.querySelector('.prompt-core')?.value?.trim() || '',
            tone: card.querySelector('.prompt-tone')?.value?.trim() || '',
            examples: (card.querySelector('.prompt-examples')?.value || '')
                .split('\n')
                .map(s => s.trim())
                .filter(s => s.length > 0)
        };
    });
    announceConfig.prompts = prompts;

    const btn = document.getElementById('btn-announce-save-prompts');
    btn.innerHTML = '<span class="spinner"></span> Saving…';
    btn.disabled = true;

    try {
        const resp = await fetch('/api/announcements/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompts })
        });
        if (!resp.ok) throw new Error('Save failed');
        populateAnnounceDropdown();
        showToast('💾 Prompts saved!', 'success');
    } catch (e) {
        showToast('Save failed: ' + e.message, 'error');
    } finally {
        btn.innerHTML = '💾 Save Prompts';
        btn.disabled = false;
    }
});

// Download HA config YAML
document.getElementById('btn-announce-ha-download').addEventListener('click', () => {
    const speaker = prompt('Speaker entity ID:', 'media_player.upstairs_landing_speaker');
    if (speaker === null) return;  // cancelled
    const url = `/api/announcements/ha-config?speaker=${encodeURIComponent(speaker.trim() || 'media_player.upstairs_landing_speaker')}`;
    window.open(url, '_blank');
    showToast('📥 Downloading announcements.yaml — place in HA /config/packages/', 'info');
});

// Generate full announcement (LLM + TTS)
document.getElementById('btn-announce-generate').addEventListener('click', async () => {
    const type = document.getElementById('announce-type').value;
    if (!type) { showToast('No announcement types configured.', 'error'); return; }
    const btn = document.getElementById('btn-announce-generate');
    btn.innerHTML = '<span class="spinner"></span> Generating…';
    btn.disabled = true;

    try {
        const resp = await fetch(`/api/announcements/generate/${type}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: '{}' });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

        const box = document.getElementById('announce-result');
        document.getElementById('announce-variant').textContent = `"${data.variant}"`;
        const meta = [];
        meta.push(`Voice: ${data.voice}`);
        meta.push(`Original: "${data.original}"`);
        if (data.audio_url) {
            meta.push(`Audio: ${data.audio_url}`);
            showToast('🎙️ Announcement generated with voice: ' + data.voice, 'success');
        } else {
            meta.push('⚠️ No audio — check API keys in Settings');
            showToast('⚠️ Text generated but no audio — check API keys in Settings', 'error');
        }
        document.getElementById('announce-meta').textContent = meta.join('  ·  ');
        box.style.display = 'block';
    } catch (e) {
        showToast(`Generate failed: ${e.message}`, 'error');
    } finally {
        btn.innerHTML = '🎙️ Generate & Test';
        btn.disabled = false;
    }
});

// Preview only (text, no audio)
document.getElementById('btn-announce-preview').addEventListener('click', async () => {
    const type = document.getElementById('announce-type').value;
    if (!type) { showToast('No announcement types configured.', 'error'); return; }
    const btn = document.getElementById('btn-announce-preview');
    btn.innerHTML = '<span class="spinner"></span> Previewing…';
    btn.disabled = true;

    try {
        const resp = await fetch(`/api/announcements/preview/${type}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

        const box = document.getElementById('announce-result');
        document.getElementById('announce-variant').textContent = `"${data.variant}"`;
        document.getElementById('announce-meta').textContent = `Would use voice: ${data.would_use_voice}  ·  Original: "${data.original}"  ·  (no audio generated)`;
        box.style.display = 'block';
        showToast('👁️ Preview ready!', 'info');
    } catch (e) {
        showToast(`Preview failed: ${e.message}`, 'error');
    } finally {
        btn.innerHTML = '👁️ Preview Only';
        btn.disabled = false;
    }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fixEmptyTable(tbodyId, colspan, emptyMsg) {
    const tbody = document.getElementById(tbodyId);
    if (tbody && tbody.querySelectorAll('tr').length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="table-empty">${emptyMsg}</td></tr>`;
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

loadConfig();
loadAnnounceConfig();
