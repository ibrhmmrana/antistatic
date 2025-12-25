import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGBPAccessTokenForLocation, gbpApiRequest } from '@/lib/gbp/client'
import { Database } from '@/lib/supabase/database.types'

type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<BusinessLocation, 'id' | 'user_id' | 'google_location_name'>

/**
 * POST /api/reputation/reviews/reply
 * 
 * Post a reply to a Google Business Profile review
 * 
 * Request body:
 * {
 *   reviewName: string, // Full review name: "accounts/.../locations/.../reviews/..."
 *   comment: string,   // Reply text
 *   businessLocationId: string // Antistatic business location ID
 * }
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
    const { reviewName, comment, businessLocationId } = body

    // Validate input
    if (!reviewName || typeof reviewName !== 'string') {
      return NextResponse.json({ error: 'reviewName is required' }, { status: 400 })
    }

    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      return NextResponse.json({ error: 'comment is required and cannot be empty' }, { status: 400 })
    }

    if (!businessLocationId || typeof businessLocationId !== 'string') {
      return NextResponse.json({ error: 'businessLocationId is required' }, { status: 400 })
    }

    // Validate review name format
    if (!reviewName.match(/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/)) {
      return NextResponse.json(
        { error: 'Invalid reviewName format. Expected: accounts/.../locations/.../reviews/...' },
        { status: 400 }
      )
    }

    // Verify the business location belongs to the user
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id, user_id, google_location_name')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (locationError || !location) {
      return NextResponse.json({ error: 'Business location not found or access denied' }, { status: 404 })
    }

    const typedLocation = location as BusinessLocationSelect

    // Get access token and account name
    console.log('[Reply API] Getting access token for location:', businessLocationId)
    let accessToken: string
    let accountName: string

    try {
      const tokenData = await getGBPAccessTokenForLocation(
        user.id,
        businessLocationId,
        request.headers.get('origin') || undefined
      )
      accessToken = tokenData.accessToken
      accountName = tokenData.accountName
    } catch (tokenError: any) {
      console.error('[Reply API] Failed to get access token:', tokenError)
      
      // Check if it's a token/scope issue
      if (tokenError.message?.includes('refresh') || tokenError.message?.includes('reconnect')) {
        return NextResponse.json(
          {
            error: 'Google Business Profile connection expired. Please reconnect your account.',
            code: 'TOKEN_EXPIRED',
          },
          { status: 401 }
        )
      }

      return NextResponse.json(
        {
          error: tokenError.message || 'Failed to authenticate with Google Business Profile',
          code: 'AUTH_FAILED',
        },
        { status: 401 }
      )
    }

    // Call Google Business Profile API to post reply
    console.log('[Reply API] Posting reply to Google:', { reviewName, commentLength: comment.length })
    
    try {
      // Use the full review name path (it already includes the base path)
      const replyResponse = await gbpApiRequest<{ reply: { comment: string; updateTime: string } }>(
        `/${reviewName}/reply`,
        user.id,
        businessLocationId,
        {
          method: 'PUT',
          body: JSON.stringify({ comment: comment.trim() }),
        },
        request.headers.get('origin') || undefined
      )

      console.log('[Reply API] Reply posted successfully:', replyResponse)

      // Update the review in our database to mark it as replied
      // Extract review_id from reviewName (last segment)
      const reviewId = reviewName.split('/').pop()
      if (reviewId) {
        await supabase
          .from('business_reviews')
          .update({
            raw_payload: {
              reply: {
                comment: replyResponse.reply.comment,
                updateTime: replyResponse.reply.updateTime,
              },
            },
            updated_at: new Date().toISOString(),
          } as any)
          .eq('location_id', businessLocationId)
          .eq('source', 'gbp')
          .eq('review_id', reviewId)
      }

      return NextResponse.json({
        success: true,
        reply: replyResponse.reply,
      })
    } catch (apiError: any) {
      console.error('[Reply API] Google API error:', apiError)
      
      const errorMessage = apiError.message || 'Failed to post reply to Google Business Profile'
      const statusCode = apiError.status || 500
      
      // Handle specific status codes
      if (statusCode === 403) {
        return NextResponse.json(
          {
            error: 'Permission denied. Please ensure your Google Business Profile location is verified and you have permission to reply to reviews.',
            code: 'PERMISSION_DENIED',
          },
          { status: 403 }
        )
      }

      if (statusCode === 404) {
        return NextResponse.json(
          {
            error: 'Review not found. The review may have been deleted.',
            code: 'REVIEW_NOT_FOUND',
          },
          { status: 404 }
        )
      }

      if (statusCode === 400) {
        return NextResponse.json(
          {
            error: 'Invalid request. Please check your reply text.',
            code: 'INVALID_REQUEST',
          },
          { status: 400 }
        )
      }

      return NextResponse.json(
        {
          error: errorMessage.replace('GBP API error: ', ''), // Remove prefix
          code: 'API_ERROR',
        },
        { status: statusCode }
      )
    }
  } catch (error: any) {
    console.error('[Reply API] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

