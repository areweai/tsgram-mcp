# Running Multiple Zenode Instances for Different Projects

This guide explains how to run separate zenode MCP server instances for different projects using Docker isolation to avoid conflicts.

## Overview

The recommended approach uses Docker containers with unique configurations for each project. This ensures complete isolation of:
- Port bindings
- Redis databases 
- Log files
- Container names
- Environment variables

## Prerequisites

- Docker and Docker Compose installed
- Zenode source code available
- Each project should have its own `.env` file with API keys

## Step-by-Step Setup

### Step 1: Prepare Project-Specific Configuration

For each project (e.g., `signal-aichat`), create a dedicated directory structure:

```bash
cd /Users/edunc/Documents/gitz/signal-aichat
mkdir zenode-config
```

### Step 2: Create Project-Specific Docker Compose

Create `docker-compose.zenode.yml` in your project root:

```yaml
services:
  zenode-signal:
    build:
      context: /Users/edunc/Documents/gitz/zen-mcp-server/zenode
      dockerfile: Dockerfile
    image: zenode-mcp:signal-aichat
    container_name: zenode-signal-aichat
    restart: unless-stopped
    env_file:
      - .env  # Your project's .env file
    environment:
      - WORKSPACE_ROOT=${HOME}
      - USER_HOME=${HOME}
      - NODE_ENV=production
      - REDIS_URL=redis://redis-signal:6379/0
    volumes:
      # Direct path mapping - container sees same paths as host
      - ${HOME}:${HOME}:ro
      # Project-specific logs
      - zenode-signal-logs:/app/logs
      # Project-specific config
      - ./zenode-config:/app/.zenode:rw
    working_dir: /app
    depends_on:
      redis-signal:
        condition: service_healthy
    command: ["node", "dist/index.js"]
    stdin_open: true
    tty: true
    networks:
      - zenode-signal-network

  redis-signal:
    image: redis:7-alpine
    container_name: zenode-redis-signal
    restart: unless-stopped
    command: redis-server --appendonly yes
    ports:
      - "6381:6379"  # Different port from main zenode (6380)
    volumes:
      - redis-signal-data:/data
    networks:
      - zenode-signal-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  redis-signal-data:
    driver: local
  zenode-signal-logs:
    driver: local

networks:
  zenode-signal-network:
    driver: bridge
```

### Step 3: Create Project-Specific Environment

Copy your API keys to the project's `.env` file:

```bash
cd /Users/edunc/Documents/gitz/signal-aichat
cp /Users/edunc/Documents/gitz/zen-mcp-server/.env .env
# Edit .env if needed for project-specific settings
```

### Step 4: Build and Start the Instance

```bash
# From your project directory
cd /Users/edunc/Documents/gitz/signal-aichat

# Start the zenode instance for this project
docker-compose -f docker-compose.zenode.yml up -d

# Check logs
docker-compose -f docker-compose.zenode.yml logs -f zenode-signal
```

### Step 5: Configure Claude Code to Use Project-Specific Instance

Add to your project's `CLAUDE.md` or `.cursorrules`:

```markdown
# Zenode Configuration
This project uses a dedicated zenode MCP server instance:
- Container: zenode-signal-aichat
- Redis: zenode-redis-signal (port 6381)
- Logs: Available via `docker-compose -f docker-compose.zenode.yml logs zenode-signal`
```

## Managing Multiple Instances

### Start/Stop Instances

```bash
# Start signal-aichat zenode
cd /Users/edunc/Documents/gitz/signal-aichat
docker-compose -f docker-compose.zenode.yml up -d

# Start main zen-mcp-server zenode
cd /Users/edunc/Documents/gitz/zen-mcp-server/zenode
docker-compose up -d

# Stop specific instance
docker-compose -f docker-compose.zenode.yml down
```

### View Logs

```bash
# Signal-aichat logs
docker logs zenode-signal-aichat -f

# Main zenode logs  
docker logs zenode-mcp -f
```

### Monitor Resources

```bash
# Check all zenode containers
docker ps | grep zenode

# Resource usage
docker stats zenode-signal-aichat zenode-mcp
```

## Port Allocation

- **Main zenode**: Redis on 6380
- **Signal-aichat**: Redis on 6381  
- **Future projects**: Use 6382, 6383, etc.

## Key Benefits

1. **Complete Isolation**: Each project has its own Redis, logs, and configuration
2. **No Conflicts**: Different ports and container names prevent clashes
3. **Independent Scaling**: Projects can be started/stopped independently
4. **Security**: Read-only filesystem access with project-specific writable volumes
5. **Path Consistency**: Direct path mapping means no path translation needed

## Troubleshooting

### Port Conflicts
```bash
# Check what's using a port
lsof -i :6381

# Use different port in docker-compose.zenode.yml
```

### Container Name Conflicts
```bash
# Remove existing container
docker rm zenode-signal-aichat

# Rebuild with new name
docker-compose -f docker-compose.zenode.yml up -d
```

### Redis Issues
```bash
# Check Redis connectivity
docker exec zenode-redis-signal redis-cli ping

# Clear Redis data if needed
docker volume rm signal-aichat_redis-signal-data
```

This approach ensures each project gets its own isolated zenode environment while sharing the same codebase and Docker images.