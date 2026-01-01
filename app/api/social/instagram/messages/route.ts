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

    // Get conversations from cached DB
    const { data: conversations } = await (supabase
      .from('instagram_conversations') as any)
      .select('conversation_id, participant_username, updated_time, unread_count, last_message_text, last_message_time')
      .eq('business_location_id', locationId)
      .order('updated_time', { ascending: false })
      .limit(50)

    // Get messages for each conversation
    const conversationIds = (conversations || []).map((c: any) => c.conversation_id)
    const { data: messages } = await (supabase
      .from('instagram_messages') as any)
      .select('conversation_id, message_id, direction, from_id, to_id, text, created_time')
      .eq('business_location_id', locationId)
      .in('conversation_id', conversationIds.length > 0 ? conversationIds : [''])
      .order('created_time', { ascending: false })
      .limit(200)

    // Group messages by conversation
    const messagesByConversation: Record<string, any[]> = {}
    ;(messages || []).forEach((m: any) => {
      if (!messagesByConversation[m.conversation_id]) {
        messagesByConversation[m.conversation_id] = []
      }
      messagesByConversation[m.conversation_id].push(m)
    })

    // Check if messaging is enabled
    const hasConversations = conversations && conversations.length > 0
    const hasMessages = messages && messages.length > 0

    if (!hasMessagesPermission && !hasConversations && !hasMessages) {
      return NextResponse.json({
        enabled: false,
        conversations: [],
        unreadCount: 0,
        note: 'Messaging requires instagram_business_manage_messages permission and webhook setup',
      })
    }

    // Calculate total unread count
    const unreadCount = (conversations || []).reduce((sum: number, c: any) => sum + (c.unread_count || 0), 0)

    // Format conversations with messages
    const formattedConversations = (conversations || []).map((conv: any) => ({
      conversationId: conv.conversation_id,
      participantUsername: conv.participant_username || 'Unknown',
      updatedTime: conv.updated_time,
      unreadCount: conv.unread_count || 0,
      lastMessageText: conv.last_message_text,
      lastMessageTime: conv.last_message_time,
      messages: (messagesByConversation[conv.conversation_id] || []).map((m: any) => ({
        id: m.message_id,
        direction: m.direction,
        fromId: m.from_id,
        toId: m.to_id,
        text: m.text || '',
        timestamp: m.created_time,
      })),
    }))

    return NextResponse.json({
      enabled: true,
      conversations: formattedConversations,
      unreadCount,
    })
  } catch (error: any) {
    console.error('[Instagram Messages API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

