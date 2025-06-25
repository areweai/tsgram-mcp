#!/usr/bin/env node

/**
 * TELEGRAM-CLAUDE MESSAGE QUEUE
 * 
 * This creates a file-based message queue that allows:
 * 1. Telegram messages to be written to a queue file
 * 2. Claude Code to monitor and process messages
 * 3. Responses to be sent back to Telegram
 * 
 * This works with the CURRENT Claude session by using file monitoring.
 */

import { TelegramBotClient } from './telegram/bot-client.js'
import { BotConfig, Update } from './types/telegram.js'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import { existsSync, mkdirSync, createReadStream, createWriteStream } from 'fs'
import path from 'path'
import readline from 'readline'

// Load environment variables
dotenv.config()

const QUEUE_DIR = path.join(process.cwd(), '.telegram-queue')
const INCOMING_QUEUE = path.join(QUEUE_DIR, 'incoming.jsonl')
const OUTGOING_QUEUE = path.join(QUEUE_DIR, 'outgoing.jsonl')
const SESSION_STATE = path.join(QUEUE_DIR, 'session.json')

interface QueueMessage {
  id: string
  timestamp: string
  type: 'telegram_in' | 'claude_out'
  chatId: number
  username: string
  message: string
  processed?: boolean
}

interface SessionState {
  active: boolean
  startTime: string
  lastActivity: string
  messageCount: number
  claudeSessionId?: string
}

class TelegramClaudeQueue {
  private botClient: TelegramBotClient | null = null
  private pollingInterval: number = 2000
  private isRunning: boolean = false
  private sessionState: SessionState

  constructor() {
    this.sessionState = {
      active: false,
      startTime: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messageCount: 0
    }

    this.initializeQueue()
  }

  /**
   * INITIALIZE MESSAGE QUEUE
   */
  private async initializeQueue() {
    // Create queue directory if it doesn't exist
    if (!existsSync(QUEUE_DIR)) {
      mkdirSync(QUEUE_DIR, { recursive: true })
    }

    // Create queue files if they don't exist
    if (!existsSync(INCOMING_QUEUE)) {
      await fs.writeFile(INCOMING_QUEUE, '')
    }
    if (!existsSync(OUTGOING_QUEUE)) {
      await fs.writeFile(OUTGOING_QUEUE, '')
    }

    // Load or create session state
    if (existsSync(SESSION_STATE)) {
      const state = await fs.readFile(SESSION_STATE, 'utf-8')
      this.sessionState = JSON.parse(state)
    } else {
      await this.saveSessionState()
    }

    console.log('✅ Message queue initialized at:', QUEUE_DIR)
  }

  /**
   * SAVE SESSION STATE
   */
  private async saveSessionState() {
    await fs.writeFile(SESSION_STATE, JSON.stringify(this.sessionState, null, 2))
  }

  /**
   * START TELEGRAM BOT
   */
  async startTelegramBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      console.error('❌ TELEGRAM_BOT_TOKEN not found in environment')
      return
    }

    const botConfig: BotConfig = {
      token,
      name: 'Claude Queue Bot',
      allowed_updates: ['message'],
      drop_pending_updates: true,
    }

    this.botClient = new TelegramBotClient(botConfig)
    
    const result = await this.botClient.getMe()
    if (result.success) {
      console.log('✅ Telegram bot connected:', result.data?.username)
    } else {
      console.error('❌ Failed to connect to Telegram:', result.error)
      return
    }

    this.isRunning = true
    this.sessionState.active = true
    await this.saveSessionState()

    // Start polling
    this.startPolling()
    
    // Start monitoring outgoing messages
    this.monitorOutgoingQueue()
  }

  /**
   * START TELEGRAM POLLING
   */
  private async startPolling() {
    let offset = 0

    while (this.isRunning) {
      try {
        const updates = await this.botClient!.getUpdates({
          offset,
          timeout: 30,
          allowed_updates: ['message']
        })

        if (updates.success && updates.data) {
          for (const update of updates.data) {
            offset = update.update_id + 1
            await this.handleUpdate(update)
          }
        }
      } catch (error) {
        console.error('❌ Polling error:', error)
      }

      await new Promise(resolve => setTimeout(resolve, this.pollingInterval))
    }
  }

  /**
   * HANDLE TELEGRAM UPDATE
   */
  private async handleUpdate(update: Update) {
    if (!update.message || !update.message.text) return

    const { message } = update
    const chatId = message.chat.id
    const username = message.from?.username || 'unknown'
    const text = message.text

    // Only process messages from authorized user
    const AUTHORIZED_CHAT_ID = process.env.AUTHORIZED_CHAT_ID ? parseInt(process.env.AUTHORIZED_CHAT_ID) : null
    if (chatId !== AUTHORIZED_CHAT_ID) {
      console.log(`⚠️  Ignoring message from ${username}`)
      return
    }

    console.log(`📨 Message from @${username}: ${text}`)

    // Create queue message
    const queueMessage: QueueMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type: 'telegram_in',
      chatId,
      username,
      message: text,
      processed: false
    }

    // Append to incoming queue
    await this.appendToQueue(INCOMING_QUEUE, queueMessage)

    // Update session state
    this.sessionState.lastActivity = new Date().toISOString()
    this.sessionState.messageCount++
    await this.saveSessionState()

    // Don't send acknowledgment - user requested no processing messages
  }

  /**
   * APPEND MESSAGE TO QUEUE
   */
  private async appendToQueue(queueFile: string, message: QueueMessage) {
    const line = JSON.stringify(message) + '\n'
    await fs.appendFile(queueFile, line)
    console.log(`✅ Added to queue: ${message.id}`)
  }

  /**
   * MONITOR OUTGOING QUEUE
   */
  private async monitorOutgoingQueue() {
    console.log('👀 Monitoring outgoing queue for Claude responses...')

    while (this.isRunning) {
      try {
        // Read outgoing queue
        const content = await fs.readFile(OUTGOING_QUEUE, 'utf-8')
        const lines = content.trim().split('\n').filter(line => line)
        
        const processedMessages: string[] = []
        
        for (const line of lines) {
          try {
            const message: QueueMessage = JSON.parse(line)
            
            if (!message.processed && message.type === 'claude_out') {
              // Send to Telegram
              await this.sendToTelegram(message)
              
              // Mark as processed
              message.processed = true
              processedMessages.push(JSON.stringify(message))
            } else {
              processedMessages.push(line)
            }
          } catch (error) {
            console.error('❌ Error processing outgoing message:', error)
          }
        }
        
        // Update outgoing queue with processed flags
        if (processedMessages.length > 0) {
          await fs.writeFile(OUTGOING_QUEUE, processedMessages.join('\n') + '\n')
        }
      } catch (error) {
        // Ignore errors, keep monitoring
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  /**
   * SEND MESSAGE TO TELEGRAM
   */
  private async sendToTelegram(message: QueueMessage) {
    if (!this.botClient) return

    const result = await this.botClient.sendMessage({
      chat_id: message.chatId,
      text: message.message,
      parse_mode: 'Markdown'
    })

    if (result.success) {
      console.log(`✅ Sent Claude response to @${message.username}`)
    } else {
      console.error(`❌ Failed to send response: ${result.error}`)
    }
  }

  /**
   * STOP THE QUEUE
   */
  async stop() {
    this.isRunning = false
    this.sessionState.active = false
    await this.saveSessionState()
    console.log('👋 Telegram-Claude queue stopped')
  }
}

// CLI Interface for queue management
async function main() {
  const queue = new TelegramClaudeQueue()
  
  const command = process.argv[2]
  
  if (command === 'start') {
    console.log('🚀 Starting Telegram-Claude message queue...')
    console.log('📁 Queue directory:', QUEUE_DIR)
    console.log('📥 Incoming messages:', INCOMING_QUEUE)
    console.log('📤 Outgoing messages:', OUTGOING_QUEUE)
    console.log('\n⚡ Claude can now read from incoming.jsonl and write to outgoing.jsonl')
    
    // Handle shutdown
    process.on('SIGINT', async () => {
      console.log('\n⏹️  Shutting down...')
      await queue.stop()
      process.exit(0)
    })
    
    await queue.startTelegramBot()
  } else if (command === 'status') {
    // Show queue status
    const state = JSON.parse(await fs.readFile(SESSION_STATE, 'utf-8'))
    console.log('📊 Queue Status:')
    console.log(`  Active: ${state.active}`)
    console.log(`  Messages: ${state.messageCount}`)
    console.log(`  Last Activity: ${state.lastActivity}`)
  } else if (command === 'clear') {
    // Clear queues
    await fs.writeFile(INCOMING_QUEUE, '')
    await fs.writeFile(OUTGOING_QUEUE, '')
    console.log('🧹 Queues cleared')
  } else {
    console.log('Usage: npm run telegram-queue [start|status|clear]')
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { TelegramClaudeQueue, QueueMessage, INCOMING_QUEUE, OUTGOING_QUEUE }