#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import { config as dotenvConfig } from 'dotenv';
import { ChatModel } from './models/ChatModel.js';
import type { ModelType } from './types/index.js';

dotenvConfig();

const app = express();
const PORT = process.env.REST_SERVER_PORT || 8080;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    models: process.env.DISABLED_MODELS?.split(',') || []
  });
});

// List available models
app.get('/api/models', (req, res) => {
  const availableModels = ['openai', 'openrouter'].filter(
    model => !process.env.DISABLED_MODELS?.includes(model)
  );
  
  res.json({
    models: availableModels,
    default: process.env.DEFAULT_MODEL || 'openai'
  });
});

// Chat with AI endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message, model = process.env.DEFAULT_MODEL || 'openai' } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const chatModel = ChatModel.createAPI(model as ModelType);
    if (!chatModel) {
      return res.status(400).json({ error: `Model ${model} not available` });
    }

    const response = await chatModel.send(message);
    
    res.json({
      model,
      message,
      response,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Telegram message endpoint (mock for local testing)
app.post('/api/telegram/send', (req, res) => {
  const { chatId, message } = req.body;
  
  if (!chatId || !message) {
    return res.status(400).json({ error: 'ChatId and message are required' });
  }

  // Mock Telegram message sending
  console.log(`[TELEGRAM MOCK] To: ${chatId}, Message: ${message}`);
  
  res.json({
    success: true,
    chatId,
    message,
    timestamp: new Date().toISOString(),
    messageId: `mock_${Date.now()}`
  });
});

// Group chat whitelist endpoint
app.get('/api/whitelist', (req, res) => {
  const whitelist = process.env.WHITELIST_PHONE_NUMBERS?.split(',') || [];
  res.json({ whitelist });
});

app.post('/api/whitelist', (req, res) => {
  const { phoneNumber } = req.body;
  
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  // Mock whitelist management
  console.log(`[WHITELIST] Adding: ${phoneNumber}`);
  
  res.json({
    success: true,
    phoneNumber,
    action: 'added',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 REST Server running on port ${PORT}`);
  console.log(`📱 Telegram mock endpoint: http://localhost:${PORT}/api/telegram/send`);
  console.log(`🤖 AI chat endpoint: http://localhost:${PORT}/api/chat`);
  console.log(`❤️ Health check: http://localhost:${PORT}/health`);
});