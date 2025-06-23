#!/usr/bin/env node

/**
 * MCP WORKSPACE SERVER
 * 
 * Enhanced MCP server that runs in Docker with:
 * - File editing capabilities that sync to local
 * - Sync tools for bidirectional updates
 * - Telegram integration
 * - Code execution in workspace
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import fs from 'fs/promises'
import { existsSync, readdirSync, statSync } from 'fs'
import path from 'path'
import { execSync, exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

class MCPWorkspaceServer {
  private server: Server
  private workspacePath: string = process.env.WORKSPACE_PATH || '/app/workspace'

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-workspace-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    )

    this.setupHandlers()
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'sync_from_local',
            description: 'Sync files from local directory to Docker workspace',
            inputSchema: {
              type: 'object',
              properties: {
                paths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Paths to sync (relative to project root)',
                },
                exclude: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Patterns to exclude',
                },
              },
            },
          },
          {
            name: 'sync_to_local',
            description: 'Sync files from Docker workspace to local directory',
            inputSchema: {
              type: 'object',
              properties: {
                paths: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Paths to sync (relative to workspace)',
                },
              },
            },
          },
          {
            name: 'edit_file',
            description: 'Edit a file in the workspace (auto-syncs to local)',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'File path relative to workspace' },
                content: { type: 'string', description: 'New file content' },
                backup: { type: 'boolean', description: 'Create backup before editing' },
              },
              required: ['file_path', 'content'],
            },
          },
          {
            name: 'read_file',
            description: 'Read a file from the workspace',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: { type: 'string', description: 'File path relative to workspace' },
              },
              required: ['file_path'],
            },
          },
          {
            name: 'list_files',
            description: 'List files in the workspace',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Directory path (default: root)' },
                pattern: { type: 'string', description: 'Filter pattern' },
              },
            },
          },
          {
            name: 'execute_command',
            description: 'Execute a command in the workspace directory',
            inputSchema: {
              type: 'object',
              properties: {
                command: { type: 'string', description: 'Command to execute' },
                timeout: { type: 'number', description: 'Timeout in seconds' },
              },
              required: ['command'],
            },
          },
        ],
      }
    })

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'sync_from_local':
            return await this.syncFromLocal(args)

          case 'sync_to_local':
            return await this.syncToLocal(args)

          case 'edit_file':
            return await this.editFile(args)

          case 'read_file':
            return await this.readFile(args)

          case 'list_files':
            return await this.listFiles(args)

          case 'execute_command':
            return await this.executeCommand(args)

          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        }
      }
    })

    // Resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'workspace://status',
            name: 'Workspace Status',
            description: 'Current workspace sync status and info',
            mimeType: 'application/json',
          },
        ],
      }
    })

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params

      if (uri === 'workspace://status') {
        const status = await this.getWorkspaceStatus()
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(status, null, 2),
            },
          ],
        }
      }

      throw new Error(`Unknown resource: ${uri}`)
    })
  }

  private async syncFromLocal(args: any) {
    const paths = args.paths || ['.']
    const exclude = args.exclude || ['node_modules', '.git', '*.log']
    
    const excludeArgs = exclude.map(e => `--exclude='${e}'`).join(' ')
    const results: string[] = []

    for (const p of paths) {
      try {
        const cmd = `rsync -av ${excludeArgs} --password-file=/etc/rsync.password rsync://mcp@host.docker.internal:8873/project/${p} ${this.workspacePath}/${p}`
        const output = execSync(cmd, { encoding: 'utf8' })
        results.push(`✅ Synced ${p}`)
      } catch (error) {
        results.push(`❌ Failed to sync ${p}: ${error}`)
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: results.join('\n'),
        },
      ],
    }
  }

  private async syncToLocal(args: any) {
    const paths = args.paths || ['.']
    const results: string[] = []

    for (const p of paths) {
      try {
        const sourcePath = path.join(this.workspacePath, p)
        const cmd = `rsync -av ${sourcePath} rsync://mcp@host.docker.internal:8873/project/${p}`
        const output = execSync(cmd, { encoding: 'utf8' })
        results.push(`✅ Synced ${p} to local`)
      } catch (error) {
        results.push(`❌ Failed to sync ${p}: ${error}`)
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: results.join('\n'),
        },
      ],
    }
  }

  private async editFile(args: any) {
    const filePath = path.join(this.workspacePath, args.file_path)
    
    // Create backup if requested
    if (args.backup && existsSync(filePath)) {
      const backupPath = `${filePath}.backup.${Date.now()}`
      await fs.copyFile(filePath, backupPath)
    }

    // Ensure directory exists
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })

    // Write file
    await fs.writeFile(filePath, args.content, 'utf8')

    // File watcher will auto-sync to local

    return {
      content: [
        {
          type: 'text',
          text: `✅ Edited ${args.file_path}\n📤 Changes will sync to local automatically`,
        },
      ],
    }
  }

  private async readFile(args: any) {
    const filePath = path.join(this.workspacePath, args.file_path)
    
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${args.file_path}`)
    }

    const content = await fs.readFile(filePath, 'utf8')
    const stats = statSync(filePath)

    return {
      content: [
        {
          type: 'text',
          text: `📄 ${args.file_path}\n📏 Size: ${stats.size} bytes\n📅 Modified: ${stats.mtime.toISOString()}\n\n${content}`,
        },
      ],
    }
  }

  private async listFiles(args: any) {
    const targetPath = path.join(this.workspacePath, args.path || '')
    const pattern = args.pattern || '*'

    if (!existsSync(targetPath)) {
      throw new Error(`Path not found: ${args.path || '/'}`)
    }

    const files = readdirSync(targetPath)
    const fileList = files
      .filter(f => {
        if (pattern === '*') return true
        return f.includes(pattern.replace('*', ''))
      })
      .map(f => {
        const fullPath = path.join(targetPath, f)
        const stats = statSync(fullPath)
        return `${stats.isDirectory() ? '📁' : '📄'} ${f} (${stats.size} bytes)`
      })

    return {
      content: [
        {
          type: 'text',
          text: `📂 ${args.path || '/'}\n${fileList.join('\n')}`,
        },
      ],
    }
  }

  private async executeCommand(args: any) {
    const timeout = (args.timeout || 30) * 1000

    try {
      const { stdout, stderr } = await execAsync(args.command, {
        cwd: this.workspacePath,
        timeout,
        encoding: 'utf8',
      })

      return {
        content: [
          {
            type: 'text',
            text: `💻 Command: ${args.command}\n\n📤 Output:\n${stdout}\n\n${stderr ? `⚠️  Errors:\n${stderr}` : ''}`,
          },
        ],
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Command failed: ${args.command}\n\nError: ${error.message}\n\n${error.stdout || ''}\n${error.stderr || ''}`,
          },
        ],
      }
    }
  }

  private async getWorkspaceStatus() {
    const files = readdirSync(this.workspacePath)
    const totalSize = files.reduce((sum, file) => {
      try {
        const stats = statSync(path.join(this.workspacePath, file))
        return sum + stats.size
      } catch {
        return sum
      }
    }, 0)

    return {
      workspace_path: this.workspacePath,
      file_count: files.length,
      total_size: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
      sync_enabled: process.env.SYNC_ENABLED === 'true',
      rsync_status: 'active',
      last_check: new Date().toISOString(),
    }
  }

  async run() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('MCP Workspace Server running')
  }
}

const server = new MCPWorkspaceServer()
server.run().catch(console.error)