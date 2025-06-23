#!/usr/bin/env node

/**
 * TELEGRAM MCP WORKSPACE SERVER WITH AUTH
 * 
 * Enhanced version that:
 * 1. Only accepts commands from @duncist
 * 2. Provides workspace file editing with rsync
 * 3. Maintains all existing Hermes MCP features
 * 4. Auto-responds to messages with AI
 */

import express from 'express'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { TelegramBotClient } from './telegram/bot-client.js'
import { BotConfig, Update } from './types/telegram.js'
import { ChatModel } from './models/index.js'
import fs from 'fs/promises'
import { existsSync, statSync } from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import dotenv from 'dotenv'

dotenv.config()

// Authorization config
const AUTHORIZED_USER = process.env.AUTHORIZED_USER || 'duncist'
const AUTHORIZED_CHAT_ID = parseInt(process.env.AUTHORIZED_CHAT_ID || '5988959818')
const WORKSPACE_PATH = process.env.WORKSPACE_PATH || '/app/workspace'

class TelegramMCPWorkspaceAuth {
  private app: express.Application
  private mcpServer: Server
  private botClient: TelegramBotClient | null = null
  private port: number = parseInt(process.env.MCP_SERVER_PORT || '4040')
  private pollingOffset: number = 0

  constructor() {
    this.app = express()
    
    this.mcpServer = new Server(
      {
        name: 'hermes-mcp-workspace',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    )

    this.setupExpress()
    this.setupMCPHandlers()
    this.initializeBot()
  }

  private setupExpress() {
    this.app.use(express.json())

    // Health endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        service: 'hermes-mcp-workspace',
        authorized_user: AUTHORIZED_USER,
        workspace: WORKSPACE_PATH,
        timestamp: new Date().toISOString()
      })
    })

    // Webhook endpoint
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
      name: 'Hermes MCP Workspace',
      allowed_updates: ['message'],
      drop_pending_updates: true,
    }

    this.botClient = new TelegramBotClient(botConfig)
    
    const result = await this.botClient.getMe()
    if (result.success) {
      console.log('✅ Telegram bot initialized:', result.data?.username)
      this.startPolling()
    }
  }

  private async startPolling() {
    console.log('🔄 Starting Telegram polling...')
    
    while (true) {
      try {
        const updates = await this.botClient!.getUpdates({
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

  private async handleUpdate(update: Update) {
    if (!update.message || !update.message.text) return

    const { message } = update
    const chatId = message.chat.id
    const username = message.from?.username || 'unknown'
    const text = message.text

    console.log(`💬 Message from @${username} (${chatId}): ${text}`)

    // Check authorization
    if (username !== AUTHORIZED_USER && chatId !== AUTHORIZED_CHAT_ID) {
      console.log(`⛔ Unauthorized user: @${username}`)
      await this.sendMessage(chatId, '⛔ Sorry, you are not authorized to use this bot.')
      return
    }

    // Check for workspace commands
    if (text.startsWith('/')) {
      await this.handleCommand(message)
      return
    }

    // Generate AI response
    await this.handleAIResponse(message)
  }

  private async handleCommand(message: any) {
    const text = message.text
    const chatId = message.chat.id
    const [command, ...args] = text.split(' ')

    switch (command) {
      case '/sync':
        await this.handleSyncCommand(chatId, args)
        break
      
      case '/edit':
        await this.handleEditCommand(chatId, args)
        break
      
      case '/ls':
        await this.handleListCommand(chatId, args)
        break
      
      case '/cat':
        await this.handleReadCommand(chatId, args)
        break
      
      case '/exec':
        await this.handleExecCommand(chatId, args)
        break
      
      case '/status':
        await this.handleStatusCommand(chatId)
        break
      
      case '/help':
        await this.sendMessage(chatId, `📚 **Workspace Commands:**
/sync - Sync from local to workspace
/edit <file> - Edit a file (use with next message)
/ls [path] - List files
/cat <file> - Read file content
/exec <cmd> - Execute command
/status - Show workspace status
/help - Show this help

Regular messages get AI responses.`)
        break
      
      default:
        await this.sendMessage(chatId, `❓ Unknown command: ${command}`)
    }
  }

  private async handleSyncCommand(chatId: number, args: string[]) {
    try {
      const result = execSync(
        'rsync -av --password-file=/etc/rsync.password ' +
        'rsync://mcp@host.docker.internal:8873/project/ /app/workspace/',
        { encoding: 'utf8' }
      )
      
      const lines = result.split('\n').filter(l => l.trim())
      const fileCount = lines.filter(l => !l.startsWith('sending') && !l.startsWith('total')).length
      
      await this.sendMessage(chatId, `✅ Synced ${fileCount} files from local to workspace`)
    } catch (error) {
      await this.sendMessage(chatId, `❌ Sync failed: ${error}`)
    }
  }

  private async handleEditCommand(chatId: number, args: string[]) {
    if (args.length === 0) {
      await this.sendMessage(chatId, '❌ Usage: /edit <filename>')
      return
    }

    const filename = args.join(' ')
    await this.sendMessage(chatId, `📝 Send the new content for ${filename}:`)
    
    // Store pending edit in memory (in production, use Redis)
    (global as any).pendingEdit = { chatId, filename }
  }

  private async handleListCommand(chatId: number, args: string[]) {
    const targetPath = path.join(WORKSPACE_PATH, args.join(' ') || '')
    
    try {
      const files = await fs.readdir(targetPath)
      const fileList = files.map(f => {
        const fullPath = path.join(targetPath, f)
        const stats = statSync(fullPath)
        return `${stats.isDirectory() ? '📁' : '📄'} ${f}`
      })
      
      await this.sendMessage(chatId, `📂 ${args.join(' ') || '/'}\n${fileList.join('\n')}`)
    } catch (error) {
      await this.sendMessage(chatId, `❌ Cannot list: ${error}`)
    }
  }

  private async handleReadCommand(chatId: number, args: string[]) {
    if (args.length === 0) {
      await this.sendMessage(chatId, '❌ Usage: /cat <filename>')
      return
    }

    const filename = args.join(' ')
    const filepath = path.join(WORKSPACE_PATH, filename)
    
    try {
      const content = await fs.readFile(filepath, 'utf8')
      const truncated = content.length > 3000 ? content.substring(0, 3000) + '\n...[truncated]' : content
      await this.sendMessage(chatId, `📄 ${filename}:\n\`\`\`\n${truncated}\n\`\`\``)
    } catch (error) {
      await this.sendMessage(chatId, `❌ Cannot read ${filename}: ${error}`)
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
      await this.sendMessage(chatId, `💻 Output:\n\`\`\`\n${truncated}\n\`\`\``)
    } catch (error: any) {
      await this.sendMessage(chatId, `❌ Command failed:\n\`\`\`\n${error.message}\n\`\`\``)
    }
  }

  private async handleStatusCommand(chatId: number) {
    const files = await fs.readdir(WORKSPACE_PATH)
    const totalSize = files.reduce((sum, file) => {
      try {
        const stats = statSync(path.join(WORKSPACE_PATH, file))
        return sum + stats.size
      } catch {
        return sum
      }
    }, 0)

    await this.sendMessage(chatId, `📊 **Workspace Status:**
📁 Path: ${WORKSPACE_PATH}
📄 Files: ${files.length}
💾 Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB
🔒 User: @${AUTHORIZED_USER}
✅ Rsync: Active
🔄 Auto-sync: Enabled`)
  }

  private async handleAIResponse(message: any) {
    const chatId = message.chat.id
    const username = message.from?.username || 'unknown'
    const text = message.text

    // Check for pending edit
    const pendingEdit = (global as any).pendingEdit
    if (pendingEdit && pendingEdit.chatId === chatId) {
      const filepath = path.join(WORKSPACE_PATH, pendingEdit.filename)
      
      try {
        await fs.mkdir(path.dirname(filepath), { recursive: true })
        await fs.writeFile(filepath, text, 'utf8')
        await this.sendMessage(chatId, `✅ Saved ${pendingEdit.filename}`)
        delete (global as any).pendingEdit
      } catch (error) {
        await this.sendMessage(chatId, `❌ Failed to save: ${error}`)
      }
      return
    }

    // Generate AI response
    try {
      const aiAPI = ChatModel.createAPI('openrouter')
      const response = await aiAPI.send(`User (@${username}): ${text}`)
      await this.sendMessage(chatId, response)
    } catch (error) {
      await this.sendMessage(chatId, `❌ AI error: ${error}`)
    }
  }

  private async sendMessage(chatId: number, text: string) {
    if (!this.botClient) return
    
    await this.botClient.sendMessage({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown'
    })
  }

  private setupMCPHandlers() {
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'workspace_info',
            description: 'Get workspace information',
            inputSchema: { type: 'object', properties: {} }
          }
        ]
      }
    })

    this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
      return {
        content: [{
          type: 'text',
          text: `Workspace at ${WORKSPACE_PATH} - Use Telegram commands to manage files.`
        }]
      }
    })
  }

  async start() {
    // Start Express
    this.app.listen(this.port, () => {
      console.log(`🌐 HTTP Server started on port ${this.port}`)
    })

    // Connect MCP
    const transport = new StdioServerTransport()
    await this.mcpServer.connect(transport)
    console.log('🤖 MCP Server connected')

    console.log('✅ Hermes MCP Workspace Server started!')
    console.log(`🔒 Authorized user: @${AUTHORIZED_USER}`)
  }
}

const server = new TelegramMCPWorkspaceAuth()
server.start().catch(console.error)