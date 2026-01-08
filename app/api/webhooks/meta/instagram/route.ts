import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/supabase/database.types'
import { resolveMessagingUserProfile } from '@/lib/instagram/messaging-user-profile'
import { handleWebhookMessage } from '@/lib/instagram/webhook-handler'
import crypto from 'crypto'

/**
 * Create a Supabase client with service role key for webhook operations
 * This bypasses RLS and is safe to use server-side only
 */
function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for webhook operations')
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

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
      // Use service role client for webhook verification (bypasses RLS)
      const supabase = createServiceRoleClient()
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
    
    // Process events and await completion (for serverless)
    // IMPORTANT: We must await to ensure DB work completes before returning
    try {
      await processWebhookEvents(payload)
    } catch (error) {
      console.error('[Meta Webhook] Error processing events:', error)
    }
    
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
  // Use service role client for webhook processing (bypasses RLS)
  const supabase = createServiceRoleClient()
  
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
 * Timed query wrapper - ensures queries complete or timeout
 * Logs START, END, duration, and errors at INFO level
 */
async function timed<T>(
  label: string,
  promise: Promise<T>,
  ms: number = 3000
): Promise<T> {
  const start = Date.now()
  console.log(`[Meta Webhook] ${label} START`)
  
  try {
    const result = await Promise.race([
      promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
      )
    ])
    
    const duration = Date.now() - start
    console.log(`[Meta Webhook] ${label} END in ${duration}ms`)
    return result
  } catch (error: any) {
    const duration = Date.now() - start
    console.log(`[Meta Webhook] ${label} ERROR in ${duration}ms:`, {
      message: error.message,
      name: error.name,
    })
    throw error
  }
}

/**
 * Find business_location_id from Instagram account ID
 * Tries multiple tables and columns in order of preference
 */
async function findBusinessLocationId(
  supabase: any,
  igAccountId: string
): Promise<{ business_location_id: string; instagram_user_id?: string; matched_via: string } | null> {
  const handlerStart = Date.now()
  console.log('[Meta Webhook] findBusinessLocationId START for igAccountId:', igAccountId)
  
  if (!igAccountId || igAccountId === '0') {
    console.log('[Meta Webhook] Invalid igAccountId, skipping lookup')
    return null
  }

  // Strategy 1: instagram_connections.instagram_user_id
  try {
    console.log('[Meta Webhook] Strategy 1: Querying instagram_connections.instagram_user_id =', igAccountId)
    
    const result = await timed(
      'Strategy 1',
      (supabase
        .from('instagram_connections') as any)
        .select('business_location_id, instagram_user_id, updated_at')
        .eq('instagram_user_id', igAccountId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ) as any
    
    const { data, error } = result
    
    console.log('[Meta Webhook] Strategy 1 result:', {
      dataLength: data ? 1 : 0,
      error: error ? {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      } : null,
    })
    
    if (error) {
      console.log('[Meta Webhook] Strategy 1 error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
    } else if (data) {
      console.log('[Meta Webhook] Strategy 1 MATCH:', {
        business_location_id: data.business_location_id,
        instagram_user_id: data.instagram_user_id,
        matched_via: 'instagram_connections.instagram_user_id',
      })
      return {
        business_location_id: data.business_location_id,
        instagram_user_id: data.instagram_user_id,
        matched_via: 'instagram_connections.instagram_user_id'
      }
    } else {
      console.log('[Meta Webhook] Strategy 1: No match found (data is null)')
    }
  } catch (error: any) {
    console.log('[Meta Webhook] Strategy 1 exception:', {
      message: error.message,
      name: error.name,
    })
  }

  // Strategy 2: instagram_sync_state.ig_user_id
  try {
    console.log('[Meta Webhook] Strategy 2: Querying instagram_sync_state.ig_user_id =', igAccountId)
    
    const result = await timed(
      'Strategy 2',
      (supabase
        .from('instagram_sync_state') as any)
        .select('business_location_id, ig_user_id, last_synced_at')
        .eq('ig_user_id', igAccountId)
        .order('last_synced_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    ) as any
    
    const { data, error } = result
    
    console.log('[Meta Webhook] Strategy 2 result:', {
      dataLength: data ? 1 : 0,
      error: error ? {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      } : null,
    })
    
    if (error) {
      console.log('[Meta Webhook] Strategy 2 error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
    } else if (data) {
      console.log('[Meta Webhook] Strategy 2 MATCH:', {
        business_location_id: data.business_location_id,
        ig_user_id: data.ig_user_id,
        matched_via: 'instagram_sync_state.ig_user_id',
      })
      return {
        business_location_id: data.business_location_id,
        instagram_user_id: data.ig_user_id,
        matched_via: 'instagram_sync_state.ig_user_id'
      }
    } else {
      console.log('[Meta Webhook] Strategy 2: No match found (data is null)')
    }
  } catch (error: any) {
    console.log('[Meta Webhook] Strategy 2 exception:', {
      message: error.message,
      name: error.name,
    })
  }

  // Strategy 3: Get any connection (ONLY for test payloads with id="0")
  // DO NOT use fallback for real webhook events - this causes messages to be associated with wrong accounts
  if (igAccountId === '0' || !igAccountId) {
    try {
      console.log('[Meta Webhook] Strategy 3: Getting any instagram_connection (test payload fallback)')
      
      const result = await timed(
        'Strategy 3',
        (supabase
          .from('instagram_connections') as any)
          .select('business_location_id, instagram_user_id, updated_at')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ) as any
      
      const { data, error } = result
      
      console.log('[Meta Webhook] Strategy 3 result:', {
        dataLength: data ? 1 : 0,
        error: error ? {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        } : null,
      })
      
      if (error) {
        console.log('[Meta Webhook] Strategy 3 error:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        })
      } else if (data) {
        console.log('[Meta Webhook] Strategy 3 MATCH (test payload fallback):', {
          business_location_id: data.business_location_id,
          instagram_user_id: data.instagram_user_id,
          matched_via: 'instagram_connections.any (test payload fallback)',
        })
        return {
          business_location_id: data.business_location_id,
          instagram_user_id: data.instagram_user_id,
          matched_via: 'instagram_connections.any (test payload fallback)'
        }
      } else {
        console.log('[Meta Webhook] Strategy 3: No connections found in database (data is null)')
      }
    } catch (error: any) {
      console.log('[Meta Webhook] Strategy 3 exception:', {
        message: error.message,
        name: error.name,
      })
    }
  } else {
    console.log('[Meta Webhook] Strategy 3: Skipped (not a test payload, igAccountId:', igAccountId, ')')
  }

  const handlerDuration = Date.now() - handlerStart
  console.log('[Meta Webhook] findBusinessLocationId END (no match) after', handlerDuration, 'ms')
  return null
}

/**
 * Resolve usernames for sender and recipient (with timeout)
 * Uses the new messaging user profile resolver which uses graph.facebook.com
 */
async function resolveUsernames(
  businessLocationId: string,
  recipientIgAccountId: string,
  senderId: string | null | undefined,
  recipientId: string | null | undefined
): Promise<void> {
  if (!senderId && !recipientId) {
    return
  }
  
  try {
    // Wrap in timeout to not block webhook
    const resolvePromise = Promise.all([
      senderId ? resolveMessagingUserProfile(businessLocationId, recipientIgAccountId, senderId) : Promise.resolve(null),
      recipientId && recipientId !== senderId 
        ? resolveMessagingUserProfile(businessLocationId, recipientIgAccountId, recipientId) 
        : Promise.resolve(null),
    ])
    
    await Promise.race([
      resolvePromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 2000))
    ])
    
    console.log('[Meta Webhook] Username resolution attempted:', {
      recipientIgAccountId,
      senderId,
      recipientId,
    })
  } catch (error: any) {
    // Don't fail webhook if resolution fails
    console.log('[Meta Webhook] Username resolution error (non-blocking):', {
      message: error.message,
    })
  }
}

/**
 * Insert message into unmatched events table
 */
async function insertUnmatchedEvent(
  supabase: any,
  igAccountId: string,
  messageId: string | null,
  payload: any,
  errorMessage: string
): Promise<void> {
  try {
    console.log('[Meta Webhook] Inserting unmatched event:', {
      igAccountId,
      messageId,
      errorMessage: errorMessage.substring(0, 100),
    })
    
    const result = await timed(
      'insert_unmatched',
      (supabase
        .from('instagram_dm_unmatched_events') as any)
        .insert({
          ig_account_id: igAccountId,
          message_id: messageId,
          payload_json: payload,
          error_message: errorMessage,
        })
    ) as any
    
    const { error } = result
    
    if (error) {
      console.log('[Meta Webhook] Error inserting unmatched event:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
    } else {
      console.log('[Meta Webhook] Unmatched DM saved:', {
        igAccountId,
        messageId,
      })
    }
  } catch (error: any) {
    console.log('[Meta Webhook] Exception inserting unmatched event:', {
      message: error.message,
      name: error.name,
    })
  }
}

/**
 * Handle a single message event
 * ALWAYS persists to database (either matched or unmatched)
 */
async function handleMessageEvent(
  event: any,
  igAccountId: string,
  supabase: any
): Promise<void> {
  const handlerStart = Date.now()
  console.log('[Meta Webhook] ===== handleMessageEvent START =====')
  console.log('[Meta Webhook] igAccountId:', igAccountId)
  console.log('[Meta Webhook] Service role client configured:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
  
  try {
    // DB connectivity sanity check
    try {
      await timed(
        'db_ping',
        (supabase
          .from('instagram_dm_events') as any)
          .select('id')
          .limit(1)
      )
      console.log('[Meta Webhook] db_ping ok')
    } catch (pingError: any) {
      console.log('[Meta Webhook] db_ping ERROR:', {
        message: pingError.message,
        name: pingError.name,
      })
    }
    const message = event.message
    const sender = event.sender
    const recipient = event.recipient
    const timestamp = event.timestamp
    const messageId = message?.mid || null
    const messageText = message?.text || null

    console.log('[Meta Webhook] Message event details:', {
      hasMessage: !!message,
      hasSender: !!sender,
      hasRecipient: !!recipient,
      timestamp,
      messageId,
      messageText: messageText?.substring(0, 50),
    })

    // Step 1: Find business_location_id
    const locationMatch = await findBusinessLocationId(supabase, igAccountId)
    
    if (!locationMatch) {
      console.log('[Meta Webhook] No business_location_id match found for igAccountId:', igAccountId)
      await insertUnmatchedEvent(
        supabase,
        igAccountId,
        messageId,
        event,
        `No business_location_id match found for igAccountId: ${igAccountId}`
      )
      console.log('[Meta Webhook] Unmatched DM saved:', {
        igAccountId,
        messageId,
      })
      console.log('[Meta Webhook] ===== handleMessageEvent END (unmatched) =====')
      return
    }

    const { business_location_id, matched_via } = locationMatch
    const instagram_user_id = (locationMatch as any).instagram_user_id || igAccountId
    const recipientIgAccountId = instagram_user_id || igAccountId
    
    // Warn if webhook account ID doesn't match database account ID
    if (matched_via.includes('fallback') && igAccountId !== '0') {
      console.warn('[Meta Webhook] WARNING: Webhook account ID mismatch!', {
        webhookIgAccountId: igAccountId,
        databaseIgAccountId: instagram_user_id,
        matched_via,
        message: 'Webhook subscription may be configured for a different account. Consider updating the webhook subscription or reconnecting the correct account.',
      })
    }
    
    console.log('[Meta Webhook] Found business_location_id:', {
      business_location_id,
      matched_via,
      instagram_user_id,
      webhookIgAccountId: igAccountId,
      usingAccountId: recipientIgAccountId,
    })

    // Step 2: Handle message using new schema (instagram_conversations + instagram_messages)
    // This will:
    // - Upsert conversation
    // - Insert message
    // - Update unread count
    // - Resolve participant identity
    // Try to get access token for API lookup if conversation ID not in event
    // Use the matched instagram_user_id (not the webhook igAccountId) to get the correct token
    let accessToken: string | null = null
    try {
      const { data: connection } = await (supabase
        .from('instagram_connections') as any)
        .select('access_token')
        .eq('instagram_user_id', recipientIgAccountId) // Use matched account ID, not webhook ID
        .maybeSingle()
      accessToken = connection?.access_token || null
    } catch (tokenError: any) {
      console.warn('[Meta Webhook] Could not fetch access token for API lookup:', tokenError.message)
    }
    
    try {
      // Use the matched instagram_user_id (not the webhook igAccountId) for message handling
      // This ensures we use the correct account ID that exists in the database
      await handleWebhookMessage(business_location_id, recipientIgAccountId, event, accessToken)
      console.log('[Meta Webhook] Message handled successfully using new schema')
    } catch (webhookError: any) {
      console.error('[Meta Webhook] Error handling message with new schema:', {
        message: webhookError.message,
        stack: webhookError.stack?.substring(0, 500),
      })
      // Continue with old schema for backward compatibility
    }

    // Step 3: Also insert into instagram_dm_events (for backward compatibility during migration)
    // Timestamp is in milliseconds, not seconds
    const timestampDate = timestamp 
      ? new Date(typeof timestamp === 'string' ? parseInt(timestamp) : timestamp)
      : new Date()

    console.log('[Meta Webhook] Inserting DM event:', {
      business_location_id,
      ig_user_id: igAccountId,
      messageId,
      hasText: !!messageText,
      timestamp: timestampDate.toISOString(),
    })

    // Try upsert first (idempotent)
    try {
      const result = await timed(
        'insert_dm_event',
        (supabase
          .from('instagram_dm_events') as any)
          .upsert({
            business_location_id,
            ig_user_id: igAccountId,
            sender_id: sender?.id || null,
            recipient_id: recipient?.id || null,
            message_id: messageId,
            text: messageText,
            timestamp: timestampDate.toISOString(),
            raw: event, // Store full event payload
          }, {
            onConflict: 'message_id', // Try message_id first, fallback to composite if needed
          })
          .select(),
        5000
      ) as any
      
      const { error: insertError, data: insertData } = result
      
      if (insertError) {
        // If unique constraint on message_id fails, try composite key
        if (insertError.code === '23505' && insertError.message?.includes('message_id')) {
          console.log('[Meta Webhook] message_id unique constraint failed, trying composite key upsert')
          
          const compositeResult = await timed(
            'insert_dm_event_composite',
            (supabase
              .from('instagram_dm_events') as any)
              .upsert({
                business_location_id,
                ig_user_id: igAccountId,
                sender_id: sender?.id || null,
                recipient_id: recipient?.id || null,
                message_id: messageId,
                text: messageText,
                timestamp: timestampDate.toISOString(),
                raw: event,
              }, {
                onConflict: 'business_location_id,message_id',
              })
              .select(),
            5000
          ) as any
          
          const { error: compositeError, data: compositeData } = compositeResult
          
          if (compositeError) {
            if (compositeError.code === '23505') {
              console.log('[Meta Webhook] DM event already exists (duplicate), skipping')
              console.log('[Meta Webhook] DM persisted (duplicate):', {
                business_location_id,
                messageId,
              })
              
              // Still try to resolve usernames even for duplicates
              await resolveUsernames(business_location_id, recipientIgAccountId, sender?.id, recipient?.id)
            } else {
              console.log('[Meta Webhook] Error inserting DM event (composite):', {
                code: compositeError.code,
                message: compositeError.message,
                details: compositeError.details,
                hint: compositeError.hint,
              })
              // Still save to unmatched for debugging
              await insertUnmatchedEvent(
                supabase,
                igAccountId,
                messageId,
                event,
                `Insert error (composite): ${compositeError.message}`
              )
            }
          } else {
            console.log('[Meta Webhook] DM persisted:', {
              business_location_id,
              messageId,
              insertedId: compositeData?.[0]?.id,
              matched_via,
            })
            
            // Resolve usernames for sender (and recipient if different)
            await resolveUsernames(business_location_id, recipientIgAccountId, sender?.id, recipient?.id)
          }
        } else if (insertError.code === '23505') {
          console.log('[Meta Webhook] DM event already exists (duplicate), skipping')
          console.log('[Meta Webhook] DM persisted (duplicate):', {
            business_location_id,
            messageId,
          })
          
          // Still try to resolve usernames even for duplicates
          await resolveUsernames(business_location_id, recipientIgAccountId, sender?.id, recipient?.id)
        } else {
          console.log('[Meta Webhook] Error inserting DM event:', {
            code: insertError.code,
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
          })
          // Save to unmatched for debugging
          await insertUnmatchedEvent(
            supabase,
            igAccountId,
            messageId,
            event,
            `Insert error: ${insertError.message}`
          )
        }
      } else {
        console.log('[Meta Webhook] DM persisted:', {
          business_location_id,
          messageId,
          insertedId: insertData?.[0]?.id,
          matched_via,
        })
        
            // Resolve usernames for sender (and recipient if different)
            await resolveUsernames(business_location_id, recipientIgAccountId, sender?.id, recipient?.id)
      }
    } catch (insertException: any) {
      console.log('[Meta Webhook] Exception during insert:', {
        message: insertException.message,
        name: insertException.name,
      })
      // Save to unmatched for debugging
      await insertUnmatchedEvent(
        supabase,
        igAccountId,
        messageId,
        event,
        `Insert exception: ${insertException.message}`
      )
    }

    const handlerDuration = Date.now() - handlerStart
    console.log('[Meta Webhook] ===== handleMessageEvent END (success) in', handlerDuration, 'ms =====')
  } catch (error: any) {
    const handlerDuration = Date.now() - handlerStart
    console.log('[Meta Webhook] ===== handleMessageEvent END (exception) in', handlerDuration, 'ms =====')
    console.log('[Meta Webhook] Exception in handleMessageEvent:', {
      message: error.message,
      name: error.name,
      stack: error.stack?.substring(0, 500),
    })
    
    // Try to save to unmatched for debugging
    try {
      await insertUnmatchedEvent(
        supabase,
        igAccountId,
        event?.message?.mid || null,
        event,
        `Handler exception: ${error.message}`
      )
      console.log('[Meta Webhook] Unmatched DM saved (exception):', {
        igAccountId,
        messageId: event?.message?.mid || null,
      })
    } catch (unmatchedError: any) {
      console.log('[Meta Webhook] Failed to save unmatched event:', unmatchedError.message)
    }
  }
}
