'use client'

import { useState, useEffect } from 'react'
import { Database } from '@/lib/supabase/database.types'
import MessageIcon from '@mui/icons-material/Message'
import InfoIcon from '@mui/icons-material/Info'

// Instagram connection type (table may not be in generated types yet)
type InstagramConnection = {
  id: string
  business_location_id: string
  access_token: string
  instagram_user_id: string
  instagram_username: string | null
  scopes: string[] | null
  token_expires_at: string | null
  created_at: string
  updated_at: string
} | null

interface InstagramInboxProps {
  locationId: string
  instagramConnection: InstagramConnection | null
}

interface Conversation {
  conversationId: string
  participantUsername: string
  updatedTime: string
  unreadCount: number
  lastMessageText: string | null
  lastMessageTime: string | null
  messages: Message[]
}

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  from: {
    id: string
    username: string
  }
  text: string
  timestamp: string
}

export function InstagramInbox({ locationId, instagramConnection }: InstagramInboxProps) {
  const [loading, setLoading] = useState(true)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [enabled, setEnabled] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
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
          setConversations(data.conversations || [])
          setUnreadCount(data.unreadCount || 0)
          
          // If a conversation is selected, load its messages
          if (selectedConversationId) {
            const selectedConv = data.conversations?.find((c: Conversation) => c.conversationId === selectedConversationId)
            if (selectedConv) {
              setMessages(selectedConv.messages || [])
            }
          }
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
  }, [locationId, instagramConnection, selectedConversationId])

  useEffect(() => {
    if (selectedConversationId) {
      const fetchMessages = async () => {
        try {
          const response = await fetch(
            `/api/social/instagram/inbox/messages?locationId=${locationId}&threadId=${selectedConversationId}`
          )
          if (response.ok) {
            const data = await response.json()
            setMessages(data.messages || [])
            
            // Refresh conversations to update unread count
            const refreshResponse = await fetch(`/api/social/instagram/messages?locationId=${locationId}`)
            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json()
              setConversations(refreshData.conversations || [])
              setUnreadCount(refreshData.unreadCount || 0)
            }
          }
        } catch (error) {
          console.error('Error fetching messages:', error)
        }
      }
      fetchMessages()
    }
  }, [selectedConversationId, locationId])

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedConversationId) return

    setSending(true)
    try {
      const response = await fetch('/api/social/instagram/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          conversationId: selectedConversationId,
          text: replyText.trim(),
        }),
      })

      if (response.ok) {
        setReplyText('')
        // Refresh messages and conversations
        const refreshResponse = await fetch(`/api/social/instagram/messages?locationId=${locationId}`)
        if (refreshResponse.ok) {
          const data = await refreshResponse.json()
          setConversations(data.conversations || [])
          setUnreadCount(data.unreadCount || 0)
          
          const selectedConv = data.conversations?.find((c: Conversation) => c.conversationId === selectedConversationId)
          if (selectedConv) {
            setMessages(selectedConv.messages || [])
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        alert(`Failed to send message: ${errorData.error || 'Unknown error'}`)
      }
    } catch (error: any) {
      console.error('Error sending reply:', error)
      alert(`Failed to send message: ${error.message || 'Unknown error'}`)
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
              To enable Direct Messages, you need to enable Instagram "Connected Tools → Allow access to Messages" in your Meta Business settings.
            </p>
            <p className="text-sm text-slate-500 mb-4">
              Messages will appear here once webhooks are configured and messages are received.
            </p>
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
            {unreadCount > 0 && (
              <span className="ml-2 bg-[#1a73e8] text-white text-xs rounded-full px-2 py-1">
                {unreadCount}
              </span>
            )}
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Conversation List */}
          <div className="lg:col-span-1 border-r border-slate-200 pr-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Conversations</h3>
            {conversations.length === 0 ? (
              <p className="text-sm text-slate-500">No conversations yet</p>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <button
                    key={conv.conversationId}
                    onClick={() => setSelectedConversationId(conv.conversationId)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedConversationId === conv.conversationId
                        ? 'border-[#1a73e8] bg-blue-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          @{conv.participantUsername}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {conv.lastMessageText || 'No messages'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {conv.lastMessageTime
                            ? new Date(conv.lastMessageTime).toLocaleDateString()
                            : ''}
                        </p>
                      </div>
                      {conv.unreadCount > 0 && (
                        <span className="ml-2 bg-[#1a73e8] text-white text-xs rounded-full px-2 py-1">
                          {conv.unreadCount}
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
            {selectedConversationId ? (
              <>
                <div className="flex-1 overflow-y-auto space-y-3 mb-4 max-h-96">
                  {messages.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">No messages in this conversation</p>
                  ) : (
                    messages.map((message) => {
                      const isOutbound = message.direction === 'outbound'
                      return (
                        <div
                          key={message.id}
                          className={`flex items-start gap-3 ${isOutbound ? 'flex-row-reverse' : ''}`}
                        >
                          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs">
                            {message.from?.username?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div className={`flex-1 ${isOutbound ? 'text-right' : ''}`}>
                            <div className={`flex items-center gap-2 mb-1 ${isOutbound ? 'justify-end' : ''}`}>
                              <span className="text-sm font-medium text-slate-900">
                                {isOutbound ? 'You' : `@${message.from?.username || 'Unknown'}`}
                              </span>
                              <span className="text-xs text-slate-500">
                                {new Date(message.timestamp).toLocaleString()}
                              </span>
                            </div>
                            <p className={`text-sm text-slate-700 ${isOutbound ? 'bg-blue-50 p-2 rounded' : ''}`}>
                              {message.text}
                            </p>
                          </div>
                        </div>
                      )
                    })
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

