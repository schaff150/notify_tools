// ─── Tab Navigation ───────────────────────────────────────────────────────────

const PAGE_META = {
    'tab-jellyfin': { title: 'Jellyfin Notifier',    subtitle: 'Notify family members when new content appears on JellyDad.' },
    'tab-arr':      { title: 'Sonarr / Radarr',      subtitle: 'AI-powered announcements when shows or movies are added.' },
    'tab-settings': { title: 'Settings',              subtitle: 'SMS Gateway, API keys, and system configuration.' }
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
    setVal('sonarr-recipients',      cfg.sonarr?.recipients  ?? 'all');
    setChecked('radarr-enable',      cfg.radarr?.enable      ?? false);
    setVal('radarr-recipients',      cfg.radarr?.recipients  ?? 'all');

    // ── Arr AI / Audio
    setVal('arr-gemini-personality', cfg.arr?.gemini_personality ?? '');
    setVal('arr-audio-base-url',     cfg.arr?.audio_base_url    ?? '');

    // ── SMS Gateway
    setVal('sms-gw-url',             cfg.sms_gateway?.base_url  ?? '');
    setVal('sms-gw-user',            cfg.sms_gateway?.username  ?? '');
    setVal('sms-gw-pass',            cfg.sms_gateway?.password  ?? '');
    setVal('elevenlabs-key',         cfg.elevenlabs?.api_key  ?? '');
    setVal('elevenlabs-voice-id',    cfg.elevenlabs?.voice_id ?? '');
    setVal('gemini-key',             cfg.gemini?.api_key      ?? '');
    setVal('gemini-model',           cfg.gemini?.model        ?? 'gemini-1.5-flash');

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
            recipients: getVal('sonarr-recipients') || 'all'
        },
        radarr: {
            enable:     document.getElementById('radarr-enable').checked,
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
        elevenlabs: {
            api_key:  getVal('elevenlabs-key'),
            voice_id: getVal('elevenlabs-voice-id')
        },
        gemini: {
            api_key: getVal('gemini-key'),
            model:   getVal('gemini-model') || 'gemini-1.5-flash'
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

// ─── List Gemini Models ───────────────────────────────────────────────────────

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
