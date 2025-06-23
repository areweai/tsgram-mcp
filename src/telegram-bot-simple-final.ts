#!/usr/bin/env node

/**
 * SIMPLE FINAL TELEGRAM BOT
 * - No loops
 * - Proper authorization
 * - Workspace commands
 * - Simple responses
 */

import express from 'express'
import { TelegramBotClient } from './telegram/bot-client.js'
import { BotConfig } from './types/telegram.js'
import fs from 'fs/promises'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const WORKSPACE_PATH = process.env.WORKSPACE_PATH || '/app/workspace'
const AUTHORIZED_USER = process.env.AUTHORIZED_USER || 'duncanist' // Fixed typo!

interface BotInstance {
  id: string
  name: string
  client: TelegramBotClient
  config: BotConfig
  created_at: string
  bot_info?: any
}

class SimpleFinalTelegramBot {
  private app: express.Application
  private bot: BotInstance | null = null
  private port: number = parseInt(process.env.MCP_SERVER_PORT || '4040')
  private pollingOffset: number = 0
  private botUserId: number | null = null
  private processedMessageIds: Set<number> = new Set()
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
        service: 'simple-final-telegram-bot',
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
      name: 'Simple Final Telegram Bot',
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
      await this.sendMessage(chatId, '▶️ Started! How can I help you?\n\n🔧 Try :h help for workspace commands.')
      return
    }

    // If stopped, ignore
    if (this.stoppedChats.has(chatId)) {
      console.log('⏹️ Chat is stopped, ignoring message')
      return
    }

    // Handle :h commands
    if (text.startsWith(':h')) {
      // Check authorization - compare usernames properly
      if (username.toLowerCase() !== AUTHORIZED_USER.toLowerCase()) {
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
      const args = parts.slice(2)
      
      // Handle /ls typo
      if (command.startsWith('/')) {
        const actualCommand = command.substring(1)
        await this.handleWorkspaceCommand(chatId, actualCommand, args)
        return
      }

      await this.handleWorkspaceCommand(chatId, command, args)
    } else {
      // Regular message - provide helpful response
      await this.handleGeneralMessage(chatId, text, username)
    }
  }

  private async handleWorkspaceCommand(chatId: number, command: string, args: string[]) {
    console.log(`🔧 Workspace command: ${command}, args: ${JSON.stringify(args)}`)
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
      case 'write':
        if (args.length < 2) {
          await this.sendMessage(chatId, '❓ Usage: :h write <filename> <content>')
          return
        }
        const filename = args[0]
        const content = args.slice(1).join(' ')
        await this.handleWriteCommand(chatId, filename, content)
        break
      case 'edit':
        if (args.length < 3) {
          await this.sendMessage(chatId, '❓ Usage: :h edit <filename> <old_text> -> <new_text>')
          return
        }
        // Find the separator
        const argsStr = args.join(' ')
        const separatorIndex = argsStr.indexOf('->')
        if (separatorIndex === -1) {
          await this.sendMessage(chatId, '❓ Usage: :h edit <filename> <old_text> -> <new_text>\n\nExample: :h edit README.md old text -> new text')
          return
        }
        
        const beforeSeparator = argsStr.substring(0, separatorIndex).trim()
        const afterSeparator = argsStr.substring(separatorIndex + 2).trim()
        const editParts = beforeSeparator.split(' ')
        const editFilename = editParts[0]
        const oldText = editParts.slice(1).join(' ')
        
        await this.handleEditCommand(chatId, editFilename, oldText, afterSeparator)
        break
      case 'append':
        if (args.length < 2) {
          await this.sendMessage(chatId, '❓ Usage: :h append <filename> <content>')
          return
        }
        const appendFile = args[0]
        const appendContent = args.slice(1).join(' ')
        await this.handleAppendCommand(chatId, appendFile, appendContent)
        break
      case 'help':
        await this.sendMessage(chatId, `📚 **Workspace Commands:**
:h ls [dir] - List files
:h cat <file> - Read file contents
:h read <file> - Same as cat
:h write <file> <content> - Create/overwrite file
:h append <file> <content> - Add to end of file
:h edit <file> <old> -> <new> - Replace text in file
:h help - This help message

Examples:
:h write test.md Hello World
:h append test.md More content
:h edit test.md Hello -> Hi

Say "stop" to pause all messages.`)
        break
      default:
        await this.sendMessage(chatId, `❓ Unknown command: ${command}. Try :h help`)
    }
  }

  private async handleGeneralMessage(chatId: number, text: string, username: string) {
    const lowerText = text.toLowerCase()
    
    // Check for natural language file writing requests
    if ((lowerText.includes('create') || lowerText.includes('write') || lowerText.includes('add')) && 
        (lowerText.includes('file') || lowerText.includes('document'))) {
      // Check authorization for file writing
      if (username.toLowerCase() !== AUTHORIZED_USER.toLowerCase()) {
        await this.sendMessage(chatId, `⛔ Sorry @${username}, only @${AUTHORIZED_USER} can write files.`)
        return
      }
      
      // Parse natural language file creation
      const fileMatch = text.match(/(?:file|document)\s+(?:called|named|:)?\s*([^\s]+)/i)
      const contentMatch = text.match(/(?:with|containing|content|saying|message)[\s:]*(.+)/i)
      
      if (fileMatch && contentMatch) {
        const filename = fileMatch[1].replace(/['"]/g, '')
        const content = contentMatch[1].trim()
        await this.sendMessage(chatId, `📝 I'll create that file for you!\n\nUsing command: :h write ${filename} ${content}`)
        await this.handleWriteCommand(chatId, filename, content)
        return
      } else {
        await this.sendMessage(chatId, '💡 To create a file, use:\n\n**Natural language**: "Create a file called test.md with Hello World"\n\n**Command**: :h write test.md Hello World')
        return
      }
    }
    
    // Greetings
    if (lowerText.includes('hello') || lowerText.includes('hi') || lowerText.includes('hey')) {
      await this.sendMessage(chatId, 'Hello! 👋 I\'m the Hermes bot. I can help you explore the workspace and chat about various topics.\n\nTry :h help to see workspace commands.')
    } 
    // Bot identity questions
    else if (lowerText.includes('who are you') || lowerText.includes('what are you') || lowerText.includes('your job')) {
      await this.sendMessage(chatId, 'I\'m Hermes, your friendly Telegram bot! 🤖\n\nMy job is to:\n• Help you explore the workspace files\n• Answer questions about code and projects\n• Assist with general queries\n\nFor workspace access, use :h commands (authorized users only).')
    }
    // Capabilities
    else if (lowerText.includes('what can you do') || lowerText.includes('capabilities')) {
      await this.sendMessage(chatId, 'I can:\n\n📁 **Workspace Commands** (for @' + AUTHORIZED_USER + '):\n• List files (:h ls)\n• Read file contents (:h cat <file>)\n\n💬 **General Chat**:\n• Answer questions\n• Discuss projects\n• Provide helpful information\n\nTry asking me anything!')
    }
    // README specific
    else if (lowerText.includes('readme')) {
      await this.sendMessage(chatId, '📄 To read the README file, use: :h cat README.md\n\nThis will show you the actual README from your project.')
    }
    // Help
    else if (lowerText.includes('help')) {
      await this.sendMessage(chatId, '🔧 For workspace commands, use: :h help\n\nFor general conversation, just chat naturally! I can discuss:\n• Programming topics\n• Your projects\n• General questions\n\nTo pause messages, say "stop".')
    }
    // How are you
    else if (lowerText.includes('how are you')) {
      await this.sendMessage(chatId, 'I\'m doing great, thanks for asking! 😊 Ready to help with your workspace or chat about anything. How can I assist you today?')
    }
    // Thanks
    else if (lowerText.includes('thank') || lowerText.includes('thanks')) {
      await this.sendMessage(chatId, 'You\'re welcome! 😊 Happy to help anytime.')
    }
    // Programming topics
    else if (lowerText.includes('python') || lowerText.includes('javascript') || lowerText.includes('typescript') || lowerText.includes('code')) {
      await this.sendMessage(chatId, 'I see you\'re interested in programming! While I can\'t execute code directly, I can:\n\n• Help you explore code files in the workspace\n• Discuss programming concepts\n• Read and explain code from your project\n\nTry :h ls to see your project files!')
    }
    // Default response - more conversational
    else {
      const responses = [
        `That\'s an interesting point about "${text}". While I don\'t have full AI capabilities in this simple mode, I can help you explore your workspace files or discuss your project.\n\nTry :h help for workspace commands!`,
        `I heard you say "${text}". I\'m here to help with workspace exploration and general chat!\n\n💡 Quick tip: Use :h ls to see your project files.`,
        `"${text}" - got it! Feel free to ask me about:\n• Your project files (:h commands)\n• General questions\n• Programming topics\n\nWhat would you like to explore?`,
        `Thanks for sharing! While I\'m a simple bot, I can help you navigate your workspace and discuss various topics.\n\nFor your project files, try :h ls or :h cat <filename>`
      ]
      const response = responses[Math.floor(Math.random() * responses.length)]
      await this.sendMessage(chatId, response)
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
    console.log(`📖 Reading file: ${filename}`)
    try {
      const filePath = path.join(WORKSPACE_PATH, filename)
      const content = await fs.readFile(filePath, 'utf-8')
      const preview = content.slice(0, 2000) // Reduced to avoid Telegram limits
      const truncated = content.length > 2000 ? '\n\n... (truncated)' : ''
      
      // Split into multiple messages if needed to avoid markdown issues
      await this.sendMessage(chatId, `📄 **${filename}:**`)
      await this.sendMessage(chatId, `\`\`\`\n${preview}${truncated}\n\`\`\``)
    } catch (error) {
      console.error(`❌ Error reading file ${filename}:`, error)
      await this.sendMessage(chatId, `❌ Error reading file: ${error}`)
    }
  }

  private async handleWriteCommand(chatId: number, filename: string, content: string) {
    console.log(`✍️ Writing file: ${filename}`)
    
    // Security: prevent writing outside workspace
    if (filename.includes('..') || filename.startsWith('/')) {
      await this.sendMessage(chatId, '❌ Invalid filename. Cannot use .. or absolute paths.')
      return
    }
    
    // Security: prevent overwriting important files
    const protectedFiles = ['.env', 'package.json', 'tsconfig.json', '.gitignore']
    if (protectedFiles.includes(filename)) {
      await this.sendMessage(chatId, `❌ Cannot overwrite protected file: ${filename}`)
      return
    }
    
    try {
      const filePath = path.join(WORKSPACE_PATH, filename)
      
      // Create directory if needed
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      
      // Write the file
      await fs.writeFile(filePath, content, 'utf-8')
      
      await this.sendMessage(chatId, `✅ File written successfully: ${filename}\n\nContent:\n\`\`\`\n${content}\n\`\`\``)
    } catch (error) {
      console.error(`❌ Error writing file ${filename}:`, error)
      await this.sendMessage(chatId, `❌ Error writing file: ${error}`)
    }
  }

  private async handleEditCommand(chatId: number, filename: string, oldText: string, newText: string) {
    console.log(`✏️ Editing file: ${filename}`)
    
    // Security checks
    if (filename.includes('..') || filename.startsWith('/')) {
      await this.sendMessage(chatId, '❌ Invalid filename. Cannot use .. or absolute paths.')
      return
    }
    
    const protectedFiles = ['.env', 'package.json', 'tsconfig.json', '.gitignore']
    if (protectedFiles.includes(filename)) {
      await this.sendMessage(chatId, `❌ Cannot edit protected file: ${filename}`)
      return
    }
    
    try {
      const filePath = path.join(WORKSPACE_PATH, filename)
      
      // Read current content
      let content: string
      try {
        content = await fs.readFile(filePath, 'utf-8')
      } catch (error) {
        await this.sendMessage(chatId, `❌ File not found: ${filename}`)
        return
      }
      
      // Check if old text exists
      if (!content.includes(oldText)) {
        await this.sendMessage(chatId, `❌ Text not found in file: "${oldText}"\n\nTip: Make sure the text matches exactly, including spaces and newlines.`)
        return
      }
      
      // Replace the text
      const newContent = content.replace(oldText, newText)
      
      // Write back
      await fs.writeFile(filePath, newContent, 'utf-8')
      
      // Show a preview of the change
      const preview = newContent.slice(0, 500)
      const truncated = newContent.length > 500 ? '\n\n... (showing first 500 chars)' : ''
      
      await this.sendMessage(chatId, `✅ File edited successfully: ${filename}\n\nChanged:\n"${oldText}"\n→\n"${newText}"\n\nNew content:\n\`\`\`\n${preview}${truncated}\n\`\`\``)
    } catch (error) {
      console.error(`❌ Error editing file ${filename}:`, error)
      await this.sendMessage(chatId, `❌ Error editing file: ${error}`)
    }
  }

  private async handleAppendCommand(chatId: number, filename: string, content: string) {
    console.log(`➕ Appending to file: ${filename}`)
    
    // Security checks
    if (filename.includes('..') || filename.startsWith('/')) {
      await this.sendMessage(chatId, '❌ Invalid filename. Cannot use .. or absolute paths.')
      return
    }
    
    try {
      const filePath = path.join(WORKSPACE_PATH, filename)
      
      // Check if file exists
      let existingContent = ''
      try {
        existingContent = await fs.readFile(filePath, 'utf-8')
      } catch (error) {
        // File doesn't exist, that's ok for append
        console.log('File does not exist, will create it')
      }
      
      // Append with newline if file has content
      const contentToWrite = existingContent 
        ? existingContent + (existingContent.endsWith('\n') ? '' : '\n') + content
        : content
      
      // Write the file
      await fs.writeFile(filePath, contentToWrite, 'utf-8')
      
      // Show what was appended
      await this.sendMessage(chatId, `✅ Appended to file: ${filename}\n\nAdded:\n\`\`\`\n${content}\n\`\`\``)
    } catch (error) {
      console.error(`❌ Error appending to file ${filename}:`, error)
      await this.sendMessage(chatId, `❌ Error appending to file: ${error}`)
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
      console.log('✅ Simple Final bot started!')
      console.log('🔒 Authorized user:', AUTHORIZED_USER)
      console.log('🚫 Bot will ignore ALL bot messages')
      console.log('📝 Tracking message IDs to prevent loops')
    })
  }
}

const server = new SimpleFinalTelegramBot()
server.start().catch(console.error)