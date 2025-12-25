import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/supabase/database.types'

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
    const typedReviews = reviews || []

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
        if (payload.images && Array.isArray(payload.images)) {
          reviewImages = payload.images
        }
        if (payload.name && typeof payload.name === 'string') {
          reviewName = payload.name
        }
      }

      // Fallback: Construct review name from google_location_name + review_id if missing
      if (!reviewName && review.review_id) {
        // Check if review_id is already a full review name path
        if (review.review_id.match(/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/)) {
          reviewName = review.review_id
        } else if (typedLocation?.google_location_name) {
          // google_location_name format: "accounts/123/locations/456"
          // review name format: "accounts/123/locations/456/reviews/789"
          // Extract review_id (might be just the ID or partial path)
          const reviewId = review.review_id.includes('/') 
            ? review.review_id.split('/').pop() 
            : review.review_id
          reviewName = `${typedLocation.google_location_name}/reviews/${reviewId}`
        }
      }

      // Check if review has a reply (from raw_payload.reply or separate field)
      let replied = false
      if (review.raw_payload && typeof review.raw_payload === 'object') {
        const payload = review.raw_payload as any
        replied = !!(payload.reply && payload.reply.comment)
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
        sentiment,
        categories,
        images: reviewImages,
        reviewName, // Full review name for API calls (e.g., "accounts/.../locations/.../reviews/...")
      }
    })

    return NextResponse.json({ reviews: transformedReviews })
  } catch (error: any) {
    console.error('[Reviews API] Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

