#!/usr/bin/env node

/**
 * Health Check Script for Docker Containers
 * 
 * This script performs comprehensive health checks for TSGram services
 * running inside Docker containers. It checks:
 * - HTTP endpoint availability
 * - MCP server functionality  
 * - File system access
 * - Environment variables
 * - Service dependencies
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration from environment
const CONFIG = {
  MCP_PORT: process.env.MCP_SERVER_PORT || '4040',
  WEBHOOK_PORT: process.env.MCP_WEBHOOK_PORT || '4041',
  HOST: process.env.MCP_SERVER_HOST || 'localhost',
  TIMEOUT: 5000, // 5 second timeout
  REQUIRED_ENV_VARS: [
    'NODE_ENV',
    'MCP_SERVER_PORT'
  ],
  OPTIONAL_ENV_VARS: [
    'TELEGRAM_BOT_TOKEN',
    'OPENROUTER_API_KEY',
    'OPENAI_API_KEY'
  ]
};

// Exit codes
const EXIT_CODES = {
  SUCCESS: 0,
  ENV_ERROR: 1,
  HTTP_ERROR: 2,
  MCP_ERROR: 3,
  FILESYSTEM_ERROR: 4,
  DEPENDENCY_ERROR: 5
};

// Logging utility
const log = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${new Date().toISOString()} ${msg}`)
};

/**
 * Check if required environment variables are set
 */
function checkEnvironment() {
  log.info('Checking environment variables...');
  
  const missing = [];
  
  for (const envVar of CONFIG.REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }
  
  if (missing.length > 0) {
    log.error(`Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }
  
  log.info(`Environment check passed. NODE_ENV=${process.env.NODE_ENV}`);
  return true;
}

/**
 * Check HTTP endpoint availability
 */
function checkHTTPEndpoint(port, path = '/health') {
  return new Promise((resolve) => {
    const options = {
      hostname: CONFIG.HOST,
      port: port,
      path: path,
      method: 'GET',
      timeout: CONFIG.TIMEOUT
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const response = JSON.parse(data);
            resolve({ success: true, data: response });
          } catch (e) {
            resolve({ success: true, data: { status: 'ok', raw: data } });
          }
        } else {
          resolve({ 
            success: false, 
            error: `HTTP ${res.statusCode}: ${data}` 
          });
        }
      });
    });
    
    req.on('error', (error) => {
      resolve({ 
        success: false, 
        error: `Connection failed: ${error.message}` 
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ 
        success: false, 
        error: `Timeout after ${CONFIG.TIMEOUT}ms` 
      });
    });
    
    req.end();
  });
}

/**
 * Check file system access
 */
function checkFileSystem() {
  log.info('Checking file system access...');
  
  try {
    // Check if we can read the current directory
    const files = fs.readdirSync('.');
    
    // Check if we can write a test file
    const testFile = path.join('.', '.health-check-test');
    fs.writeFileSync(testFile, 'health check test');
    fs.unlinkSync(testFile);
    
    log.info(`File system check passed. Found ${files.length} files in current directory`);
    return true;
  } catch (error) {
    log.error(`File system check failed: ${error.message}`);
    return false;
  }
}

/**
 * Check MCP server specific functionality
 */
async function checkMCPServer() {
  log.info('Checking MCP server...');
  
  const result = await checkHTTPEndpoint(CONFIG.MCP_PORT, '/health');
  
  if (!result.success) {
    log.error(`MCP server health check failed: ${result.error}`);
    return false;
  }
  
  log.success(`MCP server healthy on port ${CONFIG.MCP_PORT}`);
  return true;
}

/**
 * Check webhook server (if configured)
 */
async function checkWebhookServer() {
  log.info('Checking webhook server...');
  
  const result = await checkHTTPEndpoint(CONFIG.WEBHOOK_PORT, '/health');
  
  if (!result.success) {
    log.info(`Webhook server not available on port ${CONFIG.WEBHOOK_PORT} (this may be normal)`);
    return true; // Webhook server is optional
  }
  
  log.success(`Webhook server healthy on port ${CONFIG.WEBHOOK_PORT}`);
  return true;
}

/**
 * Check service dependencies
 */
function checkDependencies() {
  log.info('Checking service dependencies...');
  
  // Check if required modules are available
  const requiredModules = [
    '@modelcontextprotocol/sdk',
    'express',
    'dotenv'
  ];
  
  for (const module of requiredModules) {
    try {
      require(module);
    } catch (error) {
      log.error(`Required module not available: ${module}`);
      return false;
    }
  }
  
  log.success('All required dependencies available');
  return true;
}

/**
 * Main health check function
 */
async function performHealthCheck() {
  log.info('Starting comprehensive health check...');
  
  // Environment check
  if (!checkEnvironment()) {
    process.exit(EXIT_CODES.ENV_ERROR);
  }
  
  // File system check
  if (!checkFileSystem()) {
    process.exit(EXIT_CODES.FILESYSTEM_ERROR);
  }
  
  // Dependencies check
  if (!checkDependencies()) {
    process.exit(EXIT_CODES.DEPENDENCY_ERROR);
  }
  
  // MCP server check
  if (!await checkMCPServer()) {
    process.exit(EXIT_CODES.MCP_ERROR);
  }
  
  // Webhook server check (optional)
  if (!await checkWebhookServer()) {
    process.exit(EXIT_CODES.HTTP_ERROR);
  }
  
  log.success('All health checks passed! Service is healthy.');
  process.exit(EXIT_CODES.SUCCESS);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  log.error(`Uncaught exception during health check: ${error.message}`);
  process.exit(EXIT_CODES.DEPENDENCY_ERROR);
});

process.on('unhandledRejection', (reason) => {
  log.error(`Unhandled rejection during health check: ${reason}`);
  process.exit(EXIT_CODES.DEPENDENCY_ERROR);
});

// Run health check
if (require.main === module) {
  performHealthCheck().catch((error) => {
    log.error(`Health check failed: ${error.message}`);
    process.exit(EXIT_CODES.DEPENDENCY_ERROR);
  });
}

module.exports = {
  performHealthCheck,
  checkEnvironment,
  checkHTTPEndpoint,
  checkFileSystem,
  checkMCPServer,
  checkWebhookServer,
  EXIT_CODES
};