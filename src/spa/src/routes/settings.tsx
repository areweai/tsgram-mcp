import { createFileRoute } from '@tanstack/react-router'

function SettingsPage() {
  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      <div>
        <h1 className="text-3xl font-bold text-gradient">Settings</h1>
        <p className="text-telegram-text-secondary mt-2">
          Configure your Telegram MCP server settings
        </p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">MCP Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="form-label">Server Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="telegram-mcp-server"
                defaultValue="telegram-mcp-server"
              />
            </div>
            <div>
              <label className="form-label">Server Port</label>
              <input
                type="number"
                className="form-input"
                placeholder="3000"
                defaultValue="3000"
              />
            </div>
            <button className="btn btn-primary w-full">
              Save MCP Settings
            </button>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">API Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="form-label">Telegram Bot API Base URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://api.telegram.org"
                defaultValue="https://api.telegram.org"
              />
            </div>
            <div>
              <label className="form-label">Request Timeout (ms)</label>
              <input
                type="number"
                className="form-input"
                placeholder="30000"
                defaultValue="30000"
              />
            </div>
            <button className="btn btn-primary w-full">
              Save API Settings
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">System Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-telegram-bg-light/5 p-4 rounded-lg">
            <p className="text-sm text-telegram-text-secondary">Version</p>
            <p className="font-medium">1.0.0</p>
          </div>
          <div className="bg-telegram-bg-light/5 p-4 rounded-lg">
            <p className="text-sm text-telegram-text-secondary">Node.js</p>
            <p className="font-medium">v18.17.0</p>
          </div>
          <div className="bg-telegram-bg-light/5 p-4 rounded-lg">
            <p className="text-sm text-telegram-text-secondary">Uptime</p>
            <p className="font-medium">2h 34m</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})