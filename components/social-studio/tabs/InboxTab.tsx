'use client'

interface InboxTabProps {
  businessLocationId: string
}

export function InboxTab({ businessLocationId }: InboxTabProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center max-w-md">
        <div className="mb-4">
          <svg
            className="w-16 h-16 mx-auto text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-2">Coming Soon</h3>
        <p className="text-slate-600 mb-4">
          The Inbox tab will help you manage comments and mentions across all your social platforms in one place.
        </p>
        <p className="text-sm text-slate-500">
          You'll be able to reply to comments, track sentiment, and use AI to craft perfect responses. Instagram DMs will be available once we're fully compliant with Meta's messaging API requirements.
        </p>
      </div>
    </div>
  )
}

