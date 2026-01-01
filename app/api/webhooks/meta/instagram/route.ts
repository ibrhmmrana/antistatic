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
    // Get signature header
    const signature = request.headers.get('x-hub-signature-256')
    const appSecret = process.env.META_APP_SECRET?.trim()
    
    // Log signature header presence
    console.log('[Meta Webhook] Signature header present:', !!signature)
    if (signature) {
      console.log('[Meta Webhook] Signature prefix:', signature.substring(0, 12))
    }
    
    if (!appSecret) {
      console.error('[Meta Webhook] META_APP_SECRET not configured')
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    // Read raw body as ArrayBuffer to preserve exact bytes
    const arrayBuffer = await request.arrayBuffer()
    const bodyBuffer = Buffer.from(arrayBuffer)
    
    // Log payload size
    console.log('[Meta Webhook] Payload size:', bodyBuffer.length, 'bytes')

    // Verify signature if present
    if (!signature) {
      console.warn('[Meta Webhook] Missing X-Hub-Signature-256 header')
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
    }

    // Extract signature value (format: sha256=<hex>)
    if (!signature.startsWith('sha256=')) {
      console.warn('[Meta Webhook] Invalid signature format:', signature.substring(0, 20))
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
    }

    const receivedSignature = signature.substring(7) // Remove 'sha256=' prefix
    
    // Compute expected signature using raw body bytes
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(bodyBuffer)
      .digest('hex')

    // Use timing-safe comparison to prevent timing attacks
    const receivedBuffer = Buffer.from(receivedSignature, 'hex')
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')
    
    // Compare lengths first
    if (receivedBuffer.length !== expectedBuffer.length) {
      console.warn('[Meta Webhook] Signature length mismatch', {
        receivedLength: receivedBuffer.length,
        expectedLength: expectedBuffer.length,
        receivedPrefix: receivedSignature.substring(0, 16),
        expectedPrefix: expectedSignature.substring(0, 16),
      })
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
    }
    
    // Use timing-safe comparison
    if (!crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
      console.warn('[Meta Webhook] Invalid signature (mismatch)', {
        receivedPrefix: receivedSignature.substring(0, 16),
        expectedPrefix: expectedSignature.substring(0, 16),
        payloadPreview: bodyBuffer.toString('utf-8').substring(0, 100),
      })
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
    }

    console.log('[Meta Webhook] Signature verified successfully (ok)', {
      payloadSize: bodyBuffer.length,
      signaturePrefix: receivedSignature.substring(0, 8),
    })

    // Parse JSON from raw bytes only after signature verification
    let bodyJson: any
    try {
      bodyJson = JSON.parse(bodyBuffer.toString('utf-8'))
    } catch (parseError) {
      console.error('[Meta Webhook] JSON parse error:', parseError)
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }
    
    // Return 200 quickly, process events asynchronously
    processWebhookEvents(bodyJson).catch((error) => {
      console.error('[Meta Webhook] Error processing events:', error)
    })

    return NextResponse.json({ ok: true }, { status: 200 })
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

