#!/usr/bin/env node

/**
 * TELEGRAM TO CLAUDE BRIDGE
 * 
 * This service receives messages from Telegram and forwards them
 * to an active Claude Code session, maintaining conversation context.
 * 
 * Features:
 * - Webhook listener for Telegram messages
 * - Session context management
 * - Named pipe communication with Claude
 * - Security filtering for incoming messages
 */

import express from 'express'
import { TelegramBotClient } from './telegram/bot-client.js'
import { BotConfig, Update } from './types/telegram.js'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'
import { createWriteStream, existsSync, mkdirSync } from 'fs'
import { execSync } from 'child_process'

// Load environment variables
dotenv.config()

interface BridgeConfig {
  telegram_bot_token: string
  webhook_port: number
  webhook_path: string
  claude_pipe_path: string
  allowed_chat_ids: number[]
  session_timeout_ms: number
}

interface Session {
  id: string
  chatId: number
  username: string
  startTime: Date
  lastActivity: Date
  messageCount: number
  context: string[]
}

class TelegramToClaudeBridge {
  private config: BridgeConfig
  private botClient: TelegramBotClient | null = null
  private app: express.Application
  private sessions: Map<number, Session> = new Map()
  private claudePipe: NodeJS.WritableStream | null = null

  constructor() {
    this.config = {
      telegram_bot_token: process.env.TELEGRAM_BOT_TOKEN || '',
      webhook_port: parseInt(process.env.TG_CLAUDE_WEBHOOK_PORT || '4041'),
      webhook_path: '/telegram-to-claude-webhook',
      claude_pipe_path: '/tmp/claude-telegram-pipe',
      allowed_chat_ids: [5988959818], // @duncist's chat ID
      session_timeout_ms: 30 * 60 * 1000 // 30 minutes
    }

    this.app = express()
    this.setupExpress()
    this.initializeBot()
    this.initializeNamedPipe()
  }

  /**
   * SETUP EXPRESS SERVER
   */
  private setupExpress() {
    this.app.use(express.json())
    
    // Webhook endpoint
    this.app.post(this.config.webhook_path, async (req, res) => {
      try {
        const update: Update = req.body
        await this.handleTelegramUpdate(update)
        res.sendStatus(200)
      } catch (error) {
        console.error('❌ Webhook error:', error)
        res.sendStatus(500)
      }
    })

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        service: 'telegram-to-claude-bridge',
        sessions: this.sessions.size,
        pipe_connected: this.claudePipe !== null
      })
    })
  }

  /**
   * INITIALIZE TELEGRAM BOT
   */
  private async initializeBot() {
    if (!this.config.telegram_bot_token) {
      console.error('❌ No Telegram bot token found')
      return
    }

    const botConfig: BotConfig = {
      token: this.config.telegram_bot_token,
      name: 'Telegram-Claude Bridge',
      allowed_updates: ['message'],
      drop_pending_updates: true,
    }

    this.botClient = new TelegramBotClient(botConfig)
    
    // Set webhook
    const webhookUrl = `${process.env.WEBHOOK_BASE_URL || 'http://localhost:4041'}${this.config.webhook_path}`
    const result = await this.botClient.setWebhook({
      url: webhookUrl,
      allowed_updates: ['message']
    })

    if (result.success) {
      console.log('✅ Telegram webhook set:', webhookUrl)
    } else {
      console.error('❌ Failed to set webhook:', result.error)
    }
  }

  /**
   * INITIALIZE NAMED PIPE FOR CLAUDE COMMUNICATION
   */
  private async initializeNamedPipe() {
    try {
      // Create named pipe if it doesn't exist
      if (!existsSync(this.config.claude_pipe_path)) {
        // Use mkfifo command directly
        try {
          execSync(`mkfifo ${this.config.claude_pipe_path}`)
          console.log('✅ Created named pipe:', this.config.claude_pipe_path)
        } catch (error) {
          // Pipe might already exist
          console.log('⚠️  Named pipe might already exist')
        }
      }

      // Open pipe for writing (non-blocking)
      this.claudePipe = createWriteStream(this.config.claude_pipe_path, { 
        flags: 'a',
        highWaterMark: 0
      })
      console.log('✅ Connected to Claude pipe')
    } catch (error) {
      console.error('❌ Failed to initialize named pipe:', error)
    }
  }

  /**
   * HANDLE TELEGRAM UPDATE
   */
  private async handleTelegramUpdate(update: Update) {
    if (!update.message || !update.message.text) {
      return
    }

    const { message } = update
    const chatId = message.chat.id
    const username = message.from?.username || 'unknown'
    const text = message.text

    // Check if chat is allowed
    if (!this.config.allowed_chat_ids.includes(chatId)) {
      console.log(`⚠️  Ignoring message from unauthorized chat: ${chatId}`)
      return
    }

    // Get or create session
    let session = this.sessions.get(chatId)
    if (!session) {
      session = this.createSession(chatId, username)
    }

    // Update session
    session.lastActivity = new Date()
    session.messageCount++
    session.context.push(`User: ${text}`)

    // Forward to Claude
    await this.forwardToClaude(text, session)

    // Send acknowledgment to Telegram
    if (this.botClient) {
      await this.botClient.sendMessage({
        chat_id: chatId,
        text: '🔄 Processing your message in Claude Code...',
        reply_to_message_id: message.message_id
      })
    }
  }

  /**
   * CREATE NEW SESSION
   */
  private createSession(chatId: number, username: string): Session {
    const session: Session = {
      id: `session-${Date.now()}`,
      chatId,
      username,
      startTime: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      context: []
    }

    this.sessions.set(chatId, session)
    console.log(`✅ Created new session for @${username}`)
    
    // Clean up old sessions
    this.cleanupSessions()

    return session
  }

  /**
   * FORWARD MESSAGE TO CLAUDE
   */
  private async forwardToClaude(message: string, session: Session) {
    if (!this.claudePipe) {
      console.error('❌ Claude pipe not initialized')
      return
    }

    try {
      // Format message for Claude
      const formattedMessage = {
        type: 'telegram_message',
        session_id: session.id,
        chat_id: session.chatId,
        username: session.username,
        message: message,
        timestamp: new Date().toISOString(),
        context_length: session.context.length
      }

      // Write to pipe
      this.claudePipe.write(JSON.stringify(formattedMessage) + '\n')
      console.log(`✅ Forwarded message to Claude from @${session.username}`)
    } catch (error) {
      console.error('❌ Failed to forward to Claude:', error)
    }
  }

  /**
   * CLEANUP OLD SESSIONS
   */
  private cleanupSessions() {
    const now = Date.now()
    for (const [chatId, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > this.config.session_timeout_ms) {
        this.sessions.delete(chatId)
        console.log(`🧹 Cleaned up session for chat ${chatId}`)
      }
    }
  }

  /**
   * START THE BRIDGE SERVICE
   */
  async start() {
    // Start Express server
    this.app.listen(this.config.webhook_port, () => {
      console.log(`🚀 Telegram-Claude bridge listening on port ${this.config.webhook_port}`)
      console.log(`📡 Webhook path: ${this.config.webhook_path}`)
      console.log(`🔧 Claude pipe: ${this.config.claude_pipe_path}`)
    })

    // Periodic session cleanup
    setInterval(() => this.cleanupSessions(), 60000) // Every minute
  }

  /**
   * STOP THE BRIDGE SERVICE
   */
  async stop() {
    if (this.claudePipe) {
      this.claudePipe.end()
    }
    console.log('👋 Telegram-Claude bridge stopped')
  }
}

// CLI Interface
async function main() {
  const bridge = new TelegramToClaudeBridge()
  
  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    console.log('\n⏹️  Shutting down...')
    await bridge.stop()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await bridge.stop()
    process.exit(0)
  })

  // Start the bridge
  await bridge.start()
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { TelegramToClaudeBridge }