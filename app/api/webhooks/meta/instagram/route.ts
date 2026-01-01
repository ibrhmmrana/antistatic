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
 * 
 * Signature Verification:
 * - Reads raw request body bytes ONCE using `await request.arrayBuffer()` (NOT request.json())
 * - Computes HMAC-SHA256 over raw bytes using META_APP_SECRET
 * - Compares against X-Hub-Signature-256 header (format: sha256=<hex>) using crypto.timingSafeEqual
 * - META_APP_SECRET must match Meta App Dashboard → Settings → Basic → App Secret (NOT Instagram App Secret)
 * - Only parses JSON after signature verification passes
 * 
 * Debug Mode:
 * - Set META_WEBHOOK_DEBUG_CAPTURE=1 to log raw body base64 (truncated to 1KB) on signature mismatch
 * - This allows offline signature verification for debugging
 */
export async function POST(request: NextRequest) {
  try {
    // Read the raw body bytes ONCE - this is critical for signature verification
    // IMPORTANT: Never use request.json() or request.text() before hashing
    const rawBody = Buffer.from(await request.arrayBuffer())
    
    // Log payload byte length
    console.log('[Meta Webhook] Payload byte length:', rawBody.length)
    
    // Read signature header (case-insensitive)
    const sig = request.headers.get('x-hub-signature-256') || request.headers.get('X-Hub-Signature-256')
    
    // Log signature header presence
    console.log('[Meta Webhook] Signature header present:', !!sig)
    
    // Get app secret (do NOT trim - use exact value from env)
    const appSecret = process.env.META_APP_SECRET
    if (!appSecret) {
      console.error('[Meta Webhook] META_APP_SECRET not configured')
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }
    
    // Parse signature as sha256=<hex>. If missing/invalid -> 403
    if (!sig) {
      console.warn('[Meta Webhook] Missing X-Hub-Signature-256 header')
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
    }
    
    if (!sig.startsWith('sha256=')) {
      console.warn('[Meta Webhook] Invalid signature format (expected sha256=<hex>):', sig.substring(0, 20))
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
    }
    
    const receivedSignatureHex = sig.substring(7) // Remove 'sha256=' prefix
    
    // Compute expected with Node crypto over raw bytes (NOT parsed JSON)
    const expectedSignatureHex = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody) // Use raw bytes directly
      .digest('hex')
    
    // Log signature prefixes for debugging (first 8 chars only)
    console.log('[Meta Webhook] Signature comparison:', {
      receivedPrefix: receivedSignatureHex.substring(0, 8),
      expectedPrefix: expectedSignatureHex.substring(0, 8),
    })
    
    // Compare using timingSafeEqual on hex buffers (also check equal length)
    const receivedBuffer = Buffer.from(receivedSignatureHex, 'hex')
    const expectedBuffer = Buffer.from(expectedSignatureHex, 'hex')
    
    // Compare lengths first
    if (receivedBuffer.length !== expectedBuffer.length) {
      console.warn('[Meta Webhook] Invalid signature (mismatch)', {
        receivedPrefix: receivedSignatureHex.substring(0, 8),
        expectedPrefix: expectedSignatureHex.substring(0, 8),
        receivedLength: receivedBuffer.length,
        expectedLength: expectedBuffer.length,
        payloadByteLength: rawBody.length,
        hint: 'Likely wrong META_APP_SECRET OR body was modified before hashing',
      })
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
    }
    
    // Use timing-safe comparison
    if (!crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
      // Safe diagnostics (only when mismatch)
      const debugInfo: any = {
        receivedPrefix: receivedSignatureHex.substring(0, 8),
        expectedPrefix: expectedSignatureHex.substring(0, 8),
        payloadByteLength: rawBody.length,
        hint: 'Likely wrong META_APP_SECRET OR body was modified before hashing',
      }
      
      // If META_WEBHOOK_DEBUG_CAPTURE=1, log raw body base64 (truncated to first 1KB)
      const debugCapture = process.env.META_WEBHOOK_DEBUG_CAPTURE === '1'
      if (debugCapture) {
        const truncatedBody = rawBody.subarray(0, 1024) // First 1KB only
        debugInfo.payloadBase64 = truncatedBody.toString('base64')
        debugInfo.payloadBase64Length = truncatedBody.length
        debugInfo.note = 'Full payload truncated to 1KB for debugging. Use this to verify signature offline.'
      }
      
      console.warn('[Meta Webhook] Invalid signature (mismatch)', debugInfo)
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
    }
    
    console.log('[Meta Webhook] Signature verified successfully (ok)', {
      payloadByteLength: rawBody.length,
      signaturePrefix: receivedSignatureHex.substring(0, 8),
    })
    
    // Only after signature is valid, parse JSON
    let payload: any
    try {
      payload = JSON.parse(rawBody.toString('utf8'))
    } catch (parseError) {
      console.error('[Meta Webhook] JSON parse error:', parseError)
      return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
    }
    
    // Return 200 quickly, process events asynchronously
    processWebhookEvents(payload).catch((error) => {
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
 * 
 * Supports two Meta webhook formats:
 * 1. Legacy: { object: 'instagram', entry: [{ id, messaging: [...] }] }
 * 2. New: { object: 'instagram', entry: [{ id, changes: [{ field: 'messages', value: {...} }] }] }
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
    
    // Handle new format: entry.changes[].field === "messages"
    if (entry.changes && Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        if (change.field === 'messages' && change.value) {
          // change.value contains the messaging event
          const event = change.value
          if (event.message) {
            await handleMessageEvent(event, igAccountId, supabase)
          }
        }
      }
    }
    
    // Handle legacy format: entry.messaging[]
    if (entry.messaging && Array.isArray(entry.messaging)) {
      for (const event of entry.messaging) {
        if (event.message) {
          await handleMessageEvent(event, igAccountId, supabase)
        }
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

/**
 * Test helper: Compute expected signature for a given payload string
 * Usage: Call this with a known payload to verify META_APP_SECRET is correct
 * 
 * Example (in a test script or console):
 *   const testPayload = '{"entry": [{"id": "0", "time": 1767306476}]}'
 *   const expectedSig = computeWebhookSignature(testPayload)
 *   console.log('Expected signature:', expectedSig)
 * 
 * Note: This is a helper function, not exported to avoid Next.js route conflicts
 */
function computeWebhookSignature(payloadString: string): string {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    throw new Error('META_APP_SECRET not configured')
  }
  
  const rawBody = Buffer.from(payloadString, 'utf8')
  const signature = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex')
  
  return `sha256=${signature}`
}

