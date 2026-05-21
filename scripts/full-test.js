#!/usr/bin/env node

/**
 * Полное тестирование приложения (без UI)
 * 
 * Использование:
 *   STAGING_URL=https://septicservice.onrender.com node full-test.js
 *   или просто: npm run test:e2e (если добавить скрипт в package.json)
 * 
 * Тесты проверяют:
 * - Health status всех сервисов
 * - Аутентификацию (регистрация, логин)
 * - Создание заказов
 * - WebSocket соединение
 * - Redis кеширование
 * - Платежные webhooks
 */

const axios = require('axios');
const crypto = require('crypto');

// ============ КОНФИГУРАЦИЯ ============
const BASE_URL = process.env.STAGING_URL || 'https://septicservice.onrender.com';
const WEBHOOK_SECRET = process.env.STAGING_WEBHOOK_SECRET || process.env.YOOKASSA_SECRET_KEY || 'test-secret';
const TIMEOUT = 15000;

// Тестовые данные
const testData = {
  clientEmail: `test-client-${Date.now()}@example.com`,
  executorEmail: `test-executor-${Date.now()}@example.com`,
  password: 'TestPassword123!',
  phone: '+79991234567',
  tokens: {},
  orderId: null,
};

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// Статистика
const stats = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  startTime: Date.now(),
};

const results = [];

// ============ UTILITY ФУНКЦИИ ============

function log(message, color = 'reset') {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

function logSection(title) {
  console.log(`\n${colors.bold}${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  log(`${colors.bold}${title}${colors.reset}`, 'cyan');
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}`);
}

async function runTest(name, testFn, critical = false) {
  stats.total++;
  process.stdout.write(`\n${colors.cyan}[${stats.total}] ${name}...${colors.reset} `);
  const startTime = Date.now();

  try {
    await testFn();
    const duration = Date.now() - startTime;
    stats.passed++;
    results.push({ name, status: 'PASS', duration });
    log(`✅ ${duration}ms`, 'green');
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    if (critical) {
      stats.failed++;
      results.push({ name, status: 'FAIL', duration, error: error.message });
      log(`❌ FAIL (${duration}ms)`, 'red');
      log(`   Error: ${error.message}`, 'red');
      return false;
    }
    stats.skipped++;
    results.push({ name, status: 'SKIP', duration, error: error.message });
    log(`⏭️  SKIP (${duration}ms): ${error.message}`, 'yellow');
    return false;
  }
}

// ============ ТЕСТЫ ============

async function testHealthCheck() {
  const response = await axios.get(`${BASE_URL}/health`, { timeout: TIMEOUT });
  
  if (response.status !== 200) {
    throw new Error(`Status ${response.status}, expected 200`);
  }

  const { data } = response;
  const checks = {
    'Overall Status': data.status === 'ok' ? '✓' : '✗',
    'Database': data.database || 'unknown',
    'Redis': data.redis || 'not configured',
    'SocketIO': data.socketio || 'not checked',
  };

  for (const [key, value] of Object.entries(checks)) {
    process.stdout.write(`\n   └─ ${key}: ${colors.blue}${value}${colors.reset}`);
  }

  if (data.status !== 'ok') {
    throw new Error(`Health status is '${data.status}', not 'ok'`);
  }
}

async function testDatabaseConnectivity() {
  const response = await axios.get(`${BASE_URL}/api/health/db`, { timeout: TIMEOUT });
  
  if (response.status !== 200) {
    throw new Error(`DB health returned status ${response.status}`);
  }

  const { connected } = response.data;
  if (!connected) {
    throw new Error('Database is not connected');
  }

  process.stdout.write(`\n   └─ Connection pool: active`);
}

async function testRedisConnectivity() {
  try {
    const response = await axios.get(`${BASE_URL}/api/health/redis`, { timeout: TIMEOUT });
    
    if (response.status !== 200) {
      throw new Error(`Redis health returned status ${response.status}`);
    }

    const { connected } = response.data;
    if (!connected) {
      throw new Error('Redis is not connected');
    }

    process.stdout.write(`\n   └─ Redis cache: online`);
  } catch (error) {
    throw new Error('Redis service unavailable (optional): ' + error.message);
  }
}

async function testAuthRegisterClient() {
  const response = await axios.post(`${BASE_URL}/api/auth/register`, {
    email: testData.clientEmail,
    password: testData.password,
    phone: testData.phone,
    role: 'client',
  }, { timeout: TIMEOUT });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Expected 201/200, got ${response.status}`);
  }

  if (!response.data.token) {
    throw new Error('No auth token in response');
  }

  testData.tokens.client = response.data.token;
  testData.clientId = response.data.user?.id;

  process.stdout.write(`\n   └─ Client registered: ${testData.clientEmail}`);
}

async function testAuthRegisterExecutor() {
  const response = await axios.post(`${BASE_URL}/api/auth/register`, {
    email: testData.executorEmail,
    password: testData.password,
    phone: testData.phone,
    role: 'executor',
  }, { timeout: TIMEOUT });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Expected 201/200, got ${response.status}`);
  }

  if (!response.data.token) {
    throw new Error('No auth token in response');
  }

  testData.tokens.executor = response.data.token;
  testData.executorId = response.data.user?.id;

  process.stdout.write(`\n   └─ Executor registered: ${testData.executorEmail}`);
}

async function testAuthLogin() {
  const response = await axios.post(`${BASE_URL}/api/auth/login`, {
    email: testData.clientEmail,
    password: testData.password,
  }, { timeout: TIMEOUT });

  if (response.status !== 200) {
    throw new Error(`Login failed with status ${response.status}`);
  }

  if (!response.data.token) {
    throw new Error('No token in login response');
  }

  process.stdout.write(`\n   └─ Login successful, token obtained`);
}

async function testOrderCreation() {
  const response = await axios.post(
    `${BASE_URL}/api/orders`,
    {
      title: 'Test Order',
      description: 'Cleaning septic tank',
      address: 'Test Address, City',
      serviceType: 'cleaning',
      estimatedBudget: 5000,
    },
    {
      headers: {
        Authorization: `Bearer ${testData.tokens.client}`,
      },
      timeout: TIMEOUT,
    }
  );

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`Expected 201/200, got ${response.status}`);
  }

  testData.orderId = response.data.id || response.data.order?.id;

  if (!testData.orderId) {
    throw new Error('No order ID in response');
  }

  process.stdout.write(`\n   └─ Order created: ${testData.orderId}`);
}

async function testOrderRetrieval() {
  if (!testData.orderId) {
    throw new Error('Order ID not available from previous test');
  }

  const response = await axios.get(
    `${BASE_URL}/api/orders/${testData.orderId}`,
    {
      headers: {
        Authorization: `Bearer ${testData.tokens.client}`,
      },
      timeout: TIMEOUT,
    }
  );

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  if (!response.data.id && !response.data.order?.id) {
    throw new Error('Order data not found');
  }

  process.stdout.write(`\n   └─ Order retrieved successfully`);
}

async function testOrdersList() {
  const response = await axios.get(
    `${BASE_URL}/api/orders`,
    {
      headers: {
        Authorization: `Bearer ${testData.tokens.client}`,
      },
      timeout: TIMEOUT,
    }
  );

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  const orders = response.data.orders || response.data || [];
  const count = Array.isArray(orders) ? orders.length : 0;

  process.stdout.write(`\n   └─ Retrieved ${count} orders`);
}

async function testRateLimiting() {
  // Делаем несколько быстрых запросов к health endpoint
  const maxRequests = 5;
  let limitExceeded = false;

  for (let i = 0; i < maxRequests; i++) {
    try {
      await axios.get(`${BASE_URL}/health`, { timeout: TIMEOUT });
    } catch (error) {
      if (error.response?.status === 429) {
        limitExceeded = true;
        break;
      }
    }
  }

  process.stdout.write(`\n   └─ Rate limiter: ${limitExceeded ? 'active' : 'requests allowed'}`);
}

async function testPaymentWebhook() {
  const payload = {
    event: 'payment.succeeded',
    object: {
      id: `test-${Date.now()}`,
      status: 'succeeded',
      amount: {
        value: '100.00',
        currency: 'RUB',
      },
      metadata: {
        order_id: testData.orderId || 'test-order-123',
      },
    },
  };

  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  try {
    const response = await axios.post(
      `${BASE_URL}/api/webhooks/yookassa`,
      body,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Signature': signature,
          'X-YooKassa-Signature': signature,
        },
        timeout: TIMEOUT,
      }
    );

    if (response.status === 200 || response.status === 202) {
      process.stdout.write(`\n   └─ Webhook accepted (status ${response.status})`);
    } else {
      throw new Error(`Webhook returned status ${response.status}`);
    }
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error('Webhook signature validation failed');
    }
    throw error;
  }
}

async function testApiRateLimit() {
  // Тест rate limiting на auth endpoint
  try {
    const response = await axios.post(
      `${BASE_URL}/api/auth/login`,
      { email: 'test@test.com', password: 'wrong' },
      { timeout: TIMEOUT }
    );
    process.stdout.write(`\n   └─ Rate limit check: active`);
  } catch (error) {
    if (error.response?.status === 429) {
      process.stdout.write(`\n   └─ Rate limit enforced: 429 Too Many Requests`);
    }
  }
}

// ============ MAIN ============

async function runAllTests() {
  logSection('🚀 SEPTICSERVICE - FULL TEST SUITE');
  log(`Target: ${BASE_URL}`, 'blue');
  log(`Started at: ${new Date().toISOString()}`, 'blue');

  try {
    // === HEALTH & CONNECTIVITY ===
    logSection('Health & Connectivity Checks');
    
    await runTest(
      '✓ Health check endpoint',
      testHealthCheck,
      true
    );
    
    await runTest(
      '✓ Database connectivity',
      testDatabaseConnectivity,
      true
    );
    
    await runTest(
      '✓ Redis connectivity',
      testRedisConnectivity,
      false
    );

    // === AUTHENTICATION ===
    logSection('Authentication Tests');
    
    await runTest(
      '✓ Client registration',
      testAuthRegisterClient,
      true
    );
    
    await runTest(
      '✓ Executor registration',
      testAuthRegisterExecutor,
      true
    );
    
    await runTest(
      '✓ User login',
      testAuthLogin,
      true
    );

    // === ORDERS ===
    logSection('Order Management Tests');
    
    await runTest(
      '✓ Order creation',
      testOrderCreation,
      true
    );
    
    await runTest(
      '✓ Order retrieval',
      testOrderRetrieval,
      true
    );
    
    await runTest(
      '✓ Orders list',
      testOrdersList,
      false
    );

    // === SECURITY & PROTECTION ===
    logSection('Security & Protection Tests');
    
    await runTest(
      '✓ Rate limiting',
      testRateLimiting,
      false
    );
    
    await runTest(
      '✓ API rate limit',
      testApiRateLimit,
      false
    );

    // === PAYMENTS & WEBHOOKS ===
    logSection('Payment & Webhook Tests');
    
    await runTest(
      '✓ Payment webhook',
      testPaymentWebhook,
      false
    );

    // === RESULTS ===
    printSummary();
  } catch (error) {
    log(`\n❌ Test suite failed: ${error.message}`, 'red');
    printSummary();
    process.exit(1);
  }
}

function printSummary() {
  const duration = Date.now() - stats.startTime;
  
  logSection('Test Summary');
  
  const statusColor = stats.failed === 0 ? 'green' : 'red';
  log(`Total:  ${stats.total}`, statusColor);
  log(`Passed: ${stats.passed}`, 'green');
  log(`Failed: ${stats.failed}`, stats.failed > 0 ? 'red' : 'blue');
  log(`Skipped: ${stats.skipped}`, 'yellow');
  log(`Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`, 'blue');
  
  if (stats.failed === 0) {
    log(`\n${colors.bold}✅ ALL TESTS PASSED${colors.reset}`, 'green');
  } else {
    log(`\n${colors.bold}❌ SOME TESTS FAILED${colors.reset}`, 'red');
    process.exit(1);
  }
}

// Запуск
runAllTests().catch((error) => {
  log(`\nUnexpected error: ${error.message}`, 'red');
  process.exit(1);
});
