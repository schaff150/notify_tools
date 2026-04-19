/**
 * Send an SMS via the SMS Gateway for Android app (sms-gate.app).
 *
 * LOCAL SERVER mode (phone on same LAN):
 *   base_url = "http://192.168.0.X:3323"  (or whatever port set in app)
 *   Endpoint: POST {base_url}/message
 *   Payload:  { "textMessage": { "text": "..." }, "phoneNumbers": [...] }
 *
 * CLOUD mode (phone relays via sms-gate.app):
 *   base_url = "https://api.sms-gate.app"
 *   Endpoint: POST {base_url}/3rdparty/v1/message
 *   Payload:  { "message": "...", "phoneNumbers": [...] }
 *
 * @param {string}      to                E.164 phone number e.g. "+15551234567"
 * @param {string}      body              Message text
 * @param {string|null} audioUrl          Optional audio URL — appended as plain-text link
 * @param {object}      smsGatewayConfig  { base_url, username, password }
 */
async function sendSMS(to, body, audioUrl, smsGatewayConfig) {
    const { base_url, username, password } = smsGatewayConfig || {};

    if (!base_url || !username || !password) {
        throw new Error('SMS Gateway is not configured. base_url, username, and password are all required.');
    }

    if (!to) {
        throw new Error('Recipient phone number is empty.');
    }

    // Append audio link as plain text
    let message = body;
    if (audioUrl) {
        message = `${body}\n🔊 ${audioUrl}`;
    }

    const base = base_url.replace(/\/$/, '');
    const isCloud = base.includes('api.sms-gate.app');

    // Local server and cloud use different endpoints and payload shapes
    let apiUrl, payload;

    if (isCloud) {
        apiUrl  = `${base}/3rdparty/v1/message`;
        payload = { message, phoneNumbers: [to] };
    } else {
        apiUrl  = `${base}/message`;
        payload = { textMessage: { text: message }, phoneNumbers: [to] };
    }

    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const ts = () => new Date().toISOString().replace('T',' ').substring(0,19);

    console.log(`[${ts()}] [notifier] POST ${apiUrl}`);
    console.log(`[${ts()}] [notifier]   to:      ${to}`);
    console.log(`[${ts()}] [notifier]   message: ${message.substring(0, 80)}${message.length > 80 ? '…' : ''}`);


    let resp;
    try {
        resp = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Basic ${credentials}`
            },
            body: JSON.stringify(payload)
        });
    } catch (networkErr) {
        const cause    = networkErr.cause || networkErr;
        const errCode  = cause.code    || 'no code';
        const errMsg   = cause.message || networkErr.message || String(networkErr);
        console.error(`[${ts()}] [notifier] ✗ Network error reaching ${apiUrl}`);
        console.error(`[${ts()}] [notifier]   code:    ${errCode}`);
        console.error(`[${ts()}] [notifier]   message: ${errMsg}`);
        // ECONNREFUSED = port not open / app not listening
        // ETIMEDOUT    = host reachable but port blocked by firewall
        // ENETUNREACH  = Docker can't route to that subnet
        // ENOTFOUND    = DNS/hostname failed
        throw new Error(`SMS Gateway unreachable at ${apiUrl} [${errCode}] — ${errMsg}`);
    }

    const responseText = await resp.text();
    console.log(`[${ts()}] [notifier] Response ${resp.status}: ${responseText.substring(0, 200)}`);

    if (!resp.ok) {
        throw new Error(`SMS Gateway ${resp.status} from ${apiUrl} — ${responseText}`);
    }

    let result;
    try { result = JSON.parse(responseText); } catch { result = {}; }

    console.log(`[${ts()}] [notifier] ✓ SMS queued to ${to} — id: ${result.id || '?'}, state: ${result.state || '?'}`);
    return result.id;
}

module.exports = { sendSMS };
