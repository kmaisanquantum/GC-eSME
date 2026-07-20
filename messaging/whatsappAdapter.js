const axios = require('axios');

/**
 * Dispatches a WhatsApp text message to the specified recipient using Meta Cloud API or Twilio.
 *
 * @param {Object} params - The message parameters
 * @param {string} params.to - Recipient's phone number
 * @param {string} params.body - Message body content
 * @returns {Promise<Object>} Verification details of dispatch
 */
async function sendMessage({ to, body }) {
  const provider = (process.env.WHATSAPP_PROVIDER || 'mock').toLowerCase();

  if (provider === 'mock' || !to) {
    console.log(`[WHATSAPP MOCK] Dispatching message to: ${to}. Content: "${body}"`);
    return { status: 'sent', messageId: 'MOCK-MSG-' + Date.now(), provider: 'mock' };
  }

  if (provider === 'meta') {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_API_TOKEN;

    if (!phoneNumberId || !token) {
      console.warn('[WHATSAPP WARNING] Meta credentials missing. Falling back to mock trace.');
      console.log(`[WHATSAPP MOCK FALLBACK] Dispatching message to: ${to}. Content: "${body}"`);
      return { status: 'sent', messageId: 'MOCK-FALLBACK-' + Date.now(), provider: 'mock' };
    }

    const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body }
    };
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };

    try {
      const response = await axios.post(url, payload, { headers, timeout: 8000 });
      return {
        status: 'sent',
        messageId: response.data?.messages?.[0]?.id || 'META-' + Date.now(),
        provider: 'meta'
      };
    } catch (error) {
      console.error('[WHATSAPP ERROR] Meta Cloud API message failed to send:', error.response?.data || error.message);
      throw new Error(`Meta API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  if (provider === 'twilio') {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

    if (!accountSid || !authToken) {
      console.warn('[WHATSAPP WARNING] Twilio credentials missing. Falling back to mock trace.');
      console.log(`[WHATSAPP MOCK FALLBACK] Dispatching message to: ${to}. Content: "${body}"`);
      return { status: 'sent', messageId: 'MOCK-FALLBACK-' + Date.now(), provider: 'mock' };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    // Twilio WhatsApp expects recipient to be of form 'whatsapp:+675...' or similar
    let formattedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
    if (!formattedTo.includes('+') && !formattedTo.startsWith('whatsapp:00')) {
      // Add a default PNG prefix or try to preserve
      formattedTo = formattedTo.replace('whatsapp:', 'whatsapp:+');
    }

    const params = new URLSearchParams();
    params.append('To', formattedTo);
    params.append('From', from);
    params.append('Body', body);

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64')
    };

    try {
      const response = await axios.post(url, params, { headers, timeout: 8000 });
      return {
        status: 'sent',
        messageId: response.data?.sid || 'TWILIO-' + Date.now(),
        provider: 'twilio'
      };
    } catch (error) {
      console.error('[WHATSAPP ERROR] Twilio message failed to send:', error.response?.data || error.message);
      throw new Error(`Twilio API error: ${error.response?.data?.message || error.message}`);
    }
  }

  throw new Error(`Unsupported WhatsApp Provider: ${provider}`);
}

module.exports = {
  sendMessage
};
