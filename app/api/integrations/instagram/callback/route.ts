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
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')
  const state = requestUrl.searchParams.get('state')
  const supabase = await createClient()

  // Handle OAuth errors from Instagram
  if (error) {
    console.error('[Instagram Callback] OAuth error:', {
      error,
      errorDescription,
    })
    
    let errorMessage = 'Failed to connect Instagram account.'
    if (error === 'access_denied') {
      errorMessage = 'Connection cancelled. Please try again when ready.'
    } else if (error === 'invalid_request') {
      errorMessage = 'Invalid OAuth request. Please check redirect URI configuration.'
    } else if (error === 'redirect_uri_mismatch') {
      errorMessage = 'Redirect URI mismatch. Please contact support.'
    }

    return NextResponse.redirect(
      new URL(`/settings/integrations/instagram?error=${encodeURIComponent(errorMessage)}`, requestUrl.origin)
    )
  }

  if (!code) {
    console.error('[Instagram Callback] No authorization code received')
    return NextResponse.redirect(
      new URL('/settings/integrations/instagram?error=No authorization code received', requestUrl.origin)
    )
  }

  if (!state) {
    console.error('[Instagram Callback] No state parameter received')
    return NextResponse.redirect(
      new URL('/settings/integrations/instagram?error=Invalid OAuth state', requestUrl.origin)
    )
  }

  try {
    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(
        new URL('/settings/integrations/instagram?error=User not authenticated', requestUrl.origin)
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
        new URL('/settings/integrations/instagram?error=Invalid or expired OAuth state', requestUrl.origin)
      )
    }

    // Verify state belongs to current user
    if (typedStateRecord.user_id !== user.id) {
      console.error('[Instagram Callback] State user mismatch')
      return NextResponse.redirect(
        new URL('/settings/integrations/instagram?error=Invalid session', requestUrl.origin)
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
        new URL('/settings/integrations/instagram?error=OAuth session expired. Please try again.', requestUrl.origin)
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
        new URL('/settings/integrations/instagram?error=OAuth not configured', requestUrl.origin)
      )
    }

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
      console.error('[Instagram Callback] Token exchange failed:', errorData)
      return NextResponse.redirect(
        new URL('/settings/integrations/instagram?error=Failed to exchange authorization code', requestUrl.origin)
      )
    }

    const tokenData = await tokenResponse.json()

    // Instagram API returns access_token and user_id in the response
    const accessToken = tokenData.access_token
    const instagramUserId = tokenData.user_id

    if (!accessToken || !instagramUserId) {
      console.error('[Instagram Callback] Missing access_token or user_id in response:', tokenData)
      return NextResponse.redirect(
        new URL('/settings/integrations/instagram?error=Invalid token response', requestUrl.origin)
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
    const { error: upsertError } = await supabase
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

    if (upsertError) {
      console.error('[Instagram Callback] Failed to store connection:', upsertError)
      return NextResponse.redirect(
        new URL('/settings/integrations/instagram?error=Failed to save connection', requestUrl.origin)
      )
    }

    // Clean up used state
    await supabase
      .from('instagram_oauth_states')
      .delete()
      .eq('state', state)

    console.log('[Instagram Callback] Successfully connected Instagram account:', {
      businessLocationId,
      instagramUserId,
      hasUsername: !!instagramUsername,
    })

    // Redirect to settings page with success
    return NextResponse.redirect(
      new URL('/settings/integrations/instagram?success=Instagram account connected successfully', requestUrl.origin)
    )
  } catch (error: any) {
    console.error('[Instagram Callback] Error:', error)
    return NextResponse.redirect(
      new URL(`/settings/integrations/instagram?error=${encodeURIComponent(error.message || 'Internal server error')}`, requestUrl.origin)
    )
  }
}

