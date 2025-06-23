import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export interface SyncHealth {
  healthy: boolean
  fileCount: number
  missingCritical: string[]
  warnings: string[]
  volumeMountWorking: boolean
}

export class SyncSafetyManager {
  private workspacePath: string
  private criticalFiles = ['package.json', 'README.md', 'tsconfig.json', '.env']
  private minFileCount = 5 // Minimum files to consider workspace healthy

  constructor(workspacePath: string = '/app/workspace') {
    this.workspacePath = workspacePath
  }

  async checkWorkspaceHealth(): Promise<SyncHealth> {
    const warnings: string[] = []
    const missingCritical: string[] = []
    
    try {
      // Check if workspace exists and is accessible
      await fs.access(this.workspacePath)
      
      // Get all files
      const entries = await fs.readdir(this.workspacePath)
      const files = []
      
      for (const entry of entries) {
        const stat = await fs.stat(path.join(this.workspacePath, entry))
        if (stat.isFile()) {
          files.push(entry)
        }
      }
      
      // Check critical files
      for (const critical of this.criticalFiles) {
        if (!files.includes(critical)) {
          missingCritical.push(critical)
        }
      }
      
      // Check file count
      if (files.length < this.minFileCount) {
        warnings.push(`Only ${files.length} files found (minimum ${this.minFileCount} expected)`)
      }
      
      // Test volume mount
      const volumeMountWorking = await this.testVolumeMount()
      
      if (!volumeMountWorking) {
        warnings.push('Volume mount may not be working properly')
      }
      
      return {
        healthy: missingCritical.length === 0 && files.length >= this.minFileCount,
        fileCount: files.length,
        missingCritical,
        warnings,
        volumeMountWorking
      }
      
    } catch (error: any) {
      return {
        healthy: false,
        fileCount: 0,
        missingCritical: this.criticalFiles,
        warnings: [`Workspace access error: ${error.message}`],
        volumeMountWorking: false
      }
    }
  }

  async testVolumeMount(): Promise<boolean> {
    try {
      // Create a test file with timestamp
      const testFile = path.join(this.workspacePath, '.sync-test')
      const testContent = `sync-test-${Date.now()}`
      
      await fs.writeFile(testFile, testContent)
      const readContent = await fs.readFile(testFile, 'utf-8')
      await fs.unlink(testFile)
      
      return readContent === testContent
    } catch {
      return false
    }
  }

  async canSyncOut(): Promise<{ allowed: boolean; reason?: string }> {
    const health = await this.checkWorkspaceHealth()
    
    if (!health.healthy) {
      const reasons = []
      if (health.missingCritical.length > 0) {
        reasons.push(`Missing critical files: ${health.missingCritical.join(', ')}`)
      }
      if (health.fileCount < this.minFileCount) {
        reasons.push(`Too few files (${health.fileCount} < ${this.minFileCount})`)
      }
      return { allowed: false, reason: reasons.join('; ') }
    }
    
    return { allowed: true }
  }

  async syncFromHost(): Promise<{ success: boolean; message: string }> {
    try {
      // First check if volume mount is working
      const health = await this.checkWorkspaceHealth()
      
      if (health.volumeMountWorking) {
        // Volume mount is working, no need for rsync
        return {
          success: true,
          message: '✅ Volume mount is working - files are automatically synced'
        }
      }
      
      // If volume mount isn't working, try rsync
      // This assumes host is running rsync daemon on port 8873
      const { stdout, stderr } = await execAsync(
        `rsync -av --delete rsync://host.docker.internal:8873/workspace/ ${this.workspacePath}/`
      )
      
      if (stderr && !stderr.includes('vanished')) {
        throw new Error(stderr)
      }
      
      // Verify sync worked
      const postHealth = await this.checkWorkspaceHealth()
      if (!postHealth.healthy) {
        throw new Error('Sync completed but workspace still unhealthy')
      }
      
      return {
        success: true,
        message: '✅ Successfully synced from host via rsync'
      }
      
    } catch (error: any) {
      return {
        success: false,
        message: `❌ Sync failed: ${error.message}`
      }
    }
  }

  async runDiagnostics(): Promise<string> {
    const lines: string[] = ['🔍 **Sync Diagnostics:**\n']
    
    // Check workspace health
    const health = await this.checkWorkspaceHealth()
    lines.push(`📁 Workspace: ${this.workspacePath}`)
    lines.push(`📊 Files: ${health.fileCount}`)
    lines.push(`❤️ Health: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`)
    
    if (health.missingCritical.length > 0) {
      lines.push(`⚠️ Missing: ${health.missingCritical.join(', ')}`)
    }
    
    // Check volume mount
    lines.push(`\n🔗 Volume Mount: ${health.volumeMountWorking ? '✅ Working' : '❌ Not Working'}`)
    
    // Check rsync daemon
    try {
      const { stdout } = await execAsync('ps aux | grep rsync | grep -v grep')
      lines.push(`📡 Rsync Daemon: ✅ Running`)
      lines.push(`\`\`\`\n${stdout.trim()}\n\`\`\``)
    } catch {
      lines.push(`📡 Rsync Daemon: ❌ Not Running`)
    }
    
    // Check host connectivity
    try {
      await execAsync('ping -c 1 host.docker.internal')
      lines.push(`🌐 Host Connection: ✅ Reachable`)
    } catch {
      lines.push(`🌐 Host Connection: ❌ Unreachable`)
    }
    
    // List workspace files
    try {
      const files = await fs.readdir(this.workspacePath)
      lines.push(`\n📂 Workspace Files (${files.length} total):`)
      lines.push(`\`\`\``)
      lines.push(files.slice(0, 10).join('\n'))
      if (files.length > 10) {
        lines.push(`... and ${files.length - 10} more`)
      }
      lines.push(`\`\`\``)
    } catch (error: any) {
      lines.push(`\n❌ Could not list files: ${error.message}`)
    }
    
    return lines.join('\n')
  }
}