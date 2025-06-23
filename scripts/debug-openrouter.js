#!/usr/bin/env node

// Debug OpenRouter API Key
import fs from 'fs';
import https from 'https';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const API_KEY = process.env.OPENROUTER_API_KEY;

console.log('🔍 Debugging OpenRouter API Key');
console.log('=================================');
console.log('API Key length:', API_KEY ? API_KEY.length : 'Not found');
console.log('API Key prefix:', API_KEY ? API_KEY.substring(0, 15) + '...' : 'Not found');
console.log('API Key format check:', API_KEY && API_KEY.startsWith('sk-or-v1-') ? '✅ Correct format' : '❌ Wrong format');
console.log('');

if (!API_KEY) {
  console.error('❌ OPENROUTER_API_KEY not found in environment');
  process.exit(1);
}

// Test with a simple HTTP request
const data = JSON.stringify({
  model: 'anthropic/claude-sonnet-4',
  messages: [{ role: 'user', content: 'Hello! Just respond with "working"' }],
  max_tokens: 10
});

const options = {
  hostname: 'openrouter.ai',
  port: 443,
  path: '/api/v1/chat/completions',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'HTTP-Referer': 'https://signal-aichat.com',
    'X-Title': 'Signal AI Chat Debug'
  }
};

console.log('🚀 Testing API call...');
console.log('Headers:');
console.log('  Authorization: Bearer ' + API_KEY.substring(0, 15) + '...');
console.log('  Content-Type: application/json');
console.log('  HTTP-Referer: https://signal-aichat.com');
console.log('  X-Title: Signal AI Chat Debug');
console.log('');

const req = https.request(options, (res) => {
  console.log(`📈 Status Code: ${res.statusCode}`);
  console.log('📋 Response Headers:', res.headers);
  console.log('');
  
  let responseData = '';
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    console.log('📤 Response Body:');
    try {
      const parsed = JSON.parse(responseData);
      console.log(JSON.stringify(parsed, null, 2));
      
      if (parsed.error) {
        console.log('');
        console.log('❌ API Error Details:');
        console.log('  Message:', parsed.error.message);
        console.log('  Code:', parsed.error.code);
        
        if (parsed.error.code === 401) {
          console.log('');
          console.log('🔧 Troubleshooting 401 Error:');
          console.log('1. Check if API key is valid at https://openrouter.ai/keys');
          console.log('2. Ensure you have credits/billing set up');
          console.log('3. Verify the API key hasn\'t expired');
          console.log('4. Try regenerating the API key');
        }
      } else {
        console.log('✅ API call successful!');
      }
    } catch (e) {
      console.log('Raw response:', responseData);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request Error:', e.message);
});

req.write(data);
req.end();