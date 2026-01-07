import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramOAuthConfig } from '@/lib/instagram/config'
import { getInstagramProfile } from '@/lib/instagram/profile'

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
  const allowBack = requestUrl.searchParams.get('allowBack') // Preserve allowBack param
  const supabase = await createClient()
  
  // Helper to build redirect URL with allowBack preservation
  const buildRedirectUrl = (path: string, params: Record<string, string> = {}) => {
    const redirectParams = new URLSearchParams(params)
    if (allowBack === 'true') {
      redirectParams.set('allowBack', 'true')
    }
    return new URL(`${path}?${redirectParams.toString()}`, requestUrl.origin)
  }

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

      // URL encode the error message for safe transmission
      const safeReason = encodeURIComponent(errorMessage)
      return NextResponse.redirect(
        buildRedirectUrl('/onboarding/connect', {
          ig: 'error',
          reason: safeReason,
        })
      )
    }

    if (!code) {
      console.error('[Instagram Callback] No authorization code received')
      return NextResponse.redirect(
        buildRedirectUrl('/onboarding/connect', {
          ig: 'error',
          reason: encodeURIComponent('No authorization code received from Instagram.'),
        })
      )
    }

    if (!state) {
      console.error('[Instagram Callback] No state parameter received')
      return NextResponse.redirect(
        buildRedirectUrl('/onboarding/connect', {
          ig: 'error',
          reason: encodeURIComponent('Invalid or expired OAuth state. Please try again.'),
        })
      )
    }

  try {
    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(
        buildRedirectUrl('/onboarding/connect', {
          ig: 'error',
          reason: encodeURIComponent('User not authenticated. Please log in and try again.'),
        })
      )
    }

    // Verify and retrieve state from database
    const { data: stateRecord, error: stateError } = await supabase
      .from('instagram_oauth_states')
      .select('user_id, business_location_id, expires_at, return_to')
      .eq('state', state)
      .maybeSingle()

    const typedStateRecord = stateRecord as { user_id: string; business_location_id: string; expires_at: string; return_to: string | null } | null

    if (stateError || !typedStateRecord) {
      console.error('[Instagram Callback] Invalid or expired state:', stateError)
      return NextResponse.redirect(
        buildRedirectUrl('/onboarding/connect', {
          ig: 'error',
          reason: encodeURIComponent('Invalid or expired OAuth state. Please try again.'),
        })
      )
    }

    // Verify state belongs to current user
    if (typedStateRecord.user_id !== user.id) {
      console.error('[Instagram Callback] State user mismatch')
      return NextResponse.redirect(
        buildRedirectUrl('/onboarding/connect', {
          ig: 'error',
          reason: encodeURIComponent('Invalid session. Please try again.'),
        })
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
        buildRedirectUrl('/onboarding/connect', {
          ig: 'error',
          reason: encodeURIComponent('OAuth session expired. Please try again.'),
        })
      )
    }

    const businessLocationId = typedStateRecord.business_location_id
    const returnTo = typedStateRecord.return_to

    // Get Instagram OAuth configuration
    let config
    try {
      config = getInstagramOAuthConfig()
    } catch (configError: any) {
      console.error('[Instagram Callback] Configuration error:', configError.message)
      return NextResponse.redirect(
        buildRedirectUrl('/onboarding/connect', {
          ig: 'error',
          reason: encodeURIComponent('Instagram OAuth not configured properly.'),
        })
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
        buildRedirectUrl('/onboarding/connect', {
          ig: 'error',
          reason: encodeURIComponent('Failed to exchange authorization code. Please try again.'),
        })
      )
    }

    const tokenData = await tokenResponse.json()

    console.log('[Instagram Callback] Short-lived token response:', {
      hasAccessToken: !!tokenData.access_token,
      hasUserId: !!tokenData.user_id,
      tokenLength: tokenData.access_token?.length,
      userId: tokenData.user_id,
      
      // CRITICAL: Instagram returns 'permissions' not 'scope'
      grantedPermissions: tokenData.permissions,  // ← Instagram uses this
      grantedScope: tokenData.scope,              // ← Not used by Instagram
      permissionsType: typeof tokenData.permissions,
      permissionsValue: tokenData.permissions,
      responseKeys: Object.keys(tokenData),
      // Do not log tokens/secrets
    })

    // Instagram returns 'permissions' not 'scope'
    const scopeField = tokenData.permissions || tokenData.scope

    console.log('[Instagram Callback] Scope field check:', {
      hasPermissions: !!tokenData.permissions,
      hasScope: !!tokenData.scope,
      permissionsType: typeof tokenData.permissions,
      permissionsValue: tokenData.permissions,
      usingField: tokenData.permissions ? 'permissions' : 'scope',
    })

    // Parse the granted scopes from the correct field
    let grantedScopes: string[] = []
    if (typeof scopeField === 'string') {
      grantedScopes = scopeField.split(',').map((s: string) => s.trim())
    } else if (Array.isArray(scopeField)) {
      grantedScopes = scopeField
    }

    console.log('[Instagram Callback] Parsed scopes from permissions field:', {
      scopesArray: grantedScopes,
      count: grantedScopes.length,
      includesBasic: grantedScopes.includes('instagram_business_basic'),
      includesPublish: grantedScopes.includes('instagram_business_content_publish'),
      includesInsights: grantedScopes.includes('instagram_business_manage_insights'),
      includesMessages: grantedScopes.includes('instagram_business_manage_messages'),
      includesComments: grantedScopes.includes('instagram_business_manage_comments'),
    })

    // Check for instagram_business_basic specifically
    const hasBasicScope = grantedScopes.includes('instagram_business_basic')
    console.log('[Instagram Callback] Has instagram_business_basic:', hasBasicScope)

    if (!hasBasicScope) {
      console.error('❌ [Instagram Callback] CRITICAL: instagram_business_basic NOT in granted scopes!')
      console.error('[Instagram Callback] This means Instagram did not grant this permission')
      console.error('[Instagram Callback] Granted scopes:', grantedScopes)
    }

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
        buildRedirectUrl('/onboarding/connect', {
          ig: 'error',
          reason: encodeURIComponent('Invalid response from Instagram. Please try again.'),
        })
      )
    }

    // Fetch Instagram user profile to get username using helper
    let instagramUsername: string | null = null
    console.log('[Instagram Callback] Fetching profile for user_id:', instagramUserId)
    const profile = await getInstagramProfile(accessToken)
    
    console.log('[Instagram Callback] Profile fetch result:', {
      hasProfile: !!profile,
      profileId: profile?.id,
      profileUsername: profile?.username,
      tokenUserId: instagramUserId,
      usernameMatch: profile?.id === instagramUserId,
    })
    
    if (profile) {
      instagramUsername = profile.username
      console.log('[Instagram Callback] Successfully fetched username:', instagramUsername)
      // Verify the user ID matches
      if (profile.id !== instagramUserId) {
        console.warn('[Instagram Callback] User ID mismatch between token and profile:', {
          tokenUserId: instagramUserId,
          profileUserId: profile.id,
        })
      }
    } else {
      console.warn('[Instagram Callback] Failed to fetch username from profile API, continuing without it')
    }

    // IMPORTANT: Exchange short-lived token for long-lived token
    // Short-lived tokens from api.instagram.com/oauth/access_token expire in ~1 hour
    // Long-lived tokens from graph.instagram.com/access_token expire in 60 days
    let longLivedToken = accessToken
    let longLivedExpiresIn = tokenData.expires_in || 3600 // Default to 1 hour for short-lived
    
    try {
      const exchangeUrl = new URL('https://graph.instagram.com/access_token')
      exchangeUrl.searchParams.set('grant_type', 'ig_exchange_token')
      exchangeUrl.searchParams.set('client_secret', config.appSecret)
      exchangeUrl.searchParams.set('access_token', accessToken)
      
      const exchangeResponse = await fetch(exchangeUrl.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      })
      
      const exchangeData = await exchangeResponse.json()
      
      if (exchangeResponse.ok && exchangeData.access_token) {
        longLivedToken = exchangeData.access_token
        longLivedExpiresIn = exchangeData.expires_in || 5184000 // 60 days in seconds
        console.log('[Instagram Callback] Long-lived token response:', {
          hasAccessToken: !!exchangeData.access_token,
          tokenLength: exchangeData.access_token?.length,
          expiresIn: longLivedExpiresIn,
          expiresInDays: Math.floor(longLivedExpiresIn / 86400),
        })
      } else {
        console.warn('[Instagram Callback] Failed to exchange to long-lived token, using short-lived:', {
          status: exchangeResponse.status,
          error: exchangeData.error,
        })
      }
    } catch (exchangeError: any) {
      console.error('[Instagram Callback] Error exchanging to long-lived token:', exchangeError)
      // Continue with short-lived token
    }

    // Calculate token expiry using long-lived token expiry
    const tokenExpiresAt = longLivedExpiresIn
      ? new Date(Date.now() + longLivedExpiresIn * 1000).toISOString()
      : null

    // Use the parsed granted scopes (what Instagram actually granted)
    const scopesToSave = grantedScopes.length > 0 ? grantedScopes : null

    // Upsert Instagram connection
    console.log('[Instagram Callback] About to save to database:', {
      businessLocationId,
      instagramUserId: instagramUserId,
      scopesToSave: scopesToSave,
      scopesType: typeof scopesToSave,
      isArray: Array.isArray(scopesToSave),
      scopesLength: scopesToSave?.length || 0,
      tokenExpiryDate: tokenExpiresAt,
      hasBasicScope: scopesToSave?.includes('instagram_business_basic') || false,
    })

    // Build upsert payload - try with connected_at first, fallback without it if column doesn't exist
    // IMPORTANT: Only include instagram_username if we successfully fetched it
    // If profile fetch failed, don't overwrite existing username with null
    // Use long-lived token instead of short-lived
    // Ensure scopes are saved as an array
    const upsertPayload: any = {
      business_location_id: businessLocationId,
      instagram_user_id: instagramUserId,
      access_token: longLivedToken, // Store long-lived token
      token_expires_at: tokenExpiresAt,
      scopes: scopesToSave, // Must be array of strings
    }
    
    // Only set username if we successfully fetched it
    // This prevents overwriting existing username with null when profile fetch fails
    if (instagramUsername) {
      upsertPayload.instagram_username = instagramUsername
      console.log('[Instagram Callback] Will update username in database:', instagramUsername)
    } else {
      console.warn('[Instagram Callback] Profile fetch returned null username - will NOT update username field to preserve existing value')
    }

    // Try to include connected_at (will fail gracefully if column doesn't exist)
    // The migration should be run, but we handle the case where it hasn't been
    try {
      upsertPayload.connected_at = new Date().toISOString()
    } catch (e) {
      // Ignore - connected_at is optional
    }

    const { error: upsertError, data: upsertData } = await supabase
      .from('instagram_connections')
      .upsert(upsertPayload, {
        onConflict: 'business_location_id',
      })
      .select()

    if (upsertError) {
      console.error('[Instagram Callback] ❌ Database save FAILED:', {
        error: upsertError,
        message: upsertError.message,
        code: upsertError.code,
        hint: upsertError.hint,
        scopesBeingSaved: scopesToSave,
      })
      console.error('[Instagram Callback] Failed to store connection:', {
        error: upsertError,
        message: upsertError.message,
        code: upsertError.code,
        hint: upsertError.hint,
        details: upsertError.details,
      })
      
      // Provide more specific error message based on error code
      let errorMessage = 'Failed to save connection. Please try again.'
      if (upsertError.code === '42703') {
        // Column does not exist
        errorMessage = 'Database migration required. Please run migrations/add_instagram_connected_at.sql'
      } else if (upsertError.hint) {
        errorMessage = `Database error: ${upsertError.hint}`
      } else if (upsertError.message) {
        errorMessage = `Database error: ${upsertError.message}`
      }
      
      return NextResponse.redirect(
        buildRedirectUrl('/onboarding/connect', {
          ig: 'error',
          reason: encodeURIComponent(errorMessage),
        })
      )
    }

    if (!upsertError) {
      console.log('[Instagram Callback] ✅ Database save successful')
      console.log('[Instagram Callback] Saved data:', {
        recordCount: upsertData?.length || 0,
        businessLocationId,
        savedScopes: scopesToSave,
        hasBasicScope: scopesToSave?.includes('instagram_business_basic') || false,
        scopesCount: scopesToSave?.length || 0,
      })
    }
    
    console.log('========================================')
    console.log('[Instagram Callback] OAuth flow completed')
    console.log('========================================')

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
    const successParams: Record<string, string> = {
      ig: 'connected',
      connected: '1',
    }
    if (instagramUserId) {
      successParams.ig_user_id = instagramUserId
    }
    if (instagramUsername) {
      successParams.ig_username = instagramUsername
    }

    // If return_to was provided, redirect back to that URL after successful connection
    if (returnTo) {
      try {
        // Validate return_to is a relative URL (security check)
        const returnUrl = new URL(returnTo, requestUrl.origin)
        if (returnUrl.origin === requestUrl.origin) {
          // Append success params to the return URL
          Object.entries(successParams).forEach(([key, value]) => {
            returnUrl.searchParams.set(key, value)
          })
          console.log('[Instagram Callback] Redirecting back to:', returnUrl.toString())
          return NextResponse.redirect(returnUrl)
        }
      } catch (urlError) {
        console.warn('[Instagram Callback] Invalid return_to URL, using default redirect:', returnTo)
      }
    }

    // Default redirect to onboarding connect page with success
    // Include allowBack=true to prevent auto-redirect to analysis page
    successParams.allowBack = 'true'
    return NextResponse.redirect(buildRedirectUrl('/onboarding/connect', successParams))
  } catch (error: any) {
    console.error('[Instagram Callback] Unexpected error:', {
      error: error.message,
      stack: error.stack,
    })
    return NextResponse.redirect(
      buildRedirectUrl('/onboarding/connect', {
        ig: 'error',
        reason: encodeURIComponent('An internal error occurred. Please try again.'),
      })
    )
  }
}

