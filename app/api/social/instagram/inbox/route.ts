import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InstagramAuthError } from '@/lib/instagram/tokens'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/social/instagram/inbox?locationId={id}&conversationId={id}
 * 
 * Fetch Instagram inbox conversations and messages
 * Uses the new instagram_conversations and instagram_messages tables
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const locationId = requestUrl.searchParams.get('locationId')
    const conversationId = requestUrl.searchParams.get('conversationId')

    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify location belongs to user
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Get Instagram connection to get ig_account_id
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('instagram_user_id')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    const igAccountId = connection.instagram_user_id

    // Fetch conversations
    let conversationsQuery = (supabase
      .from('instagram_conversations') as any)
      .select('id, participant_igsid, updated_time, last_message_preview, last_message_at, unread_count')
      .eq('ig_account_id', igAccountId)
      .order('last_message_at', { ascending: false })

    if (conversationId) {
      conversationsQuery = conversationsQuery.eq('id', conversationId)
    }

    const { data: conversations, error: convError } = await conversationsQuery

    if (convError) {
      console.error('[Instagram Inbox API] Error fetching conversations:', convError)
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
    }

    console.log('[Instagram Inbox API] Fetched conversations:', {
      count: conversations?.length || 0,
      igAccountId,
      locationId,
      conversationIds: (conversations || []).map((c: any) => c.id),
      participantIds: (conversations || []).map((c: any) => c.participant_igsid),
      rawConversations: conversations,
    })
    
    // If no conversations found, log a helpful message
    if (!conversations || conversations.length === 0) {
      console.warn('[Instagram Inbox API] No conversations found. Possible reasons:', {
        igAccountId,
        locationId,
        suggestion: 'Run inbox sync to fetch conversations from Instagram API',
      })
    }

    // Fetch user cache for all participants (exclude UNKNOWN_ placeholders)
    const participantIds = (conversations || [])
      .map((c: any) => c.participant_igsid)
      .filter((id: string | null) => id && !id.startsWith('UNKNOWN_'))
    const userCacheMap: Record<string, any> = {}

    if (participantIds.length > 0) {
      console.log('[Instagram Inbox API] Looking up user cache for participants:', {
        participantIds,
        igAccountId,
      })

      const { data: userCache, error: cacheError } = await (supabase
        .from('instagram_user_cache') as any)
        .select('ig_user_id, username, name, profile_pic')
        .eq('ig_account_id', igAccountId)
        .in('ig_user_id', participantIds)

      if (cacheError) {
        console.error('[Instagram Inbox API] Error fetching user cache:', cacheError)
      } else {
        console.log('[Instagram Inbox API] Found user cache entries:', {
          count: userCache?.length || 0,
          entries: (userCache || []).map((c: any) => ({
            ig_user_id: c.ig_user_id,
            username: c.username,
            hasProfilePic: !!c.profile_pic,
          })),
        })

        if (userCache) {
          userCache.forEach((cache: any) => {
            userCacheMap[cache.ig_user_id] = cache
          })
        }
      }
    } else {
      console.log('[Instagram Inbox API] No participant IDs to look up')
    }

    // Fetch messages for conversations
    const conversationIds = (conversations || []).map((c: any) => c.id)
    let messagesQuery = (supabase
      .from('instagram_messages') as any)
      .select('id, conversation_id, direction, from_id, to_id, text, attachments, created_time, read_at')
      .eq('ig_account_id', igAccountId)
      .in('conversation_id', conversationIds)
      .order('created_time', { ascending: true })

    if (conversationId) {
      messagesQuery = messagesQuery.eq('conversation_id', conversationId)
    }

    const { data: messages, error: msgError } = await messagesQuery

    if (msgError) {
      console.error('[Instagram Inbox API] Error fetching messages:', msgError)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    // Group messages by conversation
    const messagesByConversation: Record<string, any[]> = {}
    ;(messages || []).forEach((msg: any) => {
      if (!messagesByConversation[msg.conversation_id]) {
        messagesByConversation[msg.conversation_id] = []
      }
      messagesByConversation[msg.conversation_id].push(msg)
    })

    console.log('[Instagram Inbox API] Fetched messages:', {
      count: messages?.length || 0,
      conversationIds: conversationIds,
      messagesByConversation: Object.keys(messagesByConversation).length,
    })

    // Format response
    const formattedConversations = (conversations || []).map((conv: any) => {
      const participantCache = userCacheMap[conv.participant_igsid] || {}
      
      console.log('[Instagram Inbox API] Formatting conversation:', {
        conversationId: conv.id,
        participantIgsid: conv.participant_igsid,
        hasCache: !!participantCache.username || !!participantCache.name,
        cacheData: participantCache,
      })
      
      // Prefer username, then name, then fallback
      let displayName: string
      if (participantCache.username) {
        displayName = `@${participantCache.username}`
      } else if (participantCache.name) {
        displayName = participantCache.name
      } else if (conv.participant_igsid && !conv.participant_igsid.startsWith('UNKNOWN_')) {
        displayName = `user_${conv.participant_igsid.slice(-6)}`
      } else {
        displayName = 'Unknown User'
      }
      const avatarUrl = participantCache.profile_pic || null

      const conversationMessages = messagesByConversation[conv.id] || []

      return {
        id: conv.id,
        participantIgsid: conv.participant_igsid,
        displayName,
        avatarUrl,
        username: participantCache.username || null,
        lastMessagePreview: conv.last_message_preview,
        lastMessageAt: conv.last_message_at,
        unreadCount: conv.unread_count || 0,
        updatedTime: conv.updated_time,
        messages: conversationMessages.map((msg: any) => {
          const senderCache = userCacheMap[msg.from_id] || {}
          // Prefer username, then name, then fallback
          const senderDisplayName = senderCache.username 
            ? `@${senderCache.username}` 
            : senderCache.name 
            ? senderCache.name
            : `user_${msg.from_id.slice(-6)}`
          return {
            id: msg.id,
            direction: msg.direction,
            fromId: msg.from_id,
            toId: msg.to_id,
            text: msg.text || '',
            attachments: msg.attachments,
            createdTime: msg.created_time,
            readAt: msg.read_at,
            displayName: senderDisplayName,
            avatarUrl: senderCache.profile_pic || null,
          }
        }),
      }
    })

    console.log('[Instagram Inbox API] Returning formatted conversations:', {
      count: formattedConversations.length,
      conversations: formattedConversations.map((c: any) => ({
        id: c.id,
        displayName: c.displayName,
        username: c.username,
        hasAvatar: !!c.avatarUrl,
        messageCount: c.messages.length,
      })),
    })

    // Calculate total unread count
    const totalUnread = formattedConversations.reduce((sum: number, conv: any) => sum + (conv.unreadCount || 0), 0)

    return NextResponse.json({
      conversations: formattedConversations,
      unreadCount: totalUnread,
    })
  } catch (error: any) {
    console.error('[Instagram Inbox API] Error:', error)
    
    if (error instanceof InstagramAuthError) {
      return NextResponse.json(
        {
          error: {
            type: 'instagram_auth',
            code: error.code,
            message: error.message,
          },
        },
        { status: 401 }
      )
    }
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

