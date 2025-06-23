#!/bin/bash

# MCP Configuration Automation Script
# Automatically configures Claude Code MCP integration for TSGram
# Supports local, Docker, and remote deployment modes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

# Platform detection
detect_platform() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        PLATFORM="macos"
        CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        PLATFORM="linux"
        CLAUDE_CONFIG_DIR="$HOME/.config/Claude"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        PLATFORM="windows"
        CLAUDE_CONFIG_DIR="$APPDATA/Claude"
    else
        echo -e "${RED}[ERROR]${NC} Unsupported platform: $OSTYPE"
        exit 1
    fi
    
    CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"
}

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

# Detect deployment environment
detect_environment() {
    if docker ps --filter name=tsgram &>/dev/null && docker ps --filter name=tsgram | grep -q tsgram; then
        ENVIRONMENT="docker"
        log_info "Detected Docker deployment"
    elif [[ -f "docker-compose.yml" ]] || [[ -f "docker-compose.tsgram-workspace.yml" ]]; then
        ENVIRONMENT="docker"
        log_info "Detected Docker configuration"
    elif [[ -n "$REMOTE_HOST" ]] || [[ -n "$SSH_CONNECTION" ]]; then
        ENVIRONMENT="remote"
        log_info "Detected remote environment"
    else
        ENVIRONMENT="local"
        log_info "Detected local development environment"
    fi
}

# Generate MCP configuration based on environment
generate_mcp_config() {
    local config_type="${1:-$ENVIRONMENT}"
    local project_path
    project_path=$(pwd)
    
    case "$config_type" in
        "local")
            cat << EOF
{
  "mcpServers": {
    "tsgram": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server.ts"],
      "cwd": "$project_path",
      "env": {
        "NODE_ENV": "development",
        "PROJECT_PATH": "$project_path"
      }
    }
  }
}
EOF
            ;;
        "docker")
            cat << EOF
{
  "mcpServers": {
    "tsgram-docker": {
      "command": "npx", 
      "args": ["tsx", "src/mcp-docker-proxy.ts"],
      "cwd": "$project_path",
      "env": {
        "NODE_ENV": "production",
        "DOCKER_URL": "http://localhost:4040",
        "DOCKER_WEBHOOK_URL": "http://localhost:4041"
      }
    }
  }
}
EOF
            ;;
        "remote")
            local remote_url="${REMOTE_MCP_URL:-http://localhost:3000}"
            cat << EOF
{
  "mcpServers": {
    "tsgram-remote": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "$remote_url/mcp",
        "-H", "Content-Type: application/json",
        "-H", "Authorization: Bearer \${MCP_AUTH_TOKEN}",
        "-d", "@-"
      ],
      "env": {
        "MCP_ENDPOINT": "$remote_url",
        "MCP_AUTH_TOKEN": "\${MCP_AUTH_TOKEN}"
      }
    }
  }
}
EOF
            ;;
        "multi")
            cat << EOF
{
  "mcpServers": {
    "tsgram-local": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server.ts"],
      "cwd": "$project_path",
      "env": {
        "NODE_ENV": "development"
      }
    },
    "tsgram-docker": {
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
            ;;
        *)
            log_error "Unknown configuration type: $config_type"
            exit 1
            ;;
    esac
}

# Backup existing configuration
backup_config() {
    if [[ -f "$CLAUDE_CONFIG_FILE" ]]; then
        local backup_file="$CLAUDE_CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        cp "$CLAUDE_CONFIG_FILE" "$backup_file"
        log_info "Backup created: $backup_file"
        return 0
    else
        log_info "No existing configuration found"
        return 1
    fi
}

# Merge configurations (preserves existing MCP servers)
merge_config() {
    local new_config="$1"
    local merged_config
    
    if [[ -f "$CLAUDE_CONFIG_FILE" ]]; then
        # Use jq to merge if available, otherwise replace
        if command -v jq &>/dev/null; then
            merged_config=$(jq -s '.[0] * .[1]' "$CLAUDE_CONFIG_FILE" <(echo "$new_config"))
            echo "$merged_config"
        else
            # Simple replacement if jq not available
            echo "$new_config"
        fi
    else
        echo "$new_config"
    fi
}

# Apply configuration
apply_config() {
    local config_type="${1:-$ENVIRONMENT}"
    
    log_step "Applying $config_type MCP configuration..."
    
    # Create config directory if needed
    mkdir -p "$CLAUDE_CONFIG_DIR"
    
    # Generate new configuration
    local new_config
    new_config=$(generate_mcp_config "$config_type")
    
    # Backup existing config
    backup_config
    
    # Merge or replace configuration
    local final_config
    final_config=$(merge_config "$new_config")
    
    # Write configuration
    echo "$final_config" > "$CLAUDE_CONFIG_FILE"
    
    log_success "MCP configuration applied: $config_type"
    log_info "Config file: $CLAUDE_CONFIG_FILE"
}

# Test MCP connection
test_mcp_connection() {
    log_step "Testing MCP connection..."
    
    case "$ENVIRONMENT" in
        "local")
            if [[ -f "src/mcp-server.ts" ]]; then
                log_info "Local MCP server script found"
                if command -v npx &>/dev/null && command -v tsx &>/dev/null; then
                    log_success "Local MCP test: Prerequisites available"
                else
                    log_warning "Local MCP test: Missing npx or tsx"
                fi
            else
                log_warning "Local MCP test: Server script not found"
            fi
            ;;
        "docker")
            if curl -sf http://localhost:4040/health &>/dev/null; then
                log_success "Docker MCP test: Health endpoint responding"
            else
                log_warning "Docker MCP test: Health endpoint not responding"
            fi
            
            if curl -sf http://localhost:4040/mcp/status &>/dev/null; then
                log_success "Docker MCP test: MCP endpoint responding"
            else
                log_warning "Docker MCP test: MCP endpoint not responding"
            fi
            ;;
        "remote")
            local remote_url="${REMOTE_MCP_URL:-http://localhost:3000}"
            if curl -sf "$remote_url/health" &>/dev/null; then
                log_success "Remote MCP test: Remote server responding"
            else
                log_warning "Remote MCP test: Remote server not responding"
            fi
            ;;
    esac
}

# Validate configuration
validate_config() {
    log_step "Validating configuration..."
    
    if [[ ! -f "$CLAUDE_CONFIG_FILE" ]]; then
        log_error "Configuration file not found: $CLAUDE_CONFIG_FILE"
        return 1
    fi
    
    # Validate JSON syntax if jq is available
    if command -v jq &>/dev/null; then
        if jq empty "$CLAUDE_CONFIG_FILE" &>/dev/null; then
            log_success "Configuration JSON is valid"
        else
            log_error "Configuration JSON is invalid"
            return 1
        fi
        
        # Check for required fields
        if jq -e '.mcpServers' "$CLAUDE_CONFIG_FILE" &>/dev/null; then
            local server_count
            server_count=$(jq '.mcpServers | length' "$CLAUDE_CONFIG_FILE")
            log_info "Found $server_count MCP server(s) configured"
        else
            log_warning "No mcpServers found in configuration"
        fi
    else
        log_info "jq not available, skipping detailed validation"
    fi
    
    log_success "Configuration validation completed"
}

# Show configuration status
show_status() {
    log_step "Configuration Status"
    
    echo "Platform: $PLATFORM"
    echo "Environment: $ENVIRONMENT"
    echo "Config file: $CLAUDE_CONFIG_FILE"
    echo ""
    
    if [[ -f "$CLAUDE_CONFIG_FILE" ]]; then
        echo "Current configuration:"
        if command -v jq &>/dev/null; then
            jq '.' "$CLAUDE_CONFIG_FILE"
        else
            cat "$CLAUDE_CONFIG_FILE"
        fi
    else
        echo "No configuration file found"
    fi
}

# Interactive configuration
interactive_config() {
    log_step "Interactive MCP Configuration"
    
    echo ""
    echo "Available configuration types:"
    echo "  1. local   - Direct local MCP server"
    echo "  2. docker  - Docker container proxy"
    echo "  3. remote  - Remote MCP server"
    echo "  4. multi   - Multiple servers (local + docker)"
    echo "  5. auto    - Auto-detect environment"
    echo ""
    
    read -p "Select configuration type (1-5): " choice
    
    case "$choice" in
        1) CONFIG_TYPE="local" ;;
        2) CONFIG_TYPE="docker" ;;
        3) 
            CONFIG_TYPE="remote"
            read -p "Enter remote MCP URL [http://localhost:3000]: " remote_url
            export REMOTE_MCP_URL="${remote_url:-http://localhost:3000}"
            ;;
        4) CONFIG_TYPE="multi" ;;
        5) CONFIG_TYPE="$ENVIRONMENT" ;;
        *) 
            log_error "Invalid choice"
            exit 1
            ;;
    esac
    
    apply_config "$CONFIG_TYPE"
    test_mcp_connection
    validate_config
}

# Usage information
show_usage() {
    cat << EOF
Usage: $0 [COMMAND] [OPTIONS]

COMMANDS:
    apply [TYPE]    Apply MCP configuration (local|docker|remote|multi)
    test           Test MCP connection
    status         Show current configuration status
    backup         Backup current configuration
    restore        Restore from backup (interactive)
    interactive    Interactive configuration setup
    
OPTIONS:
    --environment ENV    Force environment detection (local|docker|remote)
    --config-dir DIR     Override Claude config directory
    --help              Show this help message

EXAMPLES:
    $0 apply docker                    # Apply Docker configuration
    $0 apply remote --remote-url URL   # Apply remote configuration
    $0 interactive                     # Interactive setup
    $0 test                           # Test current configuration
    $0 status                         # Show configuration status

ENVIRONMENT VARIABLES:
    REMOTE_MCP_URL      Remote MCP server URL
    MCP_AUTH_TOKEN      Authentication token for remote servers
    CLAUDE_CONFIG_DIR   Override Claude configuration directory
EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            --config-dir)
                CLAUDE_CONFIG_DIR="$2"
                CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"
                shift 2
                ;;
            --remote-url)
                export REMOTE_MCP_URL="$2"
                shift 2
                ;;
            --help)
                show_usage
                exit 0
                ;;
            apply|test|status|backup|restore|interactive)
                COMMAND="$1"
                shift
                ;;
            local|docker|remote|multi)
                CONFIG_TYPE="$1"
                shift
                ;;
            *)
                log_error "Unknown argument: $1"
                show_usage
                exit 1
                ;;
        esac
    done
}

# Main execution
main() {
    # Initialize
    detect_platform
    
    # Parse arguments
    parse_args "$@"
    
    # Detect environment if not overridden
    if [[ -z "$ENVIRONMENT" ]]; then
        detect_environment
    fi
    
    # Execute command
    case "${COMMAND:-apply}" in
        apply)
            apply_config "${CONFIG_TYPE:-$ENVIRONMENT}"
            test_mcp_connection
            validate_config
            ;;
        test)
            test_mcp_connection
            ;;
        status)
            show_status
            ;;
        backup)
            backup_config
            ;;
        interactive)
            interactive_config
            ;;
        *)
            log_error "Unknown command: $COMMAND"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function
main "$@"