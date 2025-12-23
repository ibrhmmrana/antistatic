import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fetchGBPReviewsForLocation } from '@/lib/gbp/reviews'
import { findGBPConnectedAccount, GBP_CONNECTED_ACCOUNTS_PROVIDER } from '@/lib/gbp/client'

/**
 * GET /api/locations/[locationId]/gbp-reviews
 * 
 * Fetch Google Business Profile reviews for a location
 * Returns all reviews with summary statistics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  try {
    const { locationId } = params
    const requestUrl = new URL(request.url)
    const cookieStore = await cookies()

    console.log('[GBP Reviews API] Request received:', { locationId, url: request.url })

    // Validate locationId
    if (!locationId || typeof locationId !== 'string' || locationId.trim() === '') {
      console.error('[GBP Reviews API] Invalid locationId:', locationId)
      return NextResponse.json(
        { success: false, error: 'Invalid location ID', code: 'INVALID_LOCATION_ID' },
        { status: 400 }
      )
    }

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
      console.log('[GBP Reviews API] Unauthorized - no user')
      return NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      )
    }

    console.log('[GBP Reviews API] Authenticated user:', user.id)

    // Verify user owns this location
    // First, try to get basic location info (without categories column which may not exist)
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id, name, place_id, formatted_address, category')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .single()

    if (locationError) {
      console.error('[GBP Reviews API] Location query error:', {
        locationId,
        userId: user.id,
        error: locationError,
        code: locationError.code,
        message: locationError.message,
        details: locationError.details,
        hint: locationError.hint,
      })
      
      // Check if it's a "not found" error or RLS issue
      if (locationError.code === 'PGRST116') {
        // No rows returned - location doesn't exist or user doesn't have access
        return NextResponse.json(
          { success: false, error: 'Location not found or access denied', code: 'LOCATION_NOT_FOUND' },
          { status: 404 }
        )
      }
      
      // Return a more specific error based on the error code
      const errorMessage = locationError.message || 'Failed to verify location access'
      console.error('[GBP Reviews API] Location query failed:', errorMessage)
      
      return NextResponse.json(
        { success: false, error: errorMessage, code: 'LOCATION_QUERY_ERROR' },
        { status: 500 }
      )
    }

    if (!location) {
      console.error('[GBP Reviews API] Location not found (no data returned):', {
        locationId,
        userId: user.id,
      })
      return NextResponse.json(
        { success: false, error: 'Location not found or access denied', code: 'LOCATION_NOT_FOUND' },
        { status: 404 }
      )
    }

    console.log('[GBP Reviews API] Location found:', location.name)

    // Try to get categories separately if the column exists (may not exist if migration hasn't run)
    let categories: string[] | null = null
    try {
      const { data: locationWithCategories } = await supabase
        .from('business_locations')
        .select('categories')
        .eq('id', locationId)
        .eq('user_id', user.id)
        .single()
      categories = locationWithCategories?.categories || null
    } catch (e: any) {
      // Column doesn't exist or other error - that's okay, we'll just use null
      console.log('[GBP Reviews API] Could not fetch categories column (may not exist yet):', e?.message || e)
    }

    // Verify GBP is connected
    const connectedAccount = await findGBPConnectedAccount(supabase, locationId, user.id)

    if (!connectedAccount) {
      console.log('[GBP Reviews API] GBP not connected for location:', locationId)
      return NextResponse.json(
        { success: false, error: 'Google Business Profile not connected', code: 'GBP_NOT_CONNECTED' },
        { status: 400 }
      )
    }

    console.log('[GBP Reviews API] GBP connected, fetching reviews...')

    // Check if force refresh is requested
    const searchParams = requestUrl.searchParams
    const forceRefresh = searchParams.get('forceRefresh') === 'true'

    if (forceRefresh) {
      console.log('[GBP Reviews API] Force refresh requested - will bypass cache and fetch fresh data')
    }

    // Fetch reviews
    const result = await fetchGBPReviewsForLocation(
      user.id,
      locationId,
      requestUrl.origin,
      forceRefresh
    )

    // Get Places categories from business_locations
    // The category column contains comma-separated values, so parse it
    let placesCategories: { primary: string | null; all: string[] } = {
      primary: null,
      all: [],
    }
    
    if (location.category) {
      // Parse comma-separated categories from the category column
      placesCategories.all = location.category
        .split(',')
        .map((cat: string) => cat.trim())
        .filter((cat: string) => cat.length > 0)
      placesCategories.primary = placesCategories.all[0] || null
    } else if (categories && categories.length > 0) {
      // Fallback to categories array if category column is empty
      placesCategories.all = categories
      placesCategories.primary = categories[0] || null
    }

    // If we don't have categories stored, try to fetch them from Places API
    if (placesCategories.all.length === 0 && location.place_id) {
      try {
        console.log('[GBP Reviews API] No Places categories stored, fetching from Places API...')
        const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY
        if (apiKey) {
          const placesResponse = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${location.place_id}&key=${apiKey}&fields=types`
          )
          const placesData = await placesResponse.json()
          
          if (placesData.status === 'OK' && placesData.result?.types) {
            const rawTypes = placesData.result.types || []
            const GENERIC_TYPES = new Set(['point_of_interest', 'establishment', 'premise'])
            const filteredTypes = rawTypes.filter((type: string) => !GENERIC_TYPES.has(type))
            
            const formatCategory = (type: string): string => {
              if (!type || typeof type !== 'string') return type
              const words = type.split('_').filter(w => w.length > 0)
              if (words.length === 0) return type
              const firstWord = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase()
              const otherWords = words.slice(1).map(w => w.toLowerCase())
              return [firstWord, ...otherWords].join(' ')
            }
            
            const categories = filteredTypes.map(formatCategory).filter((cat: string) => cat && cat.length > 0)
            const seen = new Set<string>()
            const uniqueCategories = categories.filter((cat: string) => {
              const lower = cat.toLowerCase().trim()
              if (seen.has(lower)) return false
              seen.add(lower)
              return true
            }).slice(0, 5)
            
            placesCategories = {
              primary: uniqueCategories[0] || null,
              all: uniqueCategories,
            }
            
            // Store categories for future use
            // Store all categories as comma-separated string in category column
            const categoryString = uniqueCategories.join(', ')
            await supabase
              .from('business_locations')
              .update({
                category: categoryString,
                categories: uniqueCategories,
              })
              .eq('id', locationId)
            
            console.log('[GBP Reviews API] Fetched and stored Places categories:', placesCategories)
          }
        }
      } catch (placesError: any) {
        console.warn('[Places Categories] Failed to fetch categories from Places API:', placesError.message)
        // Don't fail the whole request - just continue without categories
      }
    }

    // Fetch competitor data from business_insights
    let competitorsData: any = null
    try {
      const { data: insights } = await supabase
        .from('business_insights')
        .select('apify_competitors')
        .eq('location_id', locationId)
        .eq('source', 'google')
        .single()

      if (insights?.apify_competitors) {
        const apifyData = insights.apify_competitors as any
        
        // Extract top competitors (excluding self)
        const allPlaces = apifyData.places || []
        const topCompetitors = allPlaces
          .filter((p: any) => !p.isSelf)
          .sort((a: any, b: any) => {
            // Sort by rating (desc), then review count (desc)
            const ratingDiff = (b.rating || 0) - (a.rating || 0)
            if (ratingDiff !== 0) return ratingDiff
            return (b.reviewsCount || 0) - (a.reviewsCount || 0)
          })
          .slice(0, 5) // Top 5 competitors
          .map((p: any) => ({
            placeId: p.placeId,
            name: p.name,
            rating: p.rating,
            reviewsCount: p.reviewsCount,
            address: p.address,
            imageUrl: p.imageUrl,
            reviews: p.reviews || [], // Include reviews if available
          }))

        competitorsData = {
          sampleSize: apifyData.comparison?.sampleSize || 0,
          localAverageRating: apifyData.comparison?.localAverageRating || null,
          localAverageReviews: apifyData.comparison?.localAverageReviews || null,
          ratingPercentile: apifyData.comparison?.ratingPercentile || null,
          reviewVolumePercentile: apifyData.comparison?.reviewVolumePercentile || null,
          primaryCategoryKeyword: apifyData.primaryCategoryKeyword || null,
          topCompetitors,
        }

        console.log('[GBP Reviews API] Competitor data loaded:', {
          sampleSize: competitorsData.sampleSize,
          topCompetitorsCount: competitorsData.topCompetitors.length,
        })
      } else {
        console.log('[GBP Reviews API] No competitor data available yet')
      }
    } catch (competitorError: any) {
      console.warn('[GBP Reviews API] Failed to load competitor data (non-fatal):', competitorError.message)
      // Continue without competitor data
    }

    console.log('[GBP Reviews API] Successfully fetched reviews:', {
      reviewCount: result.reviews.length,
      totalCount: result.summary.totalReviewCount,
      averageRating: result.summary.averageRating,
      hasGBPCategories: !!result.categories,
      hasPlacesCategories: placesCategories.all.length > 0,
      hasCompetitorData: !!competitorsData,
    })

    return NextResponse.json({
      success: true,
      summary: {
        ...result.summary,
        categories: placesCategories.all.length > 0 ? placesCategories.all : undefined,
        address: location.formatted_address || undefined,
        competitors: competitorsData,
      },
      reviews: result.reviews,
      category: result.categories ? {
        primary: result.categories.primary,
        additional: result.categories.additional,
      } : {
        primary: null,
        additional: [],
      },
      placesCategories: {
        primary: placesCategories.primary,
        all: placesCategories.all,
      },
    })
  } catch (error: any) {
    console.error('[GBP Reviews API] Error:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
    })

    // Determine error code and message based on error
    let errorMessage = 'Failed to fetch Google reviews. Please reconnect your Google Business Profile and try again.'
    let errorCode = 'GBP_FETCH_ERROR'

    if (error.message?.includes('GBP_AUTH_ERROR') || error.message?.includes('Unauthorized') || error.message?.includes('invalid_token')) {
      errorMessage = 'Your Google Business Profile connection has expired. Please reconnect.'
      errorCode = 'GBP_AUTH_ERROR'
    } else if (error.message?.includes('GBP_API_ERROR')) {
      errorMessage = 'Failed to fetch reviews from Google. Please try again later.'
      errorCode = 'GBP_API_ERROR'
    } else if (error.message?.includes('No GBP tokens found') || error.message?.includes('No GBP account found') || error.message?.includes('No primary GBP account found')) {
      errorMessage = 'Google Business Profile not connected. Please connect your account first.'
      errorCode = 'GBP_NOT_CONNECTED'
    } else if (error.message?.includes('No GBP locations found')) {
      errorMessage = 'No Google Business Profile locations found. Please check your GBP account.'
      errorCode = 'GBP_NO_LOCATIONS'
    }

    return NextResponse.json(
      { success: false, error: errorMessage, code: errorCode },
      { status: 500 }
    )
  }
}
