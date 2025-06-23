#!/usr/bin/env node

/**
 * SIMPLE WORKING TELEGRAM BOT
 * Just responds to messages without complex anti-spam
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

class SimpleTelegramBot {
  private app: express.Application
  private bot: BotInstance | null = null
  private port: number = parseInt(process.env.MCP_SERVER_PORT || '4040')
  private pollingOffset: number = 0
  private lastMessageTime: Map<number, number> = new Map()
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
        service: 'simple-telegram-bot',
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
      name: 'Simple Telegram Bot',
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
    if (result.success) {
      console.log('✅ Telegram bot initialized:', result.data?.username)
      this.bot.bot_info = result.data
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

    // Ignore bot messages
    if (message.from?.is_bot) return

    console.log(`💬 Message from @${username} (${chatId}): ${text}`)

    // Simple rate limit - max 1 message per second per chat
    const now = Date.now()
    const lastTime = this.lastMessageTime.get(chatId) || 0
    if (now - lastTime < 1000) {
      console.log('⏱️ Rate limited')
      return
    }
    this.lastMessageTime.set(chatId, now)

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
        await this.sendMessage(chatId, '⛔ Sorry, you are not authorized.')
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
          await this.sendMessage(chatId, `📚 **Commands:**
:h ls - List files
:h help - This help
:h - Quick prompt

Say "stop" to pause messages.`)
          break
        default:
          await this.sendMessage(chatId, `❓ Unknown command: ${command}`)
      }
    } else {
      // Simple echo for other messages
      await this.sendMessage(chatId, `You said: "${text}"`)
    }
  }

  private async handleListCommand(chatId: number) {
    try {
      const files = await fs.readdir(WORKSPACE_PATH)
      await this.sendMessage(chatId, `📂 **Files:**\n${files.join('\n')}`)
    } catch (error) {
      await this.sendMessage(chatId, `❌ Error: ${error}`)
    }
  }

  private async sendMessage(chatId: number, text: string) {
    if (!this.bot) return
    
    const result = await this.bot.client.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown'
    })

    if (!result.success) {
      console.error('Failed to send:', result.error)
    } else {
      console.log('✅ Sent:', text.substring(0, 50))
    }
  }

  async start() {
    this.app.listen(this.port, () => {
      console.log(`🌐 Server on port ${this.port}`)
      console.log('✅ Simple bot started!')
    })
  }
}

const server = new SimpleTelegramBot()
server.start().catch(console.error)