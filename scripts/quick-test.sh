#!/bin/bash

# Quick health check and API test script
# Usage: bash quick-test.sh [url]

set -e

# Configuration
URL="${1:-https://septicservice.onrender.com}"
TIMEOUT=10
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0

# Function to log with colors
log_info() {
  echo -e "${BLUE}[${TIMESTAMP}]${NC} $1"
}

log_pass() {
  echo -e "${GREEN}✅ PASS${NC} $1"
  ((PASSED++))
}

log_fail() {
  echo -e "${RED}❌ FAIL${NC} $1"
  ((FAILED++))
}

log_warn() {
  echo -e "${YELLOW}⚠️  WARN${NC} $1"
}

# Function to test endpoint
test_endpoint() {
  local name="$1"
  local method="$2"
  local endpoint="$3"
  local data="$4"
  local headers="$5"
  
  log_info "Testing: $name"
  
  if [ "$method" = "POST" ]; then
    response=$(curl -s -w "\n%{http_code}" -X POST "$URL$endpoint" \
      -H "Content-Type: application/json" \
      $headers \
      -d "$data" 2>/dev/null || echo "")
  else
    response=$(curl -s -w "\n%{http_code}" -X GET "$URL$endpoint" \
      -H "Content-Type: application/json" \
      $headers 2>/dev/null || echo "")
  fi
  
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')
  
  if [[ "$http_code" =~ ^[2] ]]; then
    log_pass "$name (HTTP $http_code)"
    echo "$body" | head -n 1
  else
    log_fail "$name (HTTP $http_code)"
    echo "$body" | head -n 1
  fi
}

# Main test execution
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  SepticService - Quick Health Check${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
log_info "Target: $URL"
log_info "Started at: $TIMESTAMP"
echo ""

# Test 1: Health Check
echo -e "${BLUE}--- Health & Connectivity ---${NC}"
test_endpoint "Health Check" "GET" "/health"

# Test 2: Database Connectivity
test_endpoint "Database Status" "GET" "/api/health/db"

# Test 3: Redis Connectivity
test_endpoint "Redis Status" "GET" "/api/health/redis" "" "" || log_warn "Redis check skipped"

# Test 4: Register Client
echo ""
echo -e "${BLUE}--- Authentication ---${NC}"
CLIENT_EMAIL="test-client-$(date +%s)@example.com"
test_endpoint "Client Registration" "POST" "/api/auth/register" \
  "{\"email\":\"$CLIENT_EMAIL\",\"password\":\"TestPassword123!\",\"phone\":\"+79991234567\",\"role\":\"client\"}"

# Extract token from response (optional)
echo ""
echo -e "${BLUE}--- Summary ---${NC}"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All critical tests passed!${NC}"
  exit 0
else
  echo -e "${RED}❌ Some tests failed!${NC}"
  exit 1
fi
