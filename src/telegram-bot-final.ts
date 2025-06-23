#!/usr/bin/env node

/**
 * FINAL WORKING TELEGRAM BOT
 * - Properly ignores bot messages
 * - Simple anti-spam
 * - Working commands
 */

import express from 'express'
import { TelegramBotClient } from './telegram/bot-client.js'
import { BotConfig } from './types/telegram.js'
import fs from 'fs/promises'
import path from 'path'
import dotenv from 'dotenv'

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

class FinalTelegramBot {
  private app: express.Application
  private bot: BotInstance | null = null
  private port: number = parseInt(process.env.MCP_SERVER_PORT || '4040')
  private pollingOffset: number = 0
  private botUserId: number | null = null
  private lastSentMessage: Map<number, string> = new Map()
  private stoppedChats: Set<number> = new Set()

  constructor() {
    this.app = express()
    this.setupExpress()
    this.initializeBot()
  }

  private setupExpress() {
    this.app.use(express.json())

    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'final-telegram-bot',
        timestamp: new Date().toISOString()
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
      name: 'Final Telegram Bot',
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
    const chatId = message.chat.id
    const username = message.from?.username || 'unknown'
    const text = message.text
    const userId = message.from?.id

    // CRITICAL: Ignore messages from our bot
    if (message.from?.is_bot) {
      console.log('🤖 Ignoring bot message')
      return
    }

    // Double check - ignore if it's our bot ID
    if (userId === this.botUserId) {
      console.log('🤖 Ignoring our own message')
      return
    }

    console.log(`💬 Message from @${username} (${chatId}): ${text}`)

    // Don't respond to the same message twice
    const lastSent = this.lastSentMessage.get(chatId)
    if (lastSent && lastSent === text) {
      console.log('🔄 Ignoring duplicate message')
      return
    }

    // Handle stop/start
    if (text.toLowerCase() === 'stop') {
      this.stoppedChats.add(chatId)
      await this.sendMessage(chatId, '⏹️ Stopped. Send "start" to resume.')
      return
    }

    if (text.toLowerCase() === 'start') {
      this.stoppedChats.delete(chatId)
      await this.sendMessage(chatId, '▶️ Started! How can I help?')
      return
    }

    // If stopped, ignore
    if (this.stoppedChats.has(chatId)) {
      return
    }

    // Handle :h commands
    if (text.startsWith(':h')) {
      // Check authorization
      if (username !== AUTHORIZED_USER) {
        await this.sendMessage(chatId, '⛔ Sorry, you are not authorized for workspace commands.')
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
        await this.sendMessage(chatId, '💡 Did you mean **:h ls**? (without the slash)')
        return
      }

      switch (command) {
        case 'ls':
          await this.handleListCommand(chatId)
          break
        case 'help':
          await this.sendMessage(chatId, `📚 **Workspace Commands:**
:h ls - List files
:h help - This help
:h - Quick prompt

Say "stop" to pause messages.`)
          break
        default:
          await this.sendMessage(chatId, `❓ Unknown command: ${command}. Try :h help`)
      }
    } else if (text.toLowerCase().includes('hello')) {
      await this.sendMessage(chatId, 'Hello! I\'m the Hermes bot. Try :h help for commands.')
    } else {
      // Simple response for other messages
      await this.sendMessage(chatId, `I received: "${text}". Try :h help for commands.`)
    }
  }

  private async handleListCommand(chatId: number) {
    try {
      const files = await fs.readdir(WORKSPACE_PATH)
      const fileList = files.slice(0, 10).join('\n')
      await this.sendMessage(chatId, `📂 **Workspace Files:**\n\`\`\`\n${fileList}\n\`\`\``)
    } catch (error) {
      await this.sendMessage(chatId, `❌ Error listing files: ${error}`)
    }
  }

  private async sendMessage(chatId: number, text: string) {
    if (!this.bot) return
    
    // Store what we're sending to avoid loops
    this.lastSentMessage.set(chatId, text)
    
    try {
      const result = await this.bot.client.sendMessage({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown'
      })

      if (!result.success) {
        console.error('❌ Failed to send:', result.error)
      } else {
        console.log('✅ Sent:', text.substring(0, 50))
      }
    } catch (error) {
      console.error('❌ Send error:', error)
    }
  }

  async start() {
    this.app.listen(this.port, () => {
      console.log(`🌐 Server on port ${this.port}`)
      console.log('✅ Final bot started!')
      console.log('🔒 Authorized user:', AUTHORIZED_USER)
    })
  }
}

const server = new FinalTelegramBot()
server.start().catch(console.error)