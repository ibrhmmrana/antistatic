import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getGBPOAuthConfig, GBP_REQUIRED_SCOPES } from '@/lib/gbp/config'

/**
 * Generate Google OAuth URL for Google Business Profile connection
 * 
 * This endpoint uses a dedicated GBP OAuth client (separate from Supabase Auth).
 * Supabase Auth continues to handle user login with its own Google OAuth client.
 * 
 * Required env vars: GBP_CLIENT_ID, GBP_CLIENT_SECRET, GBP_REDIRECT_URI
 * 
 * The redirect URI must be configured in Google Cloud Console as:
 * - Development: http://localhost:3000/api/gbp/oauth/callback
 * - Production: https://yourdomain.com/api/gbp/oauth/callback
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const cookieStore = await cookies()

    // Verify user is authenticated
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {
            // No-op for server components
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's business location for state
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!location) {
      return NextResponse.json(
        { error: 'Business location not found' },
        { status: 400 }
      )
    }

    // Get GBP OAuth configuration
    let config
    try {
      config = getGBPOAuthConfig(requestUrl.origin)
    } catch (error: any) {
      console.error('GBP OAuth configuration error:', error.message)
      return NextResponse.json(
        { error: 'GBP OAuth not configured', details: error.message },
        { status: 500 }
      )
    }

    // Generate state parameter for CSRF protection
    // Include userId and businessLocationId for verification
    const state = Buffer.from(JSON.stringify({ 
      userId: user.id,
      businessLocationId: location.id,
    })).toString('base64url')

    // Build Google OAuth URL with Business Profile scope
    const scopes = GBP_REQUIRED_SCOPES.join(' ')

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline', // Required for refresh token
      prompt: 'consent', // Force consent screen to get refresh token
      state: state,
    })

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    console.log('Generated GBP OAuth URL:', {
      hasClientId: !!config.clientId,
      redirectUri: config.redirectUri,
      scopes,
    })

    return NextResponse.json({ url: authUrl })
  } catch (error: any) {
    console.error('Error generating GBP OAuth URL:', error)
    return NextResponse.json(
      { error: 'Failed to generate OAuth URL', details: error.message },
      { status: 500 }
    )
  }
}

