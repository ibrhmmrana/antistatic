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
type BusinessReviewSelect = Pick<BusinessReview, 'id' | 'review_id' | 'author_name' | 'published_at' | 'raw_payload' | 'review_text'>
type BusinessReviewUpdate = Database['public']['Tables']['business_reviews']['Update']

interface ApifyReview {
  reviewId?: string
  reviewerId?: string
  name?: string
  publishedAtDate?: string
  reviewImageUrls?: string[]
  text?: string // Add text for matching
}

/**
 * Extract reviews from Apify raw payload
 */
function extractApifyReviews(apifyRawPayload: any): ApifyReview[] {
  if (!apifyRawPayload) {
    console.log('[Extract Apify Reviews] Payload is null or undefined')
    return []
  }

  // Handle different payload structures
  // Apify can return: array of places, single place object, or nested structure
  let places: any[] = []
  
  if (Array.isArray(apifyRawPayload)) {
    // Direct array of places (this is the actual structure from Apify)
    places = apifyRawPayload
    console.log('[Extract Apify Reviews] Payload is array with', places.length, 'places')
    if (places.length > 0) {
      console.log('[Extract Apify Reviews] First place keys:', Object.keys(places[0]))
      if (places[0].reviews && Array.isArray(places[0].reviews)) {
        console.log('[Extract Apify Reviews] First place has', places[0].reviews.length, 'reviews')
      }
    }
  } else if (typeof apifyRawPayload === 'object' && apifyRawPayload !== null) {
    // Check if it's a single place object with reviews
    if (apifyRawPayload.reviews && Array.isArray(apifyRawPayload.reviews)) {
      // Single place object - wrap it in array
      places = [apifyRawPayload]
      console.log('[Extract Apify Reviews] Payload is single place object with', apifyRawPayload.reviews.length, 'reviews')
    } else if (apifyRawPayload.rawItems && Array.isArray(apifyRawPayload.rawItems)) {
      // Nested structure with rawItems
      places = apifyRawPayload.rawItems
      console.log('[Extract Apify Reviews] Payload has rawItems array with', places.length, 'places')
    } else if (apifyRawPayload.items && Array.isArray(apifyRawPayload.items)) {
      // Nested structure with items
      places = apifyRawPayload.items
      console.log('[Extract Apify Reviews] Payload has items array with', places.length, 'places')
    } else {
      // Try as single place
      places = [apifyRawPayload]
      console.log('[Extract Apify Reviews] Payload is object, treating as single place. Keys:', Object.keys(apifyRawPayload))
    }
  } else {
    console.log('[Extract Apify Reviews] Invalid payload type:', typeof apifyRawPayload, 'value:', apifyRawPayload)
    return []
  }
  
  console.log('[Extract Apify Reviews] Processing', places.length, 'places')
  
  const reviews: ApifyReview[] = []
  
  for (const place of places) {
    // Check for reviews in various possible locations
    const reviewsData = place.reviews || place.reviewsList || place.reviewList || place.userReviews || []
    
    if (Array.isArray(reviewsData) && reviewsData.length > 0) {
      console.log('[Extract Apify Reviews] Found', reviewsData.length, 'reviews in place:', {
        placeId: place.placeId || place.inputPlaceId,
        placeName: place.title || place.name,
      })
      
      for (const review of reviewsData) {
        // Check for reviewImageUrls in various possible formats
        let imageUrls: string[] | undefined = undefined
        
        // Try different possible field names (case-insensitive check)
        const reviewKeys = Object.keys(review)
        const imageKey = reviewKeys.find(key => 
          key.toLowerCase().includes('image') && 
          (key.toLowerCase().includes('url') || key.toLowerCase().includes('link'))
        )
        
        if (imageKey && Array.isArray(review[imageKey])) {
          imageUrls = review[imageKey]
          console.log('[Extract Apify Reviews] Found images using key:', imageKey, 'count:', imageUrls.length)
        } else if (review.reviewImageUrls && Array.isArray(review.reviewImageUrls)) {
          imageUrls = review.reviewImageUrls
        } else if (review.reviewImageURLs && Array.isArray(review.reviewImageURLs)) {
          imageUrls = review.reviewImageURLs
        } else if (review.review_image_urls && Array.isArray(review.review_image_urls)) {
          imageUrls = review.review_image_urls
        } else if (review.images && Array.isArray(review.images)) {
          imageUrls = review.images
        } else if (review.imageUrls && Array.isArray(review.imageUrls)) {
          imageUrls = review.imageUrls
        }
        
        // Log review structure for debugging (only for first few reviews to avoid spam)
        if (reviews.length < 3 && Object.keys(review).length > 0) {
          console.log('[Extract Apify Reviews] Review keys:', reviewKeys)
          console.log('[Extract Apify Reviews] Review sample:', {
            reviewId: review.reviewId || review.review_id || review.id,
            hasImages: !!imageUrls,
            imageCount: imageUrls?.length || 0,
            imageKey: imageKey || 'not found',
          })
        }
        
        // Only include reviews that have images
        if (imageUrls && imageUrls.length > 0) {
          reviews.push({
            reviewId: review.reviewId || review.review_id || review.id,
            reviewerId: review.reviewerId || review.reviewer_id,
            name: review.name || review.reviewerName || review.authorName || review.author,
            publishedAtDate: review.publishedAtDate || review.published_at_date || review.publishedAt || review.date,
            reviewImageUrls: imageUrls,
            text: review.text || review.comment || review.reviewText || review.message,
          })
        }
      }
    } else {
      // Log if we expected reviews but didn't find them
      if (place.reviewsCount > 0 || place.user_ratings_total > 0) {
        console.log('[Extract Apify Reviews] Place has review count but no reviews array found:', {
          placeId: place.placeId || place.inputPlaceId,
          reviewsCount: place.reviewsCount,
          user_ratings_total: place.user_ratings_total,
          placeKeys: Object.keys(place),
        })
      }
    }
  }

  console.log('[Extract Apify Reviews] Extracted', reviews.length, 'reviews with images')
  if (reviews.length > 0) {
    console.log('[Extract Apify Reviews] Sample extracted review:', {
      reviewId: reviews[0].reviewId,
      name: reviews[0].name,
      imageCount: reviews[0].reviewImageUrls?.length || 0,
      firstImage: reviews[0].reviewImageUrls?.[0],
    })
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
  gbpReview: { review_id: string | null; author_name: string | null; published_at: string | null; review_text?: string | null },
  apifyReviews: ApifyReview[]
): ApifyReview | null {
  // Strategy 1: Exact reviewId match (try multiple formats)
  if (gbpReview.review_id) {
    // Try exact match
    let match = apifyReviews.find(ar => ar.reviewId === gbpReview.review_id)
    if (match) {
      console.log('[Match Review] Found exact reviewId match:', gbpReview.review_id)
      return match
    }
    
    // Try partial match (reviewId might be just the ID part, not full path)
    const gbpReviewIdParts = gbpReview.review_id.split('/')
    const gbpReviewIdLast = gbpReviewIdParts[gbpReviewIdParts.length - 1]
    match = apifyReviews.find(ar => {
      if (!ar.reviewId) return false
      const apifyIdParts = ar.reviewId.split('/')
      const apifyIdLast = apifyIdParts[apifyIdParts.length - 1]
      return apifyIdLast === gbpReviewIdLast
    })
    if (match) {
      console.log('[Match Review] Found partial reviewId match:', gbpReview.review_id, '->', match.reviewId)
      return match
    }
  }

  // Strategy 2: Match by reviewer name + published date (same day, within reasonable time)
  if (gbpReview.author_name && gbpReview.published_at) {
    const gbpDate = new Date(gbpReview.published_at)
    const gbpDateStr = gbpDate.toISOString().split('T')[0] // YYYY-MM-DD
    const gbpTime = gbpDate.getTime()
    
    for (const apifyReview of apifyReviews) {
      if (apifyReview.name && apifyReview.publishedAtDate) {
        const apifyDate = new Date(apifyReview.publishedAtDate)
        const apifyDateStr = apifyDate.toISOString().split('T')[0]
        const apifyTime = apifyDate.getTime()
        
        // Match if same date (or within 1 day) and similar name
        const dateDiff = Math.abs(gbpTime - apifyTime)
        const oneDayMs = 24 * 60 * 60 * 1000
        
        if (apifyDateStr === gbpDateStr || dateDiff < oneDayMs) {
          // Normalize names: trim, lowercase, remove extra spaces
          const gbpName = gbpReview.author_name.trim().toLowerCase().replace(/\s+/g, ' ')
          const apifyName = apifyReview.name.trim().toLowerCase().replace(/\s+/g, ' ')
          
          // Exact match or one contains the other (handles variations)
          if (gbpName === apifyName || gbpName.includes(apifyName) || apifyName.includes(gbpName)) {
            console.log('[Match Review] Found name+date match:', {
              gbpName: gbpReview.author_name,
              apifyName: apifyReview.name,
              gbpDate: gbpDateStr,
              apifyDate: apifyDateStr,
              dateDiffHours: Math.round(dateDiff / (60 * 60 * 1000)),
            })
            return apifyReview
          }
        }
      }
    }
  }

  // Strategy 3: Match by text content + name (fallback if IDs and name+date don't match)
  // This is useful when review IDs are different formats but text is identical
  if (gbpReview.review_text && gbpReview.author_name) {
    const gbpText = gbpReview.review_text.trim().toLowerCase().replace(/\s+/g, ' ')
    const gbpName = gbpReview.author_name.trim().toLowerCase().replace(/\s+/g, ' ')
    
    for (const apifyReview of apifyReviews) {
      if (apifyReview.text && apifyReview.name) {
        const apifyText = apifyReview.text.trim().toLowerCase().replace(/\s+/g, ' ')
        const apifyName = apifyReview.name.trim().toLowerCase().replace(/\s+/g, ' ')
        
        // Match if text is very similar (90%+ similarity) and names match
        // For now, use exact text match (can be improved with fuzzy matching later)
        if (gbpText === apifyText && (gbpName === apifyName || gbpName.includes(apifyName) || apifyName.includes(gbpName))) {
          console.log('[Match Review] Found text+name match:', {
            gbpName: gbpReview.author_name,
            apifyName: apifyReview.name,
            textMatch: true,
            gbpTextLength: gbpText.length,
            apifyTextLength: apifyText.length,
            textMatches: gbpText === apifyText,
          })
          return apifyReview
        } else {
          // Log why it didn't match (only for first few attempts to avoid spam)
          if (gbpReview.review_id && gbpReview.review_id.includes('AbFvOqmaDMDI8CTPXGzer0Bx9ezg')) {
            console.log('[Match Review] Text+name match failed:', {
              gbpName: gbpReview.author_name,
              apifyName: apifyReview.name,
              nameMatches: gbpName === apifyName || gbpName.includes(apifyName) || apifyName.includes(gbpName),
              textMatches: gbpText === apifyText,
              gbpTextPreview: gbpText.substring(0, 50),
              apifyTextPreview: apifyText.substring(0, 50),
            })
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
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enrich-reviews-with-apify.ts:278',message:'Enrichment function called',data:{locationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  const supabase = await createClient()

  // Fetch Apify raw payload
  const { data: insights, error: insightsError } = await supabase
    .from('business_insights')
    .select('apify_raw_payload')
    .eq('location_id', locationId)
    .eq('source', 'google')
    .maybeSingle()

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enrich-reviews-with-apify.ts:289',message:'Apify payload fetch result',data:{hasInsights:!!insights,insightsError:insightsError?.message||null,hasApifyPayload:!!insights?.apify_raw_payload,payloadType:typeof insights?.apify_raw_payload,payloadIsArray:Array.isArray(insights?.apify_raw_payload)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  if (insightsError || !insights) {
    console.log('[Enrich Reviews] No Apify data found for location:', locationId)
    return { enriched: 0, errors: 0 }
  }

  const typedInsights = insights as BusinessInsightSelect
  const apifyRawPayload = typedInsights.apify_raw_payload as any
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enrich-reviews-with-apify.ts:295',message:'Apify payload value check',data:{apifyRawPayloadValue:apifyRawPayload,apifyRawPayloadType:typeof apifyRawPayload,isNull:apifyRawPayload===null,isUndefined:apifyRawPayload===undefined,isArray:Array.isArray(apifyRawPayload),isObject:typeof apifyRawPayload==='object',objectKeys:typeof apifyRawPayload==='object'&&apifyRawPayload!==null?Object.keys(apifyRawPayload):[],stringifiedPreview:typeof apifyRawPayload==='object'&&apifyRawPayload!==null?JSON.stringify(apifyRawPayload).substring(0,200):String(apifyRawPayload).substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  
  // Log payload structure for debugging
  console.log('[Enrich Reviews] Apify payload type:', typeof apifyRawPayload)
  console.log('[Enrich Reviews] Apify payload is null?', apifyRawPayload === null)
  console.log('[Enrich Reviews] Apify payload is undefined?', apifyRawPayload === undefined)
  
  if (!apifyRawPayload) {
    console.log('[Enrich Reviews] Apify payload is null or undefined, cannot enrich')
    console.log('[Enrich Reviews] WARNING: apify_raw_payload is null. This means Apify data was never stored or was cleared.')
    console.log('[Enrich Reviews] To fix this, you need to trigger a re-scrape by calling fetchGBPReviewsForLocation with forceRefresh=true')
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enrich-reviews-with-apify.ts:313',message:'Apify payload is null - cannot enrich',data:{locationId,hasInsights:!!insights,needsRescrape:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return { enriched: 0, errors: 0 }
  }
  
  // Check if it's an empty object
  if (typeof apifyRawPayload === 'object' && !Array.isArray(apifyRawPayload) && Object.keys(apifyRawPayload).length === 0) {
    console.log('[Enrich Reviews] Apify payload is an empty object, cannot enrich')
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enrich-reviews-with-apify.ts:318',message:'Empty object detected',data:{apifyRawPayload},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return { enriched: 0, errors: 0 }
  }
  
  if (Array.isArray(apifyRawPayload)) {
    console.log('[Enrich Reviews] Apify payload is array with', apifyRawPayload.length, 'items')
    if (apifyRawPayload.length > 0) {
      const firstItem = apifyRawPayload[0] || {}
      console.log('[Enrich Reviews] First item type:', typeof firstItem)
      console.log('[Enrich Reviews] First item keys:', Object.keys(firstItem))
      console.log('[Enrich Reviews] First item has reviews?', !!firstItem.reviews)
      console.log('[Enrich Reviews] First item reviews type:', typeof firstItem.reviews)
      console.log('[Enrich Reviews] First item reviews is array?', Array.isArray(firstItem.reviews))
      
      // Check if first item has reviews
      if (firstItem.reviews && Array.isArray(firstItem.reviews) && firstItem.reviews.length > 0) {
        console.log('[Enrich Reviews] First item has', firstItem.reviews.length, 'reviews')
        const firstReview = firstItem.reviews[0]
        console.log('[Enrich Reviews] First review keys:', Object.keys(firstReview))
        console.log('[Enrich Reviews] First review sample:', {
          reviewId: firstReview.reviewId || firstReview.review_id || firstReview.id,
          name: firstReview.name || firstReview.reviewerName,
          hasReviewImageUrls: !!firstReview.reviewImageUrls,
          reviewImageUrlsType: typeof firstReview.reviewImageUrls,
          reviewImageUrlsLength: Array.isArray(firstReview.reviewImageUrls) ? firstReview.reviewImageUrls.length : 'not array',
          reviewImageUrlsValue: firstReview.reviewImageUrls ? (Array.isArray(firstReview.reviewImageUrls) ? firstReview.reviewImageUrls.slice(0, 2) : firstReview.reviewImageUrls) : null,
          allKeys: Object.keys(firstReview),
        })
      } else {
        console.log('[Enrich Reviews] First item does NOT have reviews array or reviews array is empty')
      }
    } else {
      console.log('[Enrich Reviews] Apify payload array is empty')
    }
  } else if (typeof apifyRawPayload === 'object') {
    console.log('[Enrich Reviews] Apify payload is object with keys:', Object.keys(apifyRawPayload))
    console.log('[Enrich Reviews] Apify payload object stringified (first 500 chars):', JSON.stringify(apifyRawPayload).substring(0, 500))
  } else {
    console.log('[Enrich Reviews] Apify payload is unexpected type:', typeof apifyRawPayload)
    return { enriched: 0, errors: 0 }
  }
  
  const apifyReviews = extractApifyReviews(apifyRawPayload)
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enrich-reviews-with-apify.ts:336',message:'Extracted Apify reviews',data:{apifyReviewsCount:apifyReviews.length,apifyReviewsWithImages:apifyReviews.filter(r=>r.reviewImageUrls&&r.reviewImageUrls.length>0).length,firstReviewSample:apifyReviews[0]?{reviewId:apifyReviews[0].reviewId,name:apifyReviews[0].name,imageCount:apifyReviews[0].reviewImageUrls?.length||0}:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  if (apifyReviews.length === 0) {
    console.log('[Enrich Reviews] No reviews with images found in Apify data')
    return { enriched: 0, errors: 0 }
  }

  console.log('[Enrich Reviews] Found', apifyReviews.length, 'Apify reviews with images')
  // Log sample review for debugging
  if (apifyReviews.length > 0) {
    console.log('[Enrich Reviews] Sample Apify review:', {
      reviewId: apifyReviews[0].reviewId,
      name: apifyReviews[0].name,
      imageCount: apifyReviews[0].reviewImageUrls?.length || 0,
      firstImageUrl: apifyReviews[0].reviewImageUrls?.[0],
    })
  }

  // Fetch all GBP reviews for this location (include review_text for text matching)
  const { data: gbpReviews, error: reviewsError } = await supabase
    .from('business_reviews')
    .select('id, review_id, author_name, published_at, raw_payload, review_text')
    .eq('location_id', locationId)
    .eq('source', 'gbp')

  if (reviewsError || !gbpReviews || gbpReviews.length === 0) {
    console.log('[Enrich Reviews] No GBP reviews found')
    return { enriched: 0, errors: 0 }
  }

  const typedGbpReviews = gbpReviews as BusinessReviewSelect[]
  console.log('[Enrich Reviews] Found', typedGbpReviews.length, 'GBP reviews to enrich')
  if (typedGbpReviews.length > 0) {
    console.log('[Enrich Reviews] Sample GBP review:', {
      reviewId: typedGbpReviews[0]?.review_id,
      authorName: typedGbpReviews[0]?.author_name,
      publishedAt: typedGbpReviews[0]?.published_at,
    })
  }
  
  // Log sample Apify reviews for comparison
  if (apifyReviews.length > 0) {
    console.log('[Enrich Reviews] Sample Apify reviews for matching:', apifyReviews.slice(0, 3).map(r => ({
      reviewId: r.reviewId,
      name: r.name,
      publishedAtDate: r.publishedAtDate,
      imageCount: r.reviewImageUrls?.length || 0,
    })))
  }

  // Match and enrich reviews
  let enriched = 0
  let errors = 0
  let matchedCount = 0
  let noMatchCount = 0

  for (const gbpReview of typedGbpReviews) {
    // Special logging for the specific review we're debugging
    const isTargetReview = gbpReview.review_id?.includes('AbFvOqmaDMDI8CTPXGzer0Bx9ezg')
    if (isTargetReview) {
      console.log('[Enrich Reviews] Processing target review:', {
        reviewId: gbpReview.review_id,
        authorName: gbpReview.author_name,
        publishedAt: gbpReview.published_at,
        reviewText: gbpReview.review_text?.substring(0, 100),
        reviewTextLength: gbpReview.review_text?.length,
        availableApifyReviews: apifyReviews.length,
        apifyReviewSamples: apifyReviews.slice(0, 2).map(r => ({
          reviewId: r.reviewId,
          name: r.name,
          textLength: r.text?.length,
          textPreview: r.text?.substring(0, 100),
          imageCount: r.reviewImageUrls?.length || 0,
        })),
      })
    }
    
    const match = matchReview(
      {
        review_id: gbpReview.review_id,
        author_name: gbpReview.author_name,
        published_at: gbpReview.published_at,
        review_text: gbpReview.review_text,
      },
      apifyReviews
    )
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enrich-reviews-with-apify.ts:420',message:'Match attempt result',data:{gbpReviewId:gbpReview.review_id,gbpAuthor:gbpReview.author_name,gbpTextPreview:gbpReview.review_text?.substring(0,50),matchFound:!!match,matchReviewId:match?.reviewId,matchImageCount:match?.reviewImageUrls?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    if (match) {
      matchedCount++
      console.log('[Enrich Reviews] Matched review:', {
        gbpReviewId: gbpReview.review_id,
        gbpAuthor: gbpReview.author_name,
        gbpPublishedAt: gbpReview.published_at,
        apifyReviewId: match.reviewId,
        apifyName: match.name,
        apifyPublishedAt: match.publishedAtDate,
        imageCount: match.reviewImageUrls?.length || 0,
        firstImage: match.reviewImageUrls?.[0],
      })
    } else {
      noMatchCount++
      // Log first few unmatched reviews for debugging
      if (noMatchCount <= 3) {
        console.log('[Enrich Reviews] No match found for review:', {
          gbpReviewId: gbpReview.review_id,
          gbpAuthor: gbpReview.author_name,
          gbpPublishedAt: gbpReview.published_at,
          availableApifyReviewIds: apifyReviews.slice(0, 3).map(r => r.reviewId),
          availableApifyNames: apifyReviews.slice(0, 3).map(r => r.name),
        })
      }
    }

    if (match && match.reviewImageUrls && match.reviewImageUrls.length > 0) {
      // Check if images already exist in raw_payload
      const currentPayload = (gbpReview.raw_payload as any) || {}
      const currentImages = currentPayload.images || []

      console.log('[Enrich Reviews] Preparing to update review:', {
        reviewId: gbpReview.id,
        gbpReviewId: gbpReview.review_id,
        currentImagesCount: currentImages.length,
        newImagesCount: match.reviewImageUrls.length,
        newImages: match.reviewImageUrls.slice(0, 2), // Log first 2 images
      })

      // Always update if we have images from Apify (even if images already exist, in case they changed)
      const updatedPayload: BusinessReviewUpdate = {
        raw_payload: {
          ...currentPayload,
          images: match.reviewImageUrls,
          apifyEnrichedAt: new Date().toISOString(),
        },
      }

      // #region agent log
      const payloadImages = (updatedPayload.raw_payload as any)?.images || []
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enrich-reviews-with-apify.ts:480',message:'Before database update',data:{reviewId:gbpReview.id,gbpReviewId:gbpReview.review_id,imagesToSave:match.reviewImageUrls.length,updatedPayloadImages:Array.isArray(payloadImages)?payloadImages.length:0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      const { error: updateError, data: updatedData } = await (supabase as any)
        .from('business_reviews')
        .update(updatedPayload)
        .eq('id', gbpReview.id)
        .select('raw_payload')
        .single()

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'enrich-reviews-with-apify.ts:487',message:'After database update',data:{reviewId:gbpReview.id,updateError:updateError?.message||null,updatedDataExists:!!updatedData,verifiedImagesCount:updatedData?.raw_payload?.images?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion

      if (updateError) {
        console.error('[Enrich Reviews] Failed to update review:', gbpReview.id, updateError)
        errors++
      } else {
        enriched++
        // Verify the update worked
        const verifyPayload = updatedData?.raw_payload as any
        const verifyImages = verifyPayload?.images || []
        console.log('[Enrich Reviews] Successfully enriched review:', {
          reviewId: gbpReview.id,
          gbpReviewId: gbpReview.review_id,
          imageCount: match.reviewImageUrls.length,
          verifiedImageCount: verifyImages.length,
          verifiedImages: verifyImages.slice(0, 2), // Log first 2 images
        })
        
        if (verifyImages.length === 0) {
          console.error('[Enrich Reviews] WARNING: Images were not saved correctly!', {
            reviewId: gbpReview.id,
            attemptedImages: match.reviewImageUrls.length,
            savedPayload: JSON.stringify(verifyPayload).substring(0, 300),
          })
        }
      }
    }
  }

  console.log('[Enrich Reviews] Enrichment complete:', { 
    enriched, 
    errors, 
    total: typedGbpReviews.length,
    matched: matchedCount,
    noMatch: noMatchCount,
    apifyReviewsWithImages: apifyReviews.length,
  })
  
  // Log a summary of what happened
  if (enriched === 0 && apifyReviews.length > 0) {
    console.log('[Enrich Reviews] WARNING: No reviews were enriched despite having', apifyReviews.length, 'Apify reviews with images')
    console.log('[Enrich Reviews] This suggests a matching issue. Check the logs above for match failures.')
  } else if (enriched === 0 && apifyReviews.length === 0) {
    console.log('[Enrich Reviews] No Apify reviews with images were found in the payload')
  } else if (enriched > 0) {
    console.log('[Enrich Reviews] SUCCESS: Enriched', enriched, 'reviews with images')
  }
  
  return { enriched, errors }
}

