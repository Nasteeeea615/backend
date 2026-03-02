# ============================================
# Скрипт безопасного обновления зависимостей (Windows)
# ============================================
# 
# Использование:
#   .\update-dependencies.ps1 [type]
#   .\update-dependencies.ps1 patch  # только patch updates
#   .\update-dependencies.ps1 minor  # patch + minor updates
#   .\update-dependencies.ps1 major  # все updates (осторожно!)
# ============================================

param(
    [string]$UpdateType = "patch"
)

$ErrorActionPreference = "Stop"

function Write-Info { param([string]$Message); Write-Host "ℹ️  $Message" -ForegroundColor Blue }
function Write-Success { param([string]$Message); Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Warning { param([string]$Message); Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message); Write-Host "❌ $Message" -ForegroundColor Red }

Write-Host ""
Write-Host "============================================" -ForegroundColor Blue
Write-Host "  Обновление зависимостей" -ForegroundColor Blue
Write-Host "  Тип: $UpdateType" -ForegroundColor Blue
Write-Host "============================================" -ForegroundColor Blue
Write-Host ""

# 1. Проверка текущего состояния
Write-Info "Проверка текущих уязвимостей..."
npm audit --json | Out-File -FilePath "audit-before.json" -Encoding UTF8
$auditBefore = Get-Content "audit-before.json" | ConvertFrom-Json
$vulnsBefore = $auditBefore.metadata.vulnerabilities.total
Write-Info "Уязвимостей до обновления: $vulnsBefore"

# 2. Создание бэкапа
Write-Info "Создание бэкапа package.json..."
Copy-Item "package.json" "package.json.backup"
Copy-Item "package-lock.json" "package-lock.json.backup"
Write-Success "Бэкап создан"

# 3. Обновление зависимостей
Write-Info "Обновление зависимостей ($UpdateType)..."

try {
    switch ($UpdateType) {
        "patch" {
            Write-Info "Обновление только patch версий (безопасно)"
            npm update
        }
        "minor" {
            Write-Info "Обновление patch + minor версий"
            npm update
        }
        "major" {
            Write-Warning "Обновление всех версий (может сломать код!)"
            $confirm = Read-Host "Вы уверены? (y/n)"
            if ($confirm -ne "y" -and $confirm -ne "Y") {
                Write-Info "Отменено"
                exit 0
            }
            
            # Получить список outdated пакетов
            $outdated = npm outdated --json | ConvertFrom-Json
            foreach ($pkg in $outdated.PSObject.Properties) {
                $name = $pkg.Name
                Write-Info "Обновление $name..."
                npm install "$name@latest"
            }
        }
        default {
            Write-Error "Неизвестный тип: $UpdateType"
            Write-Info "Используйте: patch, minor, или major"
            exit 1
        }
    }
} catch {
    Write-Error "Ошибка при обновлении: $_"
    Write-Warning "Откат изменений..."
    Copy-Item "package.json.backup" "package.json" -Force
    Copy-Item "package-lock.json.backup" "package-lock.json" -Force
    npm install
    Write-Success "Изменения отменены"
    exit 1
}

# 4. Проверка после обновления
Write-Info "Проверка уязвимостей после обновления..."
npm audit --json | Out-File -FilePath "audit-after.json" -Encoding UTF8
$auditAfter = Get-Content "audit-after.json" | ConvertFrom-Json
$vulnsAfter = $auditAfter.metadata.vulnerabilities.total
Write-Info "Уязвимостей после обновления: $vulnsAfter"

# 5. Запуск тестов
Write-Info "Запуск тестов..."
try {
    npm test
    Write-Success "Тесты пройдены"
} catch {
    Write-Error "Тесты провалились!"
    Write-Warning "Откат изменений..."
    Copy-Item "package.json.backup" "package.json" -Force
    Copy-Item "package-lock.json.backup" "package-lock.json" -Force
    npm install
    Write-Success "Изменения отменены"
    exit 1
}

# 6. Проверка TypeScript
Write-Info "Проверка TypeScript..."
try {
    npx tsc --noEmit
    Write-Success "TypeScript проверка пройдена"
} catch {
    Write-Error "TypeScript ошибки!"
    Write-Warning "Откат изменений..."
    Copy-Item "package.json.backup" "package.json" -Force
    Copy-Item "package-lock.json.backup" "package-lock.json" -Force
    npm install
    Write-Success "Изменения отменены"
    exit 1
}

# 7. Итоговая информация
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  ✅ Обновление завершено успешно" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""

Write-Host "📊 Статистика:" -ForegroundColor Cyan
Write-Host "  Уязвимостей до: $vulnsBefore"
Write-Host "  Уязвимостей после: $vulnsAfter"
Write-Host ""

if ($vulnsAfter -lt $vulnsBefore) {
    Write-Success "Уязвимостей стало меньше!"
} elseif ($vulnsAfter -eq $vulnsBefore) {
    Write-Info "Количество уязвимостей не изменилось"
} else {
    Write-Warning "Уязвимостей стало больше!"
}

# 8. Показать обновленные пакеты
Write-Host ""
Write-Info "Обновленные пакеты:"
npm outdated 2>$null

# 9. Очистка
Remove-Item "audit-before.json" -ErrorAction SilentlyContinue
Remove-Item "audit-after.json" -ErrorAction SilentlyContinue
Remove-Item "package.json.backup" -ErrorAction SilentlyContinue
Remove-Item "package-lock.json.backup" -ErrorAction SilentlyContinue

Write-Host ""
Write-Success "Готово!"
Write-Host ""
Write-Info "Следующие шаги:"
Write-Host "  1. Проверьте изменения: git diff package.json"
Write-Host "  2. Запустите приложение: npm run dev"
Write-Host "  3. Запустите E2E тесты: npm run e2e"
Write-Host "  4. Закоммитьте изменения: git commit -am 'chore: update dependencies'"
Write-Host ""
