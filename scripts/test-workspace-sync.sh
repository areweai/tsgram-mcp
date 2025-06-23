#!/bin/bash

# Test script for Docker-Local workspace sync

echo "🧪 Testing Docker-Local Workspace Sync"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Step 1: Start local rsync server
echo -e "\n${YELLOW}1. Starting local rsync server...${NC}"
npm run rsync:local &
RSYNC_PID=$!
sleep 3

# Check if rsync started
if lsof -i:8873 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Local rsync server running on port 8873${NC}"
else
    echo -e "${RED}❌ Failed to start local rsync server${NC}"
    exit 1
fi

# Step 2: Build and start Docker workspace
echo -e "\n${YELLOW}2. Starting Docker workspace...${NC}"
docker-compose -f docker-compose.workspace.yml build
docker-compose -f docker-compose.workspace.yml up -d

sleep 5

# Check if container is running
if docker ps | grep mcp-workspace > /dev/null; then
    echo -e "${GREEN}✅ Docker workspace container running${NC}"
else
    echo -e "${RED}❌ Failed to start Docker workspace${NC}"
    kill $RSYNC_PID
    exit 1
fi

# Step 3: Test sync from local to Docker
echo -e "\n${YELLOW}3. Testing local → Docker sync...${NC}"
echo "Test file from local $(date)" > test-local-to-docker.txt

# Sync to Docker
docker exec mcp-workspace rsync -av --password-file=/etc/rsync.password \
    rsync://mcp@host.docker.internal:8873/project/test-local-to-docker.txt \
    /app/workspace/

# Verify file exists in Docker
if docker exec mcp-workspace cat /app/workspace/test-local-to-docker.txt > /dev/null 2>&1; then
    echo -e "${GREEN}✅ File synced from local to Docker${NC}"
else
    echo -e "${RED}❌ Sync from local to Docker failed${NC}"
fi

# Step 4: Test sync from Docker to local
echo -e "\n${YELLOW}4. Testing Docker → local sync...${NC}"
docker exec mcp-workspace sh -c "echo 'Test file from Docker $(date)' > /app/workspace/test-docker-to-local.txt"

# Wait for file watcher to sync
sleep 3

# Check if file exists locally
if [ -f "test-docker-to-local.txt" ]; then
    echo -e "${GREEN}✅ File synced from Docker to local${NC}"
else
    echo -e "${RED}❌ Sync from Docker to local failed${NC}"
    echo "Note: File watcher may need configuration for host.docker.internal"
fi

# Step 5: Test MCP tools
echo -e "\n${YELLOW}5. Testing MCP workspace tools...${NC}"

# Get workspace status
echo "Getting workspace status..."
docker exec mcp-workspace curl -s http://localhost:4040/health || echo "MCP health check not available"

# Cleanup
echo -e "\n${YELLOW}6. Cleaning up...${NC}"
rm -f test-local-to-docker.txt test-docker-to-local.txt
docker-compose -f docker-compose.workspace.yml down
kill $RSYNC_PID 2>/dev/null

echo -e "\n${GREEN}✅ Workspace sync test complete!${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "To use the workspace:"
echo "1. Start local rsync: npm run rsync:local"
echo "2. Start Docker workspace: npm run workspace:start"
echo "3. Use MCP tools to edit files in Docker"
echo "4. Files sync automatically between Docker and local"