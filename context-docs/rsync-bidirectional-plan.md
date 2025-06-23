# Rsync Bidirectional Sync Plan & Test Strategy

## Current State Analysis

### What We Have
1. Container has rsync daemon running on port 873
2. Volume mount: `.:/app/workspace` (should provide direct access)
3. Rsync is configured to sync FROM container TO host
4. No clear `/sync` command implementation
5. Risk of overwriting host files with empty container files

### What We Need
1. **Safety checks** before any sync operations
2. **Bidirectional sync** capability
3. **`:h sync` command** to pull host changes into container
4. **File existence validation** to prevent data loss
5. **Sync status monitoring**

## Implementation Plan

### Phase 1: Add Safety Checks

Create a sync safety system that:
- Checks if workspace has files before syncing
- Validates critical files exist (package.json, README.md)
- Prevents empty file overwrites
- Reports sync status

### Phase 2: Implement :h sync Command

Add new command to telegram bot:
```
:h sync           # Pull changes from host to container
:h sync status    # Check sync health
:h sync test      # Run sync diagnostics
```

### Phase 3: Bidirectional Sync Architecture

```
Host Directory <---> Docker Volume Mount <---> Container Workspace
     |                                              |
     |<------------ rsync (port 873) ------------->|
     |                                              |
     |------------ :h sync (pull mode) ----------->|
```

## Test Cases

### Test 1: Initial Sync Validation
```bash
# 1. Create test file on host
echo "test content" > test-sync.txt

# 2. Run :h sync command
:h sync

# 3. Verify file appears in container
:h cat test-sync.txt

# Expected: File content matches
```

### Test 2: Safety Check - Empty Directory
```bash
# 1. Clear container workspace (simulate issue)
docker exec hermes-mcp-workspace rm -rf /app/workspace/*

# 2. Run :h ls
:h ls

# Expected: Bot detects empty workspace and refuses to sync OUT
# Expected: Bot suggests running :h sync to restore files
```

### Test 3: Bidirectional Changes
```bash
# 1. Create file on host
echo "host file" > host-created.txt

# 2. Create file in container via bot
:h write container-created.txt "container file"

# 3. Run sync
:h sync

# 4. Verify both files exist in both places
ls -la host-created.txt container-created.txt
:h ls

# Expected: Both files present in both locations
```

### Test 4: Conflict Resolution
```bash
# 1. Create same file with different content
echo "host version" > conflict.txt
:h write conflict.txt "container version"

# 2. Run sync
:h sync

# Expected: Bot warns about conflict
# Expected: Offers options (keep host/container/backup)
```

### Test 5: Critical File Protection
```bash
# 1. Delete package.json in container
docker exec hermes-mcp-workspace rm /app/workspace/package.json

# 2. Try to run commands
:h ls

# Expected: Bot detects missing critical file
# Expected: Refuses outbound sync
# Expected: Suggests :h sync to restore
```

## Implementation Code

### 1. Sync Safety Manager
```typescript
class SyncSafetyManager {
  private criticalFiles = ['package.json', 'README.md', 'tsconfig.json']
  
  async checkWorkspaceHealth(): Promise<{
    healthy: boolean
    missing: string[]
    fileCount: number
  }> {
    const files = await fs.readdir(WORKSPACE_PATH)
    const missing = []
    
    for (const critical of this.criticalFiles) {
      if (!files.includes(critical)) {
        missing.push(critical)
      }
    }
    
    return {
      healthy: missing.length === 0 && files.length > 0,
      missing,
      fileCount: files.length
    }
  }
  
  async canSyncOut(): Promise<boolean> {
    const health = await this.checkWorkspaceHealth()
    return health.healthy
  }
}
```

### 2. Sync Command Implementation
```typescript
case 'sync':
  if (args[0] === 'status') {
    const health = await this.syncSafety.checkWorkspaceHealth()
    return `📊 **Sync Status:**\n\n` +
           `Workspace files: ${health.fileCount}\n` +
           `Health: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}\n` +
           `${health.missing.length > 0 ? `Missing critical files: ${health.missing.join(', ')}` : ''}`
  }
  
  if (args[0] === 'test') {
    return await this.runSyncDiagnostics()
  }
  
  // Default: sync from host to container
  return await this.syncFromHost()
```

### 3. Host-to-Container Sync
```typescript
private async syncFromHost(): Promise<string> {
  try {
    // Check if host directory is accessible
    const hostPath = '/app/workspace'
    const mountTest = await fs.access(hostPath)
    
    // If volume mount works, files should already be synced
    const files = await fs.readdir(hostPath)
    
    if (files.length === 0) {
      return '❌ Host directory appears empty. Check volume mount.'
    }
    
    // For explicit rsync pull (if volume mount fails)
    const result = await exec(`rsync -av --delete \
      rsync://host.docker.internal:8873/workspace/ \
      /app/workspace/`)
    
    return '✅ Synced from host successfully'
  } catch (error) {
    return `❌ Sync failed: ${error.message}`
  }
}
```

### 4. Sync Watcher Enhancement
```bash
#!/bin/bash
# Enhanced sync-watcher.sh

WORKSPACE="/app/workspace"
LAST_SYNC_TIME=0

check_workspace_health() {
  if [ ! -f "$WORKSPACE/package.json" ]; then
    echo "❌ CRITICAL: package.json missing - refusing outbound sync"
    return 1
  fi
  
  FILE_COUNT=$(find "$WORKSPACE" -type f | wc -l)
  if [ "$FILE_COUNT" -lt 3 ]; then
    echo "⚠️ WARNING: Only $FILE_COUNT files in workspace"
    return 1
  fi
  
  return 0
}

sync_to_host() {
  if check_workspace_health; then
    rsync -av --delete "$WORKSPACE/" rsync://host:873/workspace/
    echo "✅ Synced to host at $(date)"
  else
    echo "🛑 Sync blocked due to workspace issues"
  fi
}
```

## Monitoring Commands

### Real-time Sync Status
```bash
# Watch sync logs
docker exec hermes-mcp-workspace tail -f /var/log/rsync/sync.log

# Check rsync daemon
docker exec hermes-mcp-workspace ps aux | grep rsync

# Test rsync connectivity
rsync rsync://localhost:873/
```

### Debug Commands
```bash
# Check volume mount
docker exec hermes-mcp-workspace ls -la /app/workspace

# Compare files
diff -r . <(docker exec hermes-mcp-workspace ls -la /app/workspace)

# Force sync test
docker exec hermes-mcp-workspace rsync -av --dry-run /app/workspace/ rsync://host.docker.internal:873/workspace/
```

## Success Criteria

1. **No Data Loss**: Empty directories never overwrite populated ones
2. **Bidirectional Sync**: Changes flow both ways on demand
3. **User Control**: Explicit :h sync command for host→container
4. **Automatic Safety**: Container→host only when healthy
5. **Clear Feedback**: Users know sync status and issues

## Rollback Plan

If sync causes issues:
1. Disable sync-watcher.sh
2. Rely on volume mount only
3. Remove rsync daemon
4. Use manual file operations

This plan ensures safe, bidirectional syncing with multiple safety checks to prevent data loss.