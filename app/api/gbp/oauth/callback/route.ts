import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { getGBPOAuthConfig } from '@/lib/gbp/config'
import { verifyGBPConnection } from '@/lib/gbp/client'
import { resolveAndStoreGBPLocationName } from '@/lib/gbp/location-resolver'

/**
 * Google Business Profile OAuth callback handler
 * 
 * This endpoint handles the OAuth callback from Google after user consent.
 * It exchanges the authorization code for tokens and stores them in the database.
 * 
 * Redirect URI configured in Google Cloud Console must match:
 * - Development: http://localhost:3000/api/gbp/oauth/callback
 * - Production: https://yourdomain.com/api/gbp/oauth/callback
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const state = requestUrl.searchParams.get('state')
  const cookieStore = await cookies()

  // Handle OAuth errors from Google
  if (error) {
    console.error('Google OAuth error:', {
      error,
      errorDescription: requestUrl.searchParams.get('error_description'),
    })
    
    let errorMessage = 'Failed to connect Google Business Profile.'
    if (error === 'access_denied') {
      errorMessage = 'Connection cancelled. Please try again when ready.'
    } else if (error === 'invalid_request') {
      errorMessage = 'Invalid OAuth request. Please check redirect URI configuration.'
    } else if (error === 'redirect_uri_mismatch') {
      errorMessage = 'Redirect URI mismatch. Please contact support.'
    }

    return NextResponse.redirect(
      new URL(`/onboarding/connect?gbp=error&reason=${encodeURIComponent(errorMessage)}`, requestUrl.origin)
    )
  }

  if (!code) {
    console.error('No authorization code received from Google')
    return NextResponse.redirect(
      new URL('/onboarding/connect?gbp=error&reason=No authorization code received', requestUrl.origin)
    )
  }

  // Verify state parameter
  let userId: string | null = null
  let businessLocationId: string | null = null
  if (state) {
    try {
      const decodedState = JSON.parse(Buffer.from(state, 'base64url').toString())
      userId = decodedState.userId
      businessLocationId = decodedState.businessLocationId
    } catch (e) {
      console.error('Invalid state parameter:', e)
    }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  try {
    // Get authenticated user (verify they match state if provided)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.error('No authenticated user found')
      return NextResponse.redirect(
        new URL('/onboarding/connect?gbp=error&reason=User not authenticated', requestUrl.origin)
      )
    }

    // Verify state matches user if provided
    if (userId && userId !== user.id) {
      console.error('State mismatch:', { stateUserId: userId, currentUserId: user.id })
      return NextResponse.redirect(
        new URL('/onboarding/connect?gbp=error&reason=Invalid session', requestUrl.origin)
      )
    }

    // Get the user's business location
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (locationError || !location) {
      console.error('No business location found for user:', {
        userId: user.id,
        error: locationError,
      })
      return NextResponse.redirect(
        new URL('/onboarding/connect?gbp=error&reason=Business location not found', requestUrl.origin)
      )
    }

    // Verify businessLocationId matches if provided in state
    if (businessLocationId && businessLocationId !== location.id) {
      console.error('Business location mismatch in state')
      return NextResponse.redirect(
        new URL('/onboarding/connect?gbp=error&reason=Invalid business location', requestUrl.origin)
      )
    }

    // Get GBP OAuth configuration
    let config
    try {
      config = getGBPOAuthConfig(requestUrl.origin)
    } catch (configError: any) {
      console.error('GBP OAuth configuration error:', configError.message)
      return NextResponse.redirect(
        new URL('/onboarding/connect?gbp=error&reason=OAuth not configured', requestUrl.origin)
      )
    }

    console.log('Exchanging code for tokens:', {
      hasCode: !!code,
      redirectUri: config.redirectUri,
      hasClientId: !!config.clientId,
    })

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', {
        status: tokenResponse.status,
        error: tokenData.error,
        errorDescription: tokenData.error_description,
        fullResponse: tokenData,
      })
      
      let errorMessage = 'Failed to exchange authorization code for tokens.'
      if (tokenData.error === 'invalid_grant') {
        errorMessage = 'Authorization code expired or already used. Please try connecting again.'
      } else if (tokenData.error === 'invalid_client') {
        errorMessage = 'OAuth client configuration error. Please contact support.'
      } else if (tokenData.error === 'redirect_uri_mismatch') {
        errorMessage = 'Redirect URI mismatch. Please check Google Cloud Console configuration.'
      }

      return NextResponse.redirect(
        new URL(`/onboarding/connect?gbp=error&reason=${encodeURIComponent(errorMessage)}`, requestUrl.origin)
      )
    }

    const {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      scope: scopeString,
    } = tokenData

    if (!accessToken) {
      console.error('No access token in response:', tokenData)
      return NextResponse.redirect(
        new URL('/onboarding/connect?gbp=error&reason=No access token received', requestUrl.origin)
      )
    }

    // Verify required scope is present
    const scopes = scopeString ? scopeString.split(' ').filter(Boolean) : []
    const hasBusinessManageScope = scopes.includes('https://www.googleapis.com/auth/business.manage')
    
    if (!hasBusinessManageScope) {
      console.error('Missing business.manage scope:', scopes)
      return NextResponse.redirect(
        new URL('/onboarding/connect?gbp=error&reason=Missing business.manage scope', requestUrl.origin)
      )
    }

    // Calculate expiration time
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null

    // Get user info from Google to extract account details
    let providerAccountId: string | null = null
    let displayName: string | null = null
    let avatarUrl: string | null = null

    try {
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json()
        providerAccountId = userInfo.id || userInfo.sub || null
        displayName = userInfo.name || null
        avatarUrl = userInfo.picture || null

        console.log('Retrieved user info from Google:', {
          hasAccountId: !!providerAccountId,
          displayName,
        })
      } else {
        console.warn('Failed to fetch user info, continuing without it:', userInfoResponse.status)
      }
    } catch (userInfoError) {
      console.warn('Error fetching user info, continuing without it:', userInfoError)
    }

    console.log('Saving connected account:', {
      userId: user.id,
      locationId: location.id,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      expiresAt,
      scopes,
    })

    // Upsert connected account
    const { error: upsertError, data: upsertData } = await supabase
      .from('connected_accounts')
      .upsert(
        {
          user_id: user.id,
          business_location_id: location.id,
          provider: 'google_gbp',
          provider_account_id: providerAccountId,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresAt,
          scopes: scopes,
          display_name: displayName,
          avatar_url: avatarUrl,
          status: 'connected',
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'business_location_id,provider',
        }
      )

    if (upsertError) {
      console.error('Failed to save connected account:', {
        error: upsertError,
        message: upsertError.message,
        details: upsertError.details,
        hint: upsertError.hint,
        code: upsertError.code,
      })
      return NextResponse.redirect(
        new URL('/onboarding/connect?gbp=error&reason=Failed to save connection', requestUrl.origin)
      )
    }

    console.log('Successfully saved connected account:', {
      provider: 'google_gbp',
      business_location_id: location.id,
      user_id: user.id,
    })

    // Verify connection by calling GBP API (smoke test)
    try {
      const verification = await verifyGBPConnection(user.id, location.id, requestUrl.origin)
      console.log('GBP connection verified:', {
        accountCount: verification.accounts.length,
        primaryAccount: verification.primaryAccountName,
      })
    } catch (verifyError: any) {
      console.error('GBP verification failed, but connection saved:', verifyError.message)
      // Don't fail the whole flow if verification fails - tokens are saved
    }

    // Resolve and store GBP location name immediately after connection
    // This ensures google_location_name is available for reviews fetching
    try {
      console.log('[GBP OAuth Callback] Resolving location name after connection...')
      const locationName = await resolveAndStoreGBPLocationName(
        user.id,
        location.id,
        requestUrl.origin
      )
      if (locationName) {
        console.log('[GBP OAuth Callback] Successfully resolved and stored location name:', locationName)
      } else {
        console.warn('[GBP OAuth Callback] Could not resolve location name, will be resolved when reviews are fetched')
      }
    } catch (locationResolveError: any) {
      console.error('[GBP OAuth Callback] Error resolving location name (non-fatal):', locationResolveError.message)
      // Don't fail the OAuth flow if location resolution fails - it can be done later
    }

    // Note: GBP analysis will be triggered client-side when the connect page detects GBP is connected
    // This ensures analysis starts immediately without blocking the OAuth redirect
    // Include allowBack=true to prevent auto-redirect to analysis page

    return NextResponse.redirect(
      new URL('/onboarding/connect?gbp=connected&allowBack=true', requestUrl.origin)
    )
  } catch (error: any) {
    console.error('GBP callback error:', {
      message: error?.message,
      stack: error?.stack,
      error: error,
    })
    return NextResponse.redirect(
      new URL(`/onboarding/connect?gbp=error&reason=${encodeURIComponent(error.message || 'Unexpected error')}`, requestUrl.origin)
    )
  }
}

