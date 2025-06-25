#!/usr/bin/env node

/**
 * CLAUDE-DOCKER TELEGRAM BRIDGE
 * 
 * This creates a bidirectional connection between Claude Code sessions
 * and the Telegram bot running in Docker.
 * 
 * Instead of complex webhook forwarding, this uses the existing MCP
 * tools to monitor and respond to messages.
 */

import { execSync, spawn } from 'child_process'
import { CLITelegramBridge } from './cli-telegram-bridge.js'
import readline from 'readline'
import dotenv from 'dotenv'

dotenv.config()

// Authorization configuration
const AUTHORIZED_CHAT_ID = process.env.AUTHORIZED_CHAT_ID ? parseInt(process.env.AUTHORIZED_CHAT_ID) : null

interface MessageHistory {
  chatId: number
  username: string
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
  }>
}

class ClaudeDockerBridge {
  private claudeProcess: any = null
  private telegramBridge: CLITelegramBridge
  private messageHistory: Map<number, MessageHistory> = new Map()
  private isMonitoring: boolean = false
  private lastMessageId: number = 0

  constructor() {
    this.telegramBridge = new CLITelegramBridge()
  }

  /**
   * START CLAUDE SESSION WITH DOCKER MONITORING
   */
  async start() {
    console.log('🚀 Starting Claude-Docker-Telegram Bridge...')
    
    // Check Docker container health
    const health = await this.checkDockerHealth()
    if (!health) {
      console.error('❌ Docker container not healthy. Please check: docker logs hermes-mcp-server')
      return
    }

    console.log('✅ Docker container is healthy')
    console.log(`📱 Monitoring Telegram messages for chat ID: ${AUTHORIZED_CHAT_ID}`)
    console.log('🤖 Claude responses will be forwarded to Telegram')
    console.log('\nPress Ctrl+C to stop\n')

    // Start monitoring in background
    this.startMessageMonitoring()

    // Start interactive Claude session
    await this.startClaudeSession()
  }

  /**
   * CHECK DOCKER CONTAINER HEALTH
   */
  private async checkDockerHealth(): Promise<boolean> {
    try {
      const response = await fetch('http://localhost:4040/health')
      const data = await response.json()
      return data.status === 'healthy'
    } catch (error) {
      return false
    }
  }

  /**
   * START MONITORING TELEGRAM MESSAGES
   */
  private async startMessageMonitoring() {
    this.isMonitoring = true
    
    // Poll Docker logs for new messages
    setInterval(async () => {
      if (!this.isMonitoring) return
      
      try {
        // Get recent logs
        const logs = execSync('docker logs hermes-mcp-server --tail 20 2>&1', { encoding: 'utf8' })
        
        // Parse for new messages from authorized chat ID
        const messagePattern = new RegExp(`💬 Message from \\w+ \\(${AUTHORIZED_CHAT_ID}\\): (.+)`, 'g')
        let match
        
        while ((match = messagePattern.exec(logs)) !== null) {
          const [_, message] = match
          
          if (!AUTHORIZED_CHAT_ID) continue
          
          // Check if this is a new message
          if (this.shouldProcessMessage(AUTHORIZED_CHAT_ID, message)) {
            console.log(`\n📨 New message from authorized user: "${message}"`)
            
            // Add to history
            this.addToHistory(AUTHORIZED_CHAT_ID, 'authorized_user', 'user', message)
            
            // Inject into Claude session if active
            if (this.claudeProcess) {
              const contextPrompt = this.buildContextPrompt(AUTHORIZED_CHAT_ID, message)
              this.claudeProcess.stdin.write(contextPrompt + '\n')
            }
          }
        }
      } catch (error) {
        // Ignore errors, keep monitoring
      }
    }, 2000) // Check every 2 seconds
  }

  /**
   * CHECK IF MESSAGE SHOULD BE PROCESSED
   */
  private shouldProcessMessage(chatId: number, message: string): boolean {
    const history = this.messageHistory.get(chatId)
    if (!history) return true
    
    // Check if message already exists in history
    const exists = history.messages.some(m => 
      m.role === 'user' && m.content === message
    )
    
    return !exists
  }

  /**
   * ADD MESSAGE TO HISTORY
   */
  private addToHistory(chatId: number, username: string, role: 'user' | 'assistant', content: string) {
    if (!this.messageHistory.has(chatId)) {
      this.messageHistory.set(chatId, {
        chatId,
        username,
        messages: []
      })
    }
    
    const history = this.messageHistory.get(chatId)!
    history.messages.push({
      role,
      content,
      timestamp: new Date()
    })
    
    // Keep only last 20 messages
    if (history.messages.length > 20) {
      history.messages = history.messages.slice(-20)
    }
  }

  /**
   * BUILD CONTEXT PROMPT FOR CLAUDE
   */
  private buildContextPrompt(chatId: number, newMessage: string): string {
    const history = this.messageHistory.get(chatId)
    
    let prompt = `[Telegram Message from authorized user]\n`
    
    // Add recent context if available
    if (history && history.messages.length > 1) {
      prompt += `Recent conversation:\n`
      const recentMessages = history.messages.slice(-5, -1)
      for (const msg of recentMessages) {
        prompt += `${msg.role === 'user' ? 'User' : 'You'}: ${msg.content}\n`
      }
      prompt += `\n`
    }
    
    prompt += `New message: ${newMessage}\n`
    prompt += `\nPlease respond to this Telegram message:`
    
    return prompt
  }

  /**
   * START CLAUDE SESSION
   */
  private async startClaudeSession() {
    // Spawn Claude process
    this.claudeProcess = spawn('claude', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    })

    // Handle Claude output
    this.claudeProcess.stdout.on('data', async (data: Buffer) => {
      const output = data.toString()
      
      // Display to console
      process.stdout.write(output)
      
      // Check if this is a response to a Telegram message
      if (output.includes('[Telegram Message from @duncist]') || 
          this.messageHistory.size > 0) {
        // Forward to Telegram
        await this.telegramBridge.forwardResponse(output, {
          command: 'claude-docker-bridge',
          timestamp: new Date().toISOString()
        })
        
        // Add to history
        if (AUTHORIZED_CHAT_ID) {
          this.addToHistory(AUTHORIZED_CHAT_ID, 'claude', 'assistant', output.trim())
        }
      }
    })

    // Handle Claude stderr
    this.claudeProcess.stderr.on('data', (data: Buffer) => {
      process.stderr.write(data)
    })

    // Handle Claude exit
    this.claudeProcess.on('exit', (code: number) => {
      console.log(`\nClaude process exited with code ${code}`)
      this.cleanup()
    })

    // Forward console input to Claude
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    })

    rl.on('line', (input) => {
      this.claudeProcess.stdin.write(input + '\n')
    })
  }

  /**
   * CLEANUP
   */
  private cleanup() {
    this.isMonitoring = false
    if (this.claudeProcess) {
      this.claudeProcess.kill('SIGTERM')
    }
    process.exit(0)
  }
}

// Main
async function main() {
  const bridge = new ClaudeDockerBridge()
  
  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\n⏹️  Shutting down...')
    bridge['cleanup']()
  })
  
  await bridge.start()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}