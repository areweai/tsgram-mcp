#!/bin/bash

# Start script for Hermes MCP with workspace capabilities
echo "🚀 Starting Hermes MCP Workspace Server..."
echo "🔒 Authorized user: @${AUTHORIZED_USER} (${AUTHORIZED_CHAT_ID})"

# Start rsync daemon
echo "📡 Starting rsync daemon..."
rsync --daemon --config=/etc/rsyncd.conf

# Wait for rsync to start
sleep 2

# Check if rsync is running
if pgrep rsync > /dev/null; then
    echo "✅ Rsync daemon started on port 873"
else
    echo "❌ Failed to start rsync daemon"
    exit 1
fi

# Start file watcher in background if enabled
if [ "$SYNC_ENABLED" = "true" ]; then
    echo "👀 Starting SAFE file watcher..."
    # Use the safe version with health checks
    if [ -f "/app/scripts/sync-watcher-safe.sh" ]; then
        /app/scripts/sync-watcher-safe.sh &
    else
        /app/scripts/sync-watcher.sh &
    fi
    WATCHER_PID=$!
    echo "✅ File watcher started (PID: $WATCHER_PID)"
fi

# Create initial workspace structure and data directory
PROJECT_NAME=${PROJECT_NAME:-tsgram}
WORKSPACE_ROOT=${WORKSPACE_ROOT:-/app/workspaces}
WORKSPACE_PATH="$WORKSPACE_ROOT/$PROJECT_NAME"

mkdir -p "$WORKSPACE_PATH/src"
mkdir -p /app/data

# Only create README if it doesn't exist
if [ ! -f "$WORKSPACE_PATH/README.md" ]; then
    echo "# $PROJECT_NAME workspace ready for @${AUTHORIZED_USER}" > "$WORKSPACE_PATH/README.md"
fi

echo "📁 Project: $PROJECT_NAME"
echo "📂 Workspace: $WORKSPACE_PATH"

# Start the enhanced MCP server with workspace tools
echo "🤖 Starting Hermes MCP server with workspace tools..."
cd /app

# Use the enhanced server with auth checks
export TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
export OPENROUTER_API_KEY="${OPENROUTER_API_KEY}"
export OPENAI_API_KEY="${OPENAI_API_KEY}"

# Start both services
echo "🤖 Starting AI-powered Telegram bot..."
npx tsx src/telegram-bot-ai-powered.ts &
BOT_PID=$!
echo "✅ Telegram bot started (PID: $BOT_PID)"

echo "🔌 Starting Telegram MCP webhook server..."
npx tsx src/telegram-mcp-webhook-server.ts &
MCP_PID=$!
echo "✅ MCP webhook server started (PID: $MCP_PID)"

# Wait for both processes
wait $BOT_PID $MCP_PID