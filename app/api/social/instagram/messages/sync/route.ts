import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InstagramAPI } from '@/lib/instagram/api'
import { resolveMessagingUserProfile } from '@/lib/instagram/messaging-user-profile'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/social/instagram/messages/sync?locationId={id}
 * 
 * Backfill sync for Instagram Direct Messages.
 * Fetches recent conversations and messages from Instagram Messaging API
 * and upserts them into instagram_dm_events.
 * 
 * Note: Instagram Messaging API has limited endpoints for listing conversations.
 * This endpoint attempts to fetch what's available via the API.
 */
export async function POST(request: NextRequest) {
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

    const errors: string[] = []
    let conversationsFound = 0
    let messagesUpserted = 0
    const identitiesQueued: string[] = []
    const uniqueSenderIds = new Set<string>()

    // Note: Instagram Messaging API doesn't provide a direct "list conversations" endpoint
    // We can only fetch messages for conversations we already know about
    // For now, we'll focus on resolving identities for existing messages
    
    // Get recent DM events (last 30 days) that don't have cached identities
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: recentEvents, error: eventsError } = await (supabase
      .from('instagram_dm_events') as any)
      .select('sender_id, recipient_id, ig_user_id, message_id, text, timestamp, raw')
      .eq('business_location_id', locationId)
      .gte('timestamp', thirtyDaysAgo.toISOString())
      .order('timestamp', { ascending: false })
      .limit(500)

    if (eventsError) {
      console.error('[Instagram Messages Sync] Error fetching events:', eventsError)
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }

    // Collect unique sender IDs that need identity resolution
    ;(recentEvents || []).forEach((event: any) => {
      if (event.sender_id) uniqueSenderIds.add(event.sender_id)
      if (event.recipient_id) uniqueSenderIds.add(event.recipient_id)
    })

    // Check which users already have cached profiles
    const userIdsArray = Array.from(uniqueSenderIds)
    if (userIdsArray.length === 0) {
      return NextResponse.json({
        conversations_found: 0,
        messages_upserted: 0,
        identities_queued: 0,
        errors: [],
        note: 'No recent messages found to sync',
      })
    }

    const { data: cachedUsers } = await (supabase
      .from('instagram_user_cache') as any)
      .select('ig_user_id, name, profile_pic_url, last_fetched_at, fail_count, last_failed_at')
      .in('ig_user_id', userIdsArray)

    const cachedUserIds = new Set((cachedUsers || []).map((u: any) => u.ig_user_id))
    
    // Filter out users that are in cooldown (fail_count >= 3 and last_failed_at < 15 min ago)
    const now = new Date()
    const cooldownMs = 15 * 60 * 1000
    const usersInCooldown = new Set(
      (cachedUsers || [])
        .filter((u: any) => {
          if (u.fail_count < 3) return false
          if (!u.last_failed_at) return true
          const lastFailed = new Date(u.last_failed_at)
          return (now.getTime() - lastFailed.getTime()) < cooldownMs
        })
        .map((u: any) => u.ig_user_id)
    )
    
    const uncachedUserIds = userIdsArray.filter(
      id => !cachedUserIds.has(id) && !usersInCooldown.has(id)
    )

    console.log('[Instagram Messages Sync] Identity resolution:', {
      totalUserIds: userIdsArray.length,
      cached: cachedUserIds.size,
      inCooldown: usersInCooldown.size,
      toResolve: uncachedUserIds.length,
    })

    // Resolve profiles for uncached users (rate limited to 20 per sync)
    const maxProfiles = 20
    for (const userId of uncachedUserIds.slice(0, maxProfiles)) {
      try {
        identitiesQueued.push(userId)
        const result = await resolveMessagingUserProfile(
          locationId,
          connection.instagram_user_id,
          userId
        )
        
        if (result && result.name) {
          console.log('[Instagram Messages Sync] Resolved identity:', {
            userId,
            name: result.name,
            hasAvatar: !!result.profile_pic_url,
          })
        }
      } catch (error: any) {
        const errorMsg = `Failed to resolve ${userId}: ${error.message}`
        errors.push(errorMsg)
        console.error('[Instagram Messages Sync]', errorMsg)
      }
    }

    return NextResponse.json({
      conversations_found: conversationsFound,
      messages_upserted: messagesUpserted,
      identities_queued: identitiesQueued.length,
      identities_resolved: identitiesQueued.length,
      errors: errors.length > 0 ? errors : undefined,
      note: 'Instagram Messaging API does not provide a list conversations endpoint. This sync resolves identities for existing messages.',
    })
  } catch (error: any) {
    console.error('[Instagram Messages Sync] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

