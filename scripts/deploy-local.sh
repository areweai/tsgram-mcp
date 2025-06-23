#!/bin/bash

# Local deployment script for Apple Silicon Mac
# Builds and runs the signal-aichat bot in development mode

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.local.yml"
ENV_FILE=".env"

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

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available"
        exit 1
    fi
    
    # Check if running on Apple Silicon
    if [[ $(uname -m) == "arm64" ]]; then
        log_success "Running on Apple Silicon (ARM64)"
    else
        log_warning "Not running on Apple Silicon, but proceeding anyway"
    fi
    
    # Check environment file
    if [ ! -f "$ENV_FILE" ]; then
        log_warning "Environment file $ENV_FILE not found"
        log_info "Creating example environment file..."
        cp .env.example .env 2>/dev/null || log_warning "No .env.example found"
    fi
    
    log_success "Prerequisites check completed"
}

# Setup directories
setup_directories() {
    log_info "Setting up required directories..."
    
    mkdir -p config/signal
    mkdir -p logs
    mkdir -p nginx
    
    # Create nginx config if it doesn't exist
    if [ ! -f nginx/nginx.conf ]; then
        log_info "Creating basic nginx configuration..."
        cat > nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream signal_bot {
        server signal-bot-local:8081;
    }
    
    server {
        listen 80;
        server_name localhost;
        
        location / {
            proxy_pass http://signal_bot;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        
        location /health {
            proxy_pass http://signal_bot/health;
        }
    }
}
EOF
    fi
    
    log_success "Directories setup completed"
}

# Build and start services
deploy() {
    log_info "Starting local deployment..."
    
    # Pull latest images
    log_info "Pulling latest images..."
    docker compose -f "$COMPOSE_FILE" pull
    
    # Build custom images
    log_info "Building custom images..."
    docker compose -f "$COMPOSE_FILE" build --no-cache
    
    # Start services
    log_info "Starting services..."
    docker compose -f "$COMPOSE_FILE" up -d
    
    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker compose -f "$COMPOSE_FILE" ps --format json | jq -e '.[] | select(.Health == "healthy" or .Health == null)' > /dev/null 2>&1; then
            log_success "All services are healthy"
            break
        fi
        
        ((attempt++))
        if [ $attempt -eq $max_attempts ]; then
            log_error "Services failed to become healthy within timeout"
            docker compose -f "$COMPOSE_FILE" ps
            exit 1
        fi
        
        log_info "Waiting for services... attempt $attempt/$max_attempts"
        sleep 2
    done
    
    log_success "Local deployment completed successfully! 🎉"
}

# Show status
show_status() {
    log_info "=== Service Status ==="
    docker compose -f "$COMPOSE_FILE" ps
    
    echo ""
    log_info "=== Available Endpoints ==="
    echo "🤖 Bot REST API:     http://localhost:8081"
    echo "📱 Signal CLI API:   http://localhost:8080"
    echo "🔌 MCP Server:       http://localhost:3000"
    echo "🔴 Redis:            localhost:6379"
    echo "🐛 Node.js Debugger: localhost:9229"
    echo ""
    echo "Health checks:"
    echo "- Bot Health:        curl http://localhost:8081/health"
    echo "- Signal CLI Health: curl http://localhost:8080/v1/health"
    echo "- Models API:        curl http://localhost:8081/api/models"
    
    echo ""
    log_info "=== Useful Commands ==="
    echo "View logs:           docker compose -f $COMPOSE_FILE logs -f [service_name]"
    echo "Stop services:       docker compose -f $COMPOSE_FILE down"
    echo "Restart service:     docker compose -f $COMPOSE_FILE restart [service_name]"
    echo "Shell into bot:      docker compose -f $COMPOSE_FILE exec signal-bot-local bash"
    echo "Test network:        ./scripts/test-network.sh local"
}

# Stop services
stop() {
    log_info "Stopping local services..."
    docker compose -f "$COMPOSE_FILE" down
    log_success "Services stopped"
}

# Clean up
clean() {
    log_warning "This will remove all containers, images, and volumes!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cleaning up..."
        docker compose -f "$COMPOSE_FILE" down -v --rmi all
        docker system prune -f
        log_success "Cleanup completed"
    else
        log_info "Cleanup cancelled"
    fi
}

# Show logs
logs() {
    local service=${1:-""}
    if [ -n "$service" ]; then
        docker compose -f "$COMPOSE_FILE" logs -f "$service"
    else
        docker compose -f "$COMPOSE_FILE" logs -f
    fi
}

# Main execution
main() {
    local command=${1:-"deploy"}
    
    case $command in
        "deploy"|"start"|"up")
            check_prerequisites
            setup_directories
            deploy
            show_status
            ;;
        "stop"|"down")
            stop
            ;;
        "status"|"ps")
            show_status
            ;;
        "logs")
            logs "$2"
            ;;
        "clean"|"cleanup")
            clean
            ;;
        "test")
            ./scripts/test-network.sh local
            ;;
        "help"|"-h"|"--help")
            echo "Local deployment script for signal-aichat on Apple Silicon"
            echo ""
            echo "Usage: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  deploy|start|up    Deploy and start all services (default)"
            echo "  stop|down          Stop all services"
            echo "  status|ps          Show service status"
            echo "  logs [service]     Show logs (optionally for specific service)"
            echo "  test               Run network connectivity tests"
            echo "  clean|cleanup      Remove all containers, images, and volumes"
            echo "  help               Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 deploy          # Start all services"
            echo "  $0 logs signal-bot-local  # Show bot logs"
            echo "  $0 test            # Test network connectivity"
            ;;
        *)
            log_error "Unknown command: $command"
            echo "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function with arguments
main "$@"