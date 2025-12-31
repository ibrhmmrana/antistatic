import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramOAuthConfig } from '@/lib/instagram/config'

/**
 * Instagram OAuth Callback Endpoint
 * 
 * Handles the OAuth callback from Instagram after user authorization.
 * Exchanges authorization code for access token and stores connection.
 * Uses Instagram API with Instagram Login (NOT Facebook Login).
 * 
 * Redirect URI must match:
 * ${NEXT_PUBLIC_APP_URL}/api/integrations/instagram/callback
 */
export async function GET(request: NextRequest) {
  // Handle Instagram redirects that may include #_ fragment
  // Strip the fragment before parsing URL
  let urlString = request.url
  if (urlString.includes('#_')) {
    urlString = urlString.split('#_')[0]
  }
  if (urlString.includes('#')) {
    urlString = urlString.split('#')[0]
  }
  
  const requestUrl = new URL(urlString)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')
  const state = requestUrl.searchParams.get('state')
  const supabase = await createClient()

  console.log('[Instagram Callback] Received callback:', {
    hasCode: !!code,
    hasError: !!error,
    hasState: !!state,
    error,
    errorDescription,
  })

  // Handle OAuth errors from Instagram
  if (error) {
    console.error('[Instagram Callback] OAuth error:', {
      error,
      errorDescription,
    })
    
    let errorCode = 'unknown_error'
    let errorMessage = 'Failed to connect Instagram account.'
    if (error === 'access_denied') {
      errorCode = 'access_denied'
      errorMessage = 'Connection cancelled. Please try again when ready.'
    } else if (error === 'invalid_request') {
      errorCode = 'invalid_request'
      errorMessage = 'Invalid OAuth request. Please check redirect URI configuration.'
    } else if (error === 'redirect_uri_mismatch') {
      errorCode = 'redirect_uri_mismatch'
      errorMessage = 'Redirect URI mismatch. Please contact support.'
    }

    return NextResponse.redirect(
      new URL(`/onboarding/connect?ig_error=${errorCode}`, requestUrl.origin)
    )
  }

  if (!code) {
    console.error('[Instagram Callback] No authorization code received')
    return NextResponse.redirect(
      new URL('/onboarding/connect?ig_error=no_code', requestUrl.origin)
    )
  }

  if (!state) {
    console.error('[Instagram Callback] No state parameter received')
    return NextResponse.redirect(
      new URL('/onboarding/connect?ig_error=invalid_state', requestUrl.origin)
    )
  }

  try {
    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(
        new URL('/onboarding/connect?ig_error=not_authenticated', requestUrl.origin)
      )
    }

    // Verify and retrieve state from database
    const { data: stateRecord, error: stateError } = await supabase
      .from('instagram_oauth_states')
      .select('user_id, business_location_id, expires_at')
      .eq('state', state)
      .maybeSingle()

    const typedStateRecord = stateRecord as { user_id: string; business_location_id: string; expires_at: string } | null

    if (stateError || !typedStateRecord) {
      console.error('[Instagram Callback] Invalid or expired state:', stateError)
      return NextResponse.redirect(
        new URL('/onboarding/connect?ig_error=invalid_state', requestUrl.origin)
      )
    }

    // Verify state belongs to current user
    if (typedStateRecord.user_id !== user.id) {
      console.error('[Instagram Callback] State user mismatch')
      return NextResponse.redirect(
        new URL('/onboarding/connect?ig_error=invalid_session', requestUrl.origin)
      )
    }

    // Check if state has expired
    const expiresAt = new Date(typedStateRecord.expires_at)
    if (expiresAt < new Date()) {
      console.error('[Instagram Callback] State expired')
      // Clean up expired state
      await supabase
        .from('instagram_oauth_states')
        .delete()
        .eq('state', state)
      return NextResponse.redirect(
        new URL('/onboarding/connect?ig_error=expired_state', requestUrl.origin)
      )
    }

    const businessLocationId = typedStateRecord.business_location_id

    // Get Instagram OAuth configuration
    let config
    try {
      config = getInstagramOAuthConfig()
    } catch (configError: any) {
      console.error('[Instagram Callback] Configuration error:', configError.message)
      return NextResponse.redirect(
        new URL('/onboarding/connect?ig_error=config_error', requestUrl.origin)
      )
    }

    console.log('[Instagram Callback] Exchanging code for token:', {
      hasCode: !!code,
      redirectUri: config.redirectUri,
      clientId: config.appId,
    })

    // Exchange authorization code for access token
    // Instagram API with Instagram Login uses Instagram's token endpoint
    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: config.redirectUri,
        code: code,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}))
      console.error('[Instagram Callback] Token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorData,
      })
      return NextResponse.redirect(
        new URL('/onboarding/connect?ig_error=token_exchange_failed', requestUrl.origin)
      )
    }

    const tokenData = await tokenResponse.json()

    console.log('[Instagram Callback] Token exchange result:', {
      hasAccessToken: !!tokenData.access_token,
      hasUserId: !!tokenData.user_id,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
      // Do not log tokens/secrets
    })

    // Instagram API returns access_token and user_id in the response
    const accessToken = tokenData.access_token
    const instagramUserId = tokenData.user_id

    if (!accessToken || !instagramUserId) {
      console.error('[Instagram Callback] Missing access_token or user_id in response:', {
        hasAccessToken: !!tokenData.access_token,
        hasUserId: !!tokenData.user_id,
        responseKeys: Object.keys(tokenData),
      })
      return NextResponse.redirect(
        new URL('/onboarding/connect?ig_error=invalid_token_response', requestUrl.origin)
      )
    }

    // Fetch Instagram user info to get username
    // Instagram Basic Display API endpoint for user info
    let instagramUsername: string | null = null
    try {
      const userInfoResponse = await fetch(`https://graph.instagram.com/${instagramUserId}?fields=username&access_token=${accessToken}`)
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json()
        instagramUsername = userInfo.username || null
      }
    } catch (userInfoError) {
      console.warn('[Instagram Callback] Failed to fetch username:', userInfoError)
      // Continue without username - not critical
    }

    // Calculate token expiry (Instagram tokens typically expire in 60 days, but check response)
    const expiresIn = tokenData.expires_in || 5184000 // Default to 60 days in seconds
    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null

    // Extract scopes from token response if available
    const scopes = tokenData.scope ? tokenData.scope.split(',') : null

    // Upsert Instagram connection
    console.log('[Instagram Callback] Upserting connection to database:', {
      businessLocationId,
      instagramUserId,
      hasUsername: !!instagramUsername,
      hasScopes: !!scopes,
      scopesCount: scopes?.length || 0,
    })

    const { error: upsertError, data: upsertData } = await supabase
      .from('instagram_connections')
      .upsert({
        business_location_id: businessLocationId,
        instagram_user_id: instagramUserId,
        instagram_username: instagramUsername,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        scopes: scopes,
      } as any, {
        onConflict: 'business_location_id',
      })
      .select()

    if (upsertError) {
      console.error('[Instagram Callback] Failed to store connection:', {
        error: upsertError,
        message: upsertError.message,
        code: upsertError.code,
        hint: upsertError.hint,
      })
      return NextResponse.redirect(
        new URL('/onboarding/connect?ig_error=db_save_failed', requestUrl.origin)
      )
    }

    console.log('[Instagram Callback] DB upsert result:', {
      success: !upsertError,
      recordCount: upsertData?.length || 0,
      businessLocationId,
    })

    // Clean up used state
    await supabase
      .from('instagram_oauth_states')
      .delete()
      .eq('state', state)

    console.log('[Instagram Callback] Successfully connected Instagram account:', {
      businessLocationId,
      instagramUserId,
      username: instagramUsername,
      hasUsername: !!instagramUsername,
    })

    // Build redirect URL with success params
    const redirectParams = new URLSearchParams({
      ig: 'connected',
      connected: '1',
    })
    if (instagramUserId) {
      redirectParams.set('ig_user_id', instagramUserId)
    }
    if (instagramUsername) {
      redirectParams.set('ig_username', instagramUsername)
    }

    // Redirect to onboarding connect page with success
    return NextResponse.redirect(
      new URL(`/onboarding/connect?${redirectParams.toString()}`, requestUrl.origin)
    )
  } catch (error: any) {
    console.error('[Instagram Callback] Unexpected error:', {
      error: error.message,
      stack: error.stack,
    })
    return NextResponse.redirect(
      new URL(`/onboarding/connect?ig_error=internal_error`, requestUrl.origin)
    )
  }
}

