/**
 * Enrich GBP reviews with images from Apify data
 * 
 * Matches reviews by reviewId and adds reviewImageUrls from Apify response
 */

import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/database.types'

type BusinessInsight = Database['public']['Tables']['business_insights']['Row']
type BusinessInsightSelect = Pick<BusinessInsight, 'apify_raw_payload'>

type BusinessReview = Database['public']['Tables']['business_reviews']['Row']
type BusinessReviewUpdate = Database['public']['Tables']['business_reviews']['Update']

interface ApifyReview {
  reviewId?: string
  reviewerId?: string
  name?: string
  publishedAtDate?: string
  reviewImageUrls?: string[]
}

/**
 * Extract reviews from Apify raw payload
 */
function extractApifyReviews(apifyRawPayload: any): ApifyReview[] {
  if (!apifyRawPayload || typeof apifyRawPayload !== 'object') {
    return []
  }

  // Apify returns an array of places, find the one that matches our business
  const places = Array.isArray(apifyRawPayload) ? apifyRawPayload : [apifyRawPayload]
  
  const reviews: ApifyReview[] = []
  
  for (const place of places) {
    if (place.reviews && Array.isArray(place.reviews)) {
      for (const review of place.reviews) {
        // Only include reviews that have images
        if (review.reviewImageUrls && Array.isArray(review.reviewImageUrls) && review.reviewImageUrls.length > 0) {
          reviews.push({
            reviewId: review.reviewId,
            reviewerId: review.reviewerId,
            name: review.name,
            publishedAtDate: review.publishedAtDate,
            reviewImageUrls: review.reviewImageUrls,
          })
        }
      }
    }
  }

  return reviews
}

/**
 * Match GBP review with Apify review
 * Tries multiple matching strategies:
 * 1. Exact reviewId match
 * 2. reviewerId + publishedAtDate match (within 1 day tolerance)
 */
function matchReview(
  gbpReview: { review_id: string | null; author_name: string | null; published_at: string | null },
  apifyReviews: ApifyReview[]
): ApifyReview | null {
  // Strategy 1: Exact reviewId match
  if (gbpReview.review_id) {
    const match = apifyReviews.find(ar => ar.reviewId === gbpReview.review_id)
    if (match) return match
  }

  // Strategy 2: Match by reviewer name + published date (within 1 day)
  if (gbpReview.author_name && gbpReview.published_at) {
    const gbpDate = new Date(gbpReview.published_at)
    const gbpDateStr = gbpDate.toISOString().split('T')[0] // YYYY-MM-DD
    
    for (const apifyReview of apifyReviews) {
      if (apifyReview.name && apifyReview.publishedAtDate) {
        const apifyDate = new Date(apifyReview.publishedAtDate)
        const apifyDateStr = apifyDate.toISOString().split('T')[0]
        
        // Match if same date and similar name (case-insensitive, trimmed)
        if (apifyDateStr === gbpDateStr) {
          const gbpName = gbpReview.author_name.trim().toLowerCase()
          const apifyName = apifyReview.name.trim().toLowerCase()
          
          // Exact match or one contains the other (handles variations)
          if (gbpName === apifyName || gbpName.includes(apifyName) || apifyName.includes(gbpName)) {
            return apifyReview
          }
        }
      }
    }
  }

  return null
}

/**
 * Enrich GBP reviews with images from Apify data
 */
export async function enrichReviewsWithApifyImages(locationId: string): Promise<{ enriched: number; errors: number }> {
  const supabase = await createClient()

  // Fetch Apify raw payload
  const { data: insights, error: insightsError } = await supabase
    .from('business_insights')
    .select('apify_raw_payload')
    .eq('location_id', locationId)
    .eq('source', 'google')
    .maybeSingle()

  if (insightsError || !insights) {
    console.log('[Enrich Reviews] No Apify data found for location:', locationId)
    return { enriched: 0, errors: 0 }
  }

  const apifyRawPayload = insights.apify_raw_payload as any
  const apifyReviews = extractApifyReviews(apifyRawPayload)

  if (apifyReviews.length === 0) {
    console.log('[Enrich Reviews] No reviews with images found in Apify data')
    return { enriched: 0, errors: 0 }
  }

  console.log('[Enrich Reviews] Found', apifyReviews.length, 'Apify reviews with images')

  // Fetch all GBP reviews for this location
  const { data: gbpReviews, error: reviewsError } = await supabase
    .from('business_reviews')
    .select('id, review_id, author_name, published_at, raw_payload')
    .eq('location_id', locationId)
    .eq('source', 'gbp')

  if (reviewsError || !gbpReviews || gbpReviews.length === 0) {
    console.log('[Enrich Reviews] No GBP reviews found')
    return { enriched: 0, errors: 0 }
  }

  console.log('[Enrich Reviews] Found', gbpReviews.length, 'GBP reviews to enrich')

  // Match and enrich reviews
  let enriched = 0
  let errors = 0

  for (const gbpReview of gbpReviews) {
    const match = matchReview(
      {
        review_id: gbpReview.review_id,
        author_name: gbpReview.author_name,
        published_at: gbpReview.published_at,
      },
      apifyReviews
    )

    if (match && match.reviewImageUrls && match.reviewImageUrls.length > 0) {
      // Check if images already exist in raw_payload
      const currentPayload = (gbpReview.raw_payload as any) || {}
      const currentImages = currentPayload.images || []

      // Only update if we have new images
      if (currentImages.length === 0 || JSON.stringify(currentImages) !== JSON.stringify(match.reviewImageUrls)) {
        const updatedPayload: BusinessReviewUpdate = {
          raw_payload: {
            ...currentPayload,
            images: match.reviewImageUrls,
            apifyEnrichedAt: new Date().toISOString(),
          },
        }

        const { error: updateError } = await supabase
          .from('business_reviews')
          .update(updatedPayload)
          .eq('id', gbpReview.id)

        if (updateError) {
          console.error('[Enrich Reviews] Failed to update review:', gbpReview.id, updateError)
          errors++
        } else {
          enriched++
          console.log('[Enrich Reviews] Enriched review:', gbpReview.id, 'with', match.reviewImageUrls.length, 'images')
        }
      }
    }
  }

  console.log('[Enrich Reviews] Enrichment complete:', { enriched, errors, total: gbpReviews.length })
  return { enriched, errors }
}

