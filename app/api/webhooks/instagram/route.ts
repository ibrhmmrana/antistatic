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
    // Verify webhook signature (if configured)
    const signature = request.headers.get('x-hub-signature-256')
    if (signature && process.env.INSTAGRAM_WEBHOOK_SECRET) {
      const body = await request.text()
      const expectedSignature = crypto
        .createHmac('sha256', process.env.INSTAGRAM_WEBHOOK_SECRET)
        .update(body)
        .digest('hex')
      
      if (`sha256=${expectedSignature}` !== signature) {
        console.warn('[Instagram Webhook] Invalid signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const body = await request.json()
    const object = body.object

    // Handle Instagram messaging events
    if (object === 'instagram') {
      const entries = body.entry || []

      for (const entry of entries) {
        const messaging = entry.messaging || []

        for (const event of messaging) {
          // Handle message events
          if (event.message) {
            await handleMessageEvent(event, entry.id) // entry.id is the ig_user_id
          }
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Instagram Webhook] Error processing event:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function handleMessageEvent(event: any, igUserId: string) {
  const supabase = await createClient()
  
  const message = event.message
  const sender = event.sender
  const recipient = event.recipient
  const timestamp = event.timestamp

  // Find business location by ig_user_id
  const { data: connection } = await supabase
    .from('instagram_connections')
    .select('business_location_id, instagram_user_id')
    .eq('instagram_user_id', igUserId)
    .maybeSingle()

  if (!connection) {
    console.warn('[Instagram Webhook] No connection found for ig_user_id:', igUserId)
    return
  }

  const businessLocationId = connection.business_location_id
  const threadId = sender.id || `thread_${sender.id}`

  // Upsert thread
  await supabase
    .from('instagram_threads')
    .upsert({
      id: threadId,
      business_location_id: businessLocationId,
      ig_user_id: igUserId,
      participants: [sender.id, recipient.id],
      last_message_at: new Date(timestamp * 1000).toISOString(),
      unread_count: 1, // Increment unread count
      raw: event,
    }, {
      onConflict: 'id',
    })

  // Insert message
  await supabase
    .from('instagram_messages')
    .upsert({
      id: message.mid || `msg_${Date.now()}_${Math.random()}`,
      business_location_id: businessLocationId,
      ig_user_id: igUserId,
      thread_id: threadId,
      from_id: sender.id,
      from_username: sender.username || null,
      text: message.text || null,
      created_time: new Date(timestamp * 1000).toISOString(),
      raw: message,
    }, {
      onConflict: 'id',
    })

  console.log('[Instagram Webhook] Message processed:', {
    businessLocationId,
    threadId,
    messageId: message.mid,
  })
}

