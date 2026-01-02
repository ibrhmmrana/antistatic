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
const API_BASE_FACEBOOK = 'https://graph.facebook.com' // Fallback for conversations endpoint
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:66',message:'fetchConversations entry',data:{igAccountId,hasAccessToken:!!accessToken,tokenLength:accessToken.length,apiVersion:API_VERSION},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    // Instagram Conversations API endpoint - try /me/conversations first
    const urlMe = `${API_BASE}/${API_VERSION}/me/conversations?platform=instagram&access_token=${accessToken}`
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:77',message:'Before /me/conversations fetch',data:{url:urlMe.substring(0,100),igAccountId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    console.log('[Instagram Inbox Sync] Fetching conversations from:', urlMe.replace(accessToken, 'REDACTED'))
    
    let response = await fetch(urlMe)
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:85',message:'/me/conversations response',data:{status:response.status,ok:response.ok,statusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.error?.message || response.statusText
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:92',message:'/me/conversations error details',data:{status:response.status,errorCode:errorData.error?.code,errorSubcode:errorData.error?.error_subcode,errorType:errorData.error?.type,errorMessage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion

      // Try fallback: use ig_account_id directly (Hypothesis A)
      if (response.status === 400 && (errorData.error?.code === 100 || errorMessage.includes('me') || errorMessage.includes('does not exist'))) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:98',message:'Trying fallback with ig_account_id',data:{igAccountId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        const urlAccount = `${API_BASE}/${API_VERSION}/${igAccountId}/conversations?platform=instagram&access_token=${accessToken}`
        console.log('[Instagram Inbox Sync] /me failed, trying with account ID:', urlAccount.replace(accessToken, 'REDACTED'))
        
        response = await fetch(urlAccount)
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:106',message:'/{igAccountId}/conversations response',data:{status:response.status,ok:response.ok,statusText:response.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        if (!response.ok) {
          const fallbackErrorData = await response.json().catch(() => ({}))
          const fallbackErrorMessage = fallbackErrorData.error?.message || response.statusText
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:114',message:'/{igAccountId}/conversations error',data:{status:response.status,errorCode:fallbackErrorData.error?.code,errorSubcode:fallbackErrorData.error?.error_subcode,errorType:fallbackErrorData.error?.type,errorMessage:fallbackErrorMessage,fullError:JSON.stringify(fallbackErrorData).substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'A'})}).catch(()=>{});
          // #endregion

          // Try alternative: maybe we need to use the Page access token or a different endpoint structure
          // For Instagram API with Instagram Login, conversations might be under a different path
          // Let's try without platform parameter or with different structure
          console.error('[Instagram Inbox Sync] Conversations API error (both /me and /{id} failed):', {
            status: response.status,
            error: fallbackErrorData.error,
            message: fallbackErrorMessage,
          })
          
          // Don't throw yet - try variations (Hypothesis D)
          // Variation 1: Authorization header instead of query param
          const urlWithAuth = `${API_BASE}/${API_VERSION}/${igAccountId}/conversations?platform=instagram`
          let responseWithAuth = await fetch(urlWithAuth, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          })
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:130',message:'/{igAccountId}/conversations with Auth header',data:{status:responseWithAuth.status,ok:responseWithAuth.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          
          if (!responseWithAuth.ok) {
            // Variation 2: Try without platform parameter
            const urlNoPlatform = `${API_BASE}/${API_VERSION}/${igAccountId}/conversations?access_token=${accessToken}`
            responseWithAuth = await fetch(urlNoPlatform)
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:138',message:'/{igAccountId}/conversations without platform param',data:{status:responseWithAuth.status,ok:responseWithAuth.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
          }
          
          if (responseWithAuth.ok) {
            response = responseWithAuth
          } else {
            // Try graph.facebook.com instead (Hypothesis: conversations might be on Facebook Graph API)
            const urlFacebook = `${API_BASE_FACEBOOK}/${API_VERSION}/${igAccountId}/conversations?platform=instagram&access_token=${accessToken}`
            const responseFacebook = await fetch(urlFacebook)
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:145',message:'graph.facebook.com /conversations',data:{status:responseFacebook.status,ok:responseFacebook.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'E'})}).catch(()=>{});
            // #endregion
            
            if (responseFacebook.ok) {
              response = responseFacebook
            } else {
              // Check token permissions by calling /me to see what works
              const tokenCheckUrl = `${API_BASE}/${API_VERSION}/me?fields=id,username&access_token=${accessToken}`
              const tokenCheckResponse = await fetch(tokenCheckUrl)
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:155',message:'Token validation check',data:{status:tokenCheckResponse.status,ok:tokenCheckResponse.ok,canAccessMe:tokenCheckResponse.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              
              // If /me works but /me/conversations doesn't, conversations endpoint might not exist for this token type
              // Try one more variation: maybe conversations are under a different path for Instagram API with Instagram Login
              // Some Instagram endpoints use /{ig-id}/inbox or /{ig-id}/messages instead of /conversations
              const urlInbox = `${API_BASE}/${API_VERSION}/${igAccountId}/inbox?access_token=${accessToken}`
              const responseInbox = await fetch(urlInbox)
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:163',message:'/{igAccountId}/inbox endpoint test',data:{status:responseInbox.status,ok:responseInbox.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
              // #endregion
              
              if (responseInbox.ok) {
                response = responseInbox
              } else {
                const finalError = await responseWithAuth.json().catch(() => ({}))
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:170',message:'All endpoint variations failed',data:{finalError:JSON.stringify(finalError).substring(0,300),facebookError:await responseFacebook.json().catch(()=>({})),inboxError:await responseInbox.json().catch(()=>({}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'C'})}).catch(()=>{});
                // #endregion
                throw new Error(`HTTP ${response.status}: ${fallbackErrorMessage}`)
              }
            }
          }
        }
      } else {
        console.error('[Instagram Inbox Sync] Conversations API error:', {
          status: response.status,
          error: errorData.error,
          message: errorMessage,
        })
        throw new Error(`HTTP ${response.status}: ${errorMessage}`)
      }
    }
    
    const data = await response.json()
    const conversations = data.data || []
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:130',message:'fetchConversations success',data:{conversationCount:conversations.length,hasPaging:!!data.paging,usedFallback:response.url.includes(igAccountId)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
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
    // Step 0: Get the business account's username and IGSID to identify which participant is "us"
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('instagram_username, instagram_user_id')
      .eq('instagram_user_id', igAccountId)
      .maybeSingle()
    
    const businessAccountUsername = connection?.instagram_username || null
    
    // We'll determine the business account's IGSID from the first conversation's participants
    // This will be set when we process conversations
    let businessAccountIgsid: string | null = null
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:365',message:'Business account info',data:{igAccountId,businessAccountUsername,hasConnection:!!connection},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H'})}).catch(()=>{});
    // #endregion

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

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:431',message:'Extracting participant',data:{conversationId:conversation.id,participantsCount:participants.length,participantIds:participants.map((p:any)=>p.id),igAccountId,messagesCount:messages.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'G'})}).catch(()=>{});
        // #endregion

        // Step 2b: Extract participant IGSID - explicitly pick the OTHER participant (not our business account)
        function getConversationParticipantId(
          detail: { participants?: { data?: Array<{ id: string; username?: string }> } },
          igAccountId: string,
          businessAccountUsername: string | null
        ): string | null {
          const participants = detail.participants?.data ?? []
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:450',message:'getConversationParticipantId input',data:{participants:participants.map((p:any)=>({id:p.id,username:p.username})),igAccountId,businessAccountUsername,participantsCount:participants.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H'})}).catch(()=>{});
          // #endregion
          
          // Identify the business account participant by username (if available) or by checking if ID matches igAccountId
          // Since participants are IGSIDs and igAccountId is a business account ID, we can't compare directly
          // So we use username matching as the primary method
          const businessParticipant = businessAccountUsername
            ? participants.find((p: any) => p.username === businessAccountUsername)
            : null
          
          // Find the OTHER participant (not the business account)
          const other = participants.find((p: any) => {
            // Skip if this is the business account participant (by username)
            if (businessParticipant && p.id === businessParticipant.id) {
              return false
            }
            // Skip if this matches igAccountId (shouldn't happen, but just in case)
            if (p.id === igAccountId) {
              return false
            }
            return true
          }) ?? (participants.length > 1 ? participants[1] : participants[0])
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:470',message:'getConversationParticipantId result',data:{participants:participants.map((p:any)=>p.id),igAccountId,businessAccountUsername,businessParticipantId:businessParticipant?.id,otherId:other?.id,otherUsername:other?.username},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'H'})}).catch(()=>{});
          // #endregion
          
          return other?.id ?? null
        }

        let participantIgsid = getConversationParticipantId(conversationDetail, igAccountId, businessAccountUsername)
        
        // Identify the business account's IGSID from participants (for direction detection)
        const businessParticipant = businessAccountUsername
          ? participants.find((p: any) => p.username === businessAccountUsername)
          : null
        if (businessParticipant && !businessAccountIgsid) {
          businessAccountIgsid = businessParticipant.id
          console.log('[Instagram Inbox Sync] Identified business account IGSID:', businessAccountIgsid)
        }

        // Fallback: derive from messages if participants list doesn't have the other user
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
          // Remove business account IGSID if we've identified it
          if (businessAccountIgsid) {
            allIds.delete(businessAccountIgsid)
          }
          // Also remove business account ID (won't match, but keep for safety)
          allIds.delete(igAccountId)
          const otherParticipantFromMessages = Array.from(allIds)[0]
          if (otherParticipantFromMessages) {
            participantIgsid = otherParticipantFromMessages
            console.log('[Instagram Inbox Sync] Derived participant from messages:', participantIgsid)
          }
        }

        // Final fallback - use deterministic placeholder
        if (!participantIgsid) {
          participantIgsid = `UNKNOWN_${conversation.id.slice(-20)}`
          console.warn('[Instagram Inbox Sync] Skipping conversation with no participant', {
            igAccountId,
            conversationId: conversation.id,
            participants: conversationDetail.participants?.data,
          })
          // Skip this conversation - don't upsert it
          continue
        }

        // Step 2c: Process messages (store them to insert after conversation is upserted)
        let lastMessageText: string | null = null
        let lastMessageTime: string = conversation.updated_time
        const messagesToInsert: Array<{
          id: string
          ig_account_id: string
          conversation_id: string
          direction: 'inbound' | 'outbound'
          from_id: string
          to_id: string | null
          text: string | null
          attachments: any
          created_time: string
          read_at: string | null
          raw: any
        }> = []

        // Find the most recent message first (by comparing timestamps)
        let mostRecentMessage: typeof messages[0] | null = null
        let mostRecentTime = new Date(0).toISOString()
        
        for (const message of messages) {
          if (message.created_time && new Date(message.created_time) > new Date(mostRecentTime)) {
            mostRecentTime = message.created_time
            mostRecentMessage = message
          }
        }
        
        // Set last message preview from the most recent message
        if (mostRecentMessage) {
          lastMessageTime = mostRecentMessage.created_time
          if (mostRecentMessage.message) {
            lastMessageText = mostRecentMessage.message
          }
        }

        for (const message of messages) {
          try {
            // Determine direction by comparing with business account IGSID (not business account ID)
            // If we haven't identified the business account IGSID yet, use a fallback
            let direction: 'inbound' | 'outbound' = 'inbound'
            if (businessAccountIgsid && message.from.id === businessAccountIgsid) {
              direction = 'outbound'
            } else if (!businessAccountIgsid) {
              // Fallback: if business account username matches, assume it's us
              const fromParticipant = participants.find((p: any) => p.id === message.from.id)
              if (fromParticipant && businessAccountUsername && fromParticipant.username === businessAccountUsername) {
                direction = 'outbound'
                // Store this as the business account IGSID for future messages
                if (!businessAccountIgsid) {
                  businessAccountIgsid = message.from.id
                }
              }
            }

            // Extract to_id - handle both formats
            let toId: string | null = null
            if (message.to?.id) {
              toId = message.to.id
            } else if (message.to?.data && message.to.data.length > 0) {
              toId = message.to.data[0].id
            }

            // Store message to insert after conversation is upserted
            messagesToInsert.push({
              id: message.id,
              ig_account_id: igAccountId,
              conversation_id: conversation.id, // Will be updated if conversation ID changes due to conflict
              direction,
              from_id: message.from.id,
              to_id: toId,
              text: message.message || null,
              attachments: message.attachments || null,
              created_time: message.created_time,
              read_at: direction === 'outbound' ? message.created_time : null,
              raw: message,
            })
          } catch (msgError: any) {
            errors.push(`Failed to process message: ${msgError.message}`)
            continue
          }
        }

        // Step 2d: Prepare conversation for upsert (with messages attached)
        conversationsToUpsert.push({
          id: conversation.id,
          ig_account_id: igAccountId,
          participant_igsid: participantIgsid,
          updated_time: conversation.updated_time,
          last_message_at: lastMessageTime,
          last_message_preview: lastMessageText ? lastMessageText.substring(0, 100) : null,
          messages: messagesToInsert, // Attach messages to conversation
          participantIgsid, // Store for identity resolution
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
      console.log('[Instagram Inbox Sync] Upserting conversations', {
        count: conversationsToUpsert.length,
        ids: conversationsToUpsert.map(c => c.id),
        participants: conversationsToUpsert.map(c => c.participant_igsid),
        participantSet: Array.from(new Set(conversationsToUpsert.map(c => c.participant_igsid))),
      })

      for (const conv of conversationsToUpsert) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:520',message:'Upserting conversation',data:{conversationId:conv.id,participantIgsid:conv.participant_igsid,igAccountId:conv.ig_account_id},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
        // #endregion

        // First, check if a conversation with the same (ig_account_id, participant_igsid) already exists
        // If it does, we'll update that one instead of creating a new one
        const { data: existingConv } = await (supabase
          .from('instagram_conversations') as any)
          .select('id')
          .eq('ig_account_id', conv.ig_account_id)
          .eq('participant_igsid', conv.participant_igsid)
          .maybeSingle()

        let finalConversationId = conv.id

        if (existingConv) {
          // Update existing conversation
          const { error: updateError } = await (supabase
            .from('instagram_conversations') as any)
            .update({
              updated_time: conv.updated_time,
              last_message_at: conv.last_message_at,
              last_message_preview: conv.last_message_preview,
            })
            .eq('id', existingConv.id)

          if (updateError) {
            errors.push(`Failed to update conversation ${existingConv.id}: ${updateError.message}`)
            continue
          }

          conversationsUpserted++
          finalConversationId = existingConv.id
          // Update the conversation ID in our list so messages reference the correct ID
          conv.id = existingConv.id
        } else {
          // Insert new conversation using upsert on primary key only
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
            // If it's a unique constraint violation on (ig_account_id, participant_igsid), find and update
            if (convError.code === '23505' || convError.message?.includes('unique constraint')) {
              const { data: existing } = await (supabase
                .from('instagram_conversations') as any)
                .select('id')
                .eq('ig_account_id', conv.ig_account_id)
                .eq('participant_igsid', conv.participant_igsid)
                .maybeSingle()

              if (existing) {
                const { error: updateError } = await (supabase
                  .from('instagram_conversations') as any)
                  .update({
                    updated_time: conv.updated_time,
                    last_message_at: conv.last_message_at,
                    last_message_preview: conv.last_message_preview,
                  })
                  .eq('id', existing.id)

                if (!updateError) {
                  conversationsUpserted++
                  finalConversationId = existing.id
                  conv.id = existing.id
                } else {
                  errors.push(`Failed to update conversation ${existing.id}: ${updateError.message}`)
                  continue
                }
              } else {
                errors.push(`Failed to upsert conversation ${conv.id}: ${convError.message}`)
                continue
              }
            } else {
              errors.push(`Failed to upsert conversation ${conv.id}: ${convError.message}`)
              continue
            }
          } else {
            conversationsUpserted++
          }
        }

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:600',message:'Conversation upsert complete',data:{conversationId:finalConversationId,originalId:conv.id,wasUpdated:!!existingConv},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
        // #endregion

        // Step 4: Insert messages for this conversation (only if conversation was successfully upserted)
        if (conv.messages && conv.messages.length > 0) {
          for (const msg of conv.messages) {
            try {
              // Update conversation_id in case it changed due to conflict resolution
              msg.conversation_id = conv.id

              const { error: msgError } = await (supabase
                .from('instagram_messages') as any)
                .upsert({
                  id: msg.id,
                  ig_account_id: msg.ig_account_id,
                  conversation_id: msg.conversation_id,
                  direction: msg.direction,
                  from_id: msg.from_id,
                  to_id: msg.to_id,
                  text: msg.text,
                  attachments: msg.attachments,
                  created_time: msg.created_time,
                  read_at: msg.read_at,
                  raw: msg.raw,
                }, {
                  onConflict: 'id',
                })

              if (msgError) {
                errors.push(`Failed to upsert message ${msg.id}: ${msgError.message}`)
                continue
              }
              
              messagesUpserted++
            } catch (msgError: any) {
              errors.push(`Failed to process message: ${msgError.message}`)
              continue
            }
          }

          // Step 4a: Resolve participant identity (after all messages are inserted)
          if (conv.participantIgsid && !conv.participantIgsid.startsWith('UNKNOWN_') && !identitiesResolved.has(conv.participantIgsid)) {
            try {
              await resolveMessagingUserProfile(
                businessLocationId,
                igAccountId,
                conv.participantIgsid
              )
              identitiesResolved.add(conv.participantIgsid)
            } catch (identityError: any) {
              // Non-blocking
              console.warn('[Instagram Inbox Sync] Failed to resolve identity:', {
                participantIgsid: conv.participantIgsid,
                error: identityError.message,
              })
            }
          }
        }
      }
    }

    // Step 5: After all conversations are synced, collect all participant IDs and resolve identities in batch
    const allParticipantIds = Array.from(
      new Set(
        conversationsToUpsert
          .map(c => c.participant_igsid)
          .filter((id): id is string => !!id && !id.startsWith('UNKNOWN_'))
      )
    )

    if (allParticipantIds.length > 0) {
      console.log('[Instagram Inbox Sync] Resolving identities for participants:', {
        participantIds: allParticipantIds,
        count: allParticipantIds.length,
      })

      for (const participantId of allParticipantIds) {
        if (!identitiesResolved.has(participantId)) {
          try {
            await resolveMessagingUserProfile(
              businessLocationId,
              igAccountId,
              participantId
            )
            identitiesResolved.add(participantId)
          } catch (identityError: any) {
            // Non-blocking
            console.warn('[Instagram Inbox Sync] Failed to resolve identity:', {
              participantId,
              error: identityError.message,
            })
          }
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

