#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { ChatModel } from './models/index.js';

// Load environment variables
dotenv.config();

class HermesHTTPServer {
  private app: express.Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.MCP_SERVER_PORT || '4040');
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  private setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // List available AI models
    this.app.get('/api/models', async (req, res) => {
      try {
        const models = ChatModel.getSupportedModels();
        const modelStatus = [];
        
        for (const model of models) {
          const hasKey = ChatModel.hasAPIKey(model);
          modelStatus.push({
            name: model,
            available: hasKey,
            type: model === 'openai' ? 'OpenAI GPT' : 'OpenRouter Claude'
          });
        }

        res.json({ models: modelStatus });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get models' });
      }
    });

    // Chat with AI
    this.app.post('/api/chat', async (req, res) => {
      try {
        const { model, message } = req.body;
        
        if (!model || !message) {
          return res.status(400).json({ error: 'Model and message are required' });
        }

        const api = ChatModel.createAPI(model);
        const response = await api.send(message);
        
        res.json({ response, model, timestamp: new Date().toISOString() });
      } catch (error) {
        console.error('Chat error:', error);
        res.status(500).json({ error: 'Failed to process chat request' });
      }
    });

    // Send Signal message with proper error handling
    this.app.post('/api/signal/send', async (req, res) => {
      try {
        const { recipient, message } = req.body;
        
        if (!recipient || !message) {
          return res.status(400).json({ 
            error: 'Missing required fields',
            details: 'Both recipient (phone number) and message are required',
            example: { recipient: '+1234567890', message: 'Hello from hermes!' }
          });
        }

        // Check if Signal CLI REST API is available
        try {
          const signalHealthCheck = await fetch('http://signal-cli-rest-api:8080/v1/health');
          if (!signalHealthCheck.ok) {
            throw new Error('Signal service unavailable');
          }
        } catch (signalError) {
          return res.status(503).json({
            error: 'Signal service not available',
            details: 'The Signal CLI REST API is not running or not accessible',
            troubleshooting: [
              'Ensure Signal CLI container is running: docker ps --filter name=signal-cli',
              'Check Signal CLI logs: docker logs signal-cli-rest-api',
              'Verify Signal CLI health: curl http://localhost:8080/v1/health'
            ],
            recipient,
            timestamp: new Date().toISOString()
          });
        }

        // Check if a Signal number is registered
        try {
          const accountsResponse = await fetch('http://signal-cli-rest-api:8080/v1/accounts');
          const accounts = await accountsResponse.json();
          
          if (!accounts || accounts.length === 0) {
            return res.status(422).json({
              error: 'No Signal number registered',
              details: 'You must register a phone number with Signal before sending messages',
              setup_instructions: [
                '1. Register a number: curl -X POST http://localhost:8080/v1/register/{number}',
                '2. Verify with SMS code: curl -X POST http://localhost:8080/v1/verify/{number} -d "code=123456"',
                '3. Alternative: Use QR code linking for existing Signal account'
              ],
              documentation: 'https://github.com/bbernhard/signal-cli-rest-api#usage',
              recipient,
              timestamp: new Date().toISOString()
            });
          }
        } catch (accountError) {
          return res.status(500).json({
            error: 'Unable to check Signal registration status',
            details: 'Failed to query Signal CLI for registered accounts',
            possible_causes: [
              'Signal CLI service is starting up (wait 30 seconds)',
              'Signal CLI database is corrupted',
              'Network connectivity issues between containers'
            ],
            recipient,
            timestamp: new Date().toISOString()
          });
        }

        // If we get here, try to send the message
        const sendResponse = await fetch(`http://signal-cli-rest-api:8080/v2/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            number: recipient.replace(/\D/g, ''), // Remove non-digits
            recipients: [recipient]
          })
        });

        if (!sendResponse.ok) {
          const errorData = await sendResponse.text();
          return res.status(500).json({
            error: 'Failed to send Signal message',
            details: `Signal CLI returned error: ${errorData}`,
            troubleshooting: [
              'Verify recipient number format: +1234567890',
              'Check if recipient has Signal installed',
              'Verify sender number is properly registered'
            ],
            recipient,
            timestamp: new Date().toISOString()
          });
        }

        res.json({ 
          success: true, 
          message: 'Signal message sent successfully',
          recipient,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Signal error:', error);
        res.status(500).json({ error: 'Failed to send Signal message' });
      }
    });

    // Telegram webhook endpoint
    this.app.post('/webhook/telegram', async (req, res) => {
      try {
        const update = req.body;
        
        // Handle incoming messages
        if (update.message && update.message.text) {
          const chatId = update.message.chat.id;
          const userMessage = update.message.text;
          const userName = update.message.from.username || update.message.from.first_name;
          
          console.log(`Received message from ${userName}: ${userMessage}`);
          
          // Skip bot commands like /start
          if (userMessage.startsWith('/')) {
            res.json({ ok: true });
            return;
          }
          
          // Generate AI response with system prompt
          const systemPrompt = "You are the Hermes MCP server. Be polite and professional. If people have questions you don't understand or can't help with, direct them to www.arewe.ai for support.";
          
          const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'anthropic/claude-3.5-sonnet',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
              ],
              max_tokens: 500
            })
          });
          
          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const botReply = aiData.choices[0].message.content;
            
            // Send response back to Telegram
            const telegramResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: botReply
              })
            });
            
            if (telegramResponse.ok) {
              console.log(`Sent AI response to ${userName}`);
            } else {
              console.error('Failed to send Telegram message:', await telegramResponse.text());
            }
          } else {
            console.error('AI API error:', await aiResponse.text());
          }
        }
        
        res.json({ ok: true });
      } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
      }
    });

    // MCP-compatible endpoints
    this.app.get('/mcp/tools', async (req, res) => {
      res.json({
        tools: [
          {
            name: 'chat_with_ai',
            description: 'Chat with AI models via OpenAI or OpenRouter',
            inputSchema: {
              type: 'object',
              properties: {
                model: { type: 'string', enum: ['openai', 'openrouter'] },
                message: { type: 'string' }
              },
              required: ['model', 'message']
            }
          },
          {
            name: 'list_ai_models',
            description: 'List all available AI models and their status',
            inputSchema: { type: 'object', properties: {} }
          },
          {
            name: 'send_signal_message',
            description: 'Send a Signal message (when bot is running)',
            inputSchema: {
              type: 'object',
              properties: {
                recipient: { type: 'string' },
                message: { type: 'string' }
              },
              required: ['recipient', 'message']
            }
          }
        ]
      });
    });

    this.app.get('/mcp/resources', async (req, res) => {
      res.json({
        resources: [
          {
            uri: 'signal://models',
            name: 'AI Models Configuration',
            description: 'Configuration and status of available AI models',
            mimeType: 'application/json'
          },
          {
            uri: 'signal://config',
            name: 'Bot Configuration',
            description: 'Current bot configuration and status',
            mimeType: 'application/json'
          }
        ]
      });
    });
  }

  private async setupTelegramPolling() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      console.log('No Telegram bot token found, skipping polling setup');
      return;
    }
    
    console.log('Setting up Telegram polling...');
    
    let offset = 0;
    const pollInterval = 2000; // 2 seconds
    
    const poll = async () => {
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=10`);
        const data = await response.json();
        
        if (data.ok && data.result.length > 0) {
          for (const update of data.result) {
            offset = update.update_id + 1;
            
            // Process message
            if (update.message && update.message.text) {
              const chatId = update.message.chat.id;
              const userMessage = update.message.text;
              const userName = update.message.from.username || update.message.from.first_name;
              
              console.log(`Received message from ${userName}: ${userMessage}`);
              
              // Skip bot commands like /start
              if (userMessage.startsWith('/')) {
                continue;
              }
              
              // Generate AI response with system prompt
              const systemPrompt = "You are the Hermes MCP server. Be polite and professional. If people have questions you don't understand or can't help with, direct them to www.arewe.ai for support.";
              
              try {
                const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    model: 'anthropic/claude-3.5-sonnet',
                    messages: [
                      { role: 'system', content: systemPrompt },
                      { role: 'user', content: userMessage }
                    ],
                    max_tokens: 500
                  })
                });
                
                if (aiResponse.ok) {
                  const aiData = await aiResponse.json();
                  const botReply = aiData.choices[0].message.content;
                  
                  // Send response back to Telegram
                  const telegramResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      chat_id: chatId,
                      text: botReply
                    })
                  });
                  
                  if (telegramResponse.ok) {
                    console.log(`Sent AI response to ${userName}`);
                  } else {
                    console.error('Failed to send Telegram message:', await telegramResponse.text());
                  }
                } else {
                  console.error('AI API error:', await aiResponse.text());
                }
              } catch (error) {
                console.error('Error processing message:', error);
              }
            }
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
      
      setTimeout(poll, pollInterval);
    };
    
    poll();
  }

  public start() {
    this.app.listen(this.port, '0.0.0.0', () => {
      console.log(`Hermes HTTP Server started on port ${this.port}`);
      console.log(`Health check: http://localhost:${this.port}/health`);
      console.log(`API docs available at http://localhost:${this.port}/api`);
      console.log(`Webhook endpoint: http://localhost:${this.port}/webhook/telegram`);
      
      // Start Telegram polling for auto-responses
      this.setupTelegramPolling();
    });
  }
}

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new HermesHTTPServer();
  server.start();
}

export { HermesHTTPServer };