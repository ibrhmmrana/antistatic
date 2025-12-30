import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/competitors/rankings/refresh
 * Refreshes rankings for a search term by using Google Places API text search
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
    const { searchTermId, businessLocationId } = body

    if (!searchTermId || !businessLocationId) {
      return NextResponse.json({ error: 'searchTermId and businessLocationId are required' }, { status: 400 })
    }

    // Get search term
    console.log('[Rankings Refresh] Looking for search term:', { searchTermId, businessLocationId, userId: user.id })
    
    const { data: searchTerm, error: termError } = await supabase
      .from('search_terms')
      .select('*')
      .eq('id', searchTermId)
      .eq('business_location_id', businessLocationId)
      .maybeSingle()

    if (termError) {
      console.error('[Rankings Refresh] Error fetching search term:', termError)
      return NextResponse.json({ 
        error: 'Failed to fetch search term',
        details: termError.message,
      }, { status: 500 })
    }

    if (!searchTerm) {
      console.warn('[Rankings Refresh] Search term not found:', { searchTermId, businessLocationId })
      
      // Try to find any search terms for this location to debug
      const { data: allTerms } = await supabase
        .from('search_terms')
        .select('id, term, business_location_id')
        .eq('business_location_id', businessLocationId)
      
      console.log('[Rankings Refresh] Available search terms for location:', allTerms)
      
      const allTermsData: Array<{ id: string; term: string; business_location_id: string }> = allTerms || []
      
      return NextResponse.json({ 
        error: 'Search term not found',
        searchTermId,
        availableTerms: allTermsData.map(t => ({ id: t.id, term: t.term })),
      }, { status: 404 })
    }

    const searchTermData: { id: string; term: string; [key: string]: any } = searchTerm

    console.log('[Rankings Refresh] Found search term:', { id: searchTermData.id, term: searchTermData.term })

    // Get business location to find place_id and coordinates
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('place_id, lat, lng')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (locationError || !location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const locationData: { place_id: string; lat: number; lng: number } = location

    const yourLat = locationData.lat
    const yourLng = locationData.lng

    // Helper to calculate distance in kilometers using Haversine formula
    const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
      const R = 6371 // Earth's radius in kilometers
      const dLat = (lat2 - lat1) * Math.PI / 180
      const dLng = (lng2 - lng1) * Math.PI / 180
      const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
      return R * c
    }

    // Use Google Places API Text Search
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 })
    }

    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchTermData.term)}&key=${apiKey}`
    
    const searchResponse = await fetch(searchUrl)
    const searchData = await searchResponse.json()

    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      console.error('[Rankings Refresh API] Places API error:', searchData)
      return NextResponse.json({ error: `Places API error: ${searchData.error_message || searchData.status}` }, { status: 500 })
    }

    const places = searchData.results || []

    if (!locationData.place_id) {
      return NextResponse.json({ error: 'Business location missing place_id' }, { status: 400 })
    }

    // Helper function to fetch photos from Place Details API (more reliable than Text Search)
    const fetchPhotosForPlace = async (placeId: string): Promise<string[]> => {
      if (!placeId) return []
      try {
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}&fields=photos`
        const response = await fetch(detailsUrl)
        const data = await response.json()
        
        if (data.status === 'OK' && data.result?.photos && Array.isArray(data.result.photos)) {
          return data.result.photos
            .slice(0, 3) // Get up to 3 photos for fallback
            .map((photo: any) => {
              if (photo.photo_reference) {
                return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photo.photo_reference}&key=${apiKey}`
              }
              return null
            })
            .filter((url: string | null): url is string => url !== null)
        }
      } catch (error) {
        console.error(`[Rankings Refresh] Failed to fetch photos for ${placeId}:`, error)
      }
      return []
    }

    // Helper function to get photo URLs from photo_references (if available in Text Search results)
    const getPhotoUrlsFromTextSearch = (photos: any[]) => {
      if (!photos || photos.length === 0) return []
      return photos
        .slice(0, 3) // Get up to 3 photos for fallback
        .map((photo: any) => {
          if (photo.photo_reference) {
            return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photo.photo_reference}&key=${apiKey}`
          }
          return null
        })
        .filter((url: string | null): url is string => url !== null)
    }

    // Process results and fetch photos from Place Details API for each
    const results = await Promise.all(
      places.map(async (place: any, index: number) => {
        // First try to get photos from Text Search results
        let imageUrls = place.photos ? getPhotoUrlsFromTextSearch(place.photos) : []
        
        // If no photos from Text Search, fetch from Place Details API
        if (imageUrls.length === 0 && place.place_id) {
          imageUrls = await fetchPhotosForPlace(place.place_id)
        }

        // Calculate distance if we have coordinates
        let distanceKm: number | undefined = undefined
        if (yourLat && yourLng && place.geometry?.location) {
          const competitorLat = place.geometry.location.lat
          const competitorLng = place.geometry.location.lng
          distanceKm = Math.round(calculateDistance(yourLat, yourLng, competitorLat, competitorLng) * 10) / 10
        }

        return {
          placeId: place.place_id,
          title: place.name,
          rank: index + 1,
          score: place.rating || null,
          reviewsCount: place.user_ratings_total || 0,
          address: place.formatted_address || place.vicinity,
          imageUrl: imageUrls[0] || null, // Primary image
          imageUrls: imageUrls, // All available images for fallback
          distanceKm, // Distance in kilometers
        }
      })
    )

    // Find the business in results by comparing place_id
    const yourResultIndex = results.findIndex((r: any) => r.placeId === locationData.place_id)
    const yourRank = yourResultIndex >= 0 ? yourResultIndex + 1 : null

    console.log('[Rankings Refresh] Rank calculation:', {
      yourPlaceId: locationData.place_id,
      totalResults: results.length,
      yourRank,
      foundAtIndex: yourResultIndex,
    })

    // Store snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from('competitor_rank_snapshots')
      .insert({
        business_location_id: businessLocationId,
        search_term_id: searchTermId,
        captured_at: new Date().toISOString(),
        results,
        your_place_id: locationData.place_id,
        your_rank: yourRank && yourRank > 0 ? yourRank : null,
      })
      .select()
      .single()

    if (snapshotError) {
      console.error('[Rankings Refresh API] Error:', snapshotError)
      return NextResponse.json({ error: 'Failed to save snapshot' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      snapshot,
    })
  } catch (error: any) {
    console.error('[Rankings Refresh API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to refresh rankings' },
      { status: 500 }
    )
  }
}

