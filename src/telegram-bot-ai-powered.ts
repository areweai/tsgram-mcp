#!/usr/bin/env node

/**
 * AI-POWERED TELEGRAM BOT
 * - Uses Claude Sonnet 4 via OpenRouter
 * - Intelligent file editing based on user instructions
 * - No message loops
 * - Conversational about codebase
 */

import express from 'express'
import { TelegramBotClient } from './telegram/bot-client.js'
import { BotConfig } from './types/telegram.js'
import fs from 'fs/promises'
import path from 'path'
import dotenv from 'dotenv'
import axios from 'axios'
import { TSGramConfigManager } from './utils/tsgram-config.js'
import { SyncSafetyManager } from './utils/sync-safety.js'

dotenv.config()

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || '/app/workspaces/tsgram'
const AUTHORIZED_USER = process.env.AUTHORIZED_USER || 'duncanist'
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const OPENROUTER_MODEL = 'anthropic/claude-3.5-sonnet'
const DEFAULT_FILE_EDITS = process.env.ALLOW_FILE_EDITS === 'true'

interface BotInstance {
  id: string
  name: string
  client: TelegramBotClient
  config: BotConfig
  created_at: string
  bot_info?: any
}

interface ChatContext {
  lastFile?: string
  lastContent?: string
  lastCommand?: string
}

class AIPoweredTelegramBot {
  private app: express.Application
  private bot: BotInstance | null = null
  private port: number = parseInt(process.env.MCP_SERVER_PORT || '4040')
  private pollingOffset: number = 0
  private botUserId: number | null = null
  private processedMessageIds: Set<number> = new Set()
  private stoppedChats: Set<number> = new Set()
  private chatContexts: Map<number, ChatContext> = new Map()
  private fileEditsEnabled: boolean = DEFAULT_FILE_EDITS
  private configManager: TSGramConfigManager
  private syncSafety: SyncSafetyManager
  private deploymentNotified: boolean = false
  private deploymentTime: number = Date.now() // Track when this instance started

  constructor() {
    this.app = express()
    this.configManager = new TSGramConfigManager()
    this.syncSafety = new SyncSafetyManager(WORKSPACE_PATH)
    this.setupExpress()
    this.initializeBot()
  }

  private setupExpress() {
    // Add CORS middleware for dashboard access - ALLOW ALL for local development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Methods', '*')
      res.header('Access-Control-Allow-Headers', '*')
      res.header('Access-Control-Max-Age', '86400')
      
      if (req.method === 'OPTIONS') {
        res.status(200).end()
        return
      }
      next()
    })

    this.app.use(express.json())

    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'ai-powered-telegram-bot',
        timestamp: new Date().toISOString(),
        ai_model: OPENROUTER_MODEL,
        has_api_key: !!OPENROUTER_API_KEY,
        file_edits_enabled: this.fileEditsEnabled
      })
    })

    // Configuration endpoints for localhost dashboard
    this.app.get('/config', (req, res) => {
      res.json({
        workspace_path: WORKSPACE_PATH,
        authorized_user: AUTHORIZED_USER,
        file_edits_enabled: this.fileEditsEnabled,
        model: OPENROUTER_MODEL,
        default_file_edits: DEFAULT_FILE_EDITS
      })
    })

    this.app.post('/config/file-edits', (req, res) => {
      const { enabled } = req.body
      if (typeof enabled === 'boolean') {
        this.fileEditsEnabled = enabled
        console.log(`🔧 File editing ${enabled ? 'enabled' : 'disabled'} via localhost dashboard`)
        res.json({ success: true, file_edits_enabled: this.fileEditsEnabled })
      } else {
        res.status(400).json({ error: 'enabled must be a boolean' })
      }
    })

    // Add MCP status endpoint for dashboard
    this.app.get('/mcp/status', (req, res) => {
      res.json({
        mcp_server: 'running',
        ai_model: OPENROUTER_MODEL,
        has_api_key: !!OPENROUTER_API_KEY,
        workspace_path: WORKSPACE_PATH,
        authorized_user: AUTHORIZED_USER
      })
    })
  }

  private async initializeBot() {
    // Load configuration
    await this.configManager.load()
    console.log('📋 Config loaded, default mode:', this.configManager.getDefaultFlag() === '-e' ? 'Enhanced' : 'Raw')
    // Set default to raw mode if not configured
    if (!this.configManager.getDefaultFlag()) {
      await this.configManager.setDefaultFlag('-r')
    }
    
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      console.error('❌ No TELEGRAM_BOT_TOKEN found')
      return
    }

    if (!OPENROUTER_API_KEY) {
      console.error('⚠️ No OPENROUTER_API_KEY found - AI features will be limited')
    }

    const botConfig: BotConfig = {
      token,
      name: 'AI Powered Telegram Bot',
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
      console.log('🧠 AI Model:', OPENROUTER_MODEL)
      this.startPolling()
    }
  }

  private async startPolling() {
    console.log('🔄 Starting Telegram polling...')
    
    // ALWAYS send deployment notification on container startup FIRST
    if (process.env.AUTHORIZED_CHAT_ID) {
      const chatId = parseInt(process.env.AUTHORIZED_CHAT_ID)
      
      await this.sendMessage(chatId, '🚀 I just redeployed and boy are my packets reconstituted! How can I help you with your project today?\n\nI can:\n• Read and understand your codebase\n• Answer questions about your project\n• Analyze files and provide insights\n• Search through files and nested directories\n• ⚠️ Create and edit files (type "**:dangerzone**" to enable, "**:safetyzone**" to disable - 🚨 **WARNING: EXPERIMENTAL!** 🚨)\n\nTry: "Show me the README" or "List all files"')
      await this.configManager.updateLastDeployment()
      console.log('✅ Deployment notification sent to chat', chatId)
    }
    
    // EXTREMELY AGGRESSIVE: Clear ALL pending updates by consuming them without processing
    console.log('🧹 Clearing ALL pending Telegram updates...')
    let clearedCount = 0
    while (true) {
      const updates = await this.bot!.client.getUpdates({
        offset: this.pollingOffset,
        limit: 100  // Max batch size
      })
      
      if (!updates.success || !updates.data || updates.data.length === 0) {
        break
      }
      
      // Skip all these messages and update offset
      const lastUpdate = updates.data[updates.data.length - 1]
      this.pollingOffset = lastUpdate.update_id + 1
      clearedCount += updates.data.length
      
      // Add all these message IDs to processed set to prevent reprocessing
      for (const update of updates.data) {
        if (update.message?.message_id) {
          this.processedMessageIds.add(update.message.message_id)
        }
      }
      
      // Safety break after clearing 1000 messages
      if (clearedCount > 1000) break
    }
    
    console.log(`🧹 Cleared ${clearedCount} pending messages, starting fresh from offset ${this.pollingOffset}`)
    
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
            try {
              await this.handleUpdate(update)
            } catch (error) {
              console.error(`❌ Error handling update ${update.update_id}:`, error)
              // Try to send error message to user if we have a chat ID
              if (update.message?.chat?.id) {
                try {
                  await this.sendMessage(
                    update.message.chat.id, 
                    '⚠️ Sorry, I\'m having trouble with that request. Wait a sec and try again, or ask me something else.'
                  )
                } catch (sendError) {
                  console.error('❌ Failed to send error message:', sendError)
                }
              }
              // Continue processing other messages
            }
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

    // Keep only last 1000 message IDs
    if (this.processedMessageIds.size > 1000) {
      const oldestIds = Array.from(this.processedMessageIds).slice(0, 100)
      oldestIds.forEach(id => this.processedMessageIds.delete(id))
    }

    // CRITICAL: Ignore ALL bot messages
    if (isBot || userId === this.botUserId) {
      console.log(`🤖 Ignoring bot message ${messageId}`)
      return
    }
    
    // CRITICAL: Ignore messages that are older than this deployment
    const messageTime = message.date * 1000  // Convert to milliseconds
    if (messageTime < this.deploymentTime) {
      console.log(`🕐 Ignoring old message ${messageId} from ${new Date(messageTime).toISOString()} (before deployment at ${new Date(this.deploymentTime).toISOString()})`)
      return
    }

    console.log(`💬 Message ${messageId} from @${username} (${chatId}): ${text}`)

    // Handle stop/start  
    if (text.toLowerCase() === 'stop') {
      this.stoppedChats.add(chatId)
      this.processedMessageIds.clear()
      this.fileEditsEnabled = false  // Disable file editing when stopped
      console.log('🧹 Cleared all processed messages and disabled file editing due to STOP command')
      await this.sendMessage(chatId, '⏹️ Stopped and cleared all pending responses. File editing disabled. Send "start" to resume.')
      return
    }

    if (text.toLowerCase() === 'start') {
      this.stoppedChats.delete(chatId)
      await this.sendMessage(chatId, `▶️ Started! How can I help you with your project?\n\nI can:\n• Read and understand your codebase\n• Answer questions about your project\n• Analyze files and provide insights\n• Search through files and nested directories\n\n${this.fileEditsEnabled ? '• ⚠️ Create and edit files ("**:safetyzone**" to disable - 🚨 **WARNING: EXPERIMENTAL!** 🚨)' : '• ⚠️ Create and edit files ("**:dangerzone**" to enable, "**:safetyzone**" to disable - 🚨 **WARNING: EXPERIMENTAL!** 🚨)'}\n\nTry: "Show me the README" or "List all files"`)
      return
    }

    // Handle dangerzone command for file editing
    if (text === ':dangerzone') {
      this.fileEditsEnabled = true
      console.log(`🚨 File editing enabled by @${username}`)
      await this.sendMessage(chatId, '🚨 **DANGER ZONE ACTIVATED**\n\nFile editing is now enabled. I can:\n• Create new files\n• Modify existing files\n• Delete content\n\n⚠️ Use with caution! Type ":safetyzone" to disable.')
      return
    }

    // Handle safetyzone command to disable file editing
    if (text === ':safetyzone') {
      this.fileEditsEnabled = false
      console.log(`🔒 File editing disabled by @${username}`)
      await this.sendMessage(chatId, '🔒 **SAFETY ZONE ACTIVATED**\n\nFile editing is now disabled. I can only:\n• Read and analyze files\n• Answer questions about your codebase\n• Provide insights and explanations\n\nType ":dangerzone" to re-enable file editing.')
      return
    }

    if (this.stoppedChats.has(chatId)) {
      return
    }

    // Authorization check for file operations
    if (username.toLowerCase() !== AUTHORIZED_USER.toLowerCase()) {
      await this.sendMessage(chatId, `⛔ Sorry @${username}, only @${AUTHORIZED_USER} can interact with this bot.`)
      return
    }

    // Check for :h commands first
    if (text.startsWith(':h ')) {
      await this.handleWorkspaceCommand(chatId, text)
    } else {
      // Process with AI
      await this.handleAIMessage(chatId, text)
    }
  }

  private async handleAIMessage(chatId: number, userMessage: string) {
    try {
      // Send acknowledgment
      await this.sendMessage(chatId, '📨 Request received')
      
      // Get context for this chat
      const context = this.chatContexts.get(chatId) || {}
      
      // Build system prompt
      const systemPrompt = `You are an AI assistant integrated with a Telegram bot that can read and edit files in a project workspace.

Current workspace path: ${WORKSPACE_PATH}

CRITICAL: You have access to these file commands. Put each command on its own line:
1. LIST_FILES (shows all files in workspace)
2. READ_FILE:<filename> (reads a specific file)
${this.fileEditsEnabled ? '3. WRITE_FILE:<filename>:<content> (creates/overwrites a file)' : ''}
${this.fileEditsEnabled ? '4. EDIT_FILE:<filename>:<instructions> (modifies existing file)' : ''}
${this.fileEditsEnabled ? '5. APPEND_FILE:<filename>:<content> (adds to end of file)' : ''}

${this.fileEditsEnabled ? '' : 'NOTE: File editing is DISABLED. You can only read and analyze files, not create or modify them.'}

COMMAND FORMAT EXAMPLES:
User: "Show me all files"
Your response: "I'll list the files for you.

LIST_FILES

Here are your project files:"

User: "Read the README"
Your response: "Let me read the README file:

READ_FILE:README.md

"

ALWAYS:
- Put commands on separate lines
- Execute commands when user requests file operations
- Be conversational but use the actual commands
- Commands work inside the workspace automatically

${context.lastFile ? `Last file accessed: ${context.lastFile}` : ''}
${context.lastCommand ? `Last command: ${context.lastCommand}` : ''}`

      // Call OpenRouter API
      const response = await this.callOpenRouter(systemPrompt, userMessage)
      
      // Process AI response and execute commands
      await this.processAIResponse(chatId, response, context)
      
    } catch (error: any) {
      console.error('❌ AI Error:', error.message || error)
      
      // More helpful error messages
      if (error.response?.status === 429) {
        await this.sendMessage(chatId, '⏳ Rate limit exceeded. Please wait a moment and try again.')
      } else if (error.response?.status === 401) {
        await this.sendMessage(chatId, '🔑 API key issue. Please check the OpenRouter configuration.')
      } else if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
        await this.sendMessage(chatId, '🌐 Network issue. Wait a sec and try again, or ask me something else.')
      } else if (error.message?.includes('ENOENT') || error.message?.includes('file')) {
        await this.sendMessage(chatId, '📁 File access issue. Wait a sec and try again, or ask me something else.')
      } else {
        await this.sendMessage(chatId, '⚠️ Sorry, I\'m having trouble with that request. Wait a sec and try again, or ask me something else.')
      }
    }
  }

  private async callOpenRouter(systemPrompt: string, userMessage: string): Promise<string> {
    if (!OPENROUTER_API_KEY) {
      return 'I need an OpenRouter API key to use AI features. Please set OPENROUTER_API_KEY in your environment.'
    }

    try {
      const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.7,
        max_tokens: 2000
      }, {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://github.com/yourusername/tsgram',
          'X-Title': 'Telegram AI Bot'
        }
      })

      return response.data.choices[0].message.content
    } catch (error: any) {
      console.error('OpenRouter API Error:', error.response?.data || error.message)
      throw error
    }
  }

  private async processAIResponse(chatId: number, aiResponse: string, context: ChatContext) {
    console.log('🧠 AI Response:', aiResponse)
    
    // Extract and execute commands from AI response (search anywhere, not just line starts)
    let finalResponse = aiResponse
    
    // Check for LIST_FILES command anywhere in response
    if (aiResponse.includes('LIST_FILES')) {
      try {
        const files = await this.listFiles()
        finalResponse = finalResponse.replace(/LIST_FILES/g, `📂 **Files:**\n\`\`\`\n${files.join('\n')}\n\`\`\``)
        context.lastCommand = 'LIST_FILES'
        console.log('✅ Executed LIST_FILES command')
      } catch (error) {
        console.error('❌ LIST_FILES error:', error)
        finalResponse = finalResponse.replace(/LIST_FILES/g, '❌ Could not list files - please try again')
      }
    }
    
    // Check for READ_FILE commands
    const readFileRegex = /READ_FILE:([^\s\n]+)/g
    let readMatch
    while ((readMatch = readFileRegex.exec(aiResponse)) !== null) {
      try {
        const filename = readMatch[1].trim()
        const content = await this.readFile(filename)
        if (content) {
          const replacement = `📄 **${filename}:**\n\`\`\`\n${content.slice(0, 1500)}${content.length > 1500 ? '\n... (truncated)' : ''}\n\`\`\`\n`
          finalResponse = finalResponse.replace(readMatch[0], replacement)
          context.lastFile = filename
          console.log(`✅ Executed READ_FILE command for ${filename}`)
        } else {
          finalResponse = finalResponse.replace(readMatch[0], `❌ File "${filename}" not found in workspace`)
          console.log(`❌ File not found: ${filename}`)
        }
      } catch (error) {
        console.error(`❌ READ_FILE error for ${readMatch[1]}:`, error)
        finalResponse = finalResponse.replace(readMatch[0], `❌ Error reading file - please try again`)
      }
    }
    
    // Check for WRITE_FILE commands (if allowed)
    const writeFileRegex = /WRITE_FILE:([^:]+):(.+)/g
    let writeMatch
    while ((writeMatch = writeFileRegex.exec(aiResponse)) !== null) {
      try {
        const filename = writeMatch[1].trim()
        const content = writeMatch[2].trim()
        
        if (!this.fileEditsEnabled) {
          const replacement = `❌ File editing is disabled. Type ":dangerzone" to enable file editing capabilities.`
          finalResponse = finalResponse.replace(writeMatch[0], replacement)
          console.log(`❌ File editing blocked for: ${filename}`)
          continue
        }
        
        const success = await this.writeFile(filename, content)
        if (success) {
          const replacement = `✅ Created file: ${filename}`
          finalResponse = finalResponse.replace(writeMatch[0], replacement)
          context.lastFile = filename
          console.log(`✅ Executed WRITE_FILE command for ${filename}`)
        } else {
          finalResponse = finalResponse.replace(writeMatch[0], `❌ Failed to create ${filename}`)
          console.log(`❌ Write failed: ${filename}`)
        }
      } catch (error) {
        console.error(`❌ WRITE_FILE error for ${writeMatch[1]}:`, error)
        finalResponse = finalResponse.replace(writeMatch[0], `❌ Error creating file - please try again`)
      }
    }
    
    // Save context
    this.chatContexts.set(chatId, context)
    
    // Clean and send the response
    const cleanResponse = finalResponse.trim()
    if (cleanResponse.length > 0) {
      await this.sendMessage(chatId, cleanResponse)
    } else {
      await this.sendMessage(chatId, '✅ Command processed')
    }
  }

  private async listFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(WORKSPACE_PATH)
      // Filter out sensitive files and hidden files
      return files.filter(f => {
        if (f.startsWith('.')) return false  // No hidden files
        if (f.toLowerCase().includes('env')) return false  // No env files
        if (f.toLowerCase().includes('secret')) return false  // No secret files
        if (f.toLowerCase().includes('key')) return false  // No key files
        if (f.toLowerCase().includes('token')) return false  // No token files
        return true
      })
    } catch (error) {
      console.error('Error listing files:', error)
      return []
    }
  }

  private async readFile(filename: string): Promise<string | null> {
    if (filename.includes('..') || filename.startsWith('/')) {
      return null
    }
    
    // Security: Block sensitive files
    const lower = filename.toLowerCase()
    const basename = path.basename(lower)
    
    // Block hidden files and specific sensitive files
    if (filename.startsWith('.') || 
        basename === '.env' ||
        basename === '.env.local' ||
        basename === '.env.production' ||
        lower.includes('secret') || 
        lower.includes('private.key') || 
        lower.includes('token') && lower.endsWith('.txt') ||
        lower.includes('password')) {
      console.log(`🚫 Blocked attempt to read sensitive file: ${filename}`)
      return null
    }
    
    try {
      const filePath = path.join(WORKSPACE_PATH, filename)
      return await fs.readFile(filePath, 'utf-8')
    } catch (error) {
      console.error(`Error reading ${filename}:`, error)
      return null
    }
  }

  private async writeFile(filename: string, content: string): Promise<boolean> {
    if (filename.includes('..') || filename.startsWith('/')) {
      return false
    }
    
    // Only protect the most sensitive file
    const protectedFiles = ['.env']
    if (protectedFiles.includes(filename)) {
      console.log(`⚠️ Attempted to write protected file: ${filename}`)
      return false
    }
    
    try {
      const filePath = path.join(WORKSPACE_PATH, filename)
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(filePath, content, 'utf-8')
      return true
    } catch (error) {
      console.error(`Error writing ${filename}:`, error)
      return false
    }
  }

  private async appendFile(filename: string, content: string): Promise<boolean> {
    if (filename.includes('..') || filename.startsWith('/')) {
      return false
    }
    
    try {
      const filePath = path.join(WORKSPACE_PATH, filename)
      let existingContent = ''
      try {
        existingContent = await fs.readFile(filePath, 'utf-8')
      } catch (error) {
        // File doesn't exist, that's ok
      }
      
      const newContent = existingContent 
        ? existingContent + (existingContent.endsWith('\n') ? '' : '\n') + content
        : content
        
      await fs.writeFile(filePath, newContent, 'utf-8')
      return true
    } catch (error) {
      console.error(`Error appending to ${filename}:`, error)
      return false
    }
  }

  private async sendMessage(chatId: number, text: string) {
    if (!this.bot) return
    
    // Split long messages
    const chunks = this.splitMessage(text, 4000)
    
    for (const chunk of chunks) {
      try {
        const result = await this.bot.client.sendMessage({
          chat_id: chatId,
          text: chunk,
          parse_mode: 'Markdown'
        })

        if (!result.success) {
          console.error('❌ Failed to send:', result.error)
        }
      } catch (error) {
        console.error('❌ Send error:', error)
      }
    }
  }

  private splitMessage(text: string, maxLength: number): string[] {
    if (text.length <= maxLength) return [text]
    
    const chunks: string[] = []
    let currentChunk = ''
    
    const lines = text.split('\n')
    for (const line of lines) {
      if (currentChunk.length + line.length + 1 > maxLength) {
        chunks.push(currentChunk)
        currentChunk = line
      } else {
        currentChunk += (currentChunk ? '\n' : '') + line
      }
    }
    
    if (currentChunk) chunks.push(currentChunk)
    return chunks
  }

  private async handleWorkspaceCommand(chatId: number, text: string) {
    const parts = text.split(' ')
    const command = parts[1]
    
    // Parse flags and arguments
    let useEnhanced = this.configManager.getDefaultFlag() === '-e'
    let args: string[] = []
    
    for (let i = 2; i < parts.length; i++) {
      if (parts[i] === '-e' || parts[i] === '--enhance') {
        useEnhanced = true
      } else if (parts[i] === '-r' || parts[i] === '--raw') {
        useEnhanced = false
      } else {
        args.push(parts[i])
      }
    }
    
    // Handle config command
    if (command === 'config') {
      await this.handleConfigCommand(chatId, args)
      return
    }
    
    try {
      // Execute command and get raw output
      const rawOutput = await this.executeCommand(command, args)
      
      if (!rawOutput) {
        await this.sendMessage(chatId, '❌ Unknown command. Type :h help for available commands')
        return
      }
      
      // Send enhanced or raw output based on flags
      if (useEnhanced && this.shouldEnhance(command, rawOutput)) {
        await this.sendEnhancedOutput(chatId, command, args, rawOutput)
      } else {
        await this.sendMessage(chatId, rawOutput)
      }
    } catch (error) {
      console.error('Error in workspace command:', error)
      await this.sendMessage(chatId, '❌ Error executing command')
    }
  }
  
  private async handleConfigCommand(chatId: number, args: string[]) {
    if (args.length === 0) {
      const currentDefault = this.configManager.getDefaultFlag()
      await this.sendMessage(chatId, `⚙️ **Current Configuration:**\n\nDefault mode: ${currentDefault === '-e' ? 'Enhanced 🧠' : 'Raw 📝'}\n\nTo change: :h config default <-e|-r>`)
      return
    }
    
    if (args[0] === 'default' && args[1]) {
      if (args[1] === '-e' || args[1] === '-r') {
        await this.configManager.setDefaultFlag(args[1] as '-e' | '-r')
        await this.sendMessage(chatId, `✅ Default mode changed to: ${args[1] === '-e' ? 'Enhanced 🧠' : 'Raw 📝'}`)
      } else {
        await this.sendMessage(chatId, '❌ Invalid flag. Use -e for enhanced or -r for raw')
      }
    }
  }
  
  private async executeCommand(command: string, args: string[]): Promise<string | null> {
    const filename = args.join(' ')

    switch (command) {
      case 'help':
        return `🔧 **Workspace Commands:**\n\n:h ls [-e|-r] - List files\n:h cat <file> [-e|-r] - Read file\n:h write <file> <content> - Write file\n:h append <file> <content> - Append to file\n:h edit <file> <line> <new content> - Edit file\n:h sync - Sync from host to container\n:h sync status - Check sync health\n:h sync test - Run sync diagnostics\n:h config - Show configuration\n:h config default <-e|-r> - Set default mode\n\n**Flags:**\n-e, --enhance: Use AI enhancement (default)\n-r, --raw: Show raw output\n\nOr just chat naturally to use AI!`

      case 'ls':
        try {
          const files = await this.listFiles()
          return `📂 **Files:**\n\`\`\`\n${files.join('\n')}\n\`\`\``
        } catch (error) {
          console.error('Error in ls command:', error)
          return '❌ Error listing files'
        }

      case 'cat':
        if (!filename) {
          return '❌ Please specify a filename'
        }
        const content = await this.readFile(filename)
        if (content !== null) {
          const truncated = content.length > 3000 ? content.substring(0, 3000) + '\n... (truncated)' : content
          return `📄 **${filename}:**\n\`\`\`\n${truncated}\n\`\`\``
        } else {
          return `❌ Could not read file: ${filename}`
        }

      case 'write':
        if (!filename) {
          return '❌ Usage: :h write <filename> <content>'
        }
        const writeContent = args.slice(1).join(' ')
        const writeSuccess = await this.writeFile(filename, writeContent)
        if (writeSuccess) {
          return `✅ Wrote to ${filename}`
        } else {
          return `❌ Failed to write ${filename}`
        }

      case 'append':
        if (!filename) {
          return '❌ Usage: :h append <filename> <content>'
        }
        const appendContent = args.slice(1).join(' ')
        const appendSuccess = await this.appendFile(filename, appendContent)
        if (appendSuccess) {
          return `✅ Appended to ${filename}`
        } else {
          return `❌ Failed to append to ${filename}`
        }

      case 'edit':
        if (args.length < 3) {
          return '❌ Usage: :h edit <filename> <line> <new content>'
        }
        const editFilename = args[0]
        const lineNum = parseInt(args[1])
        const newContent = args.slice(2).join(' ')
        
        const fileContent = await this.readFile(editFilename)
        if (!fileContent) {
          return `❌ Could not read ${editFilename}`
        }
        
        const lines = fileContent.split('\n')
        if (lineNum < 1 || lineNum > lines.length) {
          return `❌ Invalid line number. File has ${lines.length} lines`
        }
        
        lines[lineNum - 1] = newContent
        const editSuccess = await this.writeFile(editFilename, lines.join('\n'))
        if (editSuccess) {
          return `✅ Edited line ${lineNum} in ${editFilename}`
        } else {
          return `❌ Failed to edit ${editFilename}`
        }

      case 'sync':
        if (args[0] === 'status') {
          const health = await this.syncSafety.checkWorkspaceHealth()
          return `📊 **Sync Status:**\n\n` +
                 `Workspace files: ${health.fileCount}\n` +
                 `Health: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}\n` +
                 `Volume mount: ${health.volumeMountWorking ? '✅ Working' : '❌ Not working'}\n` +
                 `${health.missingCritical.length > 0 ? `\n⚠️ Missing critical files: ${health.missingCritical.join(', ')}` : ''}` +
                 `${health.warnings.length > 0 ? `\n⚠️ Warnings:\n${health.warnings.join('\n')}` : ''}`
        }
        
        if (args[0] === 'test') {
          return await this.syncSafety.runDiagnostics()
        }
        
        // Default: sync from host
        const syncResult = await this.syncSafety.syncFromHost()
        return syncResult.message

      default:
        return null
    }
  }
  
  private shouldEnhance(command: string, output: string): boolean {
    // Don't enhance write/append/edit commands - they're actions, not queries
    if (['write', 'append', 'edit', 'config'].includes(command)) return false
    
    // Don't enhance very short outputs
    if (output.length < 50) return false
    
    // Always enhance ls and cat commands if they have content
    // TEMPORARILY DISABLED to debug issue
    // if (['ls', 'cat'].includes(command) && output.length > 100) return true
    
    return false
  }
  
  private async sendEnhancedOutput(chatId: number, command: string, args: string[], rawOutput: string) {
    try {
      const prompt = `The user executed the command ':h ${command} ${args.join(' ')}' and got this output:

${rawOutput}

Provide a helpful explanation or insights about this output. If it's a file listing, describe what the files might be for. If it's file content, explain what it does or highlight important parts. Keep your response concise and helpful for a Telegram chat context.`
      
      const enhanced = await this.callOpenRouter(
        'You are a helpful assistant that explains command outputs in a clear, concise way.',
        prompt
      )
      
      // Send both raw and enhanced
      await this.sendMessage(chatId, rawOutput + '\n\n🧠 **AI Insights:**\n' + enhanced)
    } catch (error) {
      // Fallback to raw output
      await this.sendMessage(chatId, rawOutput)
    }
  }

  async start() {
    this.app.listen(this.port, () => {
      console.log(`🌐 Server on port ${this.port}`)
      console.log('✅ AI-Powered bot started!')
      console.log('🔒 Authorized user:', AUTHORIZED_USER)
      console.log('🧠 Using Claude Sonnet via OpenRouter')
      console.log('📝 Natural language file editing enabled')
      console.log('⌨️  :h commands supported')
    })
  }
}

const server = new AIPoweredTelegramBot()
server.start().catch(console.error)