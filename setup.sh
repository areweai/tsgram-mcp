#!/bin/bash

# TSGram-Claude Automated Setup Script
# Downloads and configures a complete Telegram → Claude Code AI assistant
# Usage: curl -sSL https://raw.githubusercontent.com/DDunc/tsgram-mcp/main/setup.sh | bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/DDunc/tsgram-mcp.git"
PROJECT_NAME="tsgram-mcp"
SETUP_DIR="$HOME/tsgram-mcp"
CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"
CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"

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

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

log_prompt() {
    echo -e "${CYAN}[INPUT]${NC} $1"
}

# Check if running on supported platform
check_platform() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        PLATFORM="macos"
        log_info "Detected macOS platform"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        PLATFORM="linux"
        CLAUDE_CONFIG_DIR="$HOME/.config/Claude"
        CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"
        log_info "Detected Linux platform"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        PLATFORM="windows"
        CLAUDE_CONFIG_DIR="$APPDATA/Claude"
        CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"
        log_info "Detected Windows platform"
    else
        log_error "Unsupported platform: $OSTYPE"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker Desktop first:"
        echo "  macOS: https://docs.docker.com/desktop/install/mac-install/"
        echo "  Windows: https://docs.docker.com/desktop/install/windows-install/"
        echo "  Linux: https://docs.docker.com/desktop/install/linux-install/"
        exit 1
    fi
    
    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not available"
        exit 1
    fi
    
    # Check Git
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed. Please install Git first."
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_warning "Node.js not found. Installing via Docker instead."
        USE_DOCKER=true
    else
        USE_DOCKER=false
        log_info "Node.js found: $(node --version)"
    fi
    
    # Check npm
    if [[ "$USE_DOCKER" == "false" ]] && ! command -v npm &> /dev/null; then
        log_error "npm not found. Please install Node.js and npm."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Create setup directory
create_setup_directory() {
    log_step "Creating setup directory..."
    
    if [[ -d "$SETUP_DIR" ]]; then
        log_warning "Setup directory already exists. Backing up..."
        mv "$SETUP_DIR" "$SETUP_DIR.backup.$(date +%Y%m%d_%H%M%S)"
    fi
    
    mkdir -p "$SETUP_DIR"
    cd "$SETUP_DIR"
    
    log_success "Setup directory created: $SETUP_DIR"
}

# Clone repository
clone_repository() {
    log_step "Downloading TSGram..."
    
    if ! git clone "$REPO_URL" "$PROJECT_NAME"; then
        log_error "Failed to clone repository. Please check your internet connection."
        exit 1
    fi
    
    cd "$PROJECT_NAME"
    
    log_success "TSGram downloaded successfully"
}

# Collect user credentials
collect_credentials() {
    log_step "Collecting credentials for setup..."
    
    echo ""
    echo "🤖 We need a few credentials to set up your AI assistant:"
    echo ""
    
    # Telegram Bot Token
    while [[ -z "$TELEGRAM_BOT_TOKEN" ]]; do
        log_prompt "Enter your Telegram bot token (from @BotFather):"
        echo -n "Token: "
        read -r TELEGRAM_BOT_TOKEN
        
        if [[ ! "$TELEGRAM_BOT_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]{35}$ ]]; then
            log_error "Invalid bot token format. Should look like: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
            TELEGRAM_BOT_TOKEN=""
        fi
    done
    
    # Telegram Chat ID
    while [[ -z "$TELEGRAM_CHAT_ID" ]]; do
        log_prompt "Enter your Telegram chat ID:"
        echo -n "Chat ID: "
        read -r TELEGRAM_CHAT_ID
        
        if [[ ! "$TELEGRAM_CHAT_ID" =~ ^-?[0-9]+$ ]]; then
            log_error "Invalid chat ID format. Should be a number like: 123456789"
            TELEGRAM_CHAT_ID=""
        fi
    done
    
    # Telegram Username
    while [[ -z "$TELEGRAM_USERNAME" ]]; do
        log_prompt "Enter your Telegram username (without @):"
        echo -n "Username: "
        read -r TELEGRAM_USERNAME
        
        if [[ ! "$TELEGRAM_USERNAME" =~ ^[a-zA-Z0-9_]{5,32}$ ]]; then
            log_error "Invalid username format. Should be 5-32 characters, letters/numbers/underscores only"
            TELEGRAM_USERNAME=""
        fi
    done
    
    # OpenRouter API Key (for Claude AI)
    while [[ -z "$OPENROUTER_API_KEY" ]]; do
        echo ""
        log_info "Get your OpenRouter API key from: https://openrouter.ai/keys"
        log_prompt "Enter your OpenRouter API key (for Claude AI):"
        echo -n "API Key: "
        read -s OPENROUTER_API_KEY
        echo ""
        
        if [[ ! "$OPENROUTER_API_KEY" =~ ^sk-or-[a-zA-Z0-9-_]{20,}$ ]]; then
            log_error "Invalid OpenRouter API key format. Should start with: sk-or-"
            OPENROUTER_API_KEY=""
        fi
    done
    
    # Optional: OpenAI API Key
    echo ""
    log_prompt "Enter your OpenAI API key (optional, press Enter to skip):"
    echo -n "OpenAI Key: "
    read -s OPENAI_API_KEY
    echo ""
    
    if [[ -n "$OPENAI_API_KEY" ]] && [[ ! "$OPENAI_API_KEY" =~ ^sk-[a-zA-Z0-9]{20,}$ ]]; then
        log_warning "Invalid OpenAI API key format. Skipping..."
        OPENAI_API_KEY=""
    fi
    
    log_success "Credentials collected successfully"
}

# Generate .env file
generate_env_file() {
    log_step "Generating environment configuration..."
    
    cat > .env << EOF
# Telegram Configuration
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
AUTHORIZED_USER=$TELEGRAM_USERNAME
AUTHORIZED_CHAT_ID=$TELEGRAM_CHAT_ID

# AI Model Configuration
DEFAULT_MODEL=openrouter
OPENROUTER_API_KEY=$OPENROUTER_API_KEY
$(if [[ -n "$OPENAI_API_KEY" ]]; then echo "OPENAI_API_KEY=$OPENAI_API_KEY"; fi)

# Server Configuration
NODE_ENV=production
MCP_SERVER_PORT=4040
MCP_WEBHOOK_PORT=4041
MCP_SERVER_HOST=0.0.0.0

# Project Configuration
PROJECT_NAME=tsgram
WORKSPACE_ROOT=/app/workspaces
WORKSPACE_PATH=/app/workspaces/tsgram
SYNC_ENABLED=true
RSYNC_HOST=host.docker.internal
RSYNC_PORT=8873

# Generated by setup script on $(date)
SETUP_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SETUP_VERSION=1.0.0
EOF
    
    log_success "Environment file generated"
}

# Test bot token
test_bot_token() {
    log_step "Testing Telegram bot token..."
    
    local response
    response=$(curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe")
    
    if echo "$response" | grep -q '"ok":true'; then
        local bot_username
        bot_username=$(echo "$response" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
        log_success "Bot token valid! Bot username: @$bot_username"
    else
        log_error "Bot token test failed. Please check your token."
        exit 1
    fi
}

# Install dependencies
install_dependencies() {
    if [[ "$USE_DOCKER" == "true" ]]; then
        log_step "Using Docker for dependencies (Node.js not installed locally)"
        return
    fi
    
    log_step "Installing Node.js dependencies..."
    
    if ! npm install; then
        log_error "Failed to install dependencies"
        exit 1
    fi
    
    log_success "Dependencies installed"
}

# Build Docker image
build_docker_image() {
    log_step "Building Docker image..."
    
    if ! docker build -t tsgram:latest -f Dockerfile.tsgram-workspace .; then
        log_error "Failed to build Docker image"
        exit 1
    fi
    
    log_success "Docker image built successfully"
}

# Deploy containers
deploy_containers() {
    log_step "Deploying containers..."
    
    # Stop any existing containers
    docker-compose -f docker-compose.tsgram-workspace.yml down 2>/dev/null || true
    
    # Start new containers
    if ! docker-compose -f docker-compose.tsgram-workspace.yml up -d; then
        log_error "Failed to start containers"
        exit 1
    fi
    
    log_info "Waiting for containers to be ready..."
    sleep 10
    
    # Health check
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        if curl -sf http://localhost:4040/health > /dev/null 2>&1; then
            break
        fi
        
        log_info "Waiting for health check... ($attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    if [[ $attempt -gt $max_attempts ]]; then
        log_error "Health check failed. Containers may not be running correctly."
        docker-compose -f docker-compose.tsgram-workspace.yml logs
        exit 1
    fi
    
    log_success "Containers deployed and healthy"
}

# Configure Claude Code MCP
configure_claude_mcp() {
    log_step "Configuring Claude Code MCP integration..."
    
    # Create Claude config directory if it doesn't exist
    mkdir -p "$CLAUDE_CONFIG_DIR"
    
    # Backup existing config
    if [[ -f "$CLAUDE_CONFIG_FILE" ]]; then
        local backup_file="$CLAUDE_CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$CLAUDE_CONFIG_FILE" "$backup_file"
        log_info "Existing config backed up to: $backup_file"
    fi
    
    # Determine absolute path to project
    local project_path
    project_path=$(pwd)
    
    # Generate MCP configuration
    cat > "$CLAUDE_CONFIG_FILE" << EOF
{
  "mcpServers": {
    "tsgram": {
      "command": "npx",
      "args": ["tsx", "src/mcp-docker-proxy.ts"],
      "cwd": "$project_path",
      "env": {
        "NODE_ENV": "production",
        "DOCKER_URL": "http://localhost:4040"
      }
    }
  }
}
EOF
    
    log_success "Claude Code MCP configuration updated"
    log_info "Configuration file: $CLAUDE_CONFIG_FILE"
}

# Create global command
create_global_command() {
    log_step "Creating global claude-tg command..."
    
    local global_command_path="/usr/local/bin/claude-tg"
    local script_path="$(pwd)/claude-tg"
    
    # Make script executable
    chmod +x "$script_path"
    
    # Create symlink (requires sudo)
    if command -v sudo &> /dev/null; then
        if sudo ln -sf "$script_path" "$global_command_path" 2>/dev/null; then
            log_success "Global claude-tg command created"
            log_info "You can now use 'claude-tg' instead of 'claude' to forward responses to Telegram"
        else
            log_warning "Could not create global command (permission denied)"
            log_info "You can manually create it with: sudo ln -sf $script_path $global_command_path"
        fi
    else
        log_warning "sudo not available, skipping global command creation"
    fi
}

# Generate QR code for easy mobile access
generate_qr_code() {
    log_step "Generating QR code for mobile access..."
    
    # Get bot username for QR code
    local bot_info=$(curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe")
    local bot_username=$(echo "$bot_info" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
    local bot_url="https://t.me/$bot_username"
    
    # Try to generate QR code if qrencode is available
    if command -v qrencode &> /dev/null; then
        echo ""
        log_info "QR Code for your Telegram bot:"
        qrencode -t ansiutf8 "$bot_url"
        echo ""
    else
        log_info "Bot URL for mobile: $bot_url"
        log_info "Install 'qrencode' to see QR code: brew install qrencode (macOS) or apt install qrencode (Linux)"
    fi
}

# Test the complete setup
test_setup() {
    log_step "Testing complete setup..."
    
    # Test health endpoints
    local health_status
    health_status=$(curl -s http://localhost:4040/health | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    
    if [[ "$health_status" == "healthy" ]]; then
        log_success "Health check passed"
    else
        log_error "Health check failed"
        return 1
    fi
    
    # Test MCP status
    local mcp_status
    mcp_status=$(curl -s http://localhost:4040/mcp/status)
    
    if echo "$mcp_status" | grep -q '"mcp_server":"running"'; then
        log_success "MCP server is running"
    else
        log_warning "MCP server status unclear"
    fi
    
    # Test bot communication
    log_info "Sending test message to verify bot functionality..."
    
    local test_message="🤖 TSGram setup completed successfully! Your AI assistant is ready."
    local send_response
    send_response=$(curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
        -H "Content-Type: application/json" \
        -d "{\"chat_id\":\"$TELEGRAM_CHAT_ID\",\"text\":\"$test_message\"}")
    
    if echo "$send_response" | grep -q '"ok":true'; then
        log_success "Test message sent to Telegram!"
    else
        log_warning "Could not send test message. Check your chat ID."
    fi
}

# Display completion message
show_completion_message() {
    echo ""
    echo "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"
    echo ""
    log_success "TSGram-Claude setup completed successfully!"
    echo ""
    echo "📱 Your Telegram AI assistant is now ready!"
    echo ""
    echo "🔗 What's been set up:"
    echo "   ✅ Docker containers running"
    echo "   ✅ AI model (Claude) connected"
    echo "   ✅ Telegram bot configured"
    echo "   ✅ Claude Code MCP integration"
    echo "   ✅ Security filtering enabled"
    echo ""
    echo "🚀 How to use:"
    echo "   1. Open Telegram and message your bot"
    echo "   2. Ask questions about your code:"
    echo "      • 'What's in my package.json?'"
    echo "      • 'Run the tests and show results'"
    echo "      • 'Fix TypeScript errors in src/'"
    echo "      • 'Explain how authentication works'"
    echo ""
    echo "💻 Advanced usage:"
    echo "   • Use 'claude-tg' command instead of 'claude'"
    echo "   • Monitor dashboard: http://localhost:3000"
    echo "   • Check health: http://localhost:4040/health"
    echo ""
    echo "📁 Project location: $SETUP_DIR/$PROJECT_NAME"
    echo "⚙️  Configuration: $CLAUDE_CONFIG_FILE"
    echo ""
    echo "🔧 Management commands:"
    echo "   • Stop: cd $SETUP_DIR/$PROJECT_NAME && docker-compose -f docker-compose.tsgram-workspace.yml down"
    echo "   • Start: cd $SETUP_DIR/$PROJECT_NAME && docker-compose -f docker-compose.tsgram-workspace.yml up -d"
    echo "   • Logs: cd $SETUP_DIR/$PROJECT_NAME && docker-compose -f docker-compose.tsgram-workspace.yml logs -f"
    echo ""
    echo "🆘 Support: https://github.com/DDunc/tsgram-mcp/issues"
    echo ""
    echo "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉"
}

# Error handling
handle_error() {
    log_error "Setup failed at step: $1"
    echo ""
    echo "🔧 Troubleshooting:"
    echo "   1. Check Docker is running: docker --version"
    echo "   2. Check internet connection"
    echo "   3. Verify Telegram bot token"
    echo "   4. Check logs: docker-compose logs"
    echo ""
    echo "💬 Get help: https://github.com/DDunc/tsgram-mcp/issues"
    exit 1
}

# Main execution
main() {
    clear
    echo ""
    echo "🤖 TSGram-Claude Automated Setup"
    echo "=================================="
    echo ""
    echo "This script will set up a complete Telegram → Claude Code AI assistant"
    echo "in under 5 minutes with full automation."
    echo ""
    
    # Confirmation
    log_prompt "Continue with setup? (y/N): "
    read -r confirmation
    if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
        log_info "Setup cancelled by user"
        exit 0
    fi
    
    # Execute setup steps
    check_platform || handle_error "platform check"
    check_prerequisites || handle_error "prerequisites"
    create_setup_directory || handle_error "directory creation"
    clone_repository || handle_error "repository clone"
    collect_credentials || handle_error "credential collection"
    generate_env_file || handle_error "environment generation"
    test_bot_token || handle_error "bot token test"
    install_dependencies || handle_error "dependency installation"
    build_docker_image || handle_error "Docker build"
    deploy_containers || handle_error "container deployment"
    configure_claude_mcp || handle_error "MCP configuration"
    create_global_command || handle_error "global command creation"
    generate_qr_code || handle_error "QR code generation"
    test_setup || handle_error "setup testing"
    show_completion_message
    
    log_success "Setup completed in $(pwd)"
}

# Run main function
main "$@"