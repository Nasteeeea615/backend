const axios = require('axios');
const crypto = require('crypto');

const url = process.env.STAGING_URL;
const secret = process.env.STAGING_WEBHOOK_SECRET;

if (!url || !secret) {
  console.error('STAGING_URL and STAGING_WEBHOOK_SECRET must be set');
  process.exit(2);
}

const payload = {
  event: 'payment.test',
  data: {
    id: 'test-' + Date.now(),
    amount: 100,
    currency: 'RUB'
  }
};

const body = JSON.stringify(payload);
const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

(async () => {
  try {
    const endpoint = url.replace(/\/$/, '') + '/api/webhooks/yookassa';
    console.log('Posting to', endpoint);
    const res = await axios.post(endpoint, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature
      },
      timeout: 20000
    });
    console.log('Response status:', res.status);
    console.log('Response data:', res.data);
    process.exit(res.status >= 200 && res.status < 300 ? 0 : 3);
  } catch (err) {
    if (err.response) {
      console.error('Non-2xx response:', err.response.status, err.response.data);
    } else {
      console.error('Request error:', err.message);
    }
    process.exit(4);
  }
})();
