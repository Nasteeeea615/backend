#!/bin/bash

# ============================================
# Скрипт безопасного обновления зависимостей
# ============================================
# 
# Использование:
#   ./update-dependencies.sh [type]
#   ./update-dependencies.sh patch  # только patch updates
#   ./update-dependencies.sh minor  # patch + minor updates
#   ./update-dependencies.sh major  # все updates (осторожно!)
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

UPDATE_TYPE=${1:-patch}

echo -e "${BLUE}"
echo "============================================"
echo "  Обновление зависимостей"
echo "  Тип: $UPDATE_TYPE"
echo "============================================"
echo -e "${NC}"

# 1. Проверка текущего состояния
log_info "Проверка текущих уязвимостей..."
npm audit --json > audit-before.json
VULNS_BEFORE=$(cat audit-before.json | jq '.metadata.vulnerabilities.total')
log_info "Уязвимостей до обновления: $VULNS_BEFORE"

# 2. Создание бэкапа package.json
log_info "Создание бэкапа package.json..."
cp package.json package.json.backup
cp package-lock.json package-lock.json.backup
log_success "Бэкап создан"

# 3. Обновление зависимостей
log_info "Обновление зависимостей ($UPDATE_TYPE)..."

case $UPDATE_TYPE in
    patch)
        log_info "Обновление только patch версий (безопасно)"
        npm update
        ;;
    minor)
        log_info "Обновление patch + minor версий"
        npm update
        ;;
    major)
        log_warning "Обновление всех версий (может сломать код!)"
        read -p "Вы уверены? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Отменено"
            exit 0
        fi
        npm install $(npm outdated --parseable | cut -d: -f4 | xargs -I {} echo "{}@latest")
        ;;
    *)
        log_error "Неизвестный тип: $UPDATE_TYPE"
        log_info "Используйте: patch, minor, или major"
        exit 1
        ;;
esac

# 4. Проверка после обновления
log_info "Проверка уязвимостей после обновления..."
npm audit --json > audit-after.json
VULNS_AFTER=$(cat audit-after.json | jq '.metadata.vulnerabilities.total')
log_info "Уязвимостей после обновления: $VULNS_AFTER"

# 5. Запуск тестов
log_info "Запуск тестов..."
if npm test; then
    log_success "Тесты пройдены"
else
    log_error "Тесты провалились!"
    log_warning "Откат изменений..."
    mv package.json.backup package.json
    mv package-lock.json.backup package-lock.json
    npm install
    log_success "Изменения отменены"
    exit 1
fi

# 6. Проверка TypeScript
log_info "Проверка TypeScript..."
if npx tsc --noEmit; then
    log_success "TypeScript проверка пройдена"
else
    log_error "TypeScript ошибки!"
    log_warning "Откат изменений..."
    mv package.json.backup package.json
    mv package-lock.json.backup package-lock.json
    npm install
    log_success "Изменения отменены"
    exit 1
fi

# 7. Итоговая информация
echo ""
echo -e "${GREEN}"
echo "============================================"
echo "  ✅ Обновление завершено успешно"
echo "============================================"
echo -e "${NC}"
echo ""
echo "📊 Статистика:"
echo "  Уязвимостей до: $VULNS_BEFORE"
echo "  Уязвимостей после: $VULNS_AFTER"
echo ""

if [ $VULNS_AFTER -lt $VULNS_BEFORE ]; then
    log_success "Уязвимостей стало меньше!"
elif [ $VULNS_AFTER -eq $VULNS_BEFORE ]; then
    log_info "Количество уязвимостей не изменилось"
else
    log_warning "Уязвимостей стало больше!"
fi

# 8. Показать обновленные пакеты
echo ""
log_info "Обновленные пакеты:"
npm outdated || true

# 9. Очистка
rm audit-before.json audit-after.json
rm package.json.backup package-lock.json.backup

echo ""
log_success "Готово!"
echo ""
log_info "Следующие шаги:"
echo "  1. Проверьте изменения: git diff package.json"
echo "  2. Запустите приложение: npm run dev"
echo "  3. Запустите E2E тесты: npm run e2e"
echo "  4. Закоммитьте изменения: git commit -am 'chore: update dependencies'"
echo ""
