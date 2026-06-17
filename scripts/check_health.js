const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/health',
  method: 'GET',
  headers: {
    'x-forwarded-proto': 'https',
    'Accept': 'application/json'
  },
  timeout: 5000,
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('HTTP', res.statusCode, res.statusMessage);
    try {
      console.log(JSON.parse(data));
    } catch (e) {
      console.log(data);
    }
    process.exit(0);
  });
});

req.on('timeout', () => {
  console.error('Request timed out');
  req.destroy();
  process.exit(2);
});

req.on('error', (err) => {
  console.error('Request error:', err.message);
  process.exit(1);
});

req.end();
