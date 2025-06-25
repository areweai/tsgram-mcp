# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TSGram is a TypeScript/Node.js system that enables communication between Claude Code sessions and Telegram. It includes a Telegram bot with automatic AI responses, MCP server for Claude Code integration, and CLI-to-Telegram forwarding capabilities. The system runs in Docker containers and provides secure, filtered communication between Claude Code CLI and Telegram.

## Architecture

### Core Components

#### Telegram System (Primary)
- **src/telegram-mcp-webhook-server.ts**: Main Telegram MCP server with AI auto-responses
- **src/telegram/bot-client.ts**: Telegram Bot API client implementation
- **src/types/telegram.ts**: Telegram-specific type definitions
- **src/mcp-docker-proxy.ts**: MCP proxy for Claude Code → Docker communication

#### CLI-to-Telegram Bridge
- **src/cli-telegram-bridge.ts**: Secure CLI response forwarding to Telegram
- **claude-with-telegram.sh**: Bash wrapper for Claude Code CLI
- **claude-tg**: Global command (symlinked to `/usr/local/bin/claude-tg`)

#### Signal System (Archived)
- Moved to `/signal/` directory due to platform limitations
- See `/signal/BLOCKED_UNTIL_SIGNAL_FIXES_MANUAL_QR.md` for details

#### Shared Components
- **src/models/**: AI model implementations
  - `ChatModel.ts`: Factory class for AI model instances
  - `OpenAIAPI.ts`, `OpenRouterAPI.ts`: Model-specific implementations
- **src/utils/ChatHistory.ts`: Conversation history management
- **src/types/**: TypeScript type definitions

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
- **Chat ID**: Configured via `AUTHORIZED_CHAT_ID` environment variable
- **Format**: Professional MCP-branded messages

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

### Telegram System

```bash
# Start Telegram MCP server in Docker
docker-compose -f docker-compose.tsgram.yml up -d

# Check Docker container status
docker ps --filter name=tsgram
docker logs tsgram-mcp-workspace

# Test CLI forwarding
npm run cli-bridge test
echo "Test message" | npm run cli-bridge

# Health check
curl http://localhost:4040/health
```

### Setup and Build
```bash
npm install                    # Install dependencies
npm run build                 # Build TypeScript to JavaScript
npm run type-check            # TypeScript type checking
npm run lint                  # Lint code with ESLint
```

### Running the Bot
```bash
npm run dev                   # Development mode with hot reload
npm start                     # Production mode
npx tsgram start              # CLI command
```

### CLI Commands
```bash
npx tsgram init               # Initialize configuration
npx tsgram models             # List available models
npx tsgram test -m gpt -t "Hello"  # Test model
npx tsgram mcp                # Start MCP server
```

### Testing
```bash
npm test                      # Run Jest tests
npm run test:watch           # Run tests in watch mode
```

### Docker Development
```bash
docker build -t tsgram:latest -f Dockerfile.tsgram-workspace .
docker-compose -f docker-compose.tsgram-workspace.yml up -d
```

## Configuration

### Environment Variables (.env file)

- `TELEGRAM_BOT_TOKEN`: Bot token from BotFather
- `AUTHORIZED_USER`: Telegram username authorized to use bot
- `AUTHORIZED_CHAT_ID`: Telegram chat ID for bot communication
- `DISABLED_MODELS`: Comma-separated list of models to disable
- `DEFAULT_MODEL`: Model to use when no trigger is specified
- `OPENAI_API_KEY`: OpenAI API key for GPT models
- `OPENAI_API_BASE`: Custom OpenAI API base URL (optional)
- `OPENAI_MODEL`: OpenAI model to use (default: gpt-4-turbo-preview)
- `OPENROUTER_API_KEY`: OpenRouter API key for Claude access
- `MCP_SERVER_NAME`: MCP server name (default: tsgram)
- `MCP_SERVER_VERSION`: MCP server version (default: 1.0.0)
- `NODE_ENV`: Environment (development/production)
- `LOG_LEVEL`: Logging level (info/debug/error)

### Configuration Files

- `config/bing.json`: Microsoft Bing chat cookies (optional)
- `config/hugchat.json`: HugChat authentication cookies
- `.env.example`: Template for environment variables

## Key Dependencies

### Runtime Dependencies
- `@modelcontextprotocol/sdk`: MCP server implementation
- `telegraf`: Telegram Bot API framework
- `commander`: CLI framework
- `dotenv`: Environment variable management
- `openai`: OpenAI API client
- `zod`: Schema validation
- `axios`: HTTP client for API calls

### Development Dependencies
- `typescript`: TypeScript compiler
- `tsx`: TypeScript execution for development
- `eslint`: Code linting
- `jest`: Testing framework
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

## Common Development Tasks

### Adding a New CLI Command
1. Add command definition in `src/cli.ts`
2. Implement command handler function
3. Add help text and options
4. Update README documentation

### Extending MCP Server Functionality
1. Add new tool/resource/prompt to `src/mcp-server.ts`
2. Implement handler methods
3. Update schema definitions
4. Test with Claude Code integration

### Environment Setup
1. Copy `.env.example` to `.env`
2. Configure required API keys and settings
3. Run `npx tsgram init` to create config files
4. Test with `npx tsgram models`

## Type Safety and Code Quality

- All code uses strict TypeScript with comprehensive type definitions
- ESLint configuration enforces consistent code style
- Jest tests provide code coverage and validation
- Zod schemas validate runtime data structures

The project emphasizes type safety, modularity, and clear separation of concerns between Telegram messaging, AI model integration, CLI functionality, and MCP server capabilities.

## Docker Development Memories

- **Docker Rebuild Command**: When making changes, force a complete rebuild:
  ```
  . Let me force a rebuild:
  ⏺ Bash(docker-compose -f docker-compose.tsgram-workspace.yml down && docker build -t tsgram:latest -f Dockerfile.tsgram-workspace . --no-cache && docker-…)
  Do this whenever you have made changes!
  ```