import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/competitors/rankings
 * Returns the latest ranking snapshot for a search term
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
    const searchTermId = searchParams.get('searchTermId')

    if (!locationId || !searchTermId) {
      return NextResponse.json({ error: 'locationId and searchTermId are required' }, { status: 400 })
    }

    // Get business location to get place_id and coordinates
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('place_id, lat, lng')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (locationError || !location) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    }

    const locationData: { place_id: string; lat: number; lng: number } = location

    const yourPlaceId = locationData.place_id
    const yourLat = locationData.lat
    const yourLng = locationData.lng

    // Get latest snapshot
    const { data: snapshot, error } = await supabase
      .from('competitor_rank_snapshots')
      .select('*')
      .eq('business_location_id', locationId)
      .eq('search_term_id', searchTermId)
      .order('captured_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[Rankings API] Error:', error)
      return NextResponse.json({ error: 'Failed to fetch rankings' }, { status: 500 })
    }

    const snapshotData: { results?: any[]; yourRank?: number | null; yourPlaceId?: string; [key: string]: any } | null = snapshot

    // If snapshot exists, ensure yourRank is calculated correctly and enrich with images if missing
    if (snapshotData && snapshotData.results && Array.isArray(snapshotData.results) && yourPlaceId) {
      console.log('[Rankings API] Calculating rank for place_id:', yourPlaceId)
      console.log('[Rankings API] Total results:', snapshotData.results.length)
      
      // Get Google Places API key for image fetching
      const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY
      
      // Helper to fetch photos from Google Places API
      const fetchPhotosForPlace = async (placeId: string): Promise<string[]> => {
        if (!apiKey || !placeId) return []
        try {
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}&fields=photos`
          const response = await fetch(detailsUrl)
          const data = await response.json()
          
          if (data.status === 'OK' && data.result?.photos && Array.isArray(data.result.photos)) {
            return data.result.photos
              .slice(0, 3) // Get up to 3 photos
              .map((photo: any) => {
                if (photo.photo_reference) {
                  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${photo.photo_reference}&key=${apiKey}`
                }
                return null
              })
              .filter((url: string | null): url is string => url !== null)
          }
        } catch (error) {
          console.error(`[Rankings API] Failed to fetch photos for ${placeId}:`, error)
        }
        return []
      }

      // Helper to fetch place coordinates from Google Places API
      const fetchPlaceCoordinates = async (placeId: string): Promise<{ lat: number; lng: number } | null> => {
        if (!apiKey || !placeId) return null
        try {
          const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}&fields=geometry`
          const response = await fetch(detailsUrl)
          const data = await response.json()
          
          if (data.status === 'OK' && data.result?.geometry?.location) {
            return {
              lat: data.result.geometry.location.lat,
              lng: data.result.geometry.location.lng,
            }
          }
        } catch (error) {
          console.error(`[Rankings API] Failed to fetch coordinates for ${placeId}:`, error)
        }
        return null
      }

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
      
      // Enrich results with images and distance - ALWAYS re-fetch from Google Places API to ensure validity
      // This fixes the issue where stored image URLs might be expired or invalid for some keywords
      const enrichedResults = await Promise.all(
        snapshotData.results.map(async (result: any) => {
          let enrichedResult = { ...result }
          
          // ALWAYS fetch fresh images from Google Places API to ensure they're valid
          // This fixes inconsistent image loading across different keywords
          if (result.placeId) {
            const imageUrls = await fetchPhotosForPlace(result.placeId)
            enrichedResult.imageUrl = imageUrls[0] || null
            enrichedResult.imageUrls = imageUrls

            // Calculate distance if we have user's coordinates
            if (yourLat && yourLng) {
              const competitorCoords = await fetchPlaceCoordinates(result.placeId)
              if (competitorCoords) {
                const distanceKm = calculateDistance(yourLat, yourLng, competitorCoords.lat, competitorCoords.lng)
                enrichedResult.distanceKm = Math.round(distanceKm * 10) / 10 // Round to 1 decimal place
              }
            }
          }
          
          return enrichedResult
        })
      )
      
      snapshotData.results = enrichedResults
      
      // Find the business in results by comparing place_id
      const yourResult = snapshotData.results.find((r: any) => {
        const matches = r.placeId === yourPlaceId
        if (matches) {
          console.log('[Rankings API] Found match at rank:', r.rank)
        }
        return matches
      })
      
      if (yourResult && yourResult.rank) {
        // Update the rank
        snapshotData.yourRank = yourResult.rank
        console.log('[Rankings API] Set yourRank to:', snapshotData.yourRank)
      } else if (!yourResult) {
        // Business not found in results
        snapshotData.yourRank = null
        console.log('[Rankings API] Business not found in results')
      }
      // Ensure yourPlaceId is set
      snapshotData.yourPlaceId = yourPlaceId
    } else if (snapshotData && !yourPlaceId) {
      console.warn('[Rankings API] No place_id available for location:', locationId)
    }

    return NextResponse.json({ 
      snapshot: snapshotData || null,
      yourPlaceId: yourPlaceId || null,
    })
  } catch (error: any) {
    console.error('[Rankings API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch rankings' },
      { status: 500 }
    )
  }
}

