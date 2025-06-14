#!/bin/bash

# TekParola Runtime Verification Script
# Validates the system is running correctly in production

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
API_BASE="http://localhost:3000"
PROCESS_NAME="node.*index\.js"

print_header() {
    echo -e "${BLUE}🔍 TekParola Runtime Verification${NC}"
    echo "=========================================="
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

check_process() {
    echo -n "Checking if TekParola process is running... "
    
    if pgrep -f "$PROCESS_NAME" > /dev/null 2>&1; then
        local pid=$(pgrep -f "$PROCESS_NAME")
        print_success "Running (PID: $pid)"
        return 0
    else
        print_error "Process not found"
        return 1
    fi
}

check_port() {
    echo -n "Checking if port 3000 is listening... "
    
    if netstat -tuln 2>/dev/null | grep ":3000 " > /dev/null 2>&1 || \
       ss -tuln 2>/dev/null | grep ":3000 " > /dev/null 2>&1; then
        print_success "Port 3000 is listening"
        return 0
    else
        print_error "Port 3000 is not listening"
        return 1
    fi
}

check_api_health() {
    echo -n "Checking API health... "
    
    local response=$(curl -s -w "HTTPSTATUS:%{http_code}" --connect-timeout 5 "$API_BASE/health" 2>/dev/null || echo "HTTPSTATUS:000")
    local status=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    
    if [ "$status" = "200" ]; then
        print_success "API is healthy"
        return 0
    else
        print_error "API health check failed (HTTP $status)"
        return 1
    fi
}

check_database() {
    echo -n "Checking database connectivity... "
    
    local response=$(curl -s -w "HTTPSTATUS:%{http_code}" --connect-timeout 5 "$API_BASE/health/database" 2>/dev/null || echo "HTTPSTATUS:000")
    local status=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    
    if [ "$status" = "200" ]; then
        print_success "Database is connected"
        return 0
    else
        print_error "Database connection failed (HTTP $status)"
        return 1
    fi
}

check_redis() {
    echo -n "Checking Redis connectivity... "
    
    local response=$(curl -s -w "HTTPSTATUS:%{http_code}" --connect-timeout 5 "$API_BASE/health/redis" 2>/dev/null || echo "HTTPSTATUS:000")
    local status=$(echo "$response" | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
    
    if [ "$status" = "200" ]; then
        print_success "Redis is connected"
        return 0
    else
        print_error "Redis connection failed (HTTP $status)"
        return 1
    fi
}

check_memory_usage() {
    echo -n "Checking memory usage... "
    
    local pid=$(pgrep -f "$PROCESS_NAME" | head -1)
    if [ -n "$pid" ]; then
        local memory_kb=$(ps -p "$pid" -o rss= 2>/dev/null || echo "0")
        local memory_mb=$((memory_kb / 1024))
        
        if [ "$memory_mb" -lt 500 ]; then
            print_success "Memory usage: ${memory_mb}MB (Good)"
        elif [ "$memory_mb" -lt 1000 ]; then
            print_warning "Memory usage: ${memory_mb}MB (Moderate)"
        else
            print_error "Memory usage: ${memory_mb}MB (High)"
        fi
    else
        print_error "Cannot check memory - process not found"
        return 1
    fi
}

check_log_errors() {
    echo -n "Checking for recent errors in logs... "
    
    local log_file="./logs/app.log"
    local error_count=0
    
    if [ -f "$log_file" ]; then
        # Check for errors in the last 100 lines
        error_count=$(tail -100 "$log_file" 2>/dev/null | grep -i "error\|exception\|fatal" | wc -l)
        
        if [ "$error_count" -eq 0 ]; then
            print_success "No recent errors found"
        elif [ "$error_count" -lt 5 ]; then
            print_warning "$error_count recent errors found"
        else
            print_error "$error_count recent errors found"
        fi
    else
        print_warning "Log file not found"
    fi
}

check_disk_space() {
    echo -n "Checking disk space... "
    
    local usage=$(df . | tail -1 | awk '{print $5}' | sed 's/%//')
    
    if [ "$usage" -lt 80 ]; then
        print_success "Disk usage: ${usage}% (Good)"
    elif [ "$usage" -lt 90 ]; then
        print_warning "Disk usage: ${usage}% (Moderate)"
    else
        print_error "Disk usage: ${usage}% (Critical)"
    fi
}

check_environment() {
    echo -n "Checking environment configuration... "
    
    if [ "$NODE_ENV" = "production" ]; then
        print_success "NODE_ENV is set to production"
    elif [ -z "$NODE_ENV" ]; then
        print_warning "NODE_ENV is not set"
    else
        print_warning "NODE_ENV is set to: $NODE_ENV"
    fi
}

main() {
    print_header
    echo
    
    local failed_checks=0
    
    # Run all checks
    check_process || ((failed_checks++))
    check_port || ((failed_checks++))
    check_api_health || ((failed_checks++))
    check_database || ((failed_checks++))
    check_redis || ((failed_checks++))
    check_memory_usage || ((failed_checks++))
    check_log_errors
    check_disk_space
    check_environment
    
    echo
    echo "Runtime Check Summary:"
    echo "====================="
    
    if [ $failed_checks -eq 0 ]; then
        print_success "All critical checks passed! System is running correctly. 🎉"
        echo
        print_info "System Status: HEALTHY"
        print_info "Application URL: $API_BASE"
        print_info "Admin Panel: $API_BASE/admin"
        print_info "API Docs: $API_BASE/api/docs"
        
        exit 0
    elif [ $failed_checks -le 2 ]; then
        print_warning "Some checks failed but system is partially functional"
        echo "Failed checks: $failed_checks"
        exit 1
    else
        print_error "Multiple critical checks failed - system needs attention"
        echo "Failed checks: $failed_checks"
        
        echo
        print_info "Troubleshooting:"
        print_info "1. Check if TekParola is running: npm start"
        print_info "2. Check logs: tail -f logs/app.log"
        print_info "3. Verify environment: cat .env"
        print_info "4. Run health check: ./health-check.sh"
        
        exit 1
    fi
}

# Run main function
main