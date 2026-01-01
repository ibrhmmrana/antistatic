import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { InstagramAPI } from '@/lib/instagram/api'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/social/instagram/sync
 * 
 * Sync Instagram data (profile, media, comments, insights) and cache in DB
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

    // Get business location from request or use user's most recent
    const body = await request.json().catch(() => ({}))
    const locationId = body.locationId || request.nextUrl.searchParams.get('locationId')

    if (!locationId) {
      // Get user's most recent business location
      const { data: location } = await supabase
        .from('business_locations')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!location) {
        return NextResponse.json({ error: 'Business location not found' }, { status: 404 })
      }

      const typedLocation = location as { id: string } | null
      if (!typedLocation) {
        return NextResponse.json({ error: 'Business location not found' }, { status: 404 })
      }

      // Use the location ID
      const syncResult = await performSync(typedLocation.id, supabase)
      return NextResponse.json(syncResult)
    }

    // Verify location belongs to user
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Location not found or access denied' }, { status: 404 })
    }

    const syncResult = await performSync(locationId, supabase)
    return NextResponse.json(syncResult)
  } catch (error: any) {
    console.error('[Instagram Sync] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

async function performSync(businessLocationId: string, supabase: any) {
  const api = await InstagramAPI.create(businessLocationId)

  if ('type' in api) {
    // Check if it's a token expiry error
    if (api.type === 'APIError' && api.code === 190) {
      return {
        success: false,
        error: 'Access token has expired. Please reconnect your Instagram account.',
        requiresReconnect: true,
      }
    }
    return {
      success: false,
      error: api.message,
    }
  }

  const syncState = {
    businessLocationId,
    igUserId: api['userId'],
    username: null as string | null,
    grantedScopes: api['scopes'],
    lastError: null as string | null,
  }

  try {
    // 1. Fetch profile
    console.log('[Instagram Sync] Fetching profile...')
    const profile = await api.getProfile()
    if ('type' in profile) {
      // Check if it's a token expiry error
      if (profile.type === 'APIError' && profile.code === 190) {
        throw new Error('Access token has expired. Please reconnect your Instagram account.')
      }
      throw new Error(`Failed to fetch profile: ${profile.message}`)
    }
    syncState.username = profile.username
    syncState.igUserId = profile.id

    // 2. Fetch media (last 30 days)
    console.log('[Instagram Sync] Fetching media...')
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const since = thirtyDaysAgo.toISOString()

    const mediaItems: any[] = []
    let mediaCursor: string | undefined
    let mediaPageCount = 0
    const maxMediaPages = 10 // Cap at 250 posts

    do {
      const mediaResult = await api.listMedia({
        since,
        limit: 25,
        after: mediaCursor,
      })

      if ('type' in mediaResult) {
        throw new Error(`Failed to fetch media: ${mediaResult.message}`)
      }

      mediaItems.push(...mediaResult.data)
      mediaCursor = mediaResult.paging?.cursors?.after
      mediaPageCount++

      if (mediaPageCount >= maxMediaPages) {
        break
      }
    } while (mediaCursor)

    console.log(`[Instagram Sync] Fetched ${mediaItems.length} media items`)

    // 3. Upsert media
    for (const item of mediaItems) {
      await supabase
        .from('instagram_media')
        .upsert({
          id: item.id,
          business_location_id: businessLocationId,
          ig_user_id: syncState.igUserId,
          permalink: item.permalink,
          caption: item.caption || null,
          media_type: item.media_type,
          media_url: item.media_url || null,
          thumbnail_url: item.thumbnail_url || null,
          timestamp: item.timestamp,
          like_count: item.like_count || 0,
          comments_count: item.comments_count || 0,
          raw: item,
        }, {
          onConflict: 'id',
        })
    }

    // 4. Fetch comments for each media item (with reasonable caps)
    console.log('[Instagram Sync] Fetching comments...')
    const allComments: any[] = []
    const commentsPerMedia = 50 // Cap comments per media
    const maxMediaForComments = Math.min(mediaItems.length, 100) // Cap media items to process

    for (let i = 0; i < maxMediaForComments; i++) {
      const media = mediaItems[i]
      if (!media.id || (media.comments_count || 0) === 0) {
        continue
      }

      try {
        let commentCursor: string | undefined
        let commentPageCount = 0
        const maxCommentPages = Math.ceil(commentsPerMedia / 25)

        do {
          const commentsResult = await api.listComments(media.id, {
            limit: 25,
            after: commentCursor,
          })

          if ('type' in commentsResult) {
            // Log but continue - some media might not have comment access
            console.warn(`[Instagram Sync] Failed to fetch comments for media ${media.id}:`, commentsResult.message)
            break
          }

          allComments.push(...commentsResult.data.map((c: any) => ({
            ...c,
            media_id: media.id,
          })))

          commentCursor = commentsResult.paging?.cursors?.after
          commentPageCount++

          if (commentPageCount >= maxCommentPages || allComments.length >= commentsPerMedia) {
            break
          }
        } while (commentCursor)
      } catch (error: any) {
        console.warn(`[Instagram Sync] Error fetching comments for media ${media.id}:`, error.message)
        // Continue with next media
      }
    }

    console.log(`[Instagram Sync] Fetched ${allComments.length} comments`)

    // 5. Upsert comments
    for (const comment of allComments) {
      await supabase
        .from('instagram_comments')
        .upsert({
          id: comment.id,
          business_location_id: businessLocationId,
          ig_user_id: syncState.igUserId,
          media_id: comment.media_id,
          username: comment.from?.username || null,
          text: comment.text || null,
          timestamp: comment.timestamp,
          replied: false, // Don't overwrite existing replied status
          raw: comment,
        }, {
          onConflict: 'id',
        })
    }

    // 6. Calculate granted and missing scopes
    const requiredScopes = [
      'instagram_business_basic',
      'instagram_business_manage_insights',
      'instagram_manage_comments',
      'instagram_business_manage_comments',
      'instagram_business_manage_messages',
      'instagram_business_content_publish',
    ]
    
    const grantedScopes = syncState.grantedScopes || []
    const grantedScopesList = grantedScopes.filter(s => requiredScopes.some(rs => s.includes(rs)))
    const missingScopesList = requiredScopes.filter(rs => !grantedScopes.some(s => s.includes(rs)))

    // 7. Attempt to fetch insights only if scope is present
    console.log('[Instagram Sync] Checking insights permission...')
    let insightsAvailable = false
    let insightsError: { code?: number; message?: string; requiredPermission?: string; payload?: any } | null = null

    const hasInsightsScope = grantedScopes.some(s => s.includes('instagram_business_manage_insights'))
    
    if (hasInsightsScope) {
      try {
        const insightsResult = await api.getInsights({
          since,
          metrics: ['impressions', 'reach', 'profile_views', 'website_clicks', 'email_contacts', 'phone_call_clicks'],
        })

        if ('type' in insightsResult) {
          // Insights failed - store full error payload
          const errorPayload: any = {
            type: insightsResult.type,
            message: insightsResult.message,
          }
          
          // Only include status and code if they exist (APIError has them, NotConnected doesn't)
          if ('status' in insightsResult) {
            errorPayload.status = insightsResult.status
          }
          if ('code' in insightsResult) {
            errorPayload.code = insightsResult.code
          }
          
          insightsError = {
            message: insightsResult.message,
            payload: errorPayload,
          }
          
          // Only include code if it exists (APIError has it)
          if ('code' in insightsResult && insightsResult.code) {
            insightsError.code = insightsResult.code
          }
          
          // Check if it's a permission error
          if (('status' in insightsResult && insightsResult.status === 403) || insightsResult.message?.includes('permission')) {
            insightsError.requiredPermission = 'instagram_business_manage_insights'
          }
          
          console.warn('[Instagram Sync] Insights fetch failed:', insightsResult.message)
        } else {
          // Insights succeeded
          insightsAvailable = true
          const insightsByDate: Record<string, any> = {}

          for (const metric of insightsResult.data) {
            for (const value of metric.values) {
              const date = new Date(value.end_time).toISOString().split('T')[0]
              if (!insightsByDate[date]) {
                insightsByDate[date] = { date }
              }
              insightsByDate[date][metric.name] = value.value
            }
          }

          // Upsert insights
          for (const [date, data] of Object.entries(insightsByDate)) {
            await supabase
              .from('instagram_insights_daily')
              .upsert({
                business_location_id: businessLocationId,
                ig_user_id: syncState.igUserId,
                date,
                reach: data.reach || null,
                impressions: data.impressions || null,
                profile_visits: data.profile_views || null,
                website_clicks: data.website_clicks || null,
                email_contacts: data.email_contacts || null,
                phone_call_clicks: data.phone_call_clicks || null,
                raw: data,
              }, {
                onConflict: 'business_location_id,date',
              })
          }

          console.log(`[Instagram Sync] Processed insights for ${Object.keys(insightsByDate).length} days`)
        }
      } catch (error: any) {
        console.warn('[Instagram Sync] Error fetching insights:', error.message)
        insightsError = {
          message: error.message || 'Unknown error',
          payload: { error: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined },
        }
      }
    } else {
      console.log('[Instagram Sync] Skipping insights - missing instagram_business_manage_insights scope')
      insightsError = {
        message: 'insights permission not granted',
        requiredPermission: 'instagram_business_manage_insights',
      }
    }

    // 8. Update sync state with scopes and error payload
    const syncTimestamp = new Date().toISOString()
    const { error: syncStateError } = await supabase
      .from('instagram_sync_state')
      .upsert({
        business_location_id: businessLocationId,
        ig_user_id: syncState.igUserId,
        username: syncState.username,
        granted_scopes: syncState.grantedScopes,
        granted_scopes_list: grantedScopesList,
        missing_scopes_list: missingScopesList,
        last_synced_at: syncTimestamp,
        last_error: null,
        insights_available: insightsAvailable,
        last_error_code: insightsError?.code?.toString() || null,
        last_error_message: insightsError?.message || null,
        last_error_payload: insightsError?.payload || null,
      }, {
        onConflict: 'business_location_id',
      })

    if (syncStateError) {
      console.error('[Instagram Sync] Error updating sync state:', syncStateError)
      // Continue anyway - sync completed successfully
    } else {
      console.log('[Instagram Sync] Sync state updated successfully, last_synced_at:', syncTimestamp)
    }

    return {
      success: true,
      summary: {
        mediaCount: mediaItems.length,
        commentsCount: allComments.length,
        username: syncState.username,
      },
    }
  } catch (error: any) {
    console.error('[Instagram Sync] Sync failed:', error)

    // Update sync state with error
    await supabase
      .from('instagram_sync_state')
      .upsert({
        business_location_id: businessLocationId,
        ig_user_id: syncState.igUserId,
        username: syncState.username,
        granted_scopes: syncState.grantedScopes,
        last_error: error.message || 'Unknown error',
      }, {
        onConflict: 'business_location_id',
      })

    return {
      success: false,
      error: error.message || 'Sync failed',
    }
  }
}

