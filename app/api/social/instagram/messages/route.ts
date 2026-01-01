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

    // Get conversations from DM cache tables
    // If conversationId is provided, filter to that conversation
    let conversationsQuery = (supabase
      .from('instagram_dm_conversations') as any)
      .select('thread_key, last_message_at')
      .eq('business_location_id', locationId)
      .eq('ig_account_id', connection.instagram_user_id)
    
    if (conversationId) {
      conversationsQuery = conversationsQuery.eq('thread_key', conversationId)
    }
    
    const { data: conversations } = await conversationsQuery
      .order('last_message_at', { ascending: false })
      .limit(conversationId ? 1 : 50)

    // Get messages for each conversation (limit to last 20 per thread)
    const threadKeys = (conversations || []).map((c: any) => c.thread_key)
    const { data: allMessages } = await (supabase
      .from('instagram_dm_messages') as any)
      .select('thread_key, message_mid, sender_id, recipient_id, message_text, timestamp_ms, attachments')
      .eq('business_location_id', locationId)
      .eq('ig_account_id', connection.instagram_user_id)
      .in('thread_key', threadKeys.length > 0 ? threadKeys : [''])
      .order('timestamp_ms', { ascending: false })
      .limit(1000) // Get more messages, then limit per thread
    
    // Group messages by thread and limit to last 20 per thread
    const messagesByThread: Record<string, any[]> = {}
    ;(allMessages || []).forEach((m: any) => {
      if (!messagesByThread[m.thread_key]) {
        messagesByThread[m.thread_key] = []
      }
      if (messagesByThread[m.thread_key].length < 20) {
        messagesByThread[m.thread_key].push(m)
      }
    })

    // Check if messaging is enabled (has webhook events or permission)
    const hasConversations = conversations && conversations.length > 0
    const hasMessages = allMessages && allMessages.length > 0

    // Get webhook status (separate query to avoid variable name conflict)
    const { data: webhookState } = await (supabase
      .from('instagram_sync_state') as any)
      .select('webhook_verified_at, last_webhook_event_at')
      .eq('business_location_id', locationId)
      .maybeSingle()

    const hasWebhookConfigured = !!webhookState?.webhook_verified_at

    if (!hasMessagesPermission && !hasWebhookConfigured && !hasConversations && !hasMessages) {
      return NextResponse.json({
        enabled: false,
        conversations: [],
        unreadCount: 0,
        note: 'Messaging requires instagram_business_manage_messages permission and webhook setup',
      })
    }

    // Format conversations with messages
    // Note: We don't have participant username in the new schema, so we'll use sender_id
    const formattedConversations = (conversations || []).map((conv: any) => {
      const threadMessages = (messagesByThread[conv.thread_key] || []).sort((a: any, b: any) => 
        a.timestamp_ms - b.timestamp_ms // Sort ascending for display (oldest first)
      )
      const lastMessage = threadMessages.length > 0 ? threadMessages[threadMessages.length - 1] : null
      
      // Determine participant (the other user in the thread)
      const participantId = lastMessage 
        ? (lastMessage.sender_id === connection.instagram_user_id 
            ? lastMessage.recipient_id 
            : lastMessage.sender_id)
        : 'unknown'

      return {
        conversationId: conv.thread_key,
        participantId,
        participantUsername: `@user_${participantId.slice(-6)}`, // Fallback since we don't have username
        updatedTime: conv.last_message_at,
        unreadCount: 0, // Not tracking unread in new schema yet
        lastMessageText: lastMessage?.message_text || null,
        lastMessageTime: lastMessage ? new Date(lastMessage.timestamp_ms).toISOString() : null,
        messages: threadMessages.map((m: any) => ({
          id: m.message_mid || `msg_${m.timestamp_ms}`,
          direction: m.sender_id === connection.instagram_user_id ? 'outbound' : 'inbound',
          fromId: m.sender_id,
          toId: m.recipient_id,
          text: m.message_text || '',
          timestamp: new Date(m.timestamp_ms).toISOString(),
          attachments: m.attachments,
        })),
      }
    })

    return NextResponse.json({
      enabled: true,
      conversations: formattedConversations,
      unreadCount: 0, // Not tracking unread in new schema yet
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

