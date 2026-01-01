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

    // Get conversation to get participant ID
    const { data: conversation } = await (supabase
      .from('instagram_conversations') as any)
      .select('participant_ig_user_id, business_location_id')
      .eq('business_location_id', locationId)
      .eq('conversation_id', conversationId)
      .maybeSingle()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Get Instagram connection
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('access_token, instagram_user_id')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection || !connection.access_token) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    // Create API client and send message
    const api = await InstagramAPI.create(locationId)

    if ('type' in api) {
      return NextResponse.json({ error: api.message }, { status: 400 })
    }

    const recipientId = conversation.participant_ig_user_id
    const sendResult = await api.sendMessage(recipientId, text.trim())

    if ('type' in sendResult) {
      return NextResponse.json({
        error: sendResult.message,
        code: sendResult.code,
      }, { status: sendResult.type === 'APIError' ? sendResult.status : 500 })
    }

    // Insert outbound message into database
    const messageId = sendResult.id || `msg_${Date.now()}_${Math.random()}`
    const messageTime = new Date().toISOString()

    await (supabase
      .from('instagram_messages') as any)
      .insert({
        business_location_id: locationId,
        conversation_id: conversationId,
        message_id: messageId,
        direction: 'outbound',
        from_id: connection.instagram_user_id,
        to_id: recipientId,
        text: text.trim(),
        created_time: messageTime,
        raw_payload: { id: messageId },
      })

    // Update conversation metadata
    await (supabase
      .from('instagram_conversations') as any)
      .update({
        updated_time: messageTime,
        last_message_text: text.trim(),
        last_message_time: messageTime,
      })
      .eq('business_location_id', locationId)
      .eq('conversation_id', conversationId)

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

