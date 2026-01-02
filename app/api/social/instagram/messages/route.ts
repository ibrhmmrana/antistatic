import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/social/instagram/messages
 * 
 * Fetch Instagram Direct Messages (DMs)
 * Feature-gated: Returns enabled: false if messages API is not available
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const locationId = requestUrl.searchParams.get('locationId')
    const conversationId = requestUrl.searchParams.get('conversationId') // Optional: fetch specific conversation

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

    // Get Instagram connection
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('access_token, instagram_user_id, scopes')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection || !connection.access_token) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    // Get sync state to check granted scopes
    const { data: syncState } = await (supabase
      .from('instagram_sync_state') as any)
      .select('granted_scopes_list')
      .eq('business_location_id', locationId)
      .maybeSingle()

    const grantedScopes = syncState?.granted_scopes_list || connection.scopes || []
    const hasMessagesPermission = grantedScopes.some((s: string) => s.includes('instagram_business_manage_messages'))

    // Get webhook status
    const { data: webhookState } = await (supabase
      .from('instagram_sync_state') as any)
      .select('webhook_verified_at, last_webhook_event_at')
      .eq('business_location_id', locationId)
      .maybeSingle()

    const hasWebhookConfigured = !!webhookState?.webhook_verified_at

    // Read from instagram_dm_events table (latest 50 messages)
    // Query by business_location_id and order by timestamp (most recent first)
    const { data: events, error: eventsError } = await (supabase
      .from('instagram_dm_events') as any)
      .select('id, sender_id, recipient_id, message_id, text, timestamp, raw, ig_user_id, created_at')
      .eq('business_location_id', locationId)
      .order('timestamp', { ascending: false })
      .limit(50)
    
    if (eventsError) {
      console.error('[Instagram Messages API] Error fetching events:', {
        message: eventsError.message,
        code: eventsError.code,
        details: eventsError.details,
        hint: eventsError.hint,
      })
    } else {
      console.log('[Instagram Messages API] Fetched events:', {
        count: events?.length || 0,
        locationId,
        sampleEvent: events?.[0] ? {
          id: events[0].id,
          sender_id: events[0].sender_id,
          recipient_id: events[0].recipient_id,
          hasText: !!events[0].text,
          timestamp: events[0].timestamp,
        } : null,
      })
    }

    const hasMessages = events && events.length > 0

    // Check if messaging is enabled
    // Enabled if: has permission AND (webhook verified OR has stored messages)
    const enabled = hasMessagesPermission && (hasWebhookConfigured || hasMessages)

    if (!enabled) {
      return NextResponse.json({
        enabled: false,
        conversations: [],
        unreadCount: 0,
        note: hasMessagesPermission 
          ? 'No messages received yet — send a DM to this IG account to test.'
          : 'Messaging requires instagram_business_manage_messages permission and webhook setup',
      })
    }

    // Group events by conversation (sender/recipient pair)
    const conversationsMap: Record<string, any[]> = {}
    const ourUserId = connection.instagram_user_id
    // Also check the event's ig_user_id and recipient_id (webhook entry.id)
    const ourUserIdFromEvents = events?.[0]?.ig_user_id
    
    // Collect all possible "our" user IDs from events (recipient_id when we receive messages)
    const ourPossibleIds = new Set([ourUserId])
    if (ourUserIdFromEvents) ourPossibleIds.add(ourUserIdFromEvents)
    ;(events || []).forEach((e: any) => {
      // If recipient_id appears frequently, it might be our account ID
      if (e.recipient_id) ourPossibleIds.add(e.recipient_id)
      if (e.ig_user_id) ourPossibleIds.add(e.ig_user_id)
    })

    console.log('[Instagram Messages API] Our possible user IDs:', Array.from(ourPossibleIds))
    console.log('[Instagram Messages API] Events count:', events?.length || 0)

    ;(events || []).forEach((event: any) => {
      // Determine if this message is from us or to us
      // Check if sender_id OR recipient_id matches any of our possible IDs
      const isFromUs = ourPossibleIds.has(event.sender_id)
      const isToUs = ourPossibleIds.has(event.recipient_id)
      
      // Determine the other participant (not us)
      const otherParticipantId = isFromUs 
        ? event.recipient_id 
        : event.sender_id
      
      const conversationKey = otherParticipantId || 'unknown'
      
      if (!conversationsMap[conversationKey]) {
        conversationsMap[conversationKey] = []
      }
      conversationsMap[conversationKey].push(event)
    })

    // Format conversations with messages
    const formattedConversations = Object.entries(conversationsMap).map(([participantId, conversationEvents]) => {
      // Sort events by timestamp (oldest first for display)
      const sortedEvents = conversationEvents.sort((a: any, b: any) => 
        new Date(a.timestamp || a.created_at).getTime() - new Date(b.timestamp || b.created_at).getTime()
      )
      
      const lastEvent = sortedEvents[sortedEvents.length - 1]

      return {
        conversationId: participantId,
        participantId,
        participantUsername: `@user_${participantId.slice(-6)}`,
        updatedTime: lastEvent?.timestamp || lastEvent?.created_at,
        unreadCount: 0,
        lastMessageText: lastEvent?.text || null,
        lastMessageTime: lastEvent?.timestamp || lastEvent?.created_at || null,
        messages: sortedEvents.map((e: any) => {
          // Determine direction: check if sender_id matches any of our possible IDs
          const isFromUs = ourPossibleIds.has(e.sender_id)
          const isToUs = ourPossibleIds.has(e.recipient_id)
          
          // If neither matches, default to inbound (someone sent it to us)
          const direction = isFromUs ? 'outbound' : (isToUs ? 'inbound' : 'inbound')
          
          return {
            id: e.message_id || e.id,
            direction,
            fromId: e.sender_id,
            toId: e.recipient_id,
            text: e.text || '',
            timestamp: e.timestamp || e.created_at,
            attachments: e.raw?.message?.attachments || null,
          }
        }),
      }
    })

    // Sort conversations by last message time (newest first)
    formattedConversations.sort((a, b) => {
      const timeA = new Date(a.lastMessageTime || 0).getTime()
      const timeB = new Date(b.lastMessageTime || 0).getTime()
      return timeB - timeA
    })

    // If conversationId is provided, filter to that conversation
    const filteredConversations = conversationId
      ? formattedConversations.filter(c => c.conversationId === conversationId)
      : formattedConversations

    const response = {
      enabled: true,
      conversations: filteredConversations,
      unreadCount: 0,
      hasWebhookConfigured,
      lastWebhookEventAt: webhookState?.last_webhook_event_at || null,
    }
    
    console.log('[Instagram Messages API] Returning response:', {
      enabled: response.enabled,
      conversationsCount: response.conversations.length,
      unreadCount: response.unreadCount,
      hasWebhookConfigured: response.hasWebhookConfigured,
      sampleConversation: response.conversations[0] ? {
        conversationId: response.conversations[0].conversationId,
        participantId: response.conversations[0].participantId,
        messagesCount: response.conversations[0].messages.length,
        lastMessageText: response.conversations[0].lastMessageText,
      } : null,
    })
    
    return NextResponse.json(response)
  } catch (error: any) {
    console.error('[Instagram Messages API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

