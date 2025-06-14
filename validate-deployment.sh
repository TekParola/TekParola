#!/bin/bash

# TekParola Deployment Validation Script
# Complete pre-deployment verification

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

print_header() {
    echo -e "${BLUE}🎯 TekParola Deployment Validation${NC}"
    echo "==========================================="
    echo "Comprehensive pre-deployment verification"
    echo
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED_CHECKS++))
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    ((FAILED_CHECKS++))
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

run_check() {
    ((TOTAL_CHECKS++))
    "$@"
}

# File existence checks
check_required_files() {
    echo "📁 Checking Required Files:"
    echo "----------------------------"
    
    local files=(
        "package.json"
        "package-lock.json"
        "tsconfig.json"
        ".env.example"
        "Dockerfile"
        "docker-compose.yml"
        "docker-compose.prod.yml"
        "src/index.ts"
        "src/app.ts"
        "prisma/schema.prisma"
        "README.md"
        "QUICK_START.md"
        ".nvmrc"
        ".dockerignore"
        ".editorconfig"
    )
    
    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            run_check print_success "$file exists"
        else
            run_check print_error "$file missing"
        fi
    done
    echo
}

# Script checks
check_deployment_scripts() {
    echo "🔧 Checking Deployment Scripts:"
    echo "--------------------------------"
    
    local scripts=(
        "deploy.sh"
        "health-check.sh"
        "runtime-check.sh"
        "validate-deployment.sh"
    )
    
    for script in "${scripts[@]}"; do
        if [ -f "$script" ] && [ -x "$script" ]; then
            run_check print_success "$script exists and is executable"
        elif [ -f "$script" ]; then
            run_check print_error "$script exists but is not executable"
        else
            run_check print_error "$script missing"
        fi
    done
    echo
}

# Build check
check_build() {
    echo "🔨 Checking Build Process:"
    echo "---------------------------"
    
    if npm run build > /dev/null 2>&1; then
        run_check print_success "TypeScript build successful"
    else
        run_check print_error "TypeScript build failed"
    fi
    
    if [ -d "dist" ]; then
        run_check print_success "dist directory exists"
    else
        run_check print_error "dist directory missing"
    fi
    
    if [ -f "dist/index.js" ]; then
        run_check print_success "dist/index.js exists"
    else
        run_check print_error "dist/index.js missing"
    fi
    echo
}

# Code quality checks
check_code_quality() {
    echo "📝 Checking Code Quality:"
    echo "-------------------------"
    
    if npm run lint > /dev/null 2>&1; then
        run_check print_success "ESLint checks passed"
    else
        run_check print_error "ESLint checks failed"
    fi
    
    if npm run typecheck > /dev/null 2>&1; then
        run_check print_success "TypeScript type checks passed"
    else
        run_check print_error "TypeScript type checks failed"
    fi
    echo
}

# Security checks
check_security() {
    echo "🔒 Checking Security:"
    echo "---------------------"
    
    # Check for vulnerabilities
    local audit_result=$(npm audit --audit-level=moderate 2>&1)
    if echo "$audit_result" | grep -q "found 0 vulnerabilities"; then
        run_check print_success "No security vulnerabilities found"
    else
        run_check print_error "Security vulnerabilities detected"
    fi
    
    # Check for security middleware
    if grep -q "enforceHTTPS" src/app.ts; then
        run_check print_success "HTTPS enforcement enabled"
    else
        run_check print_error "HTTPS enforcement missing"
    fi
    
    if grep -q "helmet" src/app.ts; then
        run_check print_success "Security headers middleware enabled"
    else
        run_check print_error "Security headers middleware missing"
    fi
    
    if grep -q "csrfProtection" src/app.ts; then
        run_check print_success "CSRF protection enabled"
    else
        run_check print_error "CSRF protection missing"
    fi
    echo
}

# Database checks
check_database() {
    echo "🗄️ Checking Database:"
    echo "----------------------"
    
    if npx prisma validate > /dev/null 2>&1; then
        run_check print_success "Prisma schema is valid"
    else
        run_check print_error "Prisma schema validation failed"
    fi
    
    if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations)" ]; then
        run_check print_success "Database migrations exist"
    else
        run_check print_error "Database migrations missing"
    fi
    
    if [ -f "prisma/seed.ts" ]; then
        run_check print_success "Database seed file exists"
    else
        run_check print_error "Database seed file missing"
    fi
    echo
}

# Docker checks
check_docker() {
    echo "🐳 Checking Docker Configuration:"
    echo "----------------------------------"
    
    if docker --version > /dev/null 2>&1; then
        run_check print_success "Docker is available"
    else
        run_check print_warning "Docker not available (optional)"
    fi
    
    if docker-compose --version > /dev/null 2>&1; then
        run_check print_success "Docker Compose is available"
    else
        run_check print_warning "Docker Compose not available (optional)"
    fi
    
    # Check Dockerfile syntax
    if docker build --dry-run . > /dev/null 2>&1; then
        run_check print_success "Dockerfile syntax is valid"
    else
        run_check print_warning "Dockerfile syntax check failed (Docker required)"
    fi
    echo
}

# Environment checks
check_environment() {
    echo "🌍 Checking Environment:"
    echo "------------------------"
    
    # Node.js version check
    local node_version=$(node -v | cut -d'v' -f2)
    local required_version="18.0.0"
    
    if [ "$(printf '%s\n' "$required_version" "$node_version" | sort -V | head -n1)" = "$required_version" ]; then
        run_check print_success "Node.js version ($node_version) meets requirements"
    else
        run_check print_error "Node.js version ($node_version) below required ($required_version)"
    fi
    
    # Check .env.example
    if [ -f ".env.example" ]; then
        local required_vars=(
            "DATABASE_URL"
            "REDIS_URL"
            "JWT_SECRET"
            "JWT_REFRESH_SECRET"
            "SESSION_SECRET"
        )
        
        local missing_vars=0
        for var in "${required_vars[@]}"; do
            if grep -q "^$var=" .env.example; then
                continue
            else
                ((missing_vars++))
            fi
        done
        
        if [ $missing_vars -eq 0 ]; then
            run_check print_success "All required environment variables in .env.example"
        else
            run_check print_error "$missing_vars required environment variables missing in .env.example"
        fi
    else
        run_check print_error ".env.example file missing"
    fi
    echo
}

# Package checks
check_packages() {
    echo "📦 Checking Package Configuration:"
    echo "----------------------------------"
    
    # Check if node_modules exists and is populated
    if [ -d "node_modules" ] && [ "$(ls -A node_modules)" ]; then
        run_check print_success "Node modules are installed"
    else
        run_check print_error "Node modules not installed - run 'npm install'"
    fi
    
    # Check package.json scripts
    local required_scripts=(
        "start"
        "build"
        "dev"
        "test"
        "lint"
        "db:migrate"
        "db:seed"
    )
    
    local missing_scripts=0
    for script in "${required_scripts[@]}"; do
        if grep -q "\"$script\":" package.json; then
            continue
        else
            ((missing_scripts++))
        fi
    done
    
    if [ $missing_scripts -eq 0 ]; then
        run_check print_success "All required npm scripts are defined"
    else
        run_check print_error "$missing_scripts required npm scripts missing"
    fi
    echo
}

# Documentation checks
check_documentation() {
    echo "📚 Checking Documentation:"
    echo "--------------------------"
    
    local docs=(
        "README.md"
        "QUICK_START.md"
        "CLAUDE.md"
    )
    
    for doc in "${docs[@]}"; do
        if [ -f "$doc" ] && [ -s "$doc" ]; then
            run_check print_success "$doc exists and has content"
        elif [ -f "$doc" ]; then
            run_check print_warning "$doc exists but is empty"
        else
            run_check print_error "$doc missing"
        fi
    done
    echo
}

# Performance checks
check_performance() {
    echo "⚡ Checking Performance Configuration:"
    echo "------------------------------------"
    
    # Check for compression middleware
    if grep -q "compression" src/app.ts; then
        run_check print_success "Compression middleware enabled"
    else
        run_check print_warning "Compression middleware not found"
    fi
    
    # Check for rate limiting
    if grep -q "rateLimiter\|rateLimit" src/app.ts; then
        run_check print_success "Rate limiting enabled"
    else
        run_check print_error "Rate limiting not found"
    fi
    
    # Check for caching
    if grep -q "redis\|cache" src/app.ts; then
        run_check print_success "Caching configuration found"
    else
        run_check print_warning "Caching configuration not found"
    fi
    echo
}

# Summary
print_summary() {
    echo "📊 Validation Summary:"
    echo "====================="
    echo "Total checks: $TOTAL_CHECKS"
    echo "Passed: $PASSED_CHECKS"
    echo "Failed: $FAILED_CHECKS"
    echo
    
    local success_rate=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))
    
    if [ $FAILED_CHECKS -eq 0 ]; then
        print_success "All checks passed! System is deployment ready! 🎉"
        echo
        print_info "✨ TekParola SSO is ready for production deployment"
        print_info "🚀 Run './deploy.sh' to deploy"
        print_info "🐳 Or use 'docker-compose up -d' for Docker deployment"
        return 0
    elif [ $success_rate -ge 90 ]; then
        print_warning "Most checks passed ($success_rate%) - Review failed checks"
        echo
        print_info "System is mostly ready but needs minor fixes"
        return 1
    elif [ $success_rate -ge 70 ]; then
        print_warning "Some critical issues found ($success_rate% passed)"
        echo
        print_info "Address failed checks before deployment"
        return 2
    else
        print_error "Multiple critical issues found ($success_rate% passed)"
        echo
        print_info "System is not ready for deployment"
        return 3
    fi
}

# Main execution
main() {
    print_header
    
    check_required_files
    check_deployment_scripts
    check_build
    check_code_quality
    check_security
    check_database
    check_docker
    check_environment
    check_packages
    check_documentation
    check_performance
    
    print_summary
}

# Run main function
main