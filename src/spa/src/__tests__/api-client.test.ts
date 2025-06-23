/**
 * API Client tests using mock data fixtures
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TSGramAPIClient } from '../api/client'
import {
  mockSystemHealth,
  mockSystemHealthDown,
  mockBots,
  mockActivities,
  mockDashboardStats
} from './fixtures/dashboard-data'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('TSGramAPIClient', () => {
  let client: TSGramAPIClient
  
  beforeEach(() => {
    client = new TSGramAPIClient()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('healthCheck', () => {
    it('returns health data when server responds successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSystemHealth)
      })

      const result = await client.healthCheck()
      
      expect(result).toEqual(mockSystemHealth)
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4040/health')
    })

    it('throws error when server is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      await expect(client.healthCheck()).rejects.toThrow('Failed to connect to MCP server')
    })

    it('throws error when server returns non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error'
      })

      await expect(client.healthCheck()).rejects.toThrow('Failed to connect to MCP server')
    })
  })

  describe('webhookHealthCheck', () => {
    it('returns webhook health data successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSystemHealth)
      })

      const result = await client.webhookHealthCheck()
      
      expect(result).toEqual(mockSystemHealth)
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4041/health')
    })

    it('throws error when webhook server is down', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

      await expect(client.webhookHealthCheck()).rejects.toThrow('Failed to connect to webhook server')
    })
  })

  describe('listBots', () => {
    it('returns bot list from webhook server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ bots: mockBots })
      })

      const result = await client.listBots()
      
      expect(result).toEqual(mockBots)
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4041/api/bots')
    })

    it('falls back to direct data file when webhook API fails', async () => {
      // First call fails (webhook API)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      })
      
      // Second call succeeds (direct data file)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBots)
      })

      const result = await client.listBots()
      
      expect(result).toEqual(mockBots)
      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenNthCalledWith(1, 'http://localhost:4041/api/bots')
      expect(mockFetch).toHaveBeenNthCalledWith(2, 'http://localhost:4040/data/bots.json')
    })

    it('returns empty array when both endpoints fail', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const result = await client.listBots()
      
      expect(result).toEqual([])
    })
  })

  describe('getRecentActivity', () => {
    it('returns activity data successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ activities: mockActivities })
      })

      const result = await client.getRecentActivity()
      
      expect(result).toEqual(mockActivities)
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4041/api/activity')
    })

    it('throws error when activity endpoint fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Server error'))

      await expect(client.getRecentActivity()).rejects.toThrow('Failed to fetch activity')
    })
  })

  describe('getDashboardStats', () => {
    it('aggregates data from all endpoints successfully', async () => {
      // Mock all the API calls that getDashboardStats makes
      mockFetch
        .mockResolvedValueOnce({ // healthCheck
          ok: true,
          json: () => Promise.resolve(mockSystemHealth)
        })
        .mockResolvedValueOnce({ // webhookHealthCheck  
          ok: true,
          json: () => Promise.resolve(mockSystemHealth)
        })
        .mockResolvedValueOnce({ // getMCPStatus
          ok: true,
          json: () => Promise.resolve({ mcp_server: 'running' })
        })
        .mockResolvedValueOnce({ // listBots
          ok: true,
          json: () => Promise.resolve({ bots: mockBots })
        })

      const result = await client.getDashboardStats()
      
      expect(result.totalBots).toBe(mockBots.length)
      expect(result.activeBots).toBe(mockBots.filter(bot => bot.status === 'active').length)
      expect(result.systemHealth).toEqual(mockSystemHealth)
      expect(result.messagesLast24h).toBeGreaterThan(0)
    })

    it('handles partial failures gracefully', async () => {
      // Health check fails, but others succeed
      mockFetch
        .mockRejectedValueOnce(new Error('Health check failed')) // healthCheck fails
        .mockResolvedValueOnce({ // webhookHealthCheck succeeds
          ok: true,
          json: () => Promise.resolve(mockSystemHealthDown)
        })
        .mockRejectedValueOnce(new Error('MCP failed')) // getMCPStatus fails
        .mockResolvedValueOnce({ // listBots succeeds
          ok: true,
          json: () => Promise.resolve({ bots: mockBots })
        })

      const result = await client.getDashboardStats()
      
      expect(result.totalBots).toBe(mockBots.length)
      expect(result.systemHealth.status).toBe('down') // Uses webhook health as fallback
    })
  })

  describe('createBot', () => {
    it('creates bot successfully with valid token', async () => {
      const newBot = mockBots[0]
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, bot: newBot })
      })

      const result = await client.createBot({
        name: newBot.name,
        token: newBot.token
      })
      
      expect(result.success).toBe(true)
      expect(result.bot).toEqual(newBot)
    })

    it('returns error for invalid token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid bot token' })
      })

      const result = await client.createBot({
        name: 'Test Bot',
        token: 'invalid_token'
      })
      
      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid bot token')
    })
  })

  describe('testBotToken', () => {
    it('validates token successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: true,
          result: { username: 'test_bot', first_name: 'Test Bot' }
        })
      })

      const result = await client.testBotToken('valid_token')
      
      expect(result.valid).toBe(true)
      expect(result.username).toBe('test_bot')
    })

    it('returns invalid for bad token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ok: false,
          description: 'Unauthorized'
        })
      })

      const result = await client.testBotToken('bad_token')
      
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Unauthorized')
    })
  })
})