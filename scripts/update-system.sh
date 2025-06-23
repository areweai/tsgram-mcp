#!/bin/bash

# System Update Script
# Updates TSGram components, AI models, and dependencies

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

log_info "🔄 Starting TSGram system update..."

# Update Git repository
if [[ -d ".git" ]]; then
    log_info "Updating Git repository..."
    git fetch origin
    git pull origin main
    log_success "Git repository updated"
else
    log_warning "Not a Git repository, skipping Git update"
fi

# Update Node.js dependencies
if [[ -f "package.json" ]]; then
    log_info "Updating Node.js dependencies..."
    npm update
    log_success "Dependencies updated"
fi

# Rebuild Docker images
if command -v docker &>/dev/null; then
    log_info "Rebuilding Docker images..."
    docker build -t tsgram:latest -f Dockerfile.tsgram-workspace . --no-cache
    log_success "Docker images rebuilt"
else
    log_warning "Docker not available, skipping image rebuild"
fi

# Restart services
log_info "Restarting services..."
if docker-compose -f docker-compose.tsgram-workspace.yml ps | grep -q "Up"; then
    docker-compose -f docker-compose.tsgram-workspace.yml down
    docker-compose -f docker-compose.tsgram-workspace.yml up -d
    log_success "Services restarted"
else
    log_info "Services not running, starting them..."
    docker-compose -f docker-compose.tsgram-workspace.yml up -d
fi

# Update MCP configuration
log_info "Updating MCP configuration..."
./scripts/configure-mcp.sh apply docker
log_success "MCP configuration updated"

# Health check
log_info "Performing health check..."
sleep 10
if curl -sf http://localhost:4040/health &>/dev/null; then
    log_success "System update completed successfully!"
else
    log_error "Health check failed after update"
    exit 1
fi

log_success "✅ TSGram system update completed!"