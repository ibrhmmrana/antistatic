import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramAccessTokenForLocation, InstagramAuthError, isTokenExpiredError } from '@/lib/instagram/tokens'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/social/instagram/messages/send
 * 
 * Send a Direct Message via Instagram Messaging API
 * 
 * According to Instagram Messaging API docs:
 * - Endpoint: POST https://graph.instagram.com/vXX.X/<IG_ID>/messages
 * - Body: { recipient: { id: <IGSID> }, message: { text: "<TEXT>" } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { locationId, conversationId, text } = body

    if (!locationId || !conversationId || !text) {
      return NextResponse.json(
        { error: { type: 'validation', message: 'Missing required fields: locationId, conversationId, text' } },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: { type: 'auth', message: 'Unauthorized' } }, { status: 401 })
    }

    // Step 1: Verify location belongs to user
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: { type: 'not_found', message: 'Location not found' } }, { status: 404 })
    }

    // Step 2: Get Instagram connection to determine ig_account_id
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('instagram_user_id')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection) {
      return NextResponse.json(
        { error: { type: 'not_found', message: 'Instagram not connected' } },
        { status: 404 }
      )
    }

    const igAccountId = connection.instagram_user_id

    // Step 3: Fetch conversation row (with detailed logging)
    const { data: conversation, error: convError } = await (supabase
      .from('instagram_conversations') as any)
      .select('id, participant_igsid, ig_account_id')
      .eq('id', conversationId)
      .eq('ig_account_id', igAccountId)
      .maybeSingle()

    if (convError) {
      console.error('[Instagram Send Message] Conversation lookup error:', {
        conversationId,
        igAccountId,
        error: convError.message,
      })
      return NextResponse.json(
        { error: { type: 'database', message: 'Failed to lookup conversation' } },
        { status: 500 }
      )
    }

    if (!conversation) {
      console.warn('[Instagram Send Message] Conversation not found:', {
        conversationId,
        igAccountId,
        locationId,
      })
      return NextResponse.json(
        { error: { type: 'not_found', message: 'Conversation not found' } },
        { status: 404 }
      )
    }

    // Step 4: Get recipient IGSID from conversation
    const recipientIgsid = conversation.participant_igsid

    if (!recipientIgsid) {
      console.error('[Instagram Send Message] Missing participant_igsid:', {
        conversationId,
        conversation,
      })
      return NextResponse.json(
        { error: { type: 'validation', message: 'Conversation missing participant ID' } },
        { status: 400 }
      )
    }

    // Step 5: Get valid access token using centralized helper
    let accessToken: string
    try {
      const tokenResult = await getInstagramAccessTokenForLocation(locationId)
      accessToken = tokenResult.access_token
    } catch (error: any) {
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
      throw error
    }

    // Step 6: Call Instagram Graph API (correct format per docs)
    const apiVersion = 'v24.0'
    const apiUrl = `https://graph.instagram.com/${apiVersion}/${igAccountId}/messages`

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientIgsid },
        message: { text: text.trim() },
      }),
    })

    const responseData = await response.json().catch(() => ({}))

    if (!response.ok) {
      const error = responseData.error || {}
      console.error('[Instagram Send Message] Graph API error:', {
        status: response.status,
        code: error.code,
        message: error.message,
        type: error.type,
        conversationId,
        recipientIgsid,
      })

      // Check for token expiry (code 190)
      if (isTokenExpiredError(error) || error.code === 190) {
        return NextResponse.json(
          {
            error: {
              type: 'instagram_auth',
              code: 'EXPIRED',
              message: 'Instagram token expired. Please reconnect your Instagram account.',
            },
          },
          { status: 401 }
        )
      }

      return NextResponse.json(
        {
          error: {
            type: 'instagram_api',
            message: error.message || 'Instagram API error',
            code: error.code,
          },
        },
        { status: response.status }
      )
    }

    // Step 7: Parse response and extract message_id
    const messageId = responseData.id || responseData.message_id || `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const messageTime = new Date().toISOString()

    // Step 8: Insert outbound message into database
    const { error: insertError } = await (supabase
      .from('instagram_messages') as any)
      .insert({
        id: messageId,
        ig_account_id: igAccountId,
        conversation_id: conversationId,
        direction: 'outbound',
        from_id: igAccountId,
        to_id: recipientIgsid,
        text: text.trim(),
        attachments: null,
        created_time: messageTime,
        read_at: null,
        raw: responseData,
      })

    if (insertError) {
      console.error('[Instagram Send Message] Error inserting message:', insertError)
      // Don't fail the request - message was sent successfully to Instagram
    }

    // Step 9: Update conversation metadata
    const { error: updateError } = await (supabase
      .from('instagram_conversations') as any)
      .update({
        last_message_preview: text.trim().substring(0, 100),
        last_message_at: messageTime,
        updated_time: messageTime,
        unread_count: 0, // Reset unread since we sent it
      })
      .eq('id', conversationId)

    if (updateError) {
      console.error('[Instagram Send Message] Error updating conversation:', updateError)
      // Don't fail the request - message was sent successfully
    }

    // Step 10: Return success
    return NextResponse.json({
      ok: true,
      messageId,
    })
  } catch (error: any) {
    console.error('[Instagram Send Message] Unexpected error:', error)
    
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
      { error: { type: 'internal', message: error.message || 'Internal server error' } },
      { status: 500 }
    )
  }
}

