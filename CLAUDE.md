# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TSGram MCP (`tsgram-mcp`) is a TypeScript/Node.js system that enables communication between Claude Code sessions and Telegram. It includes a Telegram bot with automatic AI responses, MCP server for Claude Code integration, and CLI-to-Telegram forwarding capabilities. The system runs in Docker containers and provides secure, filtered communication between Claude Code CLI and Telegram.

**Note**: The repository name `signal-aichat` reflects the project's original scope that included Signal integration, but Signal functionality has been archived due to platform limitations.

## Architecture

### Core Components

#### Telegram System (Primary)
- **src/telegram-mcp-webhook-server.ts**: Main Telegram MCP server with AI auto-responses
- **src/telegram-bot-ai-powered.ts**: Main AI-powered Telegram bot (deployed in Docker)
- **src/telegram/bot-client.ts**: Telegram Bot API client implementation
- **src/types/telegram.ts**: Telegram-specific type definitions
- **src/mcp-docker-proxy.ts**: MCP proxy for Claude Code → Docker communication

#### Bridge System
- **src/cli-telegram-bridge.ts**: Secure CLI response forwarding to Telegram
- **src/telegram-to-claude-bridge.ts**: Bridge for Telegram messages to Claude
- **src/telegram-claude-queue.ts**: Queue management for Telegram-Claude communication
- **claude-with-telegram.sh**: Bash wrapper for Claude Code CLI
- **claude-tg**: Global command (symlinked to `/usr/local/bin/claude-tg`)

#### Development Dashboard
- **src/spa/**: React-based web dashboard (runs on port 3000)
- **vite.spa.config.ts**: Dashboard build configuration
- Real-time monitoring of bots and services

#### Signal System (Archived)
- See `/docs/signal/BLOCKED_UNTIL_SIGNAL_FIXES_MANUAL_QR.md` for details
- Signal integration abandoned due to platform limitations

#### Shared Components
- **src/models/**: AI model implementations
  - `ChatModel.ts`: Factory class for AI model instances
  - `OpenAIAPI.ts`, `OpenRouterAPI.ts`: Model-specific implementations
- **src/utils/ChatHistory.ts**: Conversation history management
- **src/types/**: TypeScript type definitions
- **scripts/**: Deployment and testing automation scripts

### Message Flow

1. Telegram message received → `handleUpdate()` in bot
2. Check for `:h` commands or process with AI
3. Execute workspace commands or generate AI response
4. Return formatted response to Telegram chat

### Model Integration

Each AI model implements the `AIModelAPI` interface with a unified `send()` method. Models are dynamically loaded based on environment configuration and available credentials.

## CLI-to-Telegram Forwarding

### Global Command Setup

**IMPORTANT: The global `claude-tg` command has been installed:**
```bash
# This was executed by the user during setup:
sudo ln -sf /Users/edunc/Documents/gitz/tsgram-mcp/claude-tg /usr/local/bin/claude-tg
```

### Usage

Instead of using `claude` directly, use `claude-tg` to forward responses to Telegram:

```bash
# Normal Claude Code usage:
claude "What's the weather?"

# With Telegram forwarding (recommended):
claude-tg "What's the weather?"
claude-tg mcp list
claude-tg --help
```

### Security Filtering

All CLI responses are automatically filtered to remove:
- API keys (`sk-`, `pk-`, tokens, `OPENROUTER_API_KEY`, etc.)
- Environment variables (`API_KEY=`, `TOKEN=`, `SECRET=`)
- Database URLs (`postgres://`, `mysql://`, `mongodb://`)
- File paths containing sensitive info (`.env` files)
- Telegram bot tokens (`TELEGRAM_BOT_TOKEN`)

### Target Configuration

Responses are sent to:
- **Chat ID**: Configured via `AUTHORIZED_CHAT_ID` environment variable (numeric user ID from @userinfobot)
- **Format**: Professional MCP-branded messages
- **Security**: Uses numeric user ID instead of username for authorization (more secure)

### Integration with Claude Code

**For manual CLI forwarding**, users can replace `claude` with `claude-tg`:
```bash
# Instead of:
claude "analyze this codebase"

# Use:
claude-tg "analyze this codebase"
```

**For automated forwarding from Claude Code sessions**, the system is ready but would require Claude Code to use the `claude-tg` wrapper instead of the direct `claude` command. This allows all Claude Code CLI responses to be automatically forwarded to Telegram with security filtering.

## Development Commands

### Docker Deployment (Primary)

```bash
# Build and start main services
npm run docker:build
npm run docker:start

# Check service status
npm run docker:health
docker ps --filter name=tsgram

# View logs
npm run docker:logs

# Stop services
npm run docker:stop

# Rebuild after changes
npm run docker:rebuild
```

### Development Services

```bash
# Start web dashboard
npm run dashboard            # Runs on http://localhost:3000

# Start individual services
npm run mcp                  # MCP server (port 4040)
npm run cli-bridge          # CLI-to-Telegram bridge
npm run tg-claude-bridge     # Telegram-to-Claude bridge
npm run telegram-queue       # Queue management

# Health checks
npm run health-check         # Check ports 4040 and 4041
curl http://localhost:4040/health
```

### Build and Testing

```bash
# Install and build
npm install                    # Install dependencies
npm run build                 # Build all components
npm run build:mcp             # Build MCP server only
npm run build:spa             # Build dashboard only

# Type checking and linting
npm run type-check            # TypeScript type checking
npm run lint                  # Lint code with ESLint
npm run lint:fix              # Auto-fix linting issues

# Testing
npm test                      # Run Vitest tests
npm run test:ui               # Run tests with UI
```

### Setup and Configuration

```bash
# Initial setup
npm run setup                 # Run setup script
npm run setup:interactive     # Interactive setup

# MCP configuration for Claude Code/Desktop
npm run mcp:configure         # Configure MCP settings
npm run mcp:test              # Test MCP connection
npm run mcp:status            # Check MCP status

# Maintenance
npm run fix-permissions       # Fix file permissions
npm run update                # Update system
npm run update-context        # Update AI context files
```

## Configuration

### Environment Variables (.env file)

**Required:**
- `TELEGRAM_BOT_TOKEN`: Bot token from @BotFather
- `AUTHORIZED_CHAT_ID`: **Your Numeric user ID** from [@userBotInfoBot](https://t.me/userbotinfobot)

**AI Provider (choose one):**
- `OPENROUTER_API_KEY`: OpenRouter API key for multi-model access (recommended)
- `OPENAI_API_KEY`: OpenAI API key for GPT models (optional)

**Optional:**
- `DISABLED_MODELS`: Comma-separated list of models to disable
- `DEFAULT_MODEL`: Model to use when no trigger is specified
- `OPENAI_API_BASE`: Custom OpenAI API base URL
- `OPENAI_MODEL`: OpenAI model to use (default: gpt-4-turbo-preview)
- `MCP_SERVER_NAME`: MCP server name (default: tsgram)
- `MCP_SERVER_VERSION`: MCP server version (default: 1.0.0)
- `NODE_ENV`: Environment (development/production)
- `LOG_LEVEL`: Logging level (info/debug/error)

**Security Note**: `AUTHORIZED_CHAT_ID` must be a numeric user ID (not username) for security. Get it from [@userBotInfoBot](https://t.me/userbotinfobot) on Telegram.

### Configuration Files

- `config/bing.json`: Microsoft Bing chat cookies (optional)
- `config/hugchat.json`: HugChat authentication cookies
- `.env.example`: Template for environment variables

## Key Dependencies

### Runtime Dependencies
- `@modelcontextprotocol/sdk`: MCP server implementation
- `telegraf`: Telegram Bot API framework
- `react` + `react-dom`: Dashboard web interface
- `@tanstack/react-router`: Dashboard routing
- `commander`: CLI framework
- `dotenv`: Environment variable management
- `openai`: OpenAI API client
- `zod`: Schema validation
- `axios`: HTTP client for API calls
- `express`: Web server for health checks and webhooks
- `ws`: WebSocket support

### Development Dependencies
- `typescript`: TypeScript compiler
- `tsx`: TypeScript execution for development
- `vite`: Build tool and dev server
- `@vitejs/plugin-react`: React plugin for Vite
- `eslint`: Code linting
- `vitest`: Testing framework (replaces Jest)
- `tailwindcss`: CSS framework for dashboard
- `@types/node`: Node.js type definitions

## MCP Server Integration

The MCP server provides Claude Code with access to workspace files and Telegram bot functionality:

### Available Tools (via mcp-docker-proxy.ts)
**Workspace Tools:**
- `list_workspaces`: List available project workspaces
- `read_file`: Read file contents from workspace
- `write_file`: Write or create files in workspace
- `execute_command`: Run shell commands in workspace
- `sync_from_local`: Sync files from local to Docker
- `sync_to_local`: Sync files from Docker to local
- `edit_file`: Edit files with auto-sync

**Telegram Bot Tools (via mcp-server.ts):**
- `create_bot`: Create new Telegram bot instance
- `list_bots`: List all configured bots
- `get_bot_info`: Get bot information
- `send_message`: Send text message via bot
- `send_photo`: Send photo via bot
- `send_video`: Send video via bot

### Available Resources
- `workspace://files`: Browse workspace files
- `workspace://commands`: Available workspace commands

## Adding New AI Models

1. Add model name to `SUPPORTED_MODELS` array in `src/types/index.ts`
2. Create new API class implementing `AIModelAPI` interface
3. Add model initialization logic in `ChatModel.createAPI()` method
4. Handle any required configuration/authentication
5. Update environment variable documentation
6. Add model-specific tests

## Docker Architecture

The system runs in a multi-service Docker environment:

### Main Services
- **Port 4040**: MCP server (telegram-mcp-webhook-server)
- **Port 4041**: Webhook server 
- **Port 873**: Rsync server for file synchronization
- **Port 3000**: Web dashboard (React SPA)

### Workspace Integration
- Docker container mounts workspace directories
- Real-time file sync between host and container via rsync
- Multi-project support with workspace switching
- Security filtering prevents access to sensitive files

### Deployment Lifecycle
1. `npm run docker:build` - Build container with latest code
2. `npm run docker:start` - Start all services via docker-compose
3. `npm run docker:health` - Verify services are running
4. `npm run dashboard` - Access web monitoring interface

## Key Development Patterns

### Authentication System
- Uses numeric user IDs (`AUTHORIZED_CHAT_ID`) instead of usernames for security
- User IDs are immutable while usernames can change
- Authorization checks are centralized and consistent across all bot implementations

### Message Handling
- All Telegram bots implement loop prevention (ignore bot messages, track message IDs)
- Structured command system with `:h` prefix for workspace commands
- Error handling with user-friendly messages

### File Operations
- Security filtering prevents access to sensitive files (`.env`, etc.)
- Path validation prevents directory traversal attacks
- File operations are logged and can be monitored via dashboard

### Type Safety and Code Quality
- Strict TypeScript with comprehensive type definitions
- ESLint configuration enforces consistent code style
- Vitest tests provide code coverage and validation
- Zod schemas validate runtime data structures
- React dashboard uses modern TypeScript patterns

The project emphasizes type safety, modularity, and clear separation of concerns between Telegram messaging, AI model integration, CLI functionality, and MCP server capabilities.