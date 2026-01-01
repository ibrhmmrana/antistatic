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
 * 
 * IMPORTANT: Signature verification MUST be computed over raw request body bytes.
 * NEVER call request.json() or request.text() before signature verification.
 * The body must be read exactly ONCE using request.arrayBuffer().
 */

/**
 * Compute expected signature for raw body bytes
 * @param raw - Raw request body as Buffer
 * @returns Hex digest of HMAC-SHA256 signature
 */
function computeExpectedSignature(raw: Buffer): string {
  const appSecret = process.env.META_APP_SECRET
  if (!appSecret) {
    throw new Error('META_APP_SECRET not configured')
  }
  return crypto
    .createHmac('sha256', appSecret)
    .update(raw)
    .digest('hex')
}

/**
 * Safely compare two hex strings using timing-safe comparison
 * Validates hex length and uses crypto.timingSafeEqual
 * @param a - First hex string
 * @param b - Second hex string
 * @returns true if equal, false otherwise
 */
function safeEqualHex(a: string, b: string): boolean {
  try {
    const aBuffer = Buffer.from(a, 'hex')
    const bBuffer = Buffer.from(b, 'hex')
    
    // Compare lengths first
    if (aBuffer.length !== bBuffer.length) {
      return false
    }
    
    // Use timing-safe comparison
    return crypto.timingSafeEqual(aBuffer, bBuffer)
  } catch (error) {
    // Invalid hex strings
    return false
  }
}

/**
 * GET /api/webhooks/meta/instagram
 * 
 * Meta webhook verification (challenge-response)
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
 * Signature Verification Process:
 * 1. Read raw request body bytes ONCE using request.arrayBuffer()
 * 2. NEVER call request.json() or request.text() before verification
 * 3. Get x-hub-signature-256 header
 * 4. Extract hex signature (handle "sha256=<hex>" or "<hex>" formats)
 * 5. Compute expected signature using HMAC-SHA256 over raw bytes
 * 6. Compare using timing-safe comparison
 * 7. Only after verification passes, parse JSON from raw bytes
 */
export async function POST(request: NextRequest) {
  try {
    // Read the raw request body bytes ONCE - this is critical
    // IMPORTANT: Do NOT call request.json() or request.text() before this
    const arrayBuffer = await request.arrayBuffer()
    const rawBody = Buffer.from(arrayBuffer)
    
    // Get signature header
    const signatureHeader = request.headers.get('x-hub-signature-256') || 
                        request.headers.get('X-Hub-Signature-256') || 
                        ''
    
    // Get content-type for logging
    const contentType = request.headers.get('content-type') || 'unknown'
    
    // Robust logging
    const debugMode = process.env.META_WEBHOOK_DEBUG === '1' || process.env.NODE_ENV === 'development'
    
    console.log('[Meta Webhook] POST request received', {
      signatureHeaderExists: !!signatureHeader,
      contentType,
      rawBodyByteLength: rawBody.length,
    })
    
    // Get app secret
    const appSecret = process.env.META_APP_SECRET
    if (!appSecret) {
      console.error('[Meta Webhook] META_APP_SECRET not configured')
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }
    
    // Fix common header parsing pitfalls
    // Accept both "sha256=<hex>" and "<hex>" formats, trim whitespace
    let receivedHex = signatureHeader.trim()
    
    if (receivedHex.startsWith('sha256=')) {
      receivedHex = receivedHex.slice(7).trim()
    }
    
    if (!receivedHex) {
      console.warn('[Meta Webhook] Missing or empty X-Hub-Signature-256 header')
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
    }
    
    // Compute expected signature using raw body bytes
    const expectedHex = computeExpectedSignature(rawBody)
    
    // Log signature prefixes for debugging (first 8 chars only)
    console.log('[Meta Webhook] Signature comparison', {
      receivedPrefix: receivedHex.substring(0, 8),
      expectedPrefix: expectedHex.substring(0, 8),
      receivedLength: receivedHex.length,
      expectedLength: expectedHex.length,
    })
    
    // Debug logging (only when enabled)
    if (debugMode) {
      const bodyPreview = rawBody.toString('utf8').substring(0, 60)
      console.log('[Meta Webhook] Debug info', {
        bodyPreview,
        receivedHex: receivedHex.substring(0, 16) + '...',
        expectedHex: expectedHex.substring(0, 16) + '...',
      })
    }
    
    // Compare using timing-safe comparison
    if (!safeEqualHex(receivedHex, expectedHex)) {
      console.warn('[Meta Webhook] Invalid signature (mismatch)', {
        receivedPrefix: receivedHex.substring(0, 8),
        expectedPrefix: expectedHex.substring(0, 8),
        payloadByteLength: rawBody.length,
        hint: 'Likely wrong META_APP_SECRET OR body was modified before hashing',
      })
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
    }
    
    console.log('[Meta Webhook] Signature verified successfully', {
      payloadByteLength: rawBody.length,
      signaturePrefix: receivedHex.substring(0, 8),
    })
    
    // Only after signature is valid, parse JSON from raw bytes
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
  
  console.log('[Meta Webhook] Processing events, body.object:', body.object)
  
  // Meta webhook format: { object: 'instagram', entry: [...] }
  if (body.object !== 'instagram') {
    console.log('[Meta Webhook] Ignoring non-Instagram object:', body.object)
    return
  }

  const entries = body.entry || []
  console.log('[Meta Webhook] Processing', entries.length, 'entry/entries')

  for (const entry of entries) {
    const igAccountId = entry.id // Instagram account ID (page-scoped)
    console.log('[Meta Webhook] Processing entry with id:', igAccountId)
    
    // Handle test payloads (id="0" or missing ids) - still try to process but log it
    if (igAccountId === '0' || !igAccountId) {
      console.log('[Meta Webhook] Test payload received (id="0"), attempting to process anyway')
    }
    
    // Handle new format: entry.changes[].field === "messages"
    if (entry.changes && Array.isArray(entry.changes)) {
      console.log('[Meta Webhook] Found', entry.changes.length, 'changes')
      for (const change of entry.changes) {
        if (change.field === 'messages' && change.value) {
          console.log('[Meta Webhook] Processing messages change')
          // change.value contains the messaging event
          const event = change.value
          if (event.message) {
            await handleMessageEvent(event, igAccountId, supabase)
          } else {
            console.log('[Meta Webhook] Change value has no message field:', Object.keys(change.value || {}))
          }
        }
      }
    }
    
    // Handle legacy format: entry.messaging[]
    if (entry.messaging && Array.isArray(entry.messaging)) {
      console.log('[Meta Webhook] Found', entry.messaging.length, 'messaging events')
      for (const event of entry.messaging) {
        if (event.message) {
          await handleMessageEvent(event, igAccountId, supabase)
        } else {
          console.log('[Meta Webhook] Messaging event has no message field:', Object.keys(event || {}))
        }
      }
    }
    
    // Log if no messages found
    if (!entry.changes && !entry.messaging) {
      console.log('[Meta Webhook] Entry has no changes or messaging fields:', Object.keys(entry))
    }
  }
}

/**
 * Handle a single message event
 * Persists to instagram_dm_events table
 */
async function handleMessageEvent(
  event: any,
  igAccountId: string,
  supabase: any
) {
  console.log('[Meta Webhook] handleMessageEvent called for igAccountId:', igAccountId)
  
  const message = event.message
  const sender = event.sender
  const recipient = event.recipient
  const timestamp = event.timestamp

  console.log('[Meta Webhook] Message event details:', {
    hasMessage: !!message,
    hasSender: !!sender,
    hasRecipient: !!recipient,
    timestamp,
    messageId: message?.mid,
    messageText: message?.text?.substring(0, 50),
  })

  // Find business_location_id by Instagram account ID
  // Try both exact match and partial match (in case of test payloads)
  let connection = null
  
  if (igAccountId && igAccountId !== '0') {
    const { data } = await (supabase
      .from('instagram_connections') as any)
      .select('business_location_id, instagram_user_id')
      .eq('instagram_user_id', igAccountId)
      .maybeSingle()
    connection = data
  }
  
  // If no exact match, try to get any connection (for test payloads)
  if (!connection) {
    console.log('[Meta Webhook] No exact match for igAccountId, trying to get any connection')
    const { data: anyConnection } = await (supabase
      .from('instagram_connections') as any)
      .select('business_location_id, instagram_user_id')
      .limit(1)
      .maybeSingle()
    connection = anyConnection
    if (connection) {
      console.log('[Meta Webhook] Using first available connection for test payload')
    }
  }

  if (!connection) {
    console.warn('[Meta Webhook] No connection found for ig_account_id:', igAccountId)
    console.warn('[Meta Webhook] Available connections check failed')
    return
  }

  const businessLocationId = connection.business_location_id
  const actualIgUserId = connection.instagram_user_id || igAccountId
  const messageId = message?.mid || null
  const messageText = message?.text || null
  const timestampDate = timestamp ? new Date(parseInt(timestamp) * 1000) : new Date()

  console.log('[Meta Webhook] Inserting DM event:', {
    businessLocationId,
    igUserId: actualIgUserId,
    messageId,
    hasText: !!messageText,
  })

  // Insert into instagram_dm_events table
  const { error: insertError, data: insertData } = await (supabase
    .from('instagram_dm_events') as any)
    .insert({
      business_location_id: businessLocationId,
      ig_user_id: actualIgUserId,
      sender_id: sender?.id || null,
      recipient_id: recipient?.id || null,
      message_id: messageId,
      text: messageText,
      timestamp: timestampDate.toISOString(),
      raw: event, // Store full event payload
    })
    .select()
  
  // Ignore duplicate key errors (message already exists)
  if (insertError) {
    if (insertError.code === '23505') {
      console.log('[Meta Webhook] DM event already exists (duplicate), skipping')
    } else {
      console.error('[Meta Webhook] Error inserting DM event:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
      })
    }
  } else {
    console.log('[Meta Webhook] DM event persisted successfully:', {
      businessLocationId,
      igUserId: actualIgUserId,
      messageId,
      insertedId: insertData?.[0]?.id,
    })
  }
}
