import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/social/instagram/profile
 * 
 * Fetch Instagram profile and overview data from cached DB
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const locationId = requestUrl.searchParams.get('locationId')

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

    // Get sync state (contains username, last sync, scopes)
    const { data: syncState, error: syncStateError } = await supabase
      .from('instagram_sync_state')
      .select('ig_user_id, username, granted_scopes, granted_scopes_list, missing_scopes_list, last_synced_at, last_error')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (syncStateError) {
      console.error('[Instagram Profile] Error fetching sync state:', syncStateError)
    }

    // Get Instagram connection for fallback
    const { data: connection } = await supabase
      .from('instagram_connections')
      .select('instagram_user_id, instagram_username, scopes')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection && !syncState) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    // Calculate stats from cached tables (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // Count media
    const { count: totalPosts } = await supabase
      .from('instagram_media')
      .select('*', { count: 'exact', head: true })
      .eq('business_location_id', locationId)
      .gte('timestamp', thirtyDaysAgo.toISOString())

    // Count comments
    const { count: totalComments } = await supabase
      .from('instagram_comments')
      .select('*', { count: 'exact', head: true })
      .eq('business_location_id', locationId)
      .gte('timestamp', thirtyDaysAgo.toISOString())

    // Count pending comments (unreplied)
    const { count: pendingComments } = await supabase
      .from('instagram_comments')
      .select('*', { count: 'exact', head: true })
      .eq('business_location_id', locationId)
      .eq('replied', false)
      .gte('timestamp', thirtyDaysAgo.toISOString())

    // Get recent posts (last 12)
    const { data: recentMedia } = await supabase
      .from('instagram_media')
      .select('id, caption, like_count, comments_count, timestamp, media_url, permalink')
      .eq('business_location_id', locationId)
      .order('timestamp', { ascending: false })
      .limit(12)

    const recentPosts = (recentMedia || []).map((m) => ({
      id: m.id,
      caption: m.caption || '',
      likesCount: m.like_count || 0,
      commentsCount: m.comments_count || 0,
      timestamp: m.timestamp,
      mediaUrl: m.media_url || undefined,
      permalink: m.permalink || '',
    }))

    return NextResponse.json({
      profile: {
        username: syncState?.username || connection?.instagram_username || null,
        userId: syncState?.ig_user_id || connection?.instagram_user_id || null,
      },
      stats: {
        totalPosts: totalPosts || 0,
        totalComments: totalComments || 0,
        unreadMessages: 0, // Messages not implemented yet
        pendingComments: pendingComments || 0,
      },
      recentPosts,
      lastSync: syncState?.last_synced_at || null,
      grantedScopes: syncState?.granted_scopes || connection?.scopes || [],
      granted_scopes_list: syncState?.granted_scopes_list || [],
      missing_scopes_list: syncState?.missing_scopes_list || [],
      lastError: syncState?.last_error || null,
    })
  } catch (error: any) {
    console.error('[Instagram Profile API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/social/instagram/profile
 * 
 * Trigger a sync (redirects to sync endpoint)
 */
export async function POST(request: NextRequest) {
  // Redirect to sync endpoint
  const requestUrl = new URL(request.url)
  const locationId = requestUrl.searchParams.get('locationId')
  
  if (!locationId) {
    return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
  }

  // Call sync endpoint internally
  const syncUrl = new URL('/api/social/instagram/sync', requestUrl.origin)
  syncUrl.searchParams.set('locationId', locationId)
  
  const syncResponse = await fetch(syncUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ locationId }),
  })

  const syncData = await syncResponse.json()
  return NextResponse.json(syncData)
}

