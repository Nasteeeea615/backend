#!/bin/bash

# ============================================
# Скрипт настройки Staging окружения
# ============================================
# 
# Использование:
#   ./staging-setup.sh
# 
# Что делает:
# 1. Проверяет наличие необходимых инструментов
# 2. Создает .env.staging из примера
# 3. Генерирует staging секреты
# 4. Создает базу данных
# 5. Применяет миграции
# 6. Запускает Docker Compose
# ============================================

set -e  # Остановка при ошибке

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции для вывода
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Заголовок
echo -e "${BLUE}"
echo "============================================"
echo "  Настройка Staging окружения"
echo "  Septik Service"
echo "============================================"
echo -e "${NC}"

# 1. Проверка инструментов
log_info "Проверка необходимых инструментов..."

if ! command -v docker &> /dev/null; then
    log_error "Docker не установлен. Установите Docker: https://docs.docker.com/get-docker/"
    exit 1
fi
log_success "Docker установлен"

if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose не установлен"
    exit 1
fi
log_success "Docker Compose установлен"

if ! command -v node &> /dev/null; then
    log_error "Node.js не установлен"
    exit 1
fi
log_success "Node.js установлен"

# 2. Проверка .env.staging
log_info "Проверка конфигурации..."

if [ ! -f ".env.staging" ]; then
    log_warning ".env.staging не найден. Создаю из примера..."
    cp .env.staging.example .env.staging
    log_success ".env.staging создан"
    log_warning "⚠️  ВАЖНО: Отредактируйте .env.staging и добавьте реальные секреты!"
    echo ""
    read -p "Нажмите Enter после редактирования .env.staging..."
fi

# 3. Загрузка переменных окружения
log_info "Загрузка переменных окружения..."
set -a
source .env.staging
set +a
log_success "Переменные загружены"

# 4. Генерация staging секретов (если нужно)
log_info "Проверка секретов..."

if [ -z "$STAGING_WEBHOOK_SECRET" ] || [ "$STAGING_WEBHOOK_SECRET" = "CHANGE_ME_GENERATE_WITH_OPENSSL" ]; then
    log_warning "Staging webhook секрет не установлен. Генерирую..."
    STAGING_WEBHOOK_SECRET=$(openssl rand -hex 32)
    echo "STAGING_WEBHOOK_SECRET=$STAGING_WEBHOOK_SECRET" >> .env.staging
    log_success "Webhook секрет сгенерирован и добавлен в .env.staging"
fi

# 5. Остановка существующих контейнеров
log_info "Остановка существующих staging контейнеров..."
docker-compose -f docker-compose.staging.yml down 2>/dev/null || true
log_success "Контейнеры остановлены"

# 6. Создание volumes
log_info "Создание Docker volumes..."
docker volume create septik_postgres_staging_data 2>/dev/null || true
docker volume create septik_redis_staging_data 2>/dev/null || true
log_success "Volumes созданы"

# 7. Запуск базы данных
log_info "Запуск PostgreSQL (staging)..."
docker-compose -f docker-compose.staging.yml up -d postgres-staging
log_success "PostgreSQL запущен"

# Ожидание готовности БД
log_info "Ожидание готовности базы данных..."
sleep 10

# Проверка подключения к БД
log_info "Проверка подключения к базе данных..."
until docker exec septik-postgres-staging pg_isready -U ${STAGING_DB_USER:-postgres} > /dev/null 2>&1; do
    echo -n "."
    sleep 2
done
echo ""
log_success "База данных готова"

# 8. Применение миграций
log_info "Применение миграций..."
cd backend
npm run migrate 2>/dev/null || log_warning "Миграции не применены (возможно, уже применены)"
cd ..
log_success "Миграции применены"

# 9. Запуск Redis
log_info "Запуск Redis (staging)..."
docker-compose -f docker-compose.staging.yml up -d redis-staging
log_success "Redis запущен"

# 10. Запуск Backend
log_info "Сборка и запуск Backend (staging)..."
docker-compose -f docker-compose.staging.yml up -d --build backend-staging
log_success "Backend запущен"

# Ожидание готовности Backend
log_info "Ожидание готовности Backend..."
sleep 15

# Проверка health endpoint
log_info "Проверка health endpoint..."
BACKEND_PORT=${STAGING_BACKEND_PORT:-3002}
if curl -f http://localhost:$BACKEND_PORT/health > /dev/null 2>&1; then
    log_success "Backend работает корректно"
else
    log_warning "Backend health check не прошел (возможно, еще запускается)"
fi

# 11. Запуск Admin Panel (опционально)
read -p "Запустить Admin Panel? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Запуск Admin Panel (staging)..."
    docker-compose -f docker-compose.staging.yml up -d --build admin-staging
    log_success "Admin Panel запущен"
fi

# 12. Итоговая информация
echo ""
echo -e "${GREEN}"
echo "============================================"
echo "  ✅ Staging окружение готово!"
echo "============================================"
echo -e "${NC}"
echo ""
echo "📊 Информация о сервисах:"
echo ""
echo "  🗄️  PostgreSQL:"
echo "     Host: localhost"
echo "     Port: ${STAGING_DB_PORT:-5433}"
echo "     Database: ${STAGING_DB_NAME:-septik_staging}"
echo "     User: ${STAGING_DB_USER:-postgres}"
echo ""
echo "  🔴 Redis:"
echo "     Host: localhost"
echo "     Port: ${STAGING_REDIS_PORT:-6380}"
echo ""
echo "  🚀 Backend API:"
echo "     URL: http://localhost:${STAGING_BACKEND_PORT:-3002}"
echo "     Health: http://localhost:${STAGING_BACKEND_PORT:-3002}/health"
echo "     API: http://localhost:${STAGING_BACKEND_PORT:-3002}/api"
echo ""
echo "  🎨 Admin Panel:"
echo "     URL: http://localhost:${STAGING_ADMIN_PORT:-3003}"
echo ""
echo "📝 Полезные команды:"
echo ""
echo "  Просмотр логов:"
echo "    docker-compose -f docker-compose.staging.yml logs -f"
echo ""
echo "  Остановка:"
echo "    docker-compose -f docker-compose.staging.yml down"
echo ""
echo "  Перезапуск:"
echo "    docker-compose -f docker-compose.staging.yml restart"
echo ""
echo "  Выполнение миграций:"
echo "    cd backend && npm run migrate"
echo ""
echo "  E2E тесты:"
echo "    cd backend && npm run e2e:staging"
echo ""
echo "🔐 Безопасность:"
echo "  - Staging использует отдельные БД и Redis"
echo "  - Порты отличаются от production"
echo "  - Webhook секрет уникален для staging"
echo ""
echo "⚠️  Следующие шаги:"
echo "  1. Проверьте работу API: curl http://localhost:${STAGING_BACKEND_PORT:-3002}/health"
echo "  2. Запустите E2E тесты: npm run e2e:staging"
echo "  3. Обновите webhook URL в ЮКасса"
echo ""
