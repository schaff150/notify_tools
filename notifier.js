const Client = require('android-sms-gateway');

/**
 * Send an SMS via the SMS Gateway for Android app.
 *
 * Modes:
 *   Local  — phone runs HTTP server on LAN:  base_url = "http://192.168.0.X:8080/3rdparty/v1"
 *   Cloud  — phone relays via sms-gate.app:  base_url = "https://api.sms-gate.app/3rdparty/v1"
 *            (or leave base_url blank — the SDK defaults to cloud mode)
 *
 * @param {string}      to                  Recipient E.164 phone number e.g. "+15551234567"
 * @param {string}      body                Message text
 * @param {string|null} audioUrl            Optional public URL to an audio file (appended as link)
 * @param {object}      smsGatewayConfig    { base_url, username, password }
 */
async function sendSMS(to, body, audioUrl, smsGatewayConfig) {
    const { base_url, username, password } = smsGatewayConfig || {};

    if (!username || !password) {
        throw new Error('SMS Gateway is not configured (username and password required).');
    }

    if (!to) {
        throw new Error('Recipient phone number is empty.');
    }

    // Append audio link as plain text — SMS Gateway sends standard SMS messages
    let message = body;
    if (audioUrl) {
        message = `${body}\n🔊 ${audioUrl}`;
    }

    // Build client — override baseUrl for local mode, leave undefined for cloud mode
    // SDK default baseUrl is "https://api.sms-gate.app/3rdparty/v1"
    const clientArgs = [username, password];
    if (base_url && base_url.trim()) {
        // Ensure the path segment is included for local server
        const normalised = base_url.replace(/\/$/, '');
        const apiBase = normalised.endsWith('/3rdparty/v1') ? normalised : `${normalised}/3rdparty/v1`;
        clientArgs.push(undefined, apiBase); // 3rd arg is httpClient (use default), 4th is baseUrl
    }

    const client = new Client(...clientArgs);
    const result = await client.send({ message, phoneNumbers: [to] });

    console.log(`[notifier] ✓ SMS sent to ${to} — id: ${result.id}, state: ${result.state}`);
    return result.id;
}

module.exports = { sendSMS };
