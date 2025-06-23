#!/bin/bash

# Docker setup verification script
# Tests Docker installation and validates our configurations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Test Docker installation
test_docker_installation() {
    log_info "=== Testing Docker Installation ==="
    
    # Check if Docker is installed
    if command -v docker &> /dev/null; then
        local docker_version=$(docker --version)
        log_success "Docker is installed: $docker_version"
    else
        log_error "Docker is not installed"
        return 1
    fi
    
    # Check if Docker daemon is running
    if docker info > /dev/null 2>&1; then
        log_success "Docker daemon is running"
    else
        log_warning "Docker daemon is not running"
        log_info "Please start Docker Desktop or run: sudo systemctl start docker"
        return 1
    fi
    
    # Check Docker Compose
    if docker compose version &> /dev/null; then
        local compose_version=$(docker compose version)
        log_success "Docker Compose is available: $compose_version"
    else
        log_error "Docker Compose is not available"
        return 1
    fi
    
    return 0
}

# Test platform architecture
test_platform() {
    log_info "=== Testing Platform Architecture ==="
    
    local arch=$(uname -m)
    local os=$(uname -s)
    
    log_info "Operating System: $os"
    log_info "Architecture: $arch"
    
    case $arch in
        "arm64")
            log_success "Apple Silicon (ARM64) detected - using local configuration"
            echo "LOCAL_PLATFORM=linux/arm64"
            ;;
        "x86_64")
            log_success "x86_64 detected - can use either local or remote configuration"
            echo "REMOTE_PLATFORM=linux/amd64"
            ;;
        *)
            log_warning "Unknown architecture: $arch"
            ;;
    esac
}

# Validate Docker Compose files
validate_compose_files() {
    log_info "=== Validating Docker Compose Files ==="
    
    local files=("docker-compose.local.yml" "docker-compose.remote.yml")
    
    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            log_info "Validating $file..."
            
            if docker compose -f "$file" config > /dev/null 2>&1; then
                log_success "$file is valid"
            else
                log_error "$file has configuration errors"
                docker compose -f "$file" config
                return 1
            fi
        else
            log_error "$file not found"
            return 1
        fi
    done
    
    return 0
}

# Test environment configuration
test_environment() {
    log_info "=== Testing Environment Configuration ==="
    
    if [ -f ".env" ]; then
        log_success ".env file exists"
        
        # Check for required variables
        local required_vars=("OPENAI_API_KEY" "OPENROUTER_API_KEY" "DEFAULT_MODEL")
        local missing_vars=()
        
        for var in "${required_vars[@]}"; do
            if grep -q "^$var=" .env; then
                local value=$(grep "^$var=" .env | cut -d'=' -f2)
                if [ -n "$value" ] && [ "$value" != "your_key_here" ]; then
                    log_success "$var is configured"
                else
                    missing_vars+=("$var")
                fi
            else
                missing_vars+=("$var")
            fi
        done
        
        if [ ${#missing_vars[@]} -gt 0 ]; then
            log_warning "Missing or empty environment variables:"
            for var in "${missing_vars[@]}"; do
                echo "  - $var"
            done
        fi
    else
        log_warning ".env file not found"
        if [ -f ".env.example" ]; then
            log_info "Creating .env from .env.example..."
            cp .env.example .env
            log_warning "Please edit .env with your API keys"
        fi
    fi
}

# Test Docker images availability
test_docker_images() {
    log_info "=== Testing Docker Images ==="
    
    # Check if base images are available
    local images=(
        "node:22-alpine"
        "bbernhard/signal-cli-rest-api:latest"
        "nginx:alpine"
        "redis:7-alpine"
    )
    
    for image in "${images[@]}"; do
        log_info "Checking image: $image"
        
        if docker image inspect "$image" > /dev/null 2>&1; then
            log_success "$image is available locally"
        else
            log_info "Pulling $image..."
            if docker pull "$image" > /dev/null 2>&1; then
                log_success "$image pulled successfully"
            else
                log_error "Failed to pull $image"
                return 1
            fi
        fi
    done
    
    return 0
}

# Test Java version in Docker
test_java_in_docker() {
    log_info "=== Testing Java Version in Docker ==="
    
    log_info "Testing Java 21+ availability in Alpine..."
    
    if docker run --rm node:22-alpine sh -c "apk add --no-cache openjdk21-jre > /dev/null 2>&1 && java -version" 2>&1 | grep -q "21\."; then
        log_success "Java 21+ is available in Alpine"
    else
        log_error "Java 21+ test failed"
        return 1
    fi
    
    return 0
}

# Create test summary
create_test_summary() {
    local total_tests=$1
    local passed_tests=$2
    
    log_info "=== Test Summary ==="
    
    if [ $passed_tests -eq $total_tests ]; then
        log_success "All tests passed! 🎉"
        echo ""
        echo "✅ Docker is properly installed and configured"
        echo "✅ Platform architecture detected"
        echo "✅ Docker Compose files are valid"
        echo "✅ Base images are available"
        echo "✅ Java 21+ is available"
        echo ""
        echo "Ready to deploy:"
        echo "  Local (Apple Silicon):  ./scripts/deploy-local.sh"
        echo "  Remote (Linux):         ./scripts/deploy-remote.sh"
    else
        log_error "$((total_tests - passed_tests)) out of $total_tests tests failed"
        echo ""
        echo "❌ Some components need attention"
        echo "❌ Please resolve the issues above before deploying"
        echo ""
        echo "Common fixes:"
        echo "1. Start Docker Desktop (macOS) or Docker daemon (Linux)"
        echo "2. Configure API keys in .env file"
        echo "3. Check internet connectivity for image pulls"
    fi
    
    echo ""
}

# Main execution
main() {
    log_info "Starting Docker setup verification..."
    echo ""
    
    local total_tests=6
    local passed_tests=0
    
    # Run tests
    test_docker_installation && ((passed_tests++))
    test_platform && ((passed_tests++))
    validate_compose_files && ((passed_tests++))
    test_environment && ((passed_tests++))
    test_docker_images && ((passed_tests++))
    test_java_in_docker && ((passed_tests++))
    
    # Create summary
    create_test_summary $total_tests $passed_tests
    
    # Exit with appropriate code
    if [ $passed_tests -eq $total_tests ]; then
        exit 0
    else
        exit 1
    fi
}

# Run main function
main "$@"