#!/usr/bin/env node

/**
 * WORKING TELEGRAM BOT - FINAL VERSION
 * - Proper message handling
 * - No loops
 * - Useful responses
 */

import express from 'express'
import { TelegramBotClient } from './telegram/bot-client.js'
import { BotConfig } from './types/telegram.js'
import fs from 'fs/promises'
import path from 'path'
import dotenv from 'dotenv'
import { ChatModel } from './models/ChatModel.js'

dotenv.config()

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || '/app/workspace'
const AUTHORIZED_USER = process.env.AUTHORIZED_USER || 'duncist'

interface BotInstance {
  id: string
  name: string
  client: TelegramBotClient
  config: BotConfig
  created_at: string
  bot_info?: any
}

class WorkingTelegramBot {
  private app: express.Application
  private bot: BotInstance | null = null
  private port: number = parseInt(process.env.MCP_SERVER_PORT || '4040')
  private pollingOffset: number = 0
  private botUserId: number | null = null
  private processedMessageIds: Set<number> = new Set()
  private stoppedChats: Set<number> = new Set()
  private chatModel: ChatModel | null = null

  constructor() {
    this.app = express()
    this.setupExpress()
    this.initializeBot()
    this.initializeChatModel()
  }

  private async initializeChatModel() {
    try {
      const modelName = process.env.DEFAULT_MODEL || 'openrouter'
      this.chatModel = new ChatModel(modelName)
      await this.chatModel.initialize()
      console.log(`🤖 AI Model initialized: ${modelName}`)
    } catch (error) {
      console.error('❌ Failed to initialize chat model:', error)
    }
  }

  private setupExpress() {
    this.app.use(express.json())

    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'working-telegram-bot',
        timestamp: new Date().toISOString(),
        processed_messages: this.processedMessageIds.size,
        authorized_user: AUTHORIZED_USER
      })
    })
  }

  private async initializeBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      console.error('❌ No TELEGRAM_BOT_TOKEN found')
      return
    }

    const botConfig: BotConfig = {
      token,
      name: 'Working Telegram Bot',
      allowed_updates: ['message'],
      drop_pending_updates: true,
    }

    this.bot = {
      id: 'default',
      name: 'Default Bot',
      client: new TelegramBotClient(botConfig),
      config: botConfig,
      created_at: new Date().toISOString()
    }

    const result = await this.bot.client.getMe()
    if (result.success && result.data) {
      console.log('✅ Telegram bot initialized:', result.data.username)
      this.bot.bot_info = result.data
      this.botUserId = result.data.id
      console.log('🤖 Bot user ID:', this.botUserId)
      console.log('🔒 Authorized user:', AUTHORIZED_USER)
      this.startPolling()
    }
  }

  private async startPolling() {
    console.log('🔄 Starting Telegram polling...')
    
    while (true) {
      try {
        const updates = await this.bot!.client.getUpdates({
          offset: this.pollingOffset,
          timeout: 30,
          allowed_updates: ['message']
        })

        if (updates.success && updates.data) {
          for (const update of updates.data) {
            this.pollingOffset = update.update_id + 1
            await this.handleUpdate(update)
          }
        }
      } catch (error) {
        console.error('❌ Polling error:', error)
        await new Promise(resolve => setTimeout(resolve, 5000))
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  private async handleUpdate(update: any) {
    if (!update.message || !update.message.text) return

    const message = update.message
    const messageId = message.message_id
    const chatId = message.chat.id
    const username = message.from?.username || 'unknown'
    const text = message.text
    const userId = message.from?.id
    const isBot = message.from?.is_bot || false

    // CRITICAL: Track message ID to prevent reprocessing
    if (this.processedMessageIds.has(messageId)) {
      console.log(`🔄 Already processed message ${messageId}`)
      return
    }
    this.processedMessageIds.add(messageId)

    // Keep only last 1000 message IDs to prevent memory leak
    if (this.processedMessageIds.size > 1000) {
      const oldestIds = Array.from(this.processedMessageIds).slice(0, 100)
      oldestIds.forEach(id => this.processedMessageIds.delete(id))
    }

    // CRITICAL: Ignore ALL bot messages
    if (isBot) {
      console.log(`🤖 Ignoring bot message ${messageId} from bot`)
      return
    }

    // Double check - ignore if it's our bot ID
    if (userId === this.botUserId) {
      console.log(`🤖 Ignoring our own message ${messageId}`)
      return
    }

    console.log(`💬 Message ${messageId} from @${username} (${chatId}): ${text}`)

    // Handle stop/start
    if (text.toLowerCase() === 'stop') {
      this.stoppedChats.add(chatId)
      await this.sendMessage(chatId, '⏹️ Stopped. Send "start" to resume.')
      return
    }

    if (text.toLowerCase() === 'start') {
      this.stoppedChats.delete(chatId)
      await this.sendMessage(chatId, '▶️ Started! I can help with:\n\n• General questions\n• :h commands for workspace access (authorized users only)\n\nHow can I assist you?')
      return
    }

    // If stopped, ignore
    if (this.stoppedChats.has(chatId)) {
      console.log('⏹️ Chat is stopped, ignoring message')
      return
    }

    // Handle :h commands
    if (text.startsWith(':h')) {
      // Check authorization - case insensitive, remove @ if present
      const cleanUsername = username.replace('@', '').toLowerCase()
      const cleanAuthorized = AUTHORIZED_USER.replace('@', '').toLowerCase()
      
      if (cleanUsername !== cleanAuthorized) {
        console.log(`⛔ Unauthorized user: ${username} (expected ${AUTHORIZED_USER})`)
        await this.sendMessage(chatId, `⛔ Sorry @${username}, workspace commands are only available to @${AUTHORIZED_USER}.`)
        return
      }

      const parts = text.split(' ')
      
      if (parts.length === 1) {
        await this.sendMessage(chatId, '📚 What would you like to work on? Use :h help for commands.')
        return
      }

      const command = parts[1]
      
      // Handle /ls typo
      if (command.startsWith('/')) {
        const actualCommand = command.substring(1)
        await this.handleWorkspaceCommand(chatId, actualCommand, parts.slice(2))
        return
      }

      await this.handleWorkspaceCommand(chatId, command, parts.slice(2))
    } else {
      // Regular AI chat
      await this.handleChatMessage(chatId, text)
    }
  }

  private async handleWorkspaceCommand(chatId: number, command: string, args: string[]) {
    switch (command) {
      case 'ls':
        await this.handleListCommand(chatId, args[0])
        break
      case 'cat':
      case 'read':
        if (args.length === 0) {
          await this.sendMessage(chatId, '❓ Usage: :h cat <filename>')
          return
        }
        await this.handleReadCommand(chatId, args.join(' '))
        break
      case 'help':
        await this.sendMessage(chatId, `📚 **Workspace Commands:**
:h ls [dir] - List files
:h cat <file> - Read file contents
:h read <file> - Same as cat
:h help - This help message

Regular messages will be answered by AI.
Say "stop" to pause all messages.`)
        break
      default:
        await this.sendMessage(chatId, `❓ Unknown command: ${command}. Try :h help`)
    }
  }

  private async handleListCommand(chatId: number, dir?: string) {
    try {
      const targetPath = dir ? path.join(WORKSPACE_PATH, dir) : WORKSPACE_PATH
      const files = await fs.readdir(targetPath)
      const fileList = files.slice(0, 20).join('\n')
      const remaining = files.length > 20 ? `\n... and ${files.length - 20} more files` : ''
      await this.sendMessage(chatId, `📂 **Files in ${dir || 'workspace'}:**\n\`\`\`\n${fileList}${remaining}\n\`\`\``)
    } catch (error) {
      await this.sendMessage(chatId, `❌ Error listing files: ${error}`)
    }
  }

  private async handleReadCommand(chatId: number, filename: string) {
    try {
      const filePath = path.join(WORKSPACE_PATH, filename)
      const content = await fs.readFile(filePath, 'utf-8')
      const preview = content.slice(0, 3000)
      const truncated = content.length > 3000 ? '\n\n... (truncated)' : ''
      
      await this.sendMessage(chatId, `📄 **${filename}:**\n\`\`\`\n${preview}${truncated}\n\`\`\``)
    } catch (error) {
      await this.sendMessage(chatId, `❌ Error reading file: ${error}`)
    }
  }

  private async handleChatMessage(chatId: number, text: string) {
    if (!this.chatModel) {
      await this.sendMessage(chatId, '❌ AI model not initialized. Please try again later.')
      return
    }

    try {
      // Get AI response
      const response = await this.chatModel.send(text, chatId.toString())
      
      // Send response
      await this.sendMessage(chatId, response.content || 'I apologize, but I couldn\'t generate a response.')
    } catch (error) {
      console.error('❌ Chat error:', error)
      await this.sendMessage(chatId, '❌ Sorry, I encountered an error. Please try again.')
    }
  }

  private async sendMessage(chatId: number, text: string) {
    if (!this.bot) return
    
    try {
      const result = await this.bot.client.sendMessage({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })

      if (!result.success) {
        console.error('❌ Failed to send:', result.error)
      } else {
        console.log('✅ Sent:', text.substring(0, 50) + (text.length > 50 ? '...' : ''))
      }
    } catch (error) {
      console.error('❌ Send error:', error)
    }
  }

  async start() {
    this.app.listen(this.port, () => {
      console.log(`🌐 Server on port ${this.port}`)
      console.log('✅ Working bot started!')
      console.log('🔒 Authorized user:', AUTHORIZED_USER)
      console.log('🚫 Bot will ignore ALL bot messages')
      console.log('📝 Tracking message IDs to prevent loops')
      console.log('🤖 AI chat enabled for regular messages')
    })
  }
}

const server = new WorkingTelegramBot()
server.start().catch(console.error)