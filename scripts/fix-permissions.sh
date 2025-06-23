#!/bin/bash

# Permission Fix Script
# Fixes common permission issues with Docker, files, and directories

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

log_info "🔧 Fixing permission issues..."

# Fix script permissions
log_info "Making scripts executable..."
chmod +x setup.sh 2>/dev/null || true
chmod +x claude-tg 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true
log_success "Scripts made executable"

# Fix Docker volume permissions
if command -v docker &>/dev/null; then
    log_info "Fixing Docker volume permissions..."
    
    # Get current user info
    USER_ID=$(id -u)
    GROUP_ID=$(id -g)
    
    # Fix data directory permissions
    if [[ -d "data" ]]; then
        sudo chown -R "$USER_ID:$GROUP_ID" data/ 2>/dev/null || {
            log_warning "Could not fix data/ permissions (no sudo access)"
        }
    fi
    
    # Fix .telegram-queue permissions
    if [[ -d ".telegram-queue" ]]; then
        sudo chown -R "$USER_ID:$GROUP_ID" .telegram-queue/ 2>/dev/null || {
            log_warning "Could not fix .telegram-queue/ permissions (no sudo access)"
        }
    fi
    
    # Fix Docker socket permissions (macOS/Linux specific)
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        sudo usermod -aG docker "$USER" 2>/dev/null || {
            log_warning "Could not add user to docker group"
        }
    fi
    
    log_success "Docker permissions fixed"
else
    log_warning "Docker not available, skipping Docker permission fixes"
fi

# Fix project directory permissions
log_info "Fixing project directory permissions..."
find . -type f -name "*.ts" -o -name "*.js" -o -name "*.json" | \
    xargs chmod 644 2>/dev/null || true
find . -type d | xargs chmod 755 2>/dev/null || true

# Fix node_modules permissions if it exists
if [[ -d "node_modules" ]]; then
    log_info "Fixing node_modules permissions..."
    chmod -R 755 node_modules/ 2>/dev/null || {
        log_warning "Could not fix node_modules permissions"
    }
fi

# Create missing directories with correct permissions
log_info "Creating missing directories..."
mkdir -p data/.telegram-queue 2>/dev/null || true
mkdir -p .ai-context 2>/dev/null || true
mkdir -p logs 2>/dev/null || true

# Fix SSH key permissions if they exist
if [[ -d "$HOME/.ssh" ]]; then
    log_info "Fixing SSH key permissions..."
    chmod 700 "$HOME/.ssh" 2>/dev/null || true
    chmod 600 "$HOME/.ssh"/* 2>/dev/null || true
    chmod 644 "$HOME/.ssh"/*.pub 2>/dev/null || true
fi

# Test file creation
log_info "Testing file creation permissions..."
if touch test-permissions.tmp 2>/dev/null; then
    rm test-permissions.tmp
    log_success "File creation test passed"
else
    log_error "Cannot create files in current directory"
    exit 1
fi

log_success "✅ Permission fixes completed!"
log_info "If you're still having permission issues, try running with sudo or check your Docker setup."