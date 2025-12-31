import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramOAuthConfig, INSTAGRAM_REQUIRED_SCOPES } from '@/lib/instagram/config'
import { randomBytes } from 'crypto'

/**
 * Instagram OAuth Connect Endpoint
 * 
 * Initiates the Instagram OAuth flow by redirecting user to Instagram authorization.
 * Uses Instagram API with Instagram Login (NOT Facebook Login).
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

      const typedLocation = location as { id: string } | null

      if (locationError || !typedLocation) {
        return NextResponse.json(
          { error: 'Business location not found or access denied' },
          { status: 404 }
        )
      }
      businessLocationId = typedLocation.id
    } else {
      // Get user's most recent business location
      const { data: location, error: locationError } = await supabase
        .from('business_locations')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const typedLocation = location as { id: string } | null

      if (locationError || !typedLocation) {
        return NextResponse.json(
          { error: 'Business location not found. Please create a business location first.' },
          { status: 400 }
        )
      }
      businessLocationId = typedLocation.id
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

    // Check if table exists by attempting a simple query first
    const { error: tableCheckError } = await supabase
      .from('instagram_oauth_states')
      .select('id')
      .limit(1)

    if (tableCheckError) {
      console.error('[Instagram Connect] Table check failed:', {
        error: tableCheckError,
        message: tableCheckError.message,
        code: tableCheckError.code,
        hint: tableCheckError.hint,
      })
      return NextResponse.json(
        { 
          error: 'Database configuration error',
          details: tableCheckError.message || 'The instagram_oauth_states table may not exist. Please run the migration: migrations/create_instagram_oauth_states.sql',
          hint: tableCheckError.hint,
        },
        { status: 500 }
      )
    }

    const { error: stateError, data: stateData } = await supabase
      .from('instagram_oauth_states')
      .insert({
        state,
        user_id: user.id,
        business_location_id: businessLocationId,
        expires_at: expiresAt.toISOString(),
      } as any)
      .select()

    if (stateError) {
      console.error('[Instagram Connect] Failed to store state:', {
        error: stateError,
        message: stateError.message,
        details: stateError.details,
        hint: stateError.hint,
        code: stateError.code,
        userId: user.id,
        businessLocationId,
      })
      
      // Provide more specific error messages based on error code
      let errorMessage = 'Failed to initialize OAuth flow'
      let errorDetails = stateError.message || 'Database error'
      
      if (stateError.code === '42501') {
        errorDetails = 'Permission denied. Please check RLS policies for instagram_oauth_states table.'
      } else if (stateError.code === '42P01') {
        errorDetails = 'Table instagram_oauth_states does not exist. Please run the migration: migrations/create_instagram_oauth_states.sql'
      } else if (stateError.hint) {
        errorDetails = `${stateError.message}. ${stateError.hint}`
      }
      
      return NextResponse.json(
        { 
          error: errorMessage,
          details: errorDetails,
        },
        { status: 500 }
      )
    }

    // Build Instagram OAuth URL for Instagram API with Instagram Login
    // Use Instagram's authorization endpoint (NOT Facebook's)
    const scopes = INSTAGRAM_REQUIRED_SCOPES.join(',') // Comma-separated, no spaces
    
    const params = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: config.redirectUri,
      scope: scopes,
      response_type: 'code',
      state: state,
      force_reauth: 'true',
    })

    // Instagram API with Instagram Login uses Instagram's authorize endpoint
    const authUrl = `https://www.instagram.com/oauth/authorize?${params.toString()}`

    // Log the full auth URL (no secrets, just the URL)
    console.log('[Instagram Connect] Generated OAuth URL:', authUrl)
    console.log('[Instagram Connect] OAuth URL details:', {
      baseUrl: 'https://www.instagram.com/oauth/authorize',
      clientId: config.appId,
      redirectUri: config.redirectUri,
      scopes,
      stateLength: state.length,
      hasState: !!state,
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

