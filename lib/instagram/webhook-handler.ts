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
 * Find or create conversation ID for a participant
 */
async function findOrCreateConversation(
  supabase: any,
  igAccountId: string,
  participantIgsid: string
): Promise<string | null> {
  try {
    // Try to find existing conversation
    const { data: existing } = await (supabase
      .from('instagram_conversations') as any)
      .select('id')
      .eq('ig_account_id', igAccountId)
      .eq('participant_igsid', participantIgsid)
      .maybeSingle()

    if (existing) {
      return existing.id
    }

    // Try to fetch conversation ID from Instagram API
    // Note: This requires access token, which we'll need to pass in
    // For now, generate a conversation ID based on participant
    // In production, you'd want to call the API to get the real conversation ID
    const conversationId = `conv_${igAccountId}_${participantIgsid}`

    // Create conversation
    const { error } = await (supabase
      .from('instagram_conversations') as any)
      .insert({
        id: conversationId,
        ig_account_id: igAccountId,
        participant_igsid: participantIgsid,
        updated_time: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        unread_count: 0,
      })

    if (error && error.code !== '23505') {
      // Ignore duplicate key errors
      console.error('[Instagram Webhook] Error creating conversation:', error)
      return null
    }

    return conversationId
  } catch (error: any) {
    console.error('[Instagram Webhook] Error in findOrCreateConversation:', error)
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
  }
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

    // Determine participant IGSID (the other user, not us)
    const participantIgsid = sender.id === igAccountId ? recipient.id : sender.id
    const direction = sender.id === igAccountId ? 'outbound' : 'inbound'

    // Find or create conversation
    const conversationId = await findOrCreateConversation(supabase, igAccountId, participantIgsid)
    if (!conversationId) {
      console.error('[Instagram Webhook] Failed to get/create conversation')
      return
    }

    // Convert timestamp (milliseconds to ISO string)
    const timestampDate = timestamp 
      ? new Date(typeof timestamp === 'string' ? parseInt(timestamp) : timestamp)
      : new Date()

    // Insert message
    const { error: msgError } = await (supabase
      .from('instagram_messages') as any)
      .upsert({
        id: messageId,
        ig_account_id: igAccountId,
        conversation_id: conversationId,
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

