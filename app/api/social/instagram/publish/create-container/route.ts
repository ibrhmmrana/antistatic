import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/social/instagram/publish/create-container
 * 
 * Step 1: Create a media container for publishing
 * Returns creation_id for use in publish-container endpoint
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

    // Get connection details
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

    // Create media container
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

    // Safe JSON parsing
    const rawText = await containerResponse.text()
    let containerData: any = {}
    
    const contentType = containerResponse.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      try {
        containerData = JSON.parse(rawText)
      } catch (parseError) {
        console.error('[Instagram Publish] Container JSON parse error:', {
          status: containerResponse.status,
          contentType,
          rawText: rawText.slice(0, 500),
        })
        return NextResponse.json({
          error: `Invalid JSON response from Instagram API: ${rawText.slice(0, 200)}`,
          details: process.env.NODE_ENV === 'development' ? rawText.slice(0, 500) : undefined,
        }, { status: 500 })
      }
    } else {
      // Not JSON - likely HTML error page
      console.error('[Instagram Publish] Container non-JSON response:', {
        status: containerResponse.status,
        contentType,
        rawText: rawText.slice(0, 500),
      })
      return NextResponse.json({
        error: `Unexpected response format (${contentType}): ${rawText.slice(0, 200)}`,
        details: process.env.NODE_ENV === 'development' ? rawText.slice(0, 500) : undefined,
      }, { status: containerResponse.status || 500 })
    }

    if (!containerResponse.ok) {
      const error = containerData.error || {}
      console.error('[Instagram Publish] Container creation error:', {
        status: containerResponse.status,
        code: error.code,
        message: error.message,
        rawResponse: process.env.NODE_ENV === 'development' ? rawText.slice(0, 500) : undefined,
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
        details: process.env.NODE_ENV === 'development' ? rawText.slice(0, 500) : undefined,
      }, { status: containerResponse.status })
    }

    const creationId = containerData.id

    if (!creationId) {
      return NextResponse.json({ 
        error: 'No creation ID returned',
        details: process.env.NODE_ENV === 'development' ? rawText : undefined,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      creationId,
    })
  } catch (error: any) {
    console.error('[Instagram Publish] Create container error:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

