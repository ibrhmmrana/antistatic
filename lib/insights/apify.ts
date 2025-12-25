/**
 * Apify Integration for Competitor Scraping
 * 
 * Uses Apify actor nwua9Gu5YrADL7ZDj to scrape Google Places data
 * for the business and its competitors.
 */

import { ApifyClient } from 'apify-client'
import type { CompetitorPlaceInsight, CompetitorReview } from '@/lib/places/competitors'

const APIFY_ACTOR_ID = 'nwua9Gu5YrADL7ZDj'

export interface ApifyPlaceData {
  placeId: string
  title?: string
  address?: string
  categories?: string[]
  totalScore?: number | null
  reviewsCount?: number | null
  reviewsDistribution?: {
    oneStar?: number
    twoStar?: number
    threeStar?: number
    fourStar?: number
    fiveStar?: number
  }
  imageUrl?: string | null
  inputPlaceId?: string
}

export interface ApifyScrapeResult {
  places: CompetitorPlaceInsight[]
  rawItems: any[] // Full raw items from Apify for storage
}

/**
 * Run Apify actor for a list of place IDs
 * 
 * @param placeIds - Array of Google Place IDs to scrape (first should be anchor/self)
 * @param anchorPlaceId - The anchor place ID (to mark as isSelf)
 * @returns Scraped place data
 */
export async function runApifyForPlaceIds(
  placeIds: string[],
  anchorPlaceId: string
): Promise<ApifyScrapeResult> {
  console.log('[Apify Competitors] Starting Apify scrape:', {
    placeIdsCount: placeIds.length,
    anchorPlaceId,
    placeIds: placeIds.slice(0, 3), // Log first 3 for debugging
  })

  const apiToken = process.env.APIFY_API_TOKEN
  if (!apiToken) {
    throw new Error('APIFY_API_TOKEN environment variable is not set')
  }

  const client = new ApifyClient({ token: apiToken })

  // Prepare actor input
  const actorInput = {
    placeIds: placeIds,
    maxReviews: 150,
    maxImages: 5,
    maxCrawledPlacesPerSearch: placeIds.length,
    // Add any other required parameters based on the actor's documentation
  }

  console.log('[Apify Competitors] Actor input prepared:', {
    placeIdsCount: actorInput.placeIds.length,
    maxReviews: actorInput.maxReviews,
    maxImages: actorInput.maxImages,
  })

  try {
    // Run the actor
    console.log('[Apify Competitors] Starting actor run...')
    const run = await client.actor(APIFY_ACTOR_ID).call(actorInput)

    console.log('[Apify Competitors] Actor run completed:', {
      runId: run.id,
      status: run.status,
      defaultDatasetId: run.defaultDatasetId,
    })

    // Fetch dataset items
    const dataset = await client.dataset(run.defaultDatasetId).listItems()
    const items = dataset.items || []

    console.log('[Apify Competitors] Dataset items fetched:', {
      itemCount: items.length,
      placeIds: placeIds,
    })

    // Map Apify items to CompetitorPlaceInsight
    const mappedPlaces: CompetitorPlaceInsight[] = items.map((item: any) => {
      const itemPlaceId = item.placeId || item.inputPlaceId || ''
      const isSelf = itemPlaceId === anchorPlaceId

      // Extract reviews distribution if available
      let reviewsDistribution: CompetitorPlaceInsight['reviewsDistribution'] | undefined
      if (item.reviewsDistribution) {
        reviewsDistribution = {
          oneStar: item.reviewsDistribution.oneStar || 0,
          twoStar: item.reviewsDistribution.twoStar || 0,
          threeStar: item.reviewsDistribution.threeStar || 0,
          fourStar: item.reviewsDistribution.fourStar || 0,
          fiveStar: item.reviewsDistribution.fiveStar || 0,
        }
      }

      // Extract individual reviews if available
      let reviews: CompetitorPlaceInsight['reviews'] | undefined
      
      // Check for reviews in various possible locations in the Apify response
      const reviewsData = item.reviews || item.reviewsList || item.reviewList || item.userReviews || []
      
      if (Array.isArray(reviewsData) && reviewsData.length > 0) {
        console.log('[Apify Competitors] Found reviews for place:', {
          placeId: itemPlaceId,
          reviewCount: reviewsData.length,
          firstReviewKeys: reviewsData[0] ? Object.keys(reviewsData[0]) : [],
        })
        
        reviews = reviewsData.map((review: any) => ({
          reviewId: review.reviewId || review.id || review.review_id || undefined,
          reviewerName: review.reviewerName || review.authorName || review.name || review.author || review.reviewer || undefined,
          reviewerPhotoUrl: review.reviewerPhotoUrl || review.authorPhotoUrl || review.photoUrl || review.photo || review.avatar || undefined,
          rating: review.rating || review.starRating || review.score || review.stars || 0,
          comment: review.comment || review.text || review.content || review.reviewText || review.message || undefined,
          date: review.date || review.createdAt || review.time || review.publishedAt || review.timestamp || undefined,
          relativeTime: review.relativeTime || review.timeDescription || review.timeAgo || undefined,
        })).filter((r: any) => r.rating > 0) // Only include reviews with valid ratings
        
        console.log('[Apify Competitors] Mapped reviews:', {
          placeId: itemPlaceId,
          mappedCount: reviews.length,
        })
      } else {
        // Log if we expected reviews but didn't find them
        if (item.reviewsCount > 0 || item.user_ratings_total > 0) {
          console.log('[Apify Competitors] Place has review count but no reviews array found:', {
            placeId: itemPlaceId,
            reviewsCount: item.reviewsCount || item.user_ratings_total,
            itemKeys: Object.keys(item),
            hasReviews: !!item.reviews,
            hasReviewsList: !!item.reviewsList,
            hasReviewList: !!item.reviewList,
            hasUserReviews: !!item.userReviews,
          })
        }
      }

      return {
        placeId: itemPlaceId,
        name: item.title || item.name || 'Unknown',
        address: item.address || undefined,
        categories: Array.isArray(item.categories) ? item.categories : undefined,
        rating: item.totalScore || item.rating || null,
        reviewsCount: item.reviewsCount || item.user_ratings_total || null,
        reviewsDistribution,
        reviews,
        imageUrl: item.imageUrl || item.photoUrl || null,
        isSelf,
      }
    })

    // Ensure anchor place is included (even if Apify didn't return it)
    const hasAnchor = mappedPlaces.some(p => p.placeId === anchorPlaceId)
    if (!hasAnchor && placeIds.includes(anchorPlaceId)) {
      console.log('[Apify Competitors] Anchor place not in results, adding placeholder')
      mappedPlaces.push({
        placeId: anchorPlaceId,
        name: 'Your Business',
        isSelf: true,
      })
    }

    console.log('[Apify Competitors] Mapped places:', {
      totalPlaces: mappedPlaces.length,
      selfPlace: mappedPlaces.find(p => p.isSelf),
      competitorCount: mappedPlaces.filter(p => !p.isSelf).length,
    })

    return {
      places: mappedPlaces,
      rawItems: items, // Return full raw items for storage
    }
  } catch (error: any) {
    console.error('[Apify Competitors] Apify scrape failed:', {
      message: error.message,
      stack: error.stack,
    })
    throw new Error(`Apify scrape failed: ${error.message || 'Unknown error'}`)
  }
}

