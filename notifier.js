/**
 * Send an SMS via the SMS Gateway for Android app (sms-gate.app).
 *
 * API: POST {base_url}/3rdparty/v1/message  with Basic auth
 *
 * Modes:
 *   Local  — base_url = "http://192.168.0.X:3323"  (or whatever port set in app)
 *   Cloud  — base_url = "https://api.sms-gate.app"
 *
 * @param {string}      to                Recipient phone number (E.164 or local format)
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

    const apiUrl = `${base_url.replace(/\/$/, '')}/3rdparty/v1/message`;

    const payload = {
        message,
        phoneNumbers: [to]
    };

    console.log(`[notifier] POST ${apiUrl}`);
    console.log(`[notifier]   to:      ${to}`);
    console.log(`[notifier]   message: ${message.substring(0, 80)}${message.length > 80 ? '…' : ''}`);

    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

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
        // Connection refused, DNS fail, wrong IP/port etc.
        console.error(`[notifier] ✗ Network error reaching ${apiUrl}: ${networkErr.message}`);
        throw new Error(`Cannot reach SMS Gateway at ${apiUrl} — is the app running and is the port correct? (${networkErr.message})`);
    }

    const responseText = await resp.text();
    console.log(`[notifier] Response ${resp.status}: ${responseText.substring(0, 200)}`);

    if (!resp.ok) {
        throw new Error(`SMS Gateway returned ${resp.status} from ${apiUrl} — ${responseText}`);
    }

    let result;
    try {
        result = JSON.parse(responseText);
    } catch {
        result = { id: 'unknown', state: 'sent' };
    }

    console.log(`[notifier] ✓ SMS queued to ${to} — id: ${result.id}, state: ${result.state}`);
    return result.id;
}

module.exports = { sendSMS };
