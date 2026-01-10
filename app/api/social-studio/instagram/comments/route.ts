import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/social-studio/instagram/comments
 * 
 * Fetch live Instagram media with comments and replies (no DB storage)
 * Supports pagination via 'after' cursor for infinite scroll
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const businessLocationId = requestUrl.searchParams.get('businessLocationId')
    const after = requestUrl.searchParams.get('after') || undefined
    const limitMedia = parseInt(requestUrl.searchParams.get('limitMedia') || '12')
    const limitComments = parseInt(requestUrl.searchParams.get('limitComments') || '20')
    const limitReplies = parseInt(requestUrl.searchParams.get('limitReplies') || '20')

    if (!businessLocationId) {
      return NextResponse.json({ error: 'businessLocationId is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (!user || userError) {
      console.error('[Social Studio Comments API] Auth error:', userError)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify location belongs to user
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id, user_id')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location || locationError) {
      console.error('[Social Studio Comments API] Location error:', locationError)
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    // Load Instagram connection (token + ig_user_id)
    const { data: instagramConnection } = await (supabase
      .from('instagram_connections') as any)
      .select('id, instagram_user_id, scopes, access_token')
      .eq('business_location_id', businessLocationId)
      .maybeSingle()

    if (!instagramConnection) {
      return NextResponse.json({ 
        error: 'Instagram account not connected',
        requiresConnection: true 
      }, { status: 404 })
    }

    // Check for comments permission
    const scopes = instagramConnection.scopes || []
    const hasCommentsPermission = scopes.some((scope: string) => 
      scope.includes('instagram_business_manage_comments') || 
      scope.includes('instagram_manage_comments')
    )

    if (!hasCommentsPermission) {
      return NextResponse.json({ 
        error: 'Comments permission not granted',
        requiredPermission: 'instagram_business_manage_comments',
        requiresReconnect: true 
      }, { status: 403 })
    }

    // Fetch live data from Instagram API
    console.log('[Social Studio Comments API] Fetching live media with comments...', {
      businessLocationId,
      after,
      limitMedia,
      limitComments,
      limitReplies,
    })

    const { InstagramAPI } = await import('@/lib/instagram/api')
    const api = await InstagramAPI.create(businessLocationId)

    if ('type' in api) {
      console.error('[Social Studio Comments API] Failed to create Instagram API:', api)
      return NextResponse.json({ 
        error: api.message || 'Failed to create Instagram API client',
        type: api.type 
      }, { status: 400 })
    }

    // Call new method that fetches media with nested comments/replies
    const result = await api.listMediaWithCommentsPage({
      limitMedia,
      limitComments,
      limitReplies,
      after,
    })

    if ('type' in result) {
      console.error('[Social Studio Comments API] Failed to fetch media:', result)
      return NextResponse.json({ 
        error: result.message || 'Failed to fetch media from Instagram',
        type: result.type 
      }, { status: result.type === 'APIError' ? result.status : 500 })
    }

    // Get connected account username for "You" display
    const { data: connectionData } = await (supabase
      .from('instagram_connections') as any)
      .select('instagram_username, instagram_user_id')
      .eq('business_location_id', businessLocationId)
      .maybeSingle()

    const connectedAccountUsername = connectionData?.instagram_username || null
    const connectedAccountUserId = connectionData?.instagram_user_id || null

    // Transform to UI DTO format
    const media = result.media.map((item) => {
      // Extract comments from nested structure
      const comments = (item.comments?.data || []).map((comment) => {
        // Extract replies from nested structure
        const replies = (comment.replies?.data || []).map((reply) => {
          // Determine if reply is from connected account
          const isFromConnectedAccount = connectedAccountUsername && 
            reply.from?.username?.toLowerCase() === connectedAccountUsername.toLowerCase()
          
          return {
            id: reply.id,
            text: reply.text || '',
            timestamp: reply.timestamp,
            from: {
              id: reply.from?.id || null,
              username: isFromConnectedAccount ? connectedAccountUsername : (reply.from?.username || null),
            },
          }
        })

        // Determine if comment is from connected account
        const isFromConnectedAccount = connectedAccountUsername && 
          comment.from?.username?.toLowerCase() === connectedAccountUsername.toLowerCase()

        return {
          id: comment.id,
          text: comment.text || '',
          timestamp: comment.timestamp,
          from: {
            id: comment.from?.id || null,
            username: isFromConnectedAccount ? connectedAccountUsername : (comment.from?.username || null),
          },
          replies,
        }
      })

      return {
        mediaId: item.id,
        caption: item.caption || undefined,
        permalink: item.permalink || undefined,
        timestamp: item.timestamp,
        mediaThumbnail: item.thumbnail_url || item.media_url || undefined,
        comments,
      }
    })

    const response = {
      media,
      paging: {
        after: result.paging?.cursors?.after || null,
      },
      connectedAccountUserId: instagramConnection.instagram_user_id, // Include for accurate filtering
    }

    console.log('[Social Studio Comments API] Returning live data:', {
      mediaCount: media.length,
      totalComments: media.reduce((sum, m) => sum + m.comments.length, 0),
      hasMore: !!result.paging?.cursors?.after,
      businessLocationId,
    })

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (error: any) {
    console.error('[Social Studio Comments API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
