'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import MessageIcon from '@mui/icons-material/Message'
import InfoIcon from '@mui/icons-material/Info'
import SendIcon from '@mui/icons-material/Send'
import { Button } from '@/components/ui/button'

type InstagramConnection = {
  id: string
  business_location_id: string
  instagram_user_id: string
  instagram_username: string | null
} | null

interface InstagramInboxProps {
  locationId: string
  instagramConnection: InstagramConnection | null
}

interface Conversation {
  id: string
  participantIgsid: string
  displayName: string
  avatarUrl: string | null
  username: string | null
  lastMessagePreview: string | null
  lastMessageAt: string
  unreadCount: number
  updatedTime: string
  messages: Message[]
}

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  fromId: string
  toId: string
  text: string
  attachments: any
  createdTime: string
  readAt: string | null
  displayName: string
  avatarUrl: string | null
}

export function InstagramInbox({ locationId, instagramConnection }: InstagramInboxProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const supabaseRef = useRef(createClient())
  const realtimeSubscriptionRef = useRef<any>(null)

  // Fetch conversations and messages
  const fetchInbox = async () => {
    if (!instagramConnection) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const response = await fetch(`/api/social/instagram/inbox?locationId=${locationId}`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      setConversations(data.conversations || [])
      setUnreadCount(data.unreadCount || 0)
      setError(null)

      // If a conversation is selected, update its messages
      if (selectedConversationId) {
        const selectedConv = data.conversations?.find((c: Conversation) => c.id === selectedConversationId)
        if (selectedConv) {
          setMessages(selectedConv.messages || [])
        }
      }
    } catch (err: any) {
      console.error('[Instagram Inbox] Error fetching inbox:', err)
      setError(err.message || 'Failed to fetch inbox')
    } finally {
      setLoading(false)
    }
  }

  // Initial fetch
  useEffect(() => {
    fetchInbox()
  }, [locationId, instagramConnection])

  // Set up realtime subscription
  useEffect(() => {
    if (!instagramConnection) return

    const supabase = supabaseRef.current
    const igAccountId = instagramConnection.instagram_user_id

    // Subscribe to new messages
    const messagesChannel = supabase
      .channel('instagram_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'instagram_messages',
          filter: `ig_account_id=eq.${igAccountId}`,
        },
        (payload) => {
          console.log('[Instagram Inbox] New message received:', payload)
          // Refresh inbox to get updated conversations and messages
          fetchInbox()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'instagram_conversations',
          filter: `ig_account_id=eq.${igAccountId}`,
        },
        (payload) => {
          console.log('[Instagram Inbox] Conversation updated:', payload)
          // Refresh conversations to update unread counts
          fetchInbox()
        }
      )
      .subscribe()

    realtimeSubscriptionRef.current = messagesChannel

    return () => {
      if (realtimeSubscriptionRef.current) {
        supabase.removeChannel(realtimeSubscriptionRef.current)
        realtimeSubscriptionRef.current = null
      }
    }
  }, [locationId, instagramConnection])

  // Handle conversation selection
  const handleSelectConversation = async (conversationId: string) => {
    setSelectedConversationId(conversationId)
    
    // Fetch messages for this conversation
    const response = await fetch(`/api/social/instagram/inbox?locationId=${locationId}&conversationId=${conversationId}`)
    if (response.ok) {
      const data = await response.json()
      const conversation = data.conversations?.[0]
      if (conversation) {
        setMessages(conversation.messages || [])
        
        // Mark messages as read
        await fetch(`/api/social/instagram/inbox/mark-read?locationId=${locationId}&conversationId=${conversationId}`, {
          method: 'POST',
        })
        
        // Refresh to update unread count
        fetchInbox()
      }
    }
  }

  // Handle send reply
  const handleSendReply = async () => {
    if (!selectedConversationId || !replyText.trim() || sending) return

    const text = replyText.trim()
    setReplyText('')
    setSending(true)

    try {
      // Optimistically add message to UI
      const optimisticMessage: Message = {
        id: `temp_${Date.now()}`,
        direction: 'outbound',
        fromId: instagramConnection!.instagram_user_id,
        toId: conversations.find(c => c.id === selectedConversationId)?.participantIgsid || '',
        text,
        attachments: null,
        createdTime: new Date().toISOString(),
        readAt: new Date().toISOString(),
        displayName: 'You',
        avatarUrl: null,
      }
      setMessages(prev => [...prev, optimisticMessage])

      const response = await fetch('/api/social/instagram/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          conversationId: selectedConversationId,
          text,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      // Refresh to get the real message from API
      await fetchInbox()
    } catch (err: any) {
      console.error('[Instagram Inbox] Error sending message:', err)
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp_')))
      alert(`Failed to send message: ${err.message}`)
    } finally {
      setSending(false)
    }
  }

  // Handle sync
  const handleSync = async () => {
    setSyncing(true)
    try {
      const response = await fetch(`/api/social/instagram/inbox/sync?locationId=${locationId}`, {
        method: 'POST',
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      console.log('[Instagram Inbox] Sync completed:', data)
      
      // Refresh inbox after sync
      await fetchInbox()
    } catch (err: any) {
      console.error('[Instagram Inbox] Error syncing:', err)
      alert(`Sync failed: ${err.message}`)
    } finally {
      setSyncing(false)
    }
  }

  // Group messages by day
  const groupMessagesByDay = (msgs: Message[]) => {
    const groups: Record<string, Message[]> = {}
    msgs.forEach(msg => {
      const date = new Date(msg.createdTime).toLocaleDateString()
      if (!groups[date]) groups[date] = []
      groups[date].push(msg)
    })
    return groups
  }

  if (loading && conversations.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8">
        <div className="text-center">
          <p className="text-slate-600">Loading inbox...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8">
        <div className="text-center">
          <p className="text-red-600 mb-2">Error loading inbox</p>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    )
  }

  if (!instagramConnection) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8">
        <div className="text-center">
          <p className="text-slate-600">Instagram not connected</p>
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
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? 'Syncing...' : 'Sync Now'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchInbox}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Conversation List */}
          <div className="lg:col-span-1 border-r border-slate-200 pr-4">
            <div className="mb-3">
              <input
                type="text"
                placeholder="Search conversations..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            {conversations.length === 0 ? (
              <p className="text-sm text-slate-500">No conversations yet</p>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedConversationId === conv.id
                        ? 'border-[#1a73e8] bg-blue-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      {conv.avatarUrl ? (
                        <img
                          src={conv.avatarUrl}
                          alt={conv.displayName}
                          className="w-10 h-10 rounded-full object-cover"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                            if (target.nextElementSibling) {
                              (target.nextElementSibling as HTMLElement).style.display = 'flex'
                            }
                          }}
                        />
                      ) : null}
                      <div className={`w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-xs text-slate-600 ${conv.avatarUrl ? 'hidden' : ''}`}>
                        {conv.displayName.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {conv.displayName}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {conv.lastMessagePreview || 'No messages'}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {conv.lastMessageAt
                            ? new Date(conv.lastMessageAt).toLocaleDateString()
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

          {/* Messages Thread */}
          <div className="lg:col-span-2 flex flex-col">
            {selectedConversationId ? (
              <>
                {/* Header */}
                <div className="border-b border-slate-200 pb-3 mb-4">
                  {(() => {
                    const conv = conversations.find(c => c.id === selectedConversationId)
                    return conv ? (
                      <div className="flex items-center gap-3">
                        {conv.avatarUrl ? (
                          <img
                            src={conv.avatarUrl}
                            alt={conv.displayName}
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-xs text-slate-600">
                            {conv.displayName.charAt(0)?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{conv.displayName}</p>
                          {conv.username && (
                            <p className="text-xs text-slate-500">@{conv.username}</p>
                          )}
                        </div>
                      </div>
                    ) : null
                  })()}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto space-y-4 mb-4 max-h-96">
                  {messages.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">No messages in this conversation</p>
                  ) : (
                    Object.entries(groupMessagesByDay(messages)).map(([date, dayMessages]) => (
                      <div key={date}>
                        <div className="text-center text-xs text-slate-400 mb-2">{date}</div>
                        {dayMessages.map((message) => {
                          const isOutbound = message.direction === 'outbound'
                          return (
                            <div
                              key={message.id}
                              className={`flex items-start gap-3 mb-3 ${isOutbound ? 'flex-row-reverse' : ''}`}
                            >
                              {/* Avatar */}
                              {message.avatarUrl ? (
                                <img
                                  src={message.avatarUrl}
                                  alt={message.displayName}
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs text-slate-600">
                                  {message.displayName.charAt(0)?.toUpperCase() || '?'}
                                </div>
                              )}
                              
                              <div className={`flex-1 ${isOutbound ? 'text-right' : ''}`}>
                                <div className={`flex items-center gap-2 mb-1 ${isOutbound ? 'justify-end' : ''}`}>
                                  <span className="text-sm font-medium text-slate-900">
                                    {isOutbound ? 'You' : message.displayName}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    {new Date(message.createdTime).toLocaleTimeString()}
                                  </span>
                                </div>
                                <p className={`text-sm text-slate-700 ${isOutbound ? 'bg-blue-50 p-2 rounded inline-block' : ''}`}>
                                  {message.text}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))
                  )}
                </div>

                {/* Composer */}
                <div className="border-t border-slate-200 pt-4">
                  <div className="flex gap-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none"
                      rows={2}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSendReply()
                        }
                      }}
                    />
                    <Button
                      onClick={handleSendReply}
                      disabled={!replyText.trim() || sending}
                      size="sm"
                    >
                      <SendIcon sx={{ fontSize: 18 }} />
                    </Button>
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

