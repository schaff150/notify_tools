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

    console.log(`[notifier] POST ${apiUrl}`);
    console.log(`[notifier]   to:      ${to}`);
    console.log(`[notifier]   message: ${message.substring(0, 80)}${message.length > 80 ? '…' : ''}`);

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
        console.error(`[notifier] ✗ Network error: ${networkErr.message}`);
        throw new Error(`Cannot reach SMS Gateway at ${apiUrl} — check IP/port. (${networkErr.message})`);
    }

    const responseText = await resp.text();
    console.log(`[notifier] Response ${resp.status}: ${responseText.substring(0, 200)}`);

    if (!resp.ok) {
        throw new Error(`SMS Gateway ${resp.status} from ${apiUrl} — ${responseText}`);
    }

    let result;
    try { result = JSON.parse(responseText); } catch { result = {}; }

    console.log(`[notifier] ✓ SMS queued to ${to} — id: ${result.id || '?'}, state: ${result.state || '?'}`);
    return result.id;
}

module.exports = { sendSMS };
