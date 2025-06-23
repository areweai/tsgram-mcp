#!/bin/bash

# File watcher for Docker workspace
# Monitors changes and syncs to local directory

WORKSPACE_PATH="${WORKSPACE_PATH:-/app/workspace}"
RSYNC_HOST="${RSYNC_HOST:-host.docker.internal}"
RSYNC_PORT="${RSYNC_PORT:-8873}"
SYNC_DELAY="${SYNC_DELAY:-1}"

echo "🔍 Starting workspace file watcher..."
echo "📁 Workspace: $WORKSPACE_PATH"
echo "🔗 Syncing to: $RSYNC_HOST:$RSYNC_PORT"

# Function to sync a file to local
sync_file() {
    local file_path="$1"
    local relative_path="${file_path#$WORKSPACE_PATH/}"
    
    if [[ -f "$file_path" ]]; then
        echo "📤 Syncing: $relative_path"
        rsync -av --password-file=/etc/rsync.password \
            "$file_path" \
            "rsync://mcp@$RSYNC_HOST:$RSYNC_PORT/local-workspace/$relative_path" \
            2>/dev/null || echo "⚠️  Sync failed for $relative_path"
    fi
}

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
       [[ "$file_path" =~ node_modules/ ]]; then
        continue
    fi
    
    # Debounce by collecting changes
    sleep "$SYNC_DELAY"
    
    # Sync the changed file
    sync_file "$file_path"
done