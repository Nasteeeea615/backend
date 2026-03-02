const axios = require('axios');
const crypto = require('crypto');

const url = process.env.STAGING_URL;
const secret = process.env.STAGING_WEBHOOK_SECRET;
const healthPath = process.env.STAGING_HEALTH_PATH || '/health';
const webhookPath = process.env.STAGING_WEBHOOK_PATH || '/api/webhooks/yookassa';

if (!url || !secret) {
  console.error('STAGING_URL and STAGING_WEBHOOK_SECRET must be set');
  process.exit(2);
}

function sign(body) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function checkHealth() {
  const endpoint = url.replace(/\/$/, '') + healthPath;
  console.log('Checking health at', endpoint);
  const res = await axios.get(endpoint, { timeout: 10000 });
  console.log('Health status:', res.status, res.data && res.data.status ? res.data.status : 'ok');
  return res.status >= 200 && res.status < 300;
}

async function sendWebhook() {
  const payload = {
    event: 'payment.test',
    data: {
      id: 'test-' + Date.now(),
      amount: 100,
      currency: 'RUB'
    }
  };
  const body = JSON.stringify(payload);
  const signature = sign(body);
  const endpoint = url.replace(/\/$/, '') + webhookPath;
  console.log('Posting webhook to', endpoint);
  const res = await axios.post(endpoint, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Signature': signature
    },
    timeout: 20000
  });
  console.log('Webhook response status:', res.status);
  return res.status >= 200 && res.status < 300;
}

(async () => {
  try {
    const ok = await checkHealth();
    if (!ok) {
      console.error('Health check failed');
      process.exit(3);
    }

    const webhookOk = await sendWebhook();
    if (!webhookOk) {
      console.error('Webhook delivery failed');
      process.exit(4);
    }

    console.log('E2E basic flow succeeded');
    process.exit(0);
  } catch (err) {
    if (err.response) {
      console.error('Non-2xx response:', err.response.status, err.response.data);
    } else {
      console.error('Error:', err.message || err);
    }
    process.exit(5);
  }
})();
