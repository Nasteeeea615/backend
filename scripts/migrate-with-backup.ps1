# ============================================
# Скрипт применения миграций с автоматическим бэкапом (Windows)
# ============================================
# 
# Использование:
#   .\migrate-with-backup.ps1 [environment]
#   .\migrate-with-backup.ps1 staging
#   .\migrate-with-backup.ps1 production
# 
# Что делает:
# 1. Создает бэкап базы данных
# 2. Проверяет состояние БД
# 3. Применяет миграции
# 4. Проверяет успешность миграций
# 5. Сохраняет лог миграций
# ============================================

param(
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

function Write-Info { param([string]$Message); Write-Host "ℹ️  $Message" -ForegroundColor Blue }
function Write-Success { param([string]$Message); Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Warning { param([string]$Message); Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message); Write-Host "❌ $Message" -ForegroundColor Red }

# Параметры
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = ".\backups"
$logDir = ".\logs\migrations"

# Создание директорий
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# Заголовок
Write-Host ""
Write-Host "============================================" -ForegroundColor Blue
Write-Host "  Миграция базы данных" -ForegroundColor Blue
Write-Host "  Окружение: $Environment" -ForegroundColor Blue
Write-Host "  Время: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Blue
Write-Host "============================================" -ForegroundColor Blue
Write-Host ""

# Загрузка переменных окружения
$envFile = ".env.$Environment"
if (-not (Test-Path $envFile)) {
    Write-Error "$envFile не найден"
    exit 1
}

Write-Info "Загрузка переменных из $envFile..."
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()
        if ($key -and -not $key.StartsWith('#')) {
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

# Получение параметров БД
if ($Environment -eq "production") {
    $dbHost = $env:PRODUCTION_DB_HOST
    $dbPort = if ($env:PRODUCTION_DB_PORT) { $env:PRODUCTION_DB_PORT } else { "5432" }
    $dbName = $env:PRODUCTION_DB_NAME
    $dbUser = $env:PRODUCTION_DB_USER
    $dbPassword = $env:PRODUCTION_DB_PASSWORD
} elseif ($Environment -eq "staging") {
    $dbHost = $env:STAGING_DB_HOST
    $dbPort = if ($env:STAGING_DB_PORT) { $env:STAGING_DB_PORT } else { "5433" }
    $dbName = $env:STAGING_DB_NAME
    $dbUser = $env:STAGING_DB_USER
    $dbPassword = $env:STAGING_DB_PASSWORD
} else {
    Write-Error "Неизвестное окружение: $Environment"
    Write-Info "Используйте: staging или production"
    exit 1
}

Write-Info "База данных: $dbName на ${dbHost}:${dbPort}"

# Установка переменной окружения для пароля PostgreSQL
$env:PGPASSWORD = $dbPassword

# 1. Проверка подключения к БД
Write-Info "Проверка подключения к базе данных..."

# Проверка через Docker (если БД в контейнере)
$containerName = if ($Environment -eq "staging") { "septik-postgres-staging" } else { "septik-postgres-prod" }

try {
    $testQuery = "SELECT 1"
    if ($dbHost -eq "localhost" -or $dbHost -eq "127.0.0.1") {
        # Попытка подключения через Docker
        $result = docker exec $containerName psql -U $dbUser -d $dbName -c $testQuery 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "Не удалось подключиться через Docker"
        }
    } else {
        # Подключение к удаленной БД (требуется psql в PATH)
        $result = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -c $testQuery 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw "Не удалось подключиться к удаленной БД"
        }
    }
    Write-Success "Подключение к БД успешно"
} catch {
    Write-Error "Не удалось подключиться к базе данных"
    Write-Info "Проверьте параметры подключения в $envFile"
    exit 1
}

# 2. Получение текущей версии схемы
Write-Info "Получение текущей версии схемы..."
try {
    if ($dbHost -eq "localhost" -or $dbHost -eq "127.0.0.1") {
        $currentVersion = docker exec $containerName psql -U $dbUser -d $dbName -t -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1" 2>$null
    } else {
        $currentVersion = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1" 2>$null
    }
    $currentVersion = $currentVersion.Trim()
    if (-not $currentVersion) { $currentVersion = "0" }
    Write-Info "Текущая версия: $currentVersion"
} catch {
    $currentVersion = "0"
    Write-Warning "Не удалось получить версию схемы (возможно, таблица не существует)"
}

# 3. Создание бэкапа
$backupFile = "$backupDir\${Environment}_${dbName}_${timestamp}.sql.gz"
Write-Info "Создание бэкапа: $backupFile"

try {
    if ($dbHost -eq "localhost" -or $dbHost -eq "127.0.0.1") {
        # Бэкап через Docker
        docker exec $containerName pg_dump -U $dbUser $dbName | gzip > $backupFile
    } else {
        # Бэкап удаленной БД
        pg_dump -h $dbHost -p $dbPort -U $dbUser $dbName | gzip > $backupFile
    }
    
    $backupSize = (Get-Item $backupFile).Length / 1MB
    Write-Success "Бэкап создан: $([math]::Round($backupSize, 2)) MB"
} catch {
    Write-Error "Не удалось создать бэкап: $_"
    exit 1
}

# 4. Проверка целостности бэкапа
Write-Info "Проверка целостности бэкапа..."
try {
    $testResult = gzip -t $backupFile 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Бэкап валиден"
    } else {
        throw "Бэкап поврежден"
    }
} catch {
    Write-Error "Бэкап поврежден"
    exit 1
}

# 5. Применение миграций
Write-Info "Применение миграций..."
$migrationLog = "$logDir\migration_${Environment}_${timestamp}.log"

Set-Location "backend"

try {
    npm run migrate 2>&1 | Tee-Object -FilePath $migrationLog
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Миграции применены успешно"
    } else {
        throw "Ошибка при применении миграций"
    }
} catch {
    Write-Error "Ошибка при применении миграций"
    Write-Warning "Лог сохранен в: $migrationLog"
    
    # Предложение отката
    Write-Host ""
    $rollback = Read-Host "Откатить изменения из бэкапа? (y/n)"
    if ($rollback -eq "y" -or $rollback -eq "Y") {
        Write-Info "Откат из бэкапа..."
        Set-Location ".."
        
        if ($dbHost -eq "localhost" -or $dbHost -eq "127.0.0.1") {
            gunzip -c $backupFile | docker exec -i $containerName psql -U $dbUser -d $dbName
        } else {
            gunzip -c $backupFile | psql -h $dbHost -p $dbPort -U $dbUser -d $dbName
        }
        
        Write-Success "База данных восстановлена из бэкапа"
    }
    
    exit 1
}

Set-Location ".."

# 6. Получение новой версии схемы
Write-Info "Проверка новой версии схемы..."
try {
    if ($dbHost -eq "localhost" -or $dbHost -eq "127.0.0.1") {
        $newVersion = docker exec $containerName psql -U $dbUser -d $dbName -t -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1" 2>$null
    } else {
        $newVersion = psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -c "SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1" 2>$null
    }
    $newVersion = $newVersion.Trim()
    if (-not $newVersion) { $newVersion = "0" }
    Write-Info "Новая версия: $newVersion"
    
    if ($newVersion -ne $currentVersion) {
        Write-Success "Схема обновлена: $currentVersion → $newVersion"
    } else {
        Write-Warning "Версия схемы не изменилась (возможно, нет новых миграций)"
    }
} catch {
    Write-Warning "Не удалось получить новую версию схемы"
}

# 7. Проверка целостности БД после миграции
Write-Info "Проверка целостности базы данных..."
try {
    if ($dbHost -eq "localhost" -or $dbHost -eq "127.0.0.1") {
        docker exec $containerName psql -U $dbUser -d $dbName -c "SELECT COUNT(*) FROM users" 2>$null | Out-Null
    } else {
        psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -c "SELECT COUNT(*) FROM users" 2>$null | Out-Null
    }
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "База данных работает корректно"
    } else {
        throw "Ошибка при проверке БД"
    }
} catch {
    Write-Error "Проблемы с базой данных после миграции"
    exit 1
}

# 8. Очистка старых бэкапов (старше 7 дней)
Write-Info "Очистка старых бэкапов..."
$oldBackups = Get-ChildItem -Path $backupDir -Filter "${Environment}_*.sql.gz" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) }
$oldBackups | Remove-Item -Force
$backupCount = (Get-ChildItem -Path $backupDir -Filter "${Environment}_*.sql.gz").Count
Write-Info "Бэкапов в хранилище: $backupCount"

# 9. Итоговая информация
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ✅ Миграция завершена успешно" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Информация:"
Write-Host "  Окружение: $Environment"
Write-Host "  База данных: $dbName"
Write-Host "  Версия схемы: $currentVersion → $newVersion"
Write-Host "  Бэкап: $backupFile"
Write-Host "  Лог: $migrationLog"
Write-Host ""
Write-Host "📝 Следующие шаги:"
Write-Host "  1. Проверьте работу приложения"
Write-Host "  2. Запустите E2E тесты"
Write-Host "  3. Мониторьте логи на ошибки"
Write-Host ""
Write-Host "🔄 Откат (если нужно):"
if ($dbHost -eq "localhost" -or $dbHost -eq "127.0.0.1") {
    Write-Host "  gunzip -c $backupFile | docker exec -i $containerName psql -U $dbUser -d $dbName"
} else {
    Write-Host "  gunzip -c $backupFile | psql -h $dbHost -p $dbPort -U $dbUser -d $dbName"
}
Write-Host ""

Remove-Item Env:\PGPASSWORD
