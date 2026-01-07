import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramAccessTokenForLocation, InstagramAuthError } from '@/lib/instagram/tokens'
import { INSTAGRAM_REQUIRED_SCOPES } from '@/lib/instagram/config'
import {
  preflightMediaUrl,
  convertToJpegAndUpload,
  igRequest,
  checkContainerStatus,
  pollContainerStatus,
  assertIgPublishingReady,
  API_BASE,
  API_VERSION,
  StructuredError,
  CapabilityDiagnostics,
} from '@/lib/instagram/publish-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/social-studio/publish/instagram?debug=1
 * 
 * Publish a post to Instagram using the 2-step flow:
 * 1. Create media container with POST /<IG_ID>/media
 * 2. Check container status
 * 3. Publish container with POST /<IG_ID>/media_publish
 * 
 * If ?debug=1, only creates container and returns status_code (no publish)
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

    // Check for debug mode
    const requestUrl = new URL(request.url)
    const debugMode = requestUrl.searchParams.get('debug') === '1'

    const body = await request.json()
    const { businessLocationId, caption, media, mediaType, altText } = body

    if (!businessLocationId) {
      return NextResponse.json({ error: 'businessLocationId is required' }, { status: 400 })
    }

    // Support both single media and carousel (array of media)
    const isCarousel = Array.isArray(media) && media.length > 1
    if (isCarousel && media.length > 10) {
      return NextResponse.json({ error: 'Carousel posts are limited to 10 items' }, { status: 400 })
    }

    if (!media || (!isCarousel && !media.sourceUrl)) {
      return NextResponse.json({ error: 'media.sourceUrl is required (or array of media for carousel)' }, { status: 400 })
    }

    // Verify user owns the business location
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Business location not found or unauthorized' }, { status: 404 })
    }

    // Get Instagram access token, account ID, and scopes from database
    let accessToken: string
    let igAccountId: string
    let scopesFromDb: string[] | null = null

    try {
      const tokenData = await getInstagramAccessTokenForLocation(businessLocationId)
      accessToken = tokenData.access_token
      igAccountId = tokenData.ig_account_id
      
      // Fetch scopes from database connection
      const { data: connection } = await (supabase
        .from('instagram_connections') as any)
        .select('scopes')
        .eq('business_location_id', businessLocationId)
        .maybeSingle()
      
      if (connection?.scopes) {
        scopesFromDb = Array.isArray(connection.scopes) ? connection.scopes : connection.scopes.split(',')
      } else {
        // Fallback: use required scopes from config (we know what we requested)
        // This handles cases where scopes weren't stored during OAuth (e.g., old connections)
        scopesFromDb = [...INSTAGRAM_REQUIRED_SCOPES]
      }
    } catch (error: any) {
      if (error instanceof InstagramAuthError) {
        if (error.code === 'EXPIRED') {
          return NextResponse.json(
            { error: 'Instagram access token has expired. Please reconnect your account.', needs_reauth: true },
            { status: 401 }
          )
        }
        return NextResponse.json(
          { error: error.message || 'Instagram account not connected', needs_reauth: true },
          { status: 401 }
        )
      }
      throw error
    }

    // Log context
    console.log('[IG Publish] context', {
      baseUrl: API_BASE,
      apiVersion: API_VERSION,
      igAccountId,
      hasToken: !!accessToken,
      hasScopesFromDb: !!scopesFromDb,
      scopesCount: scopesFromDb?.length || 0,
      debugMode,
    })

    // A) Capability checks BEFORE calling /{IG_ID}/media
    let diagnostics: CapabilityDiagnostics
    try {
      diagnostics = await assertIgPublishingReady(accessToken, igAccountId, API_VERSION, scopesFromDb)
      // Use the actual IG account ID from /me if it differs
      if (diagnostics.igIdUsed !== igAccountId) {
        igAccountId = diagnostics.igIdUsed
        console.log('[IG Publish] Using actual IG account ID from /me:', igAccountId)
      }
    } catch (capabilityError: any) {
      const errorMessage = capabilityError.message || 'Capability check failed'
      
      // Determine status code based on error type
      let statusCode = 400
      if (errorMessage.includes('expired') || errorMessage.includes('invalid')) {
        statusCode = 401
      } else if (errorMessage.includes('permission') || errorMessage.includes('Missing permission')) {
        statusCode = 403
      }

      return NextResponse.json(
        {
          ok: false,
          step: 'capability_check',
          message: errorMessage,
          diagnostics: {
            tokenValid: false,
            igIdUsed: igAccountId,
            hasPublishPermission: false,
            hasBasicPermission: false,
            hostUsed: 'graph.instagram.com',
          },
        },
        { status: statusCode }
      )
    }

    // E) Test mode: use known test image if env var is set
    const testImageUrl = process.env.IG_PUBLISH_TEST_IMAGE_URL
    const useTestImage = !!testImageUrl && !debugMode

    // Step 0: Preflight and convert media URLs
    const mediaToProcess = isCarousel ? media : [media]
    const processedMedia: Array<{ sourceUrl: string; type?: string; altText?: string }> = []

    for (const mediaItem of mediaToProcess) {
      let originalUrl = mediaItem.sourceUrl || mediaItem.url
      
      // Use test image if enabled
      if (useTestImage && !isCarousel) {
        originalUrl = testImageUrl
        console.log('[IG Publish] Using test image URL:', testImageUrl)
      }
      
      if (typeof originalUrl !== 'string') {
        return NextResponse.json({ error: 'Invalid media URL' }, { status: 400 })
      }

      // Preflight the URL
      const preflight = await preflightMediaUrl(originalUrl)

      if (!preflight.ok) {
          return NextResponse.json(
            {
              ok: false,
              step: 'preflight',
              message: `Media URL is not accessible (status: ${preflight.status}). Please ensure the media is publicly accessible.`,
              details: { originalUrl, finalUrl: preflight.finalUrl, status: preflight.status, error: preflight.error },
              diagnostics,
            },
            { status: 400 }
          )
      }

      if (!preflight.contentType) {
        return NextResponse.json(
          {
            ok: false,
            step: 'preflight',
            message: 'Media URL does not return a content-type header.',
            details: { originalUrl, finalUrl: preflight.finalUrl },
            diagnostics,
          },
          { status: 400 }
        )
      }

      let finalUrl = originalUrl
      const isVideo = originalUrl.match(/\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i) || mediaItem.type === 'video'

      // For IMAGE posts, ensure JPEG format
      if (!isVideo && !debugMode) {
        // Check if content-type is image/jpeg
        if (preflight.contentType !== 'image/jpeg' && preflight.contentType !== 'image/jpg') {
          if (preflight.contentType.startsWith('image/')) {
            // Convert to JPEG
            try {
              const converted = await convertToJpegAndUpload(originalUrl, businessLocationId)
              finalUrl = converted.publicUrl
              console.log('[IG Publish] Converted non-JPEG image to JPEG:', {
                originalUrl,
                originalContentType: preflight.contentType,
                newUrl: finalUrl,
              })
            } catch (convertError: any) {
              return NextResponse.json(
                {
                  ok: false,
                  step: 'preflight',
                  error: `Failed to convert image to JPEG: ${convertError.message}`,
                  details: { originalUrl, contentType: preflight.contentType },
                },
                { status: 400 }
              )
            }
          } else {
            return NextResponse.json(
              {
                ok: false,
                step: 'preflight',
                error: `Instagram only supports JPEG for images. Received: ${preflight.contentType}`,
                details: { originalUrl, contentType: preflight.contentType },
              },
              { status: 400 }
            )
          }
        }
      }

      processedMedia.push({
        sourceUrl: finalUrl,
        type: mediaItem.type,
        altText: mediaItem.altText || altText,
      })
    }

    // Step 1: Create media container(s)
    let creationId: string | null = null

    if (isCarousel) {
      // Carousel: create child containers first
      const childContainerIds: string[] = []

      for (const mediaItem of processedMedia) {
        const containerPayload: any = {
          is_carousel_item: true,
        }

        const isVideo = mediaItem.sourceUrl.match(/\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i) || mediaItem.type === 'video'
        
        // Determine media type: use explicit mediaType from request, or default to REELS for videos
        // Only use mediaItem.type if it's explicitly REELS or STORIES (ignore generic "video" or "VIDEO")
        let requestedMediaType: string | undefined
        if (mediaType) {
          requestedMediaType = mediaType.toUpperCase()
        } else if (mediaItem.type && ['REELS', 'STORIES'].includes(mediaItem.type.toUpperCase())) {
          // Only use mediaItem.type if it's explicitly REELS or STORIES
          requestedMediaType = mediaItem.type.toUpperCase()
        }
        // If no explicit type and it's a video, default to REELS (ignore generic "video" type from frontend)
        if (!requestedMediaType && isVideo) {
          requestedMediaType = 'REELS'
        }

        if (isVideo || requestedMediaType === 'VIDEO' || requestedMediaType === 'REELS' || requestedMediaType === 'STORIES') {
          containerPayload.video_url = mediaItem.sourceUrl
          containerPayload.media_type = requestedMediaType || 'REELS'
          // Note: alt_text is only for images, not videos
        } else {
          containerPayload.image_url = mediaItem.sourceUrl
          if (mediaItem.altText) {
            containerPayload.alt_text = mediaItem.altText
          }
        }

        try {
          const containerData = await igRequest<{ id: string }>(
            'create_container',
            'POST',
            `${igAccountId}/media`,
            accessToken,
            containerPayload
          )

          childContainerIds.push(containerData.id)
        } catch (error: any) {
          if (error.ok === false && error.step) {
            return NextResponse.json(error, { status: 400 })
          }
          throw error
        }
      }

      // Create carousel container
      const carouselPayload: any = {
        media_type: 'CAROUSEL',
        children: childContainerIds.join(','),
      }

      if (caption) {
        carouselPayload.caption = caption
      }

      try {
        const carouselData = await igRequest<{ id: string }>(
          'create_container',
          'POST',
          `${igAccountId}/media`,
          accessToken,
          carouselPayload
        )

        creationId = carouselData.id
      } catch (error: any) {
        if (error.ok === false && error.step) {
          return NextResponse.json({
            ...error,
            diagnostics,
          }, { status: 400 })
        }
        throw error
      }
    } else {
      // Single media post
      const mediaItem = processedMedia[0]
      const containerPayload: any = {}

      const isVideo = mediaItem.sourceUrl.match(/\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i) || mediaItem.type === 'video'
      
      // Determine media type: use explicit mediaType from request, or default to REELS for videos
      // Only use mediaItem.type if it's explicitly REELS or STORIES (ignore generic "video" or "VIDEO")
      let requestedMediaType: string | undefined
      if (mediaType) {
        requestedMediaType = mediaType.toUpperCase()
      } else if (mediaItem.type && ['REELS', 'STORIES'].includes(mediaItem.type.toUpperCase())) {
        // Only use mediaItem.type if it's explicitly REELS or STORIES
        requestedMediaType = mediaItem.type.toUpperCase()
      }
      // If no explicit type and it's a video, default to REELS (ignore generic "video" type from frontend)
      if (!requestedMediaType && isVideo) {
        requestedMediaType = 'REELS'
      }

      if (isVideo || requestedMediaType === 'VIDEO' || requestedMediaType === 'REELS' || requestedMediaType === 'STORIES') {
        containerPayload.video_url = mediaItem.sourceUrl
        containerPayload.media_type = requestedMediaType || 'REELS'
        // Note: alt_text is only for images, not videos
      } else {
        containerPayload.image_url = mediaItem.sourceUrl
        if (mediaItem.altText) {
          containerPayload.alt_text = mediaItem.altText
        }
      }

      if (caption) {
        containerPayload.caption = caption
      }

      if (mediaItem.altText) {
        containerPayload.alt_text = mediaItem.altText
      }

      try {
        const containerData = await igRequest<{ id: string }>(
          'create_container',
          'POST',
          `${igAccountId}/media`,
          accessToken,
          containerPayload
        )

        creationId = containerData.id
      } catch (error: any) {
        if (error.ok === false && error.step) {
          return NextResponse.json({
            ...error,
            diagnostics,
          }, { status: 400 })
        }
        throw error
      }
    }

    if (!creationId) {
      return NextResponse.json({ error: 'No creation ID returned from Instagram API' }, { status: 500 })
    }

    // Step 2: Check container status
    let statusCode: string
    try {
      const status = await checkContainerStatus(creationId, accessToken)
      statusCode = status.status_code
    } catch (error: any) {
      if (error.ok === false && error.step) {
        return NextResponse.json({
          ...error,
          diagnostics,
        }, { status: 400 })
      }
      throw error
    }

    // Handle status codes
        if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
          return NextResponse.json(
            {
              ok: false,
              step: 'check_status',
              message: `Container status: ${statusCode}`,
              details: { containerId: creationId, status_code: statusCode },
              diagnostics,
            },
            { status: 400 }
          )
        }

    // If IN_PROGRESS, poll until FINISHED (with timeout)
    // For Reels/videos, Instagram needs more time - increase timeout to 120 seconds
    if (statusCode === 'IN_PROGRESS') {
      try {
        // Increase timeout for Reels/videos (they take longer to process)
        // Reels can take 60-120 seconds to process, so use 120 seconds timeout
        const maxWaitSeconds = 120 // Increased to 120 seconds for Reels/video processing
        const polledStatus = await pollContainerStatus(creationId, accessToken, maxWaitSeconds)
        statusCode = polledStatus.status_code

          if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
            return NextResponse.json(
              {
                ok: false,
                step: 'check_status',
                message: `Container status after polling: ${statusCode}`,
                details: { containerId: creationId, status_code: statusCode },
                diagnostics,
              },
              { status: 400 }
            )
          }
          
          // If still IN_PROGRESS after polling, provide helpful message
          if (statusCode === 'IN_PROGRESS') {
            return NextResponse.json(
              {
                ok: false,
                step: 'check_status',
                message: 'Container is still processing. Instagram is preparing your Reel - this can take up to 2 minutes. Please wait a moment and try publishing again, or check your Instagram account directly.',
                details: { containerId: creationId, status_code: statusCode, waitedSeconds: maxWaitSeconds },
                diagnostics,
              },
              { status: 202 } // 202 Accepted - processing
            )
          }
      } catch (error: any) {
        if (error.ok === false && error.step) {
          return NextResponse.json(error, { status: 400 })
        }
        throw error
      }
    }

    // Debug mode: return early with status
    if (debugMode) {
      return NextResponse.json({
        ok: true,
        debug: true,
        containerId: creationId,
        status_code: statusCode,
        preflight: processedMedia.map((m) => ({ sourceUrl: m.sourceUrl })),
      })
    }

    // Step 3: Publish the container (only if not debug mode)
    if (statusCode !== 'FINISHED' && statusCode !== 'PUBLISHED') {
      return NextResponse.json(
        {
          ok: false,
          step: 'check_status',
          message: `Container not ready for publishing. Status: ${statusCode}`,
          details: { containerId: creationId, status_code: statusCode },
          diagnostics,
        },
        { status: 400 }
      )
    }

    const publishPayload = {
      creation_id: creationId,
    }

    let publishData: { id: string }
    try {
      publishData = await igRequest<{ id: string }>(
        'publish',
        'POST',
        `${igAccountId}/media_publish`,
        accessToken,
        publishPayload
      )
    } catch (error: any) {
      if (error.ok === false && error.step) {
        return NextResponse.json({
          ...error,
          diagnostics,
        }, { status: 400 })
      }
      throw error
    }

    const mediaId = publishData.id

    if (!mediaId) {
      return NextResponse.json({ error: 'No media ID returned from Instagram API' }, { status: 500 })
    }

    console.log('[IG Publish] Successfully published:', { mediaId, creationId })

    return NextResponse.json({
      ok: true,
      mediaId,
      creationId,
      permalink: `https://www.instagram.com/p/${mediaId}/`,
    })
  } catch (error: any) {
    console.error('[IG Publish] Unexpected error:', error)

    // If it's a structured error, return it
    if (error.ok === false && error.step) {
      return NextResponse.json(error, { status: 400 })
    }

    return NextResponse.json(
      {
        ok: false,
        step: 'unknown',
        message: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}
