import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InstagramAPI } from '@/lib/instagram/api'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/social/instagram/messages/send
 * 
 * Send a Direct Message via Instagram Messaging API
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { locationId, conversationId, text } = body

    if (!locationId || !conversationId || !text) {
      return NextResponse.json({ error: 'Missing required fields: locationId, conversationId, text' }, { status: 400 })
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

    // Get Instagram connection first
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('access_token, instagram_user_id')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection || !connection.access_token) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    // Get conversation to verify it exists (using new DM tables)
    const { data: conversation } = await (supabase
      .from('instagram_dm_conversations') as any)
      .select('thread_key, ig_account_id, business_location_id')
      .eq('business_location_id', locationId)
      .eq('ig_account_id', connection.instagram_user_id)
      .eq('thread_key', conversationId)
      .maybeSingle()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Get the most recent message to determine participant
    const { data: lastMessage } = await (supabase
      .from('instagram_dm_messages') as any)
      .select('sender_id, recipient_id')
      .eq('business_location_id', locationId)
      .eq('ig_account_id', connection.instagram_user_id)
      .eq('thread_key', conversationId)
      .order('timestamp_ms', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!lastMessage) {
      return NextResponse.json({ error: 'Cannot determine conversation participant' }, { status: 404 })
    }

    // Determine recipient (the other user in the thread)
    const recipientId = lastMessage.sender_id === connection.instagram_user_id 
      ? lastMessage.recipient_id 
      : lastMessage.sender_id

    // Create API client and send message
    const api = await InstagramAPI.create(locationId)

    if ('type' in api) {
      return NextResponse.json({ error: api.message }, { status: 400 })
    }

    const sendResult = await api.sendMessage(recipientId, text.trim())

    if ('type' in sendResult) {
      const errorResponse: any = {
        error: sendResult.message,
      }
      
      // Only include code if it's an APIError
      if (sendResult.type === 'APIError' && sendResult.code) {
        errorResponse.code = sendResult.code
      }
      
      return NextResponse.json(
        errorResponse,
        { status: sendResult.type === 'APIError' ? sendResult.status : 500 }
      )
    }

    // Insert outbound message into database (using new DM tables)
    const messageId = sendResult.id || `msg_${Date.now()}_${Math.random()}`
    const messageTime = Date.now()

    await (supabase
      .from('instagram_dm_messages') as any)
      .insert({
        business_location_id: locationId,
        ig_account_id: connection.instagram_user_id,
        thread_key: conversationId,
        message_mid: messageId,
        sender_id: connection.instagram_user_id,
        recipient_id: recipientId,
        message_text: text.trim(),
        timestamp_ms: messageTime,
        raw_event: { id: messageId, text: text.trim() },
      })

    // Update conversation metadata
    await (supabase
      .from('instagram_dm_conversations') as any)
      .update({
        last_message_at: new Date(messageTime).toISOString(),
      })
      .eq('business_location_id', locationId)
      .eq('ig_account_id', connection.instagram_user_id)
      .eq('thread_key', conversationId)

    return NextResponse.json({
      success: true,
      messageId,
    })
  } catch (error: any) {
    console.error('[Instagram Send Message] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

