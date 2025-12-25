import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGBPAccessTokenForLocation, gbpApiRequest, getValidAccessToken } from '@/lib/gbp/client'
import { Database } from '@/lib/supabase/database.types'

type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<BusinessLocation, 'id' | 'user_id' | 'google_location_name'>

/**
 * POST /api/reputation/reviews/reply
 * 
 * Post a reply to a Google Business Profile review
 * 
 * Request body:
 * {
 *   reviewName: string, // Full review name: "accounts/.../locations/.../reviews/..."
 *   comment: string,   // Reply text
 *   businessLocationId: string // Antistatic business location ID
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    let { reviewName, comment, businessLocationId, reviewId } = body

    // Validate input
    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      return NextResponse.json({ error: 'comment is required and cannot be empty' }, { status: 400 })
    }

    if (!businessLocationId || typeof businessLocationId !== 'string') {
      return NextResponse.json({ error: 'businessLocationId is required' }, { status: 400 })
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

    // Get access token and account name first (needed for fetching reviews if reviewName is missing)
    console.log('[Reply API] Getting access token for location:', businessLocationId)
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
      console.error('[Reply API] Failed to get access token:', tokenError)
      
      // Check if it's a token/scope issue
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

    // If reviewName is missing, try to construct it or fetch it from Google
    if (!reviewName || typeof reviewName !== 'string') {
      console.log('[Reply API] reviewName missing, attempting to construct or fetch it', {
        hasReviewId: !!reviewId,
        hasGoogleLocationName: !!typedLocation.google_location_name,
      })

      // Try to construct from google_location_name + reviewId
      if (reviewId && typedLocation.google_location_name) {
        const locationNameMatch = typedLocation.google_location_name.match(/^accounts\/[^/]+\/locations\/[^/]+$/)
        if (locationNameMatch) {
          // Extract reviewId if it's a full path
          let extractedReviewId = reviewId
          if (extractedReviewId.includes('/')) {
            extractedReviewId = extractedReviewId.split('/').pop() || extractedReviewId
          }
          extractedReviewId = extractedReviewId.trim()
          if (extractedReviewId && extractedReviewId.length > 0) {
            reviewName = `${typedLocation.google_location_name}/reviews/${extractedReviewId}`
            console.log('[Reply API] Constructed reviewName:', reviewName)
          }
        }
      }

      // If still missing, fetch reviews from Google and find the matching one
      if (!reviewName && reviewId && typedLocation.google_location_name && accessToken && accountName) {
        try {
          console.log('[Reply API] Fetching reviews from Google to find review name')
          const locationName = typedLocation.google_location_name
          
          // Build reviews URL
          let reviewsPath: string
          if (locationName.startsWith(accountName)) {
            reviewsPath = `${locationName}/reviews`
          } else {
            reviewsPath = `${accountName}/${locationName}/reviews`
          }
          const reviewsUrl = `https://mybusiness.googleapis.com/v4/${reviewsPath}`
          
          const reviewsResponse = await fetch(reviewsUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          })

          if (reviewsResponse.ok) {
            const reviewsData = await reviewsResponse.json()
            const reviews = reviewsData.reviews || []
            
            // Find review by reviewId
            // Normalize reviewId for comparison (remove any path prefixes)
            const normalizedSearchReviewId = reviewId.includes('/') 
              ? reviewId.split('/').pop()?.trim() 
              : reviewId.trim()
            
            const matchingReview = reviews.find((r: any) => {
              // Check reviewId field
              const rReviewId = r.reviewId ? r.reviewId.trim() : null
              if (rReviewId === normalizedSearchReviewId) return true
              
              // Check name field (extract ID from full path)
              if (r.name) {
                const rNameId = r.name.split('/').pop()?.trim()
                if (rNameId === normalizedSearchReviewId) return true
                // Also check if the full name matches
                if (r.name === reviewId || r.name.includes(normalizedSearchReviewId || '')) return true
              }
              
              return false
            })

            if (matchingReview && matchingReview.name) {
              reviewName = matchingReview.name
              console.log('[Reply API] Found review name from Google API:', reviewName)
            } else {
              console.warn('[Reply API] Review not found in Google API response', {
                reviewId,
                reviewsCount: reviews.length,
                reviewIds: reviews.map((r: any) => r.reviewId || r.name?.split('/').pop()),
              })
            }
          } else {
            console.error('[Reply API] Failed to fetch reviews from Google:', reviewsResponse.status)
          }
        } catch (fetchError: any) {
          console.error('[Reply API] Error fetching reviews from Google:', fetchError)
        }
      }

      // If still missing after all attempts
      if (!reviewName) {
        console.error('[Reply API] Failed to get reviewName after all attempts', {
          hasReviewId: !!reviewId,
          reviewId: reviewId?.substring(0, 50),
          hasGoogleLocationName: !!typedLocation.google_location_name,
          googleLocationName: typedLocation.google_location_name?.substring(0, 50),
          hasAccessToken: !!accessToken,
          hasAccountName: !!accountName,
        })
        return NextResponse.json(
          { 
            error: 'Review identifier missing. Please refresh the reviews page to update review data, then try again.',
            code: 'REVIEW_NAME_MISSING',
          },
          { status: 400 }
        )
      }
    }

    // Validate review name format
    const reviewNamePattern = /^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/
    if (!reviewName.match(reviewNamePattern)) {
      console.error('[Reply API] Invalid reviewName format:', {
        reviewName,
        length: reviewName.length,
        hasAccounts: reviewName.includes('accounts/'),
        hasLocations: reviewName.includes('/locations/'),
        hasReviews: reviewName.includes('/reviews/'),
      })
      return NextResponse.json(
        { 
          error: 'Invalid reviewName format. Expected: accounts/.../locations/.../reviews/...',
          received: reviewName.substring(0, 100), // Log first 100 chars for debugging
        },
        { status: 400 }
      )
    }

    // Call Google Business Profile API to post reply
    console.log('[Reply API] Posting reply to Google:', { reviewName, commentLength: comment.length })
    
    try {
      // Use the full review name path (it already includes the base path)
      // Google API accepts both { comment: ... } and { reply: { comment: ... } } formats
      const replyResponse = await gbpApiRequest<{ reply: { comment: string; updateTime: string } }>(
        `/${reviewName}/reply`,
        user.id,
        businessLocationId,
        {
          method: 'PUT',
          body: JSON.stringify({ comment: comment.trim() }),
        },
        request.headers.get('origin') || undefined
      )

      console.log('[Reply API] Reply posted successfully:', JSON.stringify(replyResponse, null, 2))

      // Handle different response structures from Google API
      // The response might be: { reply: { comment, updateTime } } or just { comment, updateTime }
      const replyData = replyResponse.reply || replyResponse
      const replyComment = replyData.comment || comment.trim()
      const replyUpdateTime = replyData.updateTime || new Date().toISOString()

      if (!replyData) {
        console.error('[Reply API] Unexpected response structure:', replyResponse)
        throw new Error('Unexpected response format from Google API')
      }

      // Update the review in our database to mark it as replied
      // Extract review_id from reviewName (last segment)
      const reviewIdFromName = reviewName.split('/').pop()
      if (reviewIdFromName) {
        await (supabase as any)
          .from('business_reviews')
          .update({
            raw_payload: {
              reply: {
                comment: replyComment,
                updateTime: replyUpdateTime,
              },
            },
            updated_at: new Date().toISOString(),
          } as any)
          .eq('location_id', businessLocationId)
          .eq('source', 'gbp')
          .eq('review_id', reviewIdFromName)
      }

      return NextResponse.json({
        success: true,
        reply: {
          comment: replyComment,
          updateTime: replyUpdateTime,
        },
      })
    } catch (apiError: any) {
      console.error('[Reply API] Google API error:', apiError)
      
      const errorMessage = apiError.message || 'Failed to post reply to Google Business Profile'
      const statusCode = apiError.status || 500
      
      // Handle specific status codes
      if (statusCode === 403) {
        return NextResponse.json(
          {
            error: 'Permission denied. Please ensure your Google Business Profile location is verified and you have permission to reply to reviews.',
            code: 'PERMISSION_DENIED',
          },
          { status: 403 }
        )
      }

      if (statusCode === 404) {
        return NextResponse.json(
          {
            error: 'Review not found. The review may have been deleted.',
            code: 'REVIEW_NOT_FOUND',
          },
          { status: 404 }
        )
      }

      if (statusCode === 400) {
        return NextResponse.json(
          {
            error: 'Invalid request. Please check your reply text.',
            code: 'INVALID_REQUEST',
          },
          { status: 400 }
        )
      }

      return NextResponse.json(
        {
          error: errorMessage.replace('GBP API error: ', ''), // Remove prefix
          code: 'API_ERROR',
        },
        { status: statusCode }
      )
    }
  } catch (error: any) {
    console.error('[Reply API] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/reputation/reviews/reply
 * 
 * Update/edit a reply to a Google Business Profile review
 * 
 * Request body:
 * {
 *   reviewName: string, // Full review name: "accounts/.../locations/.../reviews/..."
 *   comment: string,   // Updated reply text
 *   businessLocationId: string // Antistatic business location ID
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    let { reviewName, comment, businessLocationId, reviewId } = body

    // Validate input
    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      return NextResponse.json({ error: 'comment is required and cannot be empty' }, { status: 400 })
    }

    if (!businessLocationId || typeof businessLocationId !== 'string') {
      return NextResponse.json({ error: 'businessLocationId is required' }, { status: 400 })
    }

    // Verify the business location belongs to the user
    const { data: location } = await supabase
      .from('business_locations')
      .select('id, user_id, google_location_name')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Business location not found or access denied' }, { status: 404 })
    }

    const typedLocation = location as BusinessLocationSelect

    // Get access token first (needed for fetching reviews if reviewName is missing)
    const tokenData = await getGBPAccessTokenForLocation(
      user.id,
      businessLocationId,
      request.headers.get('origin') || undefined
    )
    const accessToken = tokenData.accessToken
    const accountName = tokenData.accountName

    // If reviewName is missing, try to construct it or fetch it from Google
    if (!reviewName || typeof reviewName !== 'string') {
      console.log('[Reply API] reviewName missing in PUT, attempting to construct or fetch it', {
        hasReviewId: !!reviewId,
        hasGoogleLocationName: !!typedLocation.google_location_name,
      })

      // Try to construct from google_location_name + reviewId
      if (reviewId && typedLocation.google_location_name) {
        const locationNameMatch = typedLocation.google_location_name.match(/^accounts\/[^/]+\/locations\/[^/]+$/)
        if (locationNameMatch) {
          let extractedReviewId = reviewId
          if (extractedReviewId.includes('/')) {
            extractedReviewId = extractedReviewId.split('/').pop() || extractedReviewId
          }
          extractedReviewId = extractedReviewId.trim()
          if (extractedReviewId && extractedReviewId.length > 0) {
            reviewName = `${typedLocation.google_location_name}/reviews/${extractedReviewId}`
            console.log('[Reply API] Constructed reviewName in PUT:', reviewName)
          }
        }
      }

      // If still missing, fetch reviews from Google and find the matching one
      if (!reviewName && reviewId && typedLocation.google_location_name && accessToken && accountName) {
        try {
          console.log('[Reply API] Fetching reviews from Google to find review name (PUT)')
          const locationName = typedLocation.google_location_name
          
          let reviewsPath: string
          if (locationName.startsWith(accountName)) {
            reviewsPath = `${locationName}/reviews`
          } else {
            reviewsPath = `${accountName}/${locationName}/reviews`
          }
          const reviewsUrl = `https://mybusiness.googleapis.com/v4/${reviewsPath}`
          
          const reviewsResponse = await fetch(reviewsUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          })

          if (reviewsResponse.ok) {
            const reviewsData = await reviewsResponse.json()
            const reviews = reviewsData.reviews || []
            
            const normalizedSearchReviewId = reviewId.includes('/') 
              ? reviewId.split('/').pop()?.trim() 
              : reviewId.trim()
            
            const matchingReview = reviews.find((r: any) => {
              const rReviewId = r.reviewId ? r.reviewId.trim() : null
              if (rReviewId === normalizedSearchReviewId) return true
              
              if (r.name) {
                const rNameId = r.name.split('/').pop()?.trim()
                if (rNameId === normalizedSearchReviewId) return true
                if (r.name === reviewId || r.name.includes(normalizedSearchReviewId || '')) return true
              }
              
              return false
            })

            if (matchingReview && matchingReview.name) {
              reviewName = matchingReview.name
              console.log('[Reply API] Found review name from Google API (PUT):', reviewName)
            }
          }
        } catch (fetchError: any) {
          console.error('[Reply API] Error fetching reviews from Google (PUT):', fetchError)
        }
      }

      // If still missing after all attempts
      if (!reviewName) {
        return NextResponse.json(
          { 
            error: 'Review identifier missing. Please refresh the reviews page to update review data, then try again.',
            code: 'REVIEW_NAME_MISSING',
          },
          { status: 400 }
        )
      }
    }

    // Validate review name format
    const reviewNamePattern = /^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/
    if (!reviewName.match(reviewNamePattern)) {
      return NextResponse.json(
        { error: 'Invalid reviewName format. Expected: accounts/.../locations/.../reviews/...' },
        { status: 400 }
      )
    }

    // Call Google Business Profile API to update reply
    // Use PUT method (same as create, Google API uses PUT for both create and update)
    // According to Google API docs, PUT to /reply creates if doesn't exist, updates if it does
    console.log('[Reply API] Updating reply:', { 
      reviewName, 
      commentLength: comment.length,
      reviewNameFormat: reviewName?.match(/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/) ? 'valid' : 'invalid',
    })
    
    try {
      // Use PUT method - same as POST, Google API uses PUT for both create and update
      const replyResponse = await gbpApiRequest<{ reply: { comment: string; updateTime: string } }>(
        `/${reviewName}/reply`,
        user.id,
        businessLocationId,
        {
          method: 'PUT',
          body: JSON.stringify({ comment: comment.trim() }),
        },
        request.headers.get('origin') || undefined
      )

      console.log('[Reply API] Reply updated successfully:', JSON.stringify(replyResponse, null, 2))

      const replyData = replyResponse.reply || replyResponse
      const replyComment = replyData.comment || comment.trim()
      const replyUpdateTime = replyData.updateTime || new Date().toISOString()

      // Update the review in our database
      const reviewIdFromName = reviewName.split('/').pop()
      if (reviewIdFromName) {
        await (supabase as any)
          .from('business_reviews')
          .update({
            raw_payload: {
              reply: {
                comment: replyComment,
                updateTime: replyUpdateTime,
              },
            },
            updated_at: new Date().toISOString(),
          } as any)
          .eq('location_id', businessLocationId)
          .eq('source', 'gbp')
          .eq('review_id', reviewIdFromName)
      }

      return NextResponse.json({
        success: true,
        reply: {
          comment: replyComment,
          updateTime: replyUpdateTime,
        },
      })
    } catch (apiError: any) {
      console.error('[Reply API] Google API error (PUT/update):', {
        error: apiError.message,
        status: apiError.status,
        reviewName,
        reviewNameLength: reviewName?.length,
        reviewNameValid: reviewName?.match(/^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/) ? 'yes' : 'no',
      })
      
      const errorMessage = apiError.message || 'Failed to update reply'
      const statusCode = apiError.status || 500
      
      if (statusCode === 403) {
        return NextResponse.json(
          {
            error: 'Permission denied. Please ensure your location is verified.',
            code: 'PERMISSION_DENIED',
          },
          { status: 403 }
        )
      }

      if (statusCode === 404) {
        // 404 could mean the review doesn't exist, or the reply doesn't exist yet
        // For update, if reply doesn't exist, PUT should create it (same endpoint)
        // So 404 likely means the reviewName is wrong or the review was deleted
        return NextResponse.json(
          {
            error: 'Review or reply not found. The review may have been deleted, or the identifier is incorrect. Please refresh the page and try again.',
            code: 'NOT_FOUND',
          },
          { status: 404 }
        )
      }

      return NextResponse.json(
        {
          error: errorMessage.replace('GBP API error: ', ''),
          code: 'API_ERROR',
        },
        { status: statusCode }
      )
    }
  } catch (error: any) {
    console.error('[Reply API] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/reputation/reviews/reply
 * 
 * Delete a reply to a Google Business Profile review
 * 
 * Request body:
 * {
 *   reviewName: string, // Full review name: "accounts/.../locations/.../reviews/..."
 *   businessLocationId: string // Antistatic business location ID
 * }
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    let { reviewName, businessLocationId, reviewId } = body

    // Validate input
    if (!businessLocationId || typeof businessLocationId !== 'string') {
      return NextResponse.json({ error: 'businessLocationId is required' }, { status: 400 })
    }

    // Verify the business location belongs to the user
    const { data: location } = await supabase
      .from('business_locations')
      .select('id, user_id, google_location_name')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json({ error: 'Business location not found or access denied' }, { status: 404 })
    }

    const typedLocation = location as BusinessLocationSelect

    // Get access token first (needed for fetching reviews if reviewName is missing)
    const tokenData = await getGBPAccessTokenForLocation(
      user.id,
      businessLocationId,
      request.headers.get('origin') || undefined
    )
    const accessToken = tokenData.accessToken
    const accountName = tokenData.accountName

    // If reviewName is missing, try to construct it or fetch it from Google
    if (!reviewName || typeof reviewName !== 'string') {
      console.log('[Reply API] reviewName missing in DELETE, attempting to construct or fetch it', {
        hasReviewId: !!reviewId,
        hasGoogleLocationName: !!typedLocation.google_location_name,
      })

      // Try to construct from google_location_name + reviewId
      if (reviewId && typedLocation.google_location_name) {
        const locationNameMatch = typedLocation.google_location_name.match(/^accounts\/[^/]+\/locations\/[^/]+$/)
        if (locationNameMatch) {
          let extractedReviewId = reviewId
          if (extractedReviewId.includes('/')) {
            extractedReviewId = extractedReviewId.split('/').pop() || extractedReviewId
          }
          extractedReviewId = extractedReviewId.trim()
          if (extractedReviewId && extractedReviewId.length > 0) {
            reviewName = `${typedLocation.google_location_name}/reviews/${extractedReviewId}`
            console.log('[Reply API] Constructed reviewName in DELETE:', reviewName)
          }
        }
      }

      // If still missing, fetch reviews from Google and find the matching one
      if (!reviewName && reviewId && typedLocation.google_location_name && accessToken && accountName) {
        try {
          console.log('[Reply API] Fetching reviews from Google to find review name (DELETE)')
          const locationName = typedLocation.google_location_name
          
          let reviewsPath: string
          if (locationName.startsWith(accountName)) {
            reviewsPath = `${locationName}/reviews`
          } else {
            reviewsPath = `${accountName}/${locationName}/reviews`
          }
          const reviewsUrl = `https://mybusiness.googleapis.com/v4/${reviewsPath}`
          
          const reviewsResponse = await fetch(reviewsUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          })

          if (reviewsResponse.ok) {
            const reviewsData = await reviewsResponse.json()
            const reviews = reviewsData.reviews || []
            
            const normalizedSearchReviewId = reviewId.includes('/') 
              ? reviewId.split('/').pop()?.trim() 
              : reviewId.trim()
            
            const matchingReview = reviews.find((r: any) => {
              const rReviewId = r.reviewId ? r.reviewId.trim() : null
              if (rReviewId === normalizedSearchReviewId) return true
              
              if (r.name) {
                const rNameId = r.name.split('/').pop()?.trim()
                if (rNameId === normalizedSearchReviewId) return true
                if (r.name === reviewId || r.name.includes(normalizedSearchReviewId || '')) return true
              }
              
              return false
            })

            if (matchingReview && matchingReview.name) {
              reviewName = matchingReview.name
              console.log('[Reply API] Found review name from Google API (DELETE):', reviewName)
            }
          }
        } catch (fetchError: any) {
          console.error('[Reply API] Error fetching reviews from Google (DELETE):', fetchError)
        }
      }

      // If still missing after all attempts
      if (!reviewName) {
        return NextResponse.json(
          { 
            error: 'Review identifier missing. Please refresh the reviews page to update review data, then try again.',
            code: 'REVIEW_NAME_MISSING',
          },
          { status: 400 }
        )
      }
    }

    // Validate review name format
    const reviewNamePattern = /^accounts\/[^/]+\/locations\/[^/]+\/reviews\/[^/]+$/
    if (!reviewName.match(reviewNamePattern)) {
      return NextResponse.json(
        { error: 'Invalid reviewName format. Expected: accounts/.../locations/.../reviews/...' },
        { status: 400 }
      )
    }

    // Call Google Business Profile API to delete reply
    console.log('[Reply API] Deleting reply:', { reviewName })
    
    try {
      // DELETE requests may return 204 No Content, so handle empty responses
      const accessToken = await getValidAccessToken(user.id, businessLocationId, request.headers.get('origin') || undefined)
      const deleteUrl = `https://mybusiness.googleapis.com/v4/${reviewName}/reply`
      
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!deleteResponse.ok) {
        const error = await deleteResponse.json().catch(() => ({ error: 'Unknown error' }))
        const errorMessage = error.error?.message || JSON.stringify(error)
        const apiError: any = new Error(`GBP API error: ${errorMessage}`)
        apiError.status = deleteResponse.status
        apiError.message = errorMessage
        throw apiError
      }

      // DELETE may return 204 No Content, which is fine
      console.log('[Reply API] Reply deleted successfully')

      // Update the review in our database to remove reply
      const reviewIdFromName = reviewName.split('/').pop()
      if (reviewIdFromName) {
        await (supabase as any)
          .from('business_reviews')
          .update({
            raw_payload: {
              reply: null,
            },
            updated_at: new Date().toISOString(),
          } as any)
          .eq('location_id', businessLocationId)
          .eq('source', 'gbp')
          .eq('review_id', reviewIdFromName)
      }

      return NextResponse.json({
        success: true,
        message: 'Reply deleted successfully',
      })
    } catch (apiError: any) {
      console.error('[Reply API] Google API error:', apiError)
      
      const errorMessage = apiError.message || 'Failed to delete reply'
      const statusCode = apiError.status || 500
      
      if (statusCode === 403) {
        return NextResponse.json(
          {
            error: 'Permission denied. Please ensure your location is verified.',
            code: 'PERMISSION_DENIED',
          },
          { status: 403 }
        )
      }

      if (statusCode === 404) {
        return NextResponse.json(
          {
            error: 'Review or reply not found.',
            code: 'NOT_FOUND',
          },
          { status: 404 }
        )
      }

      return NextResponse.json(
        {
          error: errorMessage.replace('GBP API error: ', ''),
          code: 'API_ERROR',
        },
        { status: statusCode }
      )
    }
  } catch (error: any) {
    console.error('[Reply API] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
