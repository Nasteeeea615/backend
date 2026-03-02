#!/usr/bin/env node

/**
 * Скрипт ротации секретов
 * 
 * Использование:
 *   node rotate-secrets.js --type jwt [--dry-run]
 *   node rotate-secrets.js --type db [--dry-run]
 *   node rotate-secrets.js --type all [--dry-run]
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function generateSecret(type) {
  switch (type) {
    case 'jwt':
      // 64 байта base64 для JWT секретов
      return crypto.randomBytes(64).toString('base64');
    
    case 'webhook':
      // 32 байта hex для webhook секретов
      return crypto.randomBytes(32).toString('hex');
    
    case 'password':
      // 32 байта base64 для паролей БД
      return crypto.randomBytes(32).toString('base64').replace(/[+/=]/g, '');
    
    default:
      return crypto.randomBytes(32).toString('base64');
  }
}

function rotateJWTSecrets(dryRun = false) {
  log('\n🔄 Ротация JWT секретов...', 'cyan');
  
  const newAccessSecret = generateSecret('jwt');
  const newRefreshSecret = generateSecret('jwt');
  
  log('\n📝 Новые секреты сгенерированы:', 'green');
  log(`\nJWT_SECRET_NEW:\n${newAccessSecret}`, 'yellow');
  log(`\nJWT_REFRESH_SECRET_NEW:\n${newRefreshSecret}`, 'yellow');
  
  if (dryRun) {
    log('\n⚠️  DRY RUN: Секреты не применены', 'yellow');
    log('\nДля применения:', 'blue');
    log('1. Добавьте JWT_SECRET_NEW и JWT_REFRESH_SECRET_NEW в GitHub Secrets', 'blue');
    log('2. Деплойте приложение с поддержкой dual-key', 'blue');
    log('3. Через 7 дней замените старые секреты новыми', 'blue');
  } else {
    log('\n✅ Следующие шаги:', 'green');
    log('1. Добавьте эти секреты в GitHub Secrets с суффиксом _NEW', 'green');
    log('2. Обновите backend для поддержки dual-key верификации', 'green');
    log('3. Деплойте в production', 'green');
    log('4. Через 7 дней финализируйте ротацию', 'green');
  }
  
  return {
    JWT_SECRET_NEW: newAccessSecret,
    JWT_REFRESH_SECRET_NEW: newRefreshSecret,
  };
}

function rotateDBPassword(dryRun = false) {
  log('\n🔄 Ротация пароля базы данных...', 'cyan');
  
  const newPassword = generateSecret('password');
  
  log('\n📝 Новый пароль сгенерирован:', 'green');
  log(`\nDB_PASSWORD_NEW:\n${newPassword}`, 'yellow');
  
  if (dryRun) {
    log('\n⚠️  DRY RUN: Пароль не применен', 'yellow');
  } else {
    log('\n⚠️  ВНИМАНИЕ: Ротация пароля БД требует downtime!', 'red');
    log('\n✅ Следующие шаги:', 'green');
    log('1. Создайте нового пользователя БД:', 'green');
    log(`   CREATE USER septik_new WITH PASSWORD '${newPassword}';`, 'yellow');
    log('   GRANT ALL PRIVILEGES ON DATABASE septik_db TO septik_new;', 'yellow');
    log('   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO septik_new;', 'yellow');
    log('2. Обновите DB_USER и DB_PASSWORD в GitHub Secrets', 'green');
    log('3. Деплойте приложение', 'green');
    log('4. Удалите старого пользователя: DROP USER septik_old;', 'green');
  }
  
  return {
    DB_PASSWORD_NEW: newPassword,
  };
}

function rotateRedisPassword(dryRun = false) {
  log('\n🔄 Ротация пароля Redis...', 'cyan');
  
  const newPassword = generateSecret('password');
  
  log('\n📝 Новый пароль сгенерирован:', 'green');
  log(`\nREDIS_PASSWORD_NEW:\n${newPassword}`, 'yellow');
  
  if (dryRun) {
    log('\n⚠️  DRY RUN: Пароль не применен', 'yellow');
  } else {
    log('\n✅ Следующие шаги:', 'green');
    log('1. Обновите REDIS_PASSWORD в GitHub Secrets', 'green');
    log('2. Обновите docker-compose.prod.yml с новым паролем', 'green');
    log('3. Деплойте приложение (Redis перезапустится с новым паролем)', 'green');
  }
  
  return {
    REDIS_PASSWORD_NEW: newPassword,
  };
}

function rotateWebhookSecret(dryRun = false) {
  log('\n🔄 Ротация webhook секрета...', 'cyan');
  
  const newSecret = generateSecret('webhook');
  
  log('\n📝 Новый секрет сгенерирован:', 'green');
  log(`\nYOOKASSA_WEBHOOK_SECRET_NEW:\n${newSecret}`, 'yellow');
  
  if (dryRun) {
    log('\n⚠️  DRY RUN: Секрет не применен', 'yellow');
  } else {
    log('\n✅ Следующие шаги:', 'green');
    log('1. Обновите YOOKASSA_WEBHOOK_SECRET в GitHub Secrets', 'green');
    log('2. Деплойте приложение', 'green');
    log('3. Обновите webhook URL в личном кабинете ЮКасса (если требуется)', 'green');
  }
  
  return {
    YOOKASSA_WEBHOOK_SECRET_NEW: newSecret,
  };
}

function rotateAllSecrets(dryRun = false) {
  log('\n🔄 Ротация ВСЕХ секретов...', 'cyan');
  log('⚠️  Это критическая операция!', 'red');
  
  const secrets = {
    ...rotateJWTSecrets(dryRun),
    ...rotateDBPassword(dryRun),
    ...rotateRedisPassword(dryRun),
    ...rotateWebhookSecret(dryRun),
  };
  
  // Сохранение в файл для удобства
  if (!dryRun) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `secrets-rotation-${timestamp}.txt`;
    const filepath = path.join(__dirname, filename);
    
    let content = '# Новые секреты\n';
    content += `# Сгенерировано: ${new Date().toISOString()}\n\n`;
    
    for (const [key, value] of Object.entries(secrets)) {
      content += `${key}=${value}\n`;
    }
    
    fs.writeFileSync(filepath, content, 'utf8');
    log(`\n💾 Секреты сохранены в: ${filename}`, 'green');
    log('⚠️  УДАЛИТЕ этот файл после добавления секретов в GitHub!', 'red');
  }
  
  return secrets;
}

function generateInitialSecrets() {
  log('\n🎉 Генерация начальных секретов для нового проекта...', 'cyan');
  
  const secrets = {
    JWT_SECRET: generateSecret('jwt'),
    JWT_REFRESH_SECRET: generateSecret('jwt'),
    DB_PASSWORD: generateSecret('password'),
    REDIS_PASSWORD: generateSecret('password'),
    YOOKASSA_WEBHOOK_SECRET: generateSecret('webhook'),
    STAGING_WEBHOOK_SECRET: generateSecret('webhook'),
  };
  
  log('\n📝 Секреты сгенерированы:', 'green');
  
  for (const [key, value] of Object.entries(secrets)) {
    log(`\n${key}:`, 'yellow');
    log(value, 'cyan');
  }
  
  // Сохранение в файл
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `initial-secrets-${timestamp}.txt`;
  const filepath = path.join(__dirname, filename);
  
  let content = '# Начальные секреты для проекта\n';
  content += `# Сгенерировано: ${new Date().toISOString()}\n\n`;
  content += '# Добавьте эти секреты в GitHub Secrets:\n\n';
  
  for (const [key, value] of Object.entries(secrets)) {
    content += `${key}=${value}\n`;
  }
  
  content += '\n# ⚠️  ВАЖНО:\n';
  content += '# 1. Добавьте все секреты в GitHub Settings → Secrets\n';
  content += '# 2. УДАЛИТЕ этот файл после добавления!\n';
  content += '# 3. Никогда не коммитьте этот файл в Git!\n';
  
  fs.writeFileSync(filepath, content, 'utf8');
  
  log(`\n💾 Секреты сохранены в: ${filename}`, 'green');
  log('\n⚠️  КРИТИЧНО:', 'red');
  log('1. Добавьте все секреты в GitHub Secrets', 'red');
  log('2. УДАЛИТЕ этот файл!', 'red');
  log('3. Никогда не коммитьте секреты в Git!', 'red');
  
  return secrets;
}

function showHelp() {
  log('\n📖 Использование скрипта ротации секретов\n', 'cyan');
  log('Команды:', 'yellow');
  log('  node rotate-secrets.js --type jwt [--dry-run]', 'green');
  log('    Ротация JWT секретов (access и refresh)\n', 'blue');
  
  log('  node rotate-secrets.js --type db [--dry-run]', 'green');
  log('    Ротация пароля базы данных\n', 'blue');
  
  log('  node rotate-secrets.js --type redis [--dry-run]', 'green');
  log('    Ротация пароля Redis\n', 'blue');
  
  log('  node rotate-secrets.js --type webhook [--dry-run]', 'green');
  log('    Ротация webhook секрета\n', 'blue');
  
  log('  node rotate-secrets.js --type all [--dry-run]', 'green');
  log('    Ротация ВСЕХ секретов (критическая операция)\n', 'blue');
  
  log('  node rotate-secrets.js --generate-initial', 'green');
  log('    Генерация начальных секретов для нового проекта\n', 'blue');
  
  log('Опции:', 'yellow');
  log('  --dry-run    Показать новые секреты без применения', 'green');
  log('  --help       Показать эту справку\n', 'green');
  
  log('Примеры:', 'yellow');
  log('  node rotate-secrets.js --type jwt --dry-run', 'cyan');
  log('  node rotate-secrets.js --type all', 'cyan');
  log('  node rotate-secrets.js --generate-initial\n', 'cyan');
}

// Парсинг аргументов
const args = process.argv.slice(2);
const typeIndex = args.indexOf('--type');
const type = typeIndex !== -1 ? args[typeIndex + 1] : null;
const dryRun = args.includes('--dry-run');
const generateInitial = args.includes('--generate-initial');
const help = args.includes('--help');

// Главная логика
if (help) {
  showHelp();
  process.exit(0);
}

if (generateInitial) {
  generateInitialSecrets();
  process.exit(0);
}

if (!type) {
  log('❌ Ошибка: не указан тип ротации', 'red');
  log('Используйте --help для справки\n', 'yellow');
  process.exit(1);
}

log('\n🔐 Скрипт ротации секретов', 'magenta');
log('================================\n', 'magenta');

switch (type) {
  case 'jwt':
    rotateJWTSecrets(dryRun);
    break;
  
  case 'db':
    rotateDBPassword(dryRun);
    break;
  
  case 'redis':
    rotateRedisPassword(dryRun);
    break;
  
  case 'webhook':
    rotateWebhookSecret(dryRun);
    break;
  
  case 'all':
    rotateAllSecrets(dryRun);
    break;
  
  default:
    log(`❌ Неизвестный тип: ${type}`, 'red');
    log('Доступные типы: jwt, db, redis, webhook, all\n', 'yellow');
    process.exit(1);
}

log('\n✅ Готово!\n', 'green');
