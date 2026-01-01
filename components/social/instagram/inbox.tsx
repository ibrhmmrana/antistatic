'use client'

import { useState, useEffect } from 'react'
import { Database } from '@/lib/supabase/database.types'
import MessageIcon from '@mui/icons-material/Message'
import InfoIcon from '@mui/icons-material/Info'

type InstagramConnection = Database['public']['Tables']['instagram_connections']['Row']

interface InstagramInboxProps {
  locationId: string
  instagramConnection: InstagramConnection | null
}

interface Thread {
  id: string
  participants: string[]
  last_message_at: string
  unread_count: number
}

interface Message {
  id: string
  from: {
    username: string
    id: string
  }
  text: string
  timestamp: string
  threadId?: string
}

export function InstagramInbox({ locationId, instagramConnection }: InstagramInboxProps) {
  const [loading, setLoading] = useState(true)
  const [threads, setThreads] = useState<Thread[]>([])
  const [selectedThread, setSelectedThread] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [enabled, setEnabled] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      if (!instagramConnection) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const response = await fetch(`/api/social/instagram/messages?locationId=${locationId}`)
        if (response.ok) {
          const data = await response.json()
          setEnabled(data.enabled || false)
          setThreads(data.threads || [])
          setMessages(data.messages || [])
        } else {
          setEnabled(false)
        }
      } catch (error) {
        setEnabled(false)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [locationId, instagramConnection])

  useEffect(() => {
    if (selectedThread) {
      const fetchMessages = async () => {
        try {
          const response = await fetch(
            `/api/social/instagram/inbox/messages?locationId=${locationId}&threadId=${selectedThread}`
          )
          if (response.ok) {
            const data = await response.json()
            setMessages(data.messages || [])
          }
        } catch (error) {
          console.error('Error fetching messages:', error)
        }
      }
      fetchMessages()
    }
  }, [selectedThread, locationId])

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedThread) return

    setSending(true)
    try {
      const response = await fetch('/api/social/instagram/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          threadId: selectedThread,
          message: replyText,
        }),
      })

      if (response.ok) {
        setReplyText('')
        // Refresh messages
        const refreshResponse = await fetch(
          `/api/social/instagram/inbox/messages?locationId=${locationId}&threadId=${selectedThread}`
        )
        if (refreshResponse.ok) {
          const data = await refreshResponse.json()
          setMessages(data.messages || [])
        }
      }
    } catch (error) {
      console.error('Error sending reply:', error)
    } finally {
      setSending(false)
    }
  }

  if (!instagramConnection) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
        <p className="text-slate-600">Instagram account not connected</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-slate-200 rounded w-1/2"></div>
      </div>
    )
  }

  if (!enabled) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8">
        <div className="flex items-start gap-3 mb-4">
          <InfoIcon sx={{ fontSize: 24 }} className="text-blue-500 mt-1" />
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Direct Messages Not Enabled</h3>
            <p className="text-slate-600 mb-4">
              To enable Direct Messages, you need the <code className="bg-slate-100 px-2 py-1 rounded text-sm">instagram_business_manage_messages</code> permission and webhook setup.
            </p>
            <p className="text-sm text-slate-500 mb-4">
              Messages will appear here once webhooks are configured and messages are received.
            </p>
            <a
              href="https://developers.facebook.com/docs/instagram-api/guides/messaging"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1a73e8] hover:underline text-sm"
            >
              Learn how to enable messaging →
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <MessageIcon sx={{ fontSize: 24 }} />
            Direct Messages
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Thread List */}
          <div className="lg:col-span-1 border-r border-slate-200 pr-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Conversations</h3>
            {threads.length === 0 ? (
              <p className="text-sm text-slate-500">No conversations yet</p>
            ) : (
              <div className="space-y-2">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => setSelectedThread(thread.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedThread === thread.id
                        ? 'border-[#1a73e8] bg-blue-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {thread.participants?.join(', ') || 'Conversation'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {thread.last_message_at
                            ? new Date(thread.last_message_at).toLocaleDateString()
                            : 'No messages'}
                        </p>
                      </div>
                      {thread.unread_count > 0 && (
                        <span className="ml-2 bg-[#1a73e8] text-white text-xs rounded-full px-2 py-1">
                          {thread.unread_count}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="lg:col-span-2 flex flex-col">
            {selectedThread ? (
              <>
                <div className="flex-1 overflow-y-auto space-y-3 mb-4 max-h-96">
                  {messages.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">No messages in this thread</p>
                  ) : (
                    messages.map((message) => (
                      <div key={message.id} className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs">
                          {message.from?.username?.charAt(0).toUpperCase() || '?'}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-slate-900">
                              @{message.from?.username || 'Unknown'}
                            </span>
                            <span className="text-xs text-slate-500">
                              {new Date(message.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700">{message.text}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-slate-200 pt-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendReply()
                        }
                      }}
                      disabled={sending}
                    />
                    <button
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || sending}
                      className="px-4 py-2 bg-[#1a73e8] text-white rounded-lg text-sm hover:bg-[#1557b0] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-64">
                <p className="text-slate-500">Select a conversation to view messages</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

