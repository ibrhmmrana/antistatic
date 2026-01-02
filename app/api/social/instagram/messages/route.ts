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
    // Note: We query by business_location_id only, since ig_user_id might not match
    // the webhook's igAccountId (could be page-scoped ID vs user ID)
    const { data: events, error: eventsError } = await (supabase
      .from('instagram_dm_events') as any)
      .select('id, sender_id, recipient_id, message_id, text, timestamp, raw, ig_user_id')
      .eq('business_location_id', locationId)
      .order('created_at', { ascending: false })
      .limit(50)
    
    if (eventsError) {
      console.error('[Instagram Messages API] Error fetching events:', eventsError)
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
    // Also check the event's ig_user_id in case it's different
    const ourUserIdFromEvents = events?.[0]?.ig_user_id

    ;(events || []).forEach((event: any) => {
      // Determine if this message is from us or to us
      // Check both our stored user ID and the event's stored user ID
      const isFromUs = event.sender_id === ourUserId || 
                       (ourUserIdFromEvents && event.sender_id === ourUserIdFromEvents) ||
                       event.ig_user_id === ourUserId ||
                       (ourUserIdFromEvents && event.ig_user_id === ourUserIdFromEvents)
      
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
          // Determine direction more accurately
          const isFromUs = e.sender_id === ourUserId || 
                           (ourUserIdFromEvents && e.sender_id === ourUserIdFromEvents) ||
                           e.ig_user_id === ourUserId ||
                           (ourUserIdFromEvents && e.ig_user_id === ourUserIdFromEvents)
          
          return {
            id: e.message_id || e.id,
            direction: isFromUs ? 'outbound' : 'inbound',
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

    return NextResponse.json({
      enabled: true,
      conversations: filteredConversations,
      unreadCount: 0,
      hasWebhookConfigured,
      lastWebhookEventAt: webhookState?.last_webhook_event_at || null,
    })
  } catch (error: any) {
    console.error('[Instagram Messages API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

