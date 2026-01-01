import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Force dynamic rendering to prevent static generation issues
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/social/instagram/comments/reply
 * 
 * Reply to an Instagram comment
 * This is a separate route file to ensure proper error handling
 */
export async function POST(request: NextRequest) {
  // Ensure we always return JSON
  const jsonResponse = (data: any, status: number = 200) => {
    return NextResponse.json(data, {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  try {
    // Safely parse request body
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      console.error('[Instagram Reply] JSON parse error:', jsonError)
      return jsonResponse({ 
        error: 'Invalid JSON in request body',
        details: jsonError.message,
        type: 'json_parse_error',
      }, 400)
    }

    const { locationId, commentId, mediaId, text } = body

    if (!locationId || !commentId || !text) {
      return jsonResponse({ 
        error: 'Missing required fields',
        type: 'validation_error',
      }, 400)
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return jsonResponse({ 
        error: 'Unauthorized',
        type: 'auth_error',
      }, 401)
    }

    // Verify location belongs to user
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (locationError || !location) {
      return jsonResponse({ 
        error: 'Location not found',
        type: 'location_error',
      }, 404)
    }

    // Get comment to verify it exists and belongs to this location
    const { data: comment, error: commentError } = await supabase
      .from('instagram_comments')
      .select('id, media_id')
      .eq('id', commentId)
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (commentError || !comment) {
      return jsonResponse({ 
        error: 'Comment not found',
        type: 'comment_error',
      }, 404)
    }

    // Create API client and reply
    let api: any
    try {
      const { InstagramAPI } = await import('@/lib/instagram/api')
      api = await InstagramAPI.create(locationId)
    } catch (importError: any) {
      console.error('[Instagram Reply] Import error:', importError)
      return jsonResponse({ 
        error: 'Failed to load Instagram API client',
        details: process.env.NODE_ENV === 'development' ? importError.message : undefined,
        type: 'import_error',
      }, 500)
    }

    if (!api || ('type' in api)) {
      return jsonResponse({ 
        error: api?.message || 'Failed to create Instagram API client',
        type: api?.type || 'api_error',
      }, 400)
    }

    // Call Instagram API and handle response safely
    let replyResult: any
    try {
      replyResult = await api.replyToComment(commentId, text)
    } catch (apiError: any) {
      console.error('[Instagram Reply] API call error:', apiError)
      return jsonResponse({
        error: apiError.message || 'Failed to call Instagram API',
        details: process.env.NODE_ENV === 'development' ? apiError.stack : undefined,
        type: 'api_call_error',
      }, 500)
    }

    if ('type' in replyResult) {
      const errorResponse: any = {
        error: replyResult.message,
        code: replyResult.code,
        type: replyResult.type,
      }
      
      // Include required permission if available
      if ('requiredPermission' in replyResult) {
        errorResponse.requiredPermission = replyResult.requiredPermission
      }
      
      // Include raw error details in development
      if (process.env.NODE_ENV === 'development' && 'details' in replyResult) {
        errorResponse.details = replyResult.details
      }
      
      return jsonResponse(
        errorResponse,
        replyResult.type === 'APIError' ? replyResult.status : 500
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

    return jsonResponse({
      success: true,
      replyId: replyResult.id,
      comment: updatedComment,
    })
  } catch (error: any) {
    console.error('[Instagram Comments Reply API] Unexpected error:', error)
    
    // Ensure we always return JSON, never let Next.js render HTML error page
    return jsonResponse(
      { 
        error: error.message || 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        type: 'unexpected_error',
      },
      500
    )
  }
}

