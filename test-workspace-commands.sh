#!/bin/bash

# Test script for workspace commands

echo "🧪 Testing Hermes Workspace Commands"
echo "===================================="

# Create test README in workspace
docker exec hermes-mcp-workspace sh -c "echo '# Test Project

This is a test README for the workspace.

## Features
- File sync with rsync
- Telegram commands
- AI integration

## Commands
Use :h help to see available commands.' > /app/workspace/README.md"

echo "✅ Created test README.md in workspace"

# Test commands
COMMANDS=(
    ":h"
    ":h help"
    ":h ls"
    ":h echo README.md"
    ":h cat readme.md"
    ":h show README.MD"
    ":h status"
)

echo ""
echo "📋 Commands to test manually in Telegram:"
echo ""

for cmd in "${COMMANDS[@]}"; do
    echo "  $cmd"
done

echo ""
echo "Expected results:"
echo "  :h              -> 'What would you like to work on today?'"
echo "  :h help         -> List of commands"
echo "  :h ls           -> Shows README.md and other files"
echo "  :h echo README.md -> Shows README content"
echo "  :h cat readme.md -> Shows README content (case insensitive)"
echo "  :h show README.MD -> Shows README content"
echo "  :h status       -> Workspace status"

echo ""
echo "🔍 Checking Docker logs for activity..."
docker logs hermes-mcp-workspace --tail 10