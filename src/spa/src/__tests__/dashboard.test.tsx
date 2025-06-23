/**
 * Dashboard component tests using extracted dummy data as fixtures
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'
import { apiClient } from '../api/client'
import {
  mockDashboardStats,
  mockDashboardStatsError,
  mockActivities,
  mockBots,
  mockSystemHealth,
  mockSystemHealthDown
} from './fixtures/dashboard-data'

// Mock the API client
vi.mock('../api/client', () => ({
  apiClient: {
    getDashboardStats: vi.fn(),
    getRecentActivity: vi.fn(),
    healthCheck: vi.fn(),
    webhookHealthCheck: vi.fn(),
    getMCPStatus: vi.fn(),
    listBots: vi.fn(),
  }
}))

const createTestRouter = () => {
  return createRouter({
    routeTree
  })
}

describe('Dashboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dashboard with healthy system data', async () => {
    // Mock successful API responses
    vi.mocked(apiClient.getDashboardStats).mockResolvedValue(mockDashboardStats)
    vi.mocked(apiClient.getRecentActivity).mockResolvedValue(mockActivities)

    const router = createTestRouter()
    render(<RouterProvider router={router} />)

    // Check for loading state first
    expect(screen.getByText('Loading TSGram dashboard...')).toBeInTheDocument()

    // Wait for data to load
    await waitFor(() => {
      expect(screen.getByText('TSGram Dashboard')).toBeInTheDocument()
    })

    // Check system status indicators
    expect(screen.getByText('All Systems Operational')).toBeInTheDocument()
    
    // Check stats display
    expect(screen.getByText(mockDashboardStats.totalBots.toString())).toBeInTheDocument()
    expect(screen.getByText(mockDashboardStats.activeBots.toString())).toBeInTheDocument()
    expect(screen.getByText(mockDashboardStats.totalChannels.toString())).toBeInTheDocument()
    expect(screen.getByText(mockDashboardStats.messagesLast24h.toString())).toBeInTheDocument()

    // Check system health badges
    expect(screen.getByText('Online')).toBeInTheDocument() // MCP Server
    expect(screen.getByText('Connected')).toBeInTheDocument() // AI Model
    expect(screen.getByText('Healthy')).toBeInTheDocument() // Overall status
  })

  it('renders dashboard with error state when services are down', async () => {
    // Mock failed API responses
    vi.mocked(apiClient.getDashboardStats).mockResolvedValue(mockDashboardStatsError)
    vi.mocked(apiClient.getRecentActivity).mockResolvedValue([])

    const router = createTestRouter()
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByText('TSGram Dashboard')).toBeInTheDocument()
    })

    // Check error state indicators
    expect(screen.getByText('Service Issues Detected')).toBeInTheDocument()
    
    // Check zero stats
    expect(screen.getByText('0')).toBeInTheDocument() // Should appear multiple times for zero stats
    
    // Check offline status badges
    expect(screen.getByText('Offline')).toBeInTheDocument() // Should appear for down services
    expect(screen.getByText('Down')).toBeInTheDocument() // Overall status
  })

  it('displays connection error when API calls fail', async () => {
    // Mock API failures
    vi.mocked(apiClient.getDashboardStats).mockRejectedValue(new Error('Connection refused'))
    vi.mocked(apiClient.getRecentActivity).mockRejectedValue(new Error('Connection refused'))

    const router = createTestRouter()
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByText('Connection Error')).toBeInTheDocument()
    })

    expect(screen.getByText(/Failed to connect to TSGram services/)).toBeInTheDocument()
  })

  it('shows proper health status colors for different states', async () => {
    const healthyStats = { ...mockDashboardStats }
    const degradedStats = { 
      ...mockDashboardStats, 
      systemHealth: { ...mockSystemHealth, status: 'degraded' as const }
    }

    // Test healthy state
    vi.mocked(apiClient.getDashboardStats).mockResolvedValue(healthyStats)
    vi.mocked(apiClient.getRecentActivity).mockResolvedValue(mockActivities)

    const router = createTestRouter()
    const { rerender } = render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByText('All Systems Operational')).toBeInTheDocument()
    })

    // Test degraded state
    vi.mocked(apiClient.getDashboardStats).mockResolvedValue(degradedStats)
    
    // Trigger a rerender/refresh (in real app this would be auto-refresh)
    rerender(<RouterProvider router={router} />)
    
    await waitFor(() => {
      expect(screen.getByText('Degraded')).toBeInTheDocument()
    })
  })

  it('displays recent activity events correctly', async () => {
    vi.mocked(apiClient.getDashboardStats).mockResolvedValue(mockDashboardStats)
    vi.mocked(apiClient.getRecentActivity).mockResolvedValue(mockActivities)

    const router = createTestRouter()
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument()
    })

    // Check that activity events are displayed
    mockActivities.forEach(activity => {
      expect(screen.getByText(activity.description)).toBeInTheDocument()
    })
  })

  it('shows correct technical information section', async () => {
    vi.mocked(apiClient.getDashboardStats).mockResolvedValue(mockDashboardStats)
    vi.mocked(apiClient.getRecentActivity).mockResolvedValue(mockActivities)

    const router = createTestRouter()
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByText('Technical Information')).toBeInTheDocument()
    })

    // Check service endpoints
    expect(screen.getByText('localhost:4040')).toBeInTheDocument()
    expect(screen.getByText('localhost:4041')).toBeInTheDocument()
    expect(screen.getByText('localhost:3001')).toBeInTheDocument()

    // Check configuration info
    expect(screen.getByText('Configured Bots:')).toBeInTheDocument()
    expect(screen.getByText('Active Connections:')).toBeInTheDocument()
    expect(screen.getByText(mockSystemHealth.ai_model)).toBeInTheDocument()
  })

  it('has working refresh functionality', async () => {
    vi.mocked(apiClient.getDashboardStats).mockResolvedValue(mockDashboardStats)
    vi.mocked(apiClient.getRecentActivity).mockResolvedValue(mockActivities)

    const router = createTestRouter()
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByText('TSGram Dashboard')).toBeInTheDocument()
    })

    // Find and click refresh button
    const refreshButton = screen.getByText('Refresh')
    expect(refreshButton).toBeInTheDocument()
    
    // Click should trigger API calls again
    refreshButton.click()
    
    await waitFor(() => {
      expect(vi.mocked(apiClient.getDashboardStats)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(apiClient.getRecentActivity)).toHaveBeenCalledTimes(2)
    })
  })
})