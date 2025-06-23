#!/usr/bin/env node

/**
 * ENHANCED TELEGRAM MCP WORKSPACE SERVER
 * 
 * Features:
 * - :h prefix for workspace commands
 * - AI chat has access to workspace files
 * - Only @duncist can use commands
 * - Auto-sync with rsync
 */

import express from 'express'
import { TelegramBotClient } from './telegram/bot-client.js'
import { BotConfig } from './types/telegram.js'
import { ChatModel } from './models/index.js'
import fs from 'fs/promises'
import { existsSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import dotenv from 'dotenv'

dotenv.config()

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || '/app/workspace'
const AUTHORIZED_USER = process.env.AUTHORIZED_USER || 'duncist'
const AUTHORIZED_CHAT_ID = parseInt(process.env.AUTHORIZED_CHAT_ID || '5988959818')

interface BotInstance {
  id: string
  name: string
  client: TelegramBotClient
  config: BotConfig
  created_at: string
  bot_info?: any
}

class TelegramMCPWorkspaceEnhanced {
  private app: express.Application
  private bot: BotInstance | null = null
  private port: number = parseInt(process.env.MCP_SERVER_PORT || '4040')
  private pollingOffset: number = 0
  private pendingEdit: { chatId: number; filename: string } | null = null
  private pendingWrite: { chatId: number; filename?: string; suggestions?: string[] } | null = null
  private recentMessages: Map<string, { count: number; lastSent: number }> = new Map()
  private globalMessageHistory: { text: string; timestamp: number }[] = []
  private stopped: Set<number> = new Set()

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
        service: 'hermes-mcp-workspace-enhanced',
        authorized_user: AUTHORIZED_USER,
        workspace: WORKSPACE_PATH,
        timestamp: new Date().toISOString()
      })
    })

    this.app.post('/webhook/telegram', async (req, res) => {
      try {
        await this.handleUpdate(req.body)
        res.sendStatus(200)
      } catch (error) {
        console.error('❌ Webhook error:', error)
        res.sendStatus(500)
      }
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
      name: 'Hermes MCP Workspace Enhanced',
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

      await new Promise(resolve => setTimeout(resolve, 2000))
    }
  }

  private async handleUpdate(update: any) {
    if (!update.message || !update.message.text) return

    const message = update.message
    const chatId = message.chat.id
    const username = message.from?.username || 'unknown'
    const text = message.text
    const userId = message.from?.id

    // Ignore messages from the bot itself
    if (message.from?.is_bot) {
      console.log('🤖 Ignoring bot message')
      return
    }

    console.log(`💬 Message from @${username} (${chatId}): ${text}`)

    // Handle stop command
    if (text.toLowerCase() === 'stop' || text.toLowerCase() === 'stop messages') {
      this.stopped.add(chatId)
      await this.sendMessage(chatId, '⏹️ Stopped. Send "start" to resume.')
      return
    }

    // Handle start command
    if (text.toLowerCase() === 'start' && this.stopped.has(chatId)) {
      this.stopped.delete(chatId)
      await this.sendMessage(chatId, '▶️ Resumed. How can I help?')
      return
    }

    // If stopped, ignore all messages
    if (this.stopped.has(chatId)) {
      console.log('🛑 Ignoring message - user has stopped bot')
      return
    }

    // Ignore messages that look like bot responses
    if (text.match(/^[📁📄📂💻✅❌📊📚📝🔄⏹️🎉]/) || 
        text.includes('What would you like to work on today?') ||
        text.includes('**Hermes Workspace Commands:**')) {
      console.log('🚫 Ignoring message that looks like bot output')
      return
    }

    // Check authorization for commands
    if (text.startsWith(':h') && username !== AUTHORIZED_USER && chatId !== AUTHORIZED_CHAT_ID) {
      console.log(`⛔ Unauthorized command attempt by @${username}`)
      await this.sendMessage(chatId, '⛔ Sorry, you are not authorized to use workspace commands.')
      return
    }

    // Handle pending edit
    if (this.pendingEdit && this.pendingEdit.chatId === chatId) {
      await this.handleEditContent(chatId, text)
      return
    }

    // Handle pending write
    if (this.pendingWrite && this.pendingWrite.chatId === chatId) {
      await this.handleWriteContent(chatId, text)
      return
    }

    // Handle :h commands (including bare :h)
    if (text === ':h' || text.startsWith(':h ')) {
      await this.handleHermesCommand(message)
      return
    }

    // AI chat for all users (with file access for @duncist)
    await this.handleAIChat(message)
  }

  private async handleHermesCommand(message: any) {
    const text = message.text
    const chatId = message.chat.id
    const parts = text.split(' ')
    
    // Handle bare :h
    if (parts.length === 1 && parts[0] === ':h') {
      await this.sendMessage(chatId, `📚 **What would you like to work on today?**\n\nUse \`:h help\` for commands or just chat with me!`)
      return
    }
    
    const [_, command, ...args] = parts

    switch (command) {
      case 'ls':
        await this.handleListCommand(chatId, args)
        break
      
      case 'cat':
      case 'echo':
      case 'show':
        await this.handleReadCommand(chatId, args)
        break
      
      case 'edit':
        await this.handleEditCommand(chatId, args)
        break
      
      case 'write':
        await this.handleWriteCommand(chatId, args)
        break
      
      case 'sync':
        await this.handleSyncCommand(chatId)
        break
      
      case 'exec':
        await this.handleExecCommand(chatId, args)
        break
      
      case 'status':
        await this.handleStatusCommand(chatId)
        break
      
      case 'help':
        await this.sendMessage(chatId, `📚 **Hermes Workspace Commands:**
\`:h ls [path]\` - List files
\`:h cat <file>\` - Read file content
\`:h echo <file>\` - Same as cat
\`:h show <file>\` - Same as cat
\`:h edit <file>\` - Edit existing file
\`:h write [file]\` - Write new file (AI suggests location)
\`:h sync\` - Sync from local
\`:h exec <cmd>\` - Execute command
\`:h status\` - Workspace status
\`:h help\` - This help
\`:h\` - Quick prompt

Regular messages trigger AI chat.
Say **stop** to pause messages.`)
        break
      
      default:
        // For /ls specifically, handle it properly
        if (command === '/ls' || command.startsWith('/')) {
          await this.sendMessage(chatId, `💡 Did you mean **:h ls**? (without the slash)`)
          return
        }
        // For truly unknown commands, ONE helpful message only
        await this.sendMessage(chatId, `❓ Unknown command. Try **:h help** for available commands.`)
    }
  }

  private async handleListCommand(chatId: number, args: string[]) {
    const targetPath = path.join(WORKSPACE_PATH, args.join(' ') || '')
    
    try {
      const files = await fs.readdir(targetPath)
      const fileList = await Promise.all(files.map(async f => {
        const fullPath = path.join(targetPath, f)
        try {
          const stats = await fs.stat(fullPath)
          return `${stats.isDirectory() ? '📁' : '📄'} ${f}`
        } catch {
          return `❓ ${f}`
        }
      }))
      
      const pathDisplay = args.join(' ') || '/'
      await this.sendMessage(chatId, `📂 **${pathDisplay}**\n\`\`\`\n${fileList.join('\n')}\n\`\`\``)
    } catch (error) {
      await this.sendMessage(chatId, `❌ Cannot list: ${error}`)
    }
  }

  private async handleReadCommand(chatId: number, args: string[]) {
    if (args.length === 0) {
      await this.sendMessage(chatId, '❌ Usage: :h cat <filename>')
      return
    }

    const filename = args.join(' ')
    // Handle case-insensitive README
    const normalizedFilename = filename.toLowerCase() === 'readme.md' ? 'README.md' : filename
    const filepath = path.join(WORKSPACE_PATH, normalizedFilename)
    
    try {
      const content = await fs.readFile(filepath, 'utf8')
      const truncated = content.length > 3000 ? content.substring(0, 3000) + '\n...[truncated]' : content
      await this.sendMessage(chatId, `📄 **${filename}**:\n\`\`\`\n${truncated}\n\`\`\``)
    } catch (error) {
      await this.sendMessage(chatId, `❌ Cannot read ${filename}: ${error}`)
    }
  }

  private async handleEditCommand(chatId: number, args: string[]) {
    if (args.length === 0) {
      await this.sendMessage(chatId, '❌ Usage: :h edit <filename>')
      return
    }

    const filename = args.join(' ')
    this.pendingEdit = { chatId, filename }
    await this.sendMessage(chatId, `📝 Send the new content for **${filename}**:`)
  }

  private async handleEditContent(chatId: number, content: string) {
    if (!this.pendingEdit) return

    const filepath = path.join(WORKSPACE_PATH, this.pendingEdit.filename)
    
    try {
      await fs.mkdir(path.dirname(filepath), { recursive: true })
      await fs.writeFile(filepath, content, 'utf8')
      await this.sendMessage(chatId, `✅ Saved **${this.pendingEdit.filename}**\n📤 Changes will sync to local automatically`)
      this.pendingEdit = null
    } catch (error) {
      await this.sendMessage(chatId, `❌ Failed to save: ${error}`)
    }
  }

  private async handleSyncCommand(chatId: number) {
    try {
      const result = execSync(
        'rsync -av --password-file=/etc/rsync.password ' +
        '--exclude=node_modules --exclude=.git ' +
        'rsync://mcp@host.docker.internal:8873/project/ /app/workspace/',
        { encoding: 'utf8' }
      )
      
      const lines = result.split('\n').filter(l => l.trim())
      const changedFiles = lines.filter(l => !l.startsWith('sending') && !l.startsWith('total') && !l.startsWith('sent'))
      
      await this.sendMessage(chatId, `✅ **Sync Complete**\n📥 Updated ${changedFiles.length} files`)
    } catch (error) {
      await this.sendMessage(chatId, `❌ Sync failed: ${error}`)
    }
  }

  private async handleExecCommand(chatId: number, args: string[]) {
    const command = args.join(' ')
    
    try {
      const output = execSync(command, {
        cwd: WORKSPACE_PATH,
        encoding: 'utf8',
        timeout: 30000
      })
      
      const truncated = output.length > 3000 ? output.substring(0, 3000) + '\n...[truncated]' : output
      await this.sendMessage(chatId, `💻 **Output:**\n\`\`\`\n${truncated}\n\`\`\``)
    } catch (error: any) {
      const errorOutput = error.stderr || error.message
      const truncated = errorOutput.length > 3000 ? errorOutput.substring(0, 3000) + '\n...[truncated]' : errorOutput
      await this.sendMessage(chatId, `❌ **Command failed:**\n\`\`\`\n${truncated}\n\`\`\``)
    }
  }

  private async handleStatusCommand(chatId: number) {
    const files = await fs.readdir(WORKSPACE_PATH)
    const stats = await Promise.all(files.map(async f => {
      try {
        const stat = await fs.stat(path.join(WORKSPACE_PATH, f))
        return stat.size
      } catch {
        return 0
      }
    }))
    const totalSize = stats.reduce((a, b) => a + b, 0)

    await this.sendMessage(chatId, `📊 **Workspace Status:**
📁 Path: \`${WORKSPACE_PATH}\`
📄 Files: ${files.length}
💾 Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB
🔒 User: @${AUTHORIZED_USER}
✅ Rsync: Active
🔄 Auto-sync: Enabled`)
  }

  private async handleAIChat(message: any) {
    const chatId = message.chat.id
    const username = message.from?.username || 'unknown'
    const text = message.text

    try {
      const aiAPI = ChatModel.createAPI(process.env.DEFAULT_MODEL || 'openrouter')
      
      // Enhanced system prompt with file access info
      let systemPrompt = "You are Hermes MCP, an AI assistant with access to a development workspace. "
      systemPrompt += "The user can use :h commands to interact with files. "
      
      // If the message looks like a mistyped :h command, provide helpful guidance
      if (text.startsWith(':h ') && text.includes('/')) {
        systemPrompt += "The user seems to have typed an invalid :h command. "
        systemPrompt += "Valid commands are: :h ls, :h cat <file>, :h edit <file>, :h write [file], :h sync, :h exec <cmd>, :h status, :h help. "
        systemPrompt += "For example, use ':h ls' not ':h /ls'. "
        systemPrompt += "Be helpful and suggest the correct command format. "
      } else {
        systemPrompt += "When users mention :h commands, don't explain them - they already know. "
        systemPrompt += "Just respond naturally to their requests. "
      }
      
      if (username === AUTHORIZED_USER) {
        systemPrompt += `You have full access to read and analyze files in ${WORKSPACE_PATH}. `
        systemPrompt += "When the user asks about code or files, you can mention specific files you could analyze. "
        systemPrompt += "Suggest using :h commands to explore the workspace. "
      }
      
      systemPrompt += "Be helpful, concise, and professional."

      // Check if user is asking about files
      const fileKeywords = ['file', 'code', 'function', 'class', 'import', 'export', 'package', 'readme', 'config']
      const isAskingAboutFiles = fileKeywords.some(keyword => text.toLowerCase().includes(keyword))

      // If authorized user asks about files, provide context
      let contextInfo = ""
      if (username === AUTHORIZED_USER && isAskingAboutFiles) {
        try {
          const files = await fs.readdir(WORKSPACE_PATH)
          const codeFiles = files.filter(f => 
            f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.json') || 
            f.endsWith('.md') || f === 'package.json'
          ).slice(0, 10)
          
          if (codeFiles.length > 0) {
            contextInfo = `\n\nAvailable files in workspace: ${codeFiles.join(', ')}`
            contextInfo += `\n\nUser can use :h cat <filename> to read any file.`
          }
        } catch (error) {
          console.error('Error reading workspace:', error)
        }
      }

      const fullPrompt = `${systemPrompt}${contextInfo}\n\nUser (@${username}): ${text}`
      const response = await aiAPI.send(fullPrompt)
      
      await this.sendMessage(chatId, response)
    } catch (error) {
      await this.sendMessage(chatId, `❌ AI error: ${error}`)
    }
  }

  private async sendMessage(chatId: number, text: string) {
    if (!this.bot) return
    
    // GLOBAL SPAM CHECK - Check last 6 messages
    const now = Date.now()
    const compareText = text.substring(0, 50).toLowerCase()
    
    // Add to global history
    this.globalMessageHistory.push({ text: compareText, timestamp: now })
    
    // Keep only last 20 messages
    if (this.globalMessageHistory.length > 20) {
      this.globalMessageHistory = this.globalMessageHistory.slice(-20)
    }
    
    // Count similar messages in last 6
    const recentSix = this.globalMessageHistory.slice(-6)
    const similarCount = recentSix.filter(msg => 
      msg.text === compareText || 
      msg.text.includes('unknown command') ||
      msg.text.includes('❓')
    ).length
    
    if (similarCount >= 2) {
      console.log(`🚫 BLOCKED SPAM: Already sent similar message ${similarCount} times in last 6 messages`)
      console.log(`🚫 Blocked text: "${compareText}..."`)
      return
    }
    
    // ALSO check for rapid duplicates
    const messageKey = `${chatId}:${compareText}`
    const recentMessage = this.recentMessages.get(messageKey)
    
    if (recentMessage && (now - recentMessage.lastSent < 30000)) {
      recentMessage.count++
      if (recentMessage.count > 2) {
        console.log(`🚫 BLOCKED DUPLICATE: Sent ${recentMessage.count - 1} times: "${compareText}..."`)
        return
      }
      recentMessage.lastSent = now
    } else {
      this.recentMessages.set(messageKey, { count: 1, lastSent: now })
    }
    
    // Clean up old entries
    for (const [key, value] of this.recentMessages.entries()) {
      if (now - value.lastSent > 60000) {
        this.recentMessages.delete(key)
      }
    }
    
    // Don't trigger responses for our own messages
    const result = await this.bot.client.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      disable_notification: true  // Quieter responses
    })

    if (!result.success) {
      console.error('Failed to send message:', result.error)
    }
  }

  private async handleWriteCommand(chatId: number, args: string[]) {
    const filename = args.join(' ').trim()
    
    if (filename && filename.includes('/')) {
      // Full path provided
      this.pendingWrite = { chatId, filename }
      await this.sendMessage(chatId, `✏️ Send the content for **${filename}**:`)
    } else {
      // Need to suggest locations
      const suggestions = await this.suggestFileLocations(filename || 'newfile')
      this.pendingWrite = { chatId, filename, suggestions }
      
      let message = `📝 **Where should I create the file?**\n\n`
      if (filename) {
        message += `File: **${filename}**\n\n`
      }
      message += `Suggested locations:\n`
      suggestions.forEach((path, index) => {
        message += `**${index + 1}**. \`${path}\`\n`
      })
      message += `\nReply with 1, 2, or 3, or type a custom path:`
      
      await this.sendMessage(chatId, message)
    }
  }

  private async suggestFileLocations(filename: string): Promise<string[]> {
    const suggestions: string[] = []
    
    // Analyze filename to suggest appropriate directories
    const ext = path.extname(filename).toLowerCase()
    const basename = path.basename(filename)
    
    // Source code files
    if (['.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
      suggestions.push(`src/${filename}`)
      if (filename.includes('test') || filename.includes('spec')) {
        suggestions.push(`tests/${filename}`)
      }
      if (filename.includes('component')) {
        suggestions.push(`src/components/${filename}`)
      }
    }
    // Config files
    else if (['.json', '.yaml', '.yml', '.env'].includes(ext) || 
             ['config', 'settings'].some(c => basename.includes(c))) {
      suggestions.push(filename) // Root directory
      suggestions.push(`config/${filename}`)
    }
    // Documentation
    else if (['.md', '.txt', '.rst'].includes(ext) || !ext) {
      suggestions.push(filename) // Root directory
      suggestions.push(`docs/${filename}`)
      if (basename.toLowerCase().includes('readme')) {
        suggestions.unshift(filename) // README should be in root
      }
    }
    // Scripts
    else if (['.sh', '.bash'].includes(ext)) {
      suggestions.push(`scripts/${filename}`)
    }
    // Default suggestions
    else {
      suggestions.push(filename)
      suggestions.push(`src/${filename}`)
      suggestions.push(`lib/${filename}`)
    }
    
    // Ensure we have 3 unique suggestions
    const unique = [...new Set(suggestions)].slice(0, 3)
    while (unique.length < 3) {
      if (!unique.includes(filename)) unique.push(filename)
      if (!unique.includes(`misc/${filename}`)) unique.push(`misc/${filename}`)
      if (!unique.includes(`temp/${filename}`)) unique.push(`temp/${filename}`)
    }
    
    return unique.slice(0, 3)
  }

  private async handleWriteContent(chatId: number, text: string) {
    if (!this.pendingWrite) return

    if (this.pendingWrite.suggestions && !this.pendingWrite.filename) {
      // User is choosing location
      const choice = text.trim()
      
      if (['1', '2', '3'].includes(choice)) {
        const index = parseInt(choice) - 1
        this.pendingWrite.filename = this.pendingWrite.suggestions[index]
        await this.sendMessage(chatId, `✏️ Send the content for **${this.pendingWrite.filename}**:`)
        this.pendingWrite.suggestions = undefined
        return
      } else if (text.includes('/') || text.includes('.')) {
        // Custom path provided
        this.pendingWrite.filename = text.trim()
        await this.sendMessage(chatId, `✏️ Send the content for **${this.pendingWrite.filename}**:`)
        this.pendingWrite.suggestions = undefined
        return
      } else {
        await this.sendMessage(chatId, `❌ Please reply with 1, 2, 3, or a full file path`)
        return
      }
    }

    // Write the file
    const filepath = path.join(WORKSPACE_PATH, this.pendingWrite.filename!)
    
    try {
      await fs.mkdir(path.dirname(filepath), { recursive: true })
      await fs.writeFile(filepath, text, 'utf8')
      await this.sendMessage(chatId, `✅ Created **${this.pendingWrite.filename}**\n📤 File will sync to local automatically`)
      this.pendingWrite = null
    } catch (error) {
      await this.sendMessage(chatId, `❌ Failed to write: ${error}`)
    }
  }

  async start() {
    this.app.listen(this.port, () => {
      console.log(`🌐 HTTP Server started on port ${this.port}`)
      console.log(`📥 Webhook endpoint: http://localhost:${this.port}/webhook/telegram`)
      console.log(`❤️  Health check: http://localhost:${this.port}/health`)
      console.log(`🤖 AI Model: ${process.env.DEFAULT_MODEL || 'openrouter'}`)
      console.log(`🔒 Authorized user: @${AUTHORIZED_USER}`)
      console.log('✅ Hermes MCP Workspace Enhanced started!')
    })
  }
}

const server = new TelegramMCPWorkspaceEnhanced()
server.start().catch(console.error)