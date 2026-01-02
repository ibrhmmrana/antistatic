/**
 * Instagram Messaging User Profile Fetcher
 * 
 * Fetches user identity (username, name, profile pic) for Instagram Messaging API users.
 * Uses graph.facebook.com (not graph.instagram.com) for messaging user profiles.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/supabase/database.types'

const CACHE_TTL_DAYS = 7
const MAX_FAIL_COUNT = 5
const FETCH_TIMEOUT_MS = 2000

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
  profile_pic_url: string | null
  raw: any
} | null> {
  if (!messagingUserId || !accessToken) {
    return null
  }

  try {
    // For Instagram Messaging API, we use graph.facebook.com
    // The endpoint is: /{messaging-user-id}?fields=name,username,profile_pic,profile_pic_url
    // Note: We use the Instagram access token, not a Page token
    const url = `https://graph.facebook.com/v18.0/${messagingUserId}?fields=name,username,profile_pic,profile_pic_url&access_token=${accessToken}`
    
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    
    const response = await fetch(url, {
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorSnippet = JSON.stringify(errorData).substring(0, 200)
      
      console.log('[Instagram Messaging Profile] Fetch failed:', {
        messagingUserId,
        recipientIgAccountId,
        httpStatus: response.status,
        statusText: response.statusText,
        errorSnippet,
        endpoint: url.replace(accessToken, 'REDACTED'),
        tokenSource: 'instagram_connections.access_token',
      })
      
      throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`)
    }
    
    const data = await response.json()
    
    // Extract fields (handle both profile_pic and profile_pic_url)
    const profilePicUrl = data.profile_pic_url || data.profile_pic || null
    
    return {
      username: data.username || null,
      name: data.name || null,
      profile_pic_url: profilePicUrl,
      raw: data,
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('[Instagram Messaging Profile] Fetch timeout:', {
        messagingUserId,
        recipientIgAccountId,
        timeoutMs: FETCH_TIMEOUT_MS,
        tokenSource: 'instagram_connections.access_token',
      })
    } else {
      console.log('[Instagram Messaging Profile] Fetch error:', {
        messagingUserId,
        recipientIgAccountId,
        message: error.message,
        tokenSource: 'instagram_connections.access_token',
      })
    }
    return null
  }
}

/**
 * Resolve and cache Instagram Messaging user profile
 * 
 * @param businessLocationId - Business location ID
 * @param recipientIgAccountId - The Instagram account ID (from instagram_connections.instagram_user_id)
 * @param messagingUserId - The messaging user ID (from webhook sender.id or recipient.id)
 * @returns Resolved user info or null if not found/failed
 */
export async function resolveMessagingUserProfile(
  businessLocationId: string,
  recipientIgAccountId: string,
  messagingUserId: string
): Promise<{
  username: string | null
  name: string | null
  profile_pic_url: string | null
} | null> {
  if (!messagingUserId || !recipientIgAccountId) {
    return null
  }

  const supabase = createServiceRoleClient()
  
  try {
    // Check cache first
    const { data: cached, error: cacheError } = await (supabase
      .from('instagram_user_cache') as any)
      .select('username, name, profile_pic_url, last_fetched_at, fail_count')
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
          profile_pic_url: cached.profile_pic_url,
        }
      }
    }
    
    // If fail_count >= MAX_FAIL_COUNT, don't retry
    if (cached && cached.fail_count >= MAX_FAIL_COUNT) {
      console.log('[Instagram Messaging Profile] Skipping fetch (max fails reached):', {
        messagingUserId,
        fail_count: cached.fail_count,
      })
      return {
        username: cached.username,
        name: cached.name,
        profile_pic_url: cached.profile_pic_url,
      }
    }
    
    // Load access token for this business location
    const { data: connection, error: connError } = await (supabase
      .from('instagram_connections') as any)
      .select('access_token')
      .eq('business_location_id', businessLocationId)
      .maybeSingle()
    
    if (connError || !connection?.access_token) {
      console.log('[Instagram Messaging Profile] No connection found:', {
        businessLocationId,
        error: connError?.message,
      })
      
      // Update cache with failure
      await (supabase
        .from('instagram_user_cache') as any)
        .upsert({
          ig_user_id: messagingUserId,
          fail_count: (cached?.fail_count || 0) + 1,
          last_failed_at: new Date().toISOString(),
          raw: { error: 'No connection found', businessLocationId },
        }, {
          onConflict: 'ig_user_id',
        })
      
      return null
    }
    
    // Fetch from API (with timeout)
    const fetchPromise = fetchIgMessagingUserProfile({
      recipientIgAccountId,
      messagingUserId,
      accessToken: connection.access_token,
    })
    
    const timeoutPromise = new Promise<null>((resolve) => 
      setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)
    )
    
    const result = await Promise.race([fetchPromise, timeoutPromise])
    
    if (result) {
      // Success - update cache
      // Determine display name: prefer username, then name, then fallback
      const displayName = result.username || result.name || null
      
      await (supabase
        .from('instagram_user_cache') as any)
        .upsert({
          ig_user_id: messagingUserId,
          username: result.username,
          name: result.name,
          profile_pic_url: result.profile_pic_url,
          last_fetched_at: new Date().toISOString(),
          fail_count: 0,
          last_failed_at: null,
          raw: result.raw,
        }, {
          onConflict: 'ig_user_id',
        })
      
      console.log('[Instagram Messaging Profile] Resolved and cached:', {
        messagingUserId,
        username: result.username,
        name: result.name,
        hasProfilePic: !!result.profile_pic_url,
      })
      
      return {
        username: result.username,
        name: result.name,
        profile_pic_url: result.profile_pic_url,
      }
    } else {
      // Failed or timed out - update cache with failure
      const newFailCount = (cached?.fail_count || 0) + 1
      await (supabase
        .from('instagram_user_cache') as any)
        .upsert({
          ig_user_id: messagingUserId,
          fail_count: newFailCount,
          last_failed_at: new Date().toISOString(),
          raw: { error: 'Fetch timeout or failed', recipientIgAccountId },
        }, {
          onConflict: 'ig_user_id',
        })
      
      console.log('[Instagram Messaging Profile] Fetch failed or timed out:', {
        messagingUserId,
        fail_count: newFailCount,
      })
      
      // Return cached data if available (even if stale)
      if (cached) {
        return {
          username: cached.username,
          name: cached.name,
          profile_pic_url: cached.profile_pic_url,
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

