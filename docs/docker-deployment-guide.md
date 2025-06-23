# Docker Deployment Guide

## Overview
Complete Docker deployment setup with separate configurations for local development (Apple Silicon) and remote production (Linux servers).

## 🏗️ Architecture

### Local Development (Apple Silicon)
- **Platform**: `linux/arm64`
- **Target**: Development and testing
- **Features**: Hot reload, debugger, Redis cache
- **Services**: signal-cli-local, signal-bot-local, redis-local

### Remote Production (Linux)
- **Platform**: `linux/amd64`
- **Target**: Production deployment
- **Features**: Nginx proxy, SSL, systemd service
- **Services**: signal-cli-remote, signal-bot-remote, nginx-remote

## 📋 Prerequisites

### System Requirements
- **Docker 20.10+** with Compose V2
- **Node.js 22+** (inside containers)
- **Java 21+** (for signal-cli, included in images)
- **Environment variables** configured in `.env`

### Required API Keys
```env
OPENAI_API_KEY=sk-proj-...
OPENROUTER_API_KEY=sk-or-v1-...
SIGNAL_PHONE_NUMBER=+1234567890
DEFAULT_MODEL=openrouter
```

## 🚀 Quick Start

### 1. Verify Setup
```bash
./scripts/test-docker-setup.sh
```

### 2. Local Development
```bash
# Deploy locally (Apple Silicon)
./scripts/deploy-local.sh

# View status
./scripts/deploy-local.sh status

# View logs
./scripts/deploy-local.sh logs signal-bot-local

# Test connectivity
./scripts/test-network.sh local
```

### 3. Remote Production
```bash
# Deploy to production (Linux)
./scripts/deploy-remote.sh

# Check status
./scripts/deploy-remote.sh status

# Test connectivity
./scripts/test-network.sh remote
```

## 📁 File Structure

```
signal-aichat/
├── docker-compose.local.yml    # Apple Silicon development
├── docker-compose.remote.yml   # Linux production
├── Dockerfile.local            # Development image
├── Dockerfile.remote           # Production image
├── scripts/
│   ├── deploy-local.sh         # Local deployment
│   ├── deploy-remote.sh        # Remote deployment
│   ├── test-network.sh         # Network tests
│   └── test-docker-setup.sh    # Setup verification
└── nginx/
    ├── nginx.conf              # Production proxy config
    └── ssl/                    # SSL certificates
```

## 🔧 Configuration Details

### Local Configuration (`docker-compose.local.yml`)
```yaml
services:
  signal-cli-local:
    platform: linux/arm64
    ports: ["8080:8080"]
    
  signal-bot-local:
    platform: linux/arm64
    ports: ["3000:3000", "8081:8081", "9229:9229"]
    volumes: [".:/app:cached"]  # Hot reload
    
  redis-local:
    platform: linux/arm64
    ports: ["6379:6379"]
```

### Remote Configuration (`docker-compose.remote.yml`)
```yaml
services:
  signal-cli-remote:
    platform: linux/amd64
    ports: ["8080:8080"]
    
  signal-bot-remote:
    platform: linux/amd64
    ports: ["3000:3000", "8081:8081"]
    
  nginx-remote:
    ports: ["80:80", "443:443"]
    # SSL termination and reverse proxy
```

## 🧪 Testing & Verification

### Network Connectivity Tests
```bash
# Test local setup
./scripts/test-network.sh local

# Test remote setup
./scripts/test-network.sh remote

# Test both configurations
./scripts/test-network.sh both
```

### Manual Testing
```bash
# Health checks
curl http://localhost:8081/health
curl http://localhost:8080/v1/health

# API endpoints
curl http://localhost:8081/api/models
curl -X POST http://localhost:8081/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "model": "openai"}'
```

## 🔍 Monitoring & Logs

### View Logs
```bash
# All services
docker compose -f docker-compose.local.yml logs -f

# Specific service
docker compose -f docker-compose.local.yml logs -f signal-bot-local

# Follow logs with deployment script
./scripts/deploy-local.sh logs signal-bot-local
```

### Container Status
```bash
# View running containers
docker compose -f docker-compose.local.yml ps

# Check health status
docker inspect --format='{{.State.Health.Status}}' signal-cli-local
```

## 🐛 Troubleshooting

### Common Issues

**Docker daemon not running:**
```bash
# macOS
open -a Docker

# Linux
sudo systemctl start docker
```

**Port conflicts:**
```bash
# Check port usage
lsof -i :8080
lsof -i :3000

# Stop conflicting services
./scripts/deploy-local.sh stop
```

**Image pull failures:**
```bash
# Check connectivity
ping docker.io

# Manual pull
docker pull bbernhard/signal-cli-rest-api:latest
```

**Java version issues:**
```bash
# Verify Java in container
docker run --rm node:22-alpine sh -c "apk add openjdk21-jre && java -version"
```

### Signal CLI Issues

**Registration problems:**
```bash
# Check Signal CLI logs
docker compose -f docker-compose.local.yml logs signal-cli-local

# Manual registration via API
curl -X POST http://localhost:8080/v1/register
```

**Device linking:**
```bash
# Generate QR code for linking
curl -X POST "http://localhost:8080/v1/register" \
  -H "Content-Type: application/json" \
  -d '{"use_voice": false}'
```

## 🔒 Security Considerations

### Production Security
- **SSL certificates**: Auto-generated self-signed (replace with real certs)
- **Firewall rules**: Restrict MCP server access to internal networks
- **API rate limiting**: Configured in nginx (10 req/s)
- **Container isolation**: Non-root user in production images

### Environment Variables
```bash
# Secure environment file permissions
chmod 600 .env

# Use Docker secrets in production
docker secret create openai_key ./openai_key.txt
```

## 📊 Performance Tuning

### Resource Limits
```yaml
# Add to docker-compose files
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '0.5'
```

### Java Memory Settings
```yaml
environment:
  - JAVA_OPTS=-Xmx512m -Xms256m  # Signal CLI
  - NODE_OPTIONS=--max-old-space-size=512  # Node.js
```

## 🚀 Production Deployment

### Prerequisites
1. **Linux server** with Docker installed
2. **Domain name** and SSL certificates
3. **Environment variables** configured
4. **Signal phone number** registered

### Deployment Steps
```bash
# 1. Clone repository
git clone <repository> && cd signal-aichat

# 2. Configure environment
cp .env.example .env
# Edit .env with production values

# 3. Deploy
./scripts/deploy-remote.sh

# 4. Verify
./scripts/test-network.sh remote
```

### Systemd Integration
```bash
# Enable auto-start
sudo systemctl enable signal-aichat.service

# Manual control
sudo systemctl start signal-aichat.service
sudo systemctl stop signal-aichat.service
sudo systemctl restart signal-aichat.service
```

## 📈 Scaling Considerations

### Horizontal Scaling
- **Load balancer**: Add multiple bot instances behind nginx
- **Shared storage**: Use external volumes for signal-cli data
- **Database**: Add PostgreSQL for conversation history
- **Message queue**: Add Redis for job processing

### Monitoring
- **Health checks**: Built into all services
- **Metrics**: Add Prometheus/Grafana
- **Logging**: Centralized with ELK stack
- **Alerts**: Configure based on health check failures

## 🔄 CI/CD Integration

### GitHub Actions Example
```yaml
name: Deploy Signal AI Chat
on:
  push:
    branches: [main]
    
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: ./scripts/deploy-remote.sh
```

## 🆘 Support

### Quick Commands
```bash
# Complete reset
./scripts/deploy-local.sh clean

# View all available commands
./scripts/deploy-local.sh help
./scripts/deploy-remote.sh help

# Emergency stop
docker compose -f docker-compose.local.yml down
```

### Status Summary
- ✅ **Local development**: Ready for Apple Silicon
- ✅ **Remote production**: Ready for Linux servers
- ✅ **Network testing**: Comprehensive test suite
- ✅ **Deployment scripts**: Automated deployment
- ✅ **Signal integration**: Docker-based signal-cli
- ✅ **Java 21+ support**: Included in all images