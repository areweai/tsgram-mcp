/**
 * Test fixtures for dashboard components
 * This data was extracted from the fallback/dummy data in the API client
 */

import { SystemHealth, DashboardStats, ActivityEvent, BotInfo } from '../../api/client'

export const mockSystemHealth: SystemHealth = {
  status: 'healthy',
  timestamp: '2025-06-24T22:00:00.000Z',
  mcp_server: 'running',
  ai_model: 'anthropic/claude-3.5-sonnet',
  has_api_key: true,
  bots: 3,
  uptime: 86400
}

export const mockSystemHealthDown: SystemHealth = {
  status: 'down',
  timestamp: '2025-06-24T22:00:00.000Z',
  mcp_server: 'error',
  ai_model: 'unknown',
  has_api_key: false
}

export const mockBots: BotInfo[] = [
  {
    id: 'bot_test_1',
    name: 'Test Bot 1',
    username: 'test_bot_1',
    token: '123456789:ABCdefGHI...',
    status: 'active',
    created_at: '2025-06-24T20:00:00.000Z',
    last_used: '2025-06-24T21:30:00.000Z',
    message_count: 45
  },
  {
    id: 'bot_test_2',
    name: 'Test Bot 2',
    username: 'test_bot_2',
    token: '987654321:XYZabcDEF...',
    status: 'active',
    created_at: '2025-06-24T19:00:00.000Z',
    last_used: '2025-06-24T21:45:00.000Z',
    message_count: 23
  },
  {
    id: 'bot_test_3',
    name: 'Test Bot 3',
    username: 'test_bot_3',
    token: '555666777:QWErtyUIO...',
    status: 'inactive',
    created_at: '2025-06-24T18:00:00.000Z',
    last_used: '2025-06-24T20:15:00.000Z',
    message_count: 8
  }
]

export const mockActivities: ActivityEvent[] = [
  {
    id: '1',
    type: 'message_sent',
    description: 'AI response sent to user @testuser',
    timestamp: '2025-06-24T21:58:00.000Z',
    bot_id: 'bot_test_1'
  },
  {
    id: '2',
    type: 'bot_created',
    description: 'New bot "Test Bot 2" created successfully',
    timestamp: '2025-06-24T21:00:00.000Z',
    bot_id: 'bot_test_2'
  },
  {
    id: '3',
    type: 'channel_updated',
    description: 'Channel configuration updated for "Test Channel"',
    timestamp: '2025-06-24T20:30:00.000Z'
  },
  {
    id: '4',
    type: 'error',
    description: 'Bot connection timeout for "Test Bot 3"',
    timestamp: '2025-06-24T20:15:00.000Z',
    bot_id: 'bot_test_3'
  }
]

export const mockDashboardStats: DashboardStats = {
  totalBots: mockBots.length,
  activeBots: mockBots.filter(bot => bot.status === 'active').length,
  totalChannels: Math.floor(mockBots.length * 1.5),
  messagesLast24h: mockBots.reduce((total, bot) => total + (bot.message_count || 0), 0),
  systemHealth: mockSystemHealth
}

export const mockDashboardStatsError: DashboardStats = {
  totalBots: 0,
  activeBots: 0,
  totalChannels: 0,
  messagesLast24h: 0,
  systemHealth: mockSystemHealthDown
}

// Helper functions for creating test scenarios
export const createMockBotWithStatus = (status: 'active' | 'inactive' | 'error'): BotInfo => ({
  id: `bot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  name: `Mock Bot ${status}`,
  username: `mock_bot_${status}`,
  token: `${Math.floor(Math.random() * 1000000000)}:${'x'.repeat(35)}`,
  status,
  created_at: new Date().toISOString(),
  last_used: new Date().toISOString(),
  message_count: Math.floor(Math.random() * 100)
})

export const createMockActivity = (type: ActivityEvent['type']): ActivityEvent => ({
  id: Math.random().toString(36),
  type,
  description: `Mock ${type} event`,
  timestamp: new Date().toISOString(),
  bot_id: type.includes('bot') ? `bot_${Math.random().toString(36).substr(2, 9)}` : undefined
})