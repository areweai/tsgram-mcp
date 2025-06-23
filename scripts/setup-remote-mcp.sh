#!/bin/bash

# Setup script for remote Hermes MCP server

echo "Setting up remote Hermes MCP server..."

# Remove old hermes registration if exists
echo "Removing old hermes MCP registration..."
claude mcp remove hermes 2>/dev/null || true

# Add new remote hermes registration
echo "Adding remote hermes MCP registration..."
claude mcp add hermes-remote-http "curl -X POST http://localhost:3000/mcp -H 'Content-Type: application/json'"

# Test the connection
echo "Testing remote MCP connection..."
sleep 2

echo "Testing health endpoint..."
curl -f http://localhost:3000/health

echo ""
echo "Testing MCP tools endpoint..."
curl -f http://localhost:3000/mcp/tools

echo ""
echo "Setup complete!"
echo ""
echo "Usage in Claude Code:"
echo "1. The hermes-remote-http MCP server is now registered"
echo "2. Access via: hermes__chat_with_ai, hermes__list_ai_models, hermes__send_signal_message"
echo "3. Direct HTTP API available at http://localhost:3000/api/*"
echo ""
echo "Container status:"
docker ps --filter name=hermes