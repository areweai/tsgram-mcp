#!/usr/bin/env node

import { Command } from 'commander'
import { spawn } from 'child_process'
import { TelegramBotClient } from './telegram/bot-client.js'
import { BotConfig } from './types/telegram.js'
import dotenv from 'dotenv'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const program = new Command()

program
  .name('telegram-mcp')
  .description('Telegram MCP Server CLI')
  .version('1.0.0')

program
  .command('start')
  .description('Start the MCP server')
  .option('-p, --port <port>', 'Port for HTTP server', '4000')
  .action(async (options) => {
    console.log('🚀 Starting Telegram MCP Server...')
    
    // Start MCP server via stdio
    const mcpProcess = spawn('tsx', ['src/mcp-server.ts'], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    })
    
    mcpProcess.on('error', (error) => {
      console.error('❌ Failed to start MCP server:', error)
      process.exit(1)
    })
    
    mcpProcess.on('close', (code) => {
      console.log(`📡 MCP server exited with code ${code}`)
      process.exit(code || 0)
    })
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down gracefully...')
      mcpProcess.kill('SIGTERM')
    })
  })

program
  .command('dev')
  .description('Start development server with SPA')
  .action(async () => {
    console.log('🔧 Starting development environment...')
    
    // Start SPA dev server
    const spaProcess = spawn('npm', ['run', 'dev:spa'], {
      stdio: 'inherit',
      shell: true,
    })
    
    // Start MCP server
    const mcpProcess = spawn('tsx', ['src/mcp-server.ts'], {
      stdio: 'pipe',
      cwd: path.join(__dirname, '..'),
    })
    
    mcpProcess.stdout?.on('data', (data) => {
      console.log('📡 MCP:', data.toString().trim())
    })
    
    mcpProcess.stderr?.on('data', (data) => {
      console.error('📡 MCP Error:', data.toString().trim())
    })
    
    console.log('🌐 SPA available at: http://localhost:3000')
    console.log('📡 MCP server running on stdio')
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down development environment...')
      spaProcess.kill('SIGTERM')
      mcpProcess.kill('SIGTERM')
      process.exit(0)
    })
  })

program
  .command('test-bot')
  .description('Test a bot configuration')
  .requiredOption('-t, --token <token>', 'Bot token to test')
  .option('-n, --name <name>', 'Bot name', 'Test Bot')
  .action(async (options) => {
    console.log(`🧪 Testing bot: ${options.name}`)
    
    const config: BotConfig = {
      token: options.token,
      name: options.name,
      description: 'Test bot instance',
    }
    
    try {
      const client = new TelegramBotClient(config)
      const result = await client.getMe()
      
      if (result.success) {
        console.log('✅ Bot test successful!')
        console.log('📋 Bot info:', JSON.stringify(result.data, null, 2))
      } else {
        console.error('❌ Bot test failed:', result.error)
        process.exit(1)
      }
    } catch (error) {
      console.error('❌ Test error:', error instanceof Error ? error.message : error)
      process.exit(1)
    }
  })

program
  .command('list-bots')
  .description('List all configured bots')
  .action(async () => {
    try {
      const configFile = path.join(__dirname, '..', 'data', 'bots.json')
      const data = await fs.readFile(configFile, 'utf-8')
      const bots = JSON.parse(data)
      
      if (bots.length === 0) {
        console.log('📭 No bots configured')
        return
      }
      
      console.log(`🤖 Configured bots (${bots.length}):`)
      bots.forEach((bot: any, index: number) => {
        console.log(`${index + 1}. ${bot.name} (ID: ${bot.id})`)
        console.log(`   Description: ${bot.description || 'No description'}`)
        console.log(`   Created: ${new Date(bot.created_at).toLocaleDateString()}`)
        console.log()
      })
    } catch (error) {
      console.log('📭 No bots configured yet')
    }
  })

program
  .command('send-message')
  .description('Send a test message')
  .requiredOption('-b, --bot <botId>', 'Bot ID to use')
  .requiredOption('-c, --chat <chatId>', 'Chat ID to send to')
  .requiredOption('-m, --message <message>', 'Message to send')
  .action(async (options) => {
    try {
      const configFile = path.join(__dirname, '..', 'data', 'bots.json')
      const data = await fs.readFile(configFile, 'utf-8')
      const bots = JSON.parse(data)
      
      const bot = bots.find((b: any) => b.id === options.bot)
      if (!bot) {
        console.error('❌ Bot not found:', options.bot)
        process.exit(1)
      }
      
      const client = new TelegramBotClient(bot.config)
      const result = await client.sendMessage({
        chat_id: options.chat,
        text: options.message,
      })
      
      if (result.success) {
        console.log('✅ Message sent successfully!')
        console.log('📤 Message details:', JSON.stringify(result.data, null, 2))
      } else {
        console.error('❌ Failed to send message:', result.error)
        process.exit(1)
      }
    } catch (error) {
      console.error('❌ Send error:', error instanceof Error ? error.message : error)
      process.exit(1)
    }
  })

program
  .command('web')
  .description('Open the web management interface')
  .option('-p, --port <port>', 'Port to run on', '3000')
  .action(async (options) => {
    console.log(`🌐 Starting web interface on port ${options.port}...`)
    
    const webProcess = spawn('npm', ['run', 'dev:spa'], {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, PORT: options.port },
    })
    
    console.log(`🌐 Web interface available at: http://localhost:${options.port}`)
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down web interface...')
      webProcess.kill('SIGTERM')
      process.exit(0)
    })
  })

program
  .command('init')
  .description('Initialize configuration files')
  .action(async () => {
    console.log('🔧 Initializing Telegram MCP configuration...')
    
    try {
      // Create data directory
      const dataDir = path.join(__dirname, '..', 'data')
      await fs.mkdir(dataDir, { recursive: true })
      
      // Create empty bots.json
      const botsFile = path.join(dataDir, 'bots.json')
      await fs.writeFile(botsFile, '[]', { flag: 'wx' }).catch(() => {
        console.log('📁 bots.json already exists')
      })
      
      // Create example .env file
      const envExample = `# Telegram MCP Server Configuration
MCP_SERVER_NAME=telegram-mcp-server
MCP_SERVER_VERSION=1.0.0
MCP_SERVER_PORT=4000

# Bot Configuration
DEFAULT_BOT_TIMEOUT=30000
MAX_MESSAGE_LENGTH=4096

# Development
NODE_ENV=development
LOG_LEVEL=info

# Example Bot Token (replace with real token from @BotFather)
# TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
`
      
      const envFile = path.join(__dirname, '..', '.env.example')
      await fs.writeFile(envFile, envExample, { flag: 'wx' }).catch(() => {
        console.log('📁 .env.example already exists')
      })
      
      console.log('✅ Configuration initialized!')
      console.log('📋 Next steps:')
      console.log('1. Copy .env.example to .env and configure your settings')
      console.log('2. Create a bot with @BotFather on Telegram')
      console.log('3. Run "telegram-mcp test-bot -t YOUR_BOT_TOKEN" to test')
      console.log('4. Run "telegram-mcp web" to open the management interface')
      
    } catch (error) {
      console.error('❌ Initialization failed:', error instanceof Error ? error.message : error)
      process.exit(1)
    }
  })

// Error handling
program.exitOverride()

try {
  program.parse()
} catch (error: any) {
  if (error.code === 'commander.helpDisplayed') {
    process.exit(0)
  }
  console.error('❌ CLI Error:', error.message)
  process.exit(1)
}