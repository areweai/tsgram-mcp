# Testing Signal AI Chat Bot

This guide covers testing the Signal AI Chat Bot locally and deploying it with Docker containers, including Signal CLI integration.

## Current Implementation Status

### ✅ Working Features
- **MCP Server**: Fully functional with Claude Code integration
- **AI Models**: OpenAI and OpenRouter support
- **CLI Interface**: Complete command-line management
- **Mock Signal Bot**: Simulates Signal message handling
- **Trigger System**: `!openai` and `!openrouter` commands

### 🔧 Setup Required
- **API Keys**: OpenAI or OpenRouter API keys needed for AI functionality
- **Signal Integration**: Currently uses mock implementation (see options below)

## Local Testing

### 1. Quick Start (Mock Mode)

The easiest way to test locally without Signal setup:

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 2. Start the bot in development mode
npm run dev

# 3. In another terminal, test via MCP
# The bot will simulate Signal messages for demonstration
```

**What you'll see:**
- Bot starts and shows available models
- Simulates receiving Signal messages with `!openai` and `!openrouter` triggers
- Demonstrates error handling (API key required for actual responses)

### 2. Testing MCP Integration

With the bot running, test the MCP functionality:

```bash
# List available MCP servers
claude mcp list

# Test in Claude Code
# Ask: "Use the list_ai_models tool"
# Ask: "Use send_signal_message to send 'Hello' to '+1234567890'"
```

## Signal CLI Integration Options

### Option 1: Local signal-cli Installation (Simplest)

**Requirements:**
- Spare phone number for Signal registration
- Java 17+ installed
- SMS access for verification

**Setup:**
```bash
# Install signal-cli (macOS)
brew install signal-cli

# Or download directly
wget https://github.com/AsamK/signal-cli/releases/download/v0.13.3/signal-cli-0.13.3.tar.gz
tar xf signal-cli-0.13.3.tar.gz
export PATH="$PWD/signal-cli-0.13.3/bin:$PATH"

# Register your number (requires SMS verification)
signal-cli -u +1234567890 register

# Verify with SMS code
signal-cli -u +1234567890 verify 123456

# Test sending
signal-cli -u +1234567890 send -m "Test message" +0987654321
```

### Option 2: Docker signal-cli-rest-api (Recommended)

Uses the popular `bbernhard/signal-cli-rest-api` Docker image:

```bash
# Pull the image
docker pull bbernhard/signal-cli-rest-api:latest

# Run with data persistence
docker run -d \
  --name signal-api \
  -p 8080:8080 \
  -v signal-cli-config:/home/.local/share/signal-cli \
  bbernhard/signal-cli-rest-api:latest

# Register phone number via API
curl -X POST \
  "http://localhost:8080/v1/register/+1234567890" \
  -H "Content-Type: application/json" \
  -d '{"use_voice": false}'

# Verify with SMS code
curl -X POST \
  "http://localhost:8080/v1/register/+1234567890/verify/123456"

# Send test message
curl -X POST \
  "http://localhost:8080/v2/send" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "+1234567890",
    "recipients": ["+0987654321"],
    "message": "Hello from Signal API!"
  }'
```

## Docker Deployment

### Local Docker Compose Setup

Create a complete local environment with both Signal API and our bot:

```yaml
# docker-compose.yml
version: '3.8'

services:
  signal-api:
    image: bbernhard/signal-cli-rest-api:latest
    container_name: signal-aichat-api
    ports:
      - "8080:8080"
    volumes:
      - signal-data:/home/.local/share/signal-cli
    environment:
      - MODE=json-rpc
    restart: unless-stopped

  signal-bot:
    build: .
    container_name: signal-aichat-bot
    depends_on:
      - signal-api
    environment:
      - SIGNAL_API_URL=http://signal-api:8080
      - SIGNAL_PHONE_NUMBER=${SIGNAL_PHONE_NUMBER}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - NODE_ENV=production
    volumes:
      - ./config:/app/config
    restart: unless-stopped

volumes:
  signal-data:
```

### Dockerfile for Production

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S signal-bot -u 1001
USER signal-bot

# Expose port (if needed for health checks)
EXPOSE 3000

# Start the bot
CMD ["npm", "start"]
```

### Local Testing with Docker

```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f signal-bot

# Register Signal number (one-time setup)
curl -X POST "http://localhost:8080/v1/register/+1234567890"

# Verify with SMS code
curl -X POST "http://localhost:8080/v1/register/+1234567890/verify/123456"

# Test the complete flow
curl -X POST "http://localhost:8080/v2/send" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "+1234567890", 
    "recipients": ["+1234567890"],
    "message": "!openai Hello, how are you?"
  }'
```

## AWS Fargate Deployment

### Architecture Overview

```
Internet → ALB → Fargate Tasks
                    ├── Signal Bot Container
                    └── Signal CLI Container
```

### ECS Task Definition

```json
{
  "family": "signal-aichat",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::ACCOUNT:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::ACCOUNT:role/signal-aichat-task-role",
  "containerDefinitions": [
    {
      "name": "signal-api",
      "image": "bbernhard/signal-cli-rest-api:latest",
      "portMappings": [
        {
          "containerPort": 8080,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "MODE", "value": "json-rpc"}
      ],
      "mountPoints": [
        {
          "sourceVolume": "signal-data",
          "containerPath": "/home/.local/share/signal-cli"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/signal-aichat",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "signal-api"
        }
      }
    },
    {
      "name": "signal-bot",
      "image": "YOUR_ECR_REPO/signal-aichat:latest",
      "environment": [
        {"name": "SIGNAL_API_URL", "value": "http://localhost:8080"},
        {"name": "NODE_ENV", "value": "production"}
      ],
      "secrets": [
        {
          "name": "SIGNAL_PHONE_NUMBER",
          "valueFrom": "arn:aws:ssm:us-east-1:ACCOUNT:parameter/signal-aichat/phone"
        },
        {
          "name": "OPENAI_API_KEY", 
          "valueFrom": "arn:aws:ssm:us-east-1:ACCOUNT:parameter/signal-aichat/openai-key"
        }
      ],
      "dependsOn": [
        {
          "containerName": "signal-api",
          "condition": "HEALTHY"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/signal-aichat",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "signal-bot"
        }
      }
    }
  ],
  "volumes": [
    {
      "name": "signal-data",
      "host": {}
    }
  ]
}
```

### Deployment Script

```bash
#!/bin/bash
# deploy-fargate.sh

# Variables
AWS_REGION="us-east-1"
ECR_REPO="signal-aichat"
CLUSTER_NAME="signal-aichat-cluster"
SERVICE_NAME="signal-aichat-service"

# Build and push Docker image
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPO.dkr.ecr.$AWS_REGION.amazonaws.com

docker build -t $ECR_REPO .
docker tag $ECR_REPO:latest $ECR_REPO.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest
docker push $ECR_REPO.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:latest

# Update ECS service
aws ecs update-service \
  --cluster $CLUSTER_NAME \
  --service $SERVICE_NAME \
  --force-new-deployment
```

### Required AWS Resources

```bash
# Create ECR repository
aws ecr create-repository --repository-name signal-aichat

# Create ECS cluster
aws ecs create-cluster --cluster-name signal-aichat-cluster --capacity-providers FARGATE

# Create CloudWatch log group
aws logs create-log-group --log-group-name /ecs/signal-aichat

# Store secrets in Parameter Store
aws ssm put-parameter \
  --name "/signal-aichat/phone" \
  --value "+1234567890" \
  --type "SecureString"

aws ssm put-parameter \
  --name "/signal-aichat/openai-key" \
  --value "sk-your-key-here" \
  --type "SecureString"
```

## Signal Registration Requirements

### Phone Number Setup

**You need:**
1. **Dedicated phone number** for the bot (cannot be your personal Signal number)
2. **SMS access** to receive verification codes
3. **Captcha solving** capability (for automated registration)

**Options:**
- **Virtual phone numbers**: Twilio, Google Voice (may not work with Signal)
- **Burner phones**: Dedicated device/SIM card
- **VoIP providers**: Some work, many are blocked by Signal

### Registration Process

```bash
# 1. Initial registration request
curl -X POST "http://localhost:8080/v1/register/+1234567890" \
  -H "Content-Type: application/json" \
  -d '{"use_voice": false, "captcha": "CAPTCHA_TOKEN"}'

# 2. SMS verification (you'll receive a code)
curl -X POST "http://localhost:8080/v1/register/+1234567890/verify/123456"

# 3. Test registration
curl "http://localhost:8080/v1/about/+1234567890"
```

### Important Security Notes

⚠️ **Security Considerations:**
- Signal CLI is **unofficial** and not endorsed by Signal
- Uses reverse-engineered Signal protocol
- May violate Signal's Terms of Service
- Consider security implications for production use
- Signal account may be banned for API usage

## Production Recommendations

### For Production Deployment:

1. **Use ECS Fargate** for scalability and managed infrastructure
2. **Store secrets** in AWS Parameter Store or Secrets Manager
3. **Monitor logs** via CloudWatch
4. **Set up health checks** for both containers
5. **Use persistent storage** for Signal configuration
6. **Implement proper error handling** for Signal API failures
7. **Consider rate limiting** to avoid Signal restrictions

### Alternative Approaches:

1. **Webhook-based**: Receive Signal messages via webhooks instead of polling
2. **Queue-based**: Use SQS for message processing
3. **Serverless**: Lambda functions for message handling
4. **Matrix bridge**: Use Signal-Matrix bridge for easier API access

## Troubleshooting

### Common Issues:

1. **Registration fails**: 
   - Try different phone number provider
   - Solve captcha manually
   - Check Signal's current restrictions

2. **Docker containers not communicating**:
   - Verify network configuration
   - Check container logs
   - Ensure ports are properly exposed

3. **Fargate deployment issues**:
   - Check IAM permissions
   - Verify security groups
   - Monitor CloudWatch logs

4. **Signal API errors**:
   - Check phone number registration status
   - Verify Signal CLI version compatibility
   - Monitor for Signal protocol changes

This setup provides a robust foundation for both local development and production deployment of the Signal AI Chat Bot.