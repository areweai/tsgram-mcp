import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { apiClient } from '../api/client'

interface ConversationUser {
  username: string
  chat_id: number
  last_message?: string
  last_activity?: string
  message_count?: number
}

interface SendMessageForm {
  recipient: string
  message: string
  use_ai: boolean
}

function MessagesPage() {
  const [conversations, setConversations] = useState<ConversationUser[]>([])
  const [selectedUser, setSelectedUser] = useState<ConversationUser | null>(null)
  const [sendForm, setSendForm] = useState<SendMessageForm>({
    recipient: '',
    message: '',
    use_ai: false
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showComposeModal, setShowComposeModal] = useState(false)

  // Load recent conversations/activity
  useEffect(() => {
    loadRecentConversations()
  }, [])

  const loadRecentConversations = async () => {
    try {
      const activity = await apiClient.getRecentActivity()
      
      // Extract unique users from activity
      const userMap = new Map<string, ConversationUser>()
      
      activity.forEach(event => {
        if (event.type === 'message_sent' || event.description.includes('Message from')) {
          // Extract username and details from activity
          const usernameMatch = event.description.match(/@(\w+)/) || event.description.match(/from (\w+)/)
          const chatIdMatch = event.description.match(/\((\d+)\)/)
          
          if (usernameMatch) {
            const username = usernameMatch[1]
            const chat_id = chatIdMatch ? parseInt(chatIdMatch[1]) : 0
            
            if (!userMap.has(username)) {
              userMap.set(username, {
                username,
                chat_id,
                last_activity: event.timestamp,
                message_count: 1
              })
            } else {
              const existing = userMap.get(username)!
              existing.message_count = (existing.message_count || 0) + 1
              if (new Date(event.timestamp) > new Date(existing.last_activity || '')) {
                existing.last_activity = event.timestamp
              }
            }
          }
        }
      })
      
      setConversations(Array.from(userMap.values()).sort((a, b) => 
        new Date(b.last_activity || '').getTime() - new Date(a.last_activity || '').getTime()
      ))
    } catch (error) {
      console.error('Failed to load conversations:', error)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const targetUser = selectedUser || conversations.find(u => u.username === sendForm.recipient)
      
      if (!targetUser) {
        throw new Error('Please select a valid user to send message to')
      }

      const result = await apiClient.sendMessage({
        chat_id: targetUser.chat_id,
        text: sendForm.message,
        use_ai: sendForm.use_ai
      })

      if (result.success) {
        setSuccess(`Message sent successfully to @${targetUser.username}`)
        setSendForm({ recipient: '', message: '', use_ai: false })
        setSelectedUser(null)
        setShowComposeModal(false)
        // Refresh conversations
        await loadRecentConversations()
      } else {
        throw new Error(result.error || 'Failed to send message')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  const selectUserForMessage = (user: ConversationUser) => {
    setSelectedUser(user)
    setSendForm(prev => ({ ...prev, recipient: user.username }))
    setShowComposeModal(true)
  }

  const formatLastActivity = (timestamp?: string) => {
    if (!timestamp) return 'Unknown'
    const date = new Date(timestamp)
    const now = new Date()
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`
    return `${Math.floor(diffMinutes / 1440)}d ago`
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Messages</h1>
          <p className="text-telegram-text-secondary mt-2">
            Send messages to users via your connected bot
          </p>
        </div>
        <button 
          onClick={() => setShowComposeModal(true)}
          className="btn btn-primary mt-4 sm:mt-0"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Compose Message
        </button>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-green-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414L8.586 12l-2.293 2.293a1 1 0 101.414 1.414L9 13.414l2.293 2.293a1 1 0 001.414-1.414L10.414 12l2.293-2.293z" clipRule="evenodd" />
            </svg>
            <p className="text-green-800">{success}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-red-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-red-800">{error}</p>
          </div>
        </div>
      )}

      {/* Recent Conversations */}
      <div className="card">
        <div className="px-6 py-4 border-b border-telegram-border">
          <h2 className="text-lg font-semibold">Recent Conversations</h2>
          <p className="text-sm text-telegram-text-secondary">
            Users who have recently messaged your bot
          </p>
        </div>
        
        <div className="divide-y divide-telegram-border">
          {conversations.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <div className="telegram-logo mx-auto mb-4 text-4xl">💬</div>
              <h3 className="text-lg font-medium mb-2">No conversations yet</h3>
              <p className="text-telegram-text-secondary">
                When users message your bot, they'll appear here
              </p>
            </div>
          ) : (
            conversations.map((user) => (
              <div key={user.username} className="px-6 py-4 hover:bg-telegram-bg-secondary transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-telegram-primary to-telegram-secondary rounded-full flex items-center justify-center text-white font-medium">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-medium">@{user.username}</h3>
                      <p className="text-sm text-telegram-text-secondary">
                        {user.message_count} message{user.message_count !== 1 ? 's' : ''} • {formatLastActivity(user.last_activity)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => selectUserForMessage(user)}
                    className="btn btn-outline btn-sm"
                  >
                    Send Message
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Compose Message Modal */}
      {showComposeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Compose Message</h3>
              <button
                onClick={() => {
                  setShowComposeModal(false)
                  setSelectedUser(null)
                  setSendForm({ recipient: '', message: '', use_ai: false })
                  setError(null)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSendMessage} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Recipient
                </label>
                {selectedUser ? (
                  <div className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
                    <div className="w-8 h-8 bg-gradient-to-br from-telegram-primary to-telegram-secondary rounded-full flex items-center justify-center text-white text-sm font-medium">
                      {selectedUser.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">@{selectedUser.username}</span>
                  </div>
                ) : (
                  <select
                    value={sendForm.recipient}
                    onChange={(e) => setSendForm(prev => ({ ...prev, recipient: e.target.value }))}
                    className="input w-full"
                    required
                  >
                    <option value="">Select a user...</option>
                    {conversations.map(user => (
                      <option key={user.username} value={user.username}>
                        @{user.username}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Message
                </label>
                <textarea
                  value={sendForm.message}
                  onChange={(e) => setSendForm(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Type your message..."
                  className="input w-full h-24 resize-none"
                  required
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="use_ai"
                  checked={sendForm.use_ai}
                  onChange={(e) => setSendForm(prev => ({ ...prev, use_ai: e.target.checked }))}
                  className="w-4 h-4 text-telegram-primary bg-gray-100 border-gray-300 rounded focus:ring-telegram-primary focus:ring-2"
                />
                <label htmlFor="use_ai" className="text-sm">
                  Process with AI before sending
                </label>
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowComposeModal(false)
                    setSelectedUser(null)
                    setSendForm({ recipient: '', message: '', use_ai: false })
                    setError(null)
                  }}
                  className="btn btn-outline flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary flex-1"
                >
                  {loading ? (
                    <div className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </div>
                  ) : (
                    'Send Message'
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

export const Route = createFileRoute('/messages')({
  component: MessagesPage,
})