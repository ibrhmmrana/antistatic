import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramAccessTokenForLocation, InstagramAuthError, isTokenExpiredError } from '@/lib/instagram/tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const API_BASE = 'https://graph.instagram.com'
const API_VERSION = 'v24.0' // Using latest version as per documentation

/**
 * POST /api/social-studio/publish/instagram
 * 
 * Publish a post to Instagram using the 2-step flow:
 * 1. Create media container with POST /<IG_ID>/media
 * 2. Publish container with POST /<IG_ID>/media_publish
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
    const { businessLocationId, caption, media } = body

    if (!businessLocationId) {
      return NextResponse.json({ error: 'businessLocationId is required' }, { status: 400 })
    }

    if (!media || !media.sourceUrl) {
      return NextResponse.json({ error: 'media.sourceUrl is required' }, { status: 400 })
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

    // Get Instagram access token and account ID
    let accessToken: string
    let igAccountId: string

    try {
      const tokenData = await getInstagramAccessTokenForLocation(businessLocationId)
      accessToken = tokenData.access_token
      igAccountId = tokenData.ig_account_id
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

    // Determine media type (image or video)
    const mediaUrl = media.sourceUrl
    const isVideo = mediaUrl.match(/\.(mp4|webm|ogg|mov|avi|mkv)(\?|$)/i) || media.type === 'video'
    const mediaType = isVideo ? 'VIDEO' : 'IMAGE'

    // Step 1: Create media container
    const containerUrl = `${API_BASE}/${API_VERSION}/${igAccountId}/media`
    
    const containerPayload: any = {
      access_token: accessToken,
    }

    if (mediaType === 'VIDEO') {
      containerPayload.video_url = mediaUrl
      containerPayload.media_type = 'VIDEO'
    } else {
      containerPayload.image_url = mediaUrl
    }

    if (caption) {
      containerPayload.caption = caption
    }

    console.log('[Instagram Publish] Creating media container:', {
      igAccountId,
      mediaType,
      hasCaption: !!caption,
      mediaUrl: mediaUrl.substring(0, 100) + '...',
    })

    const containerResponse = await fetch(containerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(containerPayload),
    })

    let containerData = await containerResponse.json()
    let creationId: string | null = null

    if (!containerResponse.ok) {
      const error = containerData.error || {}
      console.error('[Instagram Publish] Container creation error:', {
        status: containerResponse.status,
        statusText: containerResponse.statusText,
        error: {
          message: error.message || error,
          code: error.code,
          type: error.type,
          error_subcode: error.error_subcode,
        },
        fullResponse: JSON.stringify(containerData, null, 2),
      })

      // Check for token expiry - try to refresh and retry once
      if (isTokenExpiredError(error)) {
        console.log('[Instagram Publish] Token expired during API call, attempting refresh and retry...')
        try {
          // Refresh token
          const refreshedTokenData = await getInstagramAccessTokenForLocation(businessLocationId)
          accessToken = refreshedTokenData.access_token
          
          // Retry container creation with refreshed token
          containerPayload.access_token = accessToken
          const retryResponse = await fetch(containerUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(containerPayload),
          })

          containerData = await retryResponse.json()
          
          if (!retryResponse.ok) {
            // Still failed after refresh - require reauth
            console.error('[Instagram Publish] Retry after refresh failed:', containerData)
            return NextResponse.json(
              { error: 'Instagram access token has expired. Please reconnect your account.', needs_reauth: true },
              { status: 401 }
            )
          }

          // Success after refresh - continue with retry data
          console.log('[Instagram Publish] Successfully retried after token refresh')
        } catch (refreshError: any) {
          console.error('[Instagram Publish] Token refresh failed:', refreshError)
          return NextResponse.json(
            { error: 'Instagram access token has expired. Please reconnect your account.', needs_reauth: true },
            { status: 401 }
          )
        }
      } else {
        // Not a token error, return the original error
        // Check if media URL is not accessible
        if (
          error.message?.includes('URL') ||
          error.message?.includes('accessible') ||
          error.message?.includes('public') ||
          error.message?.includes('cURL')
        ) {
          return NextResponse.json(
            {
              error: 'Media URL must be publicly accessible. Instagram will fetch the media from this URL.',
              details: error.message,
            },
            { status: 400 }
          )
        }

        return NextResponse.json(
          {
            error: error.message || 'Failed to create media container',
            code: error.code,
            type: error.type,
          },
          { status: containerResponse.status }
        )
      }
    }

    creationId = containerData.id

    if (!creationId) {
      console.error('[Instagram Publish] No creation ID returned:', containerData)
      return NextResponse.json({ error: 'No creation ID returned from Instagram API' }, { status: 500 })
    }

    console.log('[Instagram Publish] Media container created:', { creationId })

    // Step 2: Publish the media container
    const publishUrl = `${API_BASE}/${API_VERSION}/${igAccountId}/media_publish`
    
    const publishPayload = {
      access_token: accessToken,
      creation_id: creationId,
    }

    console.log('[Instagram Publish] Publishing media container:', { creationId })

    const publishResponse = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(publishPayload),
    })

    const publishData = await publishResponse.json()

    if (!publishResponse.ok) {
      const error = publishData.error || {}
      console.error('[Instagram Publish] Publish error:', {
        status: publishResponse.status,
        statusText: publishResponse.statusText,
        error: {
          message: error.message || error,
          code: error.code,
          type: error.type,
          error_subcode: error.error_subcode,
        },
        fullResponse: JSON.stringify(publishData, null, 2),
      })

      // Check for token expiry - try to refresh and retry once
      if (isTokenExpiredError(error)) {
        console.log('[Instagram Publish] Token expired during publish, attempting refresh and retry...')
        try {
          // Refresh token
          const refreshedTokenData = await getInstagramAccessTokenForLocation(businessLocationId)
          accessToken = refreshedTokenData.access_token
          
          // Retry publish with refreshed token
          publishPayload.access_token = accessToken
          const retryPublishResponse = await fetch(publishUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(publishPayload),
          })

          const retryPublishData = await retryPublishResponse.json()
          
          if (!retryPublishResponse.ok) {
            // Still failed after refresh - require reauth
            console.error('[Instagram Publish] Retry publish after refresh failed:', retryPublishData)
            return NextResponse.json(
              { error: 'Instagram access token has expired. Please reconnect your account.', needs_reauth: true },
              { status: 401 }
            )
          }

          // Success after refresh - use retry data
          console.log('[Instagram Publish] Successfully retried publish after token refresh')
          const mediaId = retryPublishData.id
          if (!mediaId) {
            return NextResponse.json({ error: 'No media ID returned from Instagram API' }, { status: 500 })
          }

          return NextResponse.json({
            ok: true,
            mediaId,
            creationId,
            permalink: `https://www.instagram.com/p/${mediaId}/`,
          })
        } catch (refreshError: any) {
          console.error('[Instagram Publish] Token refresh failed during publish:', refreshError)
          return NextResponse.json(
            { error: 'Instagram access token has expired. Please reconnect your account.', needs_reauth: true },
            { status: 401 }
          )
        }
      }

      // Check for rate limit
      if (error.code === 4 || error.error_subcode === 2207007) {
        return NextResponse.json(
          {
            error: 'Instagram publishing rate limit exceeded. You can publish up to 100 posts per 24 hours.',
            code: error.code,
          },
          { status: 429 }
        )
      }

      return NextResponse.json(
        {
          error: error.message || 'Failed to publish media',
          code: error.code,
          type: error.type,
        },
        { status: publishResponse.status }
      )
    }

    const mediaId = publishData.id

    if (!mediaId) {
      console.error('[Instagram Publish] No media ID returned:', publishData)
      return NextResponse.json({ error: 'No media ID returned from Instagram API' }, { status: 500 })
    }

    console.log('[Instagram Publish] Successfully published:', { mediaId, creationId })

    // Return success with metadata
    return NextResponse.json({
      ok: true,
      mediaId,
      creationId,
      permalink: `https://www.instagram.com/p/${mediaId}/`, // Instagram permalink format (may need to fetch actual permalink)
    })
  } catch (error: any) {
    console.error('[Instagram Publish] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

