import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { generateGBPWeaknessAnalysis } from '@/lib/ai/gpt'
import { GBPAnalysisInput } from '@/lib/ai/types'

/**
 * GET /api/locations/[locationId]/analysis/gbp
 * 
 * Generate weakness-focused GBP analysis comparing business to competitors
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { locationId: string } }
) {
  try {
    const { locationId } = params
    console.log('[GBP Analysis API] Request received for location:', locationId)
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

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.log('[GBP Analysis API] Unauthorized - no user')
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[GBP Analysis API] Authenticated user:', user.id)

    // Verify location ownership and fetch location data
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id, name, formatted_address')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .single()

    if (locationError || !location) {
      console.error('[GBP Analysis API] Location not found or access denied:', {
        locationError: locationError?.message,
        locationId,
        userId: user.id,
      })
      return NextResponse.json(
        { success: false, error: 'Location not found or access denied' },
        { status: 404 }
      )
    }

    // Check for force refresh parameter
    const { searchParams } = new URL(request.url)
    const forceRefresh = searchParams.get('forceRefresh') === 'true'

    // Fetch insights (including cached AI analysis)
    const { data: insights, error: insightsError } = await supabase
      .from('business_insights')
      .select('gbp_avg_rating, gbp_review_count, review_sentiment_summary, apify_competitors, gbp_ai_analysis, gbp_ai_analysis_generated_at')
      .eq('location_id', locationId)
      .eq('source', 'google')
      .single()

    if (insightsError || !insights) {
      console.error('[GBP Analysis API] No insights found:', insightsError)
      return NextResponse.json(
        { success: false, error: 'No insights data available. Please connect your Google Business Profile first.' },
        { status: 404 }
      )
    }

    // Check for cached analysis (unless force refresh is requested)
    if (!forceRefresh && insights.gbp_ai_analysis) {
      console.log('[GBP Analysis API] Returning cached analysis from', insights.gbp_ai_analysis_generated_at)
      return NextResponse.json({
        success: true,
        analysis: insights.gbp_ai_analysis,
        cached: true,
        generatedAt: insights.gbp_ai_analysis_generated_at,
      })
    }

    console.log('[GBP Analysis API] Generating new analysis (forceRefresh:', forceRefresh, ', cached:', !!insights.gbp_ai_analysis, ')')

    // Fetch your reviews (GBP) - limit to 20 most recent and truncate text
    const { data: yourReviewsData, error: reviewsError } = await supabase
      .from('business_reviews')
      .select('rating, review_text, published_at')
      .eq('location_id', locationId)
      .eq('source', 'gbp')
      .not('review_text', 'is', null)
      .order('published_at', { ascending: false })
      .limit(20)

    if (reviewsError) {
      console.error('[GBP Analysis API] Error fetching reviews:', reviewsError)
    }

    console.log('[GBP Analysis API] Reviews query result:', {
      reviewsFound: yourReviewsData?.length || 0,
      hasError: !!reviewsError,
      errorMessage: reviewsError?.message,
      sampleReview: yourReviewsData?.[0] ? {
        hasRating: !!yourReviewsData[0].rating,
        hasText: !!yourReviewsData[0].review_text,
        textLength: yourReviewsData[0].review_text?.length || 0,
      } : null,
    })

    // Also check total reviews count (including those without text) for debugging
    const { count: totalReviewsCount } = await supabase
      .from('business_reviews')
      .select('*', { count: 'exact', head: true })
      .eq('location_id', locationId)
      .eq('source', 'gbp')

    console.log('[GBP Analysis API] Total GBP reviews in database:', totalReviewsCount)

    const yourReviews = (yourReviewsData || []).map((r: any) => ({
      rating: r.rating || 0,
      text: (r.review_text || '').substring(0, 200), // Truncate to 200 chars to reduce tokens
    }))

    // Check if we have enough reviews
    if (yourReviews.length < 5) {
      console.log('[GBP Analysis API] Not enough reviews with text:', {
        reviewsWithText: yourReviews.length,
        totalReviewsInDB: totalReviewsCount,
        locationId,
        message: 'Need at least 5 reviews with review_text to generate analysis',
      })

      // If no reviews at all, suggest fetching reviews first
      if ((totalReviewsCount || 0) === 0) {
        return NextResponse.json(
          { 
            success: false, 
            error: 'NOT_ENOUGH_DATA',
            details: {
              reviewsWithText: 0,
              totalReviews: 0,
              message: 'No reviews found. Please refresh your reviews first by clicking "Refresh Analysis" or wait for reviews to be fetched automatically.',
              needsReviewFetch: true,
            },
          },
          { status: 200 }
        )
      }

      return NextResponse.json(
        { 
          success: false, 
          error: 'NOT_ENOUGH_DATA',
          details: {
            reviewsWithText: yourReviews.length,
            totalReviews: totalReviewsCount || 0,
            message: `Found ${totalReviewsCount} review${totalReviewsCount !== 1 ? 's' : ''}, but only ${yourReviews.length} have text content. We need at least 5 reviews with text to generate analysis.`,
            needsReviewFetch: yourReviews.length === 0, // If no reviews with text, suggest refresh
          },
        },
        { status: 200 }
      )
    }

    // Calculate counts
    const totalReviews = yourReviews.length
    const positiveReviews = yourReviews.filter((r) => r.rating >= 4).length
    const negativeReviews = yourReviews.filter((r) => r.rating <= 3).length

    // Fetch competitor reviews (Apify) - limit to 40 most recent and truncate text
    const { data: competitorReviewsData } = await supabase
      .from('business_reviews')
      .select('rating, review_text, competitor_business_name, raw_payload')
      .eq('location_id', locationId)
      .eq('source', 'apify')
      .not('review_text', 'is', null)
      .order('published_at', { ascending: false })
      .limit(40)

    // Map competitor reviews with business name and truncate text
    const competitorReviews = (competitorReviewsData || []).map((r: any) => ({
      businessName: r.competitor_business_name || r.raw_payload?.placeName || 'Competitor',
      rating: r.rating || 0,
      text: (r.review_text || '').substring(0, 200), // Truncate to 200 chars to reduce tokens
    }))

    // Extract competitors from apify_competitors
    const apifyData = insights.apify_competitors as any
    const allPlaces = apifyData?.places || []
    const competitors = allPlaces
      .filter((p: any) => !p.isSelf && p.name)
      .map((p: any) => ({
        name: p.name,
        avgRating: p.rating || p.avgRating || null,
        totalReviews: p.reviewsCount || null,
      }))

    // Build location label from formatted_address
    let locationLabel = 'your area'
    if (location.formatted_address) {
      const parts = location.formatted_address.split(',').map((p: string) => p.trim())
      if (parts.length >= 2) {
        // Try to extract city and country from address
        // Usually format is: "Street, City, State/Province, Country"
        locationLabel = `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`
      } else if (parts.length === 1) {
        locationLabel = parts[0]
      }
    }

    // Build input payload
    const analysisInput: GBPAnalysisInput = {
      business: {
        name: location.name,
        locationLabel,
        totalReviews,
        positiveReviews,
        negativeReviews,
        avgRating: insights.gbp_avg_rating,
      },
      competitors,
      yourReviews,
      competitorReviews,
    }

    console.log('[GBP Analysis API] Input prepared:', {
      businessName: analysisInput.business.name,
      totalReviews: analysisInput.business.totalReviews,
      competitorCount: analysisInput.competitors.length,
      competitorReviewCount: analysisInput.competitorReviews.length,
    })

    // Generate AI analysis
    let analysis
    try {
      analysis = await generateGBPWeaknessAnalysis(analysisInput)
      console.log('[GBP Analysis API] Analysis generated successfully')

      // Store the analysis in the database
      const now = new Date().toISOString()
      const { error: updateError } = await supabase
        .from('business_insights')
        .update({
          gbp_ai_analysis: analysis,
          gbp_ai_analysis_generated_at: now,
          updated_at: now,
        })
        .eq('location_id', locationId)
        .eq('source', 'google')

      if (updateError) {
        console.error('[GBP Analysis API] Failed to cache analysis:', updateError)
        // Don't fail the request - still return the analysis
      } else {
        console.log('[GBP Analysis API] Analysis cached successfully')
      }
    } catch (error: any) {
      console.error('[GBP Analysis API] Error generating analysis:', error)
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Failed to generate analysis',
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      analysis,
      cached: false,
      generatedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('[GBP Analysis API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate GBP analysis.',
      },
      { status: 500 }
    )
  }
}
