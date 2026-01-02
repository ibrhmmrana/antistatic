/**
 * Instagram User Resolver
 * 
 * Resolves Instagram user information (username, profile pic) for a given ig_user_id.
 * Uses cached data when available, fetches from API when needed.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/supabase/database.types'

const CACHE_TTL_DAYS = 7
const MAX_FAIL_COUNT = 5

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
 * Fetch user info from Instagram Graph API
 */
async function fetchUserFromAPI(
  accessToken: string,
  igUserId: string
): Promise<{
  username: string | null
  name: string | null
  profile_pic_url: string | null
  raw: any
} | null> {
  try {
    // Try to fetch user info using the user ID
    // Note: Instagram Graph API may not support fetching other users' profiles
    // This might only work for the authenticated user (me endpoint)
    // We'll try both approaches
    
    // Approach 1: Try direct user ID endpoint
    let url = `https://graph.instagram.com/${igUserId}?fields=id,username&access_token=${accessToken}`
    let response = await fetch(url)
    
    if (!response.ok) {
      // Approach 2: If direct ID fails, try /me (only works for authenticated user)
      // This won't work for other users, but we'll try anyway
      url = `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`
      response = await fetch(url)
    }
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Instagram API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }
    
    const data = await response.json()
    
    // Check if this is the user we're looking for
    if (data.id !== igUserId) {
      // /me returned different user, can't fetch other users' info
      return null
    }
    
    return {
      username: data.username || null,
      name: data.name || null,
      profile_pic_url: data.profile_picture_url || null,
      raw: data,
    }
  } catch (error: any) {
    console.log('[Instagram Resolver] API fetch error:', {
      igUserId,
      message: error.message,
    })
    return null
  }
}

/**
 * Resolve Instagram user information
 * 
 * @param businessLocationId - Business location ID
 * @param igUserId - Instagram user ID to resolve
 * @returns Resolved user info or null if not found/failed
 */
export async function resolveInstagramUser(
  businessLocationId: string,
  igUserId: string
): Promise<{
  username: string | null
  name: string | null
  profile_pic_url: string | null
} | null> {
  if (!igUserId) {
    return null
  }

  const supabase = createServiceRoleClient()
  
  try {
    // Check cache first
    const { data: cached, error: cacheError } = await (supabase
      .from('instagram_user_cache') as any)
      .select('username, name, profile_pic_url, last_fetched_at, fail_count')
      .eq('ig_user_id', igUserId)
      .maybeSingle()
    
    if (cacheError) {
      console.log('[Instagram Resolver] Cache lookup error:', {
        igUserId,
        error: cacheError.message,
      })
    }
    
    // If cached and recent (within TTL), return cached data
    if (cached && cached.last_fetched_at) {
      const lastFetched = new Date(cached.last_fetched_at)
      const now = new Date()
      const daysSinceFetch = (now.getTime() - lastFetched.getTime()) / (1000 * 60 * 60 * 24)
      
      if (daysSinceFetch < CACHE_TTL_DAYS && cached.username) {
        console.log('[Instagram Resolver] Using cached data:', {
          igUserId,
          username: cached.username,
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
      console.log('[Instagram Resolver] Skipping fetch (max fails reached):', {
        igUserId,
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
      console.log('[Instagram Resolver] No connection found:', {
        businessLocationId,
        error: connError?.message,
      })
      
      // Update cache with failure
      await (supabase
        .from('instagram_user_cache') as any)
        .upsert({
          ig_user_id: igUserId,
          fail_count: (cached?.fail_count || 0) + 1,
          last_failed_at: new Date().toISOString(),
        }, {
          onConflict: 'ig_user_id',
        })
      
      return null
    }
    
    // Fetch from API (with timeout)
    const fetchPromise = fetchUserFromAPI(connection.access_token, igUserId)
    const timeoutPromise = new Promise<null>((resolve) => 
      setTimeout(() => resolve(null), 2000)
    )
    
    const result = await Promise.race([fetchPromise, timeoutPromise])
    
    if (result) {
      // Success - update cache
      await (supabase
        .from('instagram_user_cache') as any)
        .upsert({
          ig_user_id: igUserId,
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
      
      console.log('[Instagram Resolver] Resolved and cached:', {
        igUserId,
        username: result.username,
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
          ig_user_id: igUserId,
          fail_count: newFailCount,
          last_failed_at: new Date().toISOString(),
        }, {
          onConflict: 'ig_user_id',
        })
      
      console.log('[Instagram Resolver] Fetch failed or timed out:', {
        igUserId,
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
    console.log('[Instagram Resolver] Exception:', {
      igUserId,
      message: error.message,
    })
    return null
  }
}

