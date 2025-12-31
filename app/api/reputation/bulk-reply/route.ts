import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGBPAccessTokenForLocation, gbpApiRequest, getValidAccessToken } from '@/lib/gbp/client'
import { Database } from '@/lib/supabase/database.types'

type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<BusinessLocation, 'id' | 'user_id' | 'google_location_name'>
type BusinessReview = Database['public']['Tables']['business_reviews']['Row']
type BusinessReviewSelect = Pick<BusinessReview, 'raw_payload'>

interface BulkReplyRequest {
  businessLocationId: string
  reviews: Array<{
    reviewId: string
    reviewName?: string | null
    comment: string
  }>
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body: BulkReplyRequest = await request.json()
    const { businessLocationId, reviews } = body

    if (!businessLocationId || !reviews || !Array.isArray(reviews) || reviews.length === 0) {
      return NextResponse.json({ error: 'businessLocationId and reviews array are required' }, { status: 400 })
    }

    // Validate all reviews have comment
    if (reviews.some((r) => !r.comment || typeof r.comment !== 'string' || r.comment.trim().length === 0)) {
      return NextResponse.json({ error: 'All reviews must have a non-empty comment' }, { status: 400 })
    }

    // Verify the business location belongs to the user
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id, user_id, google_location_name')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (locationError || !location) {
      return NextResponse.json({ error: 'Business location not found or access denied' }, { status: 404 })
    }

    const typedLocation = location as BusinessLocationSelect

    // Get access token and account name
    console.log('[Bulk Reply API] Getting access token for location:', businessLocationId)
    let accessToken: string
    let accountName: string

    try {
      const tokenData = await getGBPAccessTokenForLocation(
        user.id,
        businessLocationId,
        request.headers.get('origin') || undefined
      )
      accessToken = tokenData.accessToken
      accountName = tokenData.accountName
    } catch (tokenError: any) {
      console.error('[Bulk Reply API] Failed to get access token:', tokenError)
      
      if (tokenError.message?.includes('refresh') || tokenError.message?.includes('reconnect')) {
        return NextResponse.json(
          {
            error: 'Google Business Profile connection expired. Please reconnect your account.',
            code: 'TOKEN_EXPIRED',
          },
          { status: 401 }
        )
      }

      return NextResponse.json(
        {
          error: tokenError.message || 'Failed to authenticate with Google Business Profile',
          code: 'AUTH_FAILED',
        },
        { status: 401 }
      )
    }

    const results: Array<{ reviewId: string; success: boolean; error?: string }> = []
    let successCount = 0
    let errorCount = 0

    // Post reply to each review
    for (const review of reviews) {
      try {
        let reviewName = review.reviewName

        // If reviewName is missing, try to construct it or fetch it from Google
        if (!reviewName || typeof reviewName !== 'string') {
          console.log('[Bulk Reply API] reviewName missing, attempting to construct or fetch it', {
            hasReviewId: !!review.reviewId,
            hasGoogleLocationName: !!typedLocation.google_location_name,
          })

          // Try to fetch from database first
          if (review.reviewId) {
            const { data: dbReview } = await supabase
              .from('business_reviews')
              .select('raw_payload')
              .eq('location_id', businessLocationId)
              .eq('review_id', review.reviewId)
              .maybeSingle()

            const typedDbReview = dbReview as BusinessReviewSelect | null

            if (typedDbReview?.raw_payload && typeof typedDbReview.raw_payload === 'object') {
              const payload = typedDbReview.raw_payload as any
              if (payload.name && typeof payload.name === 'string') {
                reviewName = payload.name
                console.log('[Bulk Reply API] Found reviewName in database:', reviewName)
              }
            }
          }

          // If still missing, try to construct it
          if (!reviewName && review.reviewId && typedLocation.google_location_name) {
            const locationNameMatch = typedLocation.google_location_name.match(/^accounts\/[^/]+\/locations\/[^/]+$/)
            if (locationNameMatch) {
              let reviewId = review.reviewId
              if (reviewId.includes('/')) {
                reviewId = reviewId.split('/').pop() || reviewId
              }
              reviewId = reviewId.trim()
              if (reviewId && reviewId.length > 0) {
                reviewName = `${typedLocation.google_location_name}/reviews/${reviewId}`
                console.log('[Bulk Reply API] Constructed reviewName:', reviewName)
              }
            }
          }

          // If still missing, try to fetch from Google API
          if (!reviewName && typedLocation.google_location_name) {
            try {
              const locationNameMatch = typedLocation.google_location_name.match(/^accounts\/[^/]+\/locations\/[^/]+$/)
              if (locationNameMatch) {
                const reviewsUrl = `https://mybusiness.googleapis.com/v4/${typedLocation.google_location_name}/reviews`
                const reviewsResponse = await fetch(reviewsUrl, {
                  method: 'GET',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                })

                if (reviewsResponse.ok) {
                  const reviewsData = await reviewsResponse.json()
                  const matchingReview = reviewsData.reviews?.find((r: any) => {
                    const rId = r.reviewId || r.name?.split('/').pop()
                    return rId === review.reviewId
                  })
                  if (matchingReview?.name) {
                    reviewName = matchingReview.name
                    console.log('[Bulk Reply API] Fetched reviewName from Google API:', reviewName)
                  }
                }
              }
            } catch (fetchError) {
              console.warn('[Bulk Reply API] Failed to fetch reviewName from Google API:', fetchError)
            }
          }
        }

        if (!reviewName) {
          throw new Error(`Could not determine reviewName for review ${review.reviewId}`)
        }

        // Validate reviewName format
        if (!reviewName.match(/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/)) {
          throw new Error(`Invalid reviewName format: ${reviewName}`)
        }

        // Post reply using GBP API
        const replyUrl = `https://mybusiness.googleapis.com/v4/${reviewName}/reply`
        const replyResponse = await fetch(replyUrl, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            comment: review.comment.trim(),
          }),
        })

        if (!replyResponse.ok) {
          const errorText = await replyResponse.text()
          let errorData
          try {
            errorData = JSON.parse(errorText)
          } catch {
            errorData = { error: errorText }
          }

          const errorMessage = errorData.error?.message || JSON.stringify(errorData)
          console.error('[Bulk Reply API] Failed to post reply:', {
            reviewName,
            status: replyResponse.status,
            error: errorMessage,
          })

          results.push({
            reviewId: review.reviewId,
            success: false,
            error: errorMessage,
          })
          errorCount++
          continue
        }

        // Update database to mark review as replied
        if (review.reviewId) {
          try {
            const { data: dbReview } = await supabase
              .from('business_reviews')
              .select('raw_payload')
              .eq('location_id', businessLocationId)
              .eq('review_id', review.reviewId)
              .maybeSingle()

            const typedDbReview = dbReview as BusinessReviewSelect | null

            if (typedDbReview) {
              const currentPayload = (typedDbReview.raw_payload as any) || {}
              const updatedPayload = {
                ...currentPayload,
                reply: {
                  comment: review.comment.trim(),
                  updateTime: new Date().toISOString(),
                },
              }

              await (supabase
                .from('business_reviews') as any)
                .update({ raw_payload: updatedPayload })
                .eq('location_id', businessLocationId)
                .eq('review_id', review.reviewId)
            }
          } catch (dbError) {
            console.warn('[Bulk Reply API] Failed to update database:', dbError)
            // Don't fail the whole operation if DB update fails
          }
        }

        results.push({
          reviewId: review.reviewId,
          success: true,
        })
        successCount++
      } catch (error: any) {
        console.error('[Bulk Reply API] Error processing review:', {
          reviewId: review.reviewId,
          error: error.message,
        })
        results.push({
          reviewId: review.reviewId,
          success: false,
          error: error.message || 'Unknown error',
        })
        errorCount++
      }
    }

    return NextResponse.json({
      success: true,
      successCount,
      errorCount,
      results,
    })
  } catch (error: any) {
    console.error('[Bulk Reply API] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

