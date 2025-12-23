import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fetchFacebookRaw } from '@/lib/social/facebook-apify'
import { calculateFacebookMetrics } from '@/lib/social/facebook-metrics'
import { generateFacebookAnalysis } from '@/lib/social/facebook-ai'
import { Database } from '@/lib/supabase/database.types'

type BusinessInsights = Database['public']['Tables']['business_insights']['Row']
type BusinessInsightsSelect = Pick<BusinessInsights, 'facebook_ai_analysis' | 'facebook_ai_analysis_generated_at' | 'facebook_url' | 'facebook_raw_posts' | 'facebook_metrics'>

// Increase timeout for this route (Apify can take 2+ minutes)
export const maxDuration = 300 // 5 minutes
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // Must run in Node, not Edge

/**
 * GET /api/social/facebook/analyze?locationId=...&facebookUrl=...
 * 
 * Returns cached Facebook analysis if available (does not trigger new Apify/OpenAI run).
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[Facebook Analysis API] GET request received')
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
      console.log('[Facebook Analysis API] Unauthorized - no user')
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId')
    const facebookUrl = searchParams.get('facebookUrl')

    if (!locationId || !facebookUrl) {
      return NextResponse.json(
        { success: false, error: 'Location ID and Facebook URL are required' },
        { status: 400 }
      )
    }

    // Verify location ownership
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .single()

    if (locationError || !location) {
      console.error('[Facebook Analysis API] Location not found or access denied:', locationError)
      return NextResponse.json(
        { success: false, error: 'Location not found or access denied' },
        { status: 404 }
      )
    }

    // Fetch cached analysis (including raw posts)
    const insightsResult = await supabase
      .from('business_insights')
      .select('facebook_ai_analysis, facebook_ai_analysis_generated_at, facebook_url, facebook_raw_posts, facebook_metrics')
      .eq('location_id', locationId)
      .eq('source', 'google')
      .maybeSingle()
    
    const insights = insightsResult.data as BusinessInsightsSelect | null
    const insightsError = insightsResult.error

    if (insightsError) {
      console.error('[Facebook Analysis API] GET: Database error:', insightsError)
      if (insightsError.message?.includes('does not exist')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Database migration required: Facebook analysis columns are missing. Please run the migration: migrations/add_facebook_analysis.sql',
          },
          { status: 500 }
        )
      }
      return NextResponse.json(
        {
          success: false,
          error: `Database error: ${insightsError.message || 'Unknown error'}`,
        },
        { status: 500 }
      )
    }

    if (!insights || !insights.facebook_ai_analysis || insights.facebook_url !== facebookUrl) {
      console.log('[Facebook Analysis API] GET: No matching cached analysis', {
        hasRow: !!insights,
        hasAnalysis: !!insights?.facebook_ai_analysis,
        cachedUrl: insights?.facebook_url,
        requestedUrl: facebookUrl,
      })
      return NextResponse.json(
        { status: 'not_found', success: false, error: 'No Facebook analysis found. Please generate an analysis first.' },
        { status: 404 }
      )
    }

    const cachedData = insights.facebook_ai_analysis as any
    console.log('[Facebook Analysis API] Returning cached analysis from', insights.facebook_ai_analysis_generated_at)

    return NextResponse.json({
      status: 'ok',
      success: true,
      analysis: cachedData,
      metrics: insights.facebook_metrics || cachedData.metrics || null,
      posts: insights.facebook_raw_posts || null, // Include raw posts
      cached: true,
      generatedAt: insights.facebook_ai_analysis_generated_at,
    })
  } catch (error: any) {
    console.error('[Facebook Analysis API] GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch Facebook analysis.',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/social/facebook/analyze
 * 
 * Generate AI analysis for a Facebook Page (triggers Apify + OpenAI).
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[Facebook Analysis API] POST request received')
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
      console.log('[Facebook Analysis API] Unauthorized - no user')
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Facebook Analysis API] Authenticated user:', user.id)

    // Parse request body
    let body
    try {
      body = await request.json()
    } catch (error: any) {
      console.error('[Facebook Analysis API] Error parsing request body:', error)
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { facebookUrl, locationId, resultsLimit = 30, force = false } = body

    console.log('[Facebook Analysis API] Request body:', {
      hasFacebookUrl: !!facebookUrl,
      facebookUrlType: typeof facebookUrl,
      facebookUrlValue: facebookUrl?.substring(0, 50),
      hasLocationId: !!locationId,
      locationIdType: typeof locationId,
      resultsLimit,
      force,
    })

    if (!facebookUrl || typeof facebookUrl !== 'string') {
      console.error('[Facebook Analysis API] Missing or invalid facebookUrl:', { facebookUrl, type: typeof facebookUrl })
      return NextResponse.json(
        { success: false, error: 'Facebook URL is required and must be a string' },
        { status: 400 }
      )
    }

    if (!locationId || typeof locationId !== 'string') {
      console.error('[Facebook Analysis API] Missing or invalid locationId:', { locationId, type: typeof locationId })
      return NextResponse.json(
        { success: false, error: 'Location ID is required and must be a string' },
        { status: 400 }
      )
    }

    // Note: We accept both full URLs and account names (e.g., "pantryjhb")
    // The normalization function in fetchFacebookRaw will handle the conversion
    // So we just need to ensure it's not empty
    if (!facebookUrl || facebookUrl.trim().length === 0) {
      console.error('[Facebook Analysis API] Empty Facebook URL or account name')
      return NextResponse.json(
        { success: false, error: 'Facebook URL or account name is required.' },
        { status: 400 }
      )
    }

    // Verify location ownership
    const { data: location, error: locationError } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', locationId)
      .eq('user_id', user.id)
      .single()

    if (locationError || !location) {
      console.error('[Facebook Analysis API] Location not found or access denied:', locationError)
      return NextResponse.json(
        { success: false, error: 'Location not found or access denied' },
        { status: 404 }
      )
    }

    // Check for cached analysis (unless force refresh is requested)
    if (!force) {
      const insightsResult = await supabase
        .from('business_insights')
        .select('facebook_ai_analysis, facebook_ai_analysis_generated_at, facebook_url, facebook_raw_posts, facebook_metrics')
        .eq('location_id', locationId)
        .eq('source', 'google')
        .maybeSingle()
      
      const insights = insightsResult.data as BusinessInsightsSelect | null

      // Check if cached analysis exists and is less than 24 hours old
      if (insights?.facebook_ai_analysis && insights.facebook_url === facebookUrl) {
        const generatedAt = new Date(insights.facebook_ai_analysis_generated_at || 0)
        const now = new Date()
        const hoursSinceGeneration = (now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60)

        if (hoursSinceGeneration < 24) {
          const cachedData = insights.facebook_ai_analysis as any
          console.log('[Facebook Analysis API] Returning cached analysis from', insights.facebook_ai_analysis_generated_at)
          return NextResponse.json({
            status: 'ok',
            success: true,
            analysis: cachedData,
            metrics: insights.facebook_metrics || cachedData.metrics || null,
            posts: insights.facebook_raw_posts || null, // Include raw posts
            cached: true,
            generatedAt: insights.facebook_ai_analysis_generated_at,
          })
        }
      }
    }

    console.log('[Facebook Analysis API] Fetching Facebook data for:', facebookUrl)
    console.log('[Facebook Analysis API] This may take 2-3 minutes...')

    // Fetch Facebook data from Apify
    let posts
    try {
      const startTime = Date.now()
      const result = await fetchFacebookRaw(facebookUrl, resultsLimit)
      const duration = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`[Facebook Analysis API] Apify fetch completed in ${duration}s`)

      posts = result.posts

      console.log('[Facebook Analysis API] Data received:', {
        postsCount: posts.length,
      })
    } catch (error: any) {
      console.error('[Facebook Analysis API] Apify error:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      })
      return NextResponse.json(
        { success: false, error: `Failed to fetch Facebook data: ${error.message}` },
        { status: 500 }
      )
    }

    // Check if we have enough data
    console.log('[Facebook Analysis API] Checking data sufficiency:', {
      postsLength: posts.length,
    })

    if (posts.length < 5) {
      console.log('[Facebook Analysis API] Not enough posts:', posts.length)
      return NextResponse.json(
        { success: false, error: 'NOT_ENOUGH_DATA', postsCount: posts.length },
        { status: 200 }
      )
    }

    // Calculate metrics
    const metrics = calculateFacebookMetrics(posts)

    console.log('[Facebook Analysis API] Metrics calculated:', {
      totalPosts: metrics.totalPosts,
      postsPerWeek: metrics.postingCadence.postsPerWeek,
      avgEngagement: metrics.engagement.avgEngagement,
    })

    // Generate AI analysis
    let analysis
    try {
      console.log('[Facebook Analysis API] Starting AI analysis generation...')
      const topPosts = metrics.engagement.topPostsByEngagement.map((p) => ({
        url: p.url,
        text: p.text,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
      }))
      analysis = await generateFacebookAnalysis(metrics, topPosts)
      console.log('[Facebook Analysis API] Analysis generated successfully:', {
        overallScore: analysis.overallScore,
        cardsCount: analysis.cards.length,
        keyFindingsCount: analysis.keyFindings.length,
      })
    } catch (error: any) {
      console.error('[Facebook Analysis API] Error generating analysis:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      })
      return NextResponse.json(
        {
          success: false,
          error: error.message || 'Failed to generate analysis',
        },
        { status: 500 }
      )
    }

    // Combine analysis with metrics for storage
    const analysisWithMetrics = {
      ...analysis,
      metrics,
    }

    // Store the analysis and raw data in the database
    const now = new Date().toISOString()
    const upsertPayload = {
      location_id: locationId,
      source: 'google',
      facebook_ai_analysis: analysisWithMetrics,
      facebook_ai_analysis_generated_at: now,
      facebook_url: facebookUrl,
      facebook_raw_posts: posts,
      facebook_metrics: metrics,
      facebook_data_fetched_at: now,
      updated_at: now,
    }

    const { data: savedInsights, error: upsertError } = await supabase
      .from('business_insights')
      .upsert(upsertPayload, {
        onConflict: 'location_id,source',
      })
      .select()
      .maybeSingle()

    if (upsertError) {
      console.error('[Facebook Analysis API] Supabase upsert error', {
        message: upsertError.message,
        code: upsertError.code,
        details: upsertError.details,
      })
      return NextResponse.json(
        {
          status: 'error',
          success: false,
          message: 'Failed to save Facebook analysis',
          error: upsertError.message || 'Database error during save',
        },
        { status: 500 }
      )
    }

    if (!savedInsights) {
      console.error('[Facebook Analysis API] Upsert succeeded but no data returned')
      return NextResponse.json(
        {
          status: 'error',
          success: false,
          message: 'Failed to save Facebook analysis - no data returned from database',
        },
        { status: 500 }
      )
    }

    console.log('[Facebook Analysis API] Analysis and raw data cached successfully')

    return NextResponse.json({
      status: 'ok',
      success: true,
      analysis,
      metrics,
      posts, // Include raw posts in response
      cached: false,
      generatedAt: now,
    })
  } catch (error: any) {
    console.error('[Facebook Analysis API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate Facebook analysis.',
      },
      { status: 500 }
    )
  }
}

