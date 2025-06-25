# Getting Started with Signal AI Chat Bot

This guide walks you through everything you need to know to set up and run your own Signal AI Chat Bot that integrates with multiple AI providers (OpenAI and OpenRouter).

## What This Project Does

The Signal AI Chat Bot allows you to:
- Send messages to a Signal phone number and get AI responses
- Use different AI models with trigger commands like `!openai` or `!openrouter`
- Deploy as a standalone service or integrate with Claude Code via MCP (Model Context Protocol)
- Run locally for development or deploy to production on AWS Fargate

## Prerequisites: What You Need Before Starting

### 1. Development Environment
- **Node.js 18+**: Download from [nodejs.org](https://nodejs.org/)
- **Git**: For cloning the repository
- **Text Editor**: VS Code, Vim, or your preferred editor
- **Terminal/Command Line**: Basic familiarity required

### 2. API Keys (Required)
You need at least one of these AI provider API keys:

**OpenAI API Key** (Recommended)
- Visit: https://platform.openai.com/api-keys
- Create an account and add billing information
- Generate a new API key (starts with `sk-proj-...`)
- Cost: Pay-per-use (typically $0.03-$0.06 per 1K tokens)

**OpenRouter API Key** (Alternative/Additional)
- Visit: https://openrouter.ai/keys
- Create an account and set up billing
- Generate an API key (starts with `sk-or-v1-...`)
- Cost: Varies by model, often competitive pricing

### 3. Signal Registration Requirements

This is the most complex part. You need:

**A Dedicated Phone Number**
- **Cannot use your personal Signal number**
- Options:
  - **Burner phone/SIM card** (most reliable)
  - **Google Voice number** (may work, sometimes blocked)
  - **Twilio phone number** (often blocked by Signal)
  - **Secondary phone line** (if available)

**SMS Access**
- Ability to receive SMS verification codes
- Will be needed during the registration process

**Important Signal Limitations:**
- Signal doesn't have an official API
- We use `signal-cli` (unofficial, reverse-engineered)
- May violate Signal's Terms of Service
- Account could be banned for API usage
- Consider these risks for production use

## Step-by-Step Setup

### Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/cycneuramus/signal-aichat.git
cd signal-aichat

# Install dependencies
npm install

# Initialize configuration
npm run cli -- init
```

### Step 2: Configure API Keys

```bash
# Copy the example environment file
cp .env.example .env

# Edit with your actual API keys
nano .env  # or use your preferred editor
```

Update these variables in `.env`:
```env
# Use your actual phone number (format: +1234567890)
SIGNAL_PHONE_NUMBER=+1234567890

# Add your OpenAI API key
OPENAI_API_KEY=sk-proj-your-actual-openai-key-here

# Add your OpenRouter API key (optional)
OPENROUTER_API_KEY=sk-or-v1-your-actual-openrouter-key-here

# Choose default model (openai or openrouter)
DEFAULT_MODEL=openai
```

### Step 3: Test Your Configuration

```bash
# Verify API keys work
./scripts/test-api-keys.sh

# Test individual models
npm run cli -- test -m openai -t "Hello! Are you working?"
npm run cli -- test -m openrouter -t "Hello! Are you working?"

# List available models
npm run cli -- models
```

### Step 4: Choose Your Signal Setup Method

You have three options for Signal integration:

#### Option A: Mock Mode (Easiest - No Signal Required)
Perfect for testing the AI functionality without Signal setup:

```bash
# Start in development mode (includes mock Signal messages)
npm run dev
```

This will:
- Start the bot without real Signal integration
- Simulate Signal messages for demonstration
- Let you test the AI responses and MCP integration
- Show you how the bot would work with real Signal

#### Option B: Local Signal CLI (Real Signal Integration)
For actual Signal messaging:

```bash
# Install signal-cli (macOS with Homebrew)
brew install signal-cli

# Register your dedicated phone number
signal-cli -u +1234567890 register

# Verify with SMS code (check your phone)
signal-cli -u +1234567890 verify 123456

# Test sending a message
signal-cli -u +1234567890 send -m "Test message" +0987654321

# Start the bot (you'll need to modify the Signal integration)
npm start
```

#### Option C: Docker with Signal API (Recommended for Production)
Uses a containerized Signal REST API:

```bash
# Quick setup with Docker
./scripts/test-local-docker.sh

# Or manually:
docker-compose up -d --build

# Register via API
curl -X POST "http://localhost:8080/v1/register/+1234567890"

# Verify with SMS code
curl -X POST "http://localhost:8080/v1/register/+1234567890/verify/123456"

# Test sending
curl -X POST "http://localhost:8080/v2/send" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "+1234567890",
    "recipients": ["+0987654321"],
    "message": "!openai Hello from the bot!"
  }'
```

### Step 5: MCP Integration with Claude Code

If you want to use this as an MCP server with Claude Code:

```bash
# Register the MCP server
claude mcp add signal-aichat npx tsx src/mcp-server.ts

# Or add to project scope
claude mcp add --scope project signal-aichat npx tsx src/mcp-server.ts

# Test in Claude Code
# Ask: "Use the list_ai_models tool"
# Ask: "Use chat_with_ai with model 'openai' and message 'Hello'"
```

## Understanding the Message Flow

1. **Message Received**: Someone sends a message to your Signal bot number
2. **Trigger Detection**: Bot checks for triggers like `!openai` or `!openrouter`
3. **Model Selection**: Routes to appropriate AI model or uses default
4. **AI Processing**: Sends message to AI provider and gets response
5. **Response Sent**: Sends AI response back via Signal

### Example Conversations:

```
User: !openai What is machine learning?
Bot: Machine learning is a subset of artificial intelligence (AI)...

User: !openrouter Explain quantum computing
Bot: Quantum computing is a revolutionary approach to computation...

User: Hello (no trigger)
Bot: [Uses default model - OpenAI in our setup]
```

## Production Deployment

### Local Production
```bash
npm run build
npm start
```

### Docker Production
```bash
docker-compose up -d
```

### AWS Fargate Production
```bash
# One-time setup
./scripts/setup-aws-resources.sh prod

# Deploy
./scripts/deploy-fargate.sh prod
```

## Troubleshooting Common Issues

### API Key Problems
```bash
# Test your keys
./scripts/test-api-keys.sh

# Common issues:
# - Key not activated (check billing)
# - Key expired (regenerate)
# - Insufficient credits (add payment method)
```

### Signal Registration Problems
```bash
# Most common issues:
# - Phone number already registered to another Signal account
# - Virtual numbers blocked by Signal
# - Captcha required (try different number)
# - SMS not received (check spam, try voice verification)
```

### Bot Not Responding
```bash
# Check logs
docker-compose logs signal-bot

# Common issues:
# - API keys invalid
# - Signal not properly registered
# - Network connectivity issues
# - Rate limiting from AI providers
```

## Security Considerations

⚠️ **Important Security Notes:**

1. **Never commit API keys** to version control
2. **Use environment variables** for all secrets
3. **Signal CLI is unofficial** - understand the risks
4. **Phone number requirements** - keep dedicated number secure
5. **Monitor usage and costs** from AI providers
6. **Consider rate limiting** to prevent abuse

## Cost Estimates

**Typical Monthly Costs:**

- **OpenAI API**: $5-50/month (depending on usage)
- **OpenRouter API**: $3-30/month (varies by model)
- **Phone Number**: $0-10/month (if using paid service)
- **AWS Fargate**: $10-50/month (if deploying to cloud)
- **Signal CLI**: Free (but unofficial)

## Next Steps

Once you have the basic setup working:

1. **Customize Models**: Add more AI providers or models
2. **Enhance Features**: Add conversation memory, user management
3. **Scale Deployment**: Move to production infrastructure
4. **Monitor Usage**: Set up logging and analytics
5. **Add Security**: Implement rate limiting, user authentication

## Getting Help

- **Issues**: Check the GitHub Issues page
- **Documentation**: See `docs/testing-signal.md` for detailed setup
- **API Keys**: Visit provider websites for account management
- **Signal Problems**: Try different phone numbers or contact providers

---

# Coming Soon: Telegram Bot Integration

*This section outlines the planned Telegram bot integration that will provide an alternative to Signal with official API support.*

## Why Telegram Integration?

Unlike Signal, Telegram offers:
- ✅ **Official Bot API** - No reverse engineering required
- ✅ **No phone number needed** - Create bots programmatically
- ✅ **Stable API** - Won't break with app updates
- ✅ **Rich features** - Inline keyboards, file sharing, group management
- ✅ **No TOS violations** - Explicitly designed for bots

## Technical Implementation Plan

### Phase 1: Basic Telegram Bot Setup

**1. Bot Registration**
```bash
# Create bot via BotFather
# 1. Message @BotFather on Telegram
# 2. Send /newbot command
# 3. Choose bot name and username
# 4. Receive bot token (e.g., 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)
```

**2. Environment Configuration**
```env
# New Telegram configuration
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_WEBHOOK_URL=https://your-domain.com/webhook
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret

# Existing AI configuration (unchanged)
OPENAI_API_KEY=sk-proj-...
OPENROUTER_API_KEY=sk-or-v1-...
```

**3. Core Bot Implementation**
```typescript
// src/TelegramBot.ts
import { Bot, webhookCallback } from 'grammy';
import { TelegramService } from './services/TelegramService.js';

export class TelegramBot {
  private bot: Bot;
  private telegramService: TelegramService;

  constructor(token: string) {
    this.bot = new Bot(token);
    this.telegramService = new TelegramService();
    this.setupHandlers();
  }

  private setupHandlers() {
    // Handle text messages
    this.bot.on('message:text', async (ctx) => {
      await this.telegramService.handleMessage(ctx);
    });

    // Handle commands
    this.bot.command('start', async (ctx) => {
      await ctx.reply('Hello! I\'m your AI assistant. Use !openai or !openrouter to chat with different models.');
    });

    this.bot.command('models', async (ctx) => {
      const models = this.telegramService.getAvailableModels();
      await ctx.reply(`Available models: ${models.join(', ')}`);
    });
  }
}
```

### Phase 2: Advanced Message Handling

**1. Message Processing Service**
```typescript
// src/services/TelegramService.ts
export class TelegramService {
  private aiService: SignalService; // Reuse existing AI logic

  async handleMessage(ctx: Context) {
    const text = ctx.message?.text;
    if (!text) return;

    // Detect AI model triggers
    const response = await this.aiService.processMessage(text);
    
    // Send typing indicator
    await ctx.replyWithChatAction('typing');
    
    // Send response with formatting
    await ctx.reply(response, { 
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id 
    });
  }
}
```

**2. Rich Message Features**
```typescript
// Inline keyboard for model selection
const keyboard = new InlineKeyboard()
  .text('OpenAI GPT-4', 'model_openai')
  .text('Claude 3.5', 'model_openrouter')
  .row()
  .text('List Models', 'list_models');

await ctx.reply('Choose an AI model:', { reply_markup: keyboard });

// Handle callback queries
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  
  if (data.startsWith('model_')) {
    const model = data.replace('model_', '');
    // Set user's preferred model
    await ctx.answerCallbackQuery(`Switched to ${model}`);
  }
});
```

### Phase 3: Enhanced Features

**1. User Management**
```typescript
// User preferences and conversation history
interface TelegramUser {
  id: number;
  username?: string;
  preferredModel: string;
  conversationHistory: ChatMessage[];
  settings: UserSettings;
}

class UserManager {
  private users = new Map<number, TelegramUser>();
  
  getOrCreateUser(ctx: Context): TelegramUser {
    const userId = ctx.from?.id;
    if (!userId) throw new Error('No user ID');
    
    if (!this.users.has(userId)) {
      this.users.set(userId, {
        id: userId,
        username: ctx.from?.username,
        preferredModel: 'openai',
        conversationHistory: [],
        settings: { maxHistory: 10 }
      });
    }
    
    return this.users.get(userId)!;
  }
}
```

**2. Group Chat Support**
```typescript
// Handle group messages
bot.on('message:text', async (ctx) => {
  const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
  
  if (isGroup) {
    // Only respond when mentioned or with triggers
    const botUsername = ctx.me.username;
    const text = ctx.message.text;
    
    if (text.includes(`@${botUsername}`) || text.startsWith('!')) {
      await this.telegramService.handleMessage(ctx);
    }
  } else {
    // Always respond in private chats
    await this.telegramService.handleMessage(ctx);
  }
});
```

**3. File and Media Handling**
```typescript
// Handle document uploads
bot.on('message:document', async (ctx) => {
  const document = ctx.message.document;
  
  if (document.mime_type === 'text/plain') {
    // Download and process text files
    const file = await ctx.getFile();
    const content = await downloadFile(file.file_path);
    
    await ctx.reply('!openai Please analyze this document: ' + content);
  }
});

// Handle voice messages
bot.on('message:voice', async (ctx) => {
  await ctx.reply('Voice message processing coming soon! For now, please send text messages.');
});
```

### Phase 4: Deployment and Webhooks

**1. Webhook Setup**
```typescript
// src/telegram-webhook.ts
import express from 'express';
import { webhookCallback } from 'grammy';
import { TelegramBot } from './TelegramBot.js';

const app = express();
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!);

// Set webhook
app.use('/webhook', webhookCallback(bot.bot, 'express'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Telegram webhook server running on port ${PORT}`);
});
```

**2. Production Deployment**
```yaml
# docker-compose.telegram.yml
version: '3.9'

services:
  telegram-bot:
    build: .
    environment:
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - NODE_ENV=production
    ports:
      - "3000:3000"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**3. AWS Lambda Deployment (Serverless)**
```typescript
// For serverless deployment
export const handler = async (event: any) => {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!);
  
  // Handle webhook payload
  if (event.httpMethod === 'POST') {
    const update = JSON.parse(event.body);
    await bot.bot.handleUpdate(update);
    
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };
  }
  
  return {
    statusCode: 404,
    body: JSON.stringify({ error: 'Not found' })
  };
};
```

### Phase 5: Advanced Integrations

**1. Multi-Bot Management**
```typescript
// Manage multiple Telegram bots
class BotManager {
  private bots = new Map<string, TelegramBot>();
  
  createBot(token: string, config: BotConfig): TelegramBot {
    const bot = new TelegramBot(token, config);
    this.bots.set(token, bot);
    return bot;
  }
  
  // Route webhooks to appropriate bot
  routeWebhook(token: string, update: Update) {
    const bot = this.bots.get(token);
    if (!bot) throw new Error(`Bot not found: ${token}`);
    
    return bot.handleUpdate(update);
  }
}
```

**2. MCP Integration**
```typescript
// Extend MCP server to support Telegram
class TelegramMCPServer extends SignalAIChatMCPServer {
  protected setupTelegramHandlers() {
    this.server.setRequestHandler('send_telegram_message', async (request) => {
      const { chatId, message } = request.params;
      
      // Send message via Telegram
      const result = await this.telegramBot.sendMessage(chatId, message);
      
      return {
        content: [{
          type: 'text',
          text: `Message sent to Telegram chat ${chatId}: "${message}"`
        }]
      };
    });
  }
}
```

## Timeline and Milestones

**Phase 1 (Week 1-2): Basic Bot**
- [x] Research Telegram Bot API
- [ ] Implement basic message handling
- [ ] Test with existing AI models
- [ ] Create basic documentation

**Phase 2 (Week 3-4): Advanced Features**
- [ ] User management system
- [ ] Inline keyboards and callbacks
- [ ] Group chat support
- [ ] Message formatting and media

**Phase 3 (Week 5-6): Production Ready**
- [ ] Webhook implementation
- [ ] Docker deployment
- [ ] Error handling and logging
- [ ] Rate limiting and security

**Phase 4 (Week 7-8): Advanced Integrations**
- [ ] MCP server integration
- [ ] Multi-bot management
- [ ] Analytics and monitoring
- [ ] Advanced AI features

## Benefits Over Signal Implementation

1. **Reliability**: Official API means no breaking changes
2. **Features**: Rich message types, keyboards, file handling
3. **Scalability**: Built for high-volume bot applications
4. **Ease of Setup**: No phone number or SMS verification needed
5. **Documentation**: Comprehensive official documentation
6. **Community**: Large ecosystem of tools and libraries

The Telegram integration will provide a more robust and feature-rich alternative to the current Signal implementation, while maintaining the same AI model integration and MCP server capabilities.