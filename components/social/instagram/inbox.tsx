'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import MessageIcon from '@mui/icons-material/Message'
import InfoIcon from '@mui/icons-material/Info'
import SendIcon from '@mui/icons-material/Send'
import { Button } from '@/components/ui/button'
import { useToast, ToastContainer } from '@/components/ui/toast'
import { useSessionRefresh } from '@/lib/hooks/use-session-refresh'

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
  // Keep session alive while inbox is open
  useSessionRefresh()
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:49',message:'InstagramInbox component render',data:{locationId,hasConnection:!!instagramConnection,igUserId:instagramConnection?.instagram_user_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  
  // Track auth state changes to detect session loss
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:58',message:'Auth state change',data:{event,hasSession:!!session,sessionExpiresAt:session?.expires_at,userId:session?.user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      if (event === 'SIGNED_OUT' || !session) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:62',message:'User signed out detected',data:{event},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
      }
    })
    
    return () => subscription.unsubscribe()
  }, [supabase])
  const [error, setError] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [refreshingIdentities, setRefreshingIdentities] = useState(false)
  const [authError, setAuthError] = useState<{ code: string; message: string } | null>(null)
  const { toasts, showToast, removeToast } = useToast()
  const supabaseRef = useRef(createClient())
  const realtimeSubscriptionRef = useRef<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  
  // Track component mount/unmount
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:65',message:'InstagramInbox component mounted',data:{locationId,hasConnection:!!instagramConnection},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:68',message:'InstagramInbox component unmounting',data:{locationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }
  }, [])

  // Fetch conversations and messages
  const fetchInbox = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:66',message:'fetchInbox called',data:{locationId,hasConnection:!!instagramConnection},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
    if (!instagramConnection) {
      setLoading(false)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:69',message:'fetchInbox: no connection',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      return
    }

    try {
      setLoading(true)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:74',message:'fetchInbox: calling API',data:{url:`/api/social/instagram/inbox?locationId=${locationId}`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      const response = await fetch(`/api/social/instagram/inbox?locationId=${locationId}`, {
        credentials: 'include', // Ensure cookies are sent with the request
      })
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:107',message:'API response received',data:{status:response.status,statusText:response.statusText,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:112',message:'API error response',data:{status:response.status,errorData,errorType:errorData?.error?.type,errorMessage:errorData?.error?.message,isUnauthorized:response.status===401},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
      // Check for Instagram auth error - automatically reconnect if expired
      if (errorData.error?.type === 'instagram_auth') {
        if (errorData.error.code === 'EXPIRED') {
          console.log('[Instagram Inbox] Token expired, automatically reconnecting...')
          // Automatically redirect to OAuth reconnection
          window.location.href = `/api/integrations/instagram/connect?business_location_id=${locationId}&return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`
          return
        }
        setAuthError({
          code: errorData.error.code,
          message: errorData.error.message,
        })
        setError(null)
        return
      }
        
        throw new Error(errorData.error?.message || errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:92',message:'API response received',data:{conversationsCount:data.conversations?.length||0,hasError:!!data.error,conversationIds:data.conversations?.map((c:any)=>c.id)||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
      
      console.log('[Instagram Inbox] API response:', {
        conversationsCount: data.conversations?.length || 0,
        conversations: data.conversations,
        unreadCount: data.unreadCount,
        hasError: !!data.error,
      })
      
      // Check for auth error in response - automatically reconnect if expired
      if (data.error?.type === 'instagram_auth') {
        if (data.error.code === 'EXPIRED') {
          console.log('[Instagram Inbox] Token expired, automatically reconnecting...')
          // Automatically redirect to OAuth reconnection
          window.location.href = `/api/integrations/instagram/connect?business_location_id=${locationId}&return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`
          return
        }
        setAuthError({
          code: data.error.code,
          message: data.error.message,
        })
        setError(null)
        return
      }
      
      setConversations(data.conversations || [])
      setUnreadCount(data.unreadCount || 0)
      setError(null)
      setAuthError(null) // Clear auth error on success
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:111',message:'State updated',data:{conversationsCount:data.conversations?.length||0,conversationsStateLength:data.conversations?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
      
      console.log('[Instagram Inbox] State updated:', {
        conversationsCount: data.conversations?.length || 0,
        unreadCount: data.unreadCount || 0,
      })

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

  // Initial fetch and automatic sync
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:157',message:'Sync useEffect triggered',data:{hasConnection:!!instagramConnection,locationId,igUserId:instagramConnection?.instagram_user_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (!instagramConnection) {
      setLoading(false)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:160',message:'No connection, exiting',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return
    }

    // Fetch inbox immediately
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:164',message:'Calling fetchInbox',data:{locationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    fetchInbox()

    // Auto-sync inbox from Instagram API periodically (every 30 seconds)
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:167',message:'Setting up auto-sync interval',data:{intervalMs:30000},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    const autoSyncInterval = setInterval(async () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:168',message:'Auto-sync interval triggered',data:{locationId,currentTime:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.log('[Instagram Inbox] Auto-syncing inbox from Instagram API...')
      try {
        setSyncing(true)
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:171',message:'Calling sync API',data:{locationId,url:`/api/social/instagram/inbox/sync?locationId=${locationId}`},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        const response = await fetch(`/api/social/instagram/inbox/sync?locationId=${locationId}`, {
          method: 'POST',
        })
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:174',message:'Sync API response received',data:{status:response.status,ok:response.ok,statusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        if (response.ok) {
          const data = await response.json()
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:177',message:'Sync API success',data:{conversationsFound:data.conversationsFound,conversationsUpserted:data.conversationsUpserted,messagesUpserted:data.messagesUpserted,success:data.success},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          console.log('[Instagram Inbox] Auto-sync completed:', {
            conversationsFound: data.conversationsFound,
            conversationsUpserted: data.conversationsUpserted,
            messagesUpserted: data.messagesUpserted,
          })
          // Refresh inbox after sync
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:182',message:'Refreshing inbox after sync',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          await fetchInbox()
        } else {
          const errorData = await response.json().catch(() => ({}))
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:184',message:'Sync API failed',data:{status:response.status,error:errorData.error||errorData,statusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          console.error('[Instagram Inbox] Auto-sync failed:', response.status)
        }
      } catch (err: any) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:187',message:'Sync API exception',data:{error:err.message,errorType:err.constructor.name,stack:err.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        console.error('[Instagram Inbox] Auto-sync error:', err)
      } finally {
        setSyncing(false)
      }
    }, 30000) // Sync every 30 seconds

    return () => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:195',message:'Cleaning up sync interval',data:{locationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      clearInterval(autoSyncInterval)
    }
  }, [locationId, instagramConnection])

  // Set up realtime subscription
  useEffect(() => {
    if (!instagramConnection) return

    const supabase = supabaseRef.current
    const igAccountId = instagramConnection.instagram_user_id

    console.log('[Instagram Inbox] Setting up realtime subscription for ig_account_id:', igAccountId)

    // Subscribe to new messages - use a unique channel name per account
    const channelName = `instagram_messages_${igAccountId}`
    const messagesChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'instagram_messages',
          filter: `ig_account_id=eq.${igAccountId}`,
        },
        (payload) => {
          console.log('[Instagram Inbox] New message received via realtime:', {
            messageId: payload.new?.id,
            conversationId: payload.new?.conversation_id,
            direction: payload.new?.direction,
            selectedConversationId,
          })
          
          // If a conversation is selected and the message belongs to it, add it immediately
          if (selectedConversationId && payload.new?.conversation_id === selectedConversationId) {
            const newMessage: Message = {
              id: payload.new.id,
              direction: payload.new.direction,
              fromId: payload.new.from_id,
              toId: payload.new.to_id,
              text: payload.new.text || '',
              attachments: payload.new.attachments,
              createdTime: payload.new.created_time,
              readAt: payload.new.read_at,
              displayName: payload.new.direction === 'outbound' ? 'You' : 'User',
              avatarUrl: null,
            }
            
            // Add message immediately to UI
            setMessages(prev => {
              const exists = prev.some(m => m.id === newMessage.id)
              if (exists) {
                console.log('[Instagram Inbox] Message already exists, skipping:', newMessage.id)
                return prev
              }
              
              console.log('[Instagram Inbox] Adding new message via realtime:', newMessage.id)
              const updated = [...prev, newMessage].sort((a, b) => 
                new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()
              )
              return updated
            })
            
            // Also refresh to get full message details (display name, avatar, etc.)
            setTimeout(() => {
              handleSelectConversation(selectedConversationId)
            }, 500)
          } else {
            // Message is for a different conversation, just refresh the list
            console.log('[Instagram Inbox] New message for different conversation, refreshing list')
            fetchInbox()
          }
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
          console.log('[Instagram Inbox] Conversation updated via realtime:', payload)
          // Refresh conversations to update unread counts and previews
          fetchInbox()
        }
      )
      .subscribe((status) => {
        console.log('[Instagram Inbox] Realtime subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('[Instagram Inbox] Successfully subscribed to realtime updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Instagram Inbox] Realtime subscription error')
        }
      })

    realtimeSubscriptionRef.current = messagesChannel

    return () => {
      if (realtimeSubscriptionRef.current) {
        console.log('[Instagram Inbox] Cleaning up realtime subscription')
        supabase.removeChannel(realtimeSubscriptionRef.current)
        realtimeSubscriptionRef.current = null
      }
    }
  }, [locationId, instagramConnection, selectedConversationId])

  // Set up automatic polling for new messages (always active, even when chat isn't open)
  // This ensures unread badges update in real-time
  useEffect(() => {
    if (!instagramConnection) return

    const pollInterval = setInterval(async () => {
      console.log('[Instagram Inbox] Polling for new messages...', {
        hasSelectedConversation: !!selectedConversationId,
      })
      
      try {
        // Always refresh conversations list to update unread counts and previews
        const response = await fetch(`/api/social/instagram/inbox?locationId=${locationId}`, {
          credentials: 'include', // Ensure cookies are sent with the request
        })
        if (response.ok) {
          const data = await response.json()
          const previousUnreadCount = unreadCount
          
          setConversations(data.conversations || [])
          setUnreadCount(data.unreadCount || 0)
          
          // Log if unread count changed
          if (data.unreadCount !== previousUnreadCount) {
            console.log('[Instagram Inbox] Unread count changed:', {
              previous: previousUnreadCount,
              current: data.unreadCount,
            })
          }

          // If conversation is selected, also refresh its messages
          if (selectedConversationId) {
            const convResponse = await fetch(`/api/social/instagram/inbox?locationId=${locationId}&conversationId=${selectedConversationId}`, {
              credentials: 'include', // Ensure cookies are sent with the request
            })
            if (convResponse.ok) {
              const convData = await convResponse.json()
              const conv = convData.conversations?.[0]
              if (conv && conv.messages) {
                // Merge new messages without removing optimistic ones
                setMessages(prev => {
                  const withoutTemp = prev.filter(m => !m.id.startsWith('temp_'))
                  const existingIds = new Set(withoutTemp.map(m => m.id))
                  const newMessages = conv.messages.filter((m: Message) => !existingIds.has(m.id))
                  
                  if (newMessages.length > 0) {
                    console.log('[Instagram Inbox] Found new messages via polling:', newMessages.length)
                  }
                  
                  const merged = [...withoutTemp, ...newMessages]
                  return merged.sort((a, b) => 
                    new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()
                  )
                })
              }
            }
          }
        }
      } catch (err) {
        console.error('[Instagram Inbox] Polling error:', err)
      }
    }, 5000) // Poll every 5 seconds regardless of whether conversation is selected

    return () => {
      clearInterval(pollInterval)
    }
  }, [locationId, instagramConnection, selectedConversationId, unreadCount])

  // Scroll to bottom of messages when messages change or conversation is selected
  useEffect(() => {
    if (messagesContainerRef.current && messages.length > 0) {
      // Use setTimeout to ensure DOM is updated
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
        }
      }, 100)
    }
  }, [messages, selectedConversationId])

  const handleSelectConversation = async (conversationId: string) => {
    setSelectedConversationId(conversationId)
    
    // Fetch messages for this conversation
    const response = await fetch(`/api/social/instagram/inbox?locationId=${locationId}&conversationId=${conversationId}`, {
      credentials: 'include', // Ensure cookies are sent with the request
    })
    if (response.ok) {
      const data = await response.json()
      const conversation = data.conversations?.[0]
      if (conversation) {
        console.log('[Instagram Inbox] Loading conversation messages:', {
          conversationId,
          messageCount: conversation.messages?.length || 0,
          messages: conversation.messages,
          outboundCount: conversation.messages?.filter((m: Message) => m.direction === 'outbound').length || 0,
        })
        setMessages(conversation.messages || [])
        
        // Mark messages as read
        await fetch(`/api/social/instagram/inbox/mark-read?locationId=${locationId}&conversationId=${conversationId}`, {
          method: 'POST',
          credentials: 'include', // Ensure cookies are sent with the request
        })
        
        // Refresh to update unread count (but preserve messages)
        const refreshResponse = await fetch(`/api/social/instagram/inbox?locationId=${locationId}`, {
          credentials: 'include', // Ensure cookies are sent with the request
        })
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          setConversations(refreshData.conversations || [])
          setUnreadCount(refreshData.unreadCount || 0)
          
          // Update messages from the refreshed conversation if it exists
          const refreshedConv = refreshData.conversations?.find((c: Conversation) => c.id === conversationId)
          if (refreshedConv && refreshedConv.messages) {
            console.log('[Instagram Inbox] Updating messages from refresh:', {
              messageCount: refreshedConv.messages.length,
              outboundCount: refreshedConv.messages.filter((m: Message) => m.direction === 'outbound').length,
            })
            setMessages(refreshedConv.messages)
          }
        }
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
      
      // Scroll to bottom after adding optimistic message
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
        }
      }, 0)
      
      const response = await fetch('/api/social/instagram/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          conversationId: selectedConversationId,
          text,
        }),
      })
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:508',message:'Send message response received',data:{status:response.status,ok:response.ok,statusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox.tsx:509',message:'Send message error response',data:{status:response.status,errorData,errorType:errorData.error?.type,errorCode:errorData.error?.code,errorMessage:errorData.error?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        
        // Check for Instagram auth error - automatically reconnect if expired
        if (errorData.error?.type === 'instagram_auth') {
          if (errorData.error.code === 'EXPIRED') {
            console.log('[Instagram Inbox] Token expired during send, automatically reconnecting...')
            showToast('Instagram connection expired. Redirecting to reconnect...', 'info')
            // Automatically redirect to OAuth reconnection
            window.location.href = `/api/integrations/instagram/connect?business_location_id=${locationId}&return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`
            return
          }
          setAuthError({
            code: errorData.error.code,
            message: errorData.error.message,
          })
          showToast('Your Instagram connection has expired. Please reconnect in Connect Channels → Instagram.', 'error')
          throw new Error(errorData.error.message)
        }
        
        // Check for not_found error
        if (errorData.error?.type === 'not_found') {
          showToast('Could not send message – conversation could not be found. Try refreshing the inbox.', 'error')
          throw new Error(errorData.error.message)
        }
        
        // Check for Instagram API error
        if (errorData.error?.type === 'instagram_api') {
          // Build detailed error message with code, subcode, and transient flag
          let errorMsg = errorData.error.message || errorData.error.error_user_msg || 'Instagram API error'
          
          // Add code and subcode
          if (errorData.error.code) {
            errorMsg += ` (Code: ${errorData.error.code}`
            if (errorData.error.error_subcode) {
              errorMsg += `, Subcode: ${errorData.error.error_subcode}`
            }
            errorMsg += ')'
          }
          
          // Add transient indicator
          if (errorData.error.is_transient === true) {
            errorMsg += ' - This is a temporary error. Please try again.'
          }
          
          // Log full error details for debugging
          console.error('[Instagram Inbox] Send message API error:', {
            code: errorData.error.code,
            error_subcode: errorData.error.error_subcode,
            fbtrace_id: errorData.error.fbtrace_id,
            is_transient: errorData.error.is_transient,
            status: errorData.error.status,
            message: errorData.error.message,
            error_user_msg: errorData.error.error_user_msg,
            fullError: errorData.error,
          })
          
          showToast(`Failed to send message: ${errorMsg}`, 'error')
          throw new Error(errorMsg)
        }
        
        // Generic error
        const errorMsg = errorData.error?.message || errorData.error || `HTTP ${response.status}`
        showToast(`Failed to send message: ${errorMsg}`, 'error')
        throw new Error(errorMsg)
      }

      const data = await response.json()
      
      // Check for error in response body - automatically reconnect if expired
      if (data.error) {
        if (data.error.type === 'instagram_auth') {
          if (data.error.code === 'EXPIRED') {
            console.log('[Instagram Inbox] Token expired during send, automatically reconnecting...')
            showToast('Instagram connection expired. Redirecting to reconnect...', 'info')
            // Automatically redirect to OAuth reconnection
            window.location.href = `/api/integrations/instagram/connect?business_location_id=${locationId}&return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`
            return
          }
          setAuthError({
            code: data.error.code,
            message: data.error.message,
          })
          showToast('Your Instagram connection has expired. Please reconnect in Connect Channels → Instagram.', 'error')
          throw new Error(data.error.message)
        }
        throw new Error(data.error.message || 'Unknown error')
      }

      // Success
      showToast('Message sent successfully', 'success')
      
      // Wait a bit for the database to be updated
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Refresh messages for the selected conversation specifically
      if (selectedConversationId) {
        const refreshResponse = await fetch(`/api/social/instagram/inbox?locationId=${locationId}&conversationId=${selectedConversationId}`, {
          credentials: 'include', // Ensure cookies are sent with the request
        })
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json()
          const refreshedConv = refreshData.conversations?.[0]
          if (refreshedConv && refreshedConv.messages) {
            console.log('[Instagram Inbox] Refreshed messages after send:', {
              messageCount: refreshedConv.messages.length,
              outboundCount: refreshedConv.messages.filter((m: Message) => m.direction === 'outbound').length,
              allMessages: refreshedConv.messages,
            })
            // Replace optimistic message with real messages from API
            // Remove temp messages and add real ones, ensuring we have all messages
            setMessages(prev => {
              const withoutTemp = prev.filter(m => !m.id.startsWith('temp_'))
              // Merge with new messages, avoiding duplicates by ID
              const existingIds = new Set(withoutTemp.map(m => m.id))
              const newMessages = refreshedConv.messages.filter((m: Message) => !existingIds.has(m.id))
              const merged = [...withoutTemp, ...newMessages]
              // Sort by created time
              return merged.sort((a, b) => 
                new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()
              )
            })
          }
        } else {
          console.error('[Instagram Inbox] Failed to refresh messages after send:', refreshResponse.status)
        }
      }
      
      // Also refresh the conversations list to update previews (but don't overwrite messages)
      const refreshInboxResponse = await fetch(`/api/social/instagram/inbox?locationId=${locationId}`, {
        credentials: 'include', // Ensure cookies are sent with the request
      })
      if (refreshInboxResponse.ok) {
        const refreshInboxData = await refreshInboxResponse.json()
        setConversations(refreshInboxData.conversations || [])
        setUnreadCount(refreshInboxData.unreadCount || 0)
      }
    } catch (err: any) {
      console.error('[Instagram Inbox] Error sending message:', err)
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp_')))
      // Toast already shown above, don't show alert
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
        credentials: 'include', // Ensure cookies are sent with the request
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        
        // Check for Instagram auth error
        if (errorData.error?.type === 'instagram_auth') {
          setAuthError({
            code: errorData.error.code,
            message: errorData.error.message,
          })
          return
        }
        
        throw new Error(errorData.error?.message || errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      
      // Check for auth error in response
      if (data.error?.type === 'instagram_auth') {
        setAuthError({
          code: data.error.code,
          message: data.error.message,
        })
        return
      }
      
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

  // Handle refresh identities
  const handleRefreshIdentities = async () => {
    setRefreshingIdentities(true)
    try {
      const response = await fetch(`/api/social/instagram/inbox/backfill-identities?locationId=${locationId}`, {
        method: 'POST',
        credentials: 'include', // Ensure cookies are sent with the request
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        
        // Check for Instagram auth error
        if (errorData.error?.type === 'instagram_auth') {
          setAuthError({
            code: errorData.error.code,
            message: errorData.error.message,
          })
          return
        }
        
        throw new Error(errorData.error?.message || errorData.error || `HTTP ${response.status}`)
      }

      const data = await response.json()
      console.log('[Instagram Inbox] Identity refresh completed:', data)
      
      // Show success message
      const message = `Refreshed Instagram identities (${data.updated || 0} updated, ${data.failed || 0} failed)`
      alert(message)
      
      // Refresh inbox to show updated identities
      await fetchInbox()
    } catch (err: any) {
      console.error('[Instagram Inbox] Error refreshing identities:', err)
      alert(`Refresh failed: ${err.message}`)
    } finally {
      setRefreshingIdentities(false)
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
    <div className="h-full flex flex-col">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {/* Token Expiry Banner - Only show for non-EXPIRED errors */}
      {authError && authError.code !== 'EXPIRED' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3 mb-4 flex-shrink-0">
          <InfoIcon sx={{ fontSize: 20, color: '#d97706', flexShrink: 0, mt: 0.5 }} />
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-900 mb-1">
              Instagram Connection Issue
            </p>
            <p className="text-sm text-yellow-700 mb-2">
              {authError.message || 'There was an issue with your Instagram connection.'}
            </p>
            <a
              href={`/api/integrations/instagram/connect?business_location_id=${locationId}&return_to=${encodeURIComponent(window.location.pathname + window.location.search)}`}
              className="text-sm text-yellow-900 underline hover:text-yellow-800"
            >
              Reconnect Instagram Account
            </a>
          </div>
        </div>
      )}
      
      {/* Auto-reconnecting indicator */}
      {authError && authError.code === 'EXPIRED' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3 mb-4 flex-shrink-0">
          <InfoIcon sx={{ fontSize: 20, color: '#2563eb', flexShrink: 0, mt: 0.5 }} />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-900 mb-1">
              Reconnecting Instagram Account
            </p>
            <p className="text-sm text-blue-700">
              Your Instagram connection has expired. Redirecting to reconnect automatically...
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <MessageIcon sx={{ fontSize: 24 }} />
            Direct Messages
            {unreadCount > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs font-semibold rounded-full px-2 py-1 min-w-[20px] text-center">
                {unreadCount}
              </span>
            )}
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
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
                      {/* Avatar with notification badge */}
                      <div className="relative">
                        {conv.avatarUrl ? (
                          <img
                            src={conv.avatarUrl}
                            alt={conv.displayName}
                            className="w-10 h-10 rounded-full object-cover"
                            referrerPolicy="no-referrer"
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
                        {/* Red notification badge over avatar */}
                        {conv.unreadCount > 0 && (
                          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-semibold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white shadow-sm">
                            {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {conv.username ? `@${conv.username}` : conv.displayName}
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
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Messages Thread */}
          <div className="lg:col-span-2 flex flex-col min-h-0">
            {selectedConversationId ? (
              <>
                {/* Header */}
                <div className="border-b border-slate-200 pb-3 mb-4 flex-shrink-0">
                  {(() => {
                    const conv = conversations.find(c => c.id === selectedConversationId)
                    return conv ? (
                      <div className="flex items-center gap-3">
                        {conv.avatarUrl ? (
                          <img
                            src={conv.avatarUrl}
                            alt={conv.displayName}
                            className="w-10 h-10 rounded-full object-cover"
                            referrerPolicy="no-referrer"
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
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {conv.username ? `@${conv.username}` : conv.displayName}
                          </p>
                          {conv.username && conv.displayName !== `@${conv.username}` && (
                            <p className="text-xs text-slate-500">{conv.displayName}</p>
                          )}
                        </div>
                      </div>
                    ) : null
                  })()}
                </div>

                {/* Messages - Scrollable container */}
                <div 
                  ref={messagesContainerRef}
                  className="flex-1 overflow-y-auto space-y-4 pr-2"
                  style={{ minHeight: 0 }}
                >
                  {messages.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-8">No messages in this conversation</p>
                  ) : (
                    (() => {
                      console.log('[Instagram Inbox] Rendering messages:', {
                        totalCount: messages.length,
                        outboundCount: messages.filter(m => m.direction === 'outbound').length,
                        inboundCount: messages.filter(m => m.direction === 'inbound').length,
                        messages: messages.map(m => ({ id: m.id, direction: m.direction, text: m.text?.substring(0, 50) })),
                      })
                      return (
                        <>
                          {Object.entries(groupMessagesByDay(messages)).map(([date, dayMessages]) => (
                            <div key={date}>
                              <div className="text-center text-xs text-slate-400 mb-2">{date}</div>
                              {dayMessages.map((message) => {
                                const isOutbound = message.direction === 'outbound'
                                console.log('[Instagram Inbox] Rendering message:', {
                                  id: message.id,
                                  direction: message.direction,
                                  isOutbound,
                                  text: message.text?.substring(0, 50),
                                })
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
                                      referrerPolicy="no-referrer"
                                      onError={(e) => {
                                        const target = e.target as HTMLImageElement
                                        target.style.display = 'none'
                                        if (target.nextElementSibling) {
                                          (target.nextElementSibling as HTMLElement).style.display = 'flex'
                                        }
                                      }}
                                    />
                                  ) : null}
                                  <div className={`w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs text-slate-600 ${message.avatarUrl ? 'hidden' : ''}`}>
                                    {message.displayName.charAt(0)?.toUpperCase() || '?'}
                                  </div>
                                  
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
                          ))}
                          <div ref={messagesEndRef} />
                        </>
                      )
                    })()
                  )}
                </div>

                {/* Composer - Sticky at bottom */}
                <div className="border-t border-slate-200 pt-4 flex-shrink-0 bg-white">
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

