/**
 * Send an SMS via the SMS Gateway for Android app (sms-gate.app).
 *
 * API: POST {base_url}/3rdparty/v1/message  with Basic auth
 *
 * Modes:
 *   Local  — base_url = "http://192.168.0.X:8080"   (phone on same LAN)
 *   Cloud  — base_url = "https://api.sms-gate.app"  (relay via sms-gate.app)
 *
 * @param {string}      to                Recipient E.164 number e.g. "+15551234567"
 * @param {string}      body              Message text
 * @param {string|null} audioUrl          Optional audio URL — appended as a plain-text link
 * @param {object}      smsGatewayConfig  { base_url, username, password }
 */
async function sendSMS(to, body, audioUrl, smsGatewayConfig) {
    const { base_url, username, password } = smsGatewayConfig || {};

    if (!base_url || !username || !password) {
        throw new Error('SMS Gateway is not configured (base_url, username, password required).');
    }

    if (!to) {
        throw new Error('Recipient phone number is empty.');
    }

    // Append audio link as plain text (standard SMS, no MMS needed)
    let message = body;
    if (audioUrl) {
        message = `${body}\n🔊 ${audioUrl}`;
    }

    const apiUrl = `${base_url.replace(/\/$/, '')}/3rdparty/v1/message`;
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Basic ${credentials}`
        },
        body: JSON.stringify({
            message,
            phoneNumbers: [to]
        })
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`SMS Gateway error ${resp.status}: ${errText}`);
    }

    const result = await resp.json();
    console.log(`[notifier] ✓ SMS sent to ${to} — id: ${result.id}, state: ${result.state}`);
    return result.id;
}

module.exports = { sendSMS };
