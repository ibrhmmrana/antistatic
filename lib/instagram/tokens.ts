/**
 * Instagram Token Management
 * 
 * Centralized helper for fetching and validating Instagram access tokens
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/lib/supabase/database.types'

export class InstagramAuthError extends Error {
  code: 'EXPIRED' | 'MISSING'
  constructor(code: 'EXPIRED' | 'MISSING', message: string) {
    super(message)
    this.name = 'InstagramAuthError'
    this.code = code
  }
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
 * Get Instagram access token for a specific IG account ID
 * 
 * @param igAccountId - The Instagram account ID (instagram_user_id)
 * @returns Access token string
 * @throws InstagramAuthError if token is missing or expired
 */
export async function getInstagramAccessTokenForAccount(
  igAccountId: string
): Promise<string> {
  const supabase = createServiceRoleClient()

  const { data: connection, error } = await (supabase
    .from('instagram_connections') as any)
    .select('access_token, token_expires_at')
    .eq('instagram_user_id', igAccountId)
    .maybeSingle()

  if (error) {
    console.error('[Instagram Tokens] Error loading connection:', error)
    throw new InstagramAuthError('MISSING', 'Failed to load Instagram connection')
  }

  if (!connection || !connection.access_token) {
    throw new InstagramAuthError('MISSING', 'Instagram account not connected')
  }

  // Check if token is expired
  if (connection.token_expires_at) {
    const expiresAt = new Date(connection.token_expires_at)
    const now = new Date()
    
    if (expiresAt <= now) {
      console.warn('[Instagram Tokens] Token expired:', {
        igAccountId,
        expiresAt: expiresAt.toISOString(),
        now: now.toISOString(),
      })
      throw new InstagramAuthError(
        'EXPIRED',
        'Access token has expired. Please reconnect your Instagram account.'
      )
    }
  }

  return connection.access_token
}

/**
 * Refresh an Instagram access token using the Graph API exchange endpoint
 * 
 * @param accessToken - The current access token (can be expired)
 * @returns New access token and expiry
 */
async function refreshInstagramAccessToken(
  accessToken: string
): Promise<{ access_token: string; expires_in: number }> {
  // Instagram token refresh endpoint
  // GET /refresh_access_token?grant_type=ig_refresh_token&access_token={access-token}
  // This refreshes a long-lived token to get a new long-lived token (60 days)
  // Note: The token should ideally still be valid, but we try even if expired
  const refreshUrl = new URL('https://graph.instagram.com/refresh_access_token')
  refreshUrl.searchParams.set('grant_type', 'ig_refresh_token')
  refreshUrl.searchParams.set('access_token', accessToken)

  console.log('[Instagram Tokens] Attempting to refresh token...')

  const response = await fetch(refreshUrl.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  })

  const data = await response.json()

  if (!response.ok) {
    const error = data.error || {}
    console.error('[Instagram Tokens] Token refresh failed:', {
      status: response.status,
      code: error.code,
      message: error.message,
      type: error.type,
      error_subcode: error.error_subcode,
      fullResponse: JSON.stringify(data, null, 2),
    })
    throw new Error(`Token refresh failed: ${error.message || 'Unknown error'}`)
  }

  if (!data.access_token) {
    throw new Error('No access token in refresh response')
  }

  console.log('[Instagram Tokens] Token refreshed successfully:', {
    expiresIn: data.expires_in,
  })

  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 5184000, // Default to 60 days
  }
}

/**
 * Get Instagram access token for a business location, automatically refreshing if expired
 * 
 * @param businessLocationId - The business location ID
 * @returns Object with access_token and ig_account_id
 * @throws InstagramAuthError if token is missing or cannot be refreshed
 */
export async function getInstagramAccessTokenForLocation(
  businessLocationId: string
): Promise<{ access_token: string; ig_account_id: string }> {
  const supabase = createServiceRoleClient()

  const { data: connection, error } = await (supabase
    .from('instagram_connections') as any)
    .select('access_token, instagram_user_id, token_expires_at')
    .eq('business_location_id', businessLocationId)
    .maybeSingle()

  if (error) {
    console.error('[Instagram Tokens] Error loading connection:', error)
    throw new InstagramAuthError('MISSING', 'Failed to load Instagram connection')
  }

  if (!connection || !connection.access_token) {
    throw new InstagramAuthError('MISSING', 'Instagram account not connected')
  }

  let accessToken = connection.access_token
  let needsRefresh = false

  // Check if token is expired or expiring soon
  if (connection.token_expires_at) {
    const expiresAt = new Date(connection.token_expires_at)
    const now = new Date()
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago
    
    if (expiresAt <= now) {
      // Token is expired - check how long ago
      const expiredDaysAgo = Math.floor((now.getTime() - expiresAt.getTime()) / (24 * 60 * 60 * 1000))
      
      if (expiresAt <= oneDayAgo) {
        // Token expired more than 24 hours ago - refresh endpoint won't work
        // Instagram refresh only works with valid or very recently expired tokens
        console.warn('[Instagram Tokens] Token expired too long ago, cannot refresh:', {
          businessLocationId,
          expiresAt: expiresAt.toISOString(),
          now: now.toISOString(),
          expiredDaysAgo,
        })
        throw new InstagramAuthError(
          'EXPIRED',
          'Instagram access token has been expired for too long and cannot be automatically refreshed. Please reconnect your Instagram account.'
        )
      } else {
        // Token expired recently (within 24 hours) - try to refresh
        console.log('[Instagram Tokens] Token expired recently, attempting refresh:', {
          businessLocationId,
          expiresAt: expiresAt.toISOString(),
          now: now.toISOString(),
          expiredHoursAgo: Math.floor((now.getTime() - expiresAt.getTime()) / (60 * 60 * 1000)),
        })
        needsRefresh = true
      }
    } else if (expiresAt <= sevenDaysFromNow) {
      // Refresh if expiring within 7 days (proactive refresh)
      console.log('[Instagram Tokens] Token expiring soon, refreshing proactively:', {
        businessLocationId,
        expiresAt: expiresAt.toISOString(),
        daysUntilExpiry: Math.floor((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      })
      needsRefresh = true
    }
  }

  // Refresh token if needed
  if (needsRefresh) {
    try {
      const refreshed = await refreshInstagramAccessToken(accessToken)
      accessToken = refreshed.access_token
      
      // Update database with new token
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      const { error: updateError } = await (supabase
        .from('instagram_connections' as any) as any)
        .update({
          access_token: refreshed.access_token,
          token_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq('business_location_id', businessLocationId)

      if (updateError) {
        console.error('[Instagram Tokens] Failed to update refreshed token in DB:', updateError)
        // Still return the refreshed token even if DB update fails
      } else {
        console.log('[Instagram Tokens] Successfully updated token in database')
      }
    } catch (refreshError: any) {
      console.error('[Instagram Tokens] Token refresh failed:', refreshError)
      // If refresh fails, throw expired error so user can reconnect
      throw new InstagramAuthError(
        'EXPIRED',
        'Instagram access token could not be refreshed. Please reconnect your Instagram account.'
      )
    }
  }

  return {
    access_token: accessToken,
    ig_account_id: connection.instagram_user_id,
  }
}

/**
 * Check if a Graph API error indicates token expiry
 */
export function isTokenExpiredError(error: any): boolean {
  if (!error || typeof error !== 'object') return false
  
  // Check for code 190 (OAuthException)
  if (error.code === 190 || error.error?.code === 190) {
    return true
  }
  
  // Check error message for expiry indicators
  const message = error.message || error.error?.message || ''
  if (typeof message === 'string') {
    return (
      message.includes('expired') ||
      message.includes('Session has expired') ||
      message.includes('Error validating access token')
    )
  }
  
  return false
}

