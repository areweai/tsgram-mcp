#!/usr/bin/env node

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

class DeploymentTester {
  constructor() {
    this.colors = {
      reset: '\x1b[0m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m'
    };
    this.tests = [];
    this.passed = 0;
    this.failed = 0;
  }

  log(message, color = 'reset') {
    console.log(`${this.colors[color]}${message}${this.colors.reset}`);
  }

  async test(name, testFn) {
    process.stdout.write(`${this.colors.blue}🧪 Testing: ${name}${this.colors.reset} ... `);
    
    try {
      const result = await testFn();
      if (result) {
        console.log(`${this.colors.green}✅ PASS${this.colors.reset}`);
        this.passed++;
        return true;
      } else {
        console.log(`${this.colors.red}❌ FAIL${this.colors.reset}`);
        this.failed++;
        return false;
      }
    } catch (error) {
      console.log(`${this.colors.red}❌ ERROR: ${error.message}${this.colors.reset}`);
      this.failed++;
      return false;
    }
  }

  curl(url, options = {}) {
    try {
      const method = options.method || 'GET';
      const headers = options.headers || {};
      const data = options.data;
      
      let cmd = `curl -s -f`;
      
      if (method !== 'GET') {
        cmd += ` -X ${method}`;
      }
      
      Object.entries(headers).forEach(([key, value]) => {
        cmd += ` -H "${key}: ${value}"`;
      });
      
      if (data) {
        cmd += ` -d '${JSON.stringify(data)}'`;
      }
      
      cmd += ` "${url}"`;
      
      const output = execSync(cmd, { encoding: 'utf8', timeout: 10000 });
      return { success: true, data: output.trim() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  parseJSON(str) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }

  async runAllTests() {
    this.log('\n🚀 Hermes MCP Deployment Test Suite', 'cyan');
    this.log('==========================================', 'cyan');

    // Test 1: Docker containers are running
    await this.test('Docker containers are running', () => {
      const result = execSync('docker ps --filter name=hermes --filter name=signal-cli --format "{{.Names}}"', { encoding: 'utf8' });
      const containers = result.trim().split('\n').filter(name => name);
      return containers.includes('hermes-mcp-server') && containers.includes('signal-cli-rest-api');
    });

    // Test 2: Health endpoints
    await this.test('Hermes health endpoint responds', () => {
      const result = this.curl('http://localhost:4040/health');
      if (!result.success) return false;
      const health = this.parseJSON(result.data);
      return health && health.status === 'healthy';
    });

    await this.test('Signal CLI health endpoint responds', () => {
      const result = this.curl('http://localhost:8080/v1/health');
      return result.success;
    });

    // Test 3: MCP endpoints
    await this.test('MCP tools endpoint returns valid schema', () => {
      const result = this.curl('http://localhost:4040/mcp/tools');
      if (!result.success) return false;
      const tools = this.parseJSON(result.data);
      return tools && 
             Array.isArray(tools.tools) && 
             tools.tools.length >= 3 &&
             tools.tools.some(t => t.name === 'chat_with_ai');
    });

    await this.test('MCP resources endpoint responds', () => {
      const result = this.curl('http://localhost:4040/mcp/resources');
      if (!result.success) return false;
      const resources = this.parseJSON(result.data);
      return resources && Array.isArray(resources.resources);
    });

    // Test 4: API endpoints
    await this.test('Models API returns available models', () => {
      const result = this.curl('http://localhost:4040/api/models');
      if (!result.success) return false;
      const models = this.parseJSON(result.data);
      return models && 
             Array.isArray(models.models) && 
             models.models.some(m => m.name === 'openai') &&
             models.models.some(m => m.name === 'openrouter');
    });

    // Test 5: AI model availability
    await this.test('OpenAI model has API key configured', () => {
      const result = this.curl('http://localhost:4040/api/models');
      if (!result.success) return false;
      const models = this.parseJSON(result.data);
      const openai = models.models.find(m => m.name === 'openai');
      return openai && openai.available === true;
    });

    await this.test('OpenRouter model has API key configured', () => {
      const result = this.curl('http://localhost:4040/api/models');
      if (!result.success) return false;
      const models = this.parseJSON(result.data);
      const openrouter = models.models.find(m => m.name === 'openrouter');
      return openrouter && openrouter.available === true;
    });

    // Test 6: Chat functionality
    await this.test('OpenRouter chat API responds correctly', () => {
      const result = this.curl('http://localhost:4040/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { model: 'openrouter', message: 'Test: respond with exactly "TEST_RESPONSE"' }
      });
      if (!result.success) return false;
      const response = this.parseJSON(result.data);
      return response && 
             response.model === 'openrouter' && 
             typeof response.response === 'string' &&
             response.response.length > 0;
    });

    await this.test('OpenAI chat API responds correctly', () => {
      const result = this.curl('http://localhost:4040/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { model: 'openai', message: 'Test: respond with exactly "TEST_RESPONSE"' }
      });
      if (!result.success) return false;
      const response = this.parseJSON(result.data);
      return response && 
             response.model === 'openai' && 
             typeof response.response === 'string' &&
             response.response.length > 0;
    });

    // Test 7: Error handling
    await this.test('Invalid model returns proper error', () => {
      const result = this.curl('http://localhost:4040/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { model: 'invalid', message: 'test' }
      });
      return !result.success; // Should fail for invalid model
    });

    await this.test('Missing message returns proper error', () => {
      const result = this.curl('http://localhost:4040/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: { model: 'openrouter' }
      });
      return !result.success; // Should fail for missing message
    });

    // Test 8: Environment verification
    await this.test('Environment variables are loaded', () => {
      try {
        const envContent = readFileSync('.env', 'utf8');
        return envContent.includes('OPENAI_API_KEY') && 
               envContent.includes('OPENROUTER_API_KEY');
      } catch {
        return false;
      }
    });

    // Test 9: Container health checks
    await this.test('Hermes container passes health check', () => {
      try {
        const result = execSync('docker inspect hermes-mcp-server --format="{{.State.Health.Status}}"', { encoding: 'utf8' });
        return result.trim() === 'healthy';
      } catch {
        return false;
      }
    });

    await this.test('Signal CLI container passes health check', () => {
      try {
        const result = execSync('docker inspect signal-cli-rest-api --format="{{.State.Health.Status}}"', { encoding: 'utf8' });
        return result.trim() === 'healthy';
      } catch {
        return false;
      }
    });

    // Test 10: Performance test
    await this.test('API responds within reasonable time', async () => {
      const startTime = Date.now();
      const result = this.curl('http://localhost:4040/health');
      const duration = Date.now() - startTime;
      return result.success && duration < 1000; // Less than 1 second
    });

    // Results
    this.showResults();
  }

  showResults() {
    const total = this.passed + this.failed;
    const passRate = Math.round((this.passed / total) * 100);
    
    this.log('\n📊 Test Results:', 'cyan');
    this.log('=================', 'cyan');
    this.log(`Total Tests: ${total}`, 'blue');
    this.log(`✅ Passed: ${this.passed}`, 'green');
    this.log(`❌ Failed: ${this.failed}`, this.failed > 0 ? 'red' : 'green');
    this.log(`📈 Pass Rate: ${passRate}%`, passRate >= 90 ? 'green' : (passRate >= 70 ? 'yellow' : 'red'));

    if (this.failed === 0) {
      this.log('\n🎉 All tests passed! Deployment is fully functional.', 'green');
      this.log('\n🔗 Ready for:', 'cyan');
      this.log('• Claude Desktop integration via Settings → Integrations', 'blue');
      this.log('• Claude Code MCP registration: claude mcp add hermes-remote http://localhost:4040', 'blue');
      this.log('• Production deployment to cloud infrastructure', 'blue');
    } else {
      this.log('\n⚠️  Some tests failed. Please check the issues above.', 'yellow');
    }

    process.exit(this.failed > 0 ? 1 : 0);
  }
}

// Run tests
const tester = new DeploymentTester();
tester.runAllTests();