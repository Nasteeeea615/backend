#!/usr/bin/env node

/**
 * Скрипт валидации секретов
 * Проверяет наличие и корректность всех необходимых секретов
 * 
 * Использование:
 *   node validate-secrets.js [--env production|staging|development]
 *   npm run validate-secrets
 */

// Загрузка .env файла для локального тестирования
// override: true - приоритет .env файлу над системными переменными
require('dotenv').config({ override: true });

const crypto = require('crypto');

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Определение окружения
const args = process.argv.slice(2);
const envIndex = args.indexOf('--env');
const environment = envIndex !== -1 ? args[envIndex + 1] : (process.env.NODE_ENV || 'development');

log(`\n🔍 Валидация секретов для окружения: ${environment}`, 'cyan');
log('================================================\n', 'cyan');

// Обязательные секреты для разных окружений
const requiredSecrets = {
  development: [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
  ],
  staging: [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'REDIS_HOST',
    'REDIS_PORT',
    'REDIS_PASSWORD',
    'STAGING_URL',
    'STAGING_WEBHOOK_SECRET',
    'YOOKASSA_SECRET_KEY',
    'YOOKASSA_SHOP_ID',
    'YOOKASSA_WEBHOOK_SECRET',
  ],
  production: [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'REDIS_HOST',
    'REDIS_PORT',
    'REDIS_PASSWORD',
    'YOOKASSA_SECRET_KEY',
    'YOOKASSA_SHOP_ID',
    'YOOKASSA_WEBHOOK_SECRET',
    'FIREBASE_SERVICE_ACCOUNT',
    'FRONTEND_URL',
    'ADMIN_URL',
  ],
};

// Опциональные секреты
const optionalSecrets = [
  'SMS_API_KEY',
  'PAYMENT_API_KEY',
  'FCM_SERVER_KEY',
];

// Правила валидации
const validationRules = {
  JWT_SECRET: {
    minLength: 32,
    type: 'string',
    description: 'JWT access token secret',
  },
  JWT_REFRESH_SECRET: {
    minLength: 32,
    type: 'string',
    description: 'JWT refresh token secret',
  },
  DB_PASSWORD: {
    minLength: 16,
    type: 'string',
    description: 'Database password',
  },
  REDIS_PASSWORD: {
    minLength: 16,
    type: 'string',
    description: 'Redis password',
  },
  YOOKASSA_SECRET_KEY: {
    minLength: 20,
    type: 'string',
    description: 'YooKassa API secret key',
  },
  YOOKASSA_WEBHOOK_SECRET: {
    minLength: 32,
    type: 'string',
    description: 'YooKassa webhook secret',
  },
  FIREBASE_SERVICE_ACCOUNT: {
    type: 'json',
    description: 'Firebase service account JSON',
    validate: (value) => {
      try {
        const parsed = JSON.parse(value);
        return parsed.type === 'service_account' && 
               parsed.project_id && 
               parsed.private_key;
      } catch {
        return false;
      }
    },
  },
  DB_PORT: {
    type: 'number',
    min: 1,
    max: 65535,
    description: 'Database port',
  },
  REDIS_PORT: {
    type: 'number',
    min: 1,
    max: 65535,
    description: 'Redis port',
  },
};

// Результаты валидации
const results = {
  passed: [],
  failed: [],
  warnings: [],
  missing: [],
};

// Получение списка обязательных секретов для текущего окружения
const required = requiredSecrets[environment] || requiredSecrets.development;

// Проверка наличия секретов
log('📋 Проверка наличия секретов...', 'blue');

for (const secret of required) {
  const value = process.env[secret];
  
  if (!value) {
    results.missing.push(secret);
    log(`  ❌ ${secret} - ОТСУТСТВУЕТ`, 'red');
    continue;
  }
  
  // Валидация значения
  const rule = validationRules[secret];
  
  if (!rule) {
    results.passed.push(secret);
    log(`  ✅ ${secret} - присутствует`, 'green');
    continue;
  }
  
  let isValid = true;
  let errorMessage = '';
  
  // Проверка типа
  if (rule.type === 'number') {
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      isValid = false;
      errorMessage = 'должно быть числом';
    } else if (rule.min && num < rule.min) {
      isValid = false;
      errorMessage = `должно быть >= ${rule.min}`;
    } else if (rule.max && num > rule.max) {
      isValid = false;
      errorMessage = `должно быть <= ${rule.max}`;
    }
  }
  
  // Проверка минимальной длины
  if (rule.minLength && value.length < rule.minLength) {
    isValid = false;
    errorMessage = `минимальная длина ${rule.minLength} символов (текущая: ${value.length})`;
  }
  
  // Проверка JSON
  if (rule.type === 'json') {
    try {
      JSON.parse(value);
      if (rule.validate && !rule.validate(value)) {
        isValid = false;
        errorMessage = 'невалидная структура JSON';
      }
    } catch {
      isValid = false;
      errorMessage = 'невалидный JSON';
    }
  }
  
  // Кастомная валидация
  if (rule.validate && typeof rule.validate === 'function') {
    if (!rule.validate(value)) {
      isValid = false;
      errorMessage = 'не прошло кастомную валидацию';
    }
  }
  
  if (isValid) {
    results.passed.push(secret);
    log(`  ✅ ${secret} - валидно`, 'green');
  } else {
    results.failed.push({ secret, error: errorMessage });
    log(`  ❌ ${secret} - НЕВАЛИДНО: ${errorMessage}`, 'red');
  }
}

// Проверка опциональных секретов
log('\n📋 Проверка опциональных секретов...', 'blue');

for (const secret of optionalSecrets) {
  const value = process.env[secret];
  
  if (!value) {
    results.warnings.push(`${secret} не установлен (опционально)`);
    log(`  ⚠️  ${secret} - не установлен (опционально)`, 'yellow');
  } else {
    log(`  ✅ ${secret} - присутствует`, 'green');
  }
}

// Проверка безопасности секретов
log('\n🔒 Проверка безопасности секретов...', 'blue');

const securityChecks = [];

// Проверка на слабые пароли
const weakPasswords = ['password', '123456', 'admin', 'root', 'test'];
for (const secret of ['DB_PASSWORD', 'REDIS_PASSWORD']) {
  const value = process.env[secret];
  if (value && weakPasswords.some(weak => value.toLowerCase().includes(weak))) {
    securityChecks.push(`${secret} содержит слабый пароль`);
    log(`  ⚠️  ${secret} - содержит слабый пароль`, 'yellow');
  }
}

// Проверка на одинаковые секреты
if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
  securityChecks.push('JWT_SECRET и JWT_REFRESH_SECRET одинаковые');
  log('  ⚠️  JWT_SECRET и JWT_REFRESH_SECRET не должны быть одинаковыми', 'yellow');
}

// Проверка на дефолтные значения
const defaultValues = {
  JWT_SECRET: ['your_jwt_secret', 'secret', 'change_me'],
  DB_PASSWORD: ['postgres', 'password', 'your_password'],
};

for (const [secret, defaults] of Object.entries(defaultValues)) {
  const value = process.env[secret];
  if (value && defaults.some(def => value.toLowerCase().includes(def))) {
    securityChecks.push(`${secret} использует дефолтное значение`);
    log(`  ⚠️  ${secret} - использует дефолтное значение`, 'yellow');
  }
}

if (securityChecks.length === 0) {
  log('  ✅ Проблем безопасности не обнаружено', 'green');
}

// Итоговый отчет
log('\n' + '='.repeat(50), 'cyan');
log('📊 ИТОГОВЫЙ ОТЧЕТ', 'cyan');
log('='.repeat(50) + '\n', 'cyan');

log(`✅ Валидные секреты: ${results.passed.length}`, 'green');
log(`❌ Невалидные секреты: ${results.failed.length}`, results.failed.length > 0 ? 'red' : 'green');
log(`❌ Отсутствующие секреты: ${results.missing.length}`, results.missing.length > 0 ? 'red' : 'green');
log(`⚠️  Предупреждения: ${results.warnings.length + securityChecks.length}`, 'yellow');

if (results.missing.length > 0) {
  log('\n❌ Отсутствующие обязательные секреты:', 'red');
  results.missing.forEach(secret => log(`  - ${secret}`, 'red'));
}

if (results.failed.length > 0) {
  log('\n❌ Невалидные секреты:', 'red');
  results.failed.forEach(({ secret, error }) => {
    log(`  - ${secret}: ${error}`, 'red');
  });
}

if (securityChecks.length > 0) {
  log('\n⚠️  Проблемы безопасности:', 'yellow');
  securityChecks.forEach(check => log(`  - ${check}`, 'yellow'));
}

// Рекомендации
if (results.missing.length > 0 || results.failed.length > 0 || securityChecks.length > 0) {
  log('\n💡 Рекомендации:', 'blue');
  
  if (results.missing.length > 0) {
    log('  1. Добавьте отсутствующие секреты в .env или GitHub Secrets', 'blue');
    log('  2. Используйте: node rotate-secrets.js --generate-initial', 'blue');
  }
  
  if (results.failed.length > 0) {
    log('  3. Исправьте невалидные секреты согласно требованиям', 'blue');
  }
  
  if (securityChecks.length > 0) {
    log('  4. Замените слабые/дефолтные секреты на безопасные', 'blue');
    log('  5. Используйте: node rotate-secrets.js --type all', 'blue');
  }
  
  log('\n📖 Документация: docs/SECRETS_MANAGEMENT.md\n', 'blue');
}

// Выход с кодом ошибки если есть критические проблемы
if (results.missing.length > 0 || results.failed.length > 0) {
  log('❌ Валидация не пройдена!\n', 'red');
  process.exit(1);
}

if (securityChecks.length > 0 && environment === 'production') {
  log('⚠️  Обнаружены проблемы безопасности в production!\n', 'yellow');
  process.exit(1);
}

log('✅ Валидация успешно пройдена!\n', 'green');
process.exit(0);
