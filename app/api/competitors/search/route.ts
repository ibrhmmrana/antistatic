import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/competitors/search
 * Search for competitors using Google Places API
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
    const query = searchParams.get('q')

    if (!query) {
      return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 })
    }

    // Use Google Places API Text Search
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 })
    }

    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`
    
    const searchResponse = await fetch(searchUrl)
    const searchData = await searchResponse.json()

    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      console.error('[Competitors Search API] Places API error:', searchData)
      return NextResponse.json({ error: `Places API error: ${searchData.error_message || searchData.status}` }, { status: 500 })
    }

    const places = searchData.results || []

    // Map to our format
    const competitors = places.map((place: any) => ({
      placeId: place.place_id,
      title: place.name,
      categoryName: place.types?.[0] || null,
      address: place.formatted_address || place.vicinity,
      lat: place.geometry?.location?.lat,
      lng: place.geometry?.location?.lng,
      phone: null, // Would need Place Details API call
      website: null, // Would need Place Details API call
      imageUrl: place.photos?.[0] ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${place.photos[0].photo_reference}&key=${apiKey}` : null,
      totalScore: place.rating || null,
      reviewsCount: place.user_ratings_total || 0,
      rawApify: place,
    }))

    return NextResponse.json({ competitors })
  } catch (error: any) {
    console.error('[Competitors Search API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to search competitors' },
      { status: 500 }
    )
  }
}


