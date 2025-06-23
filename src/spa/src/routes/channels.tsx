import { createFileRoute } from '@tanstack/react-router'

function ChannelsPage() {
  return (
    <div className="space-y-6 pb-20 lg:pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Channels</h1>
          <p className="text-telegram-text-secondary mt-2">
            Manage your Telegram channels and posts
          </p>
        </div>
        <button className="btn btn-primary mt-4 sm:mt-0">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Channel
        </button>
      </div>
      
      <div className="card">
        <div className="text-center py-12">
          <div className="telegram-logo mx-auto mb-4 text-4xl">📢</div>
          <h3 className="text-xl font-semibold mb-2">Channel Management</h3>
          <p className="text-telegram-text-secondary">
            Channel management features coming soon...
          </p>
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/channels')({
  component: ChannelsPage,
})