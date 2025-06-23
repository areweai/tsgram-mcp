#!/usr/bin/env node

/**
 * LOCAL RSYNC SERVER
 * 
 * Runs an rsync daemon on the local machine to enable
 * bidirectional sync with Docker containers.
 */

import { spawn, execSync } from 'child_process'
import fs from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'
import os from 'os'

class LocalRsyncServer {
  private rsyncProcess: any
  private configPath: string
  private secretsPath: string
  private pidPath: string
  private port: number = 8873
  private projectPath: string

  constructor() {
    this.projectPath = process.cwd()
    const tmpDir = path.join(os.tmpdir(), 'mcp-rsync')
    
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true })
    }

    this.configPath = path.join(tmpDir, 'rsyncd.conf')
    this.secretsPath = path.join(tmpDir, 'rsyncd.secrets')
    this.pidPath = path.join(tmpDir, 'rsyncd.pid')
  }

  async start() {
    console.log('🚀 Starting Local Rsync Server...')
    console.log(`📁 Project path: ${this.projectPath}`)
    console.log(`🔌 Port: ${this.port}`)

    // Create rsync configuration
    await this.createConfig()
    await this.createSecrets()

    // Check if rsync is installed
    try {
      execSync('rsync --version', { stdio: 'ignore' })
    } catch (error) {
      console.error('❌ rsync is not installed. Please install it first:')
      console.error('   macOS: brew install rsync')
      console.error('   Ubuntu: sudo apt-get install rsync')
      process.exit(1)
    }

    // Kill any existing rsync daemon
    await this.killExisting()

    // Start rsync daemon
    this.rsyncProcess = spawn('rsync', [
      '--daemon',
      '--no-detach',
      `--config=${this.configPath}`,
      `--port=${this.port}`,
      '-v'
    ])

    this.rsyncProcess.stdout.on('data', (data: Buffer) => {
      console.log(`📡 ${data.toString().trim()}`)
    })

    this.rsyncProcess.stderr.on('data', (data: Buffer) => {
      console.error(`❌ ${data.toString().trim()}`)
    })

    this.rsyncProcess.on('exit', (code: number) => {
      console.log(`⏹️  Rsync daemon exited with code ${code}`)
    })

    console.log('✅ Local rsync server started')
    console.log('\n📋 Docker containers can now sync with:')
    console.log(`   rsync://mcp@host.docker.internal:${this.port}/project/`)
    console.log(`   rsync://mcp@host.docker.internal:${this.port}/local-workspace/`)
    console.log('\n🔐 Auth: username=mcp, password=workspace123')
  }

  private async createConfig() {
    const config = `# Local rsync daemon configuration
uid = ${process.getuid()}
gid = ${process.getgid()}
use chroot = no
max connections = 10
pid file = ${this.pidPath}
log file = ${path.join(os.tmpdir(), 'mcp-rsync', 'rsyncd.log')}
transfer logging = yes

# Project directory (for Docker to pull from)
[project]
    path = ${this.projectPath}
    comment = Local project directory
    read only = yes
    list = yes
    auth users = mcp
    secrets file = ${this.secretsPath}
    exclude = .git/ node_modules/ *.log .DS_Store .env

# Local workspace (for Docker to push to)
[local-workspace]
    path = ${this.projectPath}
    comment = Local workspace for Docker edits
    read only = no
    list = yes
    auth users = mcp
    secrets file = ${this.secretsPath}
    incoming chmod = Du=rwx,Dg=rx,Do=rx,Fu=rw,Fg=r,Fo=r
`
    await fs.writeFile(this.configPath, config)
    console.log(`✅ Created rsync config at ${this.configPath}`)
  }

  private async createSecrets() {
    const secrets = 'mcp:workspace123\n'
    await fs.writeFile(this.secretsPath, secrets, { mode: 0o600 })
    console.log(`✅ Created rsync secrets at ${this.secretsPath}`)
  }

  private async killExisting() {
    if (existsSync(this.pidPath)) {
      try {
        const pid = await fs.readFile(this.pidPath, 'utf8')
        process.kill(parseInt(pid.trim()))
        console.log('✅ Killed existing rsync daemon')
      } catch (error) {
        // Process might not exist
      }
    }

    // Also try to kill by port
    try {
      execSync(`lsof -ti:${this.port} | xargs kill -9`, { stdio: 'ignore' })
    } catch (error) {
      // No process on port
    }
  }

  async stop() {
    if (this.rsyncProcess) {
      this.rsyncProcess.kill('SIGTERM')
      console.log('✅ Stopped rsync daemon')
    }

    // Clean up files
    try {
      await fs.unlink(this.configPath)
      await fs.unlink(this.secretsPath)
      await fs.unlink(this.pidPath)
    } catch (error) {
      // Files might not exist
    }
  }
}

// CLI
async function main() {
  const server = new LocalRsyncServer()
  
  process.on('SIGINT', async () => {
    console.log('\n⏹️  Shutting down...')
    await server.stop()
    process.exit(0)
  })

  process.on('SIGTERM', async () => {
    await server.stop()
    process.exit(0)
  })

  await server.start()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}