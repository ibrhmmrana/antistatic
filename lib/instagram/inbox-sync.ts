/**
 * Instagram Inbox Sync
 * 
 * Syncs conversations and messages from Instagram Messaging API
 * into Supabase tables: instagram_conversations and instagram_messages
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/supabase/database.types'
import { resolveMessagingUserProfile } from './messaging-user-profile'
import { normalizeProfilePicUrl } from './normalize-profile-pic'

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
 * Discover and persist self_scoped_id from conversation participants
 * 
 * Finds the participant where participant.username === instagram_connections.instagram_username
 * and stores that participant's id as self_scoped_id in instagram_connections.
 * 
 * @param supabase - Supabase client
 * @param igAccountId - Instagram professional account ID
 * @param participants - Array of participants from conversation API
 * @param businessAccountUsername - Our Instagram username from instagram_connections
 * @returns The self_scoped_id (or null if not found)
 */
async function discoverAndPersistSelfScopedId(
  supabase: any,
  igAccountId: string,
  participants: Array<{ id: string; username?: string }>,
  businessAccountUsername: string | null,
  accessToken?: string
): Promise<string | null> {
  // Helper function to persist self_scoped_id
  const persistSelfScopedId = async (selfScopedId: string) => {
    const { data: existingConnection } = await (supabase
      .from('instagram_connections') as any)
      .select('self_scoped_id')
      .eq('instagram_user_id', igAccountId)
      .maybeSingle()

    // If not stored or different, update it
    if (!existingConnection?.self_scoped_id || existingConnection.self_scoped_id !== selfScopedId) {
      const { error } = await (supabase
        .from('instagram_connections') as any)
        .update({ self_scoped_id: selfScopedId })
        .eq('instagram_user_id', igAccountId)

      if (error) {
        console.error('[Instagram Inbox Sync] Failed to persist self_scoped_id:', {
          igAccountId,
          selfScopedId,
          error: error.message,
        })
      } else {
        console.log('[Instagram Inbox Sync] Discovered and persisted self_scoped_id:', {
          igAccountId,
          selfScopedId,
          username: businessAccountUsername,
          wasNew: !existingConnection?.self_scoped_id,
        })
      }
    }
  }

  // Strategy 1: Match by username if available
  if (businessAccountUsername) {
    const selfParticipant = participants.find((p: any) => p.username === businessAccountUsername)
    if (selfParticipant) {
      const selfScopedId = selfParticipant.id
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:263',message:'Discovered self_scoped_id by username',data:{igAccountId,selfScopedId,businessAccountUsername,method:'username_match'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      await persistSelfScopedId(selfScopedId)
      return selfScopedId
    }
  }

  // Strategy 2: If username match failed, try GET /me to get our account info
  if (accessToken && participants.length > 0) {
    try {
      const API_BASE = 'https://graph.instagram.com'
      const API_VERSION = 'v24.0'
      const meUrl = `${API_BASE}/${API_VERSION}/me?fields=id,username&access_token=${accessToken}`
      const meRes = await fetch(meUrl)
      
      if (meRes.ok) {
        const meData = await meRes.json()
        // meData.id is the professional account ID (igAccountId), not the scoped ID
        // But we can try to match by username from GET /me
        if (meData.username) {
          const selfParticipant = participants.find((p: any) => p.username === meData.username)
          if (selfParticipant) {
            const selfScopedId = selfParticipant.id
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:295',message:'Discovered self_scoped_id by GET /me',data:{igAccountId,selfScopedId,meUsername:meData.username,method:'get_me'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            // Persist it
            await persistSelfScopedId(selfScopedId)
            console.log('[Instagram Inbox Sync] Discovered self_scoped_id via GET /me:', {
              igAccountId,
              selfScopedId,
              meUsername: meData.username,
            })
            
            return selfScopedId
          }
        }
      }
    } catch (meError: any) {
      console.warn('[Instagram Inbox Sync] Failed to use GET /me for self_scoped_id discovery:', meError.message)
    }
  }

  return null
}

/**
 * Upsert participant identity into instagram_user_cache from API response data
 * 
 * @param supabase - Supabase client
 * @param igAccountId - Instagram account ID (ALWAYS required, NOT NULL)
 * @param participantId - Participant IGSID
 * @param participantData - Participant data from API (username, name, profile_pic)
 * @param selfScopedId - Business account scoped ID (to guard against storing self)
 */
async function upsertParticipantIdentityFromApi(
  supabase: any,
  igAccountId: string,
  participantId: string,
  participantData: {
    id: string
    username?: string | null
    name?: string | null
    profile_pic?: string | null
  },
  selfScopedId: string | null = null
): Promise<void> {
  // Guard: Never store selfScopedId as participant identity
  if (selfScopedId && participantId === selfScopedId) {
    console.warn('[Instagram Inbox Sync] Skipping identity cache for selfScopedId:', {
      participantId,
      igAccountId,
    })
    return
  }

  // Guard: ig_account_id must always be set
  if (!igAccountId) {
    console.error('[Instagram Inbox Sync] Cannot cache identity without ig_account_id:', {
      participantId,
    })
    return
  }

  // Log raw participant object once when username is missing (for debugging)
  if (!participantData.username) {
    console.warn('[Instagram Inbox Sync] Participant missing username - logging raw object:', {
      participantId,
      igAccountId,
      rawParticipant: JSON.stringify(participantData),
    })
  }

  // Normalize profile pic URL from participant data
  const normalizedProfilePic = normalizeProfilePicUrl(participantData)
  
  // Check existing cache to avoid overwriting non-null profile pic with null
  const { data: existingCache } = await (supabase
    .from('instagram_user_cache') as any)
    .select('profile_pic, profile_pic_url')
    .eq('ig_account_id', igAccountId)
    .eq('ig_user_id', participantId)
    .maybeSingle()
  
  // Use COALESCE behavior: prefer new value if non-null, otherwise keep existing
  const finalProfilePic = normalizedProfilePic || existingCache?.profile_pic_url || existingCache?.profile_pic || null
  
  // Upsert into cache
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:397',message:'Cache upsert payload',data:{igAccountId,ig_user_id:participantId,username:participantData.username,name:participantData.name,hasNewProfilePic:!!normalizedProfilePic,hasExistingProfilePic:!!(existingCache?.profile_pic_url||existingCache?.profile_pic),finalProfilePic:!!finalProfilePic,profilePicHostname:finalProfilePic?new URL(finalProfilePic).hostname:null,selfScopedId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  const { error } = await (supabase
    .from('instagram_user_cache') as any)
    .upsert({
      ig_account_id: igAccountId, // ALWAYS set (NOT NULL)
      ig_user_id: participantId,
      username: participantData.username || null,
      name: participantData.name || null,
      profile_pic: finalProfilePic, // Store with COALESCE behavior
      profile_pic_url: finalProfilePic, // Also store as profile_pic_url for backward compatibility
      last_fetched_at: new Date().toISOString(),
    }, {
      onConflict: 'ig_account_id,ig_user_id', // Unique index ensures no cross-account overwrites
    })
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:301',message:'Cache upsert result',data:{igAccountId,ig_user_id:participantId,username:participantData.username,error:error?.message,success:!error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion

  if (error) {
    console.error('[Instagram Inbox Sync] Failed to upsert participant identity:', {
      participantId,
      igAccountId,
      error: error.message,
    })
  } else {
    console.log('[Instagram Inbox Sync] Cached participant identity:', {
      participantId,
      igAccountId,
      username: participantData.username,
      hasProfilePic: !!finalProfilePic,
      profilePicHostname: finalProfilePic ? new URL(finalProfilePic).hostname : null,
      wasEnriched: !!normalizedProfilePic,
      preservedExisting: !normalizedProfilePic && !!(existingCache?.profile_pic_url || existingCache?.profile_pic),
    })
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
  participants?: { data: Array<{ id: string; username?: string; name?: string; profile_pic?: string }> }
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
    // Format: fields=participants{username,id,profile_pic,name},messages{from,to,message,created_time,id,attachments}
    // Note: Added 'name' field to participants for better identity caching
    const fields = 'participants{username,id,profile_pic,name},messages{from,to,message,created_time,id,attachments}'
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
    // Step 0: Get connection data including self_scoped_id
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('instagram_username, instagram_user_id, self_scoped_id')
      .eq('instagram_user_id', igAccountId)
      .maybeSingle()
    
    const businessAccountUsername = connection?.instagram_username || null
    let selfScopedId: string | null = connection?.self_scoped_id || null
    
    // DEBUG: Log identity setup
    const DEBUG = process.env.DEBUG_INSTAGRAM_INBOX === 'true'
    if (DEBUG) {
      console.log('[Instagram Inbox Sync] Identity setup:', {
        ig_account_id: igAccountId,
        instagram_username: businessAccountUsername,
        self_scoped_id: selfScopedId,
        self_scoped_id_source: selfScopedId ? 'stored' : 'needs_discovery',
      })
    }
    
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
      is_group: boolean
      participant_count: number
      updated_time: string
      last_message_at: string
      last_message_preview: string | null
      messages?: Array<{
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
      }>
      participantIgsid?: string
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
        const participantCount = participants.length

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:614',message:'Conversation participants from API',data:{conversationId:conversation.id,participantCount,participants:participants.map((p:any)=>({id:p.id,username:p.username,name:p.name})),businessAccountUsername,selfScopedId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        // Step 2b: Discover and persist self_scoped_id if not already stored
        if (!selfScopedId) {
          const discoveredSelfScopedId = await discoverAndPersistSelfScopedId(
            supabase,
            igAccountId,
            participants,
            businessAccountUsername,
            accessToken
          )
          if (discoveredSelfScopedId) {
            selfScopedId = discoveredSelfScopedId
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:636',message:'Discovered self_scoped_id',data:{conversationId:conversation.id,selfScopedId:discoveredSelfScopedId,businessAccountUsername},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
          }
        }

        // DEBUG: Log conversation details
        const DEBUG = process.env.DEBUG_INSTAGRAM_INBOX === 'true'
        if (DEBUG) {
          console.log('[Instagram Inbox Sync] Conversation detail:', {
            conversationId: conversation.id,
            ig_account_id: igAccountId,
            instagram_username: businessAccountUsername,
            self_scoped_id: selfScopedId,
            participant_count: participantCount,
            participant_ids: participants.map((p: any) => p.id),
            participants: participants.map((p: any) => ({
              id: p.id,
              username: p.username,
              is_self: selfScopedId ? p.id === selfScopedId : p.username === businessAccountUsername,
            })),
            first3Messages: messages.slice(0, 3).map((m: any) => ({
              id: m.id,
              fromId: m.from?.id,
              toId: m.to?.id || m.to?.data?.[0]?.id,
              createdTime: m.created_time,
              text: m.message?.substring(0, 50),
            })),
          })
        }

        // Step 2c: Determine if this is a group chat and select participant
        const isGroup = participantCount > 2
        let participantIgsid: string | null = null

        if (isGroup) {
          // For group chats, set participant_igsid to NULL or synthetic value
          // We'll use a synthetic value: GROUP:<conversation_id> for easier querying
          participantIgsid = `GROUP:${conversation.id}`
          
          if (DEBUG) {
            console.log('[Instagram Inbox Sync] Group chat detected:', {
              conversationId: conversation.id,
              participantCount,
              syntheticParticipantIgsid: participantIgsid,
            })
          }
        } else {
          // For 1:1 chats, find the OTHER participant (not self)
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:675',message:'1:1 chat participant selection',data:{conversationId:conversation.id,selfScopedId,businessAccountUsername,participantCount,participants:participants.map((p:any)=>({id:p.id,username:p.username}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          if (!selfScopedId) {
            console.warn('[Instagram Inbox Sync] Cannot determine participant without self_scoped_id:', {
              conversationId: conversation.id,
              participants: participants.map((p: any) => ({ id: p.id, username: p.username })),
            })
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:681',message:'Skipping conversation - no self_scoped_id',data:{conversationId:conversation.id,participants:participants.map((p:any)=>({id:p.id,username:p.username}))},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            continue
          }

          // Find participant that is NOT self_scoped_id
          const otherParticipant = participants.find((p: any) => p.id !== selfScopedId)
          
          if (!otherParticipant) {
            console.warn('[Instagram Inbox Sync] Cannot find other participant in 1:1 chat:', {
              conversationId: conversation.id,
              selfScopedId,
              participants: participants.map((p: any) => ({ id: p.id, username: p.username })),
            })
            continue
          }

          participantIgsid = otherParticipant.id

          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:696',message:'Participant selected',data:{conversationId:conversation.id,participantIgsid,selfScopedId,otherParticipantId:otherParticipant.id,otherParticipantUsername:otherParticipant.username,businessAccountUsername},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion

          // Guard: Never store self_scoped_id as participant_igsid
          if (participantIgsid === selfScopedId) {
            console.error('[Instagram Inbox Sync] CRITICAL: participant_igsid matches self_scoped_id!', {
              conversationId: conversation.id,
              participantIgsid,
              selfScopedId,
            })
            continue
          }

          // Step 2d: Fetch full participant profile (including profile pic) and cache it
          try {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:710',message:'Before fetching participant profile',data:{igAccountId,participantIgsid,participantUsername:otherParticipant.username,participantName:otherParticipant.name,selfScopedId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
            
            // First, try to fetch full profile including profile pic
            let enrichedProfilePic: string | null = null
            try {
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:798',message:'Calling resolveMessagingUserProfile',data:{businessLocationId,igAccountId,participantIgsid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              const profileResult = await resolveMessagingUserProfile(
                businessLocationId,
                igAccountId,
                participantIgsid
              )
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:805',message:'resolveMessagingUserProfile returned',data:{igAccountId,participantIgsid,hasResult:!!profileResult,hasProfilePicUrl:!!profileResult?.profile_pic_url,hasProfilePic:!!profileResult?.profile_pic,username:profileResult?.username,profilePicUrl:profileResult?.profile_pic_url,profilePic:profileResult?.profile_pic},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              if (profileResult?.profile_pic_url || profileResult?.profile_pic) {
                enrichedProfilePic = profileResult.profile_pic_url || profileResult.profile_pic
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:809',message:'Fetched participant profile with pic',data:{igAccountId,participantIgsid,hasProfilePic:!!enrichedProfilePic,profilePicHostname:enrichedProfilePic?new URL(enrichedProfilePic).hostname:null,enrichedProfilePic},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
              } else {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:813',message:'Profile result has no pic',data:{igAccountId,participantIgsid,hasResult:!!profileResult,resultKeys:profileResult?Object.keys(profileResult):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
              }
            } catch (profileError: any) {
              // Non-blocking - log but continue with basic identity
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:818',message:'Profile fetch error',data:{igAccountId,participantIgsid,error:profileError?.message,errorName:profileError?.name,errorStack:profileError?.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              console.warn('[Instagram Inbox Sync] Failed to fetch participant profile (non-blocking):', {
                participantIgsid,
                error: profileError.message,
              })
            }
            
            // Upsert with enriched data (use profile pic from API if available, otherwise keep existing)
            await upsertParticipantIdentityFromApi(
              supabase,
              igAccountId,
              participantIgsid,
              {
                id: otherParticipant.id,
                username: otherParticipant.username,
                name: otherParticipant.name,
                profile_pic: enrichedProfilePic || otherParticipant.profile_pic, // Prefer enriched profile pic
              },
              selfScopedId
            )
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:735',message:'After cache upsert',data:{igAccountId,participantIgsid,participantUsername:otherParticipant.username,hasProfilePic:!!enrichedProfilePic},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
            // #endregion
          } catch (identityError: any) {
            // Non-blocking - log but continue
            console.warn('[Instagram Inbox Sync] Failed to cache participant identity from API:', {
              participantIgsid,
              error: identityError.message,
            })
          }
        }

        // Step 2d: Process messages (store them to insert after conversation is upserted)
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
            // Determine direction using self_scoped_id (NOT ig_account_id)
            // Message is outbound if from_id === self_scoped_id, inbound otherwise
            let direction: 'inbound' | 'outbound' = 'inbound'
            
            if (selfScopedId && message.from.id === selfScopedId) {
              direction = 'outbound'
            } else if (!selfScopedId && businessAccountUsername) {
              // Fallback: check by username if self_scoped_id not available
              const fromParticipant = participants.find((p: any) => p.id === message.from.id)
              if (fromParticipant && fromParticipant.username === businessAccountUsername) {
                direction = 'outbound'
                // Discover and persist self_scoped_id from this message
                if (fromParticipant.id) {
                  await discoverAndPersistSelfScopedId(
                    supabase,
                    igAccountId,
                    participants,
                    businessAccountUsername
                  )
                  selfScopedId = fromParticipant.id
                }
              }
            }

            // DEBUG: Log direction decision for sample messages
            if (DEBUG && messages.indexOf(message) < 3) {
              console.log('[Instagram Inbox Sync] Message direction:', {
                messageId: message.id,
                fromId: message.from.id,
                selfScopedId,
                direction,
                decision: selfScopedId ? (message.from.id === selfScopedId ? 'outbound (from === self)' : 'inbound (from !== self)') : 'fallback_username_check',
              })
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

        // Step 2e: Prepare conversation for upsert (with messages attached)
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:862',message:'Preparing conversation for upsert',data:{conversationId:conversation.id,participantIgsid,isGroup,participantCount,selfScopedId,allParticipantIds:participants.map((p:any)=>p.id),allParticipantUsernames:participants.map((p:any)=>p.username)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        conversationsToUpsert.push({
          id: conversation.id,
          ig_account_id: igAccountId,
          participant_igsid: participantIgsid,
          is_group: isGroup,
          participant_count: participantCount,
          updated_time: conversation.updated_time,
          last_message_at: lastMessageTime,
          last_message_preview: lastMessageText ? lastMessageText.substring(0, 100) : null,
          messages: messagesToInsert, // Attach messages to conversation
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

        // CRITICAL: Use API conversation ID as primary key, NEVER lookup by participant
        // The conversation.id from the API is the canonical identifier
        // participant_igsid is metadata only, not used for uniqueness
        const { error: convError } = await (supabase
          .from('instagram_conversations') as any)
          .upsert({
            id: conv.id, // API conversation/thread ID - this is the primary key
            ig_account_id: conv.ig_account_id,
            participant_igsid: conv.participant_igsid, // Metadata only, not used for uniqueness
            is_group: conv.is_group,
            participant_count: conv.participant_count,
            updated_time: conv.updated_time,
            last_message_at: conv.last_message_at,
            last_message_preview: conv.last_message_preview,
            unread_count: 0, // Will be updated by webhook or manual sync
          }, {
            onConflict: 'id', // ONLY conflict on id (API conversation ID), never on participant
          })

        if (convError) {
          errors.push(`Failed to upsert conversation ${conv.id}: ${convError.message}`)
          console.error('[Instagram Inbox Sync] Conversation upsert error:', {
            conversationId: conv.id,
            error: convError,
          })
          continue
        }

        conversationsUpserted++
        const finalConversationId = conv.id // Always use the API conversation ID

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'inbox-sync.ts:600',message:'Conversation upsert complete',data:{conversationId:finalConversationId,originalId:conv.id,participantIgsid:conv.participant_igsid},timestamp:Date.now(),sessionId:'debug-session',runId:'run2',hypothesisId:'F'})}).catch(()=>{});
        // #endregion

        // Step 4: Insert messages for this conversation (only if conversation was successfully upserted)
        if (conv.messages && conv.messages.length > 0) {
          // DIAGNOSTIC: Check for multi-sender conversations (only warn if NOT a group chat)
          if (!conv.is_group) {
            const inboundSenders = new Set<string>()
            for (const msg of conv.messages) {
              if (msg.direction === 'inbound' && msg.from_id) {
                inboundSenders.add(msg.from_id)
              }
            }
            
            if (inboundSenders.size > 1) {
              console.error('[Instagram Inbox Sync] ⚠️⚠️⚠️ MULTI-SENDER DETECTED IN 1:1 CHAT ⚠️⚠️⚠️', {
                conversationId: conv.id,
                participantIgsid: conv.participant_igsid,
                inboundSenderIds: Array.from(inboundSenders),
                senderCount: inboundSenders.size,
                message: 'Multiple different senders found in same conversation_id - this should NEVER happen in 1:1 chats!',
              })
            }
          }
          
          for (const msg of conv.messages) {
            try {
              // CRITICAL: conversation_id must be the API conversation ID, never a derived/generated ID
              if (!msg.conversation_id || msg.conversation_id.trim() === '') {
                console.error('[Instagram Inbox Sync] Message missing conversation_id - skipping:', {
                  messageId: msg.id,
                  conversationId: conv.id,
                })
                errors.push(`Message ${msg.id} missing conversation_id`)
                continue
              }
              
              // Ensure message uses the API conversation ID (not a generated one)
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

