#!/usr/bin/env node

/**
 * CLAUDE-TELEGRAM SESSION MANAGER
 * 
 * This script manages bidirectional communication between Claude Code
 * and Telegram, allowing Telegram messages to be injected into the
 * current Claude session and responses to be sent back.
 * 
 * Architecture:
 * - Spawns Claude Code CLI with modified stdin/stdout
 * - Intercepts Telegram messages via named pipe
 * - Forwards Claude responses to Telegram
 * - Maintains session context
 */

import { spawn, ChildProcess } from 'child_process'
import { createReadStream, createWriteStream, existsSync, unlinkSync } from 'fs'
import { execSync } from 'child_process'
import readline from 'readline'
import { CLITelegramBridge } from './cli-telegram-bridge.js'
import path from 'path'

interface SessionConfig {
  claudeCommand: string
  claudeArgs: string[]
  pipePath: string
  enableTelegramForwarding: boolean
  sessionTimeout: number
}

interface TelegramMessage {
  type: string
  session_id: string
  chat_id: number
  username: string
  message: string
  timestamp: string
  context_length: number
}

class ClaudeTelegramSession {
  private config: SessionConfig
  private claudeProcess: ChildProcess | null = null
  private telegramBridge: CLITelegramBridge
  private pipeReader: readline.Interface | null = null
  private isActive: boolean = false
  private messageQueue: string[] = []
  private lastActivity: Date = new Date()

  constructor() {
    this.config = {
      claudeCommand: 'claude',
      claudeArgs: [],
      pipePath: '/tmp/claude-telegram-pipe',
      enableTelegramForwarding: true,
      sessionTimeout: 30 * 60 * 1000 // 30 minutes
    }

    this.telegramBridge = new CLITelegramBridge()
  }

  /**
   * START CLAUDE SESSION WITH TELEGRAM INTEGRATION
   */
  async start(initialCommand?: string) {
    console.log('🚀 Starting Claude-Telegram integrated session...')

    // Create named pipe if it doesn't exist
    if (!existsSync(this.config.pipePath)) {
      try {
        execSync(`mkfifo ${this.config.pipePath}`)
        console.log('✅ Created named pipe for Telegram messages')
      } catch (error) {
        console.log('⚠️  Named pipe might already exist')
      }
    }

    // Start listening to pipe
    this.startPipeListener()

    // Prepare Claude command
    const args = [...this.config.claudeArgs]
    if (initialCommand) {
      args.push(initialCommand)
    }

    // Spawn Claude process
    this.claudeProcess = spawn(this.config.claudeCommand, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    })

    this.isActive = true
    this.setupClaudeHandlers()

    // Handle session timeout
    this.startTimeoutChecker()

    console.log('✅ Claude-Telegram session started')
    console.log('📱 Telegram messages will be injected into this session')
    console.log('📤 Claude responses will be forwarded to Telegram')
  }

  /**
   * SETUP CLAUDE PROCESS HANDLERS
   */
  private setupClaudeHandlers() {
    if (!this.claudeProcess) return

    // Handle Claude stdout (responses)
    this.claudeProcess.stdout?.on('data', async (data) => {
      const output = data.toString()
      
      // Display to console
      process.stdout.write(output)
      
      // Forward to Telegram if enabled
      if (this.config.enableTelegramForwarding) {
        await this.telegramBridge.forwardResponse(output, {
          command: 'claude-session',
          timestamp: new Date().toISOString()
        })
      }

      this.lastActivity = new Date()
    })

    // Handle Claude stderr
    this.claudeProcess.stderr?.on('data', (data) => {
      process.stderr.write(data)
    })

    // Handle Claude exit
    this.claudeProcess.on('exit', (code) => {
      console.log(`\n⏹️  Claude process exited with code ${code}`)
      this.cleanup()
    })

    // Forward console input to Claude
    process.stdin.on('data', (data) => {
      this.claudeProcess?.stdin?.write(data)
      this.lastActivity = new Date()
    })

    // Process message queue
    this.processMessageQueue()
  }

  /**
   * START LISTENING TO TELEGRAM PIPE
   */
  private startPipeListener() {
    const stream = createReadStream(this.config.pipePath, { 
      flags: 'r+',
      encoding: 'utf8'
    })

    this.pipeReader = readline.createInterface({
      input: stream,
      crlfDelay: Infinity
    })

    this.pipeReader.on('line', (line) => {
      try {
        const message: TelegramMessage = JSON.parse(line)
        if (message.type === 'telegram_message') {
          this.handleTelegramMessage(message)
        }
      } catch (error) {
        console.error('❌ Failed to parse pipe message:', error)
      }
    })

    console.log('✅ Listening for Telegram messages on pipe')
  }

  /**
   * HANDLE INCOMING TELEGRAM MESSAGE
   */
  private handleTelegramMessage(message: TelegramMessage) {
    console.log(`\n📱 Telegram message from @${message.username}: ${message.message}`)
    
    // Format message for Claude
    const formattedMessage = `\n[Telegram @${message.username}]: ${message.message}\n`
    
    // Add to queue
    this.messageQueue.push(formattedMessage)
    
    // Update activity
    this.lastActivity = new Date()
  }

  /**
   * PROCESS MESSAGE QUEUE
   */
  private async processMessageQueue() {
    setInterval(() => {
      if (this.messageQueue.length > 0 && this.claudeProcess?.stdin) {
        const message = this.messageQueue.shift()
        if (message) {
          // Inject message into Claude stdin
          this.claudeProcess.stdin.write(message)
          console.log('✅ Injected Telegram message into Claude session')
        }
      }
    }, 100) // Check every 100ms
  }

  /**
   * CHECK FOR SESSION TIMEOUT
   */
  private startTimeoutChecker() {
    setInterval(() => {
      const now = Date.now()
      const lastActivityTime = this.lastActivity.getTime()
      
      if (now - lastActivityTime > this.config.sessionTimeout) {
        console.log('\n⏱️  Session timeout - no activity for 30 minutes')
        this.stop()
      }
    }, 60000) // Check every minute
  }

  /**
   * STOP THE SESSION
   */
  async stop() {
    console.log('\n⏹️  Stopping Claude-Telegram session...')
    
    this.isActive = false
    
    if (this.claudeProcess) {
      this.claudeProcess.kill('SIGTERM')
    }
    
    if (this.pipeReader) {
      this.pipeReader.close()
    }
    
    this.cleanup()
  }

  /**
   * CLEANUP RESOURCES
   */
  private cleanup() {
    // Remove pipe if it exists
    if (existsSync(this.config.pipePath)) {
      try {
        unlinkSync(this.config.pipePath)
        console.log('✅ Cleaned up named pipe')
      } catch (error) {
        console.error('❌ Failed to remove pipe:', error)
      }
    }
    
    process.exit(0)
  }
}

// CLI Interface
async function main() {
  const session = new ClaudeTelegramSession()
  
  // Get initial command from args
  const args = process.argv.slice(2)
  const initialCommand = args.length > 0 ? args.join(' ') : undefined
  
  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    await session.stop()
  })
  
  process.on('SIGTERM', async () => {
    await session.stop()
  })
  
  // Start session
  await session.start(initialCommand)
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { ClaudeTelegramSession }