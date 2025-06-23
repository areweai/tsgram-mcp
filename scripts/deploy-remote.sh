#!/bin/bash

# Remote deployment script for Linux servers
# Builds and runs the signal-aichat bot in production mode

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.remote.yml"
ENV_FILE=".env"
BACKUP_DIR="/opt/signal-aichat/backups"

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
    log_info "Checking prerequisites for remote deployment..."
    
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
    
    # Check architecture
    if [[ $(uname -m) == "x86_64" ]]; then
        log_success "Running on x86_64 architecture"
    else
        log_warning "Not running on x86_64, but proceeding anyway"
    fi
    
    # Check if running as root or with sudo
    if [[ $EUID -ne 0 ]] && ! groups | grep -q docker; then
        log_error "This script must be run as root or user must be in docker group"
        exit 1
    fi
    
    # Check environment file
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Environment file $ENV_FILE not found"
        log_info "Please create $ENV_FILE with required variables"
        exit 1
    fi
    
    # Check required environment variables
    source "$ENV_FILE"
    local required_vars=("OPENAI_API_KEY" "OPENROUTER_API_KEY" "SIGNAL_PHONE_NUMBER")
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log_error "Required environment variable $var is not set"
            exit 1
        fi
    done
    
    log_success "Prerequisites check completed"
}

# Setup production directories
setup_production_directories() {
    log_info "Setting up production directories..."
    
    # Create main directories
    sudo mkdir -p /opt/signal-aichat/{data,logs,config,backups}
    sudo mkdir -p /etc/nginx/sites-available
    sudo mkdir -p /etc/nginx/ssl
    
    # Set permissions
    sudo chown -R $USER:$USER /opt/signal-aichat
    chmod 755 /opt/signal-aichat
    
    # Create nginx configuration
    create_nginx_config
    
    # Create systemd service
    create_systemd_service
    
    log_success "Production directories setup completed"
}

# Create nginx configuration
create_nginx_config() {
    log_info "Creating nginx configuration..."
    
    cat > nginx/nginx.conf << 'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                   '$status $body_bytes_sent "$http_referer" '
                   '"$http_user_agent" "$http_x_forwarded_for"';
    
    access_log /var/log/nginx/access.log main;
    
    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    
    # Security
    server_tokens off;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    
    # Upstream
    upstream signal_bot {
        server signal-bot-remote:8081;
        keepalive 32;
    }
    
    # HTTP server (redirect to HTTPS)
    server {
        listen 80;
        server_name _;
        return 301 https://$server_name$request_uri;
    }
    
    # HTTPS server
    server {
        listen 443 ssl http2;
        server_name _;
        
        # SSL configuration
        ssl_certificate /etc/nginx/ssl/server.crt;
        ssl_certificate_key /etc/nginx/ssl/server.key;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-SHA384:ECDHE-RSA-AES128-SHA256;
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL:10m;
        ssl_session_timeout 10m;
        
        # Security headers
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        
        # API endpoints
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://signal_bot;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_connect_timeout 5s;
            proxy_send_timeout 10s;
            proxy_read_timeout 10s;
        }
        
        # Health check
        location /health {
            proxy_pass http://signal_bot/health;
            access_log off;
        }
        
        # MCP server (restrict access)
        location /mcp/ {
            allow 127.0.0.1;
            allow 10.0.0.0/8;
            allow 172.16.0.0/12;
            allow 192.168.0.0/16;
            deny all;
            
            proxy_pass http://signal-bot-remote:3000/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        
        # Default response
        location / {
            return 200 '{"status":"ok","service":"signal-aichat"}';
            add_header Content-Type application/json;
        }
    }
}
EOF
    
    log_success "Nginx configuration created"
}

# Create systemd service
create_systemd_service() {
    log_info "Creating systemd service..."
    
    sudo tee /etc/systemd/system/signal-aichat.service > /dev/null << EOF
[Unit]
Description=Signal AI Chat Bot
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/docker compose -f $COMPOSE_FILE up -d
ExecStop=/usr/bin/docker compose -f $COMPOSE_FILE down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    log_success "Systemd service created"
}

# Create SSL certificates (self-signed for development)
create_ssl_certificates() {
    log_info "Creating SSL certificates..."
    
    mkdir -p nginx/ssl
    
    if [ ! -f nginx/ssl/server.crt ] || [ ! -f nginx/ssl/server.key ]; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout nginx/ssl/server.key \
            -out nginx/ssl/server.crt \
            -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
        
        log_success "SSL certificates created"
    else
        log_info "SSL certificates already exist"
    fi
}

# Backup existing data
backup_data() {
    if [ -d "/opt/signal-aichat/data" ] && [ "$(ls -A /opt/signal-aichat/data)" ]; then
        log_info "Creating backup of existing data..."
        
        local timestamp=$(date +%Y%m%d_%H%M%S)
        local backup_file="$BACKUP_DIR/signal-data-$timestamp.tar.gz"
        
        mkdir -p "$BACKUP_DIR"
        tar -czf "$backup_file" -C /opt/signal-aichat data
        
        log_success "Backup created: $backup_file"
    fi
}

# Deploy production
deploy_production() {
    log_info "Starting production deployment..."
    
    # Create backup
    backup_data
    
    # Pull latest images
    log_info "Pulling latest images..."
    docker compose -f "$COMPOSE_FILE" pull
    
    # Build custom images
    log_info "Building production images..."
    docker compose -f "$COMPOSE_FILE" build --no-cache
    
    # Stop existing services
    log_info "Stopping existing services..."
    docker compose -f "$COMPOSE_FILE" down || true
    
    # Start services
    log_info "Starting production services..."
    docker compose -f "$COMPOSE_FILE" up -d
    
    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    local max_attempts=60
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        local healthy_count=$(docker compose -f "$COMPOSE_FILE" ps --format json | jq -r '.[] | select(.Health == "healthy" or .Health == null) | .Name' | wc -l)
        local total_count=$(docker compose -f "$COMPOSE_FILE" ps --format json | jq -r '.Name' | wc -l)
        
        if [ "$healthy_count" -eq "$total_count" ]; then
            log_success "All services are healthy"
            break
        fi
        
        ((attempt++))
        if [ $attempt -eq $max_attempts ]; then
            log_error "Services failed to become healthy within timeout"
            docker compose -f "$COMPOSE_FILE" ps
            docker compose -f "$COMPOSE_FILE" logs
            exit 1
        fi
        
        log_info "Waiting for services... attempt $attempt/$max_attempts"
        sleep 5
    done
    
    # Enable systemd service
    sudo systemctl enable signal-aichat.service
    
    log_success "Production deployment completed successfully! 🚀"
}

# Show production status
show_production_status() {
    log_info "=== Production Service Status ==="
    docker compose -f "$COMPOSE_FILE" ps
    
    echo ""
    log_info "=== System Status ==="
    systemctl is-active signal-aichat.service || echo "Service not active"
    
    echo ""
    log_info "=== Available Endpoints ==="
    local server_ip=$(hostname -I | awk '{print $1}')
    echo "🌐 Public API:       https://$server_ip/api/"
    echo "📱 Signal CLI API:   http://$server_ip:8080 (internal)"
    echo "🔌 MCP Server:       http://$server_ip:3000 (restricted)"
    echo "❤️ Health Check:     https://$server_ip/health"
    echo ""
    echo "Internal endpoints:"
    echo "- Bot Health:        curl http://localhost:8081/health"
    echo "- Signal CLI Health: curl http://localhost:8080/v1/health"
    echo "- Models API:        curl http://localhost:8081/api/models"
    
    echo ""
    log_info "=== Useful Commands ==="
    echo "View logs:           docker compose -f $COMPOSE_FILE logs -f [service_name]"
    echo "Restart service:     sudo systemctl restart signal-aichat"
    echo "Test network:        ./scripts/test-network.sh remote"
    echo "View backups:        ls -la $BACKUP_DIR"
}

# Main execution
main() {
    local command=${1:-"deploy"}
    
    case $command in
        "deploy"|"start"|"up")
            check_prerequisites
            setup_production_directories
            create_ssl_certificates
            deploy_production
            show_production_status
            ;;
        "stop"|"down")
            log_info "Stopping production services..."
            docker compose -f "$COMPOSE_FILE" down
            sudo systemctl stop signal-aichat.service
            log_success "Services stopped"
            ;;
        "restart")
            log_info "Restarting production services..."
            sudo systemctl restart signal-aichat.service
            log_success "Services restarted"
            ;;
        "status"|"ps")
            show_production_status
            ;;
        "logs")
            docker compose -f "$COMPOSE_FILE" logs -f "${2:-}"
            ;;
        "backup")
            backup_data
            ;;
        "test")
            ./scripts/test-network.sh remote
            ;;
        "help"|"-h"|"--help")
            echo "Remote deployment script for signal-aichat on Linux servers"
            echo ""
            echo "Usage: $0 [command]"
            echo ""
            echo "Commands:"
            echo "  deploy|start|up    Deploy and start all services (default)"
            echo "  stop|down          Stop all services"
            echo "  restart            Restart all services"
            echo "  status|ps          Show service status"
            echo "  logs [service]     Show logs (optionally for specific service)"
            echo "  backup             Create backup of data"
            echo "  test               Run network connectivity tests"
            echo "  help               Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 deploy          # Deploy to production"
            echo "  $0 logs nginx-remote  # Show nginx logs"
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