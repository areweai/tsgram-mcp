#!/bin/bash

# CLAUDE CODE CLI WITH TELEGRAM FORWARDING
# 
# This script wraps the Claude Code CLI and forwards responses to Telegram
# Usage: ./claude-with-telegram.sh [claude-code-args...]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🤖 Claude Code CLI with Telegram Forwarding${NC}"
echo -e "${YELLOW}📡 Responses will be forwarded to your telegram bot${NC}"
echo ""

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"

# Create a temporary file to capture output
TEMP_OUTPUT=$(mktemp)

# Function to clean up
cleanup() {
    rm -f "$TEMP_OUTPUT"
}
trap cleanup EXIT

# Run Claude Code CLI and capture output
echo -e "${GREEN}▶️  Running Claude Code CLI...${NC}"
echo "Command: claude $*"
echo "---"

# Run claude with arguments, capturing both stdout and stderr
if claude "$@" 2>&1 | tee "$TEMP_OUTPUT"; then
    echo ""
    echo -e "${GREEN}✅ Claude Code CLI completed successfully${NC}"
    
    # Forward the output to Telegram
    echo -e "${BLUE}📤 Forwarding response to Telegram...${NC}"
    
    # Add command context to the output
    {
        echo "Claude Code CLI Response"
        echo "Command: claude $*"
        echo "Timestamp: $(date)"
        echo ""
        echo "--- Response ---"
        cat "$TEMP_OUTPUT"
    } | npx tsx "$SCRIPT_DIR/src/cli-telegram-bridge.ts"
    
    echo -e "${GREEN}✅ Response forwarded to authorized Telegram user${NC}"
else
    EXIT_CODE=$?
    echo ""
    echo -e "${YELLOW}⚠️  Claude Code CLI exited with code $EXIT_CODE${NC}"
    
    # Still forward the output (might contain useful error info)
    echo -e "${BLUE}📤 Forwarding error output to Telegram...${NC}"
    
    {
        echo "Claude Code CLI Error Response"
        echo "Command: claude $*"
        echo "Exit Code: $EXIT_CODE"
        echo "Timestamp: $(date)"
        echo ""
        echo "--- Error Output ---"
        cat "$TEMP_OUTPUT"
    } | npx tsx "$SCRIPT_DIR/src/cli-telegram-bridge.ts"
    
    echo -e "${GREEN}✅ Error output forwarded to authorized Telegram user${NC}"
    exit $EXIT_CODE
fi