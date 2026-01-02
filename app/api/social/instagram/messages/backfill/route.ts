import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InstagramAPI } from '@/lib/instagram/api'
import { resolveMessagingUserProfile } from '@/lib/instagram/messaging-user-profile'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/social/instagram/messages/backfill?days=7
 * 
 * Backfill recent Instagram conversations and messages from the Messaging API.
 * This is a recovery/backfill endpoint, not replacing webhook storage.
 * 
 * Rate limits: max 50 conversations, max 20 messages per conversation
 */
export async function POST(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const locationId = requestUrl.searchParams.get('locationId')
    const daysParam = requestUrl.searchParams.get('days')
    const days = daysParam ? parseInt(daysParam, 10) : 7

    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    }

    if (isNaN(days) || days < 1 || days > 90) {
      return NextResponse.json({ error: 'days must be between 1 and 90' }, { status: 400 })
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

    // Get Instagram connection
    const { data: connection } = await (supabase
      .from('instagram_connections') as any)
      .select('access_token, instagram_user_id')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection || !connection.access_token) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    // Create API client
    const api = await InstagramAPI.create(locationId)

    if ('type' in api) {
      return NextResponse.json({ error: api.message }, { status: 400 })
    }

    // Note: Instagram Messaging API doesn't have a direct "list conversations" endpoint
    // We can only backfill messages we've already received via webhooks
    // This endpoint will attempt to fetch recent messages from the API if available
    // For now, we'll focus on resolving user profiles for existing messages

    const sinceDate = new Date()
    sinceDate.setDate(sinceDate.getDate() - days)

    // Get recent DM events that don't have cached user profiles
    const { data: recentEvents, error: eventsError } = await (supabase
      .from('instagram_dm_events') as any)
      .select('sender_id, recipient_id, ig_user_id')
      .eq('business_location_id', locationId)
      .gte('timestamp', sinceDate.toISOString())
      .limit(100)

    if (eventsError) {
      console.error('[Instagram Backfill] Error fetching events:', eventsError)
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }

    // Collect unique user IDs that need profile resolution
    const userIdsToResolve = new Set<string>()
    ;(recentEvents || []).forEach((event: any) => {
      if (event.sender_id) userIdsToResolve.add(event.sender_id)
      if (event.recipient_id) userIdsToResolve.add(event.recipient_id)
    })

    // Check which users already have cached profiles
    const userIdsArray = Array.from(userIdsToResolve)
    if (userIdsArray.length === 0) {
      return NextResponse.json({
        conversationsScanned: 0,
        messagesUpserted: 0,
        profilesFetched: 0,
        errors: [],
      })
    }

    const { data: cachedUsers } = await (supabase
      .from('instagram_user_cache') as any)
      .select('ig_user_id, username, name, last_fetched_at, fail_count')
      .in('ig_user_id', userIdsArray)

    const cachedUserIds = new Set((cachedUsers || []).map((u: any) => u.ig_user_id))
    const uncachedUserIds = userIdsArray.filter(id => !cachedUserIds.has(id))

    // Resolve profiles for uncached users (with rate limiting)
    const profilesFetched: string[] = []
    const errors: string[] = []
    const maxProfiles = 50 // Rate limit

    for (const userId of uncachedUserIds.slice(0, maxProfiles)) {
      try {
        const result = await resolveMessagingUserProfile(
          locationId,
          connection.instagram_user_id,
          userId
        )
        
        if (result && (result.username || result.name)) {
          profilesFetched.push(userId)
        }
      } catch (error: any) {
        errors.push(`Failed to resolve ${userId}: ${error.message}`)
      }
    }

    return NextResponse.json({
      conversationsScanned: 0, // Instagram API doesn't provide conversation list
      messagesUpserted: 0, // We don't upsert messages here, only resolve profiles
      profilesFetched: profilesFetched.length,
      profilesResolved: profilesFetched,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[Instagram Backfill] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

