/**
 * Instagram Webhook Handler
 * 
 * Handles incoming Instagram message webhooks and upserts into
 * instagram_conversations and instagram_messages tables
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/supabase/database.types'
import { resolveMessagingUserProfile } from './messaging-user-profile'

/**
 * Create service role Supabase client
 */
function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Get or create conversation using API conversation ID
 * 
 * CRITICAL: We NEVER generate fake conversation IDs based on participant.
 * We ONLY use conversation IDs from:
 * 1. Webhook event (if provided)
 * 2. API lookup (if we have access token)
 * 
 * If neither is available, return null (skip the message).
 */
async function getOrCreateConversationFromEvent(
  supabase: any,
  igAccountId: string,
  participantIgsid: string,
  conversationIdFromEvent: string | null,
  accessToken: string | null = null
): Promise<string | null> {
  try {
    // Priority 1: Use conversation ID from webhook event if available
    if (conversationIdFromEvent && conversationIdFromEvent.trim() !== '') {
      // Upsert conversation using the API conversation ID
      // CRITICAL: Use onConflict: 'id' only (never on participant)
      const { error } = await (supabase
        .from('instagram_conversations') as any)
        .upsert({
          id: conversationIdFromEvent, // API conversation ID - primary key
          ig_account_id: igAccountId,
          participant_igsid: participantIgsid, // Metadata only, not used for uniqueness
          is_group: false, // Will be updated during sync if it's actually a group
          participant_count: 2, // Will be updated during sync
          updated_time: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
          unread_count: 0,
        }, {
          onConflict: 'id', // ONLY conflict on id, never on participant
        })

      if (error) {
        console.error('[Instagram Webhook] Error upserting conversation:', error)
        return null
      }

      return conversationIdFromEvent
    }

    // Priority 2: Try to fetch conversation ID from API using participant
    // This requires access token and API call
    if (accessToken && participantIgsid) {
      try {
        // Try to fetch conversation using /me/conversations?platform=instagram&user_id={participantIgsid}
        const apiVersion = 'v24.0'
        const convUrl = `https://graph.instagram.com/${apiVersion}/me/conversations?platform=instagram&user_id=${participantIgsid}&access_token=${accessToken}`
        const convResponse = await fetch(convUrl)
        
        if (convResponse.ok) {
          const convData = await convResponse.json()
          if (convData.data && convData.data.length > 0) {
            const apiConversationId = convData.data[0].id
            
            // Upsert conversation using the API conversation ID
            // CRITICAL: Use onConflict: 'id' only (never on participant)
            const { error } = await (supabase
              .from('instagram_conversations') as any)
              .upsert({
                id: apiConversationId,
                ig_account_id: igAccountId,
                participant_igsid: participantIgsid,
                is_group: false, // Will be updated during sync if it's actually a group
                participant_count: 2, // Will be updated during sync
                updated_time: new Date().toISOString(),
                last_message_at: new Date().toISOString(),
                unread_count: 0,
              }, {
                onConflict: 'id', // ONLY conflict on id, never on participant
              })

            if (!error) {
              console.log('[Instagram Webhook] Fetched conversation ID from API:', apiConversationId)
              return apiConversationId
            } else {
              console.error('[Instagram Webhook] Error upserting conversation from API:', error)
            }
          } else {
            console.log('[Instagram Webhook] No conversations found in API response for participant:', participantIgsid)
          }
        } else {
          const errorData = await convResponse.json().catch(() => ({}))
          console.warn('[Instagram Webhook] Failed to fetch conversation from API:', {
            status: convResponse.status,
            statusText: convResponse.statusText,
            error: errorData.error?.message || 'Unknown error',
          })
        }
      } catch (apiError: any) {
        console.warn('[Instagram Webhook] Exception fetching conversation from API:', {
          message: apiError.message,
          name: apiError.name,
        })
      }
    } else {
      if (!accessToken) {
        console.log('[Instagram Webhook] Cannot fetch conversation ID: access token not available (may need to reconnect account)')
      }
      if (!participantIgsid) {
        console.log('[Instagram Webhook] Cannot fetch conversation ID: participant IGSID not available')
      }
    }

    // Priority 3: Try to find existing conversation by participant (fallback when token is expired)
    // This is safe because we're using an existing conversation ID from the database, not generating a fake one
    if (participantIgsid) {
      try {
        console.log('[Instagram Webhook] Strategy 3: Looking up existing conversation by participant:', participantIgsid)
        const { data: existingConv, error: lookupError } = await (supabase
          .from('instagram_conversations') as any)
          .select('id, participant_igsid')
          .eq('ig_account_id', igAccountId)
          .eq('participant_igsid', participantIgsid)
          .order('last_message_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (lookupError) {
          console.warn('[Instagram Webhook] Error looking up existing conversation:', lookupError)
        } else if (existingConv && existingConv.id) {
          console.log('[Instagram Webhook] Found existing conversation by participant:', {
            conversationId: existingConv.id,
            participantIgsid: existingConv.participant_igsid,
          })
          // Update the conversation's last_message_at
          await (supabase
            .from('instagram_conversations') as any)
            .update({
              last_message_at: new Date().toISOString(),
              updated_time: new Date().toISOString(),
            })
            .eq('id', existingConv.id)
          return existingConv.id
        } else {
          console.log('[Instagram Webhook] No existing conversation found for participant:', participantIgsid)
        }
      } catch (lookupException: any) {
        console.warn('[Instagram Webhook] Exception looking up existing conversation:', {
          message: lookupException.message,
          name: lookupException.name,
        })
      }
    }

    // If no conversation ID available, we cannot proceed
    // DO NOT generate fake IDs based on participant - this causes merging
    console.error('[Instagram Webhook] No conversation ID available - cannot create conversation', {
      igAccountId,
      participantIgsid,
      hasEventId: !!conversationIdFromEvent,
      hasAccessToken: !!accessToken,
      triedExistingLookup: true,
    })
    return null
  } catch (error: any) {
    console.error('[Instagram Webhook] Error in getOrCreateConversationFromEvent:', error)
    return null
  }
}

/**
 * Handle incoming message webhook event
 */
export async function handleWebhookMessage(
  businessLocationId: string,
  igAccountId: string,
  event: {
    message?: { mid?: string; text?: string; attachments?: any }
    sender?: { id: string }
    recipient?: { id: string }
    timestamp?: string | number
    conversation?: { id?: string }
    thread?: { id?: string }
    [key: string]: any // Allow additional fields from webhook
  },
  accessToken: string | null = null
): Promise<void> {
  const supabase = createServiceRoleClient()
  
  try {
    const message = event.message
    const sender = event.sender
    const recipient = event.recipient
    const timestamp = event.timestamp
    const messageId = message?.mid || `wh_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const messageText = message?.text || null
    const messageAttachments = message?.attachments || null

    if (!sender?.id || !recipient?.id) {
      console.warn('[Instagram Webhook] Missing sender or recipient:', { sender, recipient })
      return
    }

    // Get connection data including self_scoped_id
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('instagram_username, instagram_user_id, self_scoped_id')
      .eq('instagram_user_id', igAccountId)
      .maybeSingle()
    
    let selfScopedId: string | null = connection?.self_scoped_id || null
    const businessAccountUsername = connection?.instagram_username || null

    // If self_scoped_id is missing, attempt to derive it from conversation API
    if (!selfScopedId && accessToken && businessAccountUsername) {
      try {
        // Try to fetch a conversation to discover self_scoped_id
        // We'll use the participant from the webhook event if possible
        // For now, we'll skip discovery in webhook and rely on sync to set it
        // This is acceptable since webhooks are non-blocking
        console.log('[Instagram Webhook] self_scoped_id not available, will be discovered during next sync')
      } catch (error: any) {
        console.warn('[Instagram Webhook] Failed to discover self_scoped_id:', error.message)
      }
    }
    
    // Determine participant IGSID and direction using self_scoped_id
    // If self_scoped_id is not available, fall back to username matching (less reliable)
    let participantIgsid: string
    let direction: 'inbound' | 'outbound'
    
    if (selfScopedId) {
      // Use self_scoped_id for direction (correct approach)
      if (sender.id === selfScopedId) {
        // Sender is the business account (outbound message)
        participantIgsid = recipient.id
        direction = 'outbound'
      } else {
        // Sender is NOT the business account (inbound message)
        participantIgsid = sender.id
        direction = 'inbound'
      }
    } else {
      // Fallback: use username matching (less reliable, but better than nothing)
      console.warn('[Instagram Webhook] self_scoped_id not available, using fallback logic')
      // We can't reliably determine direction without self_scoped_id
      // Assume inbound for safety (we'll correct during sync)
      participantIgsid = sender.id
      direction = 'inbound'
    }
    
    // Guard: Never store self_scoped_id as participant_igsid
    if (selfScopedId && participantIgsid === selfScopedId) {
      console.error('[Instagram Webhook] CRITICAL: Computed participant_igsid matches self_scoped_id!', {
        participantIgsid,
        selfScopedId,
        igAccountId,
        senderId: sender.id,
        recipientId: recipient.id,
        direction,
      })
      // This should never happen, but if it does, we can't proceed
      console.error('[Instagram Webhook] Cannot determine participant - skipping message')
      return
    }
    
    // DEBUG: Log participant determination
    const DEBUG = process.env.DEBUG_INSTAGRAM_INBOX === 'true'
    if (DEBUG) {
      console.log('[Instagram Webhook] Participant determined:', {
        participantIgsid,
        selfScopedId,
        igAccountId,
        senderId: sender.id,
        recipientId: recipient.id,
        direction,
        decision: selfScopedId ? (sender.id === selfScopedId ? 'outbound (sender === self)' : 'inbound (sender !== self)') : 'fallback',
      })
    }

    // Extract conversation ID from webhook event if available
    // Meta webhooks may include conversation/thread ID in the event structure
    // Check common fields: event.conversation, event.thread, event.conversation_id, etc.
    // Also check nested structures like event.value.conversation for changes format
    const conversationIdFromEvent = event.conversation?.id || 
                                     event.thread?.id || 
                                     (event as any).conversation_id ||
                                     (event as any).thread_id ||
                                     (event as any).value?.conversation?.id ||
                                     (event as any).value?.thread?.id ||
                                     null
    
    // Log available event keys for debugging
    if (!conversationIdFromEvent) {
      console.log('[Instagram Webhook] No conversation ID in event, available keys:', Object.keys(event || {}))
    }
    
    // Get or create conversation using API conversation ID
    const conversationId = await getOrCreateConversationFromEvent(
      supabase, 
      igAccountId, 
      participantIgsid,
      conversationIdFromEvent,
      accessToken
    )
    
    if (!conversationId) {
      console.error('[Instagram Webhook] Failed to get/create conversation - no conversation ID in event', {
        eventKeys: Object.keys(event || {}),
        hasConversation: !!(event as any).conversation,
        hasThread: !!(event as any).thread,
      })
      return
    }
    
    // Guard: Ensure conversation_id is valid before inserting message
    if (!conversationId || conversationId.trim() === '') {
      console.error('[Instagram Webhook] Invalid conversation_id - skipping message', {
        conversationId,
        messageId,
      })
      return
    }

    // Convert timestamp (milliseconds to ISO string)
    const timestampDate = timestamp 
      ? new Date(typeof timestamp === 'string' ? parseInt(timestamp) : timestamp)
      : new Date()

    // Insert message - conversation_id must be the API conversation ID
    if (!conversationId || conversationId.trim() === '') {
      console.error('[Instagram Webhook] Cannot insert message - conversation_id is missing or empty', {
        messageId,
        conversationId,
      })
      return
    }
    
    const { error: msgError } = await (supabase
      .from('instagram_messages') as any)
      .upsert({
        id: messageId,
        ig_account_id: igAccountId,
        conversation_id: conversationId, // Must be API conversation ID, never a generated one
        direction,
        from_id: sender.id,
        to_id: recipient.id,
        text: messageText,
        attachments: messageAttachments,
        created_time: timestampDate.toISOString(),
        read_at: direction === 'inbound' ? null : timestampDate.toISOString(), // Outbound messages are read immediately
        raw: event,
      }, {
        onConflict: 'id',
      })

    if (msgError) {
      console.error('[Instagram Webhook] Error inserting message:', msgError)
      return
    }

    // Update conversation
    const updateData: any = {
      last_message_at: timestampDate.toISOString(),
      updated_time: timestampDate.toISOString(),
      last_message_preview: messageText?.substring(0, 100) || null,
    }

    if (direction === 'inbound') {
      // Increment unread count for inbound messages
      const { data: conv } = await (supabase
        .from('instagram_conversations') as any)
        .select('unread_count')
        .eq('id', conversationId)
        .maybeSingle()

      updateData.unread_count = (conv?.unread_count || 0) + 1
    } else {
      // Reset unread count for outbound messages
      updateData.unread_count = 0
    }

    await (supabase
      .from('instagram_conversations') as any)
      .update(updateData)
      .eq('id', conversationId)

    // Resolve participant identity (non-blocking)
    if (direction === 'inbound') {
      resolveMessagingUserProfile(businessLocationId, igAccountId, participantIgsid)
        .catch((err) => {
          console.warn('[Instagram Webhook] Failed to resolve identity (non-blocking):', err.message)
        })
    }

    console.log('[Instagram Webhook] Message processed:', {
      messageId,
      conversationId,
      direction,
      participantIgsid,
    })
  } catch (error: any) {
    console.error('[Instagram Webhook] Error handling message:', error)
    throw error
  }
}

