const nodemailer = require('nodemailer');

// ─── SMS Gateway (Android app — kept for backward compatibility) ──────────────

/**
 * Send an SMS via the SMS Gateway for Android app (sms-gate.app).
 */
async function sendSMS(to, body, audioUrl, smsGatewayConfig) {
    const { base_url, username, password } = smsGatewayConfig || {};

    if (!base_url || !username || !password) {
        throw new Error('SMS Gateway is not configured.');
    }

    if (!to) {
        throw new Error('Recipient phone number is empty.');
    }

    let message = body;
    if (audioUrl) {
        message = `${body}\n🔊 ${audioUrl}`;
    }

    const base = base_url.replace(/\/$/, '');
    const isCloud = base.includes('api.sms-gate.app');

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
        console.error(`[${ts()}] [notifier] ✗ Network error: ${errMsg}`);
        throw new Error(`SMS Gateway unreachable at ${apiUrl} [${errCode}]`);
    }

    const responseText = await resp.text();
    console.log(`[${ts()}] [notifier] Response ${resp.status}: ${responseText.substring(0, 200)}`);

    if (!resp.ok) {
        throw new Error(`SMS Gateway ${resp.status} from ${apiUrl} — ${responseText}`);
    }

    let result;
    try { result = JSON.parse(responseText); } catch { result = {}; }

    console.log(`[${ts()}] [notifier] ✓ SMS queued — id: ${result.id || '?'}`);
    return result.id;
}

// ─── Email-to-SMS (Gmail SMTP → carrier gateway) ─────────────────────────────

/**
 * Send an SMS via email-to-carrier-gateway using Gmail SMTP.
 *
 * @param {string} to              E.164 phone number, e.g. "+155****4567"
 * @param {string} body            Plain-text message body
 * @param {string|null} audioUrl   Optional audio URL
 * @param {object} emailConfig     { smtp_host, smtp_port, smtp_user, smtp_pass, from_name, carrier_gateway }
 */
async function sendEmailSMS(to, body, audioUrl, emailConfig) {
    const { smtp_host, smtp_port, smtp_user, smtp_pass, from_name, carrier_gateway } = emailConfig || {};

    if (!smtp_user || !smtp_pass) {
        throw new Error('Email SMS not configured — smtp_user and smtp_pass are required.');
    }
    if (!carrier_gateway) {
        throw new Error('Email SMS not configured — carrier_gateway domain is required.');
    }
    if (!to) {
        throw new Error('Recipient phone number is empty.');
    }

    // Strip + and non-digits for the gateway address
    const digits = to.replace(/\D/g, '');
    const gatewayTo = `${digits}@${carrier_gateway}`;

    // Build clean message body
    let message = body;
    if (audioUrl) {
        message = `${body}\n🔊 ${audioUrl}`;
    }

    const ts = () => new Date().toISOString().replace('T',' ').substring(0,19);

    console.log(`[${ts()}] [email-sms] Sending to ${gatewayTo}`);
    console.log(`[${ts()}] [email-sms]   message: ${message.substring(0, 80)}${message.length > 80 ? '…' : ''}`);

    const transporter = nodemailer.createTransport({
        host: smtp_host,
        port: smtp_port,
        secure: false, // TLS on 587
        auth: {
            user: smtp_user,
            pass: smtp_pass
        }
    });

    try {
        const info = await transporter.sendMail({
            from: `"${from_name || 'JellyDad'}" <${smtp_user}>`,
            to: gatewayTo,
            subject: '',  // Empty subject — gateways often prepend it to body
            text: message,
            // No HTML — carrier gateways strip it anyway
        });

        console.log(`[${ts()}] [email-sms] ✓ Sent — ID: ${info.messageId}`);
        return info.messageId;
    } catch (err) {
        console.error(`[${ts()}] [email-sms] ✗ SMTP error: ${err.message}`);
        throw new Error(`Email SMS failed: ${err.message}`);
    }
}

module.exports = { sendSMS, sendEmailSMS };
