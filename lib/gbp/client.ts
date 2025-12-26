/**
 * Google Business Profile API Client
 * 
 * Handles token management and API calls to Google Business Profile APIs.
 * Automatically refreshes access tokens when expired.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getGBPOAuthConfig } from './config'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Provider string used for Google Business Profile in connected_accounts table
 */
export const GBP_CONNECTED_ACCOUNTS_PROVIDER = 'google_gbp'

/**
 * Find a connected GBP account for a business location
 * 
 * This is the single source of truth for how we query connected_accounts
 * for Google Business Profile connections. Both UI and backend should use this.
 * 
 * @param supabase - Supabase client instance
 * @param businessLocationId - Business location ID
 * @param userId - Optional user ID (if not provided, will use auth.uid() from RLS)
 * @returns The connected account row or null if not found
 */
export async function findGBPConnectedAccount(
  supabase: SupabaseClient,
  businessLocationId: string,
  userId?: string
): Promise<Database['public']['Tables']['connected_accounts']['Row'] | null> {
  let query = supabase
    .from('connected_accounts')
    .select('*')
    .eq('business_location_id', businessLocationId)
    .eq('provider', GBP_CONNECTED_ACCOUNTS_PROVIDER)
    .eq('status', 'connected')

  // If userId is provided, filter by it (useful for server-side queries)
  // If not provided, RLS policies will enforce user_id = auth.uid()
  if (userId) {
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query.single()

  if (error) {
    // PGRST116 means no rows found (Supabase's way of saying .single() found nothing)
    if (error.code === 'PGRST116') {
      return null
    }
    // For other errors, log and return null
    console.error('[GBP Client] findGBPConnectedAccount error:', {
      code: error.code,
      message: error.message,
      businessLocationId,
      userId,
    })
    return null
  }

  return data
}

export interface GBPTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  scopes: string[] | null
}

export interface GBPAccount {
  name: string
  accountName: string
  type: string
  verificationState: string
}

export interface GBPLocation {
  name: string
  locationId: string
  title: string
  storefrontAddress?: {
    addressLines?: string[]
    locality?: string
    administrativeArea?: string
    postalCode?: string
    regionCode?: string
  }
  placeId?: string
  primaryCategory?: {
    displayName?: string
  }
  phoneNumbers?: {
    primaryPhone?: string
  }
}

export interface GBPReview {
  name: string
  reviewId: string
  reviewer: {
    displayName: string
    profilePhotoUrl?: string
  }
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE'
  comment?: string
  createTime: string
  updateTime: string
  reply?: {
    comment: string
    updateTime: string
  }
}

/**
 * Get stored GBP tokens for a user's business location
 */
export async function getGBPTokens(
  userId: string,
  businessLocationId: string
): Promise<GBPTokens | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // No-op
        },
      },
    }
  )

  console.log('[GBP Client] getGBPTokens - Query params:', {
    userId,
    businessLocationId,
    provider: GBP_CONNECTED_ACCOUNTS_PROVIDER,
    status: 'connected',
  })

  // Use shared helper function
  const account = await findGBPConnectedAccount(supabase, businessLocationId, userId)

  console.log('[GBP Client] getGBPTokens - Query result:', {
    hasAccount: !!account,
    rowId: account?.id || null,
    hasAccessToken: !!account?.access_token,
    hasRefreshToken: !!account?.refresh_token,
    scopes: account?.scopes || null,
    status: account?.status || null,
    provider: account?.provider || null,
    actualUserId: account?.user_id || null,
    actualLocationId: account?.business_location_id || null,
  })

  // If no account found, log all connected_accounts for this user for debugging
  if (!account) {
    console.warn('[GBP Client] No GBP account found. Checking all connected_accounts for user...')
    const { data: allAccounts } = await supabase
      .from('connected_accounts')
      .select('id, user_id, business_location_id, provider, status, access_token, refresh_token')
      .eq('user_id', userId)
    
    console.log('[GBP Client] All connected_accounts for user:', {
      count: allAccounts?.length || 0,
      accounts: allAccounts?.map(acc => ({
        id: acc.id,
        business_location_id: acc.business_location_id,
        provider: acc.provider,
        status: acc.status,
        hasAccessToken: !!acc.access_token,
        hasRefreshToken: !!acc.refresh_token,
      })) || [],
    })
    return null
  }

  if (!account.access_token) {
    console.error('[GBP Client] Account found but access_token is null/empty')
    return null
  }

  return {
    accessToken: account.access_token,
    refreshToken: account.refresh_token || null,
    expiresAt: account.expires_at || null,
    scopes: account.scopes || null,
  }
}

/**
 * Refresh an expired access token using the refresh token
 */
export async function refreshGBPAccessToken(
  refreshToken: string,
  origin?: string
): Promise<{ accessToken: string; expiresIn: number }> {
  const config = getGBPOAuthConfig(origin)

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(`Token refresh failed: ${error.error_description || error.error}`)
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in || 3600,
  }
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(
  userId: string,
  businessLocationId: string,
  origin?: string
): Promise<string> {
  console.log('[GBP Client] getValidAccessToken called:', {
    userId,
    businessLocationId,
  })

  const tokens = await getGBPTokens(userId, businessLocationId)

  if (!tokens) {
    console.error('[GBP Client] No tokens found in database')
    throw new Error('No GBP tokens found. Please reconnect your Google Business Profile.')
  }

  if (!tokens.accessToken) {
    console.error('[GBP Client] Tokens found but access_token is null/empty')
    throw new Error('No GBP tokens found. Please reconnect your Google Business Profile.')
  }

  console.log('[GBP Client] Tokens retrieved:', {
    hasAccessToken: !!tokens.accessToken,
    hasRefreshToken: !!tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  })

  // Check if token is expired (with 5 minute buffer)
  if (tokens.expiresAt) {
    const expiresAt = new Date(tokens.expiresAt)
    const now = new Date()
    const buffer = 5 * 60 * 1000 // 5 minutes

    if (expiresAt.getTime() - now.getTime() < buffer) {
      console.log('[GBP Client] Access token expired or expiring soon, refreshing...')
      
      // Token expired or expiring soon, refresh it
      if (!tokens.refreshToken) {
        console.error('[GBP Client] No refresh token available for expired access token')
        throw new Error('Access token expired and no refresh token available. Please reconnect.')
      }

      try {
        const refreshed = await refreshGBPAccessToken(tokens.refreshToken, origin)
        console.log('[GBP Client] Token refreshed successfully')
        
        // Update stored token
        const cookieStore = await cookies()
        const supabase = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              getAll() {
                return cookieStore.getAll()
              },
              setAll() {
                // No-op
              },
            },
          }
        )

        const newExpiresAt = new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
        const { error: updateError } = await supabase
          .from('connected_accounts')
          .update({
            access_token: refreshed.accessToken,
            expires_at: newExpiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .eq('business_location_id', businessLocationId)
          .eq('provider', GBP_CONNECTED_ACCOUNTS_PROVIDER)

        if (updateError) {
          console.error('[GBP Client] Failed to update refreshed token:', updateError)
          // Still return the refreshed token even if DB update fails
        }

        return refreshed.accessToken
      } catch (refreshError: any) {
        console.error('[GBP Client] Token refresh failed:', refreshError.message)
        throw new Error('Failed to refresh access token. Please reconnect your Google Business Profile.')
      }
    }
  }

  console.log('[GBP Client] Using existing valid access token')
  return tokens.accessToken
}

/**
 * Make an authenticated request to Google Business Profile API
 * 
 * Uses the Business Profile Performance API and Account Management API
 */
export async function gbpApiRequest<T>(
  endpoint: string,
  userId: string,
  businessLocationId: string,
  options: RequestInit = {},
  origin?: string
): Promise<T> {
  const accessToken = await getValidAccessToken(userId, businessLocationId, origin)

  // Business Profile APIs use different base URLs depending on the endpoint
  // Business Information API (accounts, locations): https://mybusinessbusinessinformation.googleapis.com/v1
  // Reviews API: https://mybusiness.googleapis.com/v4
  // Performance API: https://businessprofileperformance.googleapis.com/v1
  let baseUrl = 'https://mybusinessbusinessinformation.googleapis.com/v1'
  
  // If endpoint is for reviews, use reviews API base
  if (endpoint.includes('/reviews')) {
    baseUrl = 'https://mybusiness.googleapis.com/v4'
  }
  
  // If endpoint is for performance metrics, use performance API base
  if (endpoint.includes('/fetchMultiDailyMetricsTimeSeries') || endpoint.includes('/reports') || endpoint.includes('/searchkeywords') || endpoint.includes('/locations/') && endpoint.includes('/impressions')) {
    baseUrl = 'https://businessprofileperformance.googleapis.com/v1'
  }
  
  const url = `${baseUrl}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    const errorMessage = error.error?.message || JSON.stringify(error)
    const apiError: any = new Error(`GBP API error: ${errorMessage}`)
    apiError.status = response.status
    apiError.message = errorMessage
    throw apiError
  }

  return response.json()
}

/**
 * Verify GBP connection by fetching accounts
 * This is a smoke test to ensure tokens work
 */
export async function verifyGBPConnection(
  userId: string,
  businessLocationId: string,
  origin?: string
): Promise<{ accounts: GBPAccount[]; primaryAccountName: string | null }> {
  try {
    const response = await gbpApiRequest<{ accounts: GBPAccount[] }>(
      '/accounts',
      userId,
      businessLocationId,
      { method: 'GET' },
      origin
    )

    const accounts = response.accounts || []
    const primaryAccount = accounts.find(acc => acc.type === 'PERSONAL') || accounts[0]

    return {
      accounts,
      primaryAccountName: primaryAccount?.accountName || null,
    }
  } catch (error: any) {
    throw new Error(`GBP verification failed: ${error.message}`)
  }
}

/**
 * Get GBP access token and account name for a location
 * 
 * @param userId - Antistatic user ID
 * @param businessLocationId - Antistatic business location ID
 * @param origin - Request origin for token refresh
 * @returns Object with accessToken and accountName
 */
export async function getGBPAccessTokenForLocation(
  userId: string,
  businessLocationId: string,
  origin?: string
): Promise<{ accessToken: string; accountName: string }> {
  console.log('[GBP] Getting access token for location:', { userId, businessLocationId, provider: GBP_CONNECTED_ACCOUNTS_PROVIDER })

  // Get valid access token
  const accessToken = await getValidAccessToken(userId, businessLocationId, origin)
  console.log('[GBP] Got access token:', { hasToken: !!accessToken })

  // Get account name by fetching accounts
  console.log('[GBP] Fetching accounts...')
  const response = await gbpApiRequest<{ accounts: Array<{ name: string; accountName: string }> }>(
    '/accounts',
    userId,
    businessLocationId,
    { method: 'GET' },
    origin
  )

  const accounts = response.accounts || []
  console.log('[GBP] Accounts fetched:', { count: accounts.length, accounts: accounts.map(acc => ({ name: acc.name, accountName: acc.accountName })) })

  if (accounts.length === 0) {
    throw new Error('No GBP accounts found')
  }

  // Find primary account (same logic as locations route)
  const primaryAccount = accounts.find(acc => acc.accountName?.includes('accounts/')) || accounts[0]
  if (!primaryAccount) {
    throw new Error('No primary GBP account found')
  }

  const accountName = primaryAccount.name
  if (!accountName || !accountName.startsWith('accounts/')) {
    throw new Error(`Invalid account name format: ${accountName}. Expected format: accounts/123456789`)
  }

  console.log('[GBP] Selected account:', accountName)
  return { accessToken, accountName }
}

