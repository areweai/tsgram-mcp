#!/usr/bin/env node

/**
 * QR CODE WEBHOOK SETUP
 * 
 * Creates a QR code that users can scan to automatically configure
 * their Telegram bot with TSGram webhook integration.
 * 
 * The QR code points to a hosted webhook that:
 * 1. Receives bot token and chat ID from the user
 * 2. Automatically configures the bot webhook
 * 3. Returns configuration instructions
 */

import express from 'express'
import cors from 'cors'
import qrcode from 'qrcode'
import { randomUUID } from 'crypto'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

interface SetupSession {
  id: string
  timestamp: number
  userAgent?: string
  ipAddress?: string
  botToken?: string
  chatId?: string
  username?: string
  webhookUrl?: string
  status: 'pending' | 'collecting' | 'configuring' | 'completed' | 'error'
  error?: string
}

class QRWebhookSetup {
  private app: express.Application
  private port: number = parseInt(process.env.QR_WEBHOOK_PORT || '8080')
  private baseUrl: string = process.env.QR_WEBHOOK_BASE_URL || `http://localhost:${this.port}`
  private sessions: Map<string, SetupSession> = new Map()
  
  constructor() {
    this.app = express()
    this.setupMiddleware()
    this.setupRoutes()
    this.cleanupOldSessions()
  }

  private setupMiddleware() {
    this.app.use(cors())
    this.app.use(express.json())
    this.app.use(express.urlencoded({ extended: true }))
    this.app.use(express.static('public'))
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`)
      next()
    })
  }

  private setupRoutes() {
    // Generate QR code for setup
    this.app.get('/generate-qr', async (req, res) => {
      try {
        const sessionId = randomUUID()
        const setupUrl = `${this.baseUrl}/setup/${sessionId}`
        
        // Create session
        const session: SetupSession = {
          id: sessionId,
          timestamp: Date.now(),
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip,
          status: 'pending'
        }
        
        this.sessions.set(sessionId, session)
        
        // Generate QR code
        const qrCodeDataUrl = await qrcode.toDataURL(setupUrl, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        })
        
        res.json({
          success: true,
          sessionId,
          setupUrl,
          qrCode: qrCodeDataUrl,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
        })
        
        console.log(`🆔 Generated QR code for session: ${sessionId}`)
        
      } catch (error) {
        console.error('❌ QR generation error:', error)
        res.status(500).json({
          success: false,
          error: 'Failed to generate QR code'
        })
      }
    })

    // Setup page (scanned from QR code)
    this.app.get('/setup/:sessionId', (req, res) => {
      const { sessionId } = req.params
      const session = this.sessions.get(sessionId)
      
      if (!session) {
        return res.status(404).send(this.generateErrorPage('Setup session not found or expired'))
      }
      
      if (session.status === 'completed') {
        return res.send(this.generateCompletedPage(session))
      }
      
      // Update session status
      session.status = 'collecting'
      this.sessions.set(sessionId, session)
      
      res.send(this.generateSetupPage(sessionId))
    })

    // Handle form submission
    this.app.post('/setup/:sessionId', async (req, res) => {
      const { sessionId } = req.params
      const { botToken, chatId, username } = req.body
      
      const session = this.sessions.get(sessionId)
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Setup session not found or expired'
        })
      }
      
      try {
        // Update session with user data
        session.botToken = botToken
        session.chatId = chatId
        session.username = username
        session.status = 'configuring'
        this.sessions.set(sessionId, session)
        
        // Validate bot token
        const botInfo = await this.validateBotToken(botToken)
        if (!botInfo.success) {
          throw new Error(`Invalid bot token: ${botInfo.error}`)
        }
        
        // Configure webhook
        const webhookUrl = `${this.baseUrl}/webhook/telegram/${sessionId}`
        const webhookResult = await this.setupWebhook(botToken, webhookUrl)
        
        if (!webhookResult.success) {
          throw new Error(`Webhook setup failed: ${webhookResult.error}`)
        }
        
        // Update session with success
        session.webhookUrl = webhookUrl
        session.status = 'completed'
        this.sessions.set(sessionId, session)
        
        // Send test message
        await this.sendTestMessage(botToken, chatId, botInfo.data.username)
        
        res.json({
          success: true,
          message: 'Setup completed successfully!',
          botUsername: botInfo.data.username,
          webhookUrl: webhookUrl,
          testMessageSent: true
        })
        
        console.log(`✅ Setup completed for session: ${sessionId}, bot: @${botInfo.data.username}`)
        
      } catch (error) {
        console.error(`❌ Setup error for session ${sessionId}:`, error)
        
        session.status = 'error'
        session.error = error instanceof Error ? error.message : 'Unknown error'
        this.sessions.set(sessionId, session)
        
        res.status(400).json({
          success: false,
          error: session.error
        })
      }
    })

    // Webhook endpoint for configured bots
    this.app.post('/webhook/telegram/:sessionId', async (req, res) => {
      const { sessionId } = req.params
      const update = req.body
      
      const session = this.sessions.get(sessionId)
      if (!session || session.status !== 'completed') {
        return res.status(404).json({ error: 'Invalid webhook session' })
      }
      
      try {
        console.log(`📨 Webhook message for session ${sessionId}:`, update.message?.text)
        
        // Forward to TSGram system for processing
        await this.forwardToTSGram(session, update)
        
        res.json({ ok: true })
        
      } catch (error) {
        console.error(`❌ Webhook processing error:`, error)
        res.status(500).json({ error: 'Processing failed' })
      }
    })

    // Session status endpoint
    this.app.get('/status/:sessionId', (req, res) => {
      const { sessionId } = req.params
      const session = this.sessions.get(sessionId)
      
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        })
      }
      
      res.json({
        success: true,
        status: session.status,
        timestamp: session.timestamp,
        error: session.error,
        configured: session.status === 'completed'
      })
    })

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        activeSessions: this.sessions.size,
        uptime: process.uptime()
      })
    })
  }

  private async validateBotToken(token: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`)
      const data = await response.json()
      
      if (data.ok) {
        return { success: true, data: data.result }
      } else {
        return { success: false, error: data.description || 'Invalid token' }
      }
    } catch (error) {
      return { success: false, error: 'Network error' }
    }
  }

  private async setupWebhook(token: string, webhookUrl: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      })
      
      const data = await response.json()
      
      if (data.ok) {
        return { success: true }
      } else {
        return { success: false, error: data.description || 'Webhook setup failed' }
      }
    } catch (error) {
      return { success: false, error: 'Network error' }
    }
  }

  private async sendTestMessage(token: string, chatId: string, botUsername: string): Promise<void> {
    const message = `🎉 TSGram Setup Complete!

Your bot @${botUsername} is now connected to the TSGram AI assistant.

Try sending a message like:
• "What's in my package.json?"
• "Run the tests"
• "Explain this code"

🔗 Configured via QR code setup
⚡ Powered by Claude AI`

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    })
  }

  private async forwardToTSGram(session: SetupSession, update: any): Promise<void> {
    // Forward to local TSGram system
    const tsgromEndpoint = process.env.TSGRAM_WEBHOOK_URL || 'http://localhost:4041/webhook/telegram'
    
    try {
      await fetch(tsgromEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update)
      })
    } catch (error) {
      console.error('Failed to forward to TSGram:', error)
    }
  }

  private generateSetupPage(sessionId: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TSGram Bot Setup</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
            color: #333;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo {
            font-size: 48px;
            margin-bottom: 10px;
        }
        h1 {
            color: #2c3e50;
            margin: 0 0 10px 0;
        }
        .subtitle {
            color: #7f8c8d;
            margin-bottom: 30px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
            color: #2c3e50;
        }
        input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e1e8ed;
            border-radius: 6px;
            font-size: 16px;
            box-sizing: border-box;
        }
        input:focus {
            outline: none;
            border-color: #3498db;
        }
        .help-text {
            font-size: 14px;
            color: #7f8c8d;
            margin-top: 5px;
        }
        .submit-btn {
            width: 100%;
            background: #3498db;
            color: white;
            padding: 15px;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.3s;
        }
        .submit-btn:hover {
            background: #2980b9;
        }
        .submit-btn:disabled {
            background: #bdc3c7;
            cursor: not-allowed;
        }
        .steps {
            background: #ecf0f1;
            padding: 20px;
            border-radius: 6px;
            margin-bottom: 30px;
        }
        .steps h3 {
            margin-top: 0;
            color: #2c3e50;
        }
        .steps ol {
            margin: 0;
            padding-left: 20px;
        }
        .steps li {
            margin-bottom: 8px;
        }
        .loading {
            display: none;
            text-align: center;
            padding: 20px;
        }
        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #3498db;
            border-radius: 50%;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .error {
            background: #e74c3c;
            color: white;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            display: none;
        }
        .success {
            background: #27ae60;
            color: white;
            padding: 15px;
            border-radius: 6px;
            margin-bottom: 20px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">🤖</div>
            <h1>TSGram Bot Setup</h1>
            <div class="subtitle">Configure your Telegram AI assistant</div>
        </div>

        <div class="steps">
            <h3>Before you start:</h3>
            <ol>
                <li>Create a Telegram bot with <strong>@BotFather</strong></li>
                <li>Send <code>/newbot</code> and follow instructions</li>
                <li>Copy your bot token (looks like: <code>123456:ABC...</code>)</li>
                <li>Send a message to your bot, then get your chat ID from: <br>
                    <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code></li>
            </ol>
        </div>

        <div class="error" id="error"></div>
        <div class="success" id="success"></div>
        <div class="loading" id="loading">
            <div class="spinner"></div>
            <div>Configuring your bot...</div>
        </div>

        <form id="setupForm" onsubmit="submitForm(event)">
            <div class="form-group">
                <label for="botToken">Bot Token *</label>
                <input type="text" id="botToken" name="botToken" required 
                       placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz">
                <div class="help-text">Get this from @BotFather after creating your bot</div>
            </div>

            <div class="form-group">
                <label for="chatId">Chat ID *</label>
                <input type="text" id="chatId" name="chatId" required 
                       placeholder="123456789">
                <div class="help-text">Your Telegram user ID (found in getUpdates response)</div>
            </div>

            <div class="form-group">
                <label for="username">Username</label>
                <input type="text" id="username" name="username" 
                       placeholder="your_username">
                <div class="help-text">Your Telegram username (optional)</div>
            </div>

            <button type="submit" class="submit-btn">Configure Bot</button>
        </form>
    </div>

    <script>
        async function submitForm(event) {
            event.preventDefault();
            
            const form = document.getElementById('setupForm');
            const loading = document.getElementById('loading');
            const error = document.getElementById('error');
            const success = document.getElementById('success');
            
            // Hide previous messages
            error.style.display = 'none';
            success.style.display = 'none';
            
            // Show loading
            form.style.display = 'none';
            loading.style.display = 'block';
            
            try {
                const formData = new FormData(form);
                const response = await fetch(window.location.href, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        botToken: formData.get('botToken'),
                        chatId: formData.get('chatId'),
                        username: formData.get('username')
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    success.innerHTML = \`
                        <strong>🎉 Setup Complete!</strong><br>
                        Bot: @\${data.botUsername}<br>
                        Webhook configured: ✅<br>
                        Test message sent: \${data.testMessageSent ? '✅' : '❌'}<br><br>
                        Your AI assistant is ready! Try messaging your bot.
                    \`;
                    success.style.display = 'block';
                } else {
                    throw new Error(data.error || 'Setup failed');
                }
                
            } catch (err) {
                error.textContent = 'Error: ' + err.message;
                error.style.display = 'block';
                form.style.display = 'block';
            }
            
            loading.style.display = 'none';
        }
    </script>
</body>
</html>`
  }

  private generateCompletedPage(session: SetupSession): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Setup Complete - TSGram</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
            color: #333;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
        }
        .success-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        h1 {
            color: #27ae60;
            margin-bottom: 10px;
        }
        .details {
            background: #ecf0f1;
            padding: 20px;
            border-radius: 6px;
            margin: 20px 0;
            text-align: left;
        }
        .webhook-url {
            font-family: monospace;
            background: #2c3e50;
            color: #ecf0f1;
            padding: 10px;
            border-radius: 4px;
            word-break: break-all;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✅</div>
        <h1>Setup Complete!</h1>
        <p>Your Telegram bot has been successfully configured with TSGram.</p>
        
        <div class="details">
            <h3>Configuration Details:</h3>
            <p><strong>Session ID:</strong> ${session.id}</p>
            <p><strong>Configured:</strong> ${new Date(session.timestamp).toLocaleString()}</p>
            <p><strong>Webhook URL:</strong></p>
            <div class="webhook-url">${session.webhookUrl}</div>
        </div>
        
        <p>Your AI assistant is ready! Try messaging your bot with questions about your code.</p>
    </div>
</body>
</html>`
  }

  private generateErrorPage(message: string): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Setup Error - TSGram</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
            color: #333;
            text-align: center;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .error-icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        h1 {
            color: #e74c3c;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">❌</div>
        <h1>Setup Error</h1>
        <p>${message}</p>
        <p>Please try generating a new QR code.</p>
    </div>
</body>
</html>`
  }

  private cleanupOldSessions() {
    // Clean up sessions older than 1 hour
    setInterval(() => {
      const now = Date.now()
      const oneHour = 60 * 60 * 1000
      
      for (const [sessionId, session] of this.sessions.entries()) {
        if (now - session.timestamp > oneHour) {
          this.sessions.delete(sessionId)
          console.log(`🧹 Cleaned up expired session: ${sessionId}`)
        }
      }
    }, 15 * 60 * 1000) // Check every 15 minutes
  }

  public async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, '0.0.0.0', () => {
        console.log(`🌐 QR Webhook Setup server started on port ${this.port}`)
        console.log(`📱 Generate QR codes at: ${this.baseUrl}/generate-qr`)
        console.log(`❤️  Health check: ${this.baseUrl}/health`)
        resolve()
      })
    })
  }
}

// Start the server if run directly
if (require.main === module) {
  const server = new QRWebhookSetup()
  server.start().catch(console.error)
}

export { QRWebhookSetup }