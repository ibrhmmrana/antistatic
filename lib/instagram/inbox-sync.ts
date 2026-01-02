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
 * Fetch messages for a conversation
 * 
 * Uses the correct fields syntax: ?fields=messages{from,to,message,created_time,id,attachments}
 */
async function fetchConversationMessages(
  conversationId: string,
  accessToken: string
): Promise<Array<{
  id: string
  created_time: string
  from: { id: string }
  to: { id: string }
  message?: string
  attachments?: any
}>> {
  try {
    // Use correct fields syntax with nested message fields
    // Format: fields=messages{from,to,message,created_time,id,attachments}
    const fields = 'messages{from,to,message,created_time,id,attachments}'
    const url = `${API_BASE}/${API_VERSION}/${conversationId}?fields=${fields}&access_token=${accessToken}`
    
    console.log('[Instagram Inbox Sync] Fetching messages for conversation:', {
      conversationId,
      url: url.replace(accessToken, 'REDACTED'),
    })
    
    const response = await fetch(url)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error?.message || response.statusText
      console.error('[Instagram Inbox Sync] Conversation messages API error:', {
        conversationId,
        status: response.status,
        error: errorData.error,
        message: errorMessage,
      })
      throw new Error(`HTTP ${response.status}: ${errorMessage}`)
    }
    
    const data = await response.json()
    const messages = data.messages?.data || []
    
    console.log('[Instagram Inbox Sync] Fetched messages:', {
      conversationId,
      count: messages.length,
      hasPaging: !!data.messages?.paging,
      nextCursor: data.messages?.paging?.cursors?.after,
    })
    
    return messages
  } catch (error: any) {
    console.error('[Instagram Inbox Sync] Error fetching conversation messages:', {
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
    for (const conversation of conversations) {
      try {
        // Extract participant IGSID (the other user, not us)
        const participant = conversation.participants?.find((p: any) => p.id !== igAccountId)
        if (!participant) {
          console.warn('[Instagram Inbox Sync] No participant found for conversation:', conversation.id)
          continue
        }
        
        const participantIgsid = participant.id

        // Upsert conversation
        const { error: convError } = await (supabase
          .from('instagram_conversations') as any)
          .upsert({
            id: conversation.id,
            ig_account_id: igAccountId,
            participant_igsid: participantIgsid,
            updated_time: conversation.updated_time,
            last_message_at: conversation.updated_time,
            unread_count: 0, // Will be updated when we process messages
          }, {
            onConflict: 'id',
          })

        if (convError) {
          errors.push(`Failed to upsert conversation ${conversation.id}: ${convError.message}`)
          continue
        }
        
        conversationsUpserted++

        // Step 3: Fetch messages for this conversation
        try {
          const messages = await retryWithBackoff(
            () => fetchConversationMessages(conversation.id, accessToken)
          )

          // Process each message
          for (const message of messages) {
            try {
              // Determine direction
              const direction = message.from.id === igAccountId ? 'outbound' : 'inbound'

              // Upsert message
              const { error: msgError } = await (supabase
                .from('instagram_messages') as any)
                .upsert({
                  id: message.id,
                  ig_account_id: igAccountId,
                  conversation_id: conversation.id,
                  direction,
                  from_id: message.from.id,
                  to_id: message.to.id,
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

              // Step 4: Resolve participant identity (if inbound)
              if (direction === 'inbound' && !identitiesResolved.has(participantIgsid)) {
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

          // Update conversation metadata with latest message info
          if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1]
            const lastMessageText = lastMessage.message || ''
            
            await (supabase
              .from('instagram_conversations') as any)
              .update({
                last_message_preview: lastMessageText.substring(0, 100),
                last_message_at: lastMessage.created_time,
                updated_time: lastMessage.created_time,
              })
              .eq('id', conversation.id)
          }
        } catch (convMsgError: any) {
          errors.push(`Failed to fetch messages for conversation ${conversation.id}: ${convMsgError.message}`)
          console.error('[Instagram Inbox Sync] Message fetch error:', {
            conversationId: conversation.id,
            error: convMsgError.message,
          })
          // Continue with next conversation
        }
      } catch (convError: any) {
        errors.push(`Failed to process conversation ${conversation.id}: ${convError.message}`)
        console.error('[Instagram Inbox Sync] Conversation processing error:', {
          conversationId: conversation.id,
          error: convError.message,
        })
        continue
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

