import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getValidAccessToken, GBPReview } from '@/lib/gbp/client'

/**
 * Get Google Business Profile reviews for a location
 * 
 * Query parameters:
 * - locationName: The GBP location name (e.g., "accounts/123/locations/456")
 * - pageSize: Number of reviews to return (default: 50, max: 50)
 * - pageToken: Token for pagination
 * - orderBy: Sort order (default: "updateTime desc")
 */
export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url)
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {
            // No-op
          },
        },
      }
    )

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get business location ID
    const locationIdParam = requestUrl.searchParams.get('businessLocationId')
    
    let businessLocationId: string
    if (locationIdParam) {
      businessLocationId = locationIdParam
    } else {
      const { data: location } = await supabase
        .from('business_locations')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!location) {
        return NextResponse.json(
          { error: 'Business location not found' },
          { status: 404 }
        )
      }
      businessLocationId = location.id
    }

    // Verify GBP is connected
    const { data: connectedAccount } = await supabase
      .from('connected_accounts')
      .select('id')
      .eq('user_id', user.id)
      .eq('business_location_id', businessLocationId)
      .eq('provider', 'google_gbp')
      .eq('status', 'connected')
      .single()

    if (!connectedAccount) {
      return NextResponse.json(
        { error: 'Google Business Profile not connected' },
        { status: 400 }
      )
    }

    // Get account name and location name
    // If locationName is provided and already includes account path, use it directly
    // Otherwise, we need to fetch account and construct the path
    let locationName = requestUrl.searchParams.get('locationName')
    let accountName: string | null = null

    // If locationName doesn't start with "accounts/", we need to get account name
    if (!locationName || !locationName.startsWith('accounts/')) {
      // Get accounts to find the primary account
      const { gbpApiRequest } = await import('@/lib/gbp/client')
      const accountsResponse = await gbpApiRequest<{ accounts: Array<{ name: string; accountName: string }> }>(
        '/accounts',
        user.id,
        businessLocationId,
        { method: 'GET' },
        requestUrl.origin
      )

      const accounts = accountsResponse.accounts || []
      const primaryAccount = accounts.find(acc => acc.accountName?.includes('accounts/')) || accounts[0]

      if (!primaryAccount) {
        return NextResponse.json(
          { error: 'No GBP account found' },
          { status: 404 }
        )
      }

      accountName = primaryAccount.name

      // If locationName is provided but not full path, construct it
      if (locationName && !locationName.startsWith('accounts/')) {
        locationName = `${accountName}/${locationName}`
      } else if (!locationName) {
        // If no locationName provided, get first location
        const { gbpApiRequest: gbpRequest } = await import('@/lib/gbp/client')
        const locationsResponse = await gbpRequest<{ locations: any[] }>(
          `/${accountName}/locations`,
          user.id,
          businessLocationId,
          { method: 'GET' },
          requestUrl.origin
        )

        const locations = locationsResponse.locations || []
        if (locations.length === 0) {
          return NextResponse.json(
            { error: 'No GBP locations found' },
            { status: 404 }
          )
        }

        const location = locations[0]
        locationName = location.name
      }
    }

    if (!locationName) {
      return NextResponse.json(
        { error: 'locationName parameter is required' },
        { status: 400 }
      )
    }

    // Build query parameters
    const pageSize = parseInt(requestUrl.searchParams.get('pageSize') || '50', 10)
    const pageToken = requestUrl.searchParams.get('pageToken') || undefined
    const orderBy = requestUrl.searchParams.get('orderBy') || 'updateTime desc'

    const queryParams = new URLSearchParams({
      pageSize: Math.min(pageSize, 50).toString(),
      orderBy,
    })

    if (pageToken) {
      queryParams.append('pageToken', pageToken)
    }

    // Call GBP Reviews API
    // Format: https://mybusiness.googleapis.com/v4/{accountName}/{locationName}/reviews
    // Based on n8n example: locationName from Business Information API is just "locations/456"
    // So we need to combine: {accountName}/{locationName}
    const accessToken = await getValidAccessToken(user.id, businessLocationId, requestUrl.origin)
    
    // Use the correct base URL for reviews API
    const reviewsBaseUrl = 'https://mybusiness.googleapis.com/v4'
    
    // Construct reviews URL
    // If locationName is already full path (accounts/123/locations/456), use it directly
    // Otherwise, combine accountName and locationName
    let reviewsUrl: string
    if (locationName.startsWith('accounts/') && locationName.includes('/locations/')) {
      // Already full path: accounts/123/locations/456
      reviewsUrl = `${reviewsBaseUrl}/${locationName}/reviews?${queryParams.toString()}`
    } else if (accountName && locationName) {
      // Need to combine: accountName/locationName
      // Format: accounts/123/locations/456
      reviewsUrl = `${reviewsBaseUrl}/${accountName}/${locationName}/reviews?${queryParams.toString()}`
    } else {
      // Fallback: try using locationName directly (might already be full path)
      reviewsUrl = `${reviewsBaseUrl}/${locationName}/reviews?${queryParams.toString()}`
    }
    
    const reviewsResponse = await fetch(reviewsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!reviewsResponse.ok) {
      const error = await reviewsResponse.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(`GBP Reviews API error: ${error.error?.message || JSON.stringify(error)}`)
    }

    const reviewsData = await reviewsResponse.json()

    // Normalize review data
    const normalizedReviews = (reviewsData.reviews || []).map((review: GBPReview) => ({
      id: review.reviewId || review.name.split('/').pop() || '',
      reviewName: review.name,
      reviewer: {
        displayName: review.reviewer.displayName || 'Anonymous',
        profilePhotoUrl: review.reviewer.profilePhotoUrl || null,
      },
      rating: review.starRating === 'FIVE' ? 5 :
             review.starRating === 'FOUR' ? 4 :
             review.starRating === 'THREE' ? 3 :
             review.starRating === 'TWO' ? 2 : 1,
      comment: review.comment || '',
      createTime: review.createTime,
      updateTime: review.updateTime,
      reply: review.reply ? {
        comment: review.reply.comment,
        updateTime: review.reply.updateTime,
      } : null,
    }))

    return NextResponse.json({
      reviews: normalizedReviews,
      averageRating: reviewsData.averageRating,
      totalReviewCount: reviewsData.totalReviewCount,
      nextPageToken: reviewsData.nextPageToken,
    })
  } catch (error: any) {
    console.error('Error fetching GBP reviews:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch reviews' },
      { status: 500 }
    )
  }
}

