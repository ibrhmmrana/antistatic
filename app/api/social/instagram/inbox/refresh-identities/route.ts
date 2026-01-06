import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramAccessTokenForLocation, InstagramAuthError } from '@/lib/instagram/tokens'
import { resolveMessagingUserProfile } from '@/lib/instagram/messaging-user-profile'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/social/instagram/inbox/refresh-identities?locationId={id}
 * 
 * Refresh participant identities by refetching all distinct participant IDs
 * from instagram_conversations.participant_igsid + recent instagram_messages.from_id/to_id
 * (excluding self) and upserting into instagram_user_cache with correct ig_account_id
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
      .select('instagram_user_id, instagram_username')
      .eq('business_location_id', locationId)
      .maybeSingle()

    if (!connection) {
      return NextResponse.json({ error: 'Instagram not connected' }, { status: 404 })
    }

    const igAccountId = connection.instagram_user_id

    // Get the business account's IGSID (to exclude from participant list)
    let businessAccountIgsid: string | null = null
    if (connection.instagram_username) {
      const { data: businessAccountCache } = await (supabase
        .from('instagram_user_cache') as any)
        .select('ig_user_id')
        .eq('ig_account_id', igAccountId)
        .eq('username', connection.instagram_username)
        .maybeSingle()

      if (businessAccountCache) {
        businessAccountIgsid = businessAccountCache.ig_user_id
      }
    }

    // Collect all distinct participant IDs from conversations
    const { data: conversations } = await (supabase
      .from('instagram_conversations') as any)
      .select('participant_igsid')
      .eq('ig_account_id', igAccountId)
      .not('participant_igsid', 'is', null)

    // Collect all distinct participant IDs from recent messages (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const { data: recentMessages } = await (supabase
      .from('instagram_messages') as any)
      .select('from_id, to_id')
      .eq('ig_account_id', igAccountId)
      .gte('created_time', thirtyDaysAgo.toISOString())

    // Combine all participant IDs (excluding self)
    const participantIds = new Set<string>()
    
    // Add from conversations
    if (conversations) {
      for (const conv of conversations) {
        if (conv.participant_igsid && 
            conv.participant_igsid !== businessAccountIgsid && 
            conv.participant_igsid !== igAccountId &&
            !conv.participant_igsid.startsWith('UNKNOWN_')) {
          participantIds.add(conv.participant_igsid)
        }
      }
    }

    // Add from messages (from_id and to_id, excluding self)
    if (recentMessages) {
      for (const msg of recentMessages) {
        if (msg.from_id && 
            msg.from_id !== businessAccountIgsid && 
            msg.from_id !== igAccountId) {
          participantIds.add(msg.from_id)
        }
        if (msg.to_id && 
            msg.to_id !== businessAccountIgsid && 
            msg.to_id !== igAccountId) {
          participantIds.add(msg.to_id)
        }
      }
    }

    const participantIdsArray = Array.from(participantIds)
    
    console.log('[Refresh Identities] Found participant IDs to refresh:', {
      locationId,
      igAccountId,
      businessAccountIgsid,
      participantCount: participantIdsArray.length,
      participantIds: participantIdsArray.slice(0, 10), // Log first 10
    })

    if (participantIdsArray.length === 0) {
      return NextResponse.json({
        success: true,
        refreshed: 0,
        message: 'No participant IDs found to refresh',
      })
    }

    // Get access token for API calls
    let accessToken: string
    try {
      const tokenResult = await getInstagramAccessTokenForLocation(locationId)
      accessToken = tokenResult.access_token
    } catch (error: any) {
      if (error instanceof InstagramAuthError) {
        return NextResponse.json(
          {
            error: {
              type: 'instagram_auth',
              code: error.code,
              message: error.message,
            },
          },
          { status: 401 }
        )
      }
      throw error
    }

    // Refetch identities for each participant
    let refreshed = 0
    let failed = 0
    const errors: string[] = []

    for (const participantId of participantIdsArray) {
      try {
        // Guard: Never refresh selfId
        if (participantId === businessAccountIgsid || participantId === igAccountId) {
          console.warn('[Refresh Identities] Skipping selfId:', participantId)
          continue
        }

        await resolveMessagingUserProfile(
          locationId,
          igAccountId,
          participantId
        )
        refreshed++
      } catch (error: any) {
        failed++
        const errorMsg = `Failed to refresh identity for ${participantId}: ${error.message}`
        errors.push(errorMsg)
        console.error('[Refresh Identities]', errorMsg)
      }
    }

    return NextResponse.json({
      success: true,
      refreshed,
      failed,
      total: participantIdsArray.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error('[Refresh Identities API] Error:', error)
    
    if (error instanceof InstagramAuthError) {
      return NextResponse.json(
        {
          error: {
            type: 'instagram_auth',
            code: error.code,
            message: error.message,
          },
        },
        { status: 401 }
      )
    }
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

