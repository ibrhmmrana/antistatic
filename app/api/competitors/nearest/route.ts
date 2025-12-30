import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/competitors/nearest
 * Returns nearest competitors from onboarding Apify scrape results
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

    const searchParams = request.nextUrl.searchParams
    const locationId = searchParams.get('locationId')

    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    }

    // Verify location belongs to user and get place_id
    const { data: location } = await supabase
      .from('business_locations')
      .select('id, user_id, place_id')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Location not found or access denied' }, { status: 404 })
    }

    // Get Apify competitors data from business_insights
    const { data: insights } = await supabase
      .from('business_insights')
      .select('apify_competitors')
      .eq('location_id', locationId)
      .maybeSingle()

    if (!insights) {
      return NextResponse.json({ competitors: [] })
    }

    const insightsData: { apify_competitors: any } = insights

    if (!insightsData.apify_competitors) {
      return NextResponse.json({ competitors: [] })
    }

    const apifyData = insightsData.apify_competitors as any
    const competitors = apifyData.places || []

    // Get Google Places API key
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 })
    }

    // Helper function to fetch full place details from Google Places API
    const fetchPlaceDetailsFromPlacesAPI = async (placeId: string) => {
      if (!placeId) return null
      
      try {
        // Request comprehensive fields from Places API
        const fields = [
          'name',
          'formatted_address',
          'formatted_phone_number',
          'website',
          'rating',
          'user_ratings_total',
          'geometry',
          'types',
          'photos',
          'opening_hours',
          'business_status',
          'price_level',
          'vicinity',
        ].join(',')
        
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}&fields=${fields}`
        const response = await fetch(detailsUrl)
        const data = await response.json()
        
        if (data.status === 'OK' && data.result) {
          const place = data.result
          
          // Build photo URLs from photo_references
          const imageUrls: string[] = []
          if (place.photos && Array.isArray(place.photos)) {
            place.photos
              .slice(0, 10) // Limit to first 10 photos
              .forEach((photo: any) => {
                if (photo.photo_reference) {
                  imageUrls.push(
                    `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photo.photo_reference}&key=${apiKey}`
                  )
                }
              })
          }
          
          // Extract primary category from types (first non-generic type)
          const GENERIC_TYPES = new Set(['point_of_interest', 'establishment', 'premise'])
          const categoryType = place.types?.find((type: string) => !GENERIC_TYPES.has(type)) || place.types?.[0] || null
          const categoryName = categoryType
            ? categoryType
                .split('_')
                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ')
            : null
          
          // Format opening hours
          let openingHoursText: string | null = null
          let openingHoursList: string[] | null = null
          if (place.opening_hours) {
            if (place.opening_hours.weekday_text && Array.isArray(place.opening_hours.weekday_text)) {
              openingHoursList = place.opening_hours.weekday_text
              // For display, show first 2 days or a summary
              if (place.opening_hours.weekday_text.length > 0) {
                openingHoursText = place.opening_hours.weekday_text[0]
                if (place.opening_hours.weekday_text.length > 1) {
                  openingHoursText += `, ${place.opening_hours.weekday_text[1]}`
                }
                if (place.opening_hours.weekday_text.length > 2) {
                  openingHoursText += ` (+${place.opening_hours.weekday_text.length - 2} more)`
                }
              }
            } else if (place.opening_hours.open_now !== undefined) {
              openingHoursText = place.opening_hours.open_now ? 'Open now' : 'Closed now'
            }
          }

          return {
            placeId,
            title: place.name || null,
            categoryName,
            address: place.formatted_address || place.vicinity || null,
            lat: place.geometry?.location?.lat || null,
            lng: place.geometry?.location?.lng || null,
            phone: place.formatted_phone_number || null,
            website: place.website || null,
            imageUrls,
            imageUrl: imageUrls[0] || null,
            totalScore: place.rating || null,
            reviewsCount: place.user_ratings_total || 0,
            isAdvertisement: false, // Places API doesn't provide this, would need to check separately
            openingHours: openingHoursText,
            openingHoursList: openingHoursList,
            openingHoursRaw: place.opening_hours || null,
            openNow: place.opening_hours?.open_now ?? null,
            businessStatus: place.business_status || null,
            priceLevel: place.price_level || null,
            types: place.types || [],
          }
        }
      } catch (error) {
        console.error(`[Competitors API] Failed to fetch place details for ${placeId}:`, error)
      }
      
      return null
    }

    // Extract place IDs from Apify data (only use Apify for place_id)
    const competitorPlaceIds = competitors
      .map((place: any) => place.placeId || place.cid || place.kgmid)
      .filter((placeId: string | undefined): placeId is string => {
        return !!placeId && placeId !== location.place_id
      })

    // Fetch all competitor details from Google Places API in parallel
    const nearestCompetitors = await Promise.all(
      competitorPlaceIds.map(async (placeId: string) => {
        const placeDetails = await fetchPlaceDetailsFromPlacesAPI(placeId)
        
        // If Places API fails, return minimal data with place_id
        if (!placeDetails) {
          return {
            placeId,
            title: null,
            categoryName: null,
            address: null,
            lat: null,
            lng: null,
            phone: null,
            website: null,
            imageUrls: [],
            imageUrl: null,
            totalScore: null,
            reviewsCount: 0,
            isAdvertisement: false,
          }
        }
        
        return placeDetails
      })
    )

    // Filter out any null results and sort by relevance (rating/reviews)
    const validCompetitors = nearestCompetitors
      .filter((comp) => comp.placeId)
      .sort((a, b) => {
        // Sort by rating first, then by review count
        if (a.totalScore && b.totalScore) {
          if (b.totalScore !== a.totalScore) {
            return b.totalScore - a.totalScore
          }
        }
        return (b.reviewsCount || 0) - (a.reviewsCount || 0)
      })

    return NextResponse.json({ competitors: nearestCompetitors })
  } catch (error: any) {
    console.error('[Competitors API] Error fetching nearest competitors:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch nearest competitors' },
      { status: 500 }
    )
  }
}

