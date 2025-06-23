#!/bin/bash

# AI Context Update Script  
# Re-scans project structure and updates AI understanding

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

log_info "🧠 Updating AI context and project understanding..."

# Scan project structure
log_info "Scanning project structure..."
find . -type f -name "*.ts" -o -name "*.js" -o -name "*.json" -o -name "*.md" | \
    grep -v node_modules | \
    grep -v dist | \
    grep -v .git | \
    head -100 > .ai-context/file-list.txt

# Generate project summary
log_info "Generating project summary..."
cat > .ai-context/project-summary.md << EOF
# Project Summary - $(date)

## File Structure
$(tree -I 'node_modules|dist|.git' -L 3 2>/dev/null || find . -type d -not -path '*/node_modules/*' -not -path '*/dist/*' -not -path '*/.git/*' | head -20)

## Dependencies
$(grep -A 20 '"dependencies"' package.json 2>/dev/null || echo "No package.json found")

## Recent Changes
$(git log --oneline -10 2>/dev/null || echo "No git history available")

## Configuration Files
$(ls -la *.json *.yml *.yaml 2>/dev/null || echo "No config files found")

Updated: $(date)
EOF

# Update Docker container context
if docker ps --filter name=tsgram &>/dev/null; then
    log_info "Updating Docker container AI context..."
    docker exec tsgram-mcp-workspace npm run update-context 2>/dev/null || true
fi

# Restart AI services to pick up new context
log_info "Restarting AI services..."
curl -X POST http://localhost:4040/refresh-context 2>/dev/null || true

log_success "✅ AI context updated successfully!"
log_info "The AI now has updated understanding of your project structure and recent changes."