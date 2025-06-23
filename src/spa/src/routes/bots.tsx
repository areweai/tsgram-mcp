import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { apiClient, BotInfo } from '../api/client'

// Using BotInfo from API client

interface CreateBotForm {
  name: string
  token: string
  description: string
}

function BotsPage() {
  const [bots, setBots] = useState<BotInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState<CreateBotForm>({
    name: '',
    token: '',
    description: '',
  })
  const [creating, setCreating] = useState(false)
  const [validatingToken, setValidatingToken] = useState(false)
  const [tokenValidation, setTokenValidation] = useState<{ valid: boolean; username?: string; error?: string } | null>(null)

  useEffect(() => {
    loadBots()
  }, [])

  const loadBots = async () => {
    try {
      setLoading(true)
      setError(null)
      const botsData = await apiClient.listBots()
      setBots(botsData)
    } catch (err) {
      console.error('Failed to load bots:', err)
      setError('Failed to connect to TSGram services. Make sure the servers are running.')
    } finally {
      setLoading(false)
    }
  }

  const validateToken = async () => {
    if (!createForm.token) return
    
    setValidatingToken(true)
    try {
      const validation = await apiClient.testBotToken(createForm.token)
      setTokenValidation(validation)
    } catch (err) {
      setTokenValidation({ valid: false, error: 'Network error' })
    } finally {
      setValidatingToken(false)
    }
  }

  const handleCreateBot = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    
    try {
      const result = await apiClient.createBot({
        name: createForm.name,
        token: createForm.token,
        description: createForm.description
      })
      
      if (result.success) {
        await loadBots() // Refresh the list
        setShowCreateModal(false)
        setCreateForm({ name: '', token: '', description: '' })
        setTokenValidation(null)
      } else {
        setError(result.error || 'Failed to create bot')
      }
    } catch (err) {
      setError('Network error while creating bot')
    } finally {
      setCreating(false)
    }
  }

  const getStatusColor = (status: BotInfo['status']) => {
    switch (status) {
      case 'online': return 'status-online'
      case 'offline': return 'status-offline'
      case 'idle': return 'status-idle'
      default: return 'status-offline'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Telegram Bots</h1>
          <p className="text-telegram-text-secondary mt-2">
            Manage your Telegram bot instances
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex flex-wrap gap-2">
          <button 
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Bot
          </button>
          <button 
            onClick={loadBots}
            className="btn btn-secondary"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Bots Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {bots.map((bot) => (
          <div key={bot.id} className="card">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                <div className="telegram-logo">🤖</div>
                <div>
                  <h3 className="font-semibold text-lg">{bot.name}</h3>
                  <p className="text-sm text-telegram-text-secondary">{bot.username}</p>
                </div>
              </div>
              <span className={`status-badge ${getStatusColor(bot.status)}`}>
                {bot.status}
              </span>
            </div>
            
            <p className="text-sm text-telegram-text-secondary mb-4 line-clamp-2">
              {bot.description}
            </p>
            
            <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
              <div>
                <p className="text-telegram-text-secondary">Created</p>
                <p className="font-medium">{formatDate(bot.created_at)}</p>
              </div>
              <div>
                <p className="text-telegram-text-secondary">Messages</p>
                <p className="font-medium">{bot.message_count.toLocaleString()}</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm flex-1">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Manage
              </button>
              <button className="btn btn-secondary btn-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {bots.length === 0 && !loading && (
        <div className="text-center py-12">
          <div className="telegram-logo mx-auto mb-4 text-4xl">🤖</div>
          <h3 className="text-xl font-semibold mb-2">No bots yet</h3>
          <p className="text-telegram-text-secondary mb-6">
            Create your first Telegram bot to get started
          </p>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
          >
            Create Your First Bot
          </button>
        </div>
      )}

      {/* Create Bot Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Create New Bot</h2>
              <button 
                onClick={() => setShowCreateModal(false)}
                className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <form onSubmit={handleCreateBot} className="space-y-4">
              <div>
                <label className="form-label">Bot Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter bot name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </div>
              
              <div>
                <label className="form-label">Bot Token</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter bot token from @BotFather"
                  value={createForm.token}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, token: e.target.value }))}
                  required
                />
                <p className="text-xs text-telegram-text-secondary mt-1">
                  Get your bot token from @BotFather on Telegram
                </p>
              </div>
              
              <div>
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  placeholder="Describe what this bot does"
                  rows={3}
                  value={createForm.description}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary flex-1"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary flex-1"
                  disabled={creating}
                >
                  {creating ? (
                    <>
                      <div className="loading-spinner mr-2 w-4 h-4"></div>
                      Creating...
                    </>
                  ) : (
                    'Create Bot'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute('/bots')({
  component: BotsPage,
})