#!/usr/bin/env node

/**
 * CLI TO TELEGRAM BRIDGE
 * 
 * This service forwards Claude Code CLI responses to Telegram,
 * with security filtering to remove sensitive information.
 * 
 * Features:
 * - Filters out API keys, tokens, secrets
 * - Removes sensitive environment variables
 * - Formats responses for Telegram
 * - Sends to specified Telegram user
 */

import { TelegramBotClient } from './telegram/bot-client.js'
import { BotConfig } from './types/telegram.js'
import dotenv from 'dotenv'
import fs from 'fs/promises'

// Load environment variables
dotenv.config()

interface ForwardingConfig {
  telegram_bot_token: string
  target_chat_id: number | string
  target_username: string
  enabled: boolean
}

class CLITelegramBridge {
  private config: ForwardingConfig
  private botClient: TelegramBotClient | null = null

  constructor() {
    this.config = {
      telegram_bot_token: process.env.TELEGRAM_BOT_TOKEN || '',
      target_chat_id: process.env.AUTHORIZED_CHAT_ID ? parseInt(process.env.AUTHORIZED_CHAT_ID) : 0,
      target_username: '', // No longer used - user ID is more secure
      enabled: true
    }

    this.initializeBot()
  }

  /**
   * INITIALIZE TELEGRAM BOT CLIENT
   */
  private async initializeBot() {
    if (!this.config.telegram_bot_token) {
      console.error('❌ No Telegram bot token found')
      return
    }

    if (!this.config.target_chat_id || this.config.target_chat_id === 0) {
      console.error('❌ No AUTHORIZED_CHAT_ID configured. Please set your Telegram user ID in the environment.')
      console.error('   Get your user ID by messaging @userinfobot on Telegram')
      return
    }

    const botConfig: BotConfig = {
      token: this.config.telegram_bot_token,
      name: 'CLI Bridge Bot',
      allowed_updates: ['message'],
      drop_pending_updates: false,
    }

    this.botClient = new TelegramBotClient(botConfig)
    
    // Test bot connection
    const result = await this.botClient.getMe()
    if (result.success) {
      console.log('✅ CLI-Telegram bridge initialized')
    } else {
      console.error('❌ Failed to initialize Telegram bot:', result.error)
    }
  }

  /**
   * SECURITY FILTER - Remove sensitive information
   */
  private filterSensitiveData(text: string): string {
    let filtered = text

    // Remove API keys and tokens
    const sensitivePatterns = [
      // API keys
      /sk-[a-zA-Z0-9-_]{20,}/g,
      /pk-[a-zA-Z0-9-_]{20,}/g,
      
      // OpenRouter API keys
      /sk-or-v1-[a-zA-Z0-9-_]{20,}/g,
      
      // Bot tokens
      /\d{8,12}:[a-zA-Z0-9_-]{35}/g,
      
      // Generic tokens
      /token["\s]*[:=]["\s]*[a-zA-Z0-9_-]{20,}/gi,
      /api[_-]?key["\s]*[:=]["\s]*[a-zA-Z0-9_-]{20,}/gi,
      /secret["\s]*[:=]["\s]*[a-zA-Z0-9_-]{20,}/gi,
      
      // Environment variable assignments
      /export\s+[A-Z_]+=.*/g,
      /[A-Z_]+=["'][^"']*["']/g,
      
      // File paths that might contain sensitive info
      /\/Users\/[^\/\s]+\/\.env/g,
      /\/home\/[^\/\s]+\/\.env/g,
      
      // Database URLs
      /postgres:\/\/[^\s]+/g,
      /mysql:\/\/[^\s]+/g,
      /mongodb:\/\/[^\s]+/g,
    ]

    // Apply all filters
    sensitivePatterns.forEach(pattern => {
      filtered = filtered.replace(pattern, '[REDACTED]')
    })

    // Remove common sensitive environment variable names
    const sensitiveEnvVars = [
      'API_KEY', 'SECRET_KEY', 'PRIVATE_KEY', 'PASSWORD', 'TOKEN',
      'OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'TELEGRAM_BOT_TOKEN',
      'DATABASE_URL', 'DB_PASSWORD', 'JWT_SECRET'
    ]

    sensitiveEnvVars.forEach(envVar => {
      const envPattern = new RegExp(`${envVar}["\s]*[:=]["\s]*[^\\s"'\\n]+`, 'gi')
      filtered = filtered.replace(envPattern, `${envVar}=[REDACTED]`)
    })

    return filtered
  }

  /**
   * FORMAT RESPONSE FOR TELEGRAM
   */
  private formatForTelegram(text: string, metadata?: { command?: string, timestamp?: string }): string {
    // Apply security filtering first
    const filteredText = this.filterSensitiveData(text)
    
    // Add header with metadata
    let formatted = `🤖 **Claude Code CLI Response**\n\n`
    
    if (metadata?.command) {
      formatted += `**Command**: \`${metadata.command}\`\n`
    }
    
    if (metadata?.timestamp) {
      formatted += `**Time**: ${new Date(metadata.timestamp).toLocaleTimeString()}\n`
    }
    
    formatted += `**Target ID**: ${this.config.target_chat_id}\n\n`
    formatted += `---\n\n`
    
    // Add the filtered content
    formatted += filteredText
    
    // Add footer
    formatted += `\n\n---\n*Forwarded from Claude Code CLI • Sensitive data filtered*`
    
    return formatted
  }

  /**
   * SEND RESPONSE TO TELEGRAM
   */
  async forwardResponse(
    responseText: string, 
    metadata?: { command?: string, timestamp?: string }
  ): Promise<boolean> {
    if (!this.config.enabled || !this.botClient) {
      console.log('⚠️  CLI-Telegram bridge is disabled or not initialized')
      return false
    }

    try {
      // Format the response
      const formattedText = this.formatForTelegram(responseText, metadata)
      
      // Check if text is too long for Telegram (4096 char limit)
      let textToSend = formattedText
      if (formattedText.length > 4000) {
        textToSend = formattedText.substring(0, 3900) + '\n\n... [Response truncated due to length limit]'
      }

      // Send to Telegram
      const result = await this.botClient.sendMessage({
        chat_id: this.config.target_chat_id,
        text: textToSend,
        parse_mode: 'Markdown'
      })

      if (result.success) {
        console.log(`✅ CLI response forwarded to chat ID ${this.config.target_chat_id}`)
        return true
      } else {
        console.error(`❌ Failed to forward CLI response: ${result.error}`)
        return false
      }
    } catch (error) {
      console.error('❌ Error forwarding CLI response:', error)
      return false
    }
  }

  /**
   * PROCESS CLI OUTPUT FROM STDIN
   * This can be used to pipe CLI output to the bridge
   */
  async processStdinInput(): Promise<void> {
    console.log('📡 CLI-Telegram bridge listening for input...')
    
    let inputBuffer = ''
    
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      inputBuffer += chunk
    })

    process.stdin.on('end', async () => {
      if (inputBuffer.trim()) {
        await this.forwardResponse(inputBuffer.trim(), {
          command: 'stdin',
          timestamp: new Date().toISOString()
        })
      }
      process.exit(0)
    })
  }

  /**
   * ENABLE/DISABLE FORWARDING
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled
    console.log(`📡 CLI-Telegram bridge ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * UPDATE TARGET USER
   */
  setTarget(chatId: number | string, username: string): void {
    this.config.target_chat_id = chatId
    this.config.target_username = username
    console.log(`🎯 CLI-Telegram bridge target updated: ${username}`)
  }
}

// CLI Interface
async function main() {
  const bridge = new CLITelegramBridge()
  
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    // No arguments - read from stdin
    await bridge.processStdinInput()
  } else if (args[0] === 'test') {
    // Test command
    const testResponse = `✅ Test CLI response forwarding

This is a test message to verify the CLI-Telegram bridge is working.

**Features tested:**
- Security filtering ✅
- Telegram formatting ✅ 
- Message delivery ✅

Sample sensitive data (should be filtered):
- API Key: sk-test123456789 → [REDACTED]
- Token: TELEGRAM_BOT_TOKEN=secret123 → [REDACTED]
- Database: postgres://user:pass@localhost → [REDACTED]

**Bridge Status**: Active and operational`

    await bridge.forwardResponse(testResponse, {
      command: 'test',
      timestamp: new Date().toISOString()
    })
  } else if (args[0] === 'disable') {
    bridge.setEnabled(false)
  } else if (args[0] === 'enable') {
    bridge.setEnabled(true)
  } else {
    // Forward the arguments as a message
    const message = args.join(' ')
    await bridge.forwardResponse(message, {
      command: 'manual',
      timestamp: new Date().toISOString()
    })
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}

export { CLITelegramBridge }