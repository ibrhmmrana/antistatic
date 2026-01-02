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
 * Get Instagram access token for a business location
 * 
 * @param businessLocationId - The business location ID
 * @returns Object with access_token and ig_account_id
 * @throws InstagramAuthError if token is missing or expired
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

  // Check if token is expired
  if (connection.token_expires_at) {
    const expiresAt = new Date(connection.token_expires_at)
    const now = new Date()
    
    if (expiresAt <= now) {
      console.warn('[Instagram Tokens] Token expired:', {
        businessLocationId,
        expiresAt: expiresAt.toISOString(),
        now: now.toISOString(),
      })
      throw new InstagramAuthError(
        'EXPIRED',
        'Access token has expired. Please reconnect your Instagram account.'
      )
    }
  }

  return {
    access_token: connection.access_token,
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

