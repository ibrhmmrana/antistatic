/**
 * Debug endpoint for Instagram comments fetching
 * 
 * GET /api/integrations/instagram/debug/comments?media_id=...
 * 
 * Server-only, authenticated endpoint to test comment fetching
 * Returns diagnostic information about comment fetching without exposing tokens
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

const API_VERSION = 'v18.0'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {
            // No-op
          },
        },
      }
    )

    // Verify authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const mediaId = searchParams.get('media_id')
    const businessLocationId = searchParams.get('business_location_id')

    if (!mediaId) {
      return NextResponse.json(
        { error: 'media_id query parameter is required' },
        { status: 400 }
      )
    }

    // Get Instagram OAuth connection
    let locationId = businessLocationId
    if (!locationId) {
      // Get user's primary business location
      const { data: location } = await supabase
        .from('business_locations')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!location) {
        return NextResponse.json(
          { error: 'No business location found' },
          { status: 404 }
        )
      }

      locationId = location.id
    }

    // Fetch Instagram connection
    const { data: connection, error: connectionError } = await supabase
      .from('instagram_connections')
      .select('access_token, instagram_user_id')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (connectionError || !connection || !connection.access_token) {
      return NextResponse.json(
        { error: 'Instagram OAuth connection not found' },
        { status: 404 }
      )
    }

    // Fetch comments using Instagram Graph API
    const commentsUrl = `https://graph.instagram.com/${API_VERSION}/${mediaId}/comments?fields=id,from,text,timestamp&access_token=${connection.access_token}`
    
    console.log('[Instagram Debug] Fetching comments:', {
      endpoint_host: 'graph.instagram.com',
      api_version: API_VERSION,
      media_id: mediaId,
    })

    const commentsResponse = await fetch(commentsUrl)
    const responseStatus = commentsResponse.status
    const responseOk = commentsResponse.ok

    let commentsData: any = {}
    let commentCountReturned = 0
    let firstPageHasData = false
    let pagingPresent = false

    if (commentsResponse.ok) {
      commentsData = await commentsResponse.json()
      const postComments = commentsData.data || []
      commentCountReturned = postComments.length
      firstPageHasData = postComments.length > 0
      pagingPresent = !!commentsData.paging
    } else {
      commentsData = await commentsResponse.json().catch(() => ({}))
    }

    // Return diagnostic information (no tokens)
    return NextResponse.json({
      media_id: mediaId,
      comment_count_returned: commentCountReturned,
      first_page_has_data: firstPageHasData,
      paging_present: pagingPresent,
      status_code: responseStatus,
      response_ok: responseOk,
      error: commentsData.error ? {
        code: commentsData.error.code,
        message: commentsData.error.message,
        type: commentsData.error.type,
      } : null,
    })
  } catch (error: any) {
    console.error('[Instagram Debug] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

