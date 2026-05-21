# Quick health check and API test script for Windows PowerShell
# Usage: .\quick-test.ps1 -Url "https://septicservice.onrender.com"

param(
    [string]$Url = "https://septicservice.onrender.com"
)

$ErrorActionPreference = "Continue"

# Configuration
$timeout = 10
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Counters
$passed = 0
$failed = 0

# Function to log with colors
function Write-Info {
    param([string]$message)
    Write-Host "[$timestamp] $message" -ForegroundColor Cyan
}

function Write-Pass {
    param([string]$message)
    Write-Host "✅ PASS $message" -ForegroundColor Green
    $script:passed++
}

function Write-Fail {
    param([string]$message)
    Write-Host "❌ FAIL $message" -ForegroundColor Red
    $script:failed++
}

function Write-Warn {
    param([string]$message)
    Write-Host "⚠️  WARN $message" -ForegroundColor Yellow
}

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method = "GET",
        [string]$Endpoint = "/health",
        [string]$Body = $null,
        [hashtable]$Headers = @{}
    )
    
    Write-Info "Testing: $Name"
    
    try {
        $uri = $Url.TrimEnd('/') + $Endpoint
        $params = @{
            Uri     = $uri
            Method  = $Method
            Headers = @{ "Content-Type" = "application/json" } + $Headers
            TimeoutSec = $timeout
        }
        
        if ($Body) {
            $params.Body = $Body
        }
        
        $response = Invoke-WebRequest @params
        $statusCode = $response.StatusCode
        
        if ($statusCode -ge 200 -and $statusCode -lt 300) {
            Write-Pass "$Name (HTTP $statusCode)"
            $response.Content | ConvertFrom-Json | ConvertTo-Json -Compress | Select-Object -First 1
            return $response
        } else {
            Write-Fail "$Name (HTTP $statusCode)"
            return $null
        }
    }
    catch [System.Net.Http.HttpRequestException] {
        Write-Fail "$Name - Connection error: $($_.Exception.Message)"
        return $null
    }
    catch {
        Write-Fail "$Name - $($_.Exception.Message)"
        return $null
    }
}

# Main execution
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SepticService - Quick Health Check" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Info "Target: $Url"
Write-Info "Started at: $timestamp"
Write-Host ""

# Test 1: Health Check
Write-Host "--- Health & Connectivity ---" -ForegroundColor Cyan
Test-Endpoint -Name "Health Check" -Endpoint "/health"

# Test 2: Database Connectivity
Test-Endpoint -Name "Database Status" -Endpoint "/api/health/db"

# Test 3: Redis Connectivity
try {
    Test-Endpoint -Name "Redis Status" -Endpoint "/api/health/redis"
}
catch {
    Write-Warn "Redis check skipped"
}

# Test 4: Register Client
Write-Host ""
Write-Host "--- Authentication ---" -ForegroundColor Cyan
$clientEmail = "test-client-$(Get-Date -UFormat %s)@example.com"
$registerBody = @{
    email    = $clientEmail
    password = "TestPassword123!"
    phone    = "+79991234567"
    role     = "client"
} | ConvertTo-Json

$registerResponse = Test-Endpoint -Name "Client Registration" -Method "POST" `
    -Endpoint "/api/auth/register" -Body $registerBody

if ($registerResponse) {
    $token = ($registerResponse.Content | ConvertFrom-Json).token
    if ($token) {
        Write-Info "  └─ Token obtained successfully"
    }
}

# Test 5: Get Orders (with auth)
if ($token) {
    Test-Endpoint -Name "Fetch Orders" -Endpoint "/api/orders" `
        -Headers @{ Authorization = "Bearer $token" }
}

# Summary
Write-Host ""
Write-Host "--- Summary ---" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })

Write-Host ""
if ($failed -eq 0) {
    Write-Host "✅ All critical tests passed!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "❌ Some tests failed!" -ForegroundColor Red
    exit 1
}
