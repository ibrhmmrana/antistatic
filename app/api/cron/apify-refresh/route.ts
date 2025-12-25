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

        // Step 3: Store Apify raw payload in business_insights
        const now = new Date().toISOString()
        const update: BusinessInsightsUpdate = {
          location_id: location.id,
          source: 'google',
          apify_raw_payload: apifyResult.rawItems || [],
          last_scraped_at: now,
          scrape_status: 'success',
          scrape_error: null,
          updated_at: now,
        }

        const { error: updateError } = await supabase
          .from('business_insights')
          .upsert(update, {
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
          }, {
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

