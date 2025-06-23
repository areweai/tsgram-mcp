#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';

class HermesDeployer {
  constructor() {
    this.colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m'
    };
  }

  log(message, color = 'reset') {
    console.log(`${this.colors[color]}${message}${this.colors.reset}`);
  }

  error(message) {
    this.log(`❌ ${message}`, 'red');
  }

  success(message) {
    this.log(`✅ ${message}`, 'green');
  }

  info(message) {
    this.log(`ℹ️  ${message}`, 'blue');
  }

  warning(message) {
    this.log(`⚠️  ${message}`, 'yellow');
  }

  step(message) {
    this.log(`\n🚀 ${message}`, 'cyan');
  }

  execCommand(command, description) {
    try {
      this.info(`Executing: ${command}`);
      const output = execSync(command, { 
        encoding: 'utf8', 
        stdio: ['inherit', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      if (output.trim()) {
        console.log(output);
      }
      return { success: true, output };
    } catch (error) {
      this.error(`Failed: ${description}`);
      console.error(error.stdout?.toString() || '');
      console.error(error.stderr?.toString() || '');
      return { success: false, error };
    }
  }

  async execCommandAsync(command, description) {
    return new Promise((resolve) => {
      this.info(`Executing: ${command}`);
      
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, { stdio: 'inherit' });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          this.error(`Failed: ${description} (exit code: ${code})`);
          resolve({ success: false, code });
        }
      });

      child.on('error', (error) => {
        this.error(`Failed: ${description} - ${error.message}`);
        resolve({ success: false, error });
      });
    });
  }

  async waitForHealthCheck(url, maxAttempts = 30, interval = 2000) {
    this.info(`Waiting for health check at ${url}...`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = this.execCommand(`curl -f ${url}`, 'health check');
        if (result.success) {
          this.success(`Health check passed on attempt ${attempt}`);
          return true;
        }
      } catch (error) {
        // Ignore curl errors, we're polling
      }
      
      if (attempt < maxAttempts) {
        this.info(`Attempt ${attempt}/${maxAttempts} failed, retrying in ${interval/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
    
    this.error(`Health check failed after ${maxAttempts} attempts`);
    return false;
  }

  checkPrerequisites() {
    this.step('Checking prerequisites...');
    
    // Check if Docker is running
    const dockerCheck = this.execCommand('docker ps', 'Docker availability check');
    if (!dockerCheck.success) {
      this.error('Docker is not running. Please start Docker Desktop.');
      return false;
    }
    this.success('Docker is running');

    // Check if docker-compose file exists
    if (!existsSync('docker-compose.hermes.yml')) {
      this.error('docker-compose.hermes.yml not found');
      return false;
    }
    this.success('Docker compose file found');

    // Check if .env file exists
    if (!existsSync('.env')) {
      this.warning('.env file not found - will use defaults');
    } else {
      this.success('.env file found');
    }

    return true;
  }

  async deployContainers() {
    this.step('Deploying Docker containers...');

    // Stop existing containers
    this.info('Stopping existing containers...');
    const stopResult = this.execCommand(
      'docker-compose -f docker-compose.hermes.yml down',
      'Stop existing containers'
    );
    
    if (stopResult.success) {
      this.success('Existing containers stopped');
    }

    // Build containers
    this.info('Building containers...');
    const buildResult = await this.execCommandAsync(
      'docker-compose -f docker-compose.hermes.yml build',
      'Build containers'
    );
    
    if (!buildResult.success) {
      this.error('Container build failed');
      return false;
    }
    this.success('Containers built successfully');

    // Start containers
    this.info('Starting containers...');
    const startResult = await this.execCommandAsync(
      'docker-compose -f docker-compose.hermes.yml up -d',
      'Start containers'
    );
    
    if (!startResult.success) {
      this.error('Container startup failed');
      return false;
    }
    this.success('Containers started successfully');

    return true;
  }

  async testServices() {
    this.step('Testing services...');

    // Wait for Signal CLI REST API
    this.info('Testing Signal CLI REST API...');
    const signalHealthy = await this.waitForHealthCheck('http://localhost:8080/v1/health', 15);
    if (!signalHealthy) {
      this.warning('Signal CLI REST API health check failed');
    } else {
      this.success('Signal CLI REST API is healthy');
    }

    // Wait for Hermes MCP server
    this.info('Testing Hermes MCP server...');
    const hermesHealthy = await this.waitForHealthCheck('http://localhost:4040/health', 30);
    if (!hermesHealthy) {
      this.error('Hermes MCP server health check failed');
      return false;
    }
    this.success('Hermes MCP server is healthy');

    // Test MCP endpoints
    this.info('Testing MCP endpoints...');
    const toolsResult = this.execCommand(
      'curl -s http://localhost:4040/mcp/tools',
      'MCP tools endpoint'
    );
    
    if (toolsResult.success) {
      this.success('MCP tools endpoint responding');
    } else {
      this.warning('MCP tools endpoint not responding');
    }

    // Test models endpoint  
    const modelsResult = this.execCommand(
      'curl -s http://localhost:4040/api/models',
      'Models endpoint'
    );
    
    if (modelsResult.success) {
      this.success('Models endpoint responding');
    } else {
      this.warning('Models endpoint not responding');
    }

    return true;
  }

  showStatus() {
    this.step('Current status...');

    // Show running containers
    this.info('Running containers:');
    this.execCommand('docker ps --filter name=hermes --filter name=signal-cli', 'Container status');

    // Show service URLs
    this.step('Service URLs:');
    this.log('🌐 Hermes MCP Server: http://localhost:4040', 'green');
    this.log('  • Health: http://localhost:4040/health', 'blue');
    this.log('  • Models: http://localhost:4040/api/models', 'blue');
    this.log('  • Chat: http://localhost:4040/api/chat', 'blue');
    this.log('  • MCP Tools: http://localhost:4040/mcp/tools', 'blue');
    
    this.log('📱 Signal CLI REST API: http://localhost:8080', 'green');
    this.log('  • Health: http://localhost:8080/v1/health', 'blue');

    this.step('Next steps:');
    this.log('1. Test AI chat: curl -X POST http://localhost:4040/api/chat -H "Content-Type: application/json" -d \'{"model": "openrouter", "message": "Hello!"}\'', 'yellow');
    this.log('2. Register with Claude: claude mcp add hermes-remote http://localhost:4040', 'yellow');
    this.log('3. View logs: docker logs hermes-mcp-server', 'yellow');
  }

  async run() {
    this.log('\n🎯 Hermes MCP Docker Deployment', 'magenta');
    this.log('=====================================', 'magenta');

    const startTime = Date.now();

    try {
      // Check prerequisites
      if (!this.checkPrerequisites()) {
        process.exit(1);
      }

      // Deploy containers
      if (!await this.deployContainers()) {
        process.exit(1);
      }

      // Test services
      if (!await this.testServices()) {
        this.warning('Some service tests failed, but deployment may still be functional');
      }

      // Show status
      this.showStatus();

      const duration = Math.round((Date.now() - startTime) / 1000);
      this.step(`Deployment completed successfully in ${duration}s! 🎉`);

    } catch (error) {
      this.error(`Deployment failed: ${error.message}`);
      console.error(error);
      process.exit(1);
    }
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const deployer = new HermesDeployer();
  deployer.run();
}

export { HermesDeployer };