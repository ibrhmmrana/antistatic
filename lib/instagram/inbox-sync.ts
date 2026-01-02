/**
 * Instagram Inbox Sync
 * 
 * Syncs conversations and messages from Instagram Messaging API
 * into Supabase tables: instagram_conversations and instagram_messages
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/supabase/database.types'
import { resolveMessagingUserProfile } from './messaging-user-profile'

const API_BASE = 'https://graph.instagram.com'
const API_VERSION = 'v24.0' // Use v24.0 for Instagram API with Instagram Login

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
 * Retry helper with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  let lastError: any
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      if (error.status === 429 && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt)
        console.log(`[Instagram Inbox Sync] Rate limited, retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }
  throw lastError
}

/**
 * Fetch conversations from Instagram API
 * 
 * Uses the correct endpoint: GET /me/conversations?platform=instagram
 * This requires instagram_business_manage_messages permission
 */
async function fetchConversations(
  igAccountId: string,
  accessToken: string
): Promise<Array<{
  id: string
  updated_time: string
  participants: Array<{ id: string }>
}>> {
  try {
    // Instagram Conversations API endpoint - use /me/conversations (not /{igAccountId}/conversations)
    // This is the correct endpoint for Instagram API with Instagram Login
    const url = `${API_BASE}/${API_VERSION}/me/conversations?platform=instagram&access_token=${accessToken}`
    
    console.log('[Instagram Inbox Sync] Fetching conversations from:', url.replace(accessToken, 'REDACTED'))
    
    const response = await fetch(url)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error?.message || response.statusText
      console.error('[Instagram Inbox Sync] Conversations API error:', {
        status: response.status,
        error: errorData.error,
        message: errorMessage,
      })
      throw new Error(`HTTP ${response.status}: ${errorMessage}`)
    }
    
    const data = await response.json()
    const conversations = data.data || []
    
    console.log('[Instagram Inbox Sync] Fetched conversations:', {
      count: conversations.length,
      hasPaging: !!data.paging,
      nextCursor: data.paging?.cursors?.after,
    })

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Instagram Inbox Sync] RAW conversations', JSON.stringify(data, null, 2))
    }
    
    return conversations
  } catch (error: any) {
    console.error('[Instagram Inbox Sync] Error fetching conversations:', {
      igAccountId,
      message: error.message,
      stack: error.stack,
    })
    throw error
  }
}

/**
 * Fetch conversation detail with participants and messages
 * 
 * Uses the correct fields syntax: ?fields=participants{username,id,profile_pic},messages{from,to,message,created_time,id,attachments}
 */
async function fetchConversationDetail(
  conversationId: string,
  accessToken: string
): Promise<{
  participants?: { data: Array<{ id: string; username?: string; profile_pic?: string }> }
  messages?: { data: Array<{
    id: string
    created_time: string
    from: { id: string }
    to: { data?: Array<{ id: string }>; id?: string }
    message?: string
    attachments?: any
  }> }
}> {
  try {
    // Fetch participants AND messages in one call
    // Format: fields=participants{username,id,profile_pic},messages{from,to,message,created_time,id,attachments}
    const fields = 'participants{username,id,profile_pic},messages{from,to,message,created_time,id,attachments}'
    const url = `${API_BASE}/${API_VERSION}/${conversationId}?fields=${fields}&access_token=${accessToken}`
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Instagram Inbox Sync] Fetching conversation detail:', {
        conversationId,
        url: url.replace(accessToken, 'REDACTED'),
      })
    }
    
    const response = await fetch(url)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error?.message || response.statusText
      console.error('[Instagram Inbox Sync] Conversation detail API error:', {
        conversationId,
        status: response.status,
        error: errorData.error,
        message: errorMessage,
      })
      throw new Error(`HTTP ${response.status}: ${errorMessage}`)
    }
    
    const data = await response.json()
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('[Instagram Inbox Sync] RAW conv detail', conversationId, JSON.stringify(data, null, 2))
    }
    
    return {
      participants: data.participants,
      messages: data.messages,
    }
  } catch (error: any) {
    console.error('[Instagram Inbox Sync] Error fetching conversation detail:', {
      conversationId,
      message: error.message,
      stack: error.stack,
    })
    throw error
  }
}

/**
 * Fetch message details
 */
async function fetchMessageDetails(
  messageId: string,
  accessToken: string
): Promise<{
  id: string
  created_time: string
  from: { id: string }
  to: { id: string }
  message?: string
  attachments?: any
}> {
  try {
    const url = `${API_BASE}/${API_VERSION}/${messageId}?fields=id,created_time,from,to,message,attachments&access_token=${accessToken}`
    
    const response = await fetch(url)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`)
    }
    
    return await response.json()
  } catch (error: any) {
    console.error('[Instagram Inbox Sync] Error fetching message details:', {
      messageId,
      message: error.message,
    })
    throw error
  }
}

/**
 * Sync Instagram inbox for a business location
 */
export async function syncInstagramInbox(
  businessLocationId: string,
  igAccountId: string,
  accessToken: string
): Promise<{
  conversationsFound: number
  conversationsUpserted: number
  messagesUpserted: number
  identitiesResolved: number
  errors: string[]
}> {
  const supabase = createServiceRoleClient()
  const errors: string[] = []
  let conversationsFound = 0
  let conversationsUpserted = 0
  let messagesUpserted = 0
  const identitiesResolved = new Set<string>()

  try {
    // Step 1: Fetch conversations from API (if available)
    console.log('[Instagram Inbox Sync] Fetching conversations for ig_account_id:', igAccountId)
    let conversations: Array<{ id: string; updated_time: string; participants: Array<{ id: string }> }> = []
    
    try {
      conversations = await retryWithBackoff(
        () => fetchConversations(igAccountId, accessToken)
      )
      conversationsFound = conversations.length
      console.log('[Instagram Inbox Sync] Found', conversationsFound, 'conversations from API')
    } catch (apiError: any) {
      // If API endpoint is not available, sync from existing database data
      console.log('[Instagram Inbox Sync] API endpoint not available, syncing from existing database data')
      
      // Get existing conversations from database
      const { data: existingConversations } = await (supabase
        .from('instagram_conversations') as any)
        .select('id, participant_igsid, updated_time')
        .eq('ig_account_id', igAccountId)
        .order('last_message_at', { ascending: false })
        .limit(50) // Limit to recent conversations
      
      if (existingConversations && existingConversations.length > 0) {
        conversations = existingConversations.map((conv: any) => ({
          id: conv.id,
          updated_time: conv.updated_time,
          participants: [{ id: conv.participant_igsid }],
        }))
        conversationsFound = conversations.length
        console.log('[Instagram Inbox Sync] Found', conversationsFound, 'existing conversations in database')
      } else {
        console.log('[Instagram Inbox Sync] No existing conversations found')
        return {
          conversationsFound: 0,
          conversationsUpserted: 0,
          messagesUpserted: 0,
          identitiesResolved: 0,
          errors: ['No conversations available from API or database'],
        }
      }
    }

    // Step 2: Process each conversation
    const conversationsToUpsert: Array<{
      id: string
      ig_account_id: string
      participant_igsid: string | null
      updated_time: string
      last_message_at: string
      last_message_preview: string | null
    }> = []

    for (const conversation of conversations) {
      try {
        // Step 2a: Fetch conversation detail with participants and messages
        let conversationDetail: Awaited<ReturnType<typeof fetchConversationDetail>>
        try {
          conversationDetail = await retryWithBackoff(
            () => fetchConversationDetail(conversation.id, accessToken)
          )
        } catch (detailError: any) {
          errors.push(`Failed to fetch detail for conversation ${conversation.id}: ${detailError.message}`)
          console.error('[Instagram Inbox Sync] Conversation detail fetch error:', {
            conversationId: conversation.id,
            error: detailError.message,
          })
          continue
        }

        const participants = conversationDetail.participants?.data || []
        const messages = conversationDetail.messages?.data || []

        // Step 2b: Extract participant IGSID with robust fallbacks
        let participantIgsid: string | null = null

        // Method 1: Try to get from participants list
        const otherParticipantFromParticipants = participants.find((p: any) => p.id !== igAccountId)
        if (otherParticipantFromParticipants) {
          participantIgsid = otherParticipantFromParticipants.id
        }

        // Method 2: Fallback - derive from messages
        if (!participantIgsid && messages.length > 0) {
          const allIds = new Set<string>()
          for (const msg of messages) {
            if (msg.from?.id) allIds.add(msg.from.id)
            // Handle both to.id (single) and to.data (array) formats
            if (msg.to?.id) allIds.add(msg.to.id)
            if (msg.to?.data) {
              for (const toItem of msg.to.data) {
                if (toItem.id) allIds.add(toItem.id)
              }
            }
          }
          // Remove the business account id
          allIds.delete(igAccountId)
          const otherParticipantFromMessages = Array.from(allIds)[0]
          if (otherParticipantFromMessages) {
            participantIgsid = otherParticipantFromMessages
          }
        }

        // Method 3: Final fallback - use deterministic placeholder
        if (!participantIgsid) {
          participantIgsid = `UNKNOWN_${conversation.id.slice(-20)}`
          console.warn('[Instagram Inbox Sync] Could not determine participant, using fallback:', {
            conversationId: conversation.id,
            fallbackParticipant: participantIgsid,
          })
        }

        // Step 2c: Process messages
        let lastMessageText: string | null = null
        let lastMessageTime: string = conversation.updated_time

        for (const message of messages) {
          try {
            // Determine direction
            const direction = message.from.id === igAccountId ? 'outbound' : 'inbound'

            // Extract to_id - handle both formats
            let toId: string | null = null
            if (message.to?.id) {
              toId = message.to.id
            } else if (message.to?.data && message.to.data.length > 0) {
              toId = message.to.data[0].id
            }

            // Upsert message
            const { error: msgError } = await (supabase
              .from('instagram_messages') as any)
              .upsert({
                id: message.id,
                ig_account_id: igAccountId,
                conversation_id: conversation.id,
                direction,
                from_id: message.from.id,
                to_id: toId,
                text: message.message || null,
                attachments: message.attachments || null,
                created_time: message.created_time,
                read_at: direction === 'outbound' ? message.created_time : null, // Outbound messages are read immediately
                raw: message,
              }, {
                onConflict: 'id',
              })

            if (msgError) {
              errors.push(`Failed to upsert message ${message.id}: ${msgError.message}`)
              continue
            }
            
            messagesUpserted++

            // Track last message
            if (message.message) {
              lastMessageText = message.message
            }
            if (message.created_time) {
              lastMessageTime = message.created_time
            }

            // Step 2d: Resolve participant identity (if inbound and not already resolved)
            if (direction === 'inbound' && participantIgsid && !participantIgsid.startsWith('UNKNOWN_') && !identitiesResolved.has(participantIgsid)) {
              try {
                await resolveMessagingUserProfile(
                  businessLocationId,
                  igAccountId,
                  participantIgsid
                )
                identitiesResolved.add(participantIgsid)
              } catch (identityError: any) {
                // Non-blocking
                console.warn('[Instagram Inbox Sync] Failed to resolve identity:', {
                  participantIgsid,
                  error: identityError.message,
                })
              }
            }
          } catch (msgError: any) {
            errors.push(`Failed to process message: ${msgError.message}`)
            continue
          }
        }

        // Step 2e: Prepare conversation for upsert
        conversationsToUpsert.push({
          id: conversation.id,
          ig_account_id: igAccountId,
          participant_igsid: participantIgsid,
          updated_time: conversation.updated_time,
          last_message_at: lastMessageTime,
          last_message_preview: lastMessageText ? lastMessageText.substring(0, 100) : null,
        })

      } catch (convError: any) {
        errors.push(`Failed to process conversation ${conversation.id}: ${convError.message}`)
        console.error('[Instagram Inbox Sync] Conversation processing error:', {
          conversationId: conversation.id,
          error: convError.message,
        })
        continue
      }
    }

    // Step 3: Batch upsert all conversations
    if (conversationsToUpsert.length > 0) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('[Instagram Inbox Sync] Upserting conversations', {
          count: conversationsToUpsert.length,
          ids: conversationsToUpsert.map(c => c.id),
          participants: conversationsToUpsert.map(c => c.participant_igsid),
        })
      }

      for (const conv of conversationsToUpsert) {
        const { error: convError } = await (supabase
          .from('instagram_conversations') as any)
          .upsert({
            id: conv.id,
            ig_account_id: conv.ig_account_id,
            participant_igsid: conv.participant_igsid,
            updated_time: conv.updated_time,
            last_message_at: conv.last_message_at,
            last_message_preview: conv.last_message_preview,
            unread_count: 0, // Will be updated by webhook or manual sync
          }, {
            onConflict: 'id',
          })

        if (convError) {
          errors.push(`Failed to upsert conversation ${conv.id}: ${convError.message}`)
        } else {
          conversationsUpserted++
        }
      }
    }

    return {
      conversationsFound,
      conversationsUpserted,
      messagesUpserted,
      identitiesResolved: identitiesResolved.size,
      errors,
    }
  } catch (error: any) {
    console.error('[Instagram Inbox Sync] Fatal error:', error)
    throw error
  }
}

