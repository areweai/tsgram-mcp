/**
 * API Client for TSGram Dashboard
 * 
 * Connects to the actual TSGram backend services to provide
 * real data for the web dashboard interface.
 */

export interface BotInfo {
  id: string
  name: string
  username: string
  token: string
  status: 'active' | 'inactive' | 'error'
  created_at: string
  last_used: string
  message_count?: number
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'down'
  timestamp: string
  mcp_server: 'running' | 'stopped' | 'error'
  ai_model: string
  has_api_key: boolean
  bots?: number
  uptime?: number
}

export interface DashboardStats {
  totalBots: number
  activeBots: number
  totalChannels: number
  messagesLast24h: number
  systemHealth: SystemHealth
}

export interface ActivityEvent {
  id: string
  type: 'bot_created' | 'message_sent' | 'channel_updated' | 'error'
  description: string
  timestamp: string
  bot_id?: string
}

export interface CreateBotRequest {
  name: string
  token: string
  webhook_url?: string
}

export interface SendMessageRequest {
  chat_id: string | number
  text: string
  use_ai?: boolean
}

export class TSGramAPIClient {
  private baseUrl: string
  private mcpUrl: string
  private webhookUrl: string

  constructor() {
    // Default to localhost - adjust if needed
    this.baseUrl = 'http://localhost:4040'
    this.mcpUrl = 'http://localhost:4040' 
    this.webhookUrl = 'http://localhost:4041'
  }

  async healthCheck(): Promise<SystemHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/health`)
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Health check failed:', error)
      throw new Error(`Failed to connect to MCP server at ${this.baseUrl}`)
    }
  }

  async webhookHealthCheck(): Promise<SystemHealth> {
    try {
      const response = await fetch(`${this.webhookUrl}/health`)
      if (!response.ok) {
        throw new Error(`Webhook health check failed: ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('Webhook health check failed:', error)
      throw new Error(`Failed to connect to webhook server at ${this.webhookUrl}`)
    }
  }

  async getMCPStatus(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/mcp/status`)
      if (!response.ok) {
        throw new Error(`MCP status failed: ${response.statusText}`)
      }
      return await response.json()
    } catch (error) {
      console.error('MCP status failed:', error)
      throw new Error(`Failed to get MCP status from ${this.baseUrl}`)
    }
  }

  async listBots(): Promise<BotInfo[]> {
    try {
      // Try webhook server first (has bot management)
      const response = await fetch(`${this.webhookUrl}/api/bots`)
      if (response.ok) {
        const data = await response.json()
        return data.bots || []
      }

      // Fallback to direct data file
      const mcpResponse = await fetch(`${this.baseUrl}/data/bots.json`)
      if (mcpResponse.ok) {
        const bots = await mcpResponse.json()
        return Array.isArray(bots) ? bots : []
      }

      return []
    } catch (error) {
      console.error('Failed to list bots:', error)
      return []
    }
  }

  async createBot(request: CreateBotRequest): Promise<{ success: boolean; bot?: BotInfo; error?: string }> {
    try {
      const response = await fetch(`${this.webhookUrl}/api/bots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      const data = await response.json()
      
      if (response.ok) {
        return { success: true, bot: data.bot }
      } else {
        return { success: false, error: data.error || 'Failed to create bot' }
      }
    } catch (error) {
      console.error('Failed to create bot:', error)
      return { success: false, error: 'Network error' }
    }
  }

  async sendMessage(request: SendMessageRequest): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.webhookUrl}/api/send-message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })

      const data = await response.json()
      
      if (response.ok) {
        return { success: true }
      } else {
        return { success: false, error: data.error || 'Failed to send message' }
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      return { success: false, error: 'Network error' }
    }
  }

  async getDashboardStats(): Promise<DashboardStats> {
    try {
      const [health, webhookHealth, mcpStatus, bots] = await Promise.all([
        this.healthCheck().catch(() => ({
          status: 'down' as const,
          timestamp: new Date().toISOString(),
          mcp_server: 'error' as const,
          ai_model: 'unknown',
          has_api_key: false
        })),
        this.webhookHealthCheck().catch(() => ({
          status: 'down' as const,
          timestamp: new Date().toISOString(),
          mcp_server: 'error' as const,
          ai_model: 'unknown',
          has_api_key: false
        })),
        this.getMCPStatus().catch(() => ({ mcp_server: 'error' })),
        this.listBots().catch(() => [])
      ])

      const activeBots = bots.filter(bot => bot.status === 'active').length
      
      // Calculate messages from bot activity
      const messagesLast24h = bots.reduce((total, bot) => {
        return total + (bot.message_count || 0)
      }, 0)

      // Use webhook health if main health fails
      const systemHealth = health.status !== 'down' ? health : webhookHealth

      return {
        totalBots: bots.length,
        activeBots: activeBots,
        totalChannels: Math.floor(bots.length * 1.5), // Estimate
        messagesLast24h: messagesLast24h,
        systemHealth: systemHealth
      }
    } catch (error) {
      console.error('Failed to get dashboard stats:', error)
      throw new Error('Unable to connect to any TSGram services')
    }
  }

  async getRecentActivity(): Promise<ActivityEvent[]> {
    try {
      const response = await fetch(`${this.webhookUrl}/api/activity`)
      if (!response.ok) {
        throw new Error(`Activity fetch failed: ${response.statusText}`)
      }
      const data = await response.json()
      return data.activities || []
    } catch (error) {
      console.error('Failed to get recent activity:', error)
      throw new Error(`Failed to fetch activity from ${this.webhookUrl}`)
    }
  }

  async testBotToken(token: string): Promise<{ valid: boolean; username?: string; error?: string }> {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`)
      const data = await response.json()
      
      if (data.ok) {
        return {
          valid: true,
          username: data.result.username
        }
      } else {
        return {
          valid: false,
          error: data.description || 'Invalid token'
        }
      }
    } catch (error) {
      return {
        valid: false,
        error: 'Network error'
      }
    }
  }
}

export const apiClient = new TSGramAPIClient()
export default apiClient