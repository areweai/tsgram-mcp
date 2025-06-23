#!/bin/bash

# Network connectivity test script for signal-aichat Docker containers
# Tests all services, ports, and inter-container communication

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TIMEOUT=30
LOCAL_COMPOSE="docker-compose.local.yml"
REMOTE_COMPOSE="docker-compose.remote.yml"

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

# Test HTTP endpoint
test_http_endpoint() {
    local url=$1
    local description=$2
    local timeout=${3:-10}
    
    log_info "Testing $description: $url"
    
    if curl -f -s --max-time $timeout "$url" > /dev/null 2>&1; then
        log_success "$description is accessible"
        return 0
    else
        log_error "$description is not accessible"
        return 1
    fi
}

# Test TCP port
test_tcp_port() {
    local host=$1
    local port=$2
    local description=$3
    local timeout=${4:-5}
    
    log_info "Testing $description: $host:$port"
    
    if timeout $timeout bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null; then
        log_success "$description port is open"
        return 0
    else
        log_error "$description port is not accessible"
        return 1
    fi
}

# Test container health
test_container_health() {
    local container_name=$1
    local description=$2
    
    log_info "Testing $description container health"
    
    if docker ps --filter "name=$container_name" --filter "status=running" --format "table {{.Names}}" | grep -q "$container_name"; then
        local health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container_name" 2>/dev/null || echo "none")
        
        if [ "$health_status" = "healthy" ] || [ "$health_status" = "none" ]; then
            log_success "$description container is healthy"
            return 0
        else
            log_warning "$description container health status: $health_status"
            return 1
        fi
    else
        log_error "$description container is not running"
        return 1
    fi
}

# Test inter-container communication
test_inter_container_comm() {
    local from_container=$1
    local to_container=$2
    local port=$3
    local description=$4
    
    log_info "Testing inter-container communication: $from_container -> $to_container:$port"
    
    if docker exec "$from_container" curl -f -s --max-time 10 "http://$to_container:$port/health" > /dev/null 2>&1; then
        log_success "$description inter-container communication works"
        return 0
    else
        log_error "$description inter-container communication failed"
        # Try to get more info
        docker exec "$from_container" nslookup "$to_container" 2>/dev/null || log_warning "DNS resolution failed for $to_container"
        return 1
    fi
}

# Test local configuration
test_local_setup() {
    log_info "=== Testing Local Apple Silicon Configuration ==="
    
    local failures=0
    
    # Check if containers are running
    test_container_health "signal-cli-local" "Signal CLI Local" || ((failures++))
    test_container_health "signal-bot-local" "Signal Bot Local" || ((failures++))
    test_container_health "redis-local" "Redis Local" || ((failures++))
    
    # Test external ports
    test_tcp_port "localhost" "8080" "Signal CLI REST API" || ((failures++))
    test_tcp_port "localhost" "3000" "MCP Server" || ((failures++))
    test_tcp_port "localhost" "8081" "Bot REST API" || ((failures++))
    test_tcp_port "localhost" "6379" "Redis" || ((failures++))
    test_tcp_port "localhost" "9229" "Node.js Debugger" || ((failures++))
    
    # Test HTTP endpoints
    test_http_endpoint "http://localhost:8080/v1/health" "Signal CLI Health" || ((failures++))
    test_http_endpoint "http://localhost:8081/health" "Bot Health" || ((failures++))
    
    # Test inter-container communication
    test_inter_container_comm "signal-bot-local" "signal-cli-local" "8080" "Bot -> Signal CLI" || ((failures++))
    test_inter_container_comm "signal-bot-local" "redis-local" "6379" "Bot -> Redis" || ((failures++))
    
    # Test API endpoints
    log_info "Testing API endpoints..."
    curl -X GET "http://localhost:8081/api/models" -H "Content-Type: application/json" > /tmp/models_response.json 2>/dev/null || ((failures++))
    
    if [ -f /tmp/models_response.json ]; then
        if jq -e '.models' /tmp/models_response.json > /dev/null 2>&1; then
            log_success "Models API returns valid JSON"
        else
            log_error "Models API returns invalid JSON"
            ((failures++))
        fi
    fi
    
    return $failures
}

# Test remote configuration
test_remote_setup() {
    log_info "=== Testing Remote Linux Configuration ==="
    
    local failures=0
    
    # Check if containers are running
    test_container_health "signal-cli-remote" "Signal CLI Remote" || ((failures++))
    test_container_health "signal-bot-remote" "Signal Bot Remote" || ((failures++))
    test_container_health "nginx-remote" "Nginx Remote" || ((failures++))
    
    # Test external ports
    test_tcp_port "localhost" "8080" "Signal CLI REST API" || ((failures++))
    test_tcp_port "localhost" "3000" "MCP Server" || ((failures++))
    test_tcp_port "localhost" "8081" "Bot REST API" || ((failures++))
    test_tcp_port "localhost" "80" "Nginx HTTP" || ((failures++))
    test_tcp_port "localhost" "443" "Nginx HTTPS" || ((failures++))
    
    # Test HTTP endpoints
    test_http_endpoint "http://localhost:8080/v1/health" "Signal CLI Health" || ((failures++))
    test_http_endpoint "http://localhost:8081/health" "Bot Health" || ((failures++))
    
    # Test inter-container communication
    test_inter_container_comm "signal-bot-remote" "signal-cli-remote" "8080" "Bot -> Signal CLI" || ((failures++))
    
    return $failures
}

# Test AI model connectivity
test_ai_models() {
    log_info "=== Testing AI Model Connectivity ==="
    
    local failures=0
    
    # Test OpenAI API
    if [ -n "$OPENAI_API_KEY" ]; then
        log_info "Testing OpenAI API connectivity..."
        if curl -f -s -X POST "https://api.openai.com/v1/models" \
            -H "Authorization: Bearer $OPENAI_API_KEY" \
            --max-time 10 > /dev/null 2>&1; then
            log_success "OpenAI API is accessible"
        else
            log_error "OpenAI API is not accessible"
            ((failures++))
        fi
    else
        log_warning "OPENAI_API_KEY not set, skipping OpenAI test"
    fi
    
    # Test OpenRouter API
    if [ -n "$OPENROUTER_API_KEY" ]; then
        log_info "Testing OpenRouter API connectivity..."
        if curl -f -s -X GET "https://openrouter.ai/api/v1/models" \
            -H "Authorization: Bearer $OPENROUTER_API_KEY" \
            --max-time 10 > /dev/null 2>&1; then
            log_success "OpenRouter API is accessible"
        else
            log_error "OpenRouter API is not accessible"
            ((failures++))
        fi
    else
        log_warning "OPENROUTER_API_KEY not set, skipping OpenRouter test"
    fi
    
    return $failures
}

# Test Docker network configuration
test_docker_networks() {
    log_info "=== Testing Docker Network Configuration ==="
    
    local failures=0
    
    # Check if networks exist
    if docker network ls | grep -q "signal-network-local"; then
        log_success "Local Docker network exists"
    else
        log_error "Local Docker network does not exist"
        ((failures++))
    fi
    
    if docker network ls | grep -q "signal-network"; then
        log_success "Remote Docker network exists"
    else
        log_error "Remote Docker network does not exist"
        ((failures++))
    fi
    
    # Test network connectivity within local network
    if docker network inspect signal-network-local > /dev/null 2>&1; then
        local network_info=$(docker network inspect signal-network-local)
        local subnet=$(echo "$network_info" | jq -r '.[0].IPAM.Config[0].Subnet' 2>/dev/null || echo "unknown")
        log_info "Local network subnet: $subnet"
    fi
    
    return $failures
}

# Generate network test report
generate_report() {
    local total_failures=$1
    local config_type=$2
    
    echo ""
    log_info "=== Network Test Report for $config_type ==="
    
    if [ $total_failures -eq 0 ]; then
        log_success "All network tests passed! 🎉"
        echo "✅ All services are accessible"
        echo "✅ Inter-container communication works"
        echo "✅ Health checks are passing"
        echo "✅ API endpoints are responsive"
    else
        log_error "Network tests failed with $total_failures issues"
        echo "❌ Some services may not be accessible"
        echo "❌ Check container logs for more details"
        echo ""
        echo "Troubleshooting tips:"
        echo "1. Check if all containers are running: docker ps"
        echo "2. Check container logs: docker logs <container_name>"
        echo "3. Check network connectivity: docker network ls"
        echo "4. Restart services: docker-compose down && docker-compose up"
    fi
    
    echo ""
}

# Main execution
main() {
    local config_type=${1:-"local"}
    local total_failures=0
    
    log_info "Starting network connectivity tests for $config_type configuration..."
    
    # Load environment variables
    if [ -f .env ]; then
        export $(grep -v '^#' .env | xargs)
    fi
    
    # Test Docker networks first
    test_docker_networks
    ((total_failures += $?))
    
    # Test based on configuration type
    case $config_type in
        "local")
            test_local_setup
            ((total_failures += $?))
            ;;
        "remote")
            test_remote_setup
            ((total_failures += $?))
            ;;
        "both")
            test_local_setup
            ((total_failures += $?))
            test_remote_setup
            ((total_failures += $?))
            ;;
        *)
            log_error "Invalid configuration type: $config_type"
            echo "Usage: $0 [local|remote|both]"
            exit 1
            ;;
    esac
    
    # Test AI model connectivity
    test_ai_models
    ((total_failures += $?))
    
    # Generate report
    generate_report $total_failures $config_type
    
    # Exit with appropriate code
    exit $total_failures
}

# Run main function with arguments
main "$@"