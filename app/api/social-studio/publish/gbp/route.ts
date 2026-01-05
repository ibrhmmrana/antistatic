import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, GBP_CONNECTED_ACCOUNTS_PROVIDER, gbpApiRequest, getGBPAccessTokenForLocation } from '@/lib/gbp/client'
import { resolveAndStoreGBPLocationName } from '@/lib/gbp/location-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/social-studio/publish/gbp
 * 
 * Publish a Local Post to Google Business Profile
 * Uses the My Business API v4 Local Posts endpoint
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { businessLocationId, summary, languageCode = 'en', cta, media } = body

    if (!businessLocationId || !summary) {
      return NextResponse.json(
        { error: 'Missing required fields: businessLocationId, summary' },
        { status: 400 }
      )
    }

    // Verify business location belongs to user
    const { data: locationData, error: locationError } = await supabase
      .from('business_locations')
      .select('id, user_id, google_location_name')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (locationError || !locationData) {
      return NextResponse.json({ error: 'Business location not found' }, { status: 404 })
    }

    // Type assertion for location with selected fields
    const location = locationData as {
      id: string
      user_id: string
      google_location_name: string | null
    }

    // Check if GBP is connected
    const { data: connectedAccount } = await supabase
      .from('connected_accounts')
      .select('id, status, expires_at')
      .eq('user_id', user.id)
      .eq('business_location_id', businessLocationId)
      .eq('provider', GBP_CONNECTED_ACCOUNTS_PROVIDER)
      .eq('status', 'connected')
      .maybeSingle()

    if (!connectedAccount) {
      return NextResponse.json(
        { error: 'Google Business Profile not connected', needs_reauth: true },
        { status: 400 }
      )
    }

    // Get or resolve GBP location name (parent path)
    let parent = location.google_location_name

    // If location name is missing or incomplete (missing accounts/ prefix), resolve it
    if (!parent || !parent.match(/^accounts\/[^/]+\/locations\/[^/]+$/)) {
      console.log('[GBP Publish] Location name missing or incomplete, resolving...', { stored: parent })
      
      // Get account name and access token
      let accountName: string
      let accessToken: string
      
      try {
        const { accessToken: token, accountName: accName } = await getGBPAccessTokenForLocation(
          user.id,
          businessLocationId,
          request.headers.get('origin') || undefined
        )
        accountName = accName
        accessToken = token
      } catch (tokenError: any) {
        console.error('[GBP Publish] Error getting account name:', tokenError)
        return NextResponse.json(
          { error: 'Could not get GBP account. Please reconnect your Google Business Profile.', needs_reauth: true },
          { status: 400 }
        )
      }

      // If we have a partial location name (just locations/...), construct full path
      if (parent && parent.startsWith('locations/')) {
        parent = `${accountName}/${parent}`
        console.log('[GBP Publish] Constructed full location path:', parent)
        
        // Update database with full path
        const locations = supabase.from('business_locations') as any
        await locations
          .update({ google_location_name: parent })
          .eq('id', businessLocationId)
          .eq('user_id', user.id)
      } else {
        // No location name stored, fetch it from API
        try {
          const locationsResponse = await gbpApiRequest<{ locations: Array<{ name: string }> }>(
            `/${accountName}/locations`,
            user.id,
            businessLocationId,
            { method: 'GET' },
            request.headers.get('origin') || undefined
          )

          const locations = locationsResponse.locations || []
          if (locations.length === 0) {
            return NextResponse.json(
              { error: 'No GBP locations found. Please reconnect your Google Business Profile.' },
              { status: 400 }
            )
          }

          // Use first location (or match by website if available)
          parent = locations[0].name
          console.log('[GBP Publish] Resolved location name:', parent)

          // Update database with full path
          const locationsUpdate = supabase.from('business_locations') as any
          await locationsUpdate
            .update({ google_location_name: parent })
            .eq('id', businessLocationId)
            .eq('user_id', user.id)
        } catch (resolveError: any) {
          console.error('[GBP Publish] Error resolving location:', resolveError)
          return NextResponse.json(
            { error: 'Could not resolve GBP location. Please reconnect your Google Business Profile.' },
            { status: 400 }
          )
        }
      }
    }

    // Validate parent format (should be accounts/.../locations/...)
    if (!parent || !parent.match(/^accounts\/[^/]+\/locations\/[^/]+$/)) {
      return NextResponse.json(
        { error: `Invalid location name format: ${parent}. Expected format: accounts/{accountId}/locations/{locationId}` },
        { status: 400 }
      )
    }

    // Get valid access token (will refresh if needed)
    let accessToken: string
    try {
      accessToken = await getValidAccessToken(
        user.id,
        businessLocationId,
        request.headers.get('origin') || undefined
      )
    } catch (tokenError: any) {
      console.error('[GBP Publish] Token error:', tokenError)
      if (tokenError.message?.includes('reconnect')) {
        return NextResponse.json(
          { error: tokenError.message, needs_reauth: true },
          { status: 401 }
        )
      }
      throw tokenError
    }

    // Build LocalPost payload
    const localPostPayload: any = {
      languageCode,
      summary,
      topicType: 'STANDARD', // Required field, using STANDARD for MVP
    }

    // Add call-to-action if provided
    if (cta && cta.actionType) {
      localPostPayload.callToAction = {
        actionType: cta.actionType,
      }

      // URL is required for all action types except CALL
      if (cta.actionType !== 'CALL' && cta.url) {
        localPostPayload.callToAction.url = cta.url
      }
    }

    // Add media if provided
    if (media && media.sourceUrl) {
      // Validate media URL is public and fetchable (dev only)
      if (process.env.NODE_ENV === 'development') {
        try {
          const mediaResponse = await fetch(media.sourceUrl, { method: 'HEAD', redirect: 'follow' })
          const finalUrl = mediaResponse.url
          const contentType = mediaResponse.headers.get('content-type') || ''
          const contentLength = mediaResponse.headers.get('content-length')
          
          console.log('[GBP Publish] Media URL validation:', {
            originalUrl: media.sourceUrl,
            finalUrl,
            status: mediaResponse.status,
            contentType,
            contentLength: contentLength ? `${Math.round(parseInt(contentLength) / 1024)}KB` : 'unknown',
          })
          
          if (mediaResponse.status !== 200) {
            return NextResponse.json(
              { error: `Media URL is not accessible (status: ${mediaResponse.status}). Please ensure the image is publicly accessible.` },
              { status: 400 }
            )
          }
          
          if (!contentType.startsWith('image/')) {
            return NextResponse.json(
              { error: `Media URL does not point to an image (content-type: ${contentType}). Please provide a valid image URL.` },
              { status: 400 }
            )
          }
        } catch (mediaError: any) {
          console.error('[GBP Publish] Media URL validation error:', mediaError)
          return NextResponse.json(
            { error: `Failed to validate media URL: ${mediaError.message}. Please ensure the image is publicly accessible.` },
            { status: 400 }
          )
        }
      }
      
      // Build media item with required fields for GBP Local Posts API
      localPostPayload.media = [
        {
          mediaFormat: 'PHOTO', // Required: must specify PHOTO for images
          sourceUrl: media.sourceUrl,
        },
      ]
    }

    // Call GBP Local Posts API
    const apiUrl = `https://mybusiness.googleapis.com/v4/${parent}/localPosts`
    console.log('[GBP Publish] Publishing to:', apiUrl)
    console.log('[GBP Publish] Payload:', JSON.stringify(localPostPayload, null, 2))

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(localPostPayload),
    })

    const responseData = await response.json().catch(() => ({ error: 'Failed to parse response' }))

    if (!response.ok) {
      // Log full error details including nested error.details array
      const errorDetails = responseData.error?.details 
        ? JSON.stringify(responseData.error.details, null, 2)
        : JSON.stringify(responseData.error, null, 2)
      
      console.error('[GBP Publish] API error:', {
        status: response.status,
        statusText: response.statusText,
        error: {
          message: responseData.error?.message || responseData.error || 'Unknown error',
          code: responseData.error?.code,
          details: errorDetails,
        },
        fullResponse: JSON.stringify(responseData, null, 2),
      })

      // Handle specific error cases
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Authentication failed. Please reconnect your Google Business Profile.', needs_reauth: true },
          { status: 401 }
        )
      }

      if (response.status === 403) {
        return NextResponse.json(
          { error: 'Permission denied. Please ensure your account has permission to post.', needs_reauth: true },
          { status: 403 }
        )
      }

      const errorMessage = responseData.error?.message || responseData.error || 'Failed to publish post'
      return NextResponse.json(
        { error: errorMessage, details: responseData },
        { status: response.status }
      )
    }

    // Success - extract localPostName and searchUrl
    const localPostName = responseData.name || null
    const searchUrl = responseData.searchUrl || null

    console.log('[GBP Publish] Success:', { localPostName, searchUrl })

    return NextResponse.json({
      ok: true,
      localPostName,
      searchUrl,
    })
  } catch (error: any) {
    console.error('[GBP Publish] Error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

