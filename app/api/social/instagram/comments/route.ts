import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/social/instagram/comments
 * 
 * Fetch recent comments from cached DB
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const locationId = requestUrl.searchParams.get('locationId')
    const limit = parseInt(requestUrl.searchParams.get('limit') || '50')
    const needsAttention = requestUrl.searchParams.get('needsAttention') === 'true'

    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
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

    // Build query
    let query = supabase
      .from('instagram_comments')
      .select(`
        id,
        text,
        timestamp,
        username,
        media_id,
        replied,
        instagram_media!inner(
          permalink,
          media_url
        )
      `)
      .eq('business_location_id', locationId)
      .order('timestamp', { ascending: false })
      .limit(limit)

    // Filter by needs attention (unreplied)
    if (needsAttention) {
      query = query.eq('replied', false)
    }

    const { data: comments, error } = await query

    if (error) {
      console.error('[Instagram Comments API] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })
    }

    // Map to response format
    const commentsWithMedia = (comments || []).map((c: any) => ({
      id: c.id,
      text: c.text || '',
      timestamp: c.timestamp,
      from: {
        username: c.username || 'unknown',
        id: '',
      },
      mediaId: c.media_id,
      mediaPermalink: c.instagram_media?.permalink || '',
      mediaThumbnail: c.instagram_media?.media_url || undefined,
      replied: c.replied || false,
    }))

    return NextResponse.json({
      comments: commentsWithMedia,
      total: commentsWithMedia.length,
    })
  } catch (error: any) {
    console.error('[Instagram Comments API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/social/instagram/comments/reply
 * 
 * Reply to an Instagram comment
 * NOTE: This route is deprecated - use /api/social/instagram/comments/reply instead
 */
export async function POST(request: NextRequest) {
  try {
    // Safely parse request body
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      console.error('[Instagram Reply] JSON parse error:', jsonError)
      return NextResponse.json({ 
        error: 'Invalid JSON in request body',
        details: jsonError.message 
      }, { status: 400 })
    }

    const { locationId, commentId, mediaId, text } = body

    if (!locationId || !commentId || !text) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    // Get comment to verify it exists and belongs to this location
    const { data: comment } = await supabase
      .from('instagram_comments')
      .select('id, media_id')
      .eq('id', commentId)
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    // Create API client and reply
    let api: any
    try {
      const { InstagramAPI } = await import('@/lib/instagram/api')
      api = await InstagramAPI.create(locationId)
    } catch (importError: any) {
      console.error('[Instagram Reply] Import error:', importError)
      return NextResponse.json({ 
        error: 'Failed to load Instagram API client',
        details: process.env.NODE_ENV === 'development' ? importError.message : undefined,
      }, { status: 500 })
    }

    if (!api || ('type' in api)) {
      return NextResponse.json({ 
        error: api?.message || 'Failed to create Instagram API client',
        type: api?.type || 'unknown',
      }, { status: 400 })
    }

    // Call Instagram API and handle response safely
    let replyResult: any
    try {
      replyResult = await api.replyToComment(commentId, text)
    } catch (apiError: any) {
      // If API call throws, capture the error
      console.error('[Instagram Reply] API call error:', apiError)
      return NextResponse.json({
        error: apiError.message || 'Failed to call Instagram API',
        details: process.env.NODE_ENV === 'development' ? apiError.stack : undefined,
      }, { status: 500 })
    }

    if ('type' in replyResult) {
      const errorResponse: any = {
        error: replyResult.message,
        code: replyResult.code,
      }
      
      // Include required permission if available
      if ('requiredPermission' in replyResult) {
        errorResponse.requiredPermission = replyResult.requiredPermission
      }
      
      // Include raw error details in development
      if (process.env.NODE_ENV === 'development' && 'details' in replyResult) {
        errorResponse.details = replyResult.details
      }
      
      return NextResponse.json(
        errorResponse,
        { status: replyResult.type === 'APIError' ? replyResult.status : 500 }
      )
    }

    // Update comment in DB to mark as replied
    const { data: updatedComment, error: updateError } = await supabase
      .from('instagram_comments')
      .update({
        replied: true,
        replied_at: new Date().toISOString(),
        reply_text: text,
        reply_status: 'sent',
      })
      .eq('id', commentId)
      .select()
      .single()

    if (updateError) {
      console.error('[Instagram Reply] Error updating comment:', updateError)
      // Still return success since the reply was sent
    }

    return NextResponse.json({
      success: true,
      replyId: replyResult.id,
      comment: updatedComment,
    })
  } catch (error: any) {
    console.error('[Instagram Comments Reply API] Unexpected error:', error)
    
    // Ensure we always return JSON, never let Next.js render HTML error page
    return NextResponse.json(
      { 
        error: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        type: 'unexpected_error',
      },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }
}

