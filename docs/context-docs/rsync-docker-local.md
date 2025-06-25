# Rsync Docker-Local Bidirectional Sync

## Overview

This document describes the implementation of a bidirectional file synchronization system between Docker containers and local directories, inspired by Amazon's ninja-dev-sync. The system allows:

1. **Docker → Local**: Docker containers can edit files in the local directory
2. **Local → Docker**: Manual sync command updates Docker with local changes
3. **Real-time editing**: Changes appear immediately in both environments
4. **MCP Integration**: Sync operations exposed as MCP tools

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Local Directory   │◄────│   Rsync Daemon   │────▶│  Docker Container   │
│  /path/to/project   │     │   (Port 873)    │     │  /app/workspace     │
└─────────────────────┘     └──────────────────┘     └─────────────────────┘
         ▲                           ▲                           │
         │                           │                           │
         │                    ┌──────────────────┐              │
         └────────────────────│   File Watcher   │◄─────────────┘
                              │  (inotify/FSW)   │
                              └──────────────────┘
```

## Implementation Plan

### Phase 1: Basic Rsync Setup

1. **Docker Image Enhancement**
   ```dockerfile
   FROM node:20-alpine
   
   # Install rsync and inotify-tools
   RUN apk add --no-cache rsync inotify-tools openssh
   
   # Create workspace directory
   RUN mkdir -p /app/workspace
   
   # Copy rsync configuration
   COPY docker/rsyncd.conf /etc/rsyncd.conf
   ```

2. **Rsync Configuration** (`docker/rsyncd.conf`)
   ```ini
   uid = root
   gid = root
   use chroot = no
   max connections = 4
   pid file = /var/run/rsyncd.pid
   log file = /var/log/rsyncd.log
   
   [workspace]
   path = /app/workspace
   comment = Project workspace
   read only = no
   list = yes
   auth users = mcp
   secrets file = /etc/rsyncd.secrets
   ```

3. **Docker Compose Configuration**
   ```yaml
   services:
     mcp-workspace:
       build:
         context: .
         dockerfile: Dockerfile.workspace
       volumes:
         - rsync-workspace:/app/workspace
         - ./docker/rsyncd.conf:/etc/rsyncd.conf:ro
       ports:
         - "873:873"  # Rsync daemon
         - "4040:4040" # MCP server
       environment:
         - WORKSPACE_PATH=/app/workspace
         - LOCAL_SYNC_PATH=${LOCAL_SYNC_PATH:-./}
   ```

### Phase 2: File Watcher Implementation

1. **Docker-side File Watcher** (`src/docker-file-watcher.ts`)
   ```typescript
   import { watch } from 'chokidar'
   import { execSync } from 'child_process'
   
   class DockerFileWatcher {
     private watcher: any
     private syncQueue: Set<string> = new Set()
     
     async start() {
       this.watcher = watch('/app/workspace', {
         ignored: /(^|[\/\\])\../,
         persistent: true,
         ignoreInitial: true
       })
       
       this.watcher
         .on('add', path => this.queueSync(path))
         .on('change', path => this.queueSync(path))
         .on('unlink', path => this.queueDelete(path))
     }
     
     private queueSync(path: string) {
       this.syncQueue.add(path)
       this.processSyncQueue()
     }
     
     private async processSyncQueue() {
       // Debounce for 100ms
       setTimeout(() => {
         const files = Array.from(this.syncQueue)
         this.syncQueue.clear()
         
         // Sync to local
         files.forEach(file => {
           const relativePath = file.replace('/app/workspace/', '')
           execSync(`rsync -av /app/workspace/${relativePath} rsync://host.docker.internal:873/local/${relativePath}`)
         })
       }, 100)
     }
   }
   ```

2. **Local-side Rsync Server** (`src/local-rsync-server.ts`)
   ```typescript
   import { spawn } from 'child_process'
   import fs from 'fs/promises'
   
   class LocalRsyncServer {
     private rsyncProcess: any
     
     async start(projectPath: string) {
       // Create rsync config
       const config = `
   [local]
   path = ${projectPath}
   read only = no
   list = yes
   `
       await fs.writeFile('/tmp/rsyncd.conf', config)
       
       // Start rsync daemon
       this.rsyncProcess = spawn('rsync', [
         '--daemon',
         '--no-detach',
         '--config=/tmp/rsyncd.conf',
         '--port=8873'
       ])
     }
   }
   ```

### Phase 3: MCP Tool Integration

1. **Sync-from-local MCP Tool** (`src/mcp-sync-tools.ts`)
   ```typescript
   {
     name: 'sync_from_local',
     description: 'Sync local changes to Docker workspace',
     inputSchema: {
       type: 'object',
       properties: {
         paths: {
           type: 'array',
           items: { type: 'string' },
           description: 'Specific paths to sync (optional)'
         },
         exclude: {
           type: 'array',
           items: { type: 'string' },
           description: 'Patterns to exclude'
         }
       }
     },
     handler: async (args) => {
       const excludeArgs = (args.exclude || [])
         .map(p => `--exclude='${p}'`)
         .join(' ')
       
       const paths = args.paths || ['.']
       
       for (const path of paths) {
         execSync(`rsync -av ${excludeArgs} /local/${path} /app/workspace/${path}`)
       }
       
       return {
         content: [{
           type: 'text',
           text: `✅ Synced ${paths.length} path(s) from local to Docker workspace`
         }]
       }
     }
   }
   ```

2. **File Editing MCP Tools**
   ```typescript
   {
     name: 'edit_file',
     description: 'Edit a file in the workspace (syncs to local)',
     inputSchema: {
       type: 'object',
       properties: {
         file_path: { type: 'string' },
         content: { type: 'string' }
       },
       required: ['file_path', 'content']
     },
     handler: async (args) => {
       const fullPath = `/app/workspace/${args.file_path}`
       await fs.writeFile(fullPath, args.content)
       
       // File watcher will auto-sync to local
       
       return {
         content: [{
           type: 'text',
           text: `✅ Edited ${args.file_path} - changes synced to local`
         }]
       }
     }
   }
   ```

### Phase 4: Security & Performance

1. **Security Measures**
   - Use SSH tunneling for rsync when not on localhost
   - Implement file path validation to prevent directory traversal
   - Add .gitignore and sensitive file filtering
   
2. **Performance Optimizations**
   - Batch file changes with debouncing
   - Use rsync's delta transfer algorithm
   - Implement file size limits
   - Add concurrent sync limits

3. **Conflict Resolution**
   - Last-write-wins by default
   - Optional backup before sync
   - Conflict detection alerts via MCP

## Usage Examples

### Starting the System

```bash
# 1. Start local rsync server
npm run rsync:local

# 2. Start Docker with workspace
docker-compose -f docker-compose.workspace.yml up

# 3. Initial sync from local to Docker
docker exec mcp-workspace mcp sync_from_local
```

### From Telegram

```
User: /exec sync_from_local
Bot: ✅ Synced local changes to Docker workspace

User: Edit src/index.ts and add a console.log
Bot: ✅ Edited src/index.ts - changes synced to local

User: Show me the current sync status
Bot: 📊 Sync Status:
- Local → Docker: Last sync 2 min ago
- Docker → Local: Real-time (5 files synced in last hour)
- Workspace size: 45 MB
```

## Implementation Steps

1. **Create enhanced Dockerfile** with rsync and file watching tools
2. **Implement local rsync server** as a Node.js service
3. **Add file watcher** to Docker container for auto-sync
4. **Create MCP tools** for manual sync and file operations
5. **Test bidirectional sync** with various file types
6. **Add monitoring and logging** for sync operations
7. **Document security considerations** and best practices

## Advantages

- **Real-time sync**: Changes appear immediately in both environments
- **MCP integration**: Sync operations available as Claude tools
- **Efficient**: Uses rsync's delta algorithm for minimal data transfer
- **Flexible**: Can sync specific paths or entire directories
- **Secure**: Supports SSH tunneling and access controls

## Limitations

- Requires rsync daemon running on both sides
- May have slight delay for large file operations
- Symbolic links need special handling
- Binary files may need size restrictions