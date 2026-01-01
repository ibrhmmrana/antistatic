import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InstagramAPI } from '@/lib/instagram/api'

/**
 * POST /api/social/instagram/publish
 * 
 * Publish a new Instagram post (image or video)
 * Uses 2-step flow: create media container, then publish
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { locationId, type, mediaUrl, caption } = body

    if (!locationId || !type || !mediaUrl) {
      return NextResponse.json({ error: 'Missing required fields: locationId, type, mediaUrl' }, { status: 400 })
    }

    if (!['IMAGE', 'VIDEO'].includes(type)) {
      return NextResponse.json({ error: 'Type must be IMAGE or VIDEO' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify location belongs to user
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Create API client
    const api = await InstagramAPI.create(locationId)

    if ('type' in api) {
      return NextResponse.json({ error: api.message }, { status: 400 })
    }

    // Get connection details for API calls
    const { data: connection } = await supabase
      .from('instagram_connections')
      .select('access_token, instagram_user_id')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection || !connection.access_token) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    const accessToken = connection.access_token
    const userId = connection.instagram_user_id
    const API_BASE = 'https://graph.instagram.com'
    const API_VERSION = 'v18.0'

    // Step 1: Create media container
    const containerUrl = new URL(`${API_BASE}/${API_VERSION}/${userId}/media`)
    containerUrl.searchParams.set('access_token', accessToken)
    
    if (type === 'IMAGE') {
      containerUrl.searchParams.set('image_url', mediaUrl)
    } else {
      containerUrl.searchParams.set('video_url', mediaUrl)
      containerUrl.searchParams.set('media_type', 'VIDEO')
    }
    
    if (caption) {
      containerUrl.searchParams.set('caption', caption)
    }

    const containerResponse = await fetch(containerUrl.toString(), {
      method: 'POST',
    })

    const containerData = await containerResponse.json()

    if (!containerResponse.ok) {
      const error = containerData.error || {}
      console.error('[Instagram Publish] Container creation error:', {
        status: containerResponse.status,
        code: error.code,
        message: error.message,
      })

      // Check if media URL is not accessible
      if (error.message?.includes('URL') || error.message?.includes('accessible') || error.message?.includes('public')) {
        return NextResponse.json({
          error: 'Media URL must be publicly accessible. Please upload to Supabase Storage first.',
          details: error.message,
        }, { status: 400 })
      }

      return NextResponse.json({
        error: error.message || 'Failed to create media container',
        code: error.code,
      }, { status: containerResponse.status })
    }

    const creationId = containerData.id

    if (!creationId) {
      return NextResponse.json({ error: 'No creation ID returned' }, { status: 500 })
    }

    // Step 2: Publish the media
    const publishUrl = new URL(`${API_BASE}/${API_VERSION}/${userId}/media_publish`)
    publishUrl.searchParams.set('access_token', accessToken)
    publishUrl.searchParams.set('creation_id', creationId)

    const publishResponse = await fetch(publishUrl.toString(), {
      method: 'POST',
    })

    const publishData = await publishResponse.json()

    if (!publishResponse.ok) {
      const error = publishData.error || {}
      console.error('[Instagram Publish] Publish error:', {
        status: publishResponse.status,
        code: error.code,
        message: error.message,
      })

      return NextResponse.json({
        error: error.message || 'Failed to publish media',
        code: error.code,
      }, { status: publishResponse.status })
    }

    const mediaId = publishData.id

    // Trigger a sync to fetch the new post (or insert directly into cache)
    // For now, return success and let user manually sync
    return NextResponse.json({
      success: true,
      mediaId,
      creationId,
      message: 'Post published successfully! Run a sync to see it in your content.',
    })
  } catch (error: any) {
    console.error('[Instagram Publish] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

