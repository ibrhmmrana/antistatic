/**
 * Instagram Messaging User Profile Fetcher
 * 
 * Fetches user identity (username, name, profile pic) for Instagram Messaging API users.
 * Uses graph.facebook.com (not graph.instagram.com) for messaging user profiles.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/supabase/database.types'
import { getInstagramAccessTokenForAccount, InstagramAuthError, isTokenExpiredError } from './tokens'

const CACHE_TTL_DAYS = 7
const MAX_FAIL_COUNT = 3
const FETCH_TIMEOUT_MS = 10000 // 10 seconds
const FAIL_COOLDOWN_MS = 15 * 60 * 1000 // 15 minutes

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
    // Use the SAME base URL as sendMessage: graph.instagram.com
    // Try the messaging user profile endpoint
    // Note: Instagram Messaging API may not support fetching other users' profiles
    // We'll try both graph.instagram.com and graph.facebook.com patterns
    const baseUrl = 'https://graph.instagram.com'
    const apiVersion = 'v18.0'
    
    // Try graph.instagram.com first (same as sendMessage)
    // Use profile_pic (NOT profile_pic_url) for IGSID/IGBusinessScopedID
    let url = `${baseUrl}/${apiVersion}/${messagingUserId}?fields=name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user&access_token=${accessToken}`
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    
    const startTime = Date.now()
    const response = await fetch(url, {
      signal: controller.signal,
    })
    const duration = Date.now() - startTime
    
    clearTimeout(timeoutId)
    
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
    
    // Extract fields - use profile_pic (NOT profile_pic_url) for IGSID
    const profilePic = data.profile_pic || null
    
    console.log('[Instagram Messaging Profile] Fetch succeeded:', {
      messagingUserId,
      recipientIgAccountId,
      hasName: !!data.name,
      hasProfilePic: !!profilePic,
      hasUsername: !!data.username,
      durationMs: duration,
      endpoint: url.replace(accessToken, 'REDACTED'),
    })
    
    return {
      username: data.username || null,
      name: data.name || null,
      profile_pic_url: profilePic, // Store as profile_pic_url for backward compatibility
      profile_pic: profilePic, // Also store as profile_pic
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
  if (!messagingUserId || !recipientIgAccountId) {
    return null
  }

  const supabase = createServiceRoleClient()
  
  try {
    // Check cache first (scoped by ig_account_id)
    const { data: cached, error: cacheError } = await (supabase
      .from('instagram_user_cache') as any)
      .select('username, name, profile_pic, profile_pic_url, follower_count, is_user_follow_business, is_business_follow_user, last_fetched_at, fail_count')
      .eq('ig_account_id', recipientIgAccountId)
      .eq('ig_user_id', messagingUserId)
      .maybeSingle()
    
    if (cacheError) {
      console.log('[Instagram Messaging Profile] Cache lookup error:', {
        messagingUserId,
        error: cacheError.message,
      })
    }
    
    // If cached and recent (within TTL), return cached data
    if (cached && cached.last_fetched_at) {
      const lastFetched = new Date(cached.last_fetched_at)
      const now = new Date()
      const daysSinceFetch = (now.getTime() - lastFetched.getTime()) / (1000 * 60 * 60 * 24)
      
      if (daysSinceFetch < CACHE_TTL_DAYS && (cached.username || cached.name)) {
        console.log('[Instagram Messaging Profile] Using cached data:', {
          messagingUserId,
          username: cached.username,
          name: cached.name,
          daysSinceFetch: daysSinceFetch.toFixed(1),
        })
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
    
    // If fail_count >= MAX_FAIL_COUNT, check cooldown period
    if (cached && cached.fail_count >= MAX_FAIL_COUNT) {
      if (cached.last_failed_at) {
        const lastFailed = new Date(cached.last_failed_at)
        const now = new Date()
        const minutesSinceFailure = (now.getTime() - lastFailed.getTime()) / (1000 * 60)
        
        if (minutesSinceFailure < FAIL_COOLDOWN_MS / (1000 * 60)) {
          console.log('[Instagram Messaging Profile] Skipping fetch (cooldown):', {
            messagingUserId,
            fail_count: cached.fail_count,
            minutesSinceFailure: minutesSinceFailure.toFixed(1),
            cooldownMinutes: FAIL_COOLDOWN_MS / (1000 * 60),
          })
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
        // No last_failed_at, but fail_count is high - still skip
        console.log('[Instagram Messaging Profile] Skipping fetch (max fails reached):', {
          messagingUserId,
          fail_count: cached.fail_count,
        })
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
    
    // Load access token using centralized helper
    let accessToken: string
    try {
      accessToken = await getInstagramAccessTokenForAccount(recipientIgAccountId)
    } catch (error: any) {
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
        
        // Re-throw to propagate auth error
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
      
      return null
    }
    
    // Fetch from API (with timeout)
    const fetchPromise = fetchIgMessagingUserProfile({
      recipientIgAccountId,
      messagingUserId,
      accessToken,
    })
    
    const timeoutPromise = new Promise<null>((resolve) => 
      setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)
    )
    
    const result = await fetchPromise
    
    if (result && !result.error) {
      // Success - update cache (scoped by ig_account_id)
      await (supabase
        .from('instagram_user_cache') as any)
        .upsert({
          ig_account_id: recipientIgAccountId,
          ig_user_id: messagingUserId,
          username: result.username,
          name: result.name,
          profile_pic: result.profile_pic || result.profile_pic_url,
          follower_count: result.follower_count,
          is_user_follow_business: result.is_user_follow_business,
          is_business_follow_user: result.is_business_follow_user,
          last_fetched_at: new Date().toISOString(),
          fail_count: 0,
          last_failed_at: null,
          raw: result.raw,
        }, {
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
      
      // Return cached data if available (even if stale)
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
  } catch (error: any) {
    console.log('[Instagram Messaging Profile] Exception:', {
      messagingUserId,
      message: error.message,
    })
    return null
  }
}

