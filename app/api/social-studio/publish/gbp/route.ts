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
    let isVideo = false
    let isImage = false
    let detectedContentType = ''
    let finalMediaUrl = media?.sourceUrl || ''
    let contentLengthMB = 0

    if (media && media.sourceUrl) {
      // Validate media URL is public and fetchable (dev only)
      if (process.env.NODE_ENV === 'development') {
        try {
          // Step 1: HEAD request to get content-type
          const mediaResponse = await fetch(media.sourceUrl, { 
            method: 'HEAD', 
            redirect: 'follow',
            signal: AbortSignal.timeout(10000) // 10s timeout
          })
          const finalUrl = mediaResponse.url
          finalMediaUrl = finalUrl
          let contentType = mediaResponse.headers.get('content-type') || ''
          const contentLength = mediaResponse.headers.get('content-length')
          detectedContentType = contentType
          
          if (contentLength) {
            contentLengthMB = parseFloat((parseInt(contentLength) / (1024 * 1024)).toFixed(2))
          }
          
          // Step 2: Determine media type from content-type
          isImage = contentType.startsWith('image/')
          isVideo = contentType.startsWith('video/')
          
          // Step 3: Fallback to file extension if content-type missing/incorrect
          if (!isImage && !isVideo) {
            const urlPath = new URL(finalUrl).pathname.toLowerCase()
            const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.avi', '.mkv', '.m4v']
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']
            
            if (videoExtensions.some(ext => urlPath.endsWith(ext))) {
              isVideo = true
              console.log('[GBP Publish] Detected video from file extension:', urlPath)
            } else if (imageExtensions.some(ext => urlPath.endsWith(ext))) {
              isImage = true
              console.log('[GBP Publish] Detected image from file extension:', urlPath)
            }
          }
          
          // Step 4: Last resort - tiny GET with Range header to coax content-type
          if (!isImage && !isVideo) {
            try {
              const rangeResponse = await fetch(finalUrl, {
                method: 'GET',
                headers: { 'Range': 'bytes=0-0' },
                signal: AbortSignal.timeout(5000) // 5s timeout
              })
              const rangeContentType = rangeResponse.headers.get('content-type') || ''
              if (rangeContentType) {
                detectedContentType = rangeContentType
                isImage = rangeContentType.startsWith('image/')
                isVideo = rangeContentType.startsWith('video/')
                console.log('[GBP Publish] Detected from Range request:', rangeContentType)
              }
            } catch (rangeError) {
              // Ignore range request errors, continue with what we have
              console.warn('[GBP Publish] Range request failed, using previous detection:', rangeError)
            }
          }
          
          // Validate we have a supported media type
          if (!isImage && !isVideo) {
            return NextResponse.json(
              { error: `GBP post media must be an image or video (detected content-type: ${detectedContentType || 'unknown'})` },
              { status: 400 }
            )
          }
          
          if (mediaResponse.status !== 200) {
            return NextResponse.json(
              { error: `Media URL is not accessible (status: ${mediaResponse.status}). Please ensure the media is publicly accessible.` },
              { status: 400 }
            )
          }
          
          // Enhanced logging for video attempts
          if (process.env.DEBUG_GBP_VIDEO === '1' || isVideo) {
            console.log('[GBP Publish] Media instrumentation:', {
              channel: 'google_business',
              isVideo,
              isImage,
              detectedContentType,
              finalUrl: finalUrl.substring(0, 100) + '...', // Redacted
              contentLengthMB,
              payloadMode: isVideo ? 'mediaFormat=VIDEO' : 'mediaFormat=PHOTO',
              endpoint: `POST https://mybusiness.googleapis.com/v4/${parent}/localPosts`,
            })
          }
          
          console.log('[GBP Publish] Media URL validation:', {
            originalUrl: media.sourceUrl.substring(0, 100) + '...', // Redacted
            finalUrl: finalUrl.substring(0, 100) + '...', // Redacted
            status: mediaResponse.status,
            contentType: detectedContentType,
            isImage,
            isVideo,
            contentLength: contentLength ? `${Math.round(parseInt(contentLength) / 1024)}KB` : 'unknown',
          })
        } catch (mediaError: any) {
          console.error('[GBP Publish] Media URL validation error:', mediaError)
          return NextResponse.json(
            { error: `Failed to validate media URL: ${mediaError.message}. Please ensure the media is publicly accessible.` },
            { status: 400 }
          )
        }
      } else {
        // Production: Quick detection from URL extension only
        try {
          const urlPath = new URL(media.sourceUrl).pathname.toLowerCase()
          const videoExtensions = ['.mp4', '.mov', '.webm', '.ogg', '.avi', '.mkv', '.m4v']
          isVideo = videoExtensions.some(ext => urlPath.endsWith(ext))
          isImage = !isVideo // Assume image if not video (safer default)
        } catch (urlError) {
          // If URL parsing fails, default to image (safer)
          isImage = true
          isVideo = false
        }
      }
      
      // Build media item with required mediaFormat field
      // API requires mediaFormat to be explicitly set (PHOTO or VIDEO)
      const mediaFormat = isVideo ? 'VIDEO' : 'PHOTO'
      localPostPayload.media = [
        {
          mediaFormat,
          sourceUrl: finalMediaUrl || media.sourceUrl,
        },
      ]
    }

    // Call GBP Local Posts API
    const apiUrl = `https://mybusiness.googleapis.com/v4/${parent}/localPosts`
    const payloadMode = isVideo ? `mediaFormat=VIDEO` : `mediaFormat=PHOTO`
    
    console.log('[GBP Publish] Publishing to:', apiUrl)
    console.log('[GBP Publish] Payload:', JSON.stringify(localPostPayload, null, 2))

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(localPostPayload),
      signal: AbortSignal.timeout(30000), // 30s timeout for video processing
    })

    const responseData = await response.json().catch(() => ({ error: 'Failed to parse response' }))

    // Enhanced logging for video attempts
    if (process.env.DEBUG_GBP_VIDEO === '1' || isVideo) {
      console.log('[GBP Publish] API response:', {
        status: response.status,
        statusText: response.statusText,
        payloadMode,
        isVideo,
        isImage,
        detectedContentType,
        contentLengthMB,
        endpoint: apiUrl,
        error: response.ok ? null : {
          message: responseData.error?.message || responseData.error || 'Unknown error',
          code: responseData.error?.code,
          status: response.status,
        },
      })
    }

    if (!response.ok) {
      // Log full error details including nested error.details array
      const errorDetails = responseData.error?.details 
        ? JSON.stringify(responseData.error.details, null, 2)
        : JSON.stringify(responseData.error, null, 2)
      
      console.error('[GBP Publish] API error:', {
        status: response.status,
        statusText: response.statusText,
        payloadMode,
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
      const hint = isVideo 
        ? 'Try a smaller MP4 / ensure URL is publicly accessible and returns video/* content-type'
        : undefined
      
      return NextResponse.json(
        { 
          error: errorMessage, 
          status: response.status,
          details: responseData,
          hint,
        },
        { status: response.status }
      )
    }

    // Success - extract localPostName and searchUrl
    const localPostName = responseData.name || null
    const searchUrl = responseData.searchUrl || null

    console.log('[GBP Publish] Success:', { 
      localPostName, 
      searchUrl,
      payloadMode,
      isVideo,
      isImage,
    })

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

