# TSGram MCP 🚀

**Get Claude Code talking to Telegram in 2-3 minutes!**

TSGram MCP connects Claude Code sessions to Telegram, enabling AI-powered code assistance directly in your Telegram chats. Ask questions about your codebase, get AI insights, and even edit files - all from Telegram!

## Quick Start (2-3 Minutes)

### 🤖 AI Agent Enhanced Setup (Recommended!)

Let Claude or your favorite AI assistant handle the entire setup:

1. Clone the repository:
   ```bash
   git clone https://github.com/DDunc/tsgram-mcp.git
   cd tsgram-mcp
   ```

2. From the command line, start Claude:
   ```bash
   claude model --sonnet
   ```

3. Initialize with `/init`

4. Copy and paste this prompt:
   > "This project readme told me that you could help me set up tsgram-mcp for claude code. Do everything from installing node modules to creating and deploying the local docker containers. Finally, when everything is deployed, remind the user how to register a new bot using their telegram account."

The AI will handle all the setup steps for you, including:
- Installing dependencies
- Configuring environment variables
- Building Docker containers
- Starting services
- Guiding you through bot registration

**Alternative: Automated Setup Script**
```bash
# One-line install (macOS/Linux)
curl -sSL https://raw.githubusercontent.com/DDunc/tsgram-mcp/main/setup.sh | bash

# Or if you prefer to review first:
curl -sSL https://raw.githubusercontent.com/DDunc/tsgram-mcp/main/setup.sh > setup.sh
chmod +x setup.sh
./setup.sh
```

### Test Your Bot! 🎉
**IMPORTANT: You will need to message your bot first before it can message you.**

Send your bot a message and ask it something about your local project!

## 🔒 How It Works (All Local)

- Local Docker container runs the Telegram webhook server
- Management UI runs locally
- TSGram MCP server runs locally and connects to Docker
- Your Claude Code or Claude Desktop runs locally and uses MCP tools
- All processing and forwarding happens locally, on your computer
- Create and delete bots in-app through Telegram
- The only external calls are to Telegram API and AI models selected from your approved model list

**⚠️ Security Note**: TSGram has basic safeguards to not list, preview, or serve .env files but it is still strongly recommended that you do not use TSGram for anything highly sensitive as third party servers are part of the transport layer.

## 📋 You Will Need

- Docker Desktop
- Telegram on a phone
- Claude Desktop or Claude Code (CLI)
- An OpenRouter API key (We recommend creating a new API key with a $1.00 limit. Trust, but limit!)
- Chrome (Optional but highly recommended for local management UI)

## Manual Setup Steps

### 1. Get Your Bot Token
1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow prompts
3. Copy your bot token
4. Get your Telegram user ID: Message [@userinfobot](https://t.me/userinfobot)

### 2. Configure Environment
Edit `.env` with your values:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
AUTHORIZED_USER=your_telegram_username
AUTHORIZED_CHAT_ID=your_telegram_user_id

# Choose ONE AI provider:
OPENROUTER_API_KEY=your_openrouter_key  # For Claude (recommended with $1 limit)
# OR
OPENAI_API_KEY=your_openai_key         # For GPT-4
```

### 3. Start TSGram
```bash
npm install
npm run docker:build
npm run docker:start
```

## 🎯 Key Features

- **"Stop" and "Start" commands** in TSGram bot chat provide convenient output control
- **Select subset of unix commands supported** (`:h ls` or `:h cat $FILE`)
- **Opt-in edit mode** for vibe coding and debugging on the go (`:dangerzone` to enable)
- **AI-Powered Responses**: Uses Claude 3.5 Sonnet or GPT-4
- **Code Understanding**: Reads and analyzes your entire codebase
- **Web Dashboard**: Monitor bots at http://localhost:3000

## 💬 Bot Commands

- **Regular messages**: Get AI responses about your code
- **`:h`** - Show help and available commands
- **`:h ls [path]`** - List files in directory
- **`:h cat filename`** - View file contents
- **`:dangerzone`** - Enable file editing (careful!)
- **`:safetyzone`** - Disable file editing
- **`stop`** - Pause bot responses
- **`start`** - Resume bot responses

## 🛠️ Common Commands

```bash
# View logs
npm run docker:logs

# Check health
npm run docker:health

# Stop services
npm run docker:stop

# Rebuild after changes
npm run docker:rebuild

# Access dashboard (Chrome recommended)
npm run dashboard
```

## 📜 Useful Scripts

The project includes several helper scripts in the `scripts/` directory:

**Setup & Configuration**
- `setup.sh` - Automated install script (can be run via curl)
- `configure-mcp.sh` - Configure MCP settings for Claude Desktop/Code
- `fix-permissions.sh` - Fix file permissions if needed

**Updates & Maintenance**
- `update-system.sh` - Update TSGram to latest version
- `update-ai-context.sh` - Update AI context files

**Testing & Debugging**
- `test-api-keys.sh` - Verify your API keys are working
- `test-docker-setup.sh` - Test Docker configuration

Run any script with:
```bash
./scripts/script-name.sh
# or
npm run script-name  # for npm-wrapped scripts
```

## 🔧 Advanced Setup

### Using with Claude Code
Add to your Claude Code MCP settings:
```json
{
  "tsgram": {
    "command": "docker",
    "args": ["exec", "-i", "tsgram-mcp-workspace", "npx", "tsx", "src/mcp-server.ts"],
    "env": {
      "TELEGRAM_BOT_TOKEN": "your_token",
      "AUTHORIZED_CHAT_ID": "your_chat_id"
    }
  }
}
```

### CLI-to-Telegram Bridge
Forward Claude Code CLI responses to Telegram:
```bash
# Setup global command
sudo npm run setup

# Use instead of 'claude'
claude-tg "analyze this codebase"
```

## 🚨 Troubleshooting

**Bot not responding?**
```bash
# Check if services are running
npm run docker:health

# View logs for errors
npm run docker:logs
```

**Can't connect to bot?**
1. Verify bot token in `.env`
2. Check your username/chat ID
3. Make sure you messaged the bot first

**File edits not working?**
- Type `:dangerzone` to enable (one-time)
- Check logs for permission errors
- Ensure Docker has file access

## 📚 Project Structure

```
tsgram/
├── src/
│   ├── telegram-bot-ai-powered.ts    # Main bot logic
│   ├── telegram-mcp-webhook-server.ts # MCP integration
│   └── models/                        # AI providers
├── docker-compose.tsgram-workspace.yml # Main Docker config
├── .env.example                       # Environment template
└── data/                             # Persistent storage
```

## 🤝 Contributing

PRs welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests if applicable
4. Submit a pull request

## 📄 License

MIT - Feel free to use in your own projects!

---

**Need help?** Open an issue on GitHub or message your bot with questions!