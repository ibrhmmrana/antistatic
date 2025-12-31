import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { fetchInstagramRaw } from '@/lib/social/instagram-apify'
import { fetchInstagramFromGraphAPI } from '@/lib/social/instagram-graph'
import { calculateInstagramMetrics } from '@/lib/social/instagram-metrics'
import { generateInstagramAnalysis } from '@/lib/social/instagram-ai'

// Increase timeout for this route (Apify can take 2+ minutes)
export const maxDuration = 300 // 5 minutes
export const dynamic = 'force-dynamic'

/**
 * GET /api/social/instagram/analysis?locationId=...&username=...
 * 
 * Returns cached Instagram analysis if available (does not trigger new Apify/OpenAI run).
 * 
 * This endpoint is called on page load to check for existing analysis.
 * If no cached analysis exists, returns 404 (frontend will show "Generate analysis" button).
 * 
 * Pattern matches GBP analysis: GET for cached data, POST for fresh generation.
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[Instagram Analysis API] GET request received')
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
      console.log('[Instagram Analysis API] Unauthorized - no user')
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const locationId = searchParams.get('locationId')
    const username = searchParams.get('username')

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:52',message:'GET entry',data:{locationId,username,usernameLength:username?.length,usernameTrimmed:username?.trim()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!locationId || !username) {
      return NextResponse.json(
        { success: false, error: 'Location ID and username are required' },
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
      console.error('[Instagram Analysis API] Location not found or access denied:', locationError)
      return NextResponse.json(
        { success: false, error: 'Location not found or access denied' },
        { status: 404 }
      )
    }

    // Fetch cached analysis
    const { data: insights, error: insightsError } = await supabase
      .from('business_insights')
      .select('instagram_ai_analysis, instagram_ai_analysis_generated_at, instagram_username')
      .eq('location_id', locationId)
      .eq('source', 'google')
      .maybeSingle()

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:85',message:'GET query result',data:{hasInsights:!!insights,hasError:!!insightsError,errorMessage:insightsError?.message,cachedUsername:insights?.instagram_username,requestedUsername:username,usernameMatch:insights?.instagram_username===username,hasAnalysis:!!insights?.instagram_ai_analysis},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    console.log('[IG GET] locationId=', locationId, 'data?=', !!insights, 'error?', !!insightsError)

    if (insightsError) {
      console.error('[Instagram Analysis API] GET: Database error:', insightsError)
      // Check if it's a missing column error
      if (insightsError.message?.includes('does not exist')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Database migration required: Instagram analysis columns are missing. Please run the migration: migrations/add_instagram_ai_analysis.sql',
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

    if (!insights || !insights.instagram_ai_analysis || insights.instagram_username !== username) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:100',message:'GET no match',data:{hasRow:!!insights,hasAnalysis:!!insights?.instagram_ai_analysis,cachedUsername:insights?.instagram_username,requestedUsername:username,usernameMatch:insights?.instagram_username===username,usernameLengths:{cached:insights?.instagram_username?.length,requested:username?.length}},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.log('[Instagram Analysis API] GET: No matching cached analysis', {
        hasRow: !!insights,
        hasAnalysis: !!insights?.instagram_ai_analysis,
        cachedUsername: insights?.instagram_username,
        requestedUsername: username,
      })
      return NextResponse.json(
        { status: 'not_found', success: false, error: 'No Instagram analysis found. Please generate an analysis first.' },
        { status: 404 }
      )
    }

    const cachedData = insights.instagram_ai_analysis as any
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:113',message:'GET returning data',data:{hasCachedData:!!cachedData,hasSummary:!!cachedData?.summary,hasWhatWorks:!!cachedData?.whatWorks,hasMetrics:!!cachedData?.metrics,dataKeys:Object.keys(cachedData||{})},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    console.log('[Instagram Analysis API] Returning cached analysis from', insights.instagram_ai_analysis_generated_at)
    
    return NextResponse.json({
      status: 'ok',
      success: true,
      analysis: {
        summary: cachedData.summary,
        whatWorks: cachedData.whatWorks,
        risksSummary: cachedData.risksSummary || '',
        mainRisks: cachedData.mainRisks || [],
      },
      metrics: cachedData.metrics || null,
      cached: true,
      generatedAt: insights.instagram_ai_analysis_generated_at,
    })
  } catch (error: any) {
    console.error('[Instagram Analysis API] GET error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch Instagram analysis.',
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/social/instagram/analysis
 * 
 * Generate AI analysis for an Instagram account (triggers Apify + OpenAI).
 * 
 * This endpoint:
 * - Checks for cached analysis first (unless forceRefresh=true)
 * - If cached and username matches, returns cached data
 * - Otherwise, fetches from Apify, generates AI analysis, saves to DB, and returns result
 * 
 * Called only when user explicitly clicks "Refresh analysis" button.
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[Instagram Analysis API] Request received')
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
      console.log('[Instagram Analysis API] Unauthorized - no user')
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Instagram Analysis API] Authenticated user:', user.id)

    // Parse request body
    const body = await request.json()
    let { username, locationId, resultsLimitPosts = 30, resultsLimitComments = 20, forceRefresh = false } = body

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:179',message:'POST entry',data:{username,usernameLength:username?.length,usernameTrimmed:username?.trim(),locationId,forceRefresh},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Username is required' },
        { status: 400 }
      )
    }

    if (!locationId || typeof locationId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Location ID is required' },
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
      console.error('[Instagram Analysis API] Location not found or access denied:', locationError)
      return NextResponse.json(
        { success: false, error: 'Location not found or access denied' },
        { status: 404 }
      )
    }

    // Check for cached analysis (unless force refresh is requested)
    if (!forceRefresh) {
      const { data: insights } = await supabase
        .from('business_insights')
        .select('instagram_ai_analysis, instagram_ai_analysis_generated_at, instagram_username')
        .eq('location_id', locationId)
        .eq('source', 'google')
        .maybeSingle()

      if (insights?.instagram_ai_analysis && insights.instagram_username === username) {
        const cachedData = insights.instagram_ai_analysis as any
        console.log('[Instagram Analysis API] Returning cached analysis from', insights.instagram_ai_analysis_generated_at)
        return NextResponse.json({
          status: 'ok',
          success: true,
          analysis: {
            summary: cachedData.summary,
            whatWorks: cachedData.whatWorks,
            risksSummary: cachedData.risksSummary || '',
            mainRisks: cachedData.mainRisks,
          },
          metrics: cachedData.metrics || null,
          cached: true,
          generatedAt: insights.instagram_ai_analysis_generated_at,
        })
      }
    }

    console.log('[Instagram Analysis API] Fetching Instagram data for:', username)
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:276',message:'POST entry - checking OAuth connection',data:{locationId,username,hasUsername:!!username},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // Check if OAuth connection exists - if so, use Graph API instead of Apify
    const serverSupabase = await createClient()
    const { data: instagramConnection, error: connectionError } = await serverSupabase
      .from('instagram_connections')
      .select('access_token, instagram_user_id, instagram_username')
      .eq('business_location_id', locationId)
      .maybeSingle()

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:283',message:'OAuth connection query result',data:{hasConnection:!!instagramConnection,hasError:!!connectionError,errorMessage:connectionError?.message,hasAccessToken:!!instagramConnection?.access_token,hasUserId:!!instagramConnection?.instagram_user_id,hasUsername:!!instagramConnection?.instagram_username,userId:instagramConnection?.instagram_user_id?.substring(0,20)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion

    const typedConnection = instagramConnection as {
      access_token: string
      instagram_user_id: string
      instagram_username: string | null
    } | null

    let posts, comments
    const startTime = Date.now()

    if (typedConnection && typedConnection.access_token && typedConnection.instagram_user_id) {
      // Use Instagram Graph API with OAuth token
      console.log('[Instagram Analysis API] Using Instagram Graph API (OAuth)')
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:295',message:'OAuth connection found - using Graph API',data:{hasAccessToken:!!typedConnection.access_token,hasUserId:!!typedConnection.instagram_user_id,userId:typedConnection.instagram_user_id?.substring(0,20),tokenLength:typedConnection.access_token?.length,username:typedConnection.instagram_username},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // Use username from connection if available, otherwise use provided username
      if (typedConnection.instagram_username) {
        username = typedConnection.instagram_username
      }
      
      try {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:304',message:'Calling fetchInstagramFromGraphAPI',data:{userId:typedConnection.instagram_user_id?.substring(0,20),tokenLength:typedConnection.access_token?.length,postsLimit:resultsLimitPosts,commentsLimit:resultsLimitComments},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        const result = await fetchInstagramFromGraphAPI(
          typedConnection.access_token,
          typedConnection.instagram_user_id,
          resultsLimitPosts,
          resultsLimitComments
        )
        const duration = ((Date.now() - startTime) / 1000).toFixed(1)
        console.log(`[Instagram Analysis API] Graph API fetch completed in ${duration}s`)
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:312',message:'Graph API fetch succeeded',data:{postsCount:result.posts.length,commentsCount:result.comments.length,duration},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        posts = result.posts
        comments = result.comments
        
        console.log('[Instagram Analysis API] Data received from Graph API:', {
          postsCount: posts.length,
          commentsCount: comments.length,
        })
      } catch (error: any) {
        console.error('[Instagram Analysis API] Graph API error:', {
          message: error.message,
          stack: error.stack,
          name: error.name,
        })
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:321',message:'Graph API error caught',data:{errorMessage:error.message,errorName:error.name,errorStack:error.stack?.substring(0,200),hasUsername:!!username},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        // DO NOT fallback to Apify - user wants Graph API only
        return NextResponse.json(
          { success: false, error: `Failed to fetch Instagram data from Graph API: ${error.message}` },
          { status: 500 }
        )
      }
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:352',message:'No OAuth connection found',data:{hasConnection:!!typedConnection,hasAccessToken:!!typedConnection?.access_token,hasUserId:!!typedConnection?.instagram_user_id,connectionError:connectionError?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      // No OAuth connection - return error (user wants Graph API only)
      return NextResponse.json(
        { success: false, error: 'Instagram OAuth connection not found. Please connect your Instagram account via OAuth first.' },
        { status: 400 }
      )
    }

    // Check if we have enough data
    console.log('[Instagram Analysis API] Checking data sufficiency:', {
      postsLength: posts.length,
      commentsLength: comments.length,
    })
    
    if (posts.length < 5) {
      console.log('[Instagram Analysis API] Not enough posts:', posts.length)
      return NextResponse.json(
        { success: false, error: 'NOT_ENOUGH_DATA', postsCount: posts.length, commentsCount: comments.length },
        { status: 200 }
      )
    }

    // Calculate metrics
    const metrics = calculateInstagramMetrics(username, posts, comments)

    console.log('[Instagram Analysis API] Metrics calculated:', {
      totalPosts: metrics.totalPostsAnalyzed,
      totalComments: metrics.totalCommentsAnalyzed,
      avgLikes: metrics.avgLikesPerPost,
    })

    // Generate AI analysis
    let analysis
    try {
      console.log('[Instagram Analysis API] Starting AI analysis generation...')
      analysis = await generateInstagramAnalysis(metrics)
      console.log('[Instagram Analysis API] Analysis generated successfully:', {
        summary: analysis.summary?.substring(0, 50),
        whatWorksCount: analysis.whatWorks?.length,
        mainRisksCount: analysis.mainRisks?.length,
      })
    } catch (error: any) {
      console.error('[Instagram Analysis API] Error generating analysis:', {
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

    const response = {
      success: true,
      analysis,
      metrics: {
        totalPosts: metrics.totalPostsAnalyzed,
        postsLast30Days: metrics.postsLast30Days,
        postsPerWeekApprox: metrics.postsPerWeekApprox,
        avgLikes: metrics.avgLikesPerPost,
        maxLikes: metrics.maxLikes,
        totalComments: metrics.totalCommentsAnalyzed,
        hasAnyComments: metrics.hasAnyComments,
        periodStart: metrics.periodStart,
        periodEnd: metrics.periodEnd,
      },
    }

    // Store the analysis and raw data in the database for caching
    const now = new Date().toISOString()
    // Combine analysis with metrics - this structure is what GET expects to read back
    const analysisWithMetrics = {
      summary: analysis.summary,
      whatWorks: analysis.whatWorks,
      risksSummary: analysis.risksSummary,
      mainRisks: analysis.mainRisks,
      metrics: response.metrics, // Include metrics in the saved analysis object
    }

    // Upsert business_insights row using the unique constraint
    // The table has a unique constraint on (location_id, source)
    // Use column names format to match other upserts in the codebase
    const upsertPayload = {
      location_id: locationId,
      source: 'google',
      instagram_ai_analysis: analysisWithMetrics,
      instagram_ai_analysis_generated_at: now,
      instagram_username: username,
      instagram_raw_posts: posts,
      instagram_raw_comments: comments,
      instagram_metrics: metrics,
      instagram_data_fetched_at: now,
      updated_at: now,
    }
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:382',message:'POST before upsert',data:{locationId,username,source:'google',hasAnalysis:!!analysisWithMetrics,hasMetrics:!!analysisWithMetrics?.metrics,postsCount:posts?.length,commentsCount:comments?.length,upsertPayloadKeys:Object.keys(upsertPayload)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    
    const { data: savedInsights, error: upsertError } = await supabase
      .from('business_insights')
      .upsert(upsertPayload, {
        onConflict: 'location_id,source', // Use column names format (matches other upserts in codebase)
      })
      .select()
      .maybeSingle()

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:400',message:'POST after upsert',data:{hasError:!!upsertError,errorMessage:upsertError?.message,errorCode:upsertError?.code,errorDetails:upsertError?.details,hasSavedInsights:!!savedInsights,savedId:savedInsights?.id,savedLocationId:savedInsights?.location_id,savedSource:savedInsights?.source,savedUsername:savedInsights?.instagram_username,hasSavedAnalysis:!!savedInsights?.instagram_ai_analysis,hasSavedPosts:!!savedInsights?.instagram_raw_posts,hasSavedComments:!!savedInsights?.instagram_raw_comments,hasSavedMetrics:!!savedInsights?.instagram_metrics},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    if (upsertError) {
      console.error('[IG POST] Supabase upsert error', {
        message: upsertError.message,
        code: upsertError.code,
        details: upsertError.details,
        hint: upsertError.hint,
        fullError: upsertError,
      })
      // Return error - we need to save the data for it to persist
      return NextResponse.json(
        {
          status: 'error',
          success: false,
          message: 'Failed to save Instagram analysis',
          error: upsertError.message || 'Database error during save',
        },
        { status: 500 }
      )
    }

    if (!savedInsights) {
      console.error('[IG POST] Upsert succeeded but no data returned - this should not happen')
      return NextResponse.json(
        {
          status: 'error',
          success: false,
          message: 'Failed to save Instagram analysis - no data returned from database',
        },
        { status: 500 }
      )
    }

    // Verify the data was actually saved correctly
    const hasAllRequiredFields = !!(
      savedInsights.instagram_ai_analysis &&
      savedInsights.instagram_username &&
      savedInsights.instagram_ai_analysis_generated_at
    )

    if (!hasAllRequiredFields) {
      console.error('[IG POST] WARNING: Saved data is incomplete:', {
        hasAnalysis: !!savedInsights.instagram_ai_analysis,
        hasUsername: !!savedInsights.instagram_username,
        hasGeneratedAt: !!savedInsights.instagram_ai_analysis_generated_at,
        savedData: {
          id: savedInsights.id,
          location_id: savedInsights.location_id,
          source: savedInsights.source,
          instagram_username: savedInsights.instagram_username,
          has_instagram_ai_analysis: !!savedInsights.instagram_ai_analysis,
          has_instagram_raw_posts: !!savedInsights.instagram_raw_posts,
          has_instagram_raw_comments: !!savedInsights.instagram_raw_comments,
          has_instagram_metrics: !!savedInsights.instagram_metrics,
        },
      })
      return NextResponse.json(
        {
          status: 'error',
          success: false,
          message: 'Failed to save Instagram analysis - data incomplete',
        },
        { status: 500 }
      )
    }

    // Success - log verification
    console.log('[IG POST] Saved Instagram analysis for', {
      locationId,
      source: 'google',
      rowId: savedInsights.id,
      username: savedInsights.instagram_username,
      hasAnalysis: !!savedInsights.instagram_ai_analysis,
      hasRawPosts: !!savedInsights.instagram_raw_posts,
      hasRawComments: !!savedInsights.instagram_raw_comments,
      hasMetrics: !!savedInsights.instagram_metrics,
      generatedAt: savedInsights.instagram_ai_analysis_generated_at,
    })
    console.log('[Instagram Analysis API] Analysis and raw data cached successfully')

    console.log('[Instagram Analysis API] Returning response:', {
      success: response.success,
      hasAnalysis: !!response.analysis,
      hasMetrics: !!response.metrics,
    })

    return NextResponse.json({
      status: 'ok',
      success: true,
      analysis: response.analysis,
      metrics: response.metrics,
      cached: false,
      generatedAt: now,
    })
  } catch (error: any) {
    console.error('[Instagram Analysis API] Unexpected error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to generate Instagram analysis.',
      },
      { status: 500 }
    )
  }
}

