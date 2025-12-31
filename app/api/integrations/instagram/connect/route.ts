import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramOAuthConfig, INSTAGRAM_REQUIRED_SCOPES } from '@/lib/instagram/config'
import { randomBytes } from 'crypto'

/**
 * Instagram OAuth Connect Endpoint
 * 
 * Initiates the Instagram OAuth flow by redirecting user to Meta authorization.
 * 
 * Redirect URI configured in Meta must match:
 * ${NEXT_PUBLIC_APP_URL}/api/integrations/instagram/callback
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const supabase = await createClient()

    // Verify user is authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get business_location_id from query params or use most recent location
    const businessLocationIdParam = requestUrl.searchParams.get('business_location_id')
    
    let businessLocationId: string
    if (businessLocationIdParam) {
      // Verify the location belongs to the user
      const { data: location, error: locationError } = await supabase
        .from('business_locations')
        .select('id')
        .eq('id', businessLocationIdParam)
        .eq('user_id', user.id)
        .maybeSingle()

      if (locationError || !location) {
        return NextResponse.json(
          { error: 'Business location not found or access denied' },
          { status: 404 }
        )
      }
      businessLocationId = location.id
    } else {
      // Get user's most recent business location
      const { data: location, error: locationError } = await supabase
        .from('business_locations')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (locationError || !location) {
        return NextResponse.json(
          { error: 'Business location not found. Please create a business location first.' },
          { status: 400 }
        )
      }
      businessLocationId = location.id
    }

    // Get Instagram OAuth configuration
    let config
    try {
      config = getInstagramOAuthConfig()
    } catch (error: any) {
      console.error('[Instagram Connect] Configuration error:', error.message)
      return NextResponse.json(
        { error: 'Instagram OAuth not configured', details: error.message },
        { status: 500 }
      )
    }

    // Generate cryptographically random state for CSRF protection
    const state = randomBytes(32).toString('base64url')
    
    // Store state in database with expiry (10 minutes)
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 10)

    const { error: stateError } = await supabase
      .from('instagram_oauth_states')
      .insert({
        state,
        user_id: user.id,
        business_location_id: businessLocationId,
        expires_at: expiresAt.toISOString(),
      } as any)

    if (stateError) {
      console.error('[Instagram Connect] Failed to store state:', stateError)
      return NextResponse.json(
        { error: 'Failed to initialize OAuth flow' },
        { status: 500 }
      )
    }

    // Build Meta OAuth URL for Instagram Business Login
    // Instagram API with Instagram Login uses Facebook OAuth endpoint with Instagram scopes
    const scopes = INSTAGRAM_REQUIRED_SCOPES.join(',')
    
    const params = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: config.redirectUri,
      scope: scopes,
      response_type: 'code',
      state: state,
    })

    // Instagram Business Login uses Facebook OAuth endpoint
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`

    console.log('[Instagram Connect] Generated OAuth URL:', {
      hasAppId: !!config.appId,
      redirectUri: config.redirectUri,
      scopes,
      stateLength: state.length,
    })

    // Redirect to Meta authorization
    return NextResponse.redirect(authUrl)
  } catch (error: any) {
    console.error('[Instagram Connect] Error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate Instagram OAuth', details: error.message },
      { status: 500 }
    )
  }
}

