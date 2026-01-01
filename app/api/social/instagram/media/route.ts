import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/social/instagram/media
 * 
 * Fetch Instagram posts/media from cached DB with filtering
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const locationId = requestUrl.searchParams.get('locationId')
    const limit = parseInt(requestUrl.searchParams.get('limit') || '12')
    const timeFilter = requestUrl.searchParams.get('timeFilter') || '30'
    const mediaFilter = requestUrl.searchParams.get('mediaFilter') || 'all'

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

    // Calculate time filter date
    const now = new Date()
    let sinceDate: Date | null = null

    if (timeFilter !== 'all') {
      const days = parseInt(timeFilter)
      sinceDate = new Date()
      sinceDate.setDate(sinceDate.getDate() - days)
    }

    // Build query
    let query = supabase
      .from('instagram_media')
      .select('id, caption, like_count, comments_count, timestamp, media_url, permalink, media_type')
      .eq('business_location_id', locationId)
      .order('timestamp', { ascending: false })
      .limit(limit)

    // Apply time filter
    if (sinceDate) {
      query = query.gte('timestamp', sinceDate.toISOString())
    }

    // Apply media type filter
    if (mediaFilter !== 'all') {
      query = query.eq('media_type', mediaFilter)
    }

    const { data: media, error } = await query

    if (error) {
      console.error('[Instagram Media API] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch media' }, { status: 500 })
    }

    // Get total count for pagination info
    let countQuery = supabase
      .from('instagram_media')
      .select('*', { count: 'exact', head: true })
      .eq('business_location_id', locationId)

    if (sinceDate) {
      countQuery = countQuery.gte('timestamp', sinceDate.toISOString())
    }
    if (mediaFilter !== 'all') {
      countQuery = countQuery.eq('media_type', mediaFilter)
    }

    const { count } = await countQuery

    const posts = (media || []).map((m) => ({
      id: m.id,
      caption: m.caption || '',
      likesCount: m.like_count || 0,
      commentsCount: m.comments_count || 0,
      timestamp: m.timestamp,
      mediaUrl: m.media_url || undefined,
      permalink: m.permalink || '',
      mediaType: m.media_type || 'IMAGE',
    }))

    return NextResponse.json({
      posts,
      total: count || 0,
    })
  } catch (error: any) {
    console.error('[Instagram Media API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

