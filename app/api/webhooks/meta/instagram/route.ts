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
    
    // Verify signature correctly (X-Hub-Signature-256)
    // Get header
    const sig = request.headers.get('x-hub-signature-256') || ''
    
    // Get app secret
    const appSecret = process.env.META_APP_SECRET
    if (!appSecret) {
      console.error('[Meta Webhook] META_APP_SECRET not configured')
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }
    
    // Accept only sha256 signatures
    const received = sig.startsWith('sha256=') ? sig.slice(7) : ''
    
    if (!received) {
      console.warn('[Meta Webhook] Missing or invalid X-Hub-Signature-256 header')
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
    }
    
    // Compute expected
    const expected = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')
    
    // Compare with constant-time compare (handle missing/invalid lengths safely)
    const receivedBuffer = Buffer.from(received, 'hex')
    const expectedBuffer = Buffer.from(expected, 'hex')
    
    // Compare lengths first (safe check)
    if (receivedBuffer.length !== expectedBuffer.length) {
      console.warn('[Meta Webhook] Invalid signature (mismatch)', {
        receivedPrefix: received.substring(0, 8),
        expectedPrefix: expected.substring(0, 8),
      })
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
    }
    
    // Use timing-safe comparison (never throws if lengths match)
    if (!crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
      console.warn('[Meta Webhook] Invalid signature (mismatch)', {
        receivedPrefix: received.substring(0, 8),
        expectedPrefix: expected.substring(0, 8),
      })
      return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
    }
    
    // Signature verified successfully - return 200 quickly
    // Parse JSON from the same raw buffer (only after verification passes)
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
    
    // Handle test payloads (id="0" or missing ids) - just log and return 200
    if (igAccountId === '0' || !igAccountId) {
      console.log('[Meta Webhook] Test payload received, skipping persistence')
      return
    }
    
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
 * Persists to instagram_dm_events table
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
    return
  }

  const businessLocationId = connection.business_location_id
  const messageId = message.mid || null
  const messageText = message.text || null
  const timestampDate = timestamp ? new Date(parseInt(timestamp) * 1000) : new Date()

  // Insert into instagram_dm_events table
  const { error: insertError } = await (supabase
    .from('instagram_dm_events') as any)
    .insert({
      business_location_id: businessLocationId,
      ig_user_id: igAccountId,
      sender_id: sender?.id || null,
      recipient_id: recipient?.id || null,
      message_id: messageId,
      text: messageText,
      timestamp: timestampDate.toISOString(),
      raw: event, // Store full event payload
    })
  
  // Ignore duplicate key errors (message already exists)
  if (insertError && insertError.code !== '23505') {
    console.error('[Meta Webhook] Error inserting DM event:', insertError)
  } else {
    console.log('[Meta Webhook] DM event persisted:', {
      businessLocationId,
      igAccountId,
      messageId,
    })
  }
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

