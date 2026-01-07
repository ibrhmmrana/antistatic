import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getValidAccessToken, GBP_CONNECTED_ACCOUNTS_PROVIDER, getGBPAccessTokenForLocation } from '@/lib/gbp/client'
import { resolveAndStoreGBPLocationName } from '@/lib/gbp/location-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/social-studio/posts/gbp
 * 
 * Fetch GBP posts directly from Google Business Profile API
 * Returns posts in calendar event format (no database storage)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const businessLocationId = searchParams.get('businessLocationId')
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    if (!businessLocationId) {
      return NextResponse.json(
        { error: 'Missing required parameter: businessLocationId' },
        { status: 400 }
      )
    }

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
      // Return empty array if GBP not connected (not an error)
      return NextResponse.json({ events: [], posts: [] })
    }

    // Get or resolve GBP location name
    let parent = location.google_location_name

    if (!parent || !parent.match(/^accounts\/[^/]+\/locations\/[^/]+$/)) {
      console.log('[GBP Posts API] Location name missing or invalid, resolving...')
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
      console.error('[GBP Posts API] Token error:', tokenError)
      if (tokenError.message?.includes('reconnect')) {
        return NextResponse.json(
          { error: tokenError.message, needs_reauth: true },
          { status: 401 }
        )
      }
      throw tokenError
    }

    // Parse date range (optional)
    let startDate: Date | null = null
    let endDate: Date | null = null

    if (fromParam) {
      startDate = new Date(fromParam)
    }
    if (toParam) {
      endDate = new Date(toParam)
    }

    // If no date range provided, fetch last 2 years of posts
    if (!startDate) {
      startDate = new Date()
      startDate.setFullYear(startDate.getFullYear() - 2)
    }
    if (!endDate) {
      endDate = new Date()
      endDate.setFullYear(endDate.getFullYear() + 1) // Include future scheduled posts
    }

    // Fetch all GBP posts with pagination
    const allLocalPosts: any[] = []
    let nextPageToken: string | undefined = undefined
    let pageCount = 0

    do {
      pageCount++
      const apiUrl = new URL(`https://mybusiness.googleapis.com/v4/${parent}/localPosts`)
      if (nextPageToken) {
        apiUrl.searchParams.set('pageToken', nextPageToken)
      }

      console.log(`[GBP Posts API] Fetching page ${pageCount}${nextPageToken ? ` (token: ${nextPageToken.substring(0, 20)}...)` : ''}`)

      const response = await fetch(apiUrl.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      const responseData = await response.json().catch(() => ({ error: 'Failed to parse response' }))

      if (!response.ok) {
        console.error('[GBP Posts API] API error:', {
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
      console.log(`[GBP Posts API] Page ${pageCount}: Found ${pagePosts.length} posts (total so far: ${allLocalPosts.length})`)

      // Check for next page
      nextPageToken = responseData.nextPageToken
    } while (nextPageToken)

    console.log('[GBP Posts API] Total posts fetched from Google:', allLocalPosts.length, `(across ${pageCount} pages)`)

    // Filter posts within date range
    const filteredPosts = allLocalPosts.filter((post: any) => {
      // Use publishTime, then createTime, then updateTime
      const postDate = post.publishTime || post.createTime || post.updateTime
      if (!postDate) return false

      const postDateObj = new Date(postDate)
      return postDateObj >= startDate! && postDateObj <= endDate!
    })

    console.log('[GBP Posts API] Filtered to', filteredPosts.length, 'posts within date range')

    // Transform GBP posts into calendar event format
    const events = filteredPosts.map((gbpPost: any) => {
      // Use publishTime, then createTime, then updateTime for event date
      const eventDate = gbpPost.publishTime || gbpPost.createTime || gbpPost.updateTime || new Date().toISOString()

      // Extract media URL (first media item's sourceUrl)
      const mediaUrl = gbpPost.media && gbpPost.media.length > 0 && gbpPost.media[0].sourceUrl
        ? gbpPost.media[0].sourceUrl
        : null

      // Extract CTA
      const cta = gbpPost.callToAction
        ? {
            actionType: gbpPost.callToAction.actionType,
            url: gbpPost.callToAction.url || null,
          }
        : null

      // Generate a unique ID from the GBP post name
      const eventId = `gbp_${gbpPost.name?.replace(/\//g, '_') || `post_${Date.now()}`}`

      return {
        id: eventId,
        title: gbpPost.summary?.substring(0, 50) || 'GBP Post',
        start: eventDate,
        end: eventDate,
        extendedProps: {
          status: 'published',
          platforms: ['google_business'],
          platform: 'google_business',
          caption: gbpPost.summary || '',
          media: gbpPost.media || [],
          mediaUrl,
          cta,
          linkUrl: null,
          utm: null,
          scheduledAt: null,
          publishedAt: gbpPost.publishTime || gbpPost.createTime || gbpPost.updateTime,
          gbpLocalPostName: gbpPost.name || null,
          gbpSearchUrl: gbpPost.searchUrl || null,
          platformMeta: gbpPost,
          // Mark as live GBP post (not from database)
          isLiveGBP: true,
        },
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        textColor: '#000000',
        classNames: ['custom-calendar-event'],
      }
    })

    console.log(`[GBP Posts API] Created ${events.length} calendar events from ${filteredPosts.length} GBP posts`)

    return NextResponse.json({ events, posts: filteredPosts })
  } catch (error: any) {
    console.error('[GBP Posts API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

