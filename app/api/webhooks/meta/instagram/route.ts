import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Meta Webhook Endpoint for Instagram Messaging
 * 
 * GET: Webhook verification (Meta standard)
 * POST: Receive messaging events from Meta
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const mode = requestUrl.searchParams.get('hub.mode')
    const token = requestUrl.searchParams.get('hub.verify_token')
    const challenge = requestUrl.searchParams.get('hub.challenge')

    // Verify webhook setup
    const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN

    if (mode === 'subscribe' && token === expectedToken) {
      console.log('[Meta Webhook] Verification successful')
      
      // Update webhook_verified_at in sync_state for all connected accounts
      const supabase = await createClient()
      const { data: connections } = await (supabase
        .from('instagram_connections') as any)
        .select('business_location_id')
      
      if (connections && connections.length > 0) {
        const locationIds = [...new Set(connections.map((c: any) => c.business_location_id))]
        for (const locationId of locationIds) {
          await (supabase
            .from('instagram_sync_state') as any)
            .upsert({
              business_location_id: locationId,
              webhook_verified_at: new Date().toISOString(),
            }, {
              onConflict: 'business_location_id',
            })
        }
      }
      
      // Return challenge as plain text (not JSON)
      return new NextResponse(challenge, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
    }

    console.warn('[Meta Webhook] Verification failed:', { 
      mode, 
      tokenProvided: !!token, 
      expectedTokenSet: !!expectedToken 
    })
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 })
  } catch (error: any) {
    console.error('[Meta Webhook] GET Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/webhooks/meta/instagram
 * 
 * Handle Meta webhook events for Instagram messaging
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature using META_APP_SECRET
    const signature = request.headers.get('x-hub-signature-256')
    const appSecret = process.env.META_APP_SECRET
    
    if (!appSecret) {
      console.error('[Meta Webhook] META_APP_SECRET not configured')
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    // Read raw body for signature verification
    const bodyText = await request.text()
    
    if (signature) {
      const expectedSignature = crypto
        .createHmac('sha256', appSecret)
        .update(bodyText)
        .digest('hex')
      
      if (`sha256=${expectedSignature}` !== signature) {
        console.warn('[Meta Webhook] Invalid signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
      }
    } else {
      console.warn('[Meta Webhook] Missing X-Hub-Signature-256 header')
      // In development, we might allow this, but in production we should require it
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Missing signature' }, { status: 403 })
      }
    }

    // Parse JSON after signature verification
    const bodyJson = JSON.parse(bodyText)
    
    // Process webhook events
    await processWebhookEvents(bodyJson)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Meta Webhook] POST Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Process Meta webhook events
 */
async function processWebhookEvents(body: any) {
  const supabase = await createClient()
  
  // Meta webhook format: { object: 'instagram', entry: [...] }
  if (body.object !== 'instagram') {
    console.log('[Meta Webhook] Ignoring non-Instagram object:', body.object)
    return
  }

  const entries = body.entry || []

  for (const entry of entries) {
    const igAccountId = entry.id // Instagram account ID (page-scoped)
    const messaging = entry.messaging || []

    for (const event of messaging) {
      if (event.message) {
        await handleMessageEvent(event, igAccountId, supabase)
      }
    }
  }
}

/**
 * Handle a single message event
 */
async function handleMessageEvent(
  event: any,
  igAccountId: string,
  supabase: any
) {
  const message = event.message
  const sender = event.sender
  const recipient = event.recipient
  const timestamp = event.timestamp

  // Find business_location_id by Instagram account ID
  const { data: connection } = await (supabase
    .from('instagram_connections') as any)
    .select('business_location_id, instagram_user_id')
    .eq('instagram_user_id', igAccountId)
    .maybeSingle()

  if (!connection) {
    console.warn('[Meta Webhook] No connection found for ig_account_id:', igAccountId)
    
    // Store unmatched event for debugging
    await (supabase
      .from('instagram_webhook_unmatched_events') as any)
      .insert({
        raw_payload: event,
        ig_account_id: igAccountId,
        error_message: `No connection found for Instagram account ID: ${igAccountId}`,
      })
      .catch((err: any) => {
        // Ignore errors if table doesn't exist yet
        console.warn('[Meta Webhook] Could not store unmatched event:', err)
      })
    
    return
  }

  const businessLocationId = connection.business_location_id
  
  // Generate deterministic thread_key (sorted sender/recipient IDs)
  const participants = [sender.id, recipient.id].sort()
  const threadKey = participants.join('_')

  const messageText = message.text || null
  const messageMid = message.mid || null
  const attachments = message.attachments || null
  const timestampMs = timestamp ? parseInt(timestamp) * 1000 : Date.now()

  // Upsert conversation
  await (supabase
    .from('instagram_dm_conversations') as any)
    .upsert({
      business_location_id: businessLocationId,
      ig_account_id: igAccountId,
      thread_key: threadKey,
      last_message_at: new Date(timestampMs).toISOString(),
    }, {
      onConflict: 'business_location_id,ig_account_id,thread_key',
    })

  // Insert message (only if message_mid is unique)
  if (messageMid) {
    const { error: insertError } = await (supabase
      .from('instagram_dm_messages') as any)
      .insert({
        business_location_id: businessLocationId,
        ig_account_id: igAccountId,
        thread_key: threadKey,
        message_mid: messageMid,
        sender_id: sender.id,
        recipient_id: recipient.id,
        message_text: messageText,
        attachments: attachments,
        timestamp_ms: timestampMs,
        raw_event: event,
      })
    
    // Ignore duplicate key errors (message already exists)
    if (insertError && insertError.code !== '23505') {
      console.error('[Meta Webhook] Error inserting message:', insertError)
      
      // Update webhook state with error
      await (supabase
        .from('instagram_sync_state') as any)
        .upsert({
          business_location_id: businessLocationId,
          last_webhook_error: insertError.message || 'Failed to insert message',
        }, {
          onConflict: 'business_location_id',
        })
    }
  }

  // Update webhook state
  await (supabase
    .from('instagram_sync_state') as any)
    .upsert({
      business_location_id: businessLocationId,
      last_webhook_event_at: new Date().toISOString(),
      last_webhook_error: null,
    }, {
      onConflict: 'business_location_id',
    })

  console.log('[Meta Webhook] Message processed:', {
    businessLocationId,
    igAccountId,
    threadKey,
    messageMid,
  })
}

