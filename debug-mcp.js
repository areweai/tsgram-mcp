#!/usr/bin/env node

import fs from 'fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const logFile = '/tmp/mcp-debug.log';

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}\n`;
  fs.appendFileSync(logFile, logMessage);
  console.error(logMessage.trim()); // Use stderr so it doesn't interfere with MCP protocol
}

log('Starting MCP server...');

try {
  const server = new Server({
    name: 'hermes-debug',
    version: '1.0.0',
  }, {
    capabilities: {
      tools: {},
    },
  });

  log('Server created');

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    log('ListTools request received');
    return {
      tools: [
        {
          name: 'debug_tool',
          description: 'Debug tool',
          inputSchema: {
            type: 'object',
            properties: {},
          }
        }
      ]
    };
  });

  log('Handlers set up');

  const transport = new StdioServerTransport();
  log('Transport created');

  await server.connect(transport);
  log('Server connected and ready');
  console.log('Debug MCP Server started');

} catch (error) {
  log(`Error: ${error.message}`);
  log(`Stack: ${error.stack}`);
  process.exit(1);
}