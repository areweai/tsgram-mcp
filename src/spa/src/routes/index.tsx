import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { apiClient, DashboardStats, ActivityEvent, SystemHealth } from '../api/client'

function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalBots: 0,
    activeBots: 0,
    totalChannels: 0,
    messagesLast24h: 0,
    systemHealth: {
      status: 'down',
      timestamp: new Date().toISOString(),
      mcp_server: 'error',
      ai_model: 'unknown',
      has_api_key: false
    }
  })
  const [activity, setActivity] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

  const loadDashboardData = async () => {
    try {
      setError(null)
      const [dashboardStats, recentActivity] = await Promise.all([
        apiClient.getDashboardStats(),
        apiClient.getRecentActivity()
      ])
      
      setStats(dashboardStats)
      setActivity(recentActivity)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Failed to load dashboard data:', err)
      setError('Failed to connect to TSGram services. Make sure the servers are running.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadDashboardData, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = () => {
    setLoading(true)
    loadDashboardData()
  }

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-400'
      case 'degraded': return 'text-yellow-400'
      case 'down': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const getHealthStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy': return 'status-badge status-online'
      case 'degraded': return 'status-badge status-warning'
      case 'down': return 'status-badge status-offline'
      default: return 'status-badge status-offline'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="loading-spinner mb-4"></div>
          <p className="text-telegram-text-secondary">Loading TSGram dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* Header with real status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gradient">TSGram Dashboard</h1>
          <div className="flex items-center mt-2 space-x-4">
            <p className="text-telegram-text-secondary">
              Real-time monitoring of your Telegram AI assistant
            </p>
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${stats.systemHealth.status === 'healthy' ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span className={`text-xs ${getHealthStatusColor(stats.systemHealth.status)}`}>
                {stats.systemHealth.status === 'healthy' ? 'All Systems Operational' : 'Service Issues Detected'}
              </span>
            </div>
          </div>
          <p className="text-xs text-telegram-text-secondary mt-1">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex flex-wrap gap-2">
          <button 
            onClick={() => window.open('/bots', '_self')}
            className="btn btn-primary btn-sm"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Bot
          </button>
          <button 
            onClick={handleRefresh}
            disabled={loading}
            className="btn btn-secondary btn-sm"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="text-red-400 font-medium">Connection Error</h4>
              <p className="text-red-300 text-sm mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card">
          <div className="flex items-center">
            <div className="p-3 bg-telegram-blue/20 rounded-lg mr-4">
              <svg className="w-6 h-6 text-telegram-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-telegram-text-secondary">Total Bots</p>
              <p className="text-2xl font-bold text-telegram-text">{stats.totalBots}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-3 bg-green-500/20 rounded-lg mr-4">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-telegram-text-secondary">Active Bots</p>
              <p className="text-2xl font-bold text-telegram-text">{stats.activeBots}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-3 bg-purple-500/20 rounded-lg mr-4">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 3v10a2 2 0 002 2h6a2 2 0 002-2V7M7 7h10l-1-3H8L7 7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-telegram-text-secondary">Channels</p>
              <p className="text-2xl font-bold text-telegram-text">{stats.totalChannels}</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-3 bg-yellow-500/20 rounded-lg mr-4">
              <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-telegram-text-secondary">Messages 24h</p>
              <p className="text-2xl font-bold text-telegram-text">{stats.messagesLast24h}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Empty State - No Bots Configured */}
      {stats.totalBots === 0 && (
        <div className="card">
          <div className="flex items-center justify-center p-12 text-center">
            <div>
              <div className="w-16 h-16 mx-auto mb-4 bg-telegram-blue/10 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-telegram-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">No Bots Configured</h3>
              <p className="text-telegram-text-secondary mb-4 max-w-md">
                Get started by creating your first Telegram bot. Click the "New Bot" button above to begin.
              </p>
              <button 
                onClick={() => window.open('/bots', '_self')}
                className="btn btn-primary"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Your First Bot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-telegram-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Recent Activity
          </h3>
          <div className="space-y-3">
            {activity.length === 0 ? (
              <div className="flex items-center justify-center p-8 text-center">
                <div>
                  <div className="w-12 h-12 mx-auto mb-3 bg-telegram-bg-light/10 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-telegram-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-telegram-text-secondary">No recent activity</p>
                  <p className="text-xs text-telegram-text-secondary mt-1">Activity will appear here as your bots send messages</p>
                </div>
              </div>
            ) : (
              activity.slice(0, 5).map((event) => {
                const getActivityColor = (type: string) => {
                  switch (type) {
                    case 'message_sent': return 'bg-green-400'
                    case 'bot_created': return 'bg-blue-400'
                    case 'ai_response': return 'bg-purple-400'
                    case 'webhook_received': return 'bg-yellow-400'
                    case 'error': return 'bg-red-400'
                    default: return 'bg-gray-400'
                  }
                }

                const timeAgo = (timestamp: string) => {
                  const now = new Date()
                  const time = new Date(timestamp)
                  const diffMs = now.getTime() - time.getTime()
                  const diffMins = Math.floor(diffMs / 60000)
                  const diffHours = Math.floor(diffMs / 3600000)
                  const diffDays = Math.floor(diffMs / 86400000)

                  if (diffMins < 1) return 'Just now'
                  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
                  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
                  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
                }

                return (
                  <div key={event.id} className="flex items-center p-3 bg-telegram-bg-light/5 rounded-lg">
                    <div className={`w-2 h-2 ${getActivityColor(event.type)} rounded-full mr-3`}></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{event.description}</p>
                      <p className="text-xs text-telegram-text-secondary">{timeAgo(event.timestamp)}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2 text-telegram-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Quick Actions
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button className="flex items-center p-3 bg-telegram-bg-light/5 hover:bg-telegram-bg-light/10 rounded-lg transition-colors">
              <svg className="w-5 h-5 mr-3 text-telegram-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="text-sm font-medium">Create Bot</span>
            </button>
            <button className="flex items-center p-3 bg-telegram-bg-light/5 hover:bg-telegram-bg-light/10 rounded-lg transition-colors">
              <svg className="w-5 h-5 mr-3 text-telegram-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 3v10a2 2 0 002 2h6a2 2 0 002-2V7M7 7h10l-1-3H8L7 7z" />
              </svg>
              <span className="text-sm font-medium">New Channel</span>
            </button>
            <button className="flex items-center p-3 bg-telegram-bg-light/5 hover:bg-telegram-bg-light/10 rounded-lg transition-colors">
              <svg className="w-5 h-5 mr-3 text-telegram-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-sm font-medium">Send Message</span>
            </button>
            <button className="flex items-center p-3 bg-telegram-bg-light/5 hover:bg-telegram-bg-light/10 rounded-lg transition-colors">
              <svg className="w-5 h-5 mr-3 text-telegram-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">Test Bot</span>
            </button>
          </div>
        </div>
      </div>

      {/* Real-time System Status */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <svg className="w-5 h-5 mr-2 text-telegram-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          System Status
          <span className="ml-2 text-xs text-telegram-text-secondary">
            ({stats.systemHealth.timestamp ? new Date(stats.systemHealth.timestamp).toLocaleTimeString() : 'Unknown'})
          </span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center justify-between p-3 bg-telegram-bg-light/5 rounded-lg">
            <span className="text-sm font-medium">MCP Server</span>
            <span className={getHealthStatusBadge(stats.systemHealth.mcp_server === 'running' ? 'healthy' : 'down')}>
              {stats.systemHealth.mcp_server === 'running' ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-telegram-bg-light/5 rounded-lg">
            <span className="text-sm font-medium">AI Model</span>
            <span className={getHealthStatusBadge(stats.systemHealth.has_api_key ? 'healthy' : 'down')}>
              {stats.systemHealth.has_api_key ? 'Connected' : 'No API Key'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-telegram-bg-light/5 rounded-lg">
            <span className="text-sm font-medium">Telegram API</span>
            <span className={getHealthStatusBadge(stats.totalBots > 0 ? 'healthy' : 'down')}>
              {stats.totalBots > 0 ? 'Connected' : 'No Bots'}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-telegram-bg-light/5 rounded-lg">
            <div>
              <span className="text-sm font-medium">Overall</span>
              <p className="text-xs text-telegram-text-secondary">
                {stats.systemHealth.ai_model || 'Unknown Model'}
              </p>
            </div>
            <span className={getHealthStatusBadge(stats.systemHealth.status)}>
              {stats.systemHealth.status === 'healthy' ? 'Healthy' : 
               stats.systemHealth.status === 'degraded' ? 'Degraded' : 'Down'}
            </span>
          </div>
        </div>
      </div>

      {/* Technical Details */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Technical Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="font-medium text-telegram-text">Service Endpoints</h4>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-telegram-text-secondary">MCP Server:</span>
                <span className="font-mono">localhost:4040</span>
              </div>
              <div className="flex justify-between">
                <span className="text-telegram-text-secondary">Webhook Server:</span>
                <span className="font-mono">localhost:4041</span>
              </div>
              <div className="flex justify-between">
                <span className="text-telegram-text-secondary">Dashboard:</span>
                <span className="font-mono">localhost:3001</span>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <h4 className="font-medium text-telegram-text">Configuration</h4>
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-telegram-text-secondary">Configured Bots:</span>
                <span>{stats.totalBots}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-telegram-text-secondary">Active Connections:</span>
                <span>{stats.activeBots}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-telegram-text-secondary">AI Model:</span>
                <span className="font-mono text-xs">{stats.systemHealth.ai_model || 'Not configured'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: Dashboard,
})