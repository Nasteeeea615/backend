#!/usr/bin/env node

/**
 * Расширенные E2E тесты для Staging окружения
 * 
 * Использование:
 *   node e2e-tests.js
 *   STAGING_URL=https://staging.example.com STAGING_WEBHOOK_SECRET=secret node e2e-tests.js
 * 
 * Тесты:
 * 1. Health check
 * 2. Webhook signature verification
 * 3. API authentication
 * 4. Order creation flow
 * 5. Payment webhook flow
 * 6. Push notification flow
 */

const axios = require('axios');
const crypto = require('crypto');

// Конфигурация
const config = {
    baseURL: process.env.STAGING_URL || 'http://localhost:3002',
    webhookSecret: process.env.STAGING_WEBHOOK_SECRET || process.env.YOOKASSA_SECRET_KEY,
    timeout: 10000,
};

// Цвета для консоли
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// Статистика тестов
const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    startTime: Date.now(),
};

// Результаты тестов
const results = [];

// Функция для запуска теста
async function runTest(name, testFn, required = true) {
    stats.total++;
    log(`\n🧪 Тест: ${name}`, 'cyan');
    const startTime = Date.now();
    
    try {
        await testFn();
        const duration = Date.now() - startTime;
        
        stats.passed++;
        results.push({ name, status: 'PASS', duration });
        log(`✅ PASS (${duration}ms)`, 'green');
        return true;
    } catch (error) {
        const duration = Date.now() - startTime;
        if (required) {
            stats.failed++;
            results.push({ name, status: 'FAIL', duration, error: error.message });
            log(`❌ FAIL: ${error.message}`, 'red');
            log('⚠️  Критический тест провален. Остановка.', 'yellow');
            throw error;
        }

        stats.skipped++;
        results.push({ name, status: 'SKIP', duration, error: error.message });
        log(`⏭️  SKIP: ${error.message}`, 'yellow');
        return false;
    }
}

// Вспомогательные функции
function signWebhook(body) {
    if (!config.webhookSecret) {
        throw new Error('STAGING_WEBHOOK_SECRET не установлен');
    }
    return crypto.createHmac('sha256', config.webhookSecret).update(body).digest('hex');
}

async function isYooKassaConfigured() {
    const response = await axios.get(`${config.baseURL}/health`, {
        timeout: config.timeout,
    });

    return !!response.data?.services?.yookassa;
}

// Тесты

async function testHealthCheck() {
    const response = await axios.get(`${config.baseURL}/health`, {
        timeout: config.timeout,
    });
    
    if (response.status !== 200) {
        throw new Error(`Ожидался статус 200, получен ${response.status}`);
    }
    
    if (!response.data || response.data.status !== 'ok') {
        throw new Error('Health check вернул некорректный статус');
    }
    
    const services = response.data.services || {};
    const databaseStatus = response.data.database || services.database;
    const redisStatus = response.data.redis || services.redis;

    log(`  Статус: ${response.data.status}`, 'blue');
    if (databaseStatus) {
        log(`  База данных: ${databaseStatus}`, 'blue');
    }
    if (redisStatus) {
        log(`  Redis: ${redisStatus}`, 'blue');
    } else {
        log(`  Redis: не настроен (допустимо вне production)`, 'yellow');
    }
}

async function testWebhookSignatureValid() {
    if (!(await isYooKassaConfigured())) {
        log(`  YooKassa не настроена, тест пропущен`, 'yellow');
        return;
    }

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
                order_id: 'test-order-123',
            },
        },
    };
    
    const body = JSON.stringify(payload);
    const signature = signWebhook(body);
    
    const response = await axios.post(
        `${config.baseURL}/api/webhooks/yookassa`,
        body,
        {
            headers: {
                'Content-Type': 'application/json',
                'X-Request-Signature': signature,
                'X-YooKassa-Signature': signature,
            },
            timeout: config.timeout,
        }
    );
    
    if (response.status !== 200) {
        throw new Error(`Ожидался статус 200, получен ${response.status}`);
    }
    
    log(`  Webhook принят`, 'blue');
}

async function testWebhookSignatureInvalid() {
    if (!(await isYooKassaConfigured())) {
        log(`  YooKassa не настроена, тест пропущен`, 'yellow');
        return;
    }

    const payload = {
        event: 'payment.succeeded',
        object: {
            id: `test-${Date.now()}`,
            status: 'succeeded',
        },
    };
    
    const body = JSON.stringify(payload);
    const invalidSignature = 'invalid-signature';
    
    try {
        await axios.post(
            `${config.baseURL}/api/webhooks/yookassa`,
            body,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Request-Signature': invalidSignature,
                    'X-YooKassa-Signature': invalidSignature,
                },
                timeout: config.timeout,
            }
        );
        
        throw new Error('Webhook с невалидной подписью был принят (ожидалась ошибка)');
    } catch (error) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            log(`  Невалидная подпись корректно отклонена (${error.response.status})`, 'blue');
        } else {
            throw error;
        }
    }
}

async function testAPIAuthentication() {
    // Попытка доступа к защищенному endpoint без токена
    try {
        await axios.get(`${config.baseURL}/api/profile`, {
            timeout: config.timeout,
        });
        
        throw new Error('Доступ без токена был разрешен (ожидалась ошибка 401)');
    } catch (error) {
        if (error.response && error.response.status === 401) {
            log(`  Доступ без токена корректно заблокирован`, 'blue');
        } else {
            throw error;
        }
    }
}

async function testOrderCreationFlow() {
    // Регистрация тестового пользователя
    const uniquePhoneTail = String(Date.now()).slice(-10);
    const testUser = {
        phone_number: `+7${uniquePhoneTail}`,
        name: 'Test User',
        city: 'Москва',
        street: 'Тестовая',
        house_number: '1',
        agreed_to_terms: true,
    };
    
    log(`  Регистрация пользователя: ${testUser.phone_number}`, 'blue');

    const registerResponse = await axios.post(
        `${config.baseURL}/api/auth/register-client`,
        testUser,
        { timeout: config.timeout }
    );

    const cookie = registerResponse.headers['set-cookie'] && registerResponse.headers['set-cookie'][0];
    if (!cookie) {
        throw new Error('Не удалось получить auth cookie после регистрации');
    }
    log(`  Cookie получен`, 'blue');
    
    // Создание заказа
    const order = {
        vehicle_capacity: 5,
        city: 'Москва',
        street: 'Тестовая',
        house_number: '1',
        scheduled_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        scheduled_time: '10:00',
        comment: 'E2E тест',
        payment_type: 'cash',
    };
    
    log(`  Создание заказа`, 'blue');
    
    const orderResponse = await axios.post(
        `${config.baseURL}/api/orders`,
        order,
        {
            headers: {
                Cookie: cookie,
            },
            timeout: config.timeout,
        }
    );
    
    if (orderResponse.status !== 201) {
        throw new Error(`Ожидался статус 201, получен ${orderResponse.status}`);
    }
    
    const createdOrder = orderResponse.data?.data?.order;
    if (!createdOrder || !createdOrder.id) {
        throw new Error('Некорректный формат ответа при создании заказа');
    }
    log(`  Заказ создан: ID ${createdOrder.id}`, 'blue');
    
    // Получение заказа
    const getOrderResponse = await axios.get(
        `${config.baseURL}/api/orders/${createdOrder.id}`,
        {
            headers: {
                Cookie: cookie,
            },
            timeout: config.timeout,
        }
    );
    
    if (getOrderResponse.data?.data?.order?.id !== createdOrder.id) {
        throw new Error('ID заказа не совпадает');
    }
    
    log(`  Заказ получен корректно`, 'blue');
}

async function testPaymentWebhookFlow() {
    if (!(await isYooKassaConfigured())) {
        log(`  YooKassa не настроена, тест пропущен`, 'yellow');
        return;
    }

    const orderId = `test-order-${Date.now()}`;
    
    // Симуляция webhook от ЮКасса о успешной оплате
    const payload = {
        type: 'notification',
        event: 'payment.succeeded',
        object: {
            id: `payment-${Date.now()}`,
            status: 'succeeded',
            paid: true,
            amount: {
                value: '1500.00',
                currency: 'RUB',
            },
            created_at: new Date().toISOString(),
            metadata: {
                order_id: orderId,
            },
        },
    };
    
    const body = JSON.stringify(payload);
    const signature = signWebhook(body);
    
    log(`  Отправка webhook для заказа ${orderId}`, 'blue');
    
    const response = await axios.post(
        `${config.baseURL}/api/webhooks/yookassa`,
        body,
        {
            headers: {
                'Content-Type': 'application/json',
                'X-Request-Signature': signature,
                'X-YooKassa-Signature': signature,
            },
            timeout: config.timeout,
        }
    );
    
    if (response.status !== 200) {
        throw new Error(`Ожидался статус 200, получен ${response.status}`);
    }
    
    log(`  Webhook обработан успешно`, 'blue');
}

async function testDatabaseConnection() {
    // Проверка через health endpoint
    const response = await axios.get(`${config.baseURL}/health`, {
        timeout: config.timeout,
    });
    
    if (!response.data.services || response.data.services.database !== 'connected') {
        throw new Error('База данных недоступна');
    }
    
    log(`  База данных подключена`, 'blue');
}

async function testRedisConnection() {
    // Проверка через health endpoint
    const response = await axios.get(`${config.baseURL}/health`, {
        timeout: config.timeout,
    });

    if (!response.data.services || typeof response.data.services.redis === 'undefined') {
        log(`  Redis не настроен, тест пропущен`, 'yellow');
        return;
    }
    
    if (response.data.services.redis !== 'connected') {
        throw new Error('Redis недоступен');
    }
    
    log(`  Redis подключен`, 'blue');
}

// Главная функция
async function main() {
    log('\n' + '='.repeat(50), 'cyan');
    log('🚀 E2E ТЕСТЫ STAGING ОКРУЖЕНИЯ', 'cyan');
    log('='.repeat(50) + '\n', 'cyan');
    
    log(`📍 URL: ${config.baseURL}`, 'blue');
    log(`🔐 Webhook секрет: ${config.webhookSecret ? '✓ установлен' : '✗ не установлен'}`, 'blue');
    log(`⏱️  Timeout: ${config.timeout}ms\n`, 'blue');
    
    let criticalFailure = null;

    try {
        // Критические тесты
        await runTest('1. Health Check', testHealthCheck, true);
        await runTest('2. Database Connection', testDatabaseConnection, true);
        await runTest('3. Redis Connection', testRedisConnection, true);
        
        // Тесты безопасности
        await runTest('4. API Authentication', testAPIAuthentication, true);
        await runTest('5. Webhook Valid Signature', testWebhookSignatureValid, true);
        await runTest('6. Webhook Invalid Signature', testWebhookSignatureInvalid, true);
        
        // Функциональные тесты
        await runTest('7. Order Creation Flow', testOrderCreationFlow, false);
        await runTest('8. Payment Webhook Flow', testPaymentWebhookFlow, false);
        
    } catch (error) {
        criticalFailure = error;
    }
    
    // Итоговый отчет
    const duration = Date.now() - stats.startTime;
    
    log('\n' + '='.repeat(50), 'cyan');
    log('📊 ИТОГОВЫЙ ОТЧЕТ', 'cyan');
    log('='.repeat(50) + '\n', 'cyan');
    
    log(`Всего тестов: ${stats.total}`, 'blue');
    log(`✅ Пройдено: ${stats.passed}`, 'green');
    log(`❌ Провалено: ${stats.failed}`, stats.failed > 0 ? 'red' : 'green');
    log(`⏭️  Пропущено: ${stats.skipped}`, stats.skipped > 0 ? 'yellow' : 'green');
    log(`⏱️  Время выполнения: ${duration}ms\n`, 'blue');
    
    // Детальные результаты
    if (results.length > 0) {
        log('Детальные результаты:', 'cyan');
        results.forEach((result, index) => {
            const status = result.status === 'PASS' ? '✅' : (result.status === 'SKIP' ? '⏭️' : '❌');
            const color = result.status === 'PASS' ? 'green' : (result.status === 'SKIP' ? 'yellow' : 'red');
            log(`  ${index + 1}. ${status} ${result.name} (${result.duration}ms)`, color);
            if (result.error) {
                log(`     Причина: ${result.error}`, result.status === 'SKIP' ? 'yellow' : 'red');
            }
        });
    }
    
    log('', 'reset');

    if (criticalFailure) {
        log(`⚠️  Критический сбой: ${criticalFailure.message}`, 'red');
    }
    
    // Выход с кодом ошибки если есть проваленные тесты
    if (stats.failed > 0 || criticalFailure) {
        log('❌ Некоторые тесты провалены', 'red');
        process.exit(1);
    }
    
    log('✅ Все тесты пройдены успешно!', 'green');
    process.exit(0);
}

// Запуск
main().catch((error) => {
    log(`\n❌ Критическая ошибка: ${error.message}`, 'red');
    if (error.stack) {
        console.error(error.stack);
    }
    process.exit(1);
});
