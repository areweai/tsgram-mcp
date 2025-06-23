#!/bin/bash

# Enhanced file watcher with safety checks
# Monitors changes and syncs to local directory ONLY when safe

WORKSPACE_PATH="${WORKSPACE_PATH:-/app/workspace}"
RSYNC_HOST="${RSYNC_HOST:-host.docker.internal}"
RSYNC_PORT="${RSYNC_PORT:-8873}"
SYNC_DELAY="${SYNC_DELAY:-1}"
LOG_FILE="/var/log/rsync/sync-watcher.log"

# Critical files that must exist
CRITICAL_FILES=(
    "package.json"
    "README.md"
    "tsconfig.json"
)

# Minimum file count for healthy workspace
MIN_FILE_COUNT=5

echo "🔍 Starting SAFE workspace file watcher..." | tee -a "$LOG_FILE"
echo "📁 Workspace: $WORKSPACE_PATH" | tee -a "$LOG_FILE"
echo "🔗 Syncing to: $RSYNC_HOST:$RSYNC_PORT" | tee -a "$LOG_FILE"
echo "🛡️ Safety checks enabled" | tee -a "$LOG_FILE"

# Function to check workspace health
check_workspace_health() {
    local healthy=true
    local reasons=()
    
    # Check critical files
    for file in "${CRITICAL_FILES[@]}"; do
        if [[ ! -f "$WORKSPACE_PATH/$file" ]]; then
            healthy=false
            reasons+=("Missing critical file: $file")
        fi
    done
    
    # Check file count
    local file_count=$(find "$WORKSPACE_PATH" -type f -not -path "*/.git/*" -not -path "*/node_modules/*" | wc -l)
    if [[ $file_count -lt $MIN_FILE_COUNT ]]; then
        healthy=false
        reasons+=("Too few files: $file_count < $MIN_FILE_COUNT")
    fi
    
    if [[ "$healthy" == "false" ]]; then
        echo "❌ WORKSPACE UNHEALTHY - Refusing to sync" | tee -a "$LOG_FILE"
        for reason in "${reasons[@]}"; do
            echo "  - $reason" | tee -a "$LOG_FILE"
        done
        return 1
    else
        echo "✅ Workspace healthy (${file_count} files)" >> "$LOG_FILE"
        return 0
    fi
}

# Function to sync a file to local
sync_file() {
    local file_path="$1"
    local relative_path="${file_path#$WORKSPACE_PATH/}"
    
    # First check workspace health
    if ! check_workspace_health; then
        echo "🛑 Sync blocked due to unhealthy workspace" | tee -a "$LOG_FILE"
        return 1
    fi
    
    if [[ -f "$file_path" ]]; then
        echo "📤 Syncing: $relative_path" >> "$LOG_FILE"
        rsync -av --password-file=/etc/rsync.password \
            "$file_path" \
            "rsync://mcp@$RSYNC_HOST:$RSYNC_PORT/local-workspace/$relative_path" \
            2>> "$LOG_FILE" || echo "⚠️  Sync failed for $relative_path" | tee -a "$LOG_FILE"
    elif [[ ! -e "$file_path" ]]; then
        # File was deleted
        echo "🗑️ Deleting: $relative_path" >> "$LOG_FILE"
        # Only delete if workspace is healthy
        if check_workspace_health; then
            rsync -av --delete --password-file=/etc/rsync.password \
                --include="$relative_path" \
                --exclude="*" \
                "$WORKSPACE_PATH/" \
                "rsync://mcp@$RSYNC_HOST:$RSYNC_PORT/local-workspace/" \
                2>> "$LOG_FILE" || echo "⚠️  Delete sync failed for $relative_path" | tee -a "$LOG_FILE"
        fi
    fi
}

# Function to sync entire workspace (with safety)
sync_workspace() {
    echo "🔄 Full workspace sync requested" | tee -a "$LOG_FILE"
    
    if ! check_workspace_health; then
        echo "❌ Refusing full sync - workspace unhealthy" | tee -a "$LOG_FILE"
        return 1
    fi
    
    echo "📦 Syncing entire workspace..." | tee -a "$LOG_FILE"
    rsync -av --delete --password-file=/etc/rsync.password \
        --exclude=".git/" \
        --exclude="node_modules/" \
        --exclude="*.swp" \
        --exclude="*.tmp" \
        "$WORKSPACE_PATH/" \
        "rsync://mcp@$RSYNC_HOST:$RSYNC_PORT/local-workspace/" \
        2>> "$LOG_FILE" || echo "⚠️  Full sync failed" | tee -a "$LOG_FILE"
}

# Initial health check
echo "🏥 Initial workspace health check..." | tee -a "$LOG_FILE"
if check_workspace_health; then
    echo "✅ Initial sync..." | tee -a "$LOG_FILE"
    sync_workspace
else
    echo "⚠️ Skipping initial sync due to unhealthy workspace" | tee -a "$LOG_FILE"
fi

# Monitor workspace for changes
inotifywait -mr --format '%w%f %e' \
    -e modify \
    -e create \
    -e delete \
    -e moved_to \
    "$WORKSPACE_PATH" |
while read file_path events; do
    # Skip certain files/directories
    if [[ "$file_path" =~ \.(git|swp|tmp)$ ]] || \
       [[ "$file_path" =~ node_modules/ ]] || \
       [[ "$file_path" =~ \.sync-test$ ]]; then
        continue
    fi
    
    # Log the event
    echo "[$(date)] Event: $events on $file_path" >> "$LOG_FILE"
    
    # Debounce by collecting changes
    sleep "$SYNC_DELAY"
    
    # Sync the changed file (with safety checks)
    sync_file "$file_path"
done