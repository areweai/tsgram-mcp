#!/usr/bin/env node

/**
 * HYBRID TELEGRAM MCP SERVER
 * 
 * This server provides BOTH:
 * 1. MCP Tools - Manual control through Claude Code
 * 2. Auto-Response Bot - Automatically replies to messages using LLM
 * 
 * Architecture:
 * - MCP Server: Provides tools for manual Telegram bot control via Claude Code
 * - Auto-Response: Background polling that automatically responds to messages
 * - Both systems share the same bot token and can send messages independently
 */

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
import { BotConfig } from './types/telegram.js'
import { ChatModel } from './models/index.js'
import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * TELEGRAM BOT INSTANCE
 * Represents a single bot configuration with its client
 */
interface BotInstance {
  id: string
  name: string
  client: TelegramBotClient
  config: BotConfig
  created_at: string
  last_used: string
}

/**
 * HYBRID TELEGRAM MCP SERVER CLASS
 * 
 * This class manages both:
 * 1. MCP Server for Claude Code integration
 * 2. Auto-response system for automatic LLM replies
 */
class HybridTelegramMCPServer {
  private server: Server
  private bots: Map<string, BotInstance> = new Map()
  private configFile: string
  private autoResponseEnabled: boolean = true
  private systemPrompt: string = "You are the Hermes MCP server. Be polite and professional. If people have questions you don't understand or can't help with, direct them to www.arewe.ai for support."
  
  // AI Chat integration - use hermes MCP AI instead of OpenRouter directly
  private aiChatEnabled: boolean = true
  
  // Auto-response polling state
  private pollingOffset: number = 0
  private pollingInterval: number = 2000 // 2 seconds
  private isPolling: boolean = false

  constructor() {
    // Initialize MCP Server
    this.server = new Server(
      {
        name: 'telegram-hybrid-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},      // Provides tools for manual control
          resources: {},  // Provides bot configuration info
          prompts: {},    // Provides helpful prompts
        },
      }
    )

    this.configFile = path.join(__dirname, '..', 'data', 'bots.json')
    this.setupMCPHandlers()      // Set up MCP tools for Claude Code
    this.loadSavedBots()         // Load any previously configured bots
    this.startAutoResponse()     // Start background auto-response system
  }

  /**
   * LOAD SAVED BOTS FROM DISK
   * Restores bot configurations from previous sessions
   */
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
      console.error(`Loaded ${this.bots.size} saved bots`)
    } catch (error) {
      // File doesn't exist or is invalid, start with empty bots
      await this.saveBots()
      console.error('No saved bots found, starting fresh')
    }
  }

  /**
   * SAVE BOTS TO DISK
   * Persists bot configurations for future sessions
   */
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

  /**
   * SETUP MCP HANDLERS
   * These are the tools that Claude Code can call manually
   */
  private setupMCPHandlers() {
    // LIST AVAILABLE TOOLS
    // Claude Code calls this to see what tools are available
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'create_bot',
            description: 'Create a new Telegram bot instance (for MCP control)',
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
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'send_message',
            description: 'Manually send a message via MCP (not auto-response)',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use (optional if only one bot)' },
                chat_id: { type: ['string', 'number'], description: 'Chat ID or username like @duncist' },
                text: { type: 'string', description: 'Message text to send' },
                parse_mode: { type: 'string', enum: ['HTML', 'Markdown', 'MarkdownV2'] },
              },
              required: ['chat_id', 'text'],
            },
          },
          {
            name: 'get_chat_info',
            description: 'Get information about a chat or user',
            inputSchema: {
              type: 'object',
              properties: {
                bot_id: { type: 'string', description: 'Bot ID to use (optional)' },
                chat_id: { type: ['string', 'number'], description: 'Chat ID or username' },
              },
              required: ['chat_id'],
            },
          },
          {
            name: 'toggle_auto_response',
            description: 'Enable/disable automatic LLM responses',
            inputSchema: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean', description: 'Enable or disable auto-responses' },
              },
              required: ['enabled'],
            },
          },
          {
            name: 'update_system_prompt',
            description: 'Update the system prompt for auto-responses',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: 'New system prompt for auto-responses' },
              },
              required: ['prompt'],
            },
          },
        ],
      }
    })

    // HANDLE TOOL CALLS
    // When Claude Code calls a tool, this processes it
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'create_bot':
            return await this.createBot(args as { name: string; token: string; description?: string })

          case 'list_bots':
            return await this.listBots()

          case 'send_message':
            return await this.sendMessage(args as { bot_id?: string; chat_id: string | number; text: string; parse_mode?: string })

          case 'get_chat_info':
            return await this.getChatInfo(args as { bot_id?: string; chat_id: string | number })

          case 'toggle_auto_response':
            return await this.toggleAutoResponse(args as { enabled: boolean })

          case 'update_system_prompt':
            return await this.updateSystemPrompt(args as { prompt: string })

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

    // Add resource and prompt handlers (same as before)
    this.setupResourceHandlers()
    this.setupPromptHandlers()
  }

  /**
   * SETUP RESOURCE HANDLERS
   * Provides information about bot configurations
   */
  private setupResourceHandlers() {
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
            uri: 'telegram://auto-response-status',
            name: 'Auto-Response Status',
            description: 'Current status of the auto-response system',
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

        case 'telegram://auto-response-status':
          const status = {
            enabled: this.autoResponseEnabled,
            polling: this.isPolling,
            system_prompt: this.systemPrompt,
            polling_interval_ms: this.pollingInterval,
            last_offset: this.pollingOffset,
          }
          
          return {
            contents: [
              {
                uri,
                mimeType: 'application/json',
                text: JSON.stringify(status, null, 2),
              },
            ],
          }

        default:
          throw new Error(`Unknown resource: ${uri}`)
      }
    })
  }

  /**
   * SETUP PROMPT HANDLERS
   * Provides helpful prompts for bot management
   */
  private setupPromptHandlers() {
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'telegram_system_prompt',
            description: 'Generate a system prompt for Telegram bot auto-responses',
            arguments: [
              {
                name: 'bot_purpose',
                description: 'What the bot should do',
                required: true,
              },
              {
                name: 'tone',
                description: 'Tone of responses (professional, casual, etc.)',
                required: false,
              },
            ],
          },
        ],
      }
    })

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'telegram_system_prompt':
          const purpose = args?.bot_purpose || 'general assistance'
          const tone = args?.tone || 'professional'

          return {
            description: `Generate a system prompt for a Telegram bot`,
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Create a system prompt for a Telegram bot that should ${purpose}. The tone should be ${tone}. Include instructions for handling unknown questions and directing users to www.arewe.ai for support when needed.`,
                },
              },
            ],
          }

        default:
          throw new Error(`Unknown prompt: ${name}`)
      }
    })
  }

  // MCP TOOL IMPLEMENTATIONS
  // These are called when Claude Code uses the tools

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
          text: `Bot "${args.name}" created successfully with ID: ${botId}. Auto-responses are ${this.autoResponseEnabled ? 'enabled' : 'disabled'}.`,
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
          text: `Configured bots (${botsList.length}):\n\n${JSON.stringify(botsList, null, 2)}\n\nAuto-responses: ${this.autoResponseEnabled ? 'ENABLED' : 'DISABLED'}`,
        },
      ],
    }
  }

  /**
   * GET THE DEFAULT BOT
   * If no bot_id specified, use the first available bot
   */
  private getDefaultBot(): BotInstance | null {
    if (this.bots.size === 0) return null
    return Array.from(this.bots.values())[0]
  }

  private async sendMessage(args: { bot_id?: string; chat_id: string | number; text: string; parse_mode?: string }) {
    let bot: BotInstance | undefined

    if (args.bot_id) {
      bot = this.bots.get(args.bot_id)
      if (!bot) {
        throw new Error(`Bot not found: ${args.bot_id}`)
      }
    } else {
      bot = this.getDefaultBot()
      if (!bot) {
        throw new Error('No bots configured. Create a bot first.')
      }
    }

    const result = await bot.client.sendMessage({
      chat_id: args.chat_id,
      text: args.text,
      parse_mode: args.parse_mode as any,
    })

    bot.last_used = new Date().toISOString()
    await this.saveBots()

    return {
      content: [
        {
          type: 'text',
          text: `Message sent via MCP: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async getChatInfo(args: { bot_id?: string; chat_id: string | number }) {
    let bot: BotInstance | undefined

    if (args.bot_id) {
      bot = this.bots.get(args.bot_id)
      if (!bot) {
        throw new Error(`Bot not found: ${args.bot_id}`)
      }
    } else {
      bot = this.getDefaultBot()
      if (!bot) {
        throw new Error('No bots configured. Create a bot first.')
      }
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

  private async toggleAutoResponse(args: { enabled: boolean }) {
    this.autoResponseEnabled = args.enabled
    
    return {
      content: [
        {
          type: 'text',
          text: `Auto-responses ${args.enabled ? 'ENABLED' : 'DISABLED'}. System prompt: "${this.systemPrompt}"`,
        },
      ],
    }
  }

  private async updateSystemPrompt(args: { prompt: string }) {
    this.systemPrompt = args.prompt
    
    return {
      content: [
        {
          type: 'text',
          text: `System prompt updated: "${this.systemPrompt}"`,
        },
      ],
    }
  }

  /**
   * AUTO-RESPONSE SYSTEM
   * This runs in the background and automatically responds to messages
   */
  
  /**
   * START AUTO-RESPONSE POLLING
   * Begins checking for new messages and responding automatically
   */
  private async startAutoResponse() {
    // Only start if we have a bot token in environment
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      console.error('No TELEGRAM_BOT_TOKEN in environment, auto-responses disabled')
      return
    }

    // Create a default bot if none exists
    if (this.bots.size === 0) {
      try {
        await this.createBot({
          name: 'HermesMCP Auto-Response Bot',
          token: token,
          description: 'Default bot for auto-responses'
        })
        console.error('Created default bot for auto-responses')
      } catch (error) {
        console.error('Failed to create default bot:', error)
        return
      }
    }

    console.error('Starting auto-response system...')
    this.isPolling = true
    this.pollForUpdates()
  }

  /**
   * POLL FOR TELEGRAM UPDATES
   * Continuously checks for new messages and processes them
   */
  private async pollForUpdates() {
    if (!this.isPolling || !this.autoResponseEnabled) {
      // If disabled, wait and check again later
      setTimeout(() => this.pollForUpdates(), this.pollingInterval)
      return
    }

    const bot = this.getDefaultBot()
    if (!bot) {
      setTimeout(() => this.pollForUpdates(), this.pollingInterval)
      return
    }

    try {
      // Get updates from Telegram
      const response = await fetch(`https://api.telegram.org/bot${bot.config.token}/getUpdates?offset=${this.pollingOffset}&timeout=10`)
      const data = await response.json()

      if (data.ok && data.result.length > 0) {
        for (const update of data.result) {
          this.pollingOffset = update.update_id + 1

          // Process each message using AI chat integration
          if (update.message && update.message.text) {
            await this.processAIChatResponse(update.message, bot)
          }
        }
      }
    } catch (error) {
      console.error('AI chat polling error:', error)
    }

    // Schedule next poll
    setTimeout(() => this.pollForUpdates(), this.pollingInterval)
  }

  /**
   * PROCESS AI CHAT RESPONSE
   * Handles a single message using hermes MCP AI chat and sends formatted response
   */
  private async processAIChatResponse(message: any, bot: BotInstance) {
    const chatId = message.chat.id
    const userMessage = message.text
    const userName = message.from.username || message.from.first_name

    console.error(`AI Chat: Received message from ${userName}: ${userMessage}`)

    // Skip bot commands like /start
    if (userMessage.startsWith('/')) {
      console.error('Skipping bot command for AI chat')
      return
    }

    try {
      // Use hermes MCP AI chat system instead of direct OpenRouter
      // This uses the same AI models as the hermes MCP tools
      const defaultModel = process.env.DEFAULT_MODEL || 'openrouter'
      
      console.error(`Using AI model: ${defaultModel}`)
      
      // Create AI API instance using hermes ChatModel system
      const aiAPI = ChatModel.createAPI(defaultModel)
      
      // Format the message with system context
      const contextualMessage = `System: ${this.systemPrompt}\n\nUser: ${userMessage}`
      
      // Get AI response using hermes MCP AI system
      const aiResponse = await aiAPI.send(contextualMessage)
      
      console.error(`AI response generated: ${aiResponse.substring(0, 100)}...`)

      // Format response with MCP-style structure
      const formattedResponse = this.formatMCPResponse(aiResponse, {
        model: defaultModel,
        user: userName,
        timestamp: new Date().toISOString()
      })

      // Send response back to Telegram
      const telegramResponse = await fetch(`https://api.telegram.org/bot${bot.config.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: formattedResponse,
          parse_mode: 'Markdown'
        })
      })

      if (telegramResponse.ok) {
        console.error(`AI chat response sent to ${userName}`)
      } else {
        console.error('Failed to send AI chat response:', await telegramResponse.text())
      }
    } catch (error) {
      console.error('Error processing AI chat response:', error)
      
      // Send error message to user
      await fetch(`https://api.telegram.org/bot${bot.config.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `❌ AI chat error: ${error instanceof Error ? error.message : 'Unknown error'}\n\nFor support, visit: www.arewe.ai`
        })
      })
    }
  }

  /**
   * FORMAT MCP RESPONSE
   * Formats AI response in MCP-style structure for consistency
   */
  private formatMCPResponse(response: string, metadata: { model: string, user: string, timestamp: string }): string {
    return `🤖 **Hermes MCP AI Response**

**Model**: ${metadata.model}
**User**: ${metadata.user}
**Time**: ${new Date(metadata.timestamp).toLocaleTimeString()}

---

${response}

---
*Powered by Hermes MCP • For support: www.arewe.ai*`
  }

  /**
   * START THE MCP SERVER
   * Connects to Claude Code via stdio
   */
  async run() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('Hybrid Telegram MCP Server running on stdio')
    console.error(`Auto-responses: ${this.autoResponseEnabled ? 'ENABLED' : 'DISABLED'}`)
    console.error(`System prompt: "${this.systemPrompt}"`)
  }
}

// Start the server
const server = new HybridTelegramMCPServer()
server.run().catch(console.error)