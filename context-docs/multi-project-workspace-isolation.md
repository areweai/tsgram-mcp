# Multi-Project Workspace Isolation Plan

## Problem Statement

Currently, the workspace mounts directly to `/app/workspace`, which means:
- Multiple projects would overwrite each other
- No isolation between different codebases
- Risk of cross-project contamination
- Node.js projects sync unnecessary node_modules folders

## Solution Architecture

### 1. Project-Based Directory Structure

```
/app/workspaces/
├── signal-aichat/           # This project
│   ├── src/
│   ├── package.json
│   └── README.md
├── my-app/                  # Another project
│   ├── src/
│   └── package.json
└── web-client/              # Third project
    ├── src/
    └── package.json
```

### 2. Dynamic Project Detection

The bot will detect the project name from:
1. Parent directory name (preferred)
2. package.json "name" field
3. User-specified project name

### 3. Implementation Plan

#### Phase 1: Update Docker Compose

```yaml
services:
  hermes-mcp-workspace:
    environment:
      - PROJECT_NAME=${PROJECT_NAME:-signal-aichat}
      - WORKSPACE_ROOT=/app/workspaces
      - WORKSPACE_PATH=/app/workspaces/${PROJECT_NAME}
    volumes:
      # Mount current directory to project-specific path
      - .:/app/workspaces/${PROJECT_NAME}
      # Shared data directory for all projects
      - hermes-data:/app/data
```

#### Phase 2: Update Sync Configuration

```typescript
// Enhanced SyncSafetyManager with project isolation
export class ProjectAwareSyncManager extends SyncSafetyManager {
  private projectName: string
  private workspaceRoot: string = '/app/workspaces'
  
  constructor(projectName: string) {
    super(`${this.workspaceRoot}/${projectName}`)
    this.projectName = projectName
  }
  
  async switchProject(newProject: string): Promise<boolean> {
    const projectPath = path.join(this.workspaceRoot, newProject)
    if (await fs.access(projectPath).catch(() => false)) {
      this.projectName = newProject
      this.workspacePath = projectPath
      return true
    }
    return false
  }
  
  async listProjects(): Promise<string[]> {
    const entries = await fs.readdir(this.workspaceRoot)
    const projects = []
    for (const entry of entries) {
      const stat = await fs.stat(path.join(this.workspaceRoot, entry))
      if (stat.isDirectory()) {
        projects.push(entry)
      }
    }
    return projects
  }
}
```

#### Phase 3: Rsync Exclusions for Node.js Projects

```bash
# Updated sync-watcher-safe.sh
RSYNC_EXCLUDES=(
    "--exclude=node_modules/"
    "--exclude=.git/"
    "--exclude=dist/"
    "--exclude=build/"
    "--exclude=coverage/"
    "--exclude=*.log"
    "--exclude=.DS_Store"
    "--exclude=.env.local"
    "--exclude=.env.*.local"
    "--exclude=npm-debug.log*"
    "--exclude=yarn-debug.log*"
    "--exclude=yarn-error.log*"
    "--exclude=.idea/"
    "--exclude=.vscode/"
    "--exclude=*.swp"
    "--exclude=*.swo"
    "--exclude=*~"
    "--exclude=.cache/"
    "--exclude=.parcel-cache/"
    "--exclude=.next/"
    "--exclude=.nuxt/"
    "--exclude=.vuepress/dist/"
    "--exclude=.serverless/"
    "--exclude=.fusebox/"
    "--exclude=.dynamodb/"
    "--exclude=.tern-port"
    "--exclude=.vscode-test/"
    "--exclude=*.tsbuildinfo"
)

sync_file() {
    local file_path="$1"
    local relative_path="${file_path#$WORKSPACE_PATH/}"
    
    # Skip if file is in excluded directory
    for pattern in "${RSYNC_EXCLUDES[@]}"; do
        if [[ "$relative_path" =~ ${pattern#--exclude=} ]]; then
            echo "⏭️ Skipping excluded: $relative_path" >> "$LOG_FILE"
            return
        fi
    done
    
    if [[ -f "$file_path" ]]; then
        echo "📤 Syncing: $relative_path" >> "$LOG_FILE"
        rsync -av "${RSYNC_EXCLUDES[@]}" \
            --password-file=/etc/rsync.password \
            "$file_path" \
            "rsync://mcp@$RSYNC_HOST:$RSYNC_PORT/${PROJECT_NAME}/$relative_path" \
            2>> "$LOG_FILE" || echo "⚠️  Sync failed for $relative_path" | tee -a "$LOG_FILE"
    fi
}
```

#### Phase 4: Bot Commands for Project Management

```typescript
// New commands in telegram bot
case 'project':
  if (args[0] === 'list') {
    const projects = await this.syncSafety.listProjects()
    return `📁 **Available Projects:**\n\n${projects.map(p => `• ${p}`).join('\n')}`
  }
  
  if (args[0] === 'switch' && args[1]) {
    const success = await this.syncSafety.switchProject(args[1])
    if (success) {
      await this.configManager.setCurrentProject(args[1])
      return `✅ Switched to project: ${args[1]}`
    } else {
      return `❌ Project not found: ${args[1]}`
    }
  }
  
  if (args[0] === 'current') {
    const current = await this.configManager.getCurrentProject()
    return `📍 Current project: ${current}`
  }
  
  if (args[0] === 'create' && args[1]) {
    const projectPath = path.join('/app/workspaces', args[1])
    await fs.mkdir(projectPath, { recursive: true })
    await fs.writeFile(path.join(projectPath, 'README.md'), `# ${args[1]}\n\nProject created via Telegram bot.`)
    return `✅ Created new project: ${args[1]}`
  }
  
  return `Usage:\n:h project list\n:h project current\n:h project switch <name>\n:h project create <name>`
```

### 4. Migration Strategy

#### For Existing Deployment:
1. Stop current container
2. Update docker-compose.yml with PROJECT_NAME
3. Rebuild container with new paths
4. Bot automatically creates project directory

#### For New Projects:
1. Set PROJECT_NAME environment variable
2. Deploy container
3. Project directory created automatically

### 5. Security & Isolation Benefits

1. **Project Isolation**: Each project has its own directory
2. **No Cross-Contamination**: Projects can't overwrite each other
3. **Clean Syncing**: Node_modules and build artifacts excluded
4. **Easy Switching**: Change projects without redeploying
5. **Multi-User Ready**: Different users can work on different projects

### 6. Environment Variables

```bash
# .env file
PROJECT_NAME=signal-aichat
WORKSPACE_ROOT=/app/workspaces
RSYNC_EXCLUDE_NODE_MODULES=true
RSYNC_EXCLUDE_BUILD_ARTIFACTS=true
```

### 7. Backwards Compatibility

The system will check for:
1. New structure (`/app/workspaces/PROJECT_NAME`)
2. Old structure (`/app/workspace`)
3. Migrate automatically if needed

## Implementation Checklist

- [ ] Update SyncSafetyManager for project awareness
- [ ] Modify sync-watcher-safe.sh with exclusions
- [ ] Update docker-compose.yml with PROJECT_NAME
- [ ] Add project management commands to bot
- [ ] Update HermesConfigManager for project tracking
- [ ] Test with multiple projects
- [ ] Document migration process
- [ ] Add project-specific rsync modules

## Benefits Summary

1. **Clean Separation**: Each project isolated in its own directory
2. **Efficient Syncing**: Node_modules and artifacts excluded
3. **Easy Management**: Switch projects via bot commands
4. **Scalable**: Add new projects without configuration changes
5. **Safe**: No risk of cross-project file overwrites