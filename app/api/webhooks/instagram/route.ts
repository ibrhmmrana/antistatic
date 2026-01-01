import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

/**
 * Instagram Webhook Endpoint
 * 
 * Handles Instagram webhook verification (GET) and event ingestion (POST)
 * Supports message events for Direct Messages
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const mode = requestUrl.searchParams.get('hub.mode')
    const token = requestUrl.searchParams.get('hub.verify_token')
    const challenge = requestUrl.searchParams.get('hub.challenge')

    // Verify webhook setup
    const expectedToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN

    if (mode === 'subscribe' && token === expectedToken) {
      console.log('[Instagram Webhook] Verification successful')
      return new NextResponse(challenge, { status: 200 })
    }

    console.warn('[Instagram Webhook] Verification failed:', { mode, token, expectedToken: !!expectedToken })
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
  } catch (error: any) {
    console.error('[Instagram Webhook] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/webhooks/instagram
 * 
 * Handle Instagram webhook events (messages, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature using META_APP_SECRET
    const signature = request.headers.get('x-hub-signature-256')
    const appSecret = process.env.META_APP_SECRET || process.env.INSTAGRAM_WEBHOOK_SECRET
    
    let bodyJson: any = {}
    
    if (signature && appSecret) {
      const body = await request.text()
      const expectedSignature = crypto
        .createHmac('sha256', appSecret)
        .update(body)
        .digest('hex')
      
      if (`sha256=${expectedSignature}` !== signature) {
        console.warn('[Instagram Webhook] Invalid signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
      
      // Re-parse body as JSON after signature verification
      bodyJson = JSON.parse(body)
    } else {
      // If no signature verification, still process (for development)
      bodyJson = await request.json()
    }

    await processWebhookEvents(bodyJson)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Instagram Webhook] Error processing event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function processWebhookEvents(body: any) {
  const object = body.object

  // Handle Instagram messaging events
  if (object === 'instagram') {
    const entries = body.entry || []

    for (const entry of entries) {
      const messaging = entry.messaging || []
      const igUserId = entry.id // Instagram user ID (page-scoped)

      for (const event of messaging) {
        // Handle message events
        if (event.message) {
          await handleMessageEvent(event, igUserId)
        }
      }
    }
  }
}

async function handleMessageEvent(event: any, igUserId: string) {
  const supabase = await createClient()
  
  const message = event.message
  const sender = event.sender
  const recipient = event.recipient
  const timestamp = event.timestamp

  // Find business location by ig_user_id
  const { data: connection } = await (supabase
    .from('instagram_connections') as any)
    .select('business_location_id, instagram_user_id')
    .eq('instagram_user_id', igUserId)
    .maybeSingle()

  if (!connection) {
    console.warn('[Instagram Webhook] No connection found for ig_user_id:', igUserId)
    return
  }

  const businessLocationId = connection.business_location_id
  const conversationId = sender.id // Use sender ID as conversation ID (1:1 conversation)
  const participantId = sender.id
  const participantUsername = sender.username || null
  const messageText = message.text || null
  const messageTime = new Date(timestamp * 1000).toISOString()

  // Upsert conversation
  const { data: existingConv } = await (supabase
    .from('instagram_conversations') as any)
    .select('id, unread_count')
    .eq('business_location_id', businessLocationId)
    .eq('conversation_id', conversationId)
    .maybeSingle()

  const currentUnreadCount = existingConv?.unread_count || 0

  await (supabase
    .from('instagram_conversations') as any)
    .upsert({
      business_location_id: businessLocationId,
      conversation_id: conversationId,
      participant_ig_user_id: participantId,
      participant_username: participantUsername,
      updated_time: messageTime,
      unread_count: currentUnreadCount + 1,
      last_message_text: messageText,
      last_message_time: messageTime,
    }, {
      onConflict: 'business_location_id,conversation_id',
    })

  // Insert message (inbound)
  const messageId = message.mid || `msg_${Date.now()}_${Math.random()}`
  await (supabase
    .from('instagram_messages') as any)
    .insert({
      business_location_id: businessLocationId,
      conversation_id: conversationId,
      message_id: messageId,
      direction: 'inbound',
      from_id: sender.id,
      to_id: recipient.id,
      text: messageText,
      created_time: messageTime,
      raw_payload: message,
    })

  console.log('[Instagram Webhook] Message processed:', {
    businessLocationId,
    conversationId,
    messageId,
  })
}

