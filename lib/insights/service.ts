/**
 * Insights Service Layer
 * 
 * Handles Google Business Profile API data.
 * Handles merging, normalization, and persistence of insights.
 */

import { getGBPInsights, GBPInsightsData } from '@/lib/gbp/insights'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/supabase/database.types'

type BusinessInsightsRow = Database['public']['Tables']['business_insights']['Row']
type BusinessInsightsInsert = Database['public']['Tables']['business_insights']['Insert']
type BusinessInsightsUpdate = Database['public']['Tables']['business_insights']['Update']

export interface MergedInsights {
  scrapeStatus: 'not_started' | 'in_progress' | 'success' | 'error'
  lastScrapedAt: string | null
  scrapeError: string | null
  google: {
    rating: number | null
    reviewCount: number | null
    primaryCategory: string | null
    additionalCategories: string[]
    websiteUrl: string | null
    phone: string | null
    address: any | null
    lastReviewAt: string | null
  }
  performance: {
    totalCallClicks: number
    totalWebsiteClicks: number
    totalDirectionsRequests: number
  }
  summary: {
    topReviewKeywords: Array<{ keyword: string; count: number }>
    reviewSentiment: {
      positivePercent: number
      neutralPercent: number
      negativePercent: number
    }
  } | null
}

/**
 * Normalize error messages to be user-friendly
 */
function normalizeErrorMessage(errorMessage: string): string {
  // Remove duplicate prefixes like "Failed to fetch GBP location: Failed to fetch GBP location:"
  let normalized = errorMessage.replace(/^Failed to fetch GBP location: /i, '')
  normalized = normalized.replace(/^Failed to fetch GBP location: /i, '')

  // Map common error patterns to user-friendly messages
  if (normalized.includes('No GBP tokens found') || normalized.includes('No GBP tokens')) {
    return 'No Google Business Profile tokens found. Please reconnect your Google Business Profile.'
  }

  if (normalized.includes('GBP API error') || normalized.includes('Request contains an invalid argument')) {
    return "We couldn't fetch your Google Business Profile. Please reconnect and try again."
  }

  if (normalized.includes('No GBP accounts found') || normalized.includes('No GBP locations found')) {
    return "We couldn't find your Google Business Profile. Please reconnect and try again."
  }

  if (normalized.includes('Access token expired')) {
    return 'Your Google Business Profile connection has expired. Please reconnect.'
  }

  // For other errors, return a generic friendly message
  if (normalized.length > 100) {
    return "We couldn't fetch your Google Business Profile. Please reconnect and try again."
  }

  return normalized
}

/**
 * Merge GBP data into normalized insights
 */
function mergeInsightsData(
  gbpData: GBPInsightsData,
  existingInsights: BusinessInsightsRow | null
): BusinessInsightsUpdate {
  const now = new Date().toISOString()

  // Use GBP data as ground truth for core metrics
  const update: BusinessInsightsUpdate = {
    location_id: undefined, // Will be set by caller
    source: 'google',
    scrape_status: 'success',
    last_scraped_at: now,
    scrape_error: null,
    
    // GBP core fields
    gbp_avg_rating: gbpData.core.avgRating,
    gbp_review_count: gbpData.core.reviewCount,
    gbp_primary_category: gbpData.core.primaryCategory,
    gbp_additional_categories: gbpData.core.additionalCategories.length > 0 
      ? gbpData.core.additionalCategories 
      : null,
    gbp_website_url: gbpData.core.websiteUrl,
    gbp_phone: gbpData.core.phone,
    gbp_address: gbpData.core.address,
    gbp_last_review_at: gbpData.core.lastReviewAt,
    
    // GBP performance metrics
    gbp_total_call_clicks: gbpData.performance.totalCallClicks,
    gbp_total_website_clicks: gbpData.performance.totalWebsiteClicks,
    gbp_total_directions_requests: gbpData.performance.totalDirectionsRequests,
    gbp_metrics_raw: gbpData.performance.rawMetrics,
    
    // Derived fields (will be calculated later)
    review_sentiment_summary: null,
    top_review_keywords: null,
    last_analysis_at: null,
    
    updated_at: now,
  }

  // Preserve existing derived analysis if not recalculating
  if (existingInsights) {
    if (existingInsights.review_sentiment_summary) {
      update.review_sentiment_summary = existingInsights.review_sentiment_summary
    }
    if (existingInsights.top_review_keywords) {
      update.top_review_keywords = existingInsights.top_review_keywords
    }
  }

  return update
}

/**
 * Refresh insights for a location by fetching from GBP
 * 
 * @param userId - Antistatic user ID
 * @param businessLocationId - Antistatic business location ID
 * @param location - Business location data (place_id, name, formatted_address)
 * @param origin - Request origin for token refresh
 * @returns Updated insights data
 */
export async function refreshLocationInsights(
  userId: string,
  businessLocationId: string,
  location: {
    place_id: string
    name: string
    formatted_address?: string | null
  },
  origin?: string
): Promise<MergedInsights> {
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

  // Set status to in_progress and clear any previous error
  await supabase
    .from('business_insights')
    .upsert(
      {
        location_id: businessLocationId,
        source: 'google',
        scrape_status: 'in_progress',
        scrape_error: null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'location_id,source',
      }
    )

  try {
    // Fetch GBP insights
    console.log('[Insights] Fetching GBP insights...')
    const gbpData = await getGBPInsights(userId, businessLocationId, undefined, origin)
    console.log('[Insights] GBP insights fetched successfully')

    // Get existing insights to preserve derived fields
    const { data: existingInsights } = await supabase
      .from('business_insights')
      .select('*')
      .eq('location_id', businessLocationId)
      .eq('source', 'google')
      .single()

    // Merge data
    const update = mergeInsightsData(gbpData, existingInsights || null)
    update.location_id = businessLocationId

    // Set success status and last_scraped_at
    update.scrape_status = 'success'
    update.last_scraped_at = new Date().toISOString()
    update.scrape_error = null

    // Upsert insights with success status
    const { error: upsertError } = await supabase
      .from('business_insights')
      .upsert(update, {
        onConflict: 'location_id,source',
      })

    if (upsertError) {
      throw new Error(`Failed to save insights: ${upsertError.message}`)
    }

    // Fetch the saved insights to return complete data
    const { data: savedInsights } = await supabase
      .from('business_insights')
      .select('*')
      .eq('location_id', businessLocationId)
      .eq('source', 'google')
      .single()

    if (!savedInsights) {
      throw new Error('Failed to retrieve saved insights')
    }

    // Return normalized response
    return normalizeInsightsForResponse(savedInsights, gbpData.locationName)
  } catch (error: any) {
    console.error('[Insights] refreshLocationInsights error:', error)

    // Normalize error message for user display
    const userFriendlyError = normalizeErrorMessage(error.message || 'Unknown error')

    // Update status to error with user-friendly message
    await supabase
      .from('business_insights')
      .upsert(
        {
          location_id: businessLocationId,
          source: 'google',
          scrape_status: 'error',
          scrape_error: userFriendlyError,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'location_id,source',
        }
      )

    // Fetch the updated insights to return error state
    const { data: errorInsights } = await supabase
      .from('business_insights')
      .select('*')
      .eq('location_id', businessLocationId)
      .eq('source', 'google')
      .single()

    // Return error state instead of throwing
    if (errorInsights) {
      return normalizeInsightsForResponse(errorInsights, '')
    }

    // Fallback if we can't fetch the error state
    return {
      scrapeStatus: 'error' as const,
      lastScrapedAt: null,
      scrapeError: userFriendlyError,
      google: {
        rating: null,
        reviewCount: null,
        primaryCategory: null,
        additionalCategories: [],
        websiteUrl: null,
        phone: null,
        address: null,
        lastReviewAt: null,
      },
      performance: {
        totalCallClicks: 0,
        totalWebsiteClicks: 0,
        totalDirectionsRequests: 0,
      },
      summary: null,
    }
  }
}

/**
 * Normalize insights data for API response
 */
function normalizeInsightsForResponse(
  insights: BusinessInsightsRow,
  gbpLocationName: string
): MergedInsights {
  return {
    scrapeStatus: insights.scrape_status as any,
    lastScrapedAt: insights.last_scraped_at,
    scrapeError: insights.scrape_error,
    google: {
      rating: insights.gbp_avg_rating,
      reviewCount: insights.gbp_review_count,
      primaryCategory: insights.gbp_primary_category,
      additionalCategories: (insights.gbp_additional_categories as string[]) || [],
      websiteUrl: insights.gbp_website_url,
      phone: insights.gbp_phone,
      address: insights.gbp_address,
      lastReviewAt: insights.gbp_last_review_at,
    },
    performance: {
      totalCallClicks: insights.gbp_total_call_clicks || 0,
      totalWebsiteClicks: insights.gbp_total_website_clicks || 0,
      totalDirectionsRequests: insights.gbp_total_directions_requests || 0,
    },
    summary: insights.top_review_keywords || insights.review_sentiment_summary ? {
      topReviewKeywords: (insights.top_review_keywords as Array<{ keyword: string; count: number }>) || [],
      reviewSentiment: (insights.review_sentiment_summary as {
        positivePercent: number
        neutralPercent: number
        negativePercent: number
      }) || {
        positivePercent: 0,
        neutralPercent: 0,
        negativePercent: 0,
      },
    } : null,
  }
}

/**
 * Get current insights for a location
 * 
 * @param businessLocationId - Antistatic business location ID
 * @param userId - Optional user ID for auth verification
 * @returns Current insights or null if not found
 */
export async function getLocationInsights(
  businessLocationId: string,
  userId?: string
): Promise<MergedInsights | null> {
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

  // If userId provided, verify user owns the location (for auth)
  if (userId) {
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', businessLocationId)
      .eq('user_id', userId)
      .single()

    if (!location) {
      return null
    }
  }

  const { data: insights, error } = await supabase
    .from('business_insights')
    .select('*')
    .eq('location_id', businessLocationId)
    .eq('source', 'google')
    .single()

  if (error || !insights) {
    return null
  }

  // Get GBP location name for response (if needed)
  // For now, we'll use a placeholder
  return normalizeInsightsForResponse(insights, '')
}

