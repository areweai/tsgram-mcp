#!/usr/bin/env node

/**
 * TELEGRAM MCP + WEBHOOK SERVER
 * 
 * This Docker container provides:
 * 1. MCP Server - For Claude Code manual control tools
 * 2. HTTP Webhook - For automatic AI responses when users message the bot
 * 3. Hermes AI Integration - Uses the same AI system as hermes MCP tools
 * 
 * Architecture:
 * ┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
 * │   Claude Code   │    │   Docker Container   │    │    Telegram     │
 * │                 │    │                      │    │                 │
 * │  ┌───────────┐  │    │  ┌─────────────────┐ │    │  ┌───────────┐  │
 * │  │ MCP Tools │◄─┼────┼─►│ MCP Server      │ │    │  │    Bot    │  │
 * │  │           │  │    │  │ (Manual Control)│ │    │  │           │  │
 * │  └───────────┘  │    │  └─────────────────┘ │    │  └───────────┘  │
 * │                 │    │           │          │    │        │        │
 * └─────────────────┘    │           ▼          │    │        │        │
 *                        │  ┌─────────────────┐ │    │        │        │
 *                        │  │ HTTP Webhook    │◄┼────┼────────┘        │
 *                        │  │ + Hermes AI     │ │    │                 │
 *                        │  └─────────────────┘ │    │                 │
 *                        └──────────────────────┘    └─────────────────┘
 */

import express from 'express'
import cors from 'cors'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { TelegramBotClient } from './telegram/bot-client.js'
import { BotConfig } from './types/telegram.js'
import { ChatModel } from './models/index.js'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface BotInstance {
  id: string
  name: string
  client: TelegramBotClient
  config: BotConfig
  created_at: string
  last_used: string
  message_count: number
}

interface ActivityEvent {
  id: string
  type: 'message_sent' | 'bot_created' | 'webhook_received' | 'ai_response' | 'error'
  description: string
  timestamp: string
  bot_id?: string
  details?: any
}

class TelegramMCPWebhookServer {
  private app: express.Application
  private mcpServer: Server
  private bots: Map<string, BotInstance> = new Map()
  private configFile: string
  private port: number = parseInt(process.env.MCP_WEBHOOK_PORT || '4041')
  private activityLog: ActivityEvent[] = []
  private maxActivityItems: number = 50
  
  // Polling disabled - AI bot handles polling on port 4040
  private pollingEnabled: boolean = false
  private pollingOffset: number = 0
  private pollingInterval: number = 2000 // 2 seconds

  constructor() {
    this.app = express()
    this.configFile = path.join(__dirname, '..', 'data', 'bots.json')
    
    // Initialize MCP Server
    this.mcpServer = new Server(
      {
        name: 'telegram-mcp-webhook-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    )

    this.setupExpress()
    this.setupMCPHandlers()
    this.loadSavedBots()
  }

  /**
   * LOG ACTIVITY EVENT
   * Tracks real system events for dashboard display
   */
  private logActivity(type: ActivityEvent['type'], description: string, botId?: string, details?: any) {
    const activity: ActivityEvent = {
      id: `activity_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type,
      description,
      timestamp: new Date().toISOString(),
      bot_id: botId,
      details
    }
    
    this.activityLog.push(activity)
    
    // Keep only the most recent activities
    if (this.activityLog.length > this.maxActivityItems) {
      this.activityLog = this.activityLog.slice(-this.maxActivityItems)
    }
    
    console.log(`📝 Activity logged: ${type} - ${description}`)
  }

  /**
   * SETUP EXPRESS HTTP SERVER
   * Handles webhooks and provides health endpoints
   */
  private setupExpress() {
    // Enable CORS for all origins - local development
    this.app.use(cors({
      origin: '*',
      methods: '*',
      allowedHeaders: '*',
      credentials: false
    }))
    this.app.use(express.json())

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        bots: this.bots.size,
        mcp_server: 'running'
      })
    })

    /**
     * TELEGRAM WEBHOOK ENDPOINT
     * This is where Telegram sends updates when users message the bot
     * It uses hermes MCP AI chat to generate responses
     */
    this.app.post('/webhook/telegram', async (req, res) => {
      try {
        const update = req.body
        console.log('📨 Webhook received:', JSON.stringify(update, null, 2))
        
        // Log webhook activity
        this.logActivity('webhook_received', `Webhook received from Telegram`, undefined, {
          update_id: update.update_id,
          message_type: update.message ? 'message' : 'other'
        })
        
        // Handle incoming messages
        if (update.message && update.message.text) {
          await this.handleIncomingMessage(update.message)
        }
        
        res.json({ ok: true })
      } catch (error) {
        console.error('❌ Webhook error:', error)
        this.logActivity('error', `Webhook processing failed: ${error.message}`)
        res.status(500).json({ error: 'Webhook processing failed' })
      }
    })

    // MCP status endpoint
    this.app.get('/mcp/status', (req, res) => {
      res.json({
        mcp_server: 'running',
        bots_configured: this.bots.size,
        hermes_ai_available: ChatModel.getSupportedModels(),
        default_model: process.env.DEFAULT_MODEL || 'openrouter'
      })
    })

    /**
     * REST API ENDPOINTS FOR DASHBOARD
     * These endpoints provide the REST API that the web dashboard expects
     */
    
    // List all bots (deduplicated by token)
    this.app.get('/api/bots', async (req, res) => {
      try {
        const uniqueBots = new Map<string, any>()
        
        // Deduplicate bots by token - keep the most recently used instance
        for (const [id, bot] of this.bots.entries()) {
          const token = bot.config.token
          if (!uniqueBots.has(token) || 
              new Date(bot.last_used) > new Date(uniqueBots.get(token).last_used)) {
            uniqueBots.set(token, bot)
          }
        }
        
        const bots = []
        for (const bot of uniqueBots.values()) {
          try {
            const meResult = await bot.client.getMe()
            const botInfo = meResult.success && meResult.data ? meResult.data as any : null
            
            bots.push({
              id: bot.id,
              name: bot.name,
              username: botInfo?.username || 'unknown',
              token: bot.config.token.substring(0, 20) + '...',
              status: botInfo ? 'active' : 'error',
              created_at: bot.created_at,
              last_used: bot.last_used,
              message_count: bot.message_count || 0, // Real message count from bot instance
              bot_id: botInfo?.id || null,
              can_join_groups: botInfo?.can_join_groups || false
            })
          } catch (error) {
            // Bot not accessible
            bots.push({
              id: bot.id,
              name: bot.name,
              username: 'unknown',
              token: bot.config.token.substring(0, 20) + '...',
              status: 'error',
              created_at: bot.created_at,
              last_used: bot.last_used,
              message_count: 0,
              bot_id: null,
              can_join_groups: false
            })
          }
        }
        
        res.json({ bots })
      } catch (error) {
        console.error('Error listing bots:', error)
        res.status(500).json({ error: 'Failed to list bots' })
      }
    })

    // Create a new bot
    this.app.post('/api/bots', async (req, res) => {
      try {
        const { name, token, webhook_url } = req.body
        
        if (!name || !token) {
          return res.status(400).json({ error: 'Name and token are required' })
        }

        // Test the token first
        const testResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`)
        const testData = await testResponse.json()
        
        if (!testData.ok) {
          return res.status(400).json({ error: 'Invalid bot token' })
        }

        const config: BotConfig = {
          token,
          name,
          webhook_url: webhook_url || `${process.env.WEBHOOK_BASE_URL || 'http://localhost:4041'}/webhook/telegram`
        }

        const bot = await this.createBot(config)
        if (bot) {
          res.json({ 
            success: true, 
            bot: {
              id: bot.id,
              name: bot.name,
              username: testData.result.username,
              status: 'active',
              created_at: bot.created_at
            }
          })
        } else {
          res.status(500).json({ error: 'Failed to create bot' })
        }
      } catch (error) {
        console.error('Error creating bot:', error)
        res.status(500).json({ error: 'Internal server error' })
      }
    })

    // Send a message via bot
    this.app.post('/api/send-message', async (req, res) => {
      try {
        const { chat_id, text, use_ai } = req.body
        
        if (!chat_id || !text) {
          return res.status(400).json({ error: 'chat_id and text are required' })
        }

        const bot = this.getDefaultBot()
        if (!bot) {
          return res.status(404).json({ error: 'No bot configured' })
        }

        let message = text
        if (use_ai) {
          message = await this.generateAIResponse(text, 'Dashboard User')
        }

        await this.sendTelegramMessage(bot, chat_id, message)
        res.json({ success: true })
      } catch (error) {
        console.error('Error sending message:', error)
        res.status(500).json({ error: 'Failed to send message' })
      }
    })

    // Get recent activity (real activity log)
    this.app.get('/api/activity', (req, res) => {
      // Return the most recent activities, limited by maxActivityItems
      const recentActivities = this.activityLog
        .slice(-this.maxActivityItems)
        .reverse() // Most recent first
      
      res.json({ activities: recentActivities })
    })

    // Test bot token endpoint
    this.app.post('/api/test-token', async (req, res) => {
      try {
        const { token } = req.body
        
        if (!token) {
          return res.status(400).json({ error: 'Token is required' })
        }

        const testResponse = await fetch(`https://api.telegram.org/bot${token}/getMe`)
        const data = await testResponse.json()
        
        if (data.ok) {
          res.json({
            valid: true,
            username: data.result.username,
            bot_name: data.result.first_name
          })
        } else {
          res.json({
            valid: false,
            error: data.description || 'Invalid token'
          })
        }
      } catch (error) {
        res.json({
          valid: false,
          error: 'Network error'
        })
      }
    })
  }

  /**
   * HANDLE INCOMING TELEGRAM MESSAGE
   * This is the core function that processes user messages and responds with AI
   */
  private async handleIncomingMessage(message: any) {
    const chatId = message.chat.id
    const userMessage = message.text
    const userName = message.from.username || message.from.first_name
    const userId = message.from.id

    console.log(`💬 Message from ${userName} (${userId}): ${userMessage}`)

    // Skip bot commands like /start, /help
    if (userMessage.startsWith('/')) {
      console.log('⏭️  Skipping bot command')
      return
    }

    // Get default bot (or create one if none exists)
    let bot = this.getDefaultBot()
    if (!bot) {
      console.log('🤖 No bot configured, creating default bot')
      bot = await this.createDefaultBot()
      if (!bot) {
        console.error('❌ Failed to create default bot')
        return
      }
    }

    try {
      // Use hermes MCP AI chat system to generate response
      const aiResponse = await this.generateAIResponse(userMessage, userName)
      
      // Send response back to Telegram
      await this.sendTelegramMessage(bot, chatId, aiResponse)
      
      console.log(`✅ AI response sent to ${userName}`)
    } catch (error) {
      console.error('❌ Error processing message:', error)
      
      // Send error response to user
      const errorMessage = `Sorry, I encountered an error processing your message. For support, visit: www.arewe.ai`
      await this.sendTelegramMessage(bot, chatId, errorMessage)
    }
  }

  /**
   * GENERATE AI RESPONSE USING HERMES MCP SYSTEM
   * This uses the same AI models and system as the hermes MCP tools
   */
  private async generateAIResponse(userMessage: string, userName: string): Promise<string> {
    const defaultModel = process.env.DEFAULT_MODEL || 'openrouter'
    console.log(`🧠 Generating AI response using model: ${defaultModel}`)
    
    try {
      // Create AI API instance using hermes ChatModel system
      const aiAPI = ChatModel.createAPI(defaultModel)
      
      // System prompt for context
      const systemPrompt = "You are the Hermes MCP server assistant. Be helpful, polite, and professional. If you can't help with something, direct users to www.arewe.ai for support."
      
      // Format the message with system context
      const contextualMessage = `System: ${systemPrompt}\n\nUser (${userName}): ${userMessage}`
      
      // Get AI response using hermes MCP AI system
      const aiResponse = await aiAPI.send(contextualMessage)
      
      console.log(`🎯 AI response generated (${aiResponse.length} chars)`)
      
      // Log AI response activity
      this.logActivity('ai_response', `AI response generated for ${userName} using ${defaultModel}`, undefined, {
        model: defaultModel,
        user: userName,
        message_length: userMessage.length,
        response_length: aiResponse.length
      })
      
      // Format response with MCP branding
      return this.formatMCPResponse(aiResponse, {
        model: defaultModel,
        user: userName,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      // Log AI generation error
      this.logActivity('error', `AI response generation failed: ${error.message}`, undefined, {
        model: defaultModel,
        user: userName,
        error: error.message
      })
      throw error
    }
  }

  /**
   * FORMAT MCP RESPONSE
   * Consistent formatting for all AI responses
   */
  private formatMCPResponse(response: string, metadata: { model: string, user: string, timestamp: string }): string {
    // For Telegram, keep it clean but informative
    return `${response}

---
🤖 _Hermes MCP • ${metadata.model} • ${new Date(metadata.timestamp).toLocaleTimeString()}_`
  }

  /**
   * SEND MESSAGE TO TELEGRAM
   * Wrapper for sending messages with error handling
   */
  private async sendTelegramMessage(bot: BotInstance, chatId: number, text: string): Promise<void> {
    const result = await bot.client.sendMessage({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    })

    if (!result.success) {
      this.logActivity('error', `Failed to send message via ${bot.name}: ${result.error}`, bot.id)
      throw new Error(`Failed to send Telegram message: ${result.error}`)
    }

    // Update last used timestamp and increment message count
    bot.last_used = new Date().toISOString()
    bot.message_count = (bot.message_count || 0) + 1
    await this.saveBots()

    // Log successful message activity
    this.logActivity('message_sent', `Message sent via ${bot.name} to chat ${chatId}`, bot.id, {
      chat_id: chatId,
      message_length: text.length
    })
  }

  /**
   * MCP SERVER SETUP
   * These tools allow Claude Code to manually control the Telegram bot
   */
  private setupMCPHandlers() {
    // List available tools
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'create_telegram_bot',
            description: 'Create a new Telegram bot for webhook responses',
            inputSchema: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Bot name' },
                token: { type: 'string', description: 'Bot token from @BotFather' },
                webhook_url: { type: 'string', description: 'Webhook URL (optional)' },
              },
              required: ['name', 'token'],
            },
          },
          {
            name: 'list_telegram_bots',
            description: 'List all configured Telegram bots',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            name: 'send_telegram_message',
            description: 'Manually send a message (bypasses AI)',
            inputSchema: {
              type: 'object',
              properties: {
                chat_id: { type: ['string', 'number'], description: 'Chat ID or username' },
                text: { type: 'string', description: 'Message text' },
                use_ai: { type: 'boolean', description: 'Generate response using AI (default: false)' },
              },
              required: ['chat_id', 'text'],
            },
          },
          {
            name: 'send_ai_message',
            description: 'Send AI-generated message to a Telegram chat',
            inputSchema: {
              type: 'object',
              properties: {
                chat_id: { type: ['string', 'number'], description: 'Chat ID or username' },
                prompt: { type: 'string', description: 'Prompt for AI to respond to' },
                user_context: { type: 'string', description: 'Context about the user (optional)' },
              },
              required: ['chat_id', 'prompt'],
            },
          },
          {
            name: 'get_telegram_chat_info',
            description: 'Get information about a Telegram chat',
            inputSchema: {
              type: 'object',
              properties: {
                chat_id: { type: ['string', 'number'], description: 'Chat ID or username' },
              },
              required: ['chat_id'],
            },
          },
          {
            name: 'set_telegram_webhook',
            description: 'Set webhook URL for automatic responses',
            inputSchema: {
              type: 'object',
              properties: {
                webhook_url: { type: 'string', description: 'Webhook URL' },
              },
              required: ['webhook_url'],
            },
          },
        ],
      }
    })

    // Handle tool calls
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'create_telegram_bot':
            return await this.createBot(args as { name: string; token: string; webhook_url?: string })

          case 'list_telegram_bots':
            return await this.listBots()

          case 'send_telegram_message':
            return await this.sendMessage(args as { chat_id: string | number; text: string; use_ai?: boolean })

          case 'send_ai_message':
            return await this.sendAIMessage(args as { chat_id: string | number; prompt: string; user_context?: string })

          case 'get_telegram_chat_info':
            return await this.getChatInfo(args as { chat_id: string | number })

          case 'set_telegram_webhook':
            return await this.setWebhook(args as { webhook_url: string })

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

    // Resources
    this.mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'telegram://bots',
            name: 'Telegram Bots',
            description: 'All configured Telegram bots',
            mimeType: 'application/json',
          },
        ],
      }
    })

    this.mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params

      if (uri === 'telegram://bots') {
        const bots = Array.from(this.bots.values()).map(bot => ({
          id: bot.id,
          name: bot.name,
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
      }

      throw new Error(`Unknown resource: ${uri}`)
    })
  }

  // MCP TOOL IMPLEMENTATIONS

  private async createBot(args: { name: string; token: string; webhook_url?: string }) {
    const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const config: BotConfig = {
      token: args.token,
      name: args.name,
      allowed_updates: ['message'],
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
      message_count: 0
    }

    this.bots.set(botId, bot)
    await this.saveBots()

    // Log bot creation activity
    this.logActivity('bot_created', `New bot created: ${args.name}`, botId, {
      bot_username: testResult.data?.username,
      bot_id: testResult.data?.id
    })

    // Set webhook if provided
    if (args.webhook_url) {
      await client.setWebhook(args.webhook_url)
    }

    return {
      content: [
        {
          type: 'text',
          text: `Telegram bot "${args.name}" created successfully!\n\nBot ID: ${botId}\nWebhook: ${args.webhook_url || 'Not set'}\n\nUsers can now message the bot and get AI responses automatically.`,
        },
      ],
    }
  }

  private async listBots() {
    const botsList = Array.from(this.bots.values()).map(bot => ({
      id: bot.id,
      name: bot.name,
      created_at: bot.created_at,
      last_used: bot.last_used,
    }))

    return {
      content: [
        {
          type: 'text',
          text: `Configured Telegram bots (${botsList.length}):\n\n${JSON.stringify(botsList, null, 2)}\n\nWebhook endpoint: /webhook/telegram\nAI responses: Enabled (using ${process.env.DEFAULT_MODEL || 'openrouter'})`,
        },
      ],
    }
  }

  private async sendMessage(args: { chat_id: string | number; text: string; use_ai?: boolean }) {
    const bot = this.getDefaultBot()
    if (!bot) {
      throw new Error('No bots configured. Create a bot first.')
    }

    let messageText = args.text

    // Generate AI response if requested
    if (args.use_ai) {
      messageText = await this.generateAIResponse(args.text, 'MCP User')
    }

    await this.sendTelegramMessage(bot, args.chat_id as number, messageText)

    return {
      content: [
        {
          type: 'text',
          text: `Message sent to ${args.chat_id}: ${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}`,
        },
      ],
    }
  }

  private async sendAIMessage(args: { chat_id: string | number; prompt: string; user_context?: string }) {
    const bot = this.getDefaultBot()
    if (!bot) {
      throw new Error('No bots configured. Create a bot first.')
    }

    const contextualPrompt = args.user_context 
      ? `${args.prompt}\n\nUser context: ${args.user_context}`
      : args.prompt

    const aiResponse = await this.generateAIResponse(contextualPrompt, args.user_context || 'MCP User')
    await this.sendTelegramMessage(bot, args.chat_id as number, aiResponse)

    return {
      content: [
        {
          type: 'text',
          text: `AI message sent to ${args.chat_id}:\n\nPrompt: ${args.prompt}\nResponse: ${aiResponse.substring(0, 200)}${aiResponse.length > 200 ? '...' : ''}`,
        },
      ],
    }
  }

  private async getChatInfo(args: { chat_id: string | number }) {
    const bot = this.getDefaultBot()
    if (!bot) {
      throw new Error('No bots configured. Create a bot first.')
    }

    const result = await bot.client.getChat(args.chat_id)

    return {
      content: [
        {
          type: 'text',
          text: `Chat info for ${args.chat_id}: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  private async setWebhook(args: { webhook_url: string }) {
    const bot = this.getDefaultBot()
    if (!bot) {
      throw new Error('No bots configured. Create a bot first.')
    }

    const result = await bot.client.setWebhook(args.webhook_url)

    return {
      content: [
        {
          type: 'text',
          text: `Webhook set to: ${args.webhook_url}\n\nResult: ${JSON.stringify(result, null, 2)}`,
        },
      ],
    }
  }

  // UTILITY METHODS

  private getDefaultBot(): BotInstance | null {
    if (this.bots.size === 0) return null
    return Array.from(this.bots.values())[0]
  }

  private async createDefaultBot(): Promise<BotInstance | null> {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) return null

    try {
      await this.createBot({
        name: 'Default Hermes MCP Bot',
        token: token,
      })
      return this.getDefaultBot()
    } catch (error) {
      console.error('Failed to create default bot:', error)
      return null
    }
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
          message_count: botData.message_count || 0 // Handle legacy bots without message_count
        })
      }
      console.log(`📂 Loaded ${this.bots.size} saved bots`)
    } catch (error) {
      await this.saveBots()
      console.log('📝 No saved bots found, starting fresh')
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

  // START SERVERS

  public async startHTTPServer() {
    return new Promise<void>((resolve) => {
      this.app.listen(this.port, '0.0.0.0', () => {
        console.log(`🌐 HTTP Server started on port ${this.port}`)
        console.log(`📥 Webhook endpoint: http://localhost:${this.port}/webhook/telegram`)
        console.log(`❤️  Health check: http://localhost:${this.port}/health`)
        console.log(`🤖 AI Model: ${process.env.DEFAULT_MODEL || 'openrouter'}`)
        resolve()
      })
    })
  }

  public async startMCPServer() {
    const transport = new StdioServerTransport()
    await this.mcpServer.connect(transport)
    console.log('🔗 MCP Server connected via stdio')
  }

  /**
   * START POLLING FOR LOCAL DEVELOPMENT
   * Since webhooks require HTTPS, we use polling for local development
   */
  private async startPolling() {
    if (!this.pollingEnabled) return

    const bot = this.getDefaultBot()
    if (!bot) {
      console.log('⚠️  No bot available for polling')
      return
    }

    console.log('🔄 Starting Telegram polling for local development...')
    
    const poll = async () => {
      try {
        const response = await fetch(`https://api.telegram.org/bot${bot.config.token}/getUpdates?offset=${this.pollingOffset}&timeout=10`)
        const data = await response.json()

        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            this.pollingOffset = update.update_id + 1

            // Process each message
            if (update.message && update.message.text) {
              console.log('📨 Polling received message:', update.message.text)
              await this.handleIncomingMessage(update.message)
            }
          }
        }
      } catch (error) {
        console.error('❌ Polling error:', error)
      }

      // Schedule next poll
      setTimeout(poll, this.pollingInterval)
    }

    poll()
  }

  public async start() {
    // Create default bot if none exists
    if (this.bots.size === 0) {
      const defaultBot = await this.createDefaultBot()
      if (defaultBot) {
        console.log('🤖 Created default bot for automatic responses')
      }
    }

    // Start both servers
    await Promise.all([
      this.startHTTPServer(),
      this.startMCPServer(),
    ])
    
    // Start polling for local development
    await this.startPolling()
    
    console.log('✅ Telegram MCP + Polling Server fully started!')
    console.log('💬 Users can now message the bot and get AI responses!')
  }
}

// Start the server
const server = new TelegramMCPWebhookServer()
server.start().catch(console.error)