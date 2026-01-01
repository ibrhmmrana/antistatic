import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/social/instagram/publish/publish-container
 * 
 * Step 2: Publish a media container using creation_id from create-container
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { locationId, creationId } = body

    if (!locationId || !creationId) {
      return NextResponse.json({ error: 'Missing required fields: locationId, creationId' }, { status: 400 })
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

    // Publish the media container
    const publishUrl = new URL(`${API_BASE}/${API_VERSION}/${userId}/media_publish`)
    publishUrl.searchParams.set('access_token', accessToken)
    publishUrl.searchParams.set('creation_id', creationId)

    const publishResponse = await fetch(publishUrl.toString(), {
      method: 'POST',
    })

    // Safe JSON parsing
    const rawText = await publishResponse.text()
    let publishData: any = {}
    
    const contentType = publishResponse.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      try {
        publishData = JSON.parse(rawText)
      } catch (parseError) {
        console.error('[Instagram Publish] Publish JSON parse error:', {
          status: publishResponse.status,
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
      console.error('[Instagram Publish] Publish non-JSON response:', {
        status: publishResponse.status,
        contentType,
        rawText: rawText.slice(0, 500),
      })
      return NextResponse.json({
        error: `Unexpected response format (${contentType}): ${rawText.slice(0, 200)}`,
        details: process.env.NODE_ENV === 'development' ? rawText.slice(0, 500) : undefined,
      }, { status: publishResponse.status || 500 })
    }

    if (!publishResponse.ok) {
      const error = publishData.error || {}
      console.error('[Instagram Publish] Publish error:', {
        status: publishResponse.status,
        code: error.code,
        message: error.message,
        rawResponse: process.env.NODE_ENV === 'development' ? rawText.slice(0, 500) : undefined,
      })

      return NextResponse.json({
        error: error.message || 'Failed to publish media',
        code: error.code,
        details: process.env.NODE_ENV === 'development' ? rawText.slice(0, 500) : undefined,
      }, { status: publishResponse.status })
    }

    const mediaId = publishData.id

    if (!mediaId) {
      return NextResponse.json({ 
        error: 'No media ID returned',
        details: process.env.NODE_ENV === 'development' ? rawText : undefined,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      mediaId,
      creationId,
      message: 'Post published successfully!',
    })
  } catch (error: any) {
    console.error('[Instagram Publish] Publish container error:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

