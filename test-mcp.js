#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('Testing MCP server...');

const mcpServer = spawn('node', ['dist/mcp-server.js'], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'pipe']
});

mcpServer.stdout.on('data', (data) => {
  console.log('MCP stdout:', data.toString());
});

mcpServer.stderr.on('data', (data) => {
  console.log('MCP stderr:', data.toString());
});

mcpServer.on('close', (code) => {
  console.log(`MCP server exited with code ${code}`);
});

// Send a test message
setTimeout(() => {
  const testMessage = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  }) + '\n';
  
  mcpServer.stdin.write(testMessage);
  
  setTimeout(() => {
    mcpServer.kill();
  }, 2000);
}, 1000);