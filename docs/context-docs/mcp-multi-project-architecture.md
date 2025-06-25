# MCP Multi-Project Architecture

## Problem Statement

A single MCP server instance cannot safely handle multiple Claude Code instances working on different projects simultaneously because:
- All clients share the same workspace directory
- No session isolation between different Claude instances
- File operations from different projects overwrite each other

## Recommended Solution: Project-Aware MCP with Session Management

### Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Claude Code    │     │  Claude Code    │     │  Claude Code    │
│  (Project A)    │     │  (Project B)    │     │  (Project C)    │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │ MCP Protocol          │ MCP Protocol          │ MCP Protocol
         │ + Project ID          │ + Project ID          │ + Project ID
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │   MCP Server (3000)     │
                    │  with Session Manager   │
                    └────────────┬────────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
         ┌──────┴──────┐  ┌──────┴──────┐  ┌─────┴───────┐
         │  Workspace  │  │  Workspace  │  │  Workspace  │
         │  Project A  │  │  Project B  │  │  Project C  │
         └─────────────┘  └─────────────┘  └─────────────┘
```

### Implementation Details

#### 1. Session Management

```typescript
interface MCPSession {
  sessionId: string          // Unique per Claude Code instance
  projectName: string        // e.g., "signal-aichat"
  projectPath: string        // e.g., "/app/workspaces/signal-aichat"
  clientInfo: {
    host: string
    startTime: Date
    lastActivity: Date
  }
}

class SessionManager {
  private sessions = new Map<string, MCPSession>()
  
  // Called when Claude Code connects
  async createSession(metadata: any): Promise<string> {
    // Extract project info from:
    // 1. MCP initialization parameters
    // 2. Current working directory
    // 3. Git repository name
    const projectName = await this.detectProjectName(metadata)
    const sessionId = crypto.randomUUID()
    
    this.sessions.set(sessionId, {
      sessionId,
      projectName,
      projectPath: `/app/workspaces/${projectName}`,
      clientInfo: {
        host: metadata.host,
        startTime: new Date(),
        lastActivity: new Date()
      }
    })
    
    return sessionId
  }
}
```

#### 2. Project Detection

```typescript
async detectProjectName(metadata: any): Promise<string> {
  // Option 1: Explicit in MCP config
  if (metadata.project) return metadata.project
  
  // Option 2: From working directory
  const cwd = metadata.cwd || process.cwd()
  const projectDir = path.basename(cwd)
  
  // Option 3: From package.json
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(cwd, 'package.json')))
    if (pkg.name) return pkg.name
  } catch {}
  
  // Option 4: From git
  try {
    const gitRemote = execSync('git remote get-url origin').toString()
    const match = gitRemote.match(/\/([^\/]+)\.git/)
    if (match) return match[1]
  } catch {}
  
  return projectDir
}
```

#### 3. Scoped File Operations

```typescript
class ProjectScopedFileSystem {
  constructor(private sessionManager: SessionManager) {}
  
  async readFile(sessionId: string, filePath: string): Promise<string> {
    const session = this.sessionManager.getSession(sessionId)
    if (!session) throw new Error('Invalid session')
    
    // Ensure file access is within project bounds
    const fullPath = path.join(session.projectPath, filePath)
    if (!fullPath.startsWith(session.projectPath)) {
      throw new Error('Access denied: Path traversal attempt')
    }
    
    return fs.readFile(fullPath, 'utf-8')
  }
  
  async writeFile(sessionId: string, filePath: string, content: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionId)
    if (!session) throw new Error('Invalid session')
    
    const fullPath = path.join(session.projectPath, filePath)
    if (!fullPath.startsWith(session.projectPath)) {
      throw new Error('Access denied: Path traversal attempt')
    }
    
    await fs.writeFile(fullPath, content)
  }
}
```

#### 4. MCP Server Integration

```typescript
// In mcp-server.ts
const sessionManager = new SessionManager()
const projectFS = new ProjectScopedFileSystem(sessionManager)

const server = new MCPServer({
  onConnection: async (metadata) => {
    const sessionId = await sessionManager.createSession(metadata)
    return { sessionId }
  },
  
  tools: {
    readFile: {
      handler: async ({ sessionId, path }) => {
        return projectFS.readFile(sessionId, path)
      }
    },
    writeFile: {
      handler: async ({ sessionId, path, content }) => {
        return projectFS.writeFile(sessionId, path, content)
      }
    }
  }
})
```

### Configuration

#### Claude Code Project Configuration (.mcp.json)

```json
{
  "servers": {
    "hermes": {
      "command": "docker",
      "args": ["exec", "hermes-mcp", "node", "/app/mcp-server.js"],
      "project": "signal-aichat"  // Explicit project name
    }
  }
}
```

#### Environment Variables

```bash
# Detect project from environment
export MCP_PROJECT_NAME="signal-aichat"
export MCP_PROJECT_PATH="/Users/username/projects/signal-aichat"
```

### Benefits

1. **True Multi-Project Support**: Multiple Claude instances can work simultaneously
2. **No Overwrites**: Each session is isolated to its project directory
3. **Single MCP Instance**: No need for multiple containers/ports
4. **Security**: Path traversal protection built-in
5. **Scalable**: Can handle dozens of projects

### Migration Path

1. **Phase 1**: Add session management without breaking current setup
2. **Phase 2**: Auto-detect projects from Claude Code metadata
3. **Phase 3**: Full project isolation with UI for project switching

### Alternative: Lightweight Port Multiplexing

If the above is too complex, a simpler approach:

```bash
# mcp-launcher.sh
#!/bin/bash
PROJECT_NAME=$(basename "$PWD")
PROJECT_PORT=$((3000 + $(echo "$PROJECT_NAME" | cksum | cut -d' ' -f1) % 1000))

# Check if already running
if ! docker ps | grep -q "mcp-$PROJECT_NAME"; then
  docker run -d \
    --name "mcp-$PROJECT_NAME" \
    -p "$PROJECT_PORT:3000" \
    -v "$PWD:/app/workspace" \
    -e "PROJECT_NAME=$PROJECT_NAME" \
    hermes-mcp
fi

# Update .mcp.json with correct port
jq ".servers.hermes.port = $PROJECT_PORT" .mcp.json > .mcp.json.tmp
mv .mcp.json.tmp .mcp.json

echo "MCP server for $PROJECT_NAME running on port $PROJECT_PORT"
```

This ensures each project gets its own MCP instance on a unique port.