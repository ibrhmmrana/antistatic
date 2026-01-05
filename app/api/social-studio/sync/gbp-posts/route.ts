import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, GBP_CONNECTED_ACCOUNTS_PROVIDER, gbpApiRequest, getGBPAccessTokenForLocation } from '@/lib/gbp/client'
import { resolveAndStoreGBPLocationName } from '@/lib/gbp/location-resolver'
import { Database } from '@/lib/supabase/database.types'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const syncSchema = z.object({
  businessLocationId: z.string().uuid(),
  lookbackDays: z.number().int().min(1).max(365).optional().default(365),
})

/**
 * POST /api/social-studio/sync/gbp-posts
 * 
 * Sync past GBP posts from Google Business Profile API into our database
 * This backfills posts that were created outside of Antistatic
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
    const validationResult = syncSchema.safeParse(body)

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { businessLocationId, lookbackDays } = validationResult.data

    // Verify business location belongs to user
    const { data: locationData, error: locationError } = await supabase
      .from('business_locations')
      .select('id, user_id, google_location_name')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (locationError || !locationData) {
      return NextResponse.json({ error: 'Business location not found' }, { status: 404 })
    }

    // Type assertion for location with selected fields
    const location = locationData as {
      id: string
      user_id: string
      google_location_name: string | null
    }

    // Check if GBP is connected
    const { data: connectedAccount } = await supabase
      .from('connected_accounts')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('business_location_id', businessLocationId)
      .eq('provider', GBP_CONNECTED_ACCOUNTS_PROVIDER)
      .eq('status', 'connected')
      .maybeSingle()

    if (!connectedAccount) {
      return NextResponse.json(
        { error: 'Google Business Profile not connected', needs_reauth: true },
        { status: 400 }
      )
    }

    // Get or resolve GBP location name (parent path)
    let parent = location.google_location_name

    if (!parent || !parent.match(/^accounts\/[^/]+\/locations\/[^/]+$/)) {
      console.log('[GBP Sync] Location name missing or invalid, resolving...')
      const resolved = await resolveAndStoreGBPLocationName(
        user.id,
        businessLocationId,
        request.headers.get('origin') || undefined
      )

      if (!resolved || !resolved.match(/^accounts\/[^/]+\/locations\/[^/]+$/)) {
        return NextResponse.json(
          { error: 'Could not resolve GBP location. Please reconnect your Google Business Profile.' },
          { status: 400 }
        )
      }

      parent = resolved
    }

    // Get valid access token
    let accessToken: string
    try {
      accessToken = await getValidAccessToken(
        user.id,
        businessLocationId,
        request.headers.get('origin') || undefined
      )
    } catch (tokenError: any) {
      console.error('[GBP Sync] Token error:', tokenError)
      if (tokenError.message?.includes('reconnect')) {
        return NextResponse.json(
          { error: tokenError.message, needs_reauth: true },
          { status: 401 }
        )
      }
      throw tokenError
    }

    // Calculate date range (lookbackDays ago to now)
    const now = new Date()
    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - lookbackDays)

    // Call GBP API to list local posts with pagination
    // API endpoint: GET https://mybusiness.googleapis.com/v4/{parent}/localPosts
    // GBP API may return posts in pages, so we need to paginate
    const allLocalPosts: any[] = []
    let nextPageToken: string | undefined = undefined
    let pageCount = 0

    do {
      pageCount++
      const apiUrl = new URL(`https://mybusiness.googleapis.com/v4/${parent}/localPosts`)
      if (nextPageToken) {
        apiUrl.searchParams.set('pageToken', nextPageToken)
      }
      
      console.log(`[GBP Sync] Fetching page ${pageCount}${nextPageToken ? ` (token: ${nextPageToken.substring(0, 20)}...)` : ''}`)

      const response = await fetch(apiUrl.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      const responseData = await response.json().catch(() => ({ error: 'Failed to parse response' }))

      if (!response.ok) {
        console.error('[GBP Sync] API error:', {
          status: response.status,
          error: responseData,
        })

        if (response.status === 401) {
          return NextResponse.json(
            { error: 'Authentication failed. Please reconnect your Google Business Profile.', needs_reauth: true },
            { status: 401 }
          )
        }

        const errorMessage = responseData.error?.message || responseData.error || 'Failed to fetch posts'
        return NextResponse.json(
          { error: errorMessage, details: responseData },
          { status: response.status }
        )
      }

      // Extract local posts from this page
      const pagePosts = responseData.localPosts || []
      allLocalPosts.push(...pagePosts)
      console.log(`[GBP Sync] Page ${pageCount}: Found ${pagePosts.length} posts (total so far: ${allLocalPosts.length})`)

      // Check for next page
      nextPageToken = responseData.nextPageToken
    } while (nextPageToken)

    const localPosts = allLocalPosts
    console.log('[GBP Sync] Total posts fetched from Google:', localPosts.length, `(across ${pageCount} pages)`)

    // Filter posts within date range
    const filteredPosts = localPosts.filter((post: any) => {
      // Use createTime, updateTime, or publishTime (whichever is available)
      const postDate = post.createTime || post.updateTime || post.publishTime
      if (!postDate) return false
      
      const postDateObj = new Date(postDate)
      return postDateObj >= startDate && postDateObj <= now
    })

    console.log('[GBP Sync] Filtered to', filteredPosts.length, 'posts within', lookbackDays, 'days')

    // Map GBP posts to our database format and upsert
    const POSTS_TABLE = 'social_studio_posts' as const satisfies keyof Database['public']['Tables']
    type PostsInsert = Database['public']['Tables'][typeof POSTS_TABLE]['Insert']

    let syncedCount = 0
    let errorCount = 0

    for (const gbpPost of filteredPosts) {
      try {
        // Extract data from GBP post
        const localPostName = gbpPost.name // e.g., "accounts/.../locations/.../localPosts/..."
        const summary = gbpPost.summary || ''
        const searchUrl = gbpPost.searchUrl || null
        const createTime = gbpPost.createTime
        const updateTime = gbpPost.updateTime
        const publishTime = gbpPost.publishTime
        
        // Use publishTime, then createTime, then updateTime for published_at
        const publishedAt = publishTime || createTime || updateTime || new Date().toISOString()
        
        // Extract media URL (first media item's sourceUrl)
        const mediaUrl = gbpPost.media && gbpPost.media.length > 0 && gbpPost.media[0].sourceUrl
          ? gbpPost.media[0].sourceUrl
          : null
        
        // Extract CTA
        const cta = gbpPost.callToAction ? {
          actionType: gbpPost.callToAction.actionType,
          url: gbpPost.callToAction.url || null,
        } : null

        // Build insert payload
        const insertPayload: PostsInsert = {
          business_location_id: businessLocationId,
          status: 'published',
          platforms: ['google_business'],
          platform: 'google_business',
          caption: summary,
          media: gbpPost.media || [],
          media_url: mediaUrl,
          cta: cta,
          scheduled_at: null, // Past posts are already published
          published_at: publishedAt,
          gbp_local_post_name: localPostName,
          gbp_search_url: searchUrl,
          platform_meta: gbpPost, // Store raw GBP payload for debugging
        }

        // Upsert using gbp_local_post_name as unique key
        // First check if post exists
        const { data: existingPostData } = await supabase
          .from(POSTS_TABLE)
          .select('id, status')
          .eq('gbp_local_post_name', localPostName)
          .maybeSingle()

        // Type assertion for existingPost with selected fields
        const existingPost = existingPostData as {
          id: string
          status: string
        } | null

        if (existingPost) {
          // If post was deleted, don't restore it (preserve deleted status)
          if (existingPost.status === 'deleted') {
            console.log(`[GBP Sync] Skipping deleted post: ${localPostName.substring(localPostName.lastIndexOf('/') + 1)}`)
            continue
          }
          
          // Update existing post (but preserve status if it's not 'published')
          // Only update status to 'published' if it's currently 'published' or 'scheduled'
          // Don't change status if it's 'draft' or 'failed'
          const updatePayload = { ...insertPayload }
          if (existingPost.status !== 'published' && existingPost.status !== 'scheduled') {
            // Preserve existing status for non-published/scheduled posts
            updatePayload.status = existingPost.status as any
          }
          
          const { error: updateError } = await supabase
            .from(POSTS_TABLE)
            .update(updatePayload as any)
            .eq('id', existingPost.id)

          if (updateError) {
            console.error('[GBP Sync] Error updating post:', localPostName, updateError)
            errorCount++
          } else {
            syncedCount++
            console.log(`[GBP Sync] Updated post: ${localPostName.substring(localPostName.lastIndexOf('/') + 1)}`)
          }
        } else {
          // Insert new post
          const posts = supabase.from(POSTS_TABLE) as any
          const { error: insertError } = await posts.insert(insertPayload as any)

          if (insertError) {
            console.error('[GBP Sync] Error inserting post:', localPostName, insertError)
            errorCount++
          } else {
            syncedCount++
            console.log(`[GBP Sync] Inserted new post: ${localPostName.substring(localPostName.lastIndexOf('/') + 1)}`)
          }
        }
      } catch (postError: any) {
        console.error('[GBP Sync] Error processing post:', postError)
        errorCount++
      }
    }

    // After syncing, check for posts that exist in our DB but are NOT in the GBP response
    // These are posts that were deleted on GBP and should be marked as deleted in our DB
    // Only check posts that are currently published (not already deleted)
    const syncedPostNames = new Set(filteredPosts.map((p: any) => p.name))
    
    const { data: allLocalGBPPosts } = await supabase
      .from(POSTS_TABLE)
      .select('id, gbp_local_post_name, status')
      .eq('business_location_id', businessLocationId)
      .eq('platform', 'google_business')
      .not('gbp_local_post_name', 'is', null)
      .neq('status', 'deleted') // Only check non-deleted posts
    
    let deletedCount = 0
    if (allLocalGBPPosts) {
      for (const localPost of allLocalGBPPosts) {
        const gbpName = (localPost as any).gbp_local_post_name
        if (gbpName && !syncedPostNames.has(gbpName)) {
          // This post exists in our DB but not in GBP (was deleted on GBP)
          // Mark it as deleted
          const { error: deleteError } = await supabase
            .from(POSTS_TABLE)
            .update({ status: 'deleted', updated_at: new Date().toISOString() })
            .eq('id', localPost.id)
          
          if (deleteError) {
            console.error('[GBP Sync] Error marking post as deleted:', gbpName, deleteError)
          } else {
            deletedCount++
            console.log(`[GBP Sync] Marked deleted post: ${gbpName.substring(gbpName.lastIndexOf('/') + 1)}`)
          }
        }
      }
    }

    console.log('[GBP Sync] Complete:', { 
      synced: syncedCount, 
      errors: errorCount, 
      deleted: deletedCount,
      total: filteredPosts.length, 
      lookbackDays 
    })

    return NextResponse.json({
      success: true,
      synced: syncedCount,
      errors: errorCount,
      deleted: deletedCount,
      total: filteredPosts.length,
      lookbackDays,
    })
  } catch (error: any) {
    console.error('[GBP Sync] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

