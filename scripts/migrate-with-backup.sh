#!/bin/bash

# ============================================
# Скрипт применения миграций с автоматическим бэкапом
# ============================================
# 
# Использование:
#   ./migrate-with-backup.sh [environment]
#   ./migrate-with-backup.sh staging
#   ./migrate-with-backup.sh production
# 
# Что делает:
# 1. Создает бэкап базы данных
# 2. Проверяет состояние БД
# 3. Применяет миграции
# 4. Проверяет успешность миграций
# 5. Сохраняет лог миграций
# ============================================

set -e

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Параметры
ENVIRONMENT=${1:-staging}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
LOG_DIR="./logs/migrations"

# Создание директорий
mkdir -p "$BACKUP_DIR"
mkdir -p "$LOG_DIR"

# Заголовок
echo -e "${BLUE}"
echo "============================================"
echo "  Миграция базы данных"
echo "  Окружение: $ENVIRONMENT"
echo "  Время: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo -e "${NC}"

# Загрузка переменных окружения
if [ "$ENVIRONMENT" = "production" ]; then
    if [ ! -f ".env.production" ]; then
        log_error ".env.production не найден"
        exit 1
    fi
    set -a
    source .env.production
    set +a
    DB_HOST=${PRODUCTION_DB_HOST}
    DB_PORT=${PRODUCTION_DB_PORT:-5432}
    DB_NAME=${PRODUCTION_DB_NAME}
    DB_USER=${PRODUCTION_DB_USER}
    DB_PASSWORD=${PRODUCTION_DB_PASSWORD}
elif [ "$ENVIRONMENT" = "staging" ]; then
    if [ ! -f ".env.staging" ]; then
        log_error ".env.staging не найден"
        exit 1
    fi
    set -a
    source .env.staging
    set +a
    DB_HOST=${STAGING_DB_HOST}
    DB_PORT=${STAGING_DB_PORT:-5433}
    DB_NAME=${STAGING_DB_NAME}
    DB_USER=${STAGING_DB_USER}
    DB_PASSWORD=${STAGING_DB_PASSWORD}
else
    log_error "Неизвестное окружение: $ENVIRONMENT"
    log_info "Используйте: staging или production"
    exit 1
fi

log_info "База данных: $DB_NAME на $DB_HOST:$DB_PORT"

# 1. Проверка подключения к БД
log_info "Проверка подключения к базе данных..."
export PGPASSWORD=$DB_PASSWORD

if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
    log_error "Не удалось подключиться к базе данных"
    log_info "Проверьте параметры подключения в .env.$ENVIRONMENT"
    exit 1
fi
log_success "Подключение к БД успешно"

# 2. Получение текущей версии схемы
log_info "Получение текущей версии схемы..."
CURRENT_VERSION=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1" 2>/dev/null | xargs || echo "0")
log_info "Текущая версия: $CURRENT_VERSION"

# 3. Создание бэкапа
BACKUP_FILE="$BACKUP_DIR/${ENVIRONMENT}_${DB_NAME}_${TIMESTAMP}.sql.gz"
log_info "Создание бэкапа: $BACKUP_FILE"

if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" | gzip > "$BACKUP_FILE"; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log_success "Бэкап создан: $BACKUP_SIZE"
else
    log_error "Не удалось создать бэкап"
    exit 1
fi

# 4. Проверка целостности бэкапа
log_info "Проверка целостности бэкапа..."
if gunzip -t "$BACKUP_FILE" 2>/dev/null; then
    log_success "Бэкап валиден"
else
    log_error "Бэкап поврежден"
    exit 1
fi

# 5. Применение миграций
log_info "Применение миграций..."
MIGRATION_LOG="$LOG_DIR/migration_${ENVIRONMENT}_${TIMESTAMP}.log"

cd backend

if npm run migrate 2>&1 | tee "$MIGRATION_LOG"; then
    log_success "Миграции применены успешно"
else
    log_error "Ошибка при применении миграций"
    log_warning "Лог сохранен в: $MIGRATION_LOG"
    
    # Предложение отката
    echo ""
    read -p "Откатить изменения из бэкапа? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Откат из бэкапа..."
        cd ..
        gunzip -c "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"
        log_success "База данных восстановлена из бэкапа"
    fi
    
    exit 1
fi

cd ..

# 6. Получение новой версии схемы
log_info "Проверка новой версии схемы..."
NEW_VERSION=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1" 2>/dev/null | xargs || echo "0")
log_info "Новая версия: $NEW_VERSION"

if [ "$NEW_VERSION" != "$CURRENT_VERSION" ]; then
    log_success "Схема обновлена: $CURRENT_VERSION → $NEW_VERSION"
else
    log_warning "Версия схемы не изменилась (возможно, нет новых миграций)"
fi

# 7. Проверка целостности БД после миграции
log_info "Проверка целостности базы данных..."
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT COUNT(*) FROM users" > /dev/null 2>&1; then
    log_success "База данных работает корректно"
else
    log_error "Проблемы с базой данных после миграции"
    exit 1
fi

# 8. Очистка старых бэкапов (старше 7 дней)
log_info "Очистка старых бэкапов..."
find "$BACKUP_DIR" -name "${ENVIRONMENT}_*.sql.gz" -mtime +7 -delete 2>/dev/null || true
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/${ENVIRONMENT}_*.sql.gz 2>/dev/null | wc -l)
log_info "Бэкапов в хранилище: $BACKUP_COUNT"

# 9. Итоговая информация
echo ""
echo -e "${GREEN}"
echo "============================================"
echo "  ✅ Миграция завершена успешно"
echo "============================================"
echo -e "${NC}"
echo ""
echo "📊 Информация:"
echo "  Окружение: $ENVIRONMENT"
echo "  База данных: $DB_NAME"
echo "  Версия схемы: $CURRENT_VERSION → $NEW_VERSION"
echo "  Бэкап: $BACKUP_FILE ($BACKUP_SIZE)"
echo "  Лог: $MIGRATION_LOG"
echo ""
echo "📝 Следующие шаги:"
echo "  1. Проверьте работу приложения"
echo "  2. Запустите E2E тесты"
echo "  3. Мониторьте логи на ошибки"
echo ""
echo "🔄 Откат (если нужно):"
echo "  gunzip -c $BACKUP_FILE | psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
echo ""

unset PGPASSWORD
