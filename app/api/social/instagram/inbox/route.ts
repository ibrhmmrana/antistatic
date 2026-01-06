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

    // Get Instagram connection to get ig_account_id and business account IGSID
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('instagram_user_id, instagram_username')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    const igAccountId = connection.instagram_user_id
    
    // Get the business account's IGSID from user cache (for identifying outbound messages)
    let businessAccountIgsid: string | null = null
    if (connection.instagram_username) {
      const { data: businessAccountCache } = await (supabase
        .from('instagram_user_cache') as any)
        .select('ig_user_id')
        .eq('ig_account_id', igAccountId)
        .eq('username', connection.instagram_username)
        .maybeSingle()
      
      if (businessAccountCache) {
        businessAccountIgsid = businessAccountCache.ig_user_id
      }
    }

    // Fetch conversations (include is_group and participant_count for group chat support)
    let conversationsQuery = (supabase
      .from('instagram_conversations') as any)
      .select('id, participant_igsid, is_group, participant_count, updated_time, last_message_preview, last_message_at, unread_count')
      .eq('ig_account_id', igAccountId)
      .order('last_message_at', { ascending: false })

    if (conversationId) {
      conversationsQuery = conversationsQuery.eq('id', conversationId)
    }

    const { data: conversations, error: convError } = await conversationsQuery

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/route.ts:84',message:'Conversations query result',data:{igAccountId,conversationCount:conversations?.length||0,participant_igsids:(conversations||[]).map((c:any)=>c.participant_igsid),uniqueParticipantIds:Array.from(new Set((conversations||[]).map((c:any)=>c.participant_igsid).filter(Boolean)))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

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

    // Fetch user cache for all participants (exclude UNKNOWN_ placeholders and GROUP: synthetic values)
    const participantIds = (conversations || [])
      .map((c: any) => c.participant_igsid)
      .filter((id: string | null) => id && !id.startsWith('UNKNOWN_') && !id.startsWith('GROUP:'))
    const userCacheMap: Record<string, any> = {}

    if (participantIds.length > 0) {
      console.log('[Instagram Inbox API] Looking up user cache for participants:', {
        participantIds,
        igAccountId,
      })

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/route.ts:121',message:'Before cache query',data:{participantIds,igAccountId,participantIdsCount:participantIds.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      const { data: userCache, error: cacheError } = await (supabase
        .from('instagram_user_cache') as any)
        .select('ig_user_id, username, name, profile_pic, profile_pic_url')
        .eq('ig_account_id', igAccountId)
        .in('ig_user_id', participantIds)

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/route.ts:127',message:'Cache query result',data:{participantIds,igAccountId,cacheCount:userCache?.length||0,hasError:!!cacheError,cacheEntries:userCache?.map((c:any)=>({ig_user_id:c.ig_user_id,username:c.username}))||[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      if (cacheError) {
        console.error('[Instagram Inbox API] Error fetching user cache:', cacheError)
      } else {
        console.log('[Instagram Inbox API] Found user cache entries:', {
          count: userCache?.length || 0,
          entries: (userCache || []).map((c: any) => ({
            ig_user_id: c.ig_user_id,
            username: c.username,
            name: c.name,
            hasProfilePic: !!c.profile_pic,
          })),
        })

        if (userCache) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/route.ts:144',message:'Building userCacheMap',data:{cacheEntries:userCache.map((c:any)=>({ig_user_id:c.ig_user_id,username:c.username})),mapKeys:Object.keys(userCacheMap)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          userCache.forEach((cache: any) => {
            userCacheMap[cache.ig_user_id] = cache
          })
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/route.ts:149',message:'After building userCacheMap',data:{mapKeys:Object.keys(userCacheMap),mapEntries:Object.entries(userCacheMap).map(([k,v]:[string,any])=>({key:k,username:v.username}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
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

    // Fetch user cache for all message senders (for group chats)
    const senderIds = new Set<string>()
    ;(messages || []).forEach((msg: any) => {
      if (msg.from_id) senderIds.add(msg.from_id)
    })
    const senderCacheMap: Record<string, any> = {}
    if (senderIds.size > 0) {
      const { data: senderCache } = await (supabase
        .from('instagram_user_cache') as any)
        .select('ig_user_id, username, name, profile_pic, profile_pic_url')
        .eq('ig_account_id', igAccountId)
        .in('ig_user_id', Array.from(senderIds))
      
      if (senderCache) {
        senderCache.forEach((cache: any) => {
          senderCacheMap[cache.ig_user_id] = cache
        })
      }
    }

    // Format response
    const formattedConversations = (conversations || []).map((conv: any) => {
      const isGroup = conv.is_group || false
      const participantCount = conv.participant_count || 2
      
      // For group chats, show "Group chat (N)" label
      // For 1:1 chats, show participant username/name
      let displayName: string
      let avatarUrl: string | null = null
      
      if (isGroup) {
        displayName = `Group chat (${participantCount})`
        // Group chats don't have a single avatar - use sender avatars in thread
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/route.ts:223',message:'Before cache lookup',data:{conversationId:conv.id,participant_igsid:conv.participant_igsid,userCacheMapKeys:Object.keys(userCacheMap),hasKey:conv.participant_igsid in userCacheMap},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        const participantCache = userCacheMap[conv.participant_igsid] || {}
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/route.ts:228',message:'Cache lookup result',data:{conversationId:conv.id,participant_igsid:conv.participant_igsid,foundCache:!!participantCache.username,cacheUsername:participantCache.username,cacheName:participantCache.name},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        console.log('[Instagram Inbox API] Formatting conversation:', {
          conversationId: conv.id,
          participantIgsid: conv.participant_igsid,
          hasCache: !!participantCache.username || !!participantCache.name,
          cacheData: participantCache,
        })
        
        // Prefer username, then name, then fallback
        if (participantCache.username) {
          displayName = `@${participantCache.username}`
        } else if (participantCache.name) {
          displayName = participantCache.name
        } else if (conv.participant_igsid && !conv.participant_igsid.startsWith('UNKNOWN_') && !conv.participant_igsid.startsWith('GROUP:')) {
          displayName = `user_${conv.participant_igsid.slice(-6)}`
        } else {
          displayName = 'Unknown User'
        }
        // Normalize profile pic: prefer profile_pic_url, fallback to profile_pic
        avatarUrl = participantCache.profile_pic_url || participantCache.profile_pic || null
        
        // Step 1: Debug log to verify if URLs exist but aren't rendering
        console.log('[Instagram Inbox API] Participant profile pic debug:', {
          participantIgsid: conv.participant_igsid,
          username: participantCache.username,
          profile_pic: participantCache.profile_pic,
          profile_pic_url: participantCache.profile_pic_url,
          avatarUrl,
          hasProfilePic: !!avatarUrl,
        })
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox/route.ts:197',message:'Formatted conversation',data:{conversationId:conv.id,participantIgsid:conv.participant_igsid,displayName,avatarUrl,hasUsername:!!participantCache.username,hasName:!!participantCache.name,hasProfilePic:!!participantCache.profile_pic,cacheKeys:Object.keys(participantCache)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
      }

      const conversationMessages = messagesByConversation[conv.id] || []

      return {
        id: conv.id,
        participantIgsid: conv.participant_igsid,
        isGroup,
        participantCount,
        displayName,
        avatarUrl,
        username: isGroup ? null : (userCacheMap[conv.participant_igsid]?.username || null),
        lastMessagePreview: conv.last_message_preview,
        lastMessageAt: conv.last_message_at,
        unreadCount: conv.unread_count || 0,
        updatedTime: conv.updated_time,
        messages: conversationMessages.map((msg: any) => {
          // Determine if this is an outbound message
          // Check both the direction field and compare from_id with business account IGSID
          const isOutbound = msg.direction === 'outbound' || 
            (businessAccountIgsid && msg.from_id === businessAccountIgsid) ||
            (!businessAccountIgsid && msg.from_id === igAccountId) // Fallback for old messages
          
          // For group chats, use sender cache; for 1:1, use participant cache
          const senderCache = isGroup ? senderCacheMap[msg.from_id] : userCacheMap[msg.from_id] || {}
          
          // Prefer username, then name, then fallback
          // For outbound messages, we'll show "You" in the UI
          const senderDisplayName = isOutbound
            ? 'You'
            : senderCache.username 
            ? `@${senderCache.username}` 
            : senderCache.name 
            ? senderCache.name
            : `user_${msg.from_id.slice(-6)}`
          
          return {
            id: msg.id,
            direction: isOutbound ? 'outbound' : 'inbound', // Ensure direction is correct
            fromId: msg.from_id,
            toId: msg.to_id,
            text: msg.text || '',
            attachments: msg.attachments,
            createdTime: msg.created_time,
            readAt: msg.read_at,
            displayName: senderDisplayName,
            avatarUrl: isOutbound ? null : (senderCache.profile_pic_url || senderCache.profile_pic || null), // Don't show avatar for outbound, use sender avatar for inbound
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

    console.log('[Instagram Inbox API] Returning formatted conversations:', {
      count: formattedConversations.length,
      conversations: formattedConversations.map((c: any) => ({
        id: c.id,
        displayName: c.displayName,
        username: c.username,
        hasAvatar: !!c.avatarUrl,
      })),
    })

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

