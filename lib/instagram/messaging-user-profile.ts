/**
 * Instagram Messaging User Profile Fetcher
 * 
 * Fetches user identity (username, name, profile pic) for Instagram Messaging API users.
 * Uses graph.facebook.com (not graph.instagram.com) for messaging user profiles.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/supabase/database.types'
import { getInstagramAccessTokenForAccount, InstagramAuthError, isTokenExpiredError } from './tokens'
import { normalizeProfilePicUrl } from './normalize-profile-pic'

const CACHE_TTL_DAYS = 7
const PROFILE_PIC_REFRESH_HOURS = 48 // Refetch profile pic if older than 48h (URLs expire in ~3 days)
const MAX_FAIL_COUNT = 3
const FETCH_TIMEOUT_MS = 10000 // 10 seconds
const FAIL_COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Generate a trace ID for debugging
 */
function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

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
 * Fetch messaging user profile from Meta Graph API
 * 
 * Uses the SAME base URL and token as sendMessage (graph.instagram.com)
 * 
 * @param recipientIgAccountId - The Instagram account ID that receives messages (our account)
 * @param messagingUserId - The messaging user ID (from webhook sender.id or recipient.id)
 * @param accessToken - Instagram access token from instagram_connections
 * @returns User profile data or null if fetch fails
 */
export async function fetchIgMessagingUserProfile({
  recipientIgAccountId,
  messagingUserId,
  accessToken,
}: {
  recipientIgAccountId: string
  messagingUserId: string
  accessToken: string
}): Promise<{
  username: string | null
  name: string | null
  profile_pic: string | null
  profile_pic_url: string | null
  follower_count: number | null
  is_user_follow_business: boolean | null
  is_business_follow_user: boolean | null
  raw: any
  error?: { status: number; body: any }
} | null> {
  if (!messagingUserId || !accessToken) {
    return null
  }

  try {
    // Step 2: Use graph.facebook.com for User Profile endpoint (not graph.instagram.com)
    // The Instagram Messaging User Profile endpoint is on graph.facebook.com
    // Use profile_pic (NOT profile_pic_url) - this is the correct field name
    const baseUrl = 'https://graph.facebook.com'
    const apiVersion = 'v24.0' // Use v24.0 to match inbox sync API version
    
    // Request profile_pic field (not profile_pic_url) from User Profile endpoint
    let url = `${baseUrl}/${apiVersion}/${messagingUserId}?fields=name,username,profile_pic&access_token=${accessToken}`
    
    // Debug log: request URL (without token)
    console.log('[Instagram Messaging Profile] Fetching user profile:', {
      messagingUserId,
      recipientIgAccountId,
      endpoint: url.replace(accessToken, 'REDACTED'),
      apiVersion,
    })
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:82',message:'Fetching user profile API call',data:{messagingUserId,recipientIgAccountId,endpoint:url.replace(accessToken,'REDACTED'),apiVersion},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    
    const startTime = Date.now()
    const response = await fetch(url, {
      signal: controller.signal,
    })
    const duration = Date.now() - startTime
    
    clearTimeout(timeoutId)
    
    // Debug log: status code
    console.log('[Instagram Messaging Profile] Response received:', {
      messagingUserId,
      recipientIgAccountId,
      status: response.status,
      statusText: response.statusText,
      durationMs: duration,
    })
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:95',message:'Profile API response received',data:{messagingUserId,recipientIgAccountId,status:response.status,statusText:response.statusText,durationMs:duration},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    const responseBody = await response.text()
    let responseData: any = {}
    try {
      responseData = JSON.parse(responseBody)
    } catch {
      responseData = { _raw: responseBody.substring(0, 500) }
    }
    
    if (!response.ok) {
      const errorSnippet = JSON.stringify(responseData).substring(0, 500)
      
      // Check if this is a token expiry error (code 190)
      if (isTokenExpiredError(responseData)) {
        console.log('[Instagram Messaging Profile] Token expired:', {
          messagingUserId,
          recipientIgAccountId,
          httpStatus: response.status,
        })
        throw new InstagramAuthError('EXPIRED', 'Instagram access token has expired')
      }
      
      console.log('[Instagram Messaging Profile] Fetch failed:', {
        messagingUserId,
        recipientIgAccountId,
        httpStatus: response.status,
        statusText: response.statusText,
        responseLength: responseBody.length,
        errorSnippet,
        endpoint: url.replace(accessToken, 'REDACTED'),
        tokenSource: 'instagram_connections.access_token',
        durationMs: duration,
        timeoutHit: false,
      })
      
      return {
        username: null,
        name: null,
        profile_pic: null,
        profile_pic_url: null,
        follower_count: null,
        is_user_follow_business: null,
        is_business_follow_user: null,
        raw: responseData,
        error: {
          status: response.status,
          body: responseData,
        },
      }
    }
    
    const data = responseData
    
    // Step 2: Log raw response fields to verify profile_pic exists
    const responseKeys = Object.keys(data).filter(k => !k.startsWith('_'))
    console.log('[Instagram Messaging Profile] Raw API response keys:', responseKeys)
    console.log('[Instagram Messaging Profile] Raw profile_pic field:', {
      hasProfilePic: 'profile_pic' in data,
      profilePicValue: data.profile_pic,
      profilePicType: typeof data.profile_pic,
    })
    
    // Extract fields - normalize profile pic from various possible field names
    const profilePic = normalizeProfilePicUrl(data)
    
    console.log('[Instagram Messaging Profile] Fetch succeeded:', {
      messagingUserId,
      recipientIgAccountId,
      hasName: !!data.name,
      hasProfilePic: !!profilePic,
      hasUsername: !!data.username,
      profilePicHostname: profilePic ? new URL(profilePic).hostname : null,
      responseKeys,
      responseStatus: response.status,
      durationMs: duration,
      endpoint: url.replace(accessToken, 'REDACTED'),
      rawProfilePic: data.profile_pic, // Log raw value
    })
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:168',message:'Profile fetch succeeded',data:{messagingUserId,recipientIgAccountId,hasName:!!data.name,hasProfilePic:!!profilePic,hasUsername:!!data.username,profilePicHostname:profilePic?new URL(profilePic).hostname:null,responseKeys,responseStatus:response.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // If profile pic is missing, log raw response preview for debugging
    if (!profilePic) {
      console.warn('[Instagram Messaging Profile] Profile pic missing from response:', {
        messagingUserId,
        recipientIgAccountId,
        responseKeys,
        rawResponsePreview: JSON.stringify(data).substring(0, 500),
      })
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:183',message:'Profile pic missing from response',data:{messagingUserId,recipientIgAccountId,responseKeys,rawResponsePreview:JSON.stringify(data).substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    }
    
    return {
      username: data.username || null,
      name: data.name || null,
      profile_pic_url: profilePic, // Store as profile_pic_url (canonical)
      profile_pic: profilePic, // Also store as profile_pic for backward compatibility
      follower_count: data.follower_count || null,
      is_user_follow_business: data.is_user_follow_business || null,
      is_business_follow_user: data.is_business_follow_user || null,
      raw: data,
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('[Instagram Messaging Profile] Fetch timeout:', {
        messagingUserId,
        recipientIgAccountId,
        timeoutMs: FETCH_TIMEOUT_MS,
        tokenSource: 'instagram_connections.access_token',
        timeoutHit: true,
      })
      
      return {
        username: null,
        name: null,
        profile_pic: null,
        profile_pic_url: null,
        follower_count: null,
        is_user_follow_business: null,
        is_business_follow_user: null,
        raw: { error: 'Timeout', timeoutMs: FETCH_TIMEOUT_MS },
        error: {
          status: 408,
          body: { error: 'Request timeout' },
        },
      }
    } else {
      console.log('[Instagram Messaging Profile] Fetch error:', {
        messagingUserId,
        recipientIgAccountId,
        message: error.message,
        tokenSource: 'instagram_connections.access_token',
        errorName: error.name,
      })
      
      return {
        username: null,
        name: null,
        profile_pic: null,
        profile_pic_url: null,
        follower_count: null,
        is_user_follow_business: null,
        is_business_follow_user: null,
        raw: { error: error.message, errorName: error.name },
        error: {
          status: 500,
          body: { error: error.message },
        },
      }
    }
  }
}

/**
 * Resolve and cache Instagram Messaging user profile
 * 
 * @param businessLocationId - Business location ID
 * @param recipientIgAccountId - The Instagram account ID (from instagram_connections.instagram_user_id)
 * @param messagingUserId - The messaging user ID (IGSID from webhook sender.id or recipient.id)
 * @returns Resolved user info or null if not found/failed
 */
export async function resolveMessagingUserProfile(
  businessLocationId: string,
  recipientIgAccountId: string,
  messagingUserId: string
): Promise<{
  username: string | null
  name: string | null
  profile_pic: string | null
  profile_pic_url: string | null
  follower_count: number | null
  is_user_follow_business: boolean | null
  is_business_follow_user: boolean | null
} | null> {
  const traceId = generateTraceId()
  
  // A) Log start
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:285',message:'start',data:{traceId,recipientIgAccountId,messagingUserId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  
  if (!messagingUserId || !recipientIgAccountId) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:290',message:'returning_null_invalid_params',data:{traceId,messagingUserId,recipientIgAccountId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return null
  }

  const supabase = createServiceRoleClient()
  
  try {
    // Check cache first (scoped by ig_account_id)
    const { data: cached, error: cacheError } = await (supabase
      .from('instagram_user_cache') as any)
      .select('username, name, profile_pic, profile_pic_url, follower_count, is_user_follow_business, is_business_follow_user, last_fetched_at, fail_count, last_failed_at')
      .eq('ig_account_id', recipientIgAccountId)
      .eq('ig_user_id', messagingUserId)
      .maybeSingle()
    
    // A) Log cache state
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:300',message:'cache_state',data:{traceId,cache_hit:!!cached,cached_username:cached?.username,cached_name:cached?.name,cached_profile_pic:!!cached?.profile_pic,cached_profile_pic_url:!!cached?.profile_pic_url,cached_fail_count:cached?.fail_count||0,last_failed_at:cached?.last_failed_at,last_fetched_at:cached?.last_fetched_at,cacheError:cacheError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    if (cacheError) {
      console.log('[Instagram Messaging Profile] Cache lookup error:', {
        messagingUserId,
        error: cacheError.message,
      })
    }
    
    // Determine if we need to force a refetch
    let forceRefetch = false
    let daysSinceFetch = 0
    let hoursSinceFetch = 0
    
    if (cached && cached.last_fetched_at) {
      const lastFetched = new Date(cached.last_fetched_at)
      const now = new Date()
      daysSinceFetch = (now.getTime() - lastFetched.getTime()) / (1000 * 60 * 60 * 24)
      hoursSinceFetch = (now.getTime() - lastFetched.getTime()) / (1000 * 60 * 60)
      const hasProfilePic = !!(cached.profile_pic || cached.profile_pic_url)
      
      // Force refetch if:
      // 1. Profile pic is missing (even if cache is recent)
      // 2. Profile pic exists but is stale (> 48h old, since URLs expire in ~3 days)
      // 3. Cache is stale (> 7 days)
      if (!hasProfilePic && (cached.username || cached.name)) {
        forceRefetch = true
      } else if (hasProfilePic && hoursSinceFetch > PROFILE_PIC_REFRESH_HOURS) {
        forceRefetch = true
      } else if (daysSinceFetch >= CACHE_TTL_DAYS) {
        forceRefetch = true
      }
      
      // If cache is fresh and has profile pic, return it
      if (!forceRefetch && daysSinceFetch < CACHE_TTL_DAYS && (cached.username || cached.name) && hasProfilePic) {
        console.log('[Instagram Messaging Profile] Using cached data:', {
          messagingUserId,
          username: cached.username,
          name: cached.name,
          hasProfilePic,
          daysSinceFetch: daysSinceFetch.toFixed(1),
        })
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:330',message:'returning_cached_data',data:{traceId,messagingUserId,hasProfilePic,daysSinceFetch},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        return {
          username: cached.username,
          name: cached.name,
          profile_pic: cached.profile_pic || cached.profile_pic_url,
          profile_pic_url: cached.profile_pic || cached.profile_pic_url,
          follower_count: cached.follower_count,
          is_user_follow_business: cached.is_user_follow_business,
          is_business_follow_user: cached.is_business_follow_user,
        }
      }
    }
    
    // A) Log forceRefetch effective
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:350',message:'forceRefetch_effective',data:{traceId,forceRefetch,daysSinceFetch,hoursSinceFetch,hasCached:!!cached,hasUsername:!!cached?.username,hasProfilePic:!!(cached?.profile_pic||cached?.profile_pic_url)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Step 4: Check fail_count / cooldown - but bypass if forceRefetch is true OR if profile pic is missing
    // A) Log fail_count_check
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:355',message:'fail_count_check',data:{traceId,hasCached:!!cached,fail_count:cached?.fail_count||0,MAX_FAIL_COUNT,forceRefetch,last_failed_at:cached?.last_failed_at,hasProfilePic:!!(cached?.profile_pic||cached?.profile_pic_url),hasUsername:!!cached?.username},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Step 4: If cache has username but missing profile pic, treat as stale and allow fetch
    // This prevents caching "no pic" forever
    const shouldBypassCooldown = forceRefetch || (cached && cached.username && !(cached.profile_pic || cached.profile_pic_url))
    
    if (cached && cached.fail_count >= MAX_FAIL_COUNT && !shouldBypassCooldown) {
      if (cached.last_failed_at) {
        const lastFailed = new Date(cached.last_failed_at)
        const now = new Date()
        const minutesSinceFailure = (now.getTime() - lastFailed.getTime()) / (1000 * 60)
        const cooldownMinutes = FAIL_COOLDOWN_MS / (1000 * 60)
        
        if (minutesSinceFailure < cooldownMinutes) {
          console.log('[Instagram Messaging Profile] Skipping fetch (cooldown):', {
            messagingUserId,
            fail_count: cached.fail_count,
            minutesSinceFailure: minutesSinceFailure.toFixed(1),
            cooldownMinutes,
          })
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:365',message:'returning_due_to_fail_count_cooldown',data:{traceId,messagingUserId,fail_count:cached.fail_count,minutesSinceFailure,cooldownMinutes},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          return {
            username: cached.username,
            name: cached.name,
            profile_pic: cached.profile_pic || cached.profile_pic_url,
            profile_pic_url: cached.profile_pic || cached.profile_pic_url,
            follower_count: cached.follower_count,
            is_user_follow_business: cached.is_user_follow_business,
            is_business_follow_user: cached.is_business_follow_user,
          }
        }
      } else {
        // No last_failed_at, but fail_count is high - still skip (unless forceRefetch)
        console.log('[Instagram Messaging Profile] Skipping fetch (max fails reached):', {
          messagingUserId,
          fail_count: cached.fail_count,
        })
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:380',message:'returning_due_to_max_fails',data:{traceId,messagingUserId,fail_count:cached.fail_count},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        return {
          username: cached.username,
          name: cached.name,
          profile_pic: cached.profile_pic || cached.profile_pic_url,
          profile_pic_url: cached.profile_pic || cached.profile_pic_url,
          follower_count: cached.follower_count,
          is_user_follow_business: cached.is_user_follow_business,
          is_business_follow_user: cached.is_business_follow_user,
        }
      }
    }
    
    if (cached && cached.fail_count >= MAX_FAIL_COUNT && shouldBypassCooldown) {
      // Step 4: Log cooldown bypass reason
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:395',message:'cooldown_bypassed',data:{traceId,messagingUserId,fail_count:cached.fail_count,forceRefetch,shouldBypassCooldown,reason:forceRefetch?'forceRefetch':'missing_profile_pic'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.log('[Instagram Messaging Profile] Cooldown bypassed:', {
        messagingUserId,
        reason: forceRefetch ? 'forceRefetch flag' : 'missing profile pic',
        fail_count: cached.fail_count,
      })
    }
    
    // A) Load access token
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:400',message:'loading_access_token',data:{traceId,recipientIgAccountId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    let accessToken: string
    try {
      accessToken = await getInstagramAccessTokenForAccount(recipientIgAccountId)
      // A) Log access token loaded
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:405',message:'access_token_loaded',data:{traceId,tokenLength:accessToken?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    } catch (error: any) {
      // Step 4: Log error in catch block with full details
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:408',message:'access_token_error',data:{traceId,error_name:error?.name,error_message:error?.message,error_stack:error?.stack?.substring(0,300),isInstagramAuthError:error instanceof InstagramAuthError},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      console.error('[Instagram Messaging Profile] Access token error:', {
        errorName: error?.name,
        errorMessage: error?.message,
        errorStack: error?.stack?.substring(0, 200),
        traceId,
      })
      
      if (error instanceof InstagramAuthError) {
        console.log('[Instagram Messaging Profile] Auth error:', {
          businessLocationId,
          recipientIgAccountId,
          code: error.code,
          message: error.message,
        })
        
        // Update cache with auth failure
        await (supabase
          .from('instagram_user_cache') as any)
          .upsert({
            ig_account_id: recipientIgAccountId,
            ig_user_id: messagingUserId,
            fail_count: (cached?.fail_count || 0) + 1,
            last_failed_at: new Date().toISOString(),
            raw: { 
              error: error.message,
              code: error.code,
              type: 'auth_error',
            },
          }, {
            onConflict: 'ig_account_id,ig_user_id',
          })
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:430',message:'returning_auth_error',data:{traceId,code:error.code,message:error.message,hasCached:!!cached},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        // C) Return cached data if available, even on auth error
        if (cached) {
          return {
            username: cached.username,
            name: cached.name,
            profile_pic: cached.profile_pic || cached.profile_pic_url,
            profile_pic_url: cached.profile_pic || cached.profile_pic_url,
            follower_count: cached.follower_count,
            is_user_follow_business: cached.is_user_follow_business,
            is_business_follow_user: cached.is_business_follow_user,
          }
        }
        
        // Re-throw to propagate auth error if no cached data
        throw error
      }
      
      console.log('[Instagram Messaging Profile] No connection found:', {
        businessLocationId,
        error: error.message,
      })
      
      // Update cache with failure
      await (supabase
        .from('instagram_user_cache') as any)
        .upsert({
          ig_account_id: recipientIgAccountId,
          ig_user_id: messagingUserId,
          fail_count: (cached?.fail_count || 0) + 1,
          last_failed_at: new Date().toISOString(),
          raw: { error: 'No connection found', businessLocationId },
        }, {
          onConflict: 'ig_account_id,ig_user_id',
        })
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:460',message:'returning_no_connection',data:{traceId,hasCached:!!cached},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      // C) Return cached data if available
      if (cached) {
        return {
          username: cached.username,
          name: cached.name,
          profile_pic: cached.profile_pic || cached.profile_pic_url,
          profile_pic_url: cached.profile_pic || cached.profile_pic_url,
          follower_count: cached.follower_count,
          is_user_follow_business: cached.is_user_follow_business,
          is_business_follow_user: cached.is_business_follow_user,
        }
      }
      
      return null
    }
    
    // A) Log calling fetch profile
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:475',message:'calling_fetch_profile',data:{traceId,messagingUserId,recipientIgAccountId,FETCH_TIMEOUT_MS},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    // Fetch from API (with timeout using Promise.race)
    let timeoutId: NodeJS.Timeout | null = null
    const fetchPromise = fetchIgMessagingUserProfile({
      recipientIgAccountId,
      messagingUserId,
      accessToken,
    })
    
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutId = setTimeout(() => {
        // A) Log timeout
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:485',message:'profile_fetch_timeout_returning_null',data:{traceId,FETCH_TIMEOUT_MS,timeoutFiredAt:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        resolve(null)
      }, FETCH_TIMEOUT_MS)
    })
    
    const result = await Promise.race([fetchPromise, timeoutPromise])
    
    // Clean up timeout if fetch completed first
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    
    if (result && !result.error) {
      // Step 3: Store profile_pic from API response (field is profile_pic, not profile_pic_url)
      // The API returns profile_pic, we store it in both profile_pic and profile_pic_url columns
      const profilePicUrl = result.profile_pic || result.profile_pic_url
      
      // Step 3: Log before upsert
      console.log('[Instagram Messaging Profile] Before DB upsert:', {
        participantIgsid: messagingUserId,
        username: result.username,
        profilePicLength: profilePicUrl?.length || 0,
        profilePicPreview: profilePicUrl ? profilePicUrl.substring(0, 50) + '...' : null,
        hasProfilePic: !!profilePicUrl,
      })
      
      const dbPayload = {
        ig_account_id: recipientIgAccountId,
        ig_user_id: messagingUserId,
        username: result.username,
        name: result.name,
        profile_pic: profilePicUrl, // Store in both columns for compatibility
        profile_pic_url: profilePicUrl, // Canonical field
        follower_count: result.follower_count,
        is_user_follow_business: result.is_user_follow_business,
        is_business_follow_user: result.is_business_follow_user,
        last_fetched_at: new Date().toISOString(),
        fail_count: 0, // Reset fail_count on success
        last_failed_at: null,
        raw: result.raw,
      }
      
      console.log('[Instagram Messaging Profile] DB payload:', {
        ...dbPayload,
        raw: dbPayload.raw ? '[object]' : null, // Don't log full raw object
      })
      
      await (supabase
        .from('instagram_user_cache') as any)
        .upsert(dbPayload, {
          onConflict: 'ig_account_id,ig_user_id',
        })
      
      console.log('[Instagram Messaging Profile] Resolved and cached:', {
        messagingUserId,
        ig_account_id: recipientIgAccountId,
        name: result.name,
        hasProfilePic: !!(result.profile_pic || result.profile_pic_url),
      })
      
      return {
        username: result.username,
        name: result.name,
        profile_pic: result.profile_pic || result.profile_pic_url,
        profile_pic_url: result.profile_pic || result.profile_pic_url,
        follower_count: result.follower_count,
        is_user_follow_business: result.is_user_follow_business,
        is_business_follow_user: result.is_business_follow_user,
      }
    } else {
      // Failed - update cache with failure details
      const newFailCount = (cached?.fail_count || 0) + 1
      const errorPayload = result?.error 
        ? { status: result.error.status, body: result.error.body }
        : { error: 'Unknown error', recipientIgAccountId }
      
      await (supabase
        .from('instagram_user_cache') as any)
        .upsert({
          ig_account_id: recipientIgAccountId,
          ig_user_id: messagingUserId,
          fail_count: newFailCount,
          last_failed_at: new Date().toISOString(),
          raw: {
            ...errorPayload,
            recipientIgAccountId,
            timestamp: new Date().toISOString(),
          },
        }, {
          onConflict: 'ig_account_id,ig_user_id',
        })
      
      console.log('[Instagram Messaging Profile] Fetch failed:', {
        messagingUserId,
        fail_count: newFailCount,
        errorStatus: result?.error?.status,
        errorBody: result?.error?.body ? JSON.stringify(result.error.body).substring(0, 200) : null,
      })
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:540',message:'fetch_failed',data:{traceId,messagingUserId,fail_count:newFailCount,errorStatus:result?.error?.status,hasCached:!!cached},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      // C) Return cached data if available (even if stale)
      if (cached) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:545',message:'returning_cached_on_fetch_failure',data:{traceId,hasCached:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        return {
          username: cached.username,
          name: cached.name,
          profile_pic: cached.profile_pic || cached.profile_pic_url,
          profile_pic_url: cached.profile_pic || cached.profile_pic_url,
          follower_count: cached.follower_count,
          is_user_follow_business: cached.is_user_follow_business,
          is_business_follow_user: cached.is_business_follow_user,
        }
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:557',message:'returning_null_on_fetch_failure',data:{traceId,hasCached:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return null
    }
  } catch (error: any) {
    // Step 4: Log exception with full details
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:550',message:'exception_caught',data:{traceId,error_name:error?.name,error_message:error?.message,error_stack:error?.stack?.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    console.error('[Instagram Messaging Profile] Exception:', {
      messagingUserId,
      errorName: error?.name,
      errorMessage: error?.message,
      errorStack: error?.stack?.substring(0, 300),
      traceId,
    })
    
    // C) Return cached data if available, even on exception
    const supabase = createServiceRoleClient()
    const { data: cached } = await (supabase
      .from('instagram_user_cache') as any)
      .select('username, name, profile_pic, profile_pic_url, follower_count, is_user_follow_business, is_business_follow_user')
      .eq('ig_account_id', recipientIgAccountId)
      .eq('ig_user_id', messagingUserId)
      .maybeSingle()
    
    if (cached) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:565',message:'returning_cached_on_exception',data:{traceId,hasCached:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return {
        username: cached.username,
        name: cached.name,
        profile_pic: cached.profile_pic || cached.profile_pic_url,
        profile_pic_url: cached.profile_pic || cached.profile_pic_url,
        follower_count: cached.follower_count,
        is_user_follow_business: cached.is_user_follow_business,
        is_business_follow_user: cached.is_business_follow_user,
      }
    }
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'messaging-user-profile.ts:577',message:'returning_null_on_exception',data:{traceId,hasCached:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return null
  }
}


