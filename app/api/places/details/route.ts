import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const placeId = searchParams.get('place_id')

  if (!placeId) {
    return NextResponse.json({ error: 'place_id parameter is required' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 })
  }

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&key=${apiKey}&fields=name,formatted_address,formatted_phone_number,website,opening_hours,rating,user_ratings_total,geometry,types,photos`
    )

    const data = await response.json()

    if (data.status !== 'OK') {
      return NextResponse.json(
        { error: data.error_message || 'Places API error' },
        { status: 500 }
      )
    }

    const place = data.result
    const isOpen = place.opening_hours?.open_now ?? null

    // Log full response for debugging
    console.log('[Places Details] PLACE DETAILS RAW for', place.name, ':', JSON.stringify(place, null, 2))
    console.log('[Places Details] Types array:', place.types)

    // Build direct photo URLs for all photos
    let photoUrl: string | null = null
    const photoUrls: string[] = []
    const firstPhoto = place.photos?.[0]
    
    if (place.photos && place.photos.length > 0) {
      // Build URLs for all photos
      place.photos.forEach((photo: any) => {
        if (photo?.photo_reference) {
          const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${encodeURIComponent(photo.photo_reference)}&key=${apiKey}`
          photoUrls.push(url)
        }
      })
      
      // Set first photo URL for backward compatibility
      if (photoUrls.length > 0) {
        photoUrl = photoUrls[0]
        console.log('[Places Details] Photo URLs generated:', photoUrls.length, 'photos')
      }
    } else {
      console.log('[Places Details] No photo available for place:', place.name)
    }

    // Build categories from types array
    // Google Places API returns types in order of relevance (most specific first)
    const rawTypes = place.types || []
    
    // Only exclude truly generic types - keep everything else including 'store', 'restaurant', etc.
    // Do NOT filter out 'store' - it's a valid category we want to show
    const GENERIC_TYPES = new Set(['point_of_interest', 'establishment', 'premise'])
    const filteredTypes = rawTypes.filter((type: string) => {
      const isGeneric = GENERIC_TYPES.has(type)
      if (isGeneric) {
        console.log('[Places Details] Filtering out generic type:', type)
      }
      return !isGeneric
    })
    
    console.log('[Places Details] Raw types:', rawTypes)
    console.log('[Places Details] After filtering generic types:', filteredTypes)
    
    // Format types to human-readable categories matching Google's style
    // Google shows: "Computer repair service" (first word capitalized, rest lowercase)
    const formatCategory = (type: string): string => {
      if (!type || typeof type !== 'string') return type
      
      // Split on underscore
      const words = type.split('_').filter(w => w.length > 0)
      if (words.length === 0) return type
      
      // Capitalize first letter of first word only, keep rest lowercase
      const firstWord = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase()
      const otherWords = words.slice(1).map(w => w.toLowerCase())
      
      return [firstWord, ...otherWords].join(' ')
    }
    
    // Map to formatted categories, preserving original order from Google
    let categories = filteredTypes.map(formatCategory).filter((cat: string) => cat && cat.length > 0)
    
    // Remove duplicates while preserving order (case-insensitive)
    const seen = new Set<string>()
    categories = categories.filter((cat: string) => {
      const lower = cat.toLowerCase().trim()
      if (seen.has(lower)) {
        console.log('[Places Details] Removing duplicate category:', cat)
        return false
      }
      seen.add(lower)
      return true
    })
    
    // Keep at most 5 categories (UI will show first 3 + "+X")
    categories = categories.slice(0, 5)
    
    console.log('[Places Details] Final formatted categories:', categories)

    const details = {
      place_id: placeId,
      name: place.name,
      formatted_address: place.formatted_address,
      phone_number: place.formatted_phone_number,
      website: place.website,
      rating: place.rating,
      review_count: place.user_ratings_total,
      category: categories[0] || null,
      categories: categories,
      lat: place.geometry?.location?.lat,
      lng: place.geometry?.location?.lng,
      open_now: isOpen,
      photos: place.photos?.map((photo: any) => photo.photo_reference) || [],
      types: place.types || [],
      photoUrl: photoUrl,
      photoUrls: photoUrls, // All photo URLs
    }

    return NextResponse.json({ details })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch place details' },
      { status: 500 }
    )
  }
}

