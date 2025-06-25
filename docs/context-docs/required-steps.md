# Required Steps for Telegram MCP Integration

This document outlines the essential steps to integrate Telegram bots with Claude Code via MCP (Model Context Protocol).

## 🎯 What This Does

- **Telegram Bot Management** via Claude Code
- **Send/receive messages** through Telegram bots
- **Channel management** and posting
- **Web UI** for bot administration

## 📋 Required Steps

### 1. Get Telegram Bot Token

1. Open Telegram and message `@BotFather`
2. Create a new bot:
   ```
   /newbot
   ```
3. Follow prompts to name your bot
4. **Save the bot token** - looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

### 2. Environment Setup

Create `.env` file in project root:

```env
# Required for Telegram integration
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_FROM_BOTFATHER

# MCP Server settings
MCP_SERVER_NAME=telegram-mcp-server
MCP_SERVER_VERSION=1.0.0

# Development
NODE_ENV=development
```

### 3. Install and Build

```bash
# Install dependencies
npm install

# Initialize config
npm run init

# Test your bot token
npx telegram-mcp test-bot -t "YOUR_BOT_TOKEN"
```

### 4. Claude Code Integration

Add to your Claude Desktop config file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "telegram-mcp": {
      "command": "tsx",
      "args": ["src/mcp-server.ts"],
      "cwd": "/path/to/your/telegram-mcp-project"
    }
  }
}
```

### 5. Start the Server

```bash
# Development mode (includes web UI)
npm run dev

# Production mode (MCP only)
npm start
```

## 🧪 Testing

### Test Bot Connection
```bash
npx telegram-mcp test-bot -t "YOUR_TOKEN"
```

### Test in Claude Code
1. Restart Claude Code
2. Look for Telegram tools in the sidebar
3. Try: "Create a new Telegram bot"
4. Try: "List my configured bots"

### Test Web Interface
```bash
npm run web
# Opens at http://localhost:3000
```

## 🔧 Available Tools in Claude Code

Once integrated, you'll have these tools:

- `create_bot` - Create new Telegram bot instance
- `list_bots` - Show all configured bots
- `send_message` - Send messages to chats/channels
- `send_photo` - Send photos to chats/channels
- `send_video` - Send videos to chats/channels
- `get_chat_info` - Get channel/chat information
- `set_chat_title` - Change channel/chat titles
- `pin_message` - Pin messages in channels
- `get_chat_history` - Retrieve recent messages
- `open_management_ui` - Open web management interface

## 🚨 Common Issues

**Bot token invalid:** 
- Check format: numbers:letters (no spaces)
- Verify with @BotFather using `/token`

**Claude Code not showing tools:**
- Check config file path is correct
- Restart Claude Code after config changes
- Verify `tsx` and `node` are in PATH

**Permission errors:**
- Bot needs admin rights in channels/groups
- Use `/setprivacy` with @BotFather to disable privacy mode

## 📱 Getting Chat IDs

To send messages, you need chat IDs:

**For private chats:** User's Telegram ID
**For groups:** Negative number (like `-123456789`)
**For channels:** Channel username (`@channelname`) or ID

Get IDs by:
1. Adding bot to chat/channel as admin
2. Using `get_chat_info` tool in Claude Code
3. Or check bot logs when someone messages it

## ✅ Verification

You know it's working when:
- [ ] `telegram-mcp test-bot` succeeds
- [ ] Claude Code shows Telegram tools
- [ ] Can create bots via Claude Code
- [ ] Can send test messages
- [ ] Web UI loads at localhost:3000

That's it! No weather APIs, no external databases, just Telegram + Claude Code integration.