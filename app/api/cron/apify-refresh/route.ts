/**
 * Daily Apify Refresh Cron Job
 * 
 * Runs the Apify actor for all business locations and enriches reviews with images
 * This route can be called by:
 * - Vercel Cron (automatic, uses x-vercel-cron header)
 * - n8n or other external schedulers (uses Authorization header with CRON_SECRET)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runApifyForPlaceIds } from '@/lib/insights/apify'
import { findCompetitorPlaceIdsForLocation } from '@/lib/places/competitors'
import { enrichReviewsWithApifyImages } from '@/lib/reputation/enrich-reviews-with-apify'
import { Database } from '@/lib/supabase/database.types'

type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<BusinessLocation, 'id' | 'place_id' | 'user_id' | 'google_location_name'>

type BusinessInsightsUpdate = Database['public']['Tables']['business_insights']['Update']

// Verify the request is from Vercel Cron
// Vercel Cron sends either:
// 1. x-vercel-cron header (for automatic cron jobs)
// 2. Authorization header with CRON_SECRET (for manual/managed cron jobs)
function verifyCronRequest(request: NextRequest): boolean {
  // Check for Vercel's automatic cron header
  const vercelCronHeader = request.headers.get('x-vercel-cron')
  if (vercelCronHeader === '1') {
    return true
  }

  // Check for manual cron secret (if CRON_SECRET is set)
  if (process.env.CRON_SECRET) {
    const authHeader = request.headers.get('authorization')
    return authHeader === `Bearer ${process.env.CRON_SECRET}`
  }

  // In development, allow if no secret is set (for testing)
  if (process.env.NODE_ENV === 'development') {
    console.warn('[Apify Refresh Cron] Running in development mode without authentication')
    return true
  }

  return false
}

export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron request
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  const startTime = Date.now()

  try {
    console.log('[Apify Refresh Cron] Starting daily refresh...')

    // Fetch all business locations that have GBP connected
    const { data: locations, error: locationsError } = await supabase
      .from('business_locations')
      .select('id, place_id, user_id, google_location_name')
      .not('google_location_name', 'is', null)
      .limit(100) // Process up to 100 locations per run

    if (locationsError) {
      throw new Error(`Failed to fetch locations: ${locationsError.message}`)
    }

    if (!locations || locations.length === 0) {
      console.log('[Apify Refresh Cron] No locations found')
      return NextResponse.json({ 
        success: true, 
        message: 'No locations to process',
        processed: 0,
      })
    }

    const typedLocations = locations as BusinessLocationSelect[]
    console.log('[Apify Refresh Cron] Found', typedLocations.length, 'locations to process')

    let successCount = 0
    let errorCount = 0
    const errors: Array<{ locationId: string; error: string }> = []

    // Process each location
    for (const location of typedLocations) {
      try {
        console.log('[Apify Refresh Cron] Processing location:', location.id, location.google_location_name)

        // Step 1: Find competitor place IDs
        const competitorDiscovery = await findCompetitorPlaceIdsForLocation(
          location.user_id,
          location.id
        )

        if (!competitorDiscovery.anchor.placeId) {
          console.warn('[Apify Refresh Cron] No place ID found for location:', location.id)
          continue
        }

        // Step 2: Run Apify for anchor + competitors
        const allPlaceIds = [
          competitorDiscovery.anchor.placeId,
          ...competitorDiscovery.competitors.map(c => c.placeId),
        ]

        console.log('[Apify Refresh Cron] Running Apify for', allPlaceIds.length, 'places')
        const apifyResult = await runApifyForPlaceIds(allPlaceIds, competitorDiscovery.anchor.placeId)

        // Step 3: Process Apify results into apify_competitors format
        const places = apifyResult.places
        const selfPlace = places.find(p => p.isSelf) || places.find(p => p.placeId === competitorDiscovery.anchor.placeId)
        const otherPlaces = places.filter(p => !p.isSelf && p.placeId !== competitorDiscovery.anchor.placeId)

        // Calculate averages (using all places)
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
        const apifyCompetitorsData = {
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

        console.log('[Apify Refresh Cron] Competitor comparison computed:', {
          sampleSize: apifyCompetitorsData.comparison.sampleSize,
          localAverageRating: apifyCompetitorsData.comparison.localAverageRating,
          ratingPercentile: apifyCompetitorsData.comparison.ratingPercentile,
          reviewVolumePercentile: apifyCompetitorsData.comparison.reviewVolumePercentile,
        })

        // Step 4: Store Apify data in business_insights
        const now = new Date().toISOString()
        const update: BusinessInsightsUpdate = {
          location_id: location.id,
          source: 'google',
          apify_raw_payload: apifyResult.rawItems || [],
          apify_competitors: apifyCompetitorsData as any, // Cast to any to satisfy Json type
          last_scraped_at: now,
          scrape_status: 'success',
          scrape_error: null,
          updated_at: now,
        }

        const { error: updateError } = await supabase
          .from('business_insights')
          .upsert(update as any, {
            onConflict: 'location_id,source',
          })

        if (updateError) {
          throw new Error(`Failed to save Apify data: ${updateError.message}`)
        }

        console.log('[Apify Refresh Cron] Saved Apify data for location:', location.id)

        // Step 4: Enrich GBP reviews with images from Apify
        const enrichmentResult = await enrichReviewsWithApifyImages(location.id)
        console.log('[Apify Refresh Cron] Enriched reviews:', {
          locationId: location.id,
          enriched: enrichmentResult.enriched,
          errors: enrichmentResult.errors,
        })

        successCount++
      } catch (error: any) {
        console.error('[Apify Refresh Cron] Error processing location:', location.id, error)
        errorCount++
        errors.push({
          locationId: location.id,
          error: error.message || 'Unknown error',
        })

        // Mark as error in database
        await supabase
          .from('business_insights')
          .upsert({
            location_id: location.id,
            source: 'google',
            scrape_status: 'error',
            scrape_error: error.message || 'Unknown error',
            updated_at: new Date().toISOString(),
          } as any, {
            onConflict: 'location_id,source',
          })
      }
    }

    const duration = Date.now() - startTime
    console.log('[Apify Refresh Cron] Completed:', {
      total: typedLocations.length,
      success: successCount,
      errors: errorCount,
      duration: `${duration}ms`,
    })

    return NextResponse.json({
      success: true,
      processed: typedLocations.length,
      successCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined,
      duration: `${duration}ms`,
    })
  } catch (error: any) {
    console.error('[Apify Refresh Cron] Fatal error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Unknown error',
      },
      { status: 500 }
    )
  }
}

