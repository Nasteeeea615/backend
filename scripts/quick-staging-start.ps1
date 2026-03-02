# Быстрый запуск staging окружения
# Использование: .\quick-staging-start.ps1

Write-Host "🚀 Запуск Staging окружения..." -ForegroundColor Cyan
Write-Host ""

# Загрузка переменных из .env.staging
Write-Host "📝 Загрузка переменных окружения..." -ForegroundColor Blue
$envFile = "..\.env.staging"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            if ($key -and -not $key.StartsWith('#')) {
                [Environment]::SetEnvironmentVariable($key, $value, "Process")
            }
        }
    }
    Write-Host "✅ Переменные загружены" -ForegroundColor Green
} else {
    Write-Host "❌ .env.staging не найден" -ForegroundColor Red
    exit 1
}

# Запуск PostgreSQL и Redis
Write-Host ""
Write-Host "🗄️  Запуск PostgreSQL и Redis..." -ForegroundColor Blue
docker-compose -f ..\docker-compose.staging.yml up -d postgres-staging redis-staging 2>$null

# Ожидание готовности БД
Write-Host "⏳ Ожидание готовности PostgreSQL..." -ForegroundColor Blue
Start-Sleep -Seconds 10

# Проверка подключения
$dbReady = $false
$attempts = 0
while (-not $dbReady -and $attempts -lt 15) {
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
    Write-Host "✅ PostgreSQL готов" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "⚠️  PostgreSQL не ответил" -ForegroundColor Yellow
}

# Проверка статуса
Write-Host ""
Write-Host "📊 Статус сервисов:" -ForegroundColor Cyan
docker ps --filter "name=septik" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

Write-Host ""
Write-Host "✅ Staging окружение запущено!" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Следующие шаги:" -ForegroundColor Cyan
Write-Host "  1. Проверьте подключение: docker exec septik-postgres-staging psql -U postgres -d septik_staging -c 'SELECT 1'"
Write-Host "  2. Запустите E2E тесты: npm run e2e"
Write-Host ""
