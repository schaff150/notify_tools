const twilio = require('twilio');

/**
 * Send an SMS or MMS message via Twilio.
 *
 * @param {string} to           - Recipient E.164 phone number (e.g. "+15551234567")
 * @param {string} body         - Message body text
 * @param {string|null} mediaUrl - Optional publicly-accessible URL for MMS attachment (audio, image)
 * @param {object} twilioConfig  - { account_sid, auth_token, from_number }
 * @returns {string} Twilio message SID
 */
async function sendSMS(to, body, mediaUrl, twilioConfig) {
    const { account_sid, auth_token, from_number } = twilioConfig || {};

    if (!account_sid || !auth_token || !from_number) {
        throw new Error('Twilio credentials are not fully configured (account_sid, auth_token, from_number required).');
    }

    if (!to) {
        throw new Error('Recipient phone number is empty.');
    }

    const client = twilio(account_sid, auth_token);

    const params = {
        body,
        from: from_number,
        to
    };

    // If a media URL is provided, Twilio will send as MMS
    if (mediaUrl) {
        params.mediaUrl = [mediaUrl];
        console.log(`[notifier] Sending MMS to ${to} with media: ${mediaUrl}`);
    } else {
        console.log(`[notifier] Sending SMS to ${to}`);
    }

    const message = await client.messages.create(params);
    console.log(`[notifier] ✓ Sent to ${to} — SID: ${message.sid}`);
    return message.sid;
}

module.exports = { sendSMS };
