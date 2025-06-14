#!/bin/bash

# TekParola Health Check Script
# Comprehensive system validation

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
API_BASE="http://localhost:3000"
TIMEOUT=10

print_header() {
    echo -e "${BLUE}🏥 TekParola SSO System Health Check${NC}"
    echo "================================================"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Test function
test_endpoint() {
    local url="$1"
    local description="$2"
    local expected_status="${3:-200}"
    
    echo -n "Testing $description... "
    
    local response=$(curl -s -w "HTTPSTATUS:%{http_code}" --connect-timeout $TIMEOUT "$url" 2>/dev/null || echo "HTTPSTATUS:000")
    local status=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    
    if [ "$status" = "$expected_status" ]; then
        print_success "OK ($status)"
        return 0
    else
        print_error "Failed ($status)"
        return 1
    fi
}

# Test POST endpoint
test_post_endpoint() {
    local url="$1"
    local description="$2"
    local data="$3"
    local expected_status="${4:-400}"
    
    echo -n "Testing $description... "
    
    local response=$(curl -s -w "HTTPSTATUS:%{http_code}" --connect-timeout $TIMEOUT \
        -X POST \
        -H "Content-Type: application/json" \
        -d "$data" \
        "$url" 2>/dev/null || echo "HTTPSTATUS:000")
    
    local status=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    
    if [ "$status" = "$expected_status" ]; then
        print_success "OK ($status)"
        return 0
    else
        print_error "Failed ($status)"
        return 1
    fi
}

print_header

# Check if application is running
echo "Checking application status..."
if ! curl -s --connect-timeout 5 "$API_BASE/health" > /dev/null 2>&1; then
    print_error "Application is not responding at $API_BASE"
    print_info "Make sure TekParola is running: npm start"
    exit 1
fi

print_success "Application is running"
echo

# Core Health Checks
echo "Core Health Checks:"
echo "-------------------"

test_endpoint "$API_BASE/health" "Basic health endpoint"
test_endpoint "$API_BASE/health/database" "Database health" "200"
test_endpoint "$API_BASE/health/redis" "Redis health" "200"

echo

# API Endpoint Tests
echo "API Endpoint Tests:"
echo "-------------------"

# Authentication endpoints
test_endpoint "$API_BASE/api/v1/auth/csrf-token" "CSRF token endpoint"
test_post_endpoint "$API_BASE/api/v1/auth/check-email" "Email check endpoint" '{"email":"test@example.com"}'

# Public endpoints
test_endpoint "$API_BASE/api/docs" "API documentation"
test_endpoint "$API_BASE/api/v1/settings/public" "Public settings"

# Admin endpoints (should require auth)
test_endpoint "$API_BASE/admin" "Admin dashboard" "302"

echo

# SSO Endpoints
echo "SSO Integration Tests:"
echo "----------------------"

test_endpoint "$API_BASE/sso/.well-known/openid_configuration" "SSO metadata"
test_endpoint "$API_BASE/sso/jwks" "JWKS endpoint"

echo

# External API Tests
echo "External API Tests:"
echo "-------------------"

test_endpoint "$API_BASE/api/external/health" "External API health" "401"

echo

# Performance Test
echo "Performance Test:"
echo "-----------------"

echo -n "Response time test... "
start_time=$(date +%s%N)
curl -s "$API_BASE/health" > /dev/null 2>&1
end_time=$(date +%s%N)
duration=$((($end_time - $start_time) / 1000000))

if [ $duration -lt 500 ]; then
    print_success "OK (${duration}ms)"
elif [ $duration -lt 1000 ]; then
    print_warning "Slow (${duration}ms)"
else
    print_error "Too slow (${duration}ms)"
fi

echo

# Final Status
echo "Health Check Summary:"
echo "======================"

# Count successful tests
success_count=0
total_tests=10

# Re-run critical tests and count
curl -s --connect-timeout 5 "$API_BASE/health" > /dev/null 2>&1 && ((success_count++))
curl -s --connect-timeout 5 "$API_BASE/health/database" > /dev/null 2>&1 && ((success_count++))
curl -s --connect-timeout 5 "$API_BASE/health/redis" > /dev/null 2>&1 && ((success_count++))
curl -s --connect-timeout 5 "$API_BASE/api/v1/auth/csrf-token" > /dev/null 2>&1 && ((success_count++))
curl -s --connect-timeout 5 "$API_BASE/api/docs" > /dev/null 2>&1 && ((success_count++))
curl -s --connect-timeout 5 "$API_BASE/api/v1/settings/public" > /dev/null 2>&1 && ((success_count++))
curl -s --connect-timeout 5 "$API_BASE/sso/.well-known/openid_configuration" > /dev/null 2>&1 && ((success_count++))
curl -s --connect-timeout 5 "$API_BASE/sso/jwks" > /dev/null 2>&1 && ((success_count++))

percentage=$((success_count * 100 / total_tests))

echo "Tests passed: $success_count/$total_tests ($percentage%)"

if [ $percentage -ge 90 ]; then
    print_success "System is healthy and ready for production! 🎉"
    exit 0
elif [ $percentage -ge 70 ]; then
    print_warning "System is mostly healthy but needs attention"
    exit 1
else
    print_error "System has critical issues and is not ready for production"
    exit 1
fi