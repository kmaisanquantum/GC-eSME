const axios = require('axios');
const crypto = require('crypto');

/**
 * Initiates a charge request targeting the active payment gateway provider.
 * Supports bsp | micash | cellmoni | mock.
 *
 * @param {Object} params - The charge parameters
 * @param {number} params.amount - The transaction amount
 * @param {string} params.phone - Customer's mobile number
 * @param {string} params.reference - Unique reference string
 * @param {string|number} params.orderId - Associated order ID
 * @returns {Promise<Object>} The provider's response trace
 */
async function initiateCharge({ amount, phone, reference, orderId }) {
  const provider = (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase();
  const baseUrl = process.env.PAYMENT_API_BASE_URL || 'https://api.paymentgateway.com';
  const apiKey = process.env.PAYMENT_API_KEY;
  const apiSecret = process.env.PAYMENT_API_SECRET;

  if (provider === 'mock') {
    console.log(`[PAYMENT MOCK] Initiating charge of K${amount} for Order #${orderId} (Phone: ${phone}, Ref: ${reference})`);
    return {
      status: 'pending',
      transaction_ref: reference,
      provider_txn_id: 'MOCK-TXN-' + Date.now(),
      message: 'Payment initiated. Please confirm on your mobile device.'
    };
  }

  // Construct target URL and payload based on selected provider
  let targetUrl = `${baseUrl}/v1/charge`;
  let payload = {};
  let headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + apiKey
  };

  if (provider === 'bsp') {
    targetUrl = `${baseUrl}/bsp/payments/initiate`;
    payload = {
      merchantId: apiKey,
      amount: amount,
      currency: 'PGK',
      customerMobile: phone,
      reference: reference,
      callbackUrl: `${baseUrl}/api/payments/webhook`,
      metadata: { orderId }
    };
    // BSP standard headers could require basic or custom signatures
    const sign = crypto.createHmac('sha256', apiSecret || '').update(JSON.stringify(payload)).digest('hex');
    headers['X-BSP-Signature'] = sign;
  } else if (provider === 'micash') {
    targetUrl = `${baseUrl}/micash/charge`;
    payload = {
      client_id: apiKey,
      amount: amount,
      msisdn: phone,
      external_id: reference,
      order_id: orderId
    };
  } else if (provider === 'cellmoni') {
    targetUrl = `${baseUrl}/cellmoni/ussd/push`;
    payload = {
      apiKey: apiKey,
      apiSecret: apiSecret,
      amount: amount.toString(),
      subscriberMobile: phone,
      txnReference: reference,
      narration: `Order #${orderId}`
    };
  } else {
    throw new Error(`Unsupported payment provider: ${provider}`);
  }

  try {
    const response = await axios.post(targetUrl, payload, {
      headers,
      timeout: 10000 // strict 10-second timeout
    });

    // Transform provider response back to a standardized schema
    return {
      status: 'pending',
      transaction_ref: reference,
      provider_txn_id: response.data.transactionId || response.data.id || response.data.provider_txn_id || 'TXN-' + Date.now(),
      message: response.data.message || 'Payment initiated successfully'
    };
  } catch (error) {
    console.error(`[PAYMENT ERROR] Provider (${provider}) initiation failed:`, error.message);
    throw new Error(`Payment initiation failed: ${error.response?.data?.message || error.message}`);
  }
}

/**
 * Cryptographically verifies the inbound webhook callback signature.
 * Uses a timing-safe comparison routine.
 *
 * @param {Object} req - The Express request object
 * @returns {boolean} True if verified, false otherwise
 */
function verifyWebhookSignature(req) {
  const provider = (process.env.PAYMENT_PROVIDER || 'mock').toLowerCase();
  if (provider === 'mock') {
    return true;
  }

  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.warn('[WEBHOOK WARNING] PAYMENT_WEBHOOK_SECRET is not configured.');
    return false;
  }

  const signatureHeader = req.headers['x-webhook-signature'] || req.headers['x-bsp-signature'] || req.headers['signature'];
  if (!signatureHeader) {
    return false;
  }

  try {
    const rawBody = JSON.stringify(req.body);
    const computedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    const signatureBuffer = Buffer.from(signatureHeader, 'utf8');
    const computedBuffer = Buffer.from(computedSignature, 'utf8');

    if (signatureBuffer.length !== computedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, computedBuffer);
  } catch (err) {
    console.error('[WEBHOOK ERROR] Signature verification crashed:', err.message);
    return false;
  }
}

module.exports = {
  initiateCharge,
  verifyWebhookSignature
};
