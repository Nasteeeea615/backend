# ============================================
# Скрипт настройки Staging окружения (Windows)
# ============================================
# 
# Использование:
#   .\staging-setup.ps1
# 
# Что делает:
# 1. Проверяет наличие необходимых инструментов
# 2. Создает .env.staging из примера
# 3. Генерирует staging секреты
# 4. Создает базу данных
# 5. Применяет миграции
# 6. Запускает Docker Compose
# ============================================

$ErrorActionPreference = "Stop"

# Функции для цветного вывода
function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

# Заголовок
Write-Host ""
Write-Host "============================================" -ForegroundColor Blue
Write-Host "  Настройка Staging окружения" -ForegroundColor Blue
Write-Host "  Septik Service" -ForegroundColor Blue
Write-Host "============================================" -ForegroundColor Blue
Write-Host ""

# 1. Проверка инструментов
Write-Info "Проверка необходимых инструментов..."

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker не установлен. Установите Docker Desktop: https://www.docker.com/products/docker-desktop"
    exit 1
}
Write-Success "Docker установлен"

if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Error "Docker Compose не установлен"
    exit 1
}
Write-Success "Docker Compose установлен"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js не установлен"
    exit 1
}
Write-Success "Node.js установлен"

# 2. Переход в корневую директорию проекта
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptPath)
Set-Location $projectRoot

Write-Info "Рабочая директория: $projectRoot"

# 3. Проверка .env.staging
Write-Info "Проверка конфигурации..."

if (-not (Test-Path ".env.staging")) {
    Write-Warning ".env.staging не найден. Создаю из примера..."
    Copy-Item ".env.staging.example" ".env.staging"
    Write-Success ".env.staging создан"
    Write-Warning "⚠️  ВАЖНО: Отредактируйте .env.staging и добавьте реальные секреты!"
    Write-Host ""
    Read-Host "Нажмите Enter после редактирования .env.staging"
}

# 4. Загрузка переменных окружения
Write-Info "Загрузка переменных окружения..."
Get-Content ".env.staging" | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        if ($key -and -not $key.StartsWith('#')) {
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}
Write-Success "Переменные загружены"

# 5. Генерация staging секретов (если нужно)
Write-Info "Проверка секретов..."

$stagingWebhookSecret = [Environment]::GetEnvironmentVariable("STAGING_WEBHOOK_SECRET", "Process")
if (-not $stagingWebhookSecret -or $stagingWebhookSecret -eq "CHANGE_ME_GENERATE_WITH_OPENSSL") {
    Write-Warning "Staging webhook секрет не установлен. Генерирую..."
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($bytes)
    $stagingWebhookSecret = -join ($bytes | ForEach-Object { $_.ToString("x2") })
    Add-Content ".env.staging" "`nSTAGING_WEBHOOK_SECRET=$stagingWebhookSecret"
    [Environment]::SetEnvironmentVariable("STAGING_WEBHOOK_SECRET", $stagingWebhookSecret, "Process")
    Write-Success "Webhook секрет сгенерирован и добавлен в .env.staging"
}

# 6. Остановка существующих контейнеров
Write-Info "Остановка существующих staging контейнеров..."
docker-compose -f docker-compose.staging.yml down 2>$null
Write-Success "Контейнеры остановлены"

# 7. Создание volumes
Write-Info "Создание Docker volumes..."
docker volume create septik_postgres_staging_data 2>$null
docker volume create septik_redis_staging_data 2>$null
Write-Success "Volumes созданы"

# 8. Запуск базы данных
Write-Info "Запуск PostgreSQL (staging)..."
docker-compose -f docker-compose.staging.yml up -d postgres-staging
Write-Success "PostgreSQL запущен"

# Ожидание готовности БД
Write-Info "Ожидание готовности базы данных..."
Start-Sleep -Seconds 10

# Проверка подключения к БД
Write-Info "Проверка подключения к базе данных..."
$dbReady = $false
$attempts = 0
$maxAttempts = 30

while (-not $dbReady -and $attempts -lt $maxAttempts) {
    try {
        $result = docker exec septik-postgres-staging pg_isready -U postgres 2>$null
        if ($LASTEXITCODE -eq 0) {
            $dbReady = $true
        }
    } catch {
        Write-Host "." -NoNewline
        Start-Sleep -Seconds 2
        $attempts++
    }
}

if ($dbReady) {
    Write-Host ""
    Write-Success "База данных готова"
} else {
    Write-Host ""
    Write-Warning "База данных не ответила за отведенное время"
}

# 9. Применение миграций
Write-Info "Применение миграций..."
Set-Location "backend"
try {
    npm run migrate 2>$null
    Write-Success "Миграции применены"
} catch {
    Write-Warning "Миграции не применены (возможно, уже применены)"
}
Set-Location $projectRoot

# 10. Запуск Redis
Write-Info "Запуск Redis (staging)..."
docker-compose -f docker-compose.staging.yml up -d redis-staging
Write-Success "Redis запущен"

# 11. Запуск Backend
Write-Info "Сборка и запуск Backend (staging)..."
docker-compose -f docker-compose.staging.yml up -d --build backend-staging
Write-Success "Backend запущен"

# Ожидание готовности Backend
Write-Info "Ожидание готовности Backend..."
Start-Sleep -Seconds 15

# Проверка health endpoint
Write-Info "Проверка health endpoint..."
$backendPort = [Environment]::GetEnvironmentVariable("STAGING_BACKEND_PORT", "Process")
if (-not $backendPort) { $backendPort = "3002" }

try {
    $response = Invoke-WebRequest -Uri "http://localhost:$backendPort/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Success "Backend работает корректно"
    }
} catch {
    Write-Warning "Backend health check не прошел (возможно, еще запускается)"
}

# 12. Запуск Admin Panel (опционально)
$runAdmin = Read-Host "Запустить Admin Panel? (y/n)"
if ($runAdmin -eq "y" -or $runAdmin -eq "Y") {
    Write-Info "Запуск Admin Panel (staging)..."
    docker-compose -f docker-compose.staging.yml up -d --build admin-staging
    Write-Success "Admin Panel запущен"
}

# 13. Итоговая информация
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ✅ Staging окружение готово!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

$dbPort = [Environment]::GetEnvironmentVariable("STAGING_DB_PORT", "Process")
if (-not $dbPort) { $dbPort = "5433" }

$dbName = [Environment]::GetEnvironmentVariable("STAGING_DB_NAME", "Process")
if (-not $dbName) { $dbName = "septik_staging" }

$dbUser = [Environment]::GetEnvironmentVariable("STAGING_DB_USER", "Process")
if (-not $dbUser) { $dbUser = "postgres" }

$redisPort = [Environment]::GetEnvironmentVariable("STAGING_REDIS_PORT", "Process")
if (-not $redisPort) { $redisPort = "6380" }

$adminPort = [Environment]::GetEnvironmentVariable("STAGING_ADMIN_PORT", "Process")
if (-not $adminPort) { $adminPort = "3003" }

Write-Host "📊 Информация о сервисах:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  🗄️  PostgreSQL:"
Write-Host "     Host: localhost"
Write-Host "     Port: $dbPort"
Write-Host "     Database: $dbName"
Write-Host "     User: $dbUser"
Write-Host ""
Write-Host "  🔴 Redis:"
Write-Host "     Host: localhost"
Write-Host "     Port: $redisPort"
Write-Host ""
Write-Host "  🚀 Backend API:"
Write-Host "     URL: http://localhost:$backendPort"
Write-Host "     Health: http://localhost:$backendPort/health"
Write-Host "     API: http://localhost:$backendPort/api"
Write-Host ""
Write-Host "  🎨 Admin Panel:"
Write-Host "     URL: http://localhost:$adminPort"
Write-Host ""
Write-Host "📝 Полезные команды:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Просмотр логов:"
Write-Host "    docker-compose -f docker-compose.staging.yml logs -f"
Write-Host ""
Write-Host "  Остановка:"
Write-Host "    docker-compose -f docker-compose.staging.yml down"
Write-Host ""
Write-Host "  Перезапуск:"
Write-Host "    docker-compose -f docker-compose.staging.yml restart"
Write-Host ""
Write-Host "  Выполнение миграций:"
Write-Host "    cd backend; npm run migrate"
Write-Host ""
Write-Host "  E2E тесты:"
Write-Host "    cd backend; npm run e2e:staging"
Write-Host ""
Write-Host "🔐 Безопасность:" -ForegroundColor Yellow
Write-Host "  - Staging использует отдельные БД и Redis"
Write-Host "  - Порты отличаются от production"
Write-Host "  - Webhook секрет уникален для staging"
Write-Host ""
Write-Host "⚠️  Следующие шаги:" -ForegroundColor Yellow
Write-Host "  1. Проверьте работу API: curl http://localhost:$backendPort/health"
Write-Host "  2. Запустите E2E тесты: npm run e2e:staging"
Write-Host "  3. Обновите webhook URL в ЮКасса"
Write-Host ""
