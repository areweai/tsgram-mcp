#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { TelegramBotClient } from './telegram/bot-client.js'
import { BotConfig, PostContentRequest, CreateChannelRequest, PostStoryRequest } from './types/telegram.js'
import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface BotInstance {
  id: string
  name: string
  client: TelegramBotClient
  config: BotConfig
  created_at: string
  last_used: string
}

class TelegramMCPServer {
  private server: Server
  private bots: Map<string, BotInstance> = new Map()
  private configFile: string

  constructor() {
    this.server = new Server(
      {
        name: 'tsgram',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    )

    this.configFile = path.join(__dirname, '..', 'data', 'bots.json')
    this.setupHandlers()
    this.loadSavedBots()
  }

  private async loadSavedBots() {
    try {
      const data = await fs.readFile(this.configFile, 'utf-8')
      const botsData = JSON.parse(data)
      
      for (const botData of botsData) {
        const client = new TelegramBotClient(botData.config)
        this.bots.set(botData.id, {
          ...botData,
          client,
        })
      }
    } catch (error) {
      // File doesn't exist or is invalid, start with empty bots
      await this.saveBots()
    }
  }

  private async saveBots() {
    try {
      await fs.mkdir(path.dirname(this.configFile), { recursive: true })
      const botsData = Array.from(this.bots.values()).map(bot => ({
        id: bot.id,
        name: bot.name,
        config: bot.config,
        created_at: bot.created_at,
        last_used: bot.last_used,
      }))
      await fs.writeFile(this.configFile, JSON.stringify(botsData, null, 2))
    } catch (error) {
      console.error('Failed to save bots config:', error)
    }
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'create_bot',
            description: 'Create a new Telegram bot instance',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Bot name for identification' },
                token: { type: 'string', description: 'Bot token from @BotFather' },
                description: { type: 'string', description: 'Bot description' },
              },
              required: ['name', 'token'],
            },
          },
          {
            name: 'list_bots',
            description: 'List all configured bot instances',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'get_bot_info',
            description: 'Get information about a specific bot',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID' },
              },
              required: ['bot_id'],
            },
          },
          {
            name: 'send_message',
            description: 'Send a text message to a chat or channel',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use' },
                chat_id: { type: ['string', 'number'], description: 'Chat ID or channel username' },
                text: { type: 'string', description: 'Message text' },
                parse_mode: { type: 'string', enum: ['HTML', 'Markdown', 'MarkdownV2'] },
                disable_notification: { type: 'boolean' },
              },
              required: ['bot_id', 'chat_id', 'text'],
            },
          },
          {
            name: 'send_photo',
            description: 'Send a photo to a chat or channel',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use' },
                chat_id: { type: ['string', 'number'], description: 'Chat ID or channel username' },
                photo: { type: 'string', description: 'Photo URL or file_id' },
                caption: { type: 'string', description: 'Photo caption' },
                parse_mode: { type: 'string', enum: ['HTML', 'Markdown', 'MarkdownV2'] },
              },
              required: ['bot_id', 'chat_id', 'photo'],
            },
          },
          {
            name: 'send_video',
            description: 'Send a video to a chat or channel',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use' },
                chat_id: { type: ['string', 'number'], description: 'Chat ID or channel username' },
                video: { type: 'string', description: 'Video URL or file_id' },
                caption: { type: 'string', description: 'Video caption' },
                parse_mode: { type: 'string', enum: ['HTML', 'Markdown', 'MarkdownV2'] },
              },
              required: ['bot_id', 'chat_id', 'video'],
            },
          },
          {
            name: 'get_chat_info',
            description: 'Get information about a chat or channel',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use' },
                chat_id: { type: ['string', 'number'], description: 'Chat ID or channel username' },
              },
              required: ['bot_id', 'chat_id'],
            },
          },
          {
            name: 'get_chat_admins',
            description: 'Get list of chat administrators',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use' },
                chat_id: { type: ['string', 'number'], description: 'Chat ID or channel username' },
              },
              required: ['bot_id', 'chat_id'],
            },
          },
          {
            name: 'set_chat_title',
            description: 'Change chat or channel title',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use' },
                chat_id: { type: ['string', 'number'], description: 'Chat ID or channel username' },
                title: { type: 'string', description: 'New chat title' },
              },
              required: ['bot_id', 'chat_id', 'title'],
            },
          },
          {
            name: 'set_chat_description',
            description: 'Change chat or channel description',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use' },
                chat_id: { type: ['string', 'number'], description: 'Chat ID or channel username' },
                description: { type: 'string', description: 'New chat description' },
              },
              required: ['bot_id', 'chat_id', 'description'],
            },
          },
          {
            name: 'pin_message',
            description: 'Pin a message in a chat or channel',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use' },
                chat_id: { type: ['string', 'number'], description: 'Chat ID or channel username' },
                message_id: { type: 'number', description: 'Message ID to pin' },
              },
              required: ['bot_id', 'chat_id', 'message_id'],
            },
          },
          {
            name: 'unpin_message',
            description: 'Unpin a message in a chat or channel',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use' },
                chat_id: { type: ['string', 'number'], description: 'Chat ID or channel username' },
                message_id: { type: 'number', description: 'Specific message ID to unpin (optional)' },
              },
              required: ['bot_id', 'chat_id'],
            },
          },
          {
            name: 'get_chat_history',
            description: 'Get recent messages from a chat or channel',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use' },
                chat_id: { type: ['string', 'number'], description: 'Chat ID or channel username' },
                limit: { type: 'number', description: 'Number of messages to retrieve (default: 10)' },
              },
              required: ['bot_id', 'chat_id'],
            },
          },
          {
            name: 'set_webhook',
            description: 'Set webhook URL for a bot',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use' },
                url: { type: 'string', description: 'Webhook URL' },
              },
              required: ['bot_id', 'url'],
            },
          },
          {
            name: 'delete_webhook',
            description: 'Delete webhook for a bot',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use' },
              },
              required: ['bot_id'],
            },
          },
          {
            name: 'open_management_ui',
            description: 'Open the Telegram bot management web interface',
            inputSchema: {
              type: 'object',
              properties: {
                port: { type: 'number', description: 'Port to run the UI on (default: 3000)' },
              },
            },
          },
        ],
      }
    })

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'create_bot':
            return await this.createBot(args as { name: string; token: string; description?: string })

          case 'list_bots':
            return await this.listBots()

          case 'get_bot_info':
            return await this.getBotInfo(args as { bot_id: string })

          case 'send_message':
            return await this.sendMessage(args as { bot_id: string; chat_id: string | number; text: string; parse_mode?: string; disable_notification?: boolean })

          case 'send_photo':
            return await this.sendPhoto(args as { bot_id: string; chat_id: string | number; photo: string; caption?: string; parse_mode?: string })

          case 'send_video':
            return await this.sendVideo(args as { bot_id: string; chat_id: string | number; video: string; caption?: string; parse_mode?: string })

          case 'get_chat_info':
            return await this.getChatInfo(args as { bot_id: string; chat_id: string | number })

          case 'get_chat_admins':
            return await this.getChatAdmins(args as { bot_id: string; chat_id: string | number })

          case 'set_chat_title':
            return await this.setChatTitle(args as { bot_id: string; chat_id: string | number; title: string })

          case 'set_chat_description':
            return await this.setChatDescription(args as { bot_id: string; chat_id: string | number; description: string })

          case 'pin_message':
            return await this.pinMessage(args as { bot_id: string; chat_id: string | number; message_id: number })

          case 'unpin_message':
            return await this.unpinMessage(args as { bot_id: string; chat_id: string | number; message_id?: number })

          case 'get_chat_history':
            return await this.getChatHistory(args as { bot_id: string; chat_id: string | number; limit?: number })

          case 'set_webhook':
            return await this.setWebhook(args as { bot_id: string; url: string })

          case 'delete_webhook':
            return await this.deleteWebhook(args as { bot_id: string })

          case 'open_management_ui':
            return await this.openManagementUI(args as { port?: number })

          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        }
      }
    })

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'telegram://bots',
            name: 'Configured Telegram Bots',
            description: 'List of all configured Telegram bot instances',
            mimeType: 'application/json',
          },
          {
            uri: 'telegram://bot-config',
            name: 'Bot Configuration Template',
            description: 'Template for creating new bot configurations',
            mimeType: 'application/json',
          },
        ],
      }
    })

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params

      switch (uri) {
        case 'telegram://bots':
          const bots = Array.from(this.bots.values()).map(bot => ({
            id: bot.id,
            name: bot.name,
            description: bot.config.description,
            created_at: bot.created_at,
            last_used: bot.last_used,
          }))
          
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(bots, null, 2),
              },
            ],
          }

        case 'telegram://bot-config':
          const template = {
            name: 'My Telegram Bot',
            token: 'BOT_TOKEN_FROM_BOTFATHER',
            description: 'Description of what this bot does',
            webhook_url: 'https://your-domain.com/webhook',
            allowed_updates: ['message', 'channel_post', 'callback_query'],
            drop_pending_updates: false,
          }
          
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(template, null, 2),
              },
            ],
          }

        default:
          throw new Error(`Unknown resource: ${uri}`)
      }
    })

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'channel_post_creator',
            description: 'Generate engaging content for Telegram channel posts',
            arguments: [
              {
                name: 'topic',
                description: 'The main topic or subject of the post',
                required: true,
              },
              {
                name: 'tone',
                description: 'Tone of the post (professional, casual, humorous, etc.)',
                required: false,
              },
              {
                name: 'include_hashtags',
                description: 'Whether to include relevant hashtags',
                required: false,
              },
            ],
          },
          {
            name: 'bot_setup_guide',
            description: 'Comprehensive guide for setting up Telegram bots',
            arguments: [
              {
                name: 'bot_purpose',
                description: 'What the bot will be used for',
                required: true,
              },
            ],
          },
        ],
      }
    })

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'channel_post_creator':
          const topic = args?.topic || 'general topic'
          const tone = args?.tone || 'professional'
          const includeHashtags = args?.include_hashtags !== false

          return {
            description: `Generate engaging Telegram channel content about ${topic}`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Create an engaging Telegram channel post about "${topic}". 
                  
                  Requirements:
                  - Tone: ${tone}
                  - Length: 150-300 words
                  - Include emojis appropriately
                  - ${includeHashtags ? 'Include 3-5 relevant hashtags' : 'No hashtags needed'}
                  - Make it shareable and engaging
                  - Consider Telegram's formatting options (bold, italic, code)
                  
                  Format the post ready to copy-paste into Telegram.`,
                },
              },
            ],
          }

        case 'bot_setup_guide':
          const botPurpose = args?.bot_purpose || 'general purpose'

          return {
            description: `Guide for setting up a Telegram bot for ${botPurpose}`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Provide a comprehensive step-by-step guide for setting up a Telegram bot for ${botPurpose}.
                  
                  Include:
                  1. Creating the bot with @BotFather
                  2. Essential configuration steps
                  3. Required permissions and settings
                  4. Security best practices
                  5. Testing procedures
                  6. Common troubleshooting tips
                  
                  Make it beginner-friendly but thorough.`,
                },
              },
            ],
          }

        default:
          throw new Error(`Unknown prompt: ${name}`)
      }
    })
  }

  private async createBot(args: { name: string; token: string; description?: string }) {
    const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const config: BotConfig = {
      token: args.token,
      name: args.name,
      description: args.description,
      allowed_updates: ['message', 'channel_post', 'callback_query'],
      drop_pending_updates: false,
    }

    const client = new TelegramBotClient(config)
    
    // Test the bot token
    const testResult = await client.getMe()
    if (!testResult.success) {
      throw new Error(`Invalid bot token: ${testResult.error}`)
    }

    const bot: BotInstance = {
      id: botId,
      name: args.name,
      client,
      config,
      created_at: new Date().toISOString(),
      last_used: new Date().toISOString(),
    }

    this.bots.set(botId, bot)
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Bot "${args.name}" created successfully with ID: ${botId}`,
        },
      ],
    }
  }

  private async listBots() {
    const botsList = Array.from(this.bots.values()).map(bot => ({
      id: bot.id,
      name: bot.name,
      description: bot.config.description,
      created_at: bot.created_at,
      last_used: bot.last_used,
    }))

    return {
      content: [
        {
          type: 'text',
          text: `Configured bots (${botsList.length}):\n\n${JSON.stringify(botsList, null, 2)}`,
        },
      ],
    }
  }

  private async getBotInfo(args: { bot_id: string }) {
    const bot = this.bots.get(args.bot_id)
    if (!bot) {
      throw new Error(`Bot not found: ${args.bot_id}`)
    }

    const result = await bot.client.getMe()
    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Bot info: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async sendMessage(args: { bot_id: string; chat_id: string | number; text: string; parse_mode?: string; disable_notification?: boolean }) {
    const bot = this.bots.get(args.bot_id)
    if (!bot) {
      throw new Error(`Bot not found: ${args.bot_id}`)
    }

    const result = await bot.client.sendMessage({
      chat_id: args.chat_id,
      text: args.text,
      parse_mode: args.parse_mode as any,
      disable_notification: args.disable_notification,
    })

    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Message sent: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async sendPhoto(args: { bot_id: string; chat_id: string | number; photo: string; caption?: string; parse_mode?: string }) {
    const bot = this.bots.get(args.bot_id)
    if (!bot) {
      throw new Error(`Bot not found: ${args.bot_id}`)
    }

    const result = await bot.client.sendPhoto({
      chat_id: args.chat_id,
      photo: args.photo,
      caption: args.caption,
      parse_mode: args.parse_mode as any,
    })

    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Photo sent: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async sendVideo(args: { bot_id: string; chat_id: string | number; video: string; caption?: string; parse_mode?: string }) {
    const bot = this.bots.get(args.bot_id)
    if (!bot) {
      throw new Error(`Bot not found: ${args.bot_id}`)
    }

    const result = await bot.client.sendVideo({
      chat_id: args.chat_id,
      video: args.video,
      caption: args.caption,
      parse_mode: args.parse_mode as any,
    })

    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Video sent: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async getChatInfo(args: { bot_id: string; chat_id: string | number }) {
    const bot = this.bots.get(args.bot_id)
    if (!bot) {
      throw new Error(`Bot not found: ${args.bot_id}`)
    }

    const result = await bot.client.getChat(args.chat_id)
    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Chat info: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async getChatAdmins(args: { bot_id: string; chat_id: string | number }) {
    const bot = this.bots.get(args.bot_id)
    if (!bot) {
      throw new Error(`Bot not found: ${args.bot_id}`)
    }

    const result = await bot.client.getChatAdministrators(args.chat_id)
    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Chat administrators: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async setChatTitle(args: { bot_id: string; chat_id: string | number; title: string }) {
    const bot = this.bots.get(args.bot_id)
    if (!bot) {
      throw new Error(`Bot not found: ${args.bot_id}`)
    }

    const result = await bot.client.setChatTitle(args.chat_id, args.title)
    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Chat title updated: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async setChatDescription(args: { bot_id: string; chat_id: string | number; description: string }) {
    const bot = this.bots.get(args.bot_id)
    if (!bot) {
      throw new Error(`Bot not found: ${args.bot_id}`)
    }

    const result = await bot.client.setChatDescription(args.chat_id, args.description)
    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Chat description updated: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async pinMessage(args: { bot_id: string; chat_id: string | number; message_id: number }) {
    const bot = this.bots.get(args.bot_id)
    if (!bot) {
      throw new Error(`Bot not found: ${args.bot_id}`)
    }

    const result = await bot.client.pinChatMessage(args.chat_id, args.message_id)
    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Message pinned: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async unpinMessage(args: { bot_id: string; chat_id: string | number; message_id?: number }) {
    const bot = this.bots.get(args.bot_id)
    if (!bot) {
      throw new Error(`Bot not found: ${args.bot_id}`)
    }

    const result = await bot.client.unpinChatMessage(args.chat_id, args.message_id)
    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Message unpinned: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async getChatHistory(args: { bot_id: string; chat_id: string | number; limit?: number }) {
    const bot = this.bots.get(args.bot_id)
    if (!bot) {
      throw new Error(`Bot not found: ${args.bot_id}`)
    }

    const result = await bot.client.getChatHistory(args.chat_id, args.limit || 10)
    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Chat history: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async setWebhook(args: { bot_id: string; url: string }) {
    const bot = this.bots.get(args.bot_id)
    if (!bot) {
      throw new Error(`Bot not found: ${args.bot_id}`)
    }

    const result = await bot.client.setWebhook(args.url)
    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Webhook set: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async deleteWebhook(args: { bot_id: string }) {
    const bot = this.bots.get(args.bot_id)
    if (!bot) {
      throw new Error(`Bot not found: ${args.bot_id}`)
    }

    const result = await bot.client.deleteWebhook()
    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Webhook deleted: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async openManagementUI(args: { port?: number }) {
    const port = args.port || 3000
    const url = `http://localhost:${port}`
    
    // This would typically start the SPA server
    return {
      content: [
        {
          type: 'text',
          text: `Management UI available at: ${url}\n\nTo start the UI server, run: npm run dev:spa`,
        },
      ],
    }
  }

  async run() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('Telegram MCP Server running on stdio')
  }
}

const server = new TelegramMCPServer()
server.run().catch(console.error)