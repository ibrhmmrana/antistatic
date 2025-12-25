/**
 * Google Business Profile Reviews Fetcher
 * 
 * Fetches reviews from GBP API and computes summary statistics.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getGBPAccessTokenForLocation } from './client'
import type { Database } from '@/lib/supabase/database.types'
import { findCompetitorPlaceIdsForLocation } from '@/lib/places/competitors'
import { runApifyForPlaceIds } from '@/lib/insights/apify'
import type { CompetitorPlaceInsight } from '@/lib/places/competitors'

type BusinessInsightsUpdate = Database['public']['Tables']['business_insights']['Update']

export interface GBPReviewData {
  reviewId: string
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE'
  ratingValue: number // 1-5 numeric
  comment?: string
  reviewerName: string
  reviewerPhotoUrl?: string
  createTime: string
  updateTime: string
  rawReview?: any // Store full raw review for images/media
}

export interface GBPReviewsSummary {
  totalReviewCount: number
  averageRating: number
  positiveReviewCount: number
  negativeReviewCount: number
  sentimentSummary: {
    positivePercent: number
    neutralPercent: number
    negativePercent: number
  }
}

export interface GBPReviewsResult {
  summary: GBPReviewsSummary
  reviews: GBPReviewData[]
  categories?: {
    primary: string | null
    additional: string[]
  }
}

export interface GBPReviewsError {
  success: false
  error: string
  code: string
}

/**
 * Convert star rating string to number
 */
function starRatingToNumber(rating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE'): number {
  const map: Record<string, number> = {
    'ONE': 1,
    'TWO': 2,
    'THREE': 3,
    'FOUR': 4,
    'FIVE': 5,
  }
  return map[rating] || 0
}

/**
 * Extract categories from a GBP location object
 */
function extractCategoriesFromLocation(location: any): { primary: string | null; additional: string[] } {
  const primary = location.primaryCategory?.displayName || null
  const allCategories: string[] = (location.categories || [])
    .map((cat: any) => cat.displayName)
    .filter((name: string) => !!name)
  
  // Remove primary category from additional categories if it appears there
  const additional = allCategories.filter((name: string) => name !== primary)

  return { primary, additional }
}

/**
 * Resolve and persist GBP location name for a business location
 * 
 * This function:
 * 1. Checks if google_location_name is already stored
 * 2. If not, fetches accounts and locations from GBP API
 * 3. Selects the appropriate location (matching website if possible, otherwise first)
 * 4. Persists the location name to business_locations
 * 
 * @returns The location name and the selected location object (for category extraction)
 */
export async function resolveGBPLocationName(
  userId: string,
  businessLocationId: string,
  accountName: string,
  accessToken: string
): Promise<{ locationName: string; locationObject: any }> {
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

  console.log('[GBP Reviews] Resolving location name for:', { userId, businessLocationId, accountName })

  // Check if we already have the location name stored
  const { data: location, error: locationError } = await supabase
    .from('business_locations')
    .select('google_location_name, website')
    .eq('id', businessLocationId)
    .eq('user_id', userId)
    .single()

  if (locationError) {
    console.error('[GBP Reviews] Error fetching location:', locationError)
    throw new Error(`Failed to fetch business location: ${locationError.message}`)
  }

  if (location?.google_location_name) {
    console.log('[GBP Reviews] Location name already stored:', location.google_location_name)
    // Still need to fetch location details to get categories
    // We'll return the location name and fetch details separately
    return { locationName: location.google_location_name, locationObject: null }
  }

  console.log('[GBP Reviews] Location name not found, fetching from GBP API...')

  // Fetch locations from GBP API with readMask (include categories)
  const locationsUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title,storeCode,websiteUri,openInfo,metadata,primaryCategory,categories`
  console.log('[GBP Reviews] Fetching locations from:', locationsUrl)

  const locationsResponse = await fetch(locationsUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!locationsResponse.ok) {
    const errorText = await locationsResponse.text()
    let errorData
    try {
      errorData = JSON.parse(errorText)
    } catch {
      errorData = { error: errorText }
    }
    console.error('[GBP Reviews] Failed to fetch locations:', {
      status: locationsResponse.status,
      statusText: locationsResponse.statusText,
      error: errorData,
    })
    throw new Error(`Failed to fetch GBP locations: ${errorData.error?.message || JSON.stringify(errorData)}`)
  }

  const locationsData = await locationsResponse.json()
  const locations = locationsData.locations || []

  console.log('[GBP Reviews] Fetched locations:', {
    count: locations.length,
    locations: locations.map((loc: any) => ({
      name: loc.name,
      title: loc.title,
      websiteUri: loc.websiteUri,
      primaryCategory: loc.primaryCategory?.displayName,
      hasCategories: !!(loc.categories && loc.categories.length > 0),
    })),
  })

  if (locations.length === 0) {
    throw new Error('No GBP locations found')
  }

  // Select location: prefer one matching website, otherwise use first
  let selectedLocation = locations[0]
  const businessWebsite = location?.website

  if (businessWebsite && locations.length > 1) {
    // Try to find a location with matching website
    const matchingLocation = locations.find((loc: any) => {
      const locWebsite = loc.websiteUri
      if (!locWebsite || !businessWebsite) return false
      // Simple URL matching (normalize both)
      const normalizeUrl = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase()
      return normalizeUrl(locWebsite) === normalizeUrl(businessWebsite)
    })

    if (matchingLocation) {
      selectedLocation = matchingLocation
      console.log('[GBP Reviews] Matched location by website:', selectedLocation.name)
    } else {
      console.log('[GBP Reviews] No website match found, using first location')
    }
  }

  const locationName = selectedLocation.name
  console.log('[GBP Reviews] Selected location name:', locationName)

  // Persist the location name
  const { error: updateError } = await supabase
    .from('business_locations')
    .update({ google_location_name: locationName })
    .eq('id', businessLocationId)
    .eq('user_id', userId)

  if (updateError) {
    console.error('[GBP Reviews] Failed to persist location name:', updateError)
    throw new Error(`Failed to save location name: ${updateError.message}`)
  }

  console.log('[GBP Reviews] Successfully persisted location name:', locationName)
  return { locationName, locationObject: selectedLocation }
}

/**
 * Compute review summary statistics
 */
function computeReviewSummary(reviews: GBPReviewData[]): GBPReviewsSummary {
  if (reviews.length === 0) {
    return {
      totalReviewCount: 0,
      averageRating: 0,
      positiveReviewCount: 0,
      negativeReviewCount: 0,
      sentimentSummary: {
        positivePercent: 0,
        neutralPercent: 0,
        negativePercent: 0,
      },
    }
  }

  const ratings = reviews.map(r => r.ratingValue)
  const totalRating = ratings.reduce((sum, rating) => sum + rating, 0)
  const averageRating = totalRating / reviews.length

  // Positive = 4 or 5 stars, Negative = 1, 2, or 3 stars
  const positiveReviewCount = reviews.filter(r => r.ratingValue >= 4).length
  const negativeReviewCount = reviews.filter(r => r.ratingValue <= 3).length

  const positivePercent = (positiveReviewCount / reviews.length) * 100
  const negativePercent = (negativeReviewCount / reviews.length) * 100
  const neutralPercent = 0 // We don't have a neutral category based on star ratings

  return {
    totalReviewCount: reviews.length,
    averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
    positiveReviewCount,
    negativeReviewCount,
    sentimentSummary: {
      positivePercent: Math.round(positivePercent * 10) / 10,
      neutralPercent,
      negativePercent: Math.round(negativePercent * 10) / 10,
    },
  }
}

/**
 * Fetch GBP reviews for a location
 * 
 * @param userId - Antistatic user ID
 * @param businessLocationId - Antistatic business location ID
 * @param origin - Request origin for token refresh
 * @param forceRefresh - If true, bypasses cache and forces fresh Apify scrape
 * @returns Reviews data with summary or throws error
 */
export async function fetchGBPReviewsForLocation(
  userId: string,
  businessLocationId: string,
  origin?: string,
  forceRefresh: boolean = false
): Promise<GBPReviewsResult> {
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

  console.log('[GBP Reviews] Starting fetch for location:', { userId, businessLocationId })

  try {
    // Get access token and account name
    console.log('[GBP Reviews] Getting access token and account name...')
    const { accessToken, accountName } = await getGBPAccessTokenForLocation(
      userId,
      businessLocationId,
      origin
    )
    console.log('[GBP Reviews] Got access token and account:', { accountName, hasToken: !!accessToken })

    // Resolve location name (will fetch and persist if needed)
    const { locationName, locationObject } = await resolveGBPLocationName(
      userId,
      businessLocationId,
      accountName,
      accessToken
    )

    // If we don't have the location object yet (location name was already stored), fetch it for categories
    let locationForCategories = locationObject
    if (!locationForCategories) {
      try {
        const locationUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}?readMask=primaryCategory,categories`
        console.log('[GBP Reviews] Fetching location details for categories from:', locationUrl)
        const locationResponse = await fetch(locationUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })
        if (locationResponse.ok) {
          locationForCategories = await locationResponse.json()
          console.log('[GBP Reviews] Fetched location details:', {
            hasPrimaryCategory: !!locationForCategories.primaryCategory,
            categoriesCount: locationForCategories.categories?.length || 0,
          })
        } else {
          console.warn('[GBP Reviews] Failed to fetch location details:', locationResponse.status)
        }
      } catch (error: any) {
        console.warn('[GBP Reviews] Could not fetch location details for categories:', error.message)
      }
    }

    // Extract categories from location object
    const categories = locationForCategories ? extractCategoriesFromLocation(locationForCategories) : { primary: null, additional: [] }
    console.log('[GBP Reviews] Extracted categories:', categories)

    // Fetch reviews from GBP API
    // Format: https://mybusiness.googleapis.com/v4/{ACCOUNT_NAME}/{LOCATION_NAME}/reviews
    // The locationName from the locations API is the full resource path like "accounts/123/locations/456"
    // If it already starts with the accountName, use it directly; otherwise combine them
    let reviewsPath: string
    if (locationName.startsWith(accountName)) {
      // Location name already includes account prefix, use it directly
      reviewsPath = `${locationName}/reviews`
    } else {
      // Combine account and location
      reviewsPath = `${accountName}/${locationName}/reviews`
    }
    const reviewsUrl = `https://mybusiness.googleapis.com/v4/${reviewsPath}`
    console.log('[GBP Reviews] Fetching reviews from:', reviewsUrl)

    const reviewsResponse = await fetch(reviewsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!reviewsResponse.ok) {
      const errorText = await reviewsResponse.text()
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { error: errorText }
      }

      console.error('[GBP Reviews] Reviews API error:', {
        status: reviewsResponse.status,
        statusText: reviewsResponse.statusText,
        error: errorData,
      })

      // Handle specific error codes
      if (reviewsResponse.status === 401 || reviewsResponse.status === 403) {
        throw new Error('GBP_AUTH_ERROR: Invalid or expired token')
      }

      throw new Error(`GBP_API_ERROR: ${errorData.error?.message || JSON.stringify(errorData)}`)
    }

    const reviewsData = await reviewsResponse.json()
    console.log('[GBP Reviews] Reviews API response:', {
      hasReviews: !!(reviewsData.reviews && reviewsData.reviews.length > 0),
      reviewCount: reviewsData.reviews?.length || 0,
      totalReviewCount: reviewsData.totalReviewCount,
      averageRating: reviewsData.averageRating,
    })

    const rawReviews = reviewsData.reviews || []

    // Transform reviews to our format
    const reviews: GBPReviewData[] = rawReviews.map((review: any) => {
      const rating = starRatingToNumber(review.starRating || 'FIVE')
      return {
        reviewId: review.reviewId || review.name?.split('/').pop() || '',
        starRating: review.starRating || 'FIVE',
        ratingValue: rating,
        comment: review.comment || undefined,
        reviewerName: review.reviewer?.displayName || 'Anonymous',
        reviewerPhotoUrl: review.reviewer?.profilePhotoUrl || undefined,
        createTime: review.createTime || '',
        updateTime: review.updateTime || review.createTime || '',
        // Store the full raw review to preserve any image/media data
        rawReview: review,
      }
    })

    // Use API values if available, otherwise compute from reviews
    const totalReviewCount = reviewsData.totalReviewCount || reviews.length
    const apiAverageRating = reviewsData.averageRating

    // Compute summary from actual reviews
    const computedSummary = computeReviewSummary(reviews)

    // Use API averageRating if available and valid, otherwise use computed
    const averageRating = (apiAverageRating && apiAverageRating > 0) ? apiAverageRating : computedSummary.averageRating

    const finalSummary: GBPReviewsSummary = {
      totalReviewCount,
      averageRating: Math.round(averageRating * 10) / 10,
      positiveReviewCount: computedSummary.positiveReviewCount,
      negativeReviewCount: computedSummary.negativeReviewCount,
      sentimentSummary: computedSummary.sentimentSummary,
    }

    console.log('[GBP Reviews] Computed summary:', finalSummary)

    // Now fetch competitors and run Apify (only if GBP is working)
    // First, check if we already have recent Apify data to avoid duplicate runs
    let apifyCompetitorsData: any = null
    let apifyRawPayload: any[] = [] // Store raw Apify payload for review enrichment
    
    // Check existing insights for recent Apify data and scrape status
    const { data: existingInsights } = await supabase
      .from('business_insights')
      .select('apify_competitors, scrape_status, apify_raw_payload')
      .eq('location_id', businessLocationId)
      .eq('source', 'google')
      .single()

    const existingApifyData = existingInsights?.apify_competitors as any
    const scrapeStatus = existingInsights?.scrape_status as string | undefined
    const existingApifyRawPayload = existingInsights?.apify_raw_payload as any[] | undefined
    
    // Prevent double execution: if a scrape is already in progress, skip unless forceRefresh
    if (scrapeStatus === 'in_progress' && !forceRefresh) {
      console.log('[GBP Reviews] Scrape already in progress, skipping Apify execution to prevent double run')
      // Use existing data if available, otherwise return empty
      if (existingApifyData) {
        apifyCompetitorsData = existingApifyData
      }
    } else {
      // Determine if we should run Apify:
      // - Always run if forceRefresh is true (unless already in progress)
      // - Run if no existing data
      // - Run if existing data has no scrapedAt timestamp
      // - Run if existing data is older than 7 days
      // - Skip if existing data is recent (within 7 days)
      const shouldRunApify = forceRefresh || !existingApifyData || !existingApifyData.scrapedAt || (() => {
        try {
          const scrapedAt = new Date(existingApifyData.scrapedAt).getTime()
          if (isNaN(scrapedAt)) {
            console.log('[GBP Reviews] Existing Apify data has invalid scrapedAt, will re-run')
            return true
          }
          
          const now = Date.now()
          const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000)
          const isStale = scrapedAt < sevenDaysAgo
          
          if (isStale) {
            console.log('[GBP Reviews] Existing Apify data is stale (older than 7 days), will re-run')
          } else {
            const ageHours = Math.round((now - scrapedAt) / (1000 * 60 * 60))
            console.log(`[GBP Reviews] Using existing Apify data (scraped ${ageHours} hours ago, within last 7 days)`)
          }
          
          return isStale
        } catch (error) {
          console.warn('[GBP Reviews] Error checking Apify data age, will re-run:', error)
          return true
        }
      })()

      if (!shouldRunApify && existingApifyData) {
        if (forceRefresh) {
          console.log('[GBP Reviews] Force refresh requested - will re-run Apify despite existing data')
        } else {
          console.log('[GBP Reviews] Skipping Apify scrape - using existing data from', existingApifyData.scrapedAt)
          apifyCompetitorsData = existingApifyData
          // Use existing raw payload if available
          if (existingApifyRawPayload && Array.isArray(existingApifyRawPayload)) {
            apifyRawPayload = existingApifyRawPayload
          }
        }
      }
      
      if (shouldRunApify && scrapeStatus !== 'in_progress') {
        // Mark scrape as in progress to prevent double execution
        await supabase
          .from('business_insights')
          .upsert({
            location_id: businessLocationId,
            source: 'google',
            scrape_status: 'in_progress',
          }, {
            onConflict: 'location_id,source',
          })
        
        try {
          console.log('[GBP Reviews] Starting competitor discovery and Apify scrape...')
        
        // Step 1: Find competitor place IDs
        const competitorDiscovery = await findCompetitorPlaceIdsForLocation(userId, businessLocationId)
        console.log('[GBP Reviews] Competitor discovery completed:', {
          anchorPlaceId: competitorDiscovery.anchor.placeId,
          competitorCount: competitorDiscovery.competitors.length,
        })

        // Step 2: Run Apify for anchor + competitors
        const allPlaceIds = [
          competitorDiscovery.anchor.placeId,
          ...competitorDiscovery.competitors.map(c => c.placeId),
        ]
        
        console.log('[GBP Reviews] Running Apify for place IDs:', {
          totalPlaces: allPlaceIds.length,
          placeIds: allPlaceIds.slice(0, 3), // Log first 3
        })

        const apifyResult = await runApifyForPlaceIds(allPlaceIds, competitorDiscovery.anchor.placeId)
        console.log('[GBP Reviews] Apify scrape completed:', {
          placesReturned: apifyResult.places.length,
          rawItemsCount: apifyResult.rawItems?.length || 0,
        })

        // Store full Apify raw payload for review enrichment
        const apifyRawPayload = apifyResult.rawItems || []

        // Step 3: Compute comparison metrics
        const places = apifyResult.places
        const selfPlace = places.find(p => p.isSelf) || places.find(p => p.placeId === competitorDiscovery.anchor.placeId)
        const otherPlaces = places.filter(p => !p.isSelf && p.placeId !== competitorDiscovery.anchor.placeId)

        // Calculate averages (using all places or just others - using all for now)
        const placesWithRating = places.filter(p => p.rating !== null && p.rating !== undefined)
        const placesWithReviews = places.filter(p => p.reviewsCount !== null && p.reviewsCount !== undefined)

        const localAverageRating = placesWithRating.length > 0
          ? placesWithRating.reduce((sum, p) => sum + (p.rating || 0), 0) / placesWithRating.length
          : null

        const localAverageReviews = placesWithReviews.length > 0
          ? placesWithReviews.reduce((sum, p) => sum + (p.reviewsCount || 0), 0) / placesWithReviews.length
          : null

        // Calculate percentiles (using others only for comparison)
        let ratingPercentile: number | null = null
        let reviewVolumePercentile: number | null = null

        if (selfPlace && otherPlaces.length > 0) {
          const selfRating = selfPlace.rating
          const selfReviews = selfPlace.reviewsCount

          if (selfRating !== null && selfRating !== undefined) {
            const othersWithRating = otherPlaces.filter(p => p.rating !== null && p.rating !== undefined)
            const betterOrEqual = othersWithRating.filter(p => (p.rating || 0) <= selfRating).length
            ratingPercentile = othersWithRating.length > 0
              ? Math.round((betterOrEqual / othersWithRating.length) * 100)
              : null
          }

          if (selfReviews !== null && selfReviews !== undefined) {
            const othersWithReviews = otherPlaces.filter(p => p.reviewsCount !== null && p.reviewsCount !== undefined)
            const betterOrEqual = othersWithReviews.filter(p => (p.reviewsCount || 0) <= selfReviews).length
            reviewVolumePercentile = othersWithReviews.length > 0
              ? Math.round((betterOrEqual / othersWithReviews.length) * 100)
              : null
          }
        }

        // Build the apify_competitors JSON structure
        apifyCompetitorsData = {
          places: places.map(p => ({
            placeId: p.placeId,
            name: p.name,
            address: p.address,
            categories: p.categories,
            rating: p.rating,
            reviewsCount: p.reviewsCount,
            reviewsDistribution: p.reviewsDistribution,
            reviews: p.reviews, // Include individual reviews
            imageUrl: p.imageUrl,
            isSelf: p.isSelf,
          })),
          comparison: {
            sampleSize: places.length,
            localAverageRating: localAverageRating ? Math.round(localAverageRating * 10) / 10 : null,
            localAverageReviews: localAverageReviews ? Math.round(localAverageReviews) : null,
            ratingPercentile,
            reviewVolumePercentile,
          },
          primaryCategoryKeyword: competitorDiscovery.primaryCategoryKeyword || null,
          scrapedAt: new Date().toISOString(),
        }

        console.log('[GBP Reviews] Competitor comparison computed:', {
          sampleSize: apifyCompetitorsData.comparison.sampleSize,
          localAverageRating: apifyCompetitorsData.comparison.localAverageRating,
          ratingPercentile: apifyCompetitorsData.comparison.ratingPercentile,
          reviewVolumePercentile: apifyCompetitorsData.comparison.reviewVolumePercentile,
        })
        } catch (competitorError: any) {
          // Don't fail the whole request if competitor scraping fails
          console.error('[GBP Reviews] Competitor discovery/Apify failed (non-fatal):', {
            message: competitorError.message,
            stack: competitorError.stack,
          })
          
          // Mark scrape as error
          await supabase
            .from('business_insights')
            .update({ scrape_status: 'error', scrape_error: competitorError.message })
            .eq('location_id', businessLocationId)
            .eq('source', 'google')
        
          // If we have existing data, use it as fallback
          if (existingApifyData) {
            console.log('[GBP Reviews] Apify failed, falling back to existing data')
            apifyCompetitorsData = existingApifyData
          }
          // Otherwise continue without competitor data
        }
      }
    }

    // Store individual reviews in business_reviews table
    if (reviews.length > 0) {
      console.log('[GBP Reviews] Storing individual reviews:', { count: reviews.length })
      
      const reviewInserts = reviews.map((review) => {
        // Parse date from createTime (ISO format)
        let publishedAt: string | null = null
        try {
          if (review.createTime) {
            publishedAt = new Date(review.createTime).toISOString()
          }
        } catch (e) {
          console.warn('[GBP Reviews] Failed to parse review date:', review.createTime)
        }

        // Extract review images from raw review data
        // GBP API may include images in review.media or review.photos
        const reviewImages: string[] = []
        if (review.rawReview) {
          const rawReview = review.rawReview
          // Check for media/photos in various possible locations
          if (rawReview.media && Array.isArray(rawReview.media)) {
            rawReview.media.forEach((media: any) => {
              if (media.photoUrl) {
                reviewImages.push(media.photoUrl)
              } else if (media.thumbnailUrl) {
                reviewImages.push(media.thumbnailUrl)
              }
            })
          }
          if (rawReview.photos && Array.isArray(rawReview.photos)) {
            rawReview.photos.forEach((photo: any) => {
              if (photo.url) {
                reviewImages.push(photo.url)
              } else if (photo.thumbnailUrl) {
                reviewImages.push(photo.thumbnailUrl)
              }
            })
          }
        }

        return {
          location_id: businessLocationId,
          source: 'gbp',
          rating: review.ratingValue,
          review_text: review.comment || null,
          author_name: review.reviewerName || null,
          author_photo_url: review.reviewerPhotoUrl || null,
          published_at: publishedAt,
          review_id: review.reviewId || `gbp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          raw_payload: {
            starRating: review.starRating,
            createTime: review.createTime,
            updateTime: review.updateTime,
            images: reviewImages.length > 0 ? reviewImages : undefined,
            name: review.rawReview?.name || undefined, // Store full review name for API calls
            reply: review.rawReview?.reply || undefined, // Store reply if it exists
          },
        }
      })

      // Upsert reviews (on conflict, update if newer)
      const { error: reviewsError } = await supabase
        .from('business_reviews')
        .upsert(reviewInserts, {
          onConflict: 'location_id,source,review_id',
          ignoreDuplicates: false, // Update existing reviews
        })

      if (reviewsError) {
        console.error('[GBP Reviews] Failed to save individual reviews:', reviewsError)
        // Don't throw - continue with insights save
      } else {
        console.log('[GBP Reviews] Successfully saved', reviewInserts.length, 'reviews to database')
        
        // Enrich reviews with images from Apify if we have Apify data
        if (apifyRawPayload && apifyRawPayload.length > 0) {
          try {
            const { enrichReviewsWithApifyImages } = await import('@/lib/reputation/enrich-reviews-with-apify')
            const enrichmentResult = await enrichReviewsWithApifyImages(businessLocationId)
            console.log('[GBP Reviews] Enriched reviews with Apify images:', {
              enriched: enrichmentResult.enriched,
              errors: enrichmentResult.errors,
            })
          } catch (enrichError: any) {
            console.error('[GBP Reviews] Failed to enrich reviews with Apify images:', enrichError)
            // Don't throw - enrichment is optional
          }
        }
      }
    }

    // Store competitor reviews from Apify
    if (apifyCompetitorsData?.places) {
      const competitorReviews: any[] = []
      
      for (const place of apifyCompetitorsData.places) {
        if (place.reviews && place.reviews.length > 0) {
          for (const review of place.reviews) {
            let publishedAt: string | null = null
            try {
              if (review.date) {
                publishedAt = new Date(review.date).toISOString()
              }
            } catch (e) {
              // Try parsing relativeTime or skip
            }

            competitorReviews.push({
              location_id: businessLocationId,
              source: 'apify',
              rating: review.rating || null,
              review_text: review.comment || null,
              author_name: review.reviewerName || null,
              author_photo_url: review.reviewerPhotoUrl || null,
              published_at: publishedAt,
              review_id: review.reviewId || `${place.placeId}-${review.reviewId || Math.random()}`,
              competitor_business_name: place.name || null, // Store competitor business name
              raw_payload: {
                placeId: place.placeId,
                placeName: place.name,
                review: review,
              },
            })
          }
        }
      }

      if (competitorReviews.length > 0) {
        console.log('[GBP Reviews] Storing competitor reviews:', { count: competitorReviews.length })
        
        const { error: competitorReviewsError } = await supabase
          .from('business_reviews')
          .upsert(competitorReviews, {
            onConflict: 'location_id,source,review_id',
            ignoreDuplicates: false,
          })

        if (competitorReviewsError) {
          console.error('[GBP Reviews] Failed to save competitor reviews:', competitorReviewsError)
        } else {
          console.log('[GBP Reviews] Successfully saved', competitorReviews.length, 'competitor reviews to database')
        }
      }
    }

    // Upsert into business_insights
    const now = new Date().toISOString()
    const update: BusinessInsightsUpdate = {
      location_id: businessLocationId,
      source: 'google',
      scrape_status: 'success',
      scrape_error: null,
      last_scraped_at: now,
      gbp_avg_rating: finalSummary.averageRating,
      gbp_review_count: finalSummary.totalReviewCount,
      review_sentiment_summary: finalSummary.sentimentSummary,
      gbp_primary_category: categories.primary,
      gbp_additional_categories: categories.additional.length > 0 ? categories.additional : null,
      apify_competitors: apifyCompetitorsData,
      apify_raw_payload: apifyRawPayload.length > 0 ? apifyRawPayload : undefined, // Store full raw payload
      updated_at: now,
    }

    console.log('[GBP Reviews] Persisting insights with categories and competitors:', {
      primaryCategory: categories.primary,
      additionalCategoriesCount: categories.additional.length,
      hasCompetitorData: !!apifyCompetitorsData,
    })

    const { error: upsertError } = await supabase
      .from('business_insights')
      .upsert(update, {
        onConflict: 'location_id,source',
      })

    if (upsertError) {
      console.error('[GBP Reviews] Failed to save insights:', upsertError)
      // Don't throw - we still want to return the reviews data
    } else {
      console.log('[GBP Reviews] Successfully saved insights to database')
    }

    return {
      summary: finalSummary,
      reviews,
      categories,
    }
  } catch (error: any) {
    console.error('[GBP Reviews] Error fetching reviews:', {
      message: error.message,
      stack: error.stack,
    })

    // Update business_insights with error status
    const now = new Date().toISOString()
    const errorUpdate: BusinessInsightsUpdate = {
      location_id: businessLocationId,
      source: 'google',
      scrape_status: 'error',
      scrape_error: error.message || 'Failed to fetch reviews',
      updated_at: now,
    }

    try {
      await supabase
        .from('business_insights')
        .upsert(errorUpdate, {
          onConflict: 'location_id,source',
        })
      console.log('[GBP Reviews] Saved error status to database')
    } catch (dbError) {
      console.error('[GBP Reviews] Failed to save error status:', dbError)
    }

    // Re-throw with proper error code
    throw error
  }
}
