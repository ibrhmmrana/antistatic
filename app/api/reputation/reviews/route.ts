import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/database.types'
import { enrichReviewsWithApifyImages } from '@/lib/reputation/enrich-reviews-with-apify'

type BusinessReview = Database['public']['Tables']['business_reviews']['Row']
type BusinessReviewSelect = Pick<BusinessReview, 'id' | 'rating' | 'author_name' | 'author_photo_url' | 'review_text' | 'published_at' | 'source' | 'raw_payload' | 'review_id'>

type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<BusinessLocation, 'google_location_name'>

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
    const locationId = searchParams.get('locationId')

    if (!locationId) {
      return NextResponse.json({ error: 'locationId is required' }, { status: 400 })
    }

    // Fetch reviews from database
    const reviewsResult = await supabase
      .from('business_reviews')
      .select('id, rating, author_name, author_photo_url, review_text, published_at, source, raw_payload, review_id')
      .eq('location_id', locationId)
      .eq('source', 'gbp')
      .order('published_at', { ascending: false })
      .limit(100)

    const reviews = reviewsResult.data as BusinessReviewSelect[] | null

    // Fetch location to get google_location_name for constructing review names
    const { data: location } = await supabase
      .from('business_locations')
      .select('google_location_name')
      .eq('id', locationId)
      .maybeSingle()

    const typedLocation = location as BusinessLocationSelect | null
    let typedReviews = reviews || []

    // Enrich reviews with images from Apify if we have Apify data
    // This ensures images are added even if enrichment didn't run during onboarding
    try {
      // Check if apify_raw_payload exists before attempting enrichment
      const { data: insightsCheck } = await supabase
        .from('business_insights')
        .select('apify_raw_payload')
        .eq('location_id', locationId)
        .eq('source', 'google')
        .maybeSingle()
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'reviews/route.ts:54',message:'Pre-enrichment check',data:{hasInsights:!!insightsCheck,hasApifyPayload:!!insightsCheck?.apify_raw_payload,payloadIsNull:insightsCheck?.apify_raw_payload===null,payloadType:typeof insightsCheck?.apify_raw_payload,payloadIsArray:Array.isArray(insightsCheck?.apify_raw_payload)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Note: If payload is null, enrichment will gracefully handle it and return { enriched: 0, errors: 0 }
      // No need to trigger re-scrape here - payload should already exist from onboarding
      
      const enrichmentResult = await enrichReviewsWithApifyImages(locationId)
      console.log('[Reviews API] Enrichment result:', enrichmentResult)
      
      // Always re-fetch reviews after enrichment attempt to get any updated images
      // (even if enriched count is 0, there might have been matches that didn't update)
      const updatedReviewsResult = await supabase
        .from('business_reviews')
        .select('id, rating, author_name, author_photo_url, review_text, published_at, source, raw_payload, review_id')
        .eq('location_id', locationId)
        .eq('source', 'gbp')
        .order('published_at', { ascending: false })
        .limit(100)
      
      if (updatedReviewsResult.data) {
        // Use updated reviews
        typedReviews = updatedReviewsResult.data as BusinessReviewSelect[]
        console.log('[Reviews API] Re-fetched', typedReviews.length, 'reviews after enrichment')
        // #region agent log
        const sampleReview = typedReviews.find(r=>r.review_id?.includes('AbFvOqmaDMDI8CTPXGzer0Bx9ezg'))
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'reviews/route.ts:70',message:'After re-fetch reviews',data:{totalReviews:typedReviews.length,targetReviewFound:!!sampleReview,targetReviewRawPayload:sampleReview?.raw_payload?JSON.stringify(sampleReview.raw_payload).substring(0,200):null,targetReviewImages:((sampleReview?.raw_payload as any)?.images||[]).length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
      }
    } catch (enrichError: any) {
      console.error('[Reviews API] Failed to enrich reviews with Apify images:', enrichError)
      // Don't throw - continue with existing reviews even if enrichment fails
    }

    // Transform to match frontend interface
    // For MVP, we'll infer sentiment and categories from rating and text
    const transformedReviews = typedReviews.map((review) => {
      // Simple sentiment inference based on rating
      let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral'
      if (review.rating && review.rating >= 4) sentiment = 'positive'
      else if (review.rating && review.rating <= 2) sentiment = 'negative'

      // Simple category inference (in production, use AI/NLP)
      const categories: string[] = []
      const textLower = (review.review_text || '').toLowerCase()
      if (textLower.includes('service') || textLower.includes('staff') || textLower.includes('employee')) {
        categories.push('service')
      }
      if (textLower.includes('price') || textLower.includes('cost') || textLower.includes('expensive') || textLower.includes('cheap')) {
        categories.push('pricing')
      }
      if (textLower.includes('food') || textLower.includes('meal') || textLower.includes('dish')) {
        categories.push('food')
      }
      if (textLower.includes('clean') || textLower.includes('dirty') || textLower.includes('hygiene')) {
        categories.push('cleanliness')
      }
      if (textLower.includes('wait') || textLower.includes('slow') || textLower.includes('fast')) {
        categories.push('speed')
      }
      if (categories.length === 0) {
        categories.push('general')
      }

      // Extract images and review name from raw_payload
      let reviewImages: string[] = []
      let reviewName: string | null = null
      if (review.raw_payload && typeof review.raw_payload === 'object') {
        const payload = review.raw_payload as any
        // #region agent log
        if(review.review_id?.includes('AbFvOqmaDMDI8CTPXGzer0Bx9ezg')){
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'reviews/route.ts:111',message:'Reading images from raw_payload',data:{reviewId:review.review_id,rawPayloadType:typeof review.raw_payload,payloadKeys:Object.keys(payload),hasImagesKey:'images' in payload,imagesValue:payload.images,imagesIsArray:Array.isArray(payload.images),imagesLength:Array.isArray(payload.images)?payload.images.length:0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        }
        // #endregion
        if (payload.images && Array.isArray(payload.images)) {
          reviewImages = payload.images
        }
        if (payload.name && typeof payload.name === 'string') {
          reviewName = payload.name
        }
        
        // Debug logging for reviews with missing images
        if (reviewImages.length === 0 && review.review_id) {
          console.log('[Reviews API] Review has no images:', {
            reviewId: review.review_id,
            authorName: review.author_name,
            payloadKeys: Object.keys(payload),
            hasImagesKey: 'images' in payload,
            imagesValue: payload.images,
            fullPayload: JSON.stringify(payload).substring(0, 500), // Log first 500 chars of payload
          })
        } else if (reviewImages.length > 0) {
          console.log('[Reviews API] Review HAS images:', {
            reviewId: review.review_id,
            imageCount: reviewImages.length,
            firstImage: reviewImages[0],
          })
        }
      }

      // Fallback: Construct review name from google_location_name + review_id if missing
      if (!reviewName && review.review_id) {
        // Check if review_id is already a full review name path
        if (review.review_id.match(/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/)) {
          reviewName = review.review_id
        } else if (typedLocation?.google_location_name) {
          // Validate google_location_name format: "accounts/123/locations/456"
          const locationNameMatch = typedLocation.google_location_name.match(/^accounts\/[^/]+\/locations\/[^/]+$/)
          if (locationNameMatch) {
            // review name format: "accounts/123/locations/456/reviews/789"
            // Extract review_id (might be just the ID or partial path)
            let reviewId = review.review_id
            if (reviewId.includes('/')) {
              // If review_id contains slashes, extract the last segment
              reviewId = reviewId.split('/').pop() || reviewId
            }
            // Clean reviewId - remove any whitespace or invalid characters
            reviewId = reviewId.trim()
            if (reviewId && reviewId.length > 0) {
              reviewName = `${typedLocation.google_location_name}/reviews/${reviewId}`
              console.log('[Reviews API] Constructed reviewName:', {
                reviewId: review.review_id,
                extractedReviewId: reviewId,
                googleLocationName: typedLocation.google_location_name,
                constructedReviewName: reviewName,
              })
            } else {
              console.warn('[Reviews API] Cannot construct reviewName: reviewId is empty after processing', {
                originalReviewId: review.review_id,
              })
            }
          } else {
            console.warn('[Reviews API] Cannot construct reviewName: invalid google_location_name format', {
              googleLocationName: typedLocation.google_location_name,
              reviewId: review.review_id,
            })
          }
        } else {
          console.warn('[Reviews API] Cannot construct reviewName: missing google_location_name', {
            reviewId: review.review_id,
            hasLocation: !!typedLocation,
            hasGoogleLocationName: !!typedLocation?.google_location_name,
          })
        }
      } else if (!reviewName) {
        console.warn('[Reviews API] Cannot construct reviewName: missing review_id', {
          reviewId: review.review_id,
        })
      }

      // Check if review has a reply (from raw_payload.reply or separate field)
      let replied = false
      let replyData: { comment: string; updateTime?: string } | null = null
      if (review.raw_payload && typeof review.raw_payload === 'object') {
        const payload = review.raw_payload as any
        if (payload.reply) {
          // Check if reply has comment field (Google API format)
          if (payload.reply.comment) {
            replied = true
            replyData = {
              comment: payload.reply.comment,
              updateTime: payload.reply.updateTime || payload.reply.update_time,
            }
          }
        }
      }

      // Validate reviewName format before returning
      let finalReviewName: string | null = reviewName
      if (finalReviewName && !finalReviewName.match(/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/)) {
        console.error('[Reviews API] Invalid reviewName format constructed:', {
          reviewName: finalReviewName,
          reviewId: review.id,
        })
        // Don't return invalid reviewName - set to null so frontend shows error
        finalReviewName = null
      }

      return {
        id: review.id,
        rating: review.rating || 0,
        authorName: review.author_name || 'Anonymous',
        authorPhotoUrl: review.author_photo_url || null,
        text: review.review_text || '',
        createTime: review.published_at || new Date().toISOString(),
        source: 'google' as const,
        replied,
        reply: replyData, // Include reply data if available
        sentiment,
        categories,
        images: reviewImages,
        reviewName: finalReviewName, // Full review name for API calls (e.g., "accounts/.../locations/.../reviews/...")
        reviewId: review.review_id || null, // Google review ID for fallback construction
      }
    })

    return NextResponse.json({ reviews: transformedReviews })
  } catch (error: any) {
    console.error('[Reviews API] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

