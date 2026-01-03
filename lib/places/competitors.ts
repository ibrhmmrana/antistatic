/**
 * Competitor Discovery via Google Places API
 * 
 * Finds nearby competitors for a business location using Google Places Nearby Search.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/supabase/database.types'

type BusinessLocationRow = Database['public']['Tables']['business_locations']['Row']

// Constants
const DEFAULT_SEARCH_RADIUS = 2500 // meters (2.5km)
const MIN_REVIEWS_THRESHOLD = 5 // Minimum reviews to be considered a competitor (lowered from 20 to find more competitors)
const MAX_COMPETITORS = 20 // Maximum number of competitors to return (increased from 8)

export interface CompetitorReview {
  reviewId?: string
  reviewerName?: string
  reviewerPhotoUrl?: string
  rating: number
  comment?: string
  date?: string
  relativeTime?: string
}

export interface CompetitorPlaceInsight {
  placeId: string
  name: string
  address?: string
  categories?: string[]
  rating?: number | null
  reviewsCount?: number | null
  reviewsDistribution?: {
    oneStar?: number
    twoStar?: number
    threeStar?: number
    fourStar?: number
    fiveStar?: number
  }
  reviews?: CompetitorReview[]
  imageUrl?: string | null
  isSelf: boolean
  lat?: number | null
  lng?: number | null
}

export interface CompetitorDiscoveryResult {
  anchor: {
    placeId: string
    name?: string
    address?: string
    categories?: string[]
    lat: number
    lng: number
  }
  competitors: CompetitorPlaceInsight[]
  primaryCategoryKeyword?: string | null
}

/**
 * Get or fetch lat/lng for a business location
 */
async function getLocationCoordinates(
  location: BusinessLocationRow
): Promise<{ lat: number; lng: number }> {
  // If we already have coordinates, use them
  if (location.lat && location.lng) {
    console.log('[Places Competitors] Using stored coordinates:', { lat: location.lat, lng: location.lng })
    return { lat: location.lat, lng: location.lng }
  }

  // Otherwise, fetch from Places API
  console.log('[Places Competitors] No stored coordinates, fetching from Places API...')
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    throw new Error('Google Places API key not configured')
  }

  if (!location.place_id) {
    throw new Error('Place ID is required to fetch coordinates')
  }

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${location.place_id}&key=${apiKey}&fields=geometry,formatted_address,types`
  )

  const data = await response.json()

  if (data.status !== 'OK') {
    throw new Error(`Places API error: ${data.error_message || 'Unknown error'}`)
  }

  const place = data.result
  const lat = place.geometry?.location?.lat
  const lng = place.geometry?.location?.lng

  if (!lat || !lng) {
    throw new Error('Could not determine location coordinates')
  }

  // Persist coordinates to database
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

  await supabase
    .from('business_locations')
    .update({ lat, lng })
    .eq('id', location.id)

  console.log('[Places Competitors] Fetched and stored coordinates:', { lat, lng })
  return { lat, lng }
}

/**
 * Extract primary category keyword from business location
 * Takes the first category from the comma-separated category string
 */
function extractPrimaryCategoryKeyword(location: BusinessLocationRow): string | null {
  const categoryString = location.category || ''
  
  if (!categoryString || categoryString.trim() === '') {
    return null
  }

  // Split on comma, take first element, trim whitespace
  const parts = categoryString.split(',')
  const primaryCategoryKeyword = parts[0]?.trim() || null

  return primaryCategoryKeyword
}

/**
 * Check if a place matches the primary category keyword
 */
function matchesCategory(
  place: any,
  primaryCategoryKeyword: string | null
): boolean {
  if (!primaryCategoryKeyword) {
    return true // No category filter, accept all
  }

  const keywordLower = primaryCategoryKeyword.toLowerCase().trim()
  if (keywordLower === '') {
    return true // Empty keyword, accept all
  }

  const placeName = (place.name || '').toLowerCase()
  
  // Check if place name contains the keyword (as substring)
  if (placeName.includes(keywordLower)) {
    return true
  }

  // Check types array
  const types = place.types || []
  for (const type of types) {
    const typeLower = type.toLowerCase()
    // Normalize type: replace underscores with spaces for comparison
    const typeNormalized = typeLower.replace(/_/g, ' ')
    
    // Check if type contains the keyword or keyword contains type (substring match)
    if (typeNormalized.includes(keywordLower) || keywordLower.includes(typeNormalized)) {
      return true
    }
    
    // Also check the raw type string
    if (typeLower.includes(keywordLower) || keywordLower.includes(typeLower)) {
      return true
    }
  }

  return false
}

/**
 * Find competitor place IDs for a business location
 */
export async function findCompetitorPlaceIdsForLocation(
  userId: string,
  businessLocationId: string
): Promise<CompetitorDiscoveryResult> {
  console.log('[Places Competitors] Starting competitor discovery:', { userId, businessLocationId })

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

  // Load business location
  const { data: location, error: locationError } = await supabase
    .from('business_locations')
    .select('*')
    .eq('id', businessLocationId)
    .eq('user_id', userId)
    .single()

  if (locationError || !location) {
    throw new Error(`Failed to load business location: ${locationError?.message || 'Not found'}`)
  }

  if (!location.place_id) {
    throw new Error('Business location missing place_id')
  }

  // Extract primary category keyword
  const primaryCategoryKeyword = extractPrimaryCategoryKeyword(location)
  console.log('[Places Competitors] primaryCategoryKeyword for location', businessLocationId, ':', primaryCategoryKeyword || 'null')

  console.log('[Places Competitors] Loaded location:', {
    placeId: location.place_id,
    name: location.name,
    hasCategories: !!(location.categories && location.categories.length > 0),
    categoryString: location.category,
    primaryCategoryKeyword,
  })

  // Get coordinates
  const { lat, lng } = await getLocationCoordinates(location)

  // Call Places Nearby Search API
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    throw new Error('Google Places API key not configured')
  }

  const locationParam = `${lat},${lng}`
  const radius = DEFAULT_SEARCH_RADIUS
  let nearbyUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${locationParam}&radius=${radius}&key=${apiKey}`

  // Add keyword parameter if we have a primary category
  if (primaryCategoryKeyword) {
    nearbyUrl += `&keyword=${encodeURIComponent(primaryCategoryKeyword)}`
  }

  console.log('[Places Competitors] Nearby search params:', {
    lat,
    lng,
    radius,
    keyword: primaryCategoryKeyword || 'none',
  })
  console.log('[Places Competitors] Nearby search URL:', nearbyUrl.replace(apiKey, 'API_KEY_HIDDEN'))

  const nearbyResponse = await fetch(nearbyUrl)
  const nearbyData = await nearbyResponse.json()

  if (nearbyData.status !== 'OK' && nearbyData.status !== 'ZERO_RESULTS') {
    console.error('[Places Competitors] Nearby search error:', nearbyData)
    throw new Error(`Places Nearby Search error: ${nearbyData.error_message || nearbyData.status}`)
  }

  const results = nearbyData.results || []
  console.log('[Places Competitors] Nearby search returned:', {
    status: nearbyData.status,
    resultCount: results.length,
  })

  // Filter and process results
  const competitors: CompetitorPlaceInsight[] = []
  const allNearbyPlaces: CompetitorPlaceInsight[] = [] // For fallback if category filter yields nothing

  for (const result of results) {
    // Exclude the anchor place
    if (result.place_id === location.place_id) {
      continue
    }

    // Only include places with sufficient reviews
    const reviewCount = result.user_ratings_total || 0
    if (reviewCount < MIN_REVIEWS_THRESHOLD) {
      console.log('[Places Competitors] Skipping place with insufficient reviews:', {
        name: result.name,
        reviewCount,
      })
      continue
    }

    // Check if permanently closed
    if (result.business_status === 'CLOSED_PERMANENTLY') {
      console.log('[Places Competitors] Skipping permanently closed place:', result.name)
      continue
    }

    // Extract categories from types
    const types = result.types || []
    const GENERIC_TYPES = new Set(['point_of_interest', 'establishment', 'premise'])
    const filteredTypes = types.filter((type: string) => !GENERIC_TYPES.has(type))
    
    const formatCategory = (type: string): string => {
      if (!type || typeof type !== 'string') return type
      const words = type.split('_').filter(w => w.length > 0)
      if (words.length === 0) return type
      const firstWord = words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase()
      const otherWords = words.slice(1).map(w => w.toLowerCase())
      return [firstWord, ...otherWords].join(' ')
    }

    const categories = filteredTypes.map(formatCategory).filter((cat: string) => cat && cat.length > 0).slice(0, 5)

    const placeInsight: CompetitorPlaceInsight = {
      placeId: result.place_id,
      name: result.name || 'Unknown',
      address: result.vicinity || result.formatted_address || undefined,
      categories: categories.length > 0 ? categories : undefined,
      rating: result.rating || null,
      reviewsCount: reviewCount,
      isSelf: false,
      lat: result.geometry?.location?.lat || null,
      lng: result.geometry?.location?.lng || null,
    }

    // Store all valid places for potential fallback
    allNearbyPlaces.push(placeInsight)

    // Apply category filter if we have a primary category keyword
    if (primaryCategoryKeyword) {
      if (matchesCategory(result, primaryCategoryKeyword)) {
        competitors.push(placeInsight)
        console.log('[Places Competitors] Category match:', {
          name: result.name,
          keyword: primaryCategoryKeyword,
          matched: true,
        })
      } else {
        console.log('[Places Competitors] Category mismatch:', {
          name: result.name,
          keyword: primaryCategoryKeyword,
          types: result.types?.slice(0, 3),
        })
      }
    } else {
      // No category filter, include all
      competitors.push(placeInsight)
    }
  }

  // If category filter yielded no results, fall back to all nearby places
  if (primaryCategoryKeyword && competitors.length === 0 && allNearbyPlaces.length > 0) {
    console.warn(`[Places Competitors] No competitors found for category "${primaryCategoryKeyword}", falling back to unfiltered nearby results`)
    // Use all nearby places as competitors
    competitors.push(...allNearbyPlaces)
  }

  // Sort by review count (desc), then rating (desc)
  competitors.sort((a, b) => {
    const reviewDiff = (b.reviewsCount || 0) - (a.reviewsCount || 0)
    if (reviewDiff !== 0) return reviewDiff
    return (b.rating || 0) - (a.rating || 0)
  })

  // Take top N competitors
  const topCompetitors = competitors.slice(0, MAX_COMPETITORS)

  console.log('[Places Competitors] Selected competitors:', {
    totalFound: competitors.length,
    selected: topCompetitors.length,
    competitors: topCompetitors.map(c => ({
      name: c.name,
      placeId: c.placeId,
      rating: c.rating,
      reviewsCount: c.reviewsCount,
    })),
  })

  // Build anchor object
  const anchorCategories = location.categories || []
  const anchorCategoryString = location.category || ''
  const allAnchorCategories = anchorCategories.length > 0
    ? anchorCategories
    : anchorCategoryString.split(',').map((c: string) => c.trim()).filter((c: string) => c.length > 0)

  return {
    anchor: {
      placeId: location.place_id,
      name: location.name,
      address: location.formatted_address || undefined,
      categories: allAnchorCategories.length > 0 ? allAnchorCategories : undefined,
      lat,
      lng,
    },
    competitors: topCompetitors,
    primaryCategoryKeyword,
  }
}

