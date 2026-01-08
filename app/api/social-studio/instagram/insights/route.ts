import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramAccessTokenForLocation, InstagramAuthError } from '@/lib/instagram/tokens'
import { API_BASE, API_VERSION } from '@/lib/instagram/publish-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FETCH_TIMEOUT_MS = 10000

/**
 * Generate a unique request ID for tracking
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Create a timeout controller
 */
function withTimeout(ms: number): { controller: AbortController; timeoutId: NodeJS.Timeout; signal: AbortSignal } {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, ms)
  return { controller, timeoutId, signal: controller.signal }
}

/**
 * Redact access token from URL for logging
 */
function redactTokenFromUrl(url: string): string {
  return url.replace(/access_token=([^&]+)/g, 'access_token=***')
}

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(
  url: string,
  requestId: string,
  label: string
): Promise<{ ok: boolean; status: number; data?: any; error?: any }> {
  try {
    const safeUrlForLogs = redactTokenFromUrl(url)
    console.log(`[IG Insights] ${label} {url: ${safeUrlForLogs}}`)
    
    const { controller, timeoutId, signal } = withTimeout(FETCH_TIMEOUT_MS)
    
    const response = await fetch(url, { method: 'GET', signal })
    clearTimeout(timeoutId)
    
    const data = await response.json().catch(() => ({}))
    
    if (!response.ok) {
      console.log(`[IG Insights] ${label} failed {status: ${response.status}, error: ${data.error?.message || 'unknown'}}`)
    }
    
    return {
      ok: response.ok,
      status: response.status,
      data: response.ok ? data : undefined,
      error: response.ok ? undefined : data,
    }
  } catch (error: any) {
    console.log(`[IG Insights] ${label} error {error: ${error.message}}`)
    return {
      ok: false,
      status: 0,
      error: { message: error.message },
    }
  }
}

/**
 * Fetch insights with timeout
 */
async function fetchInsights(
  url: string,
  requestId: string,
  metrics: string[]
): Promise<{ ok: boolean; status: number; data?: any; error?: any }> {
  return fetchWithTimeout(url, requestId, `attempt {metrics: ${metrics.join(',')}}`)
}

export async function GET(request: NextRequest) {
  const requestId = generateRequestId()
  
  try {
    const { searchParams } = new URL(request.url)
    const businessLocationId = searchParams.get('businessLocationId')
    const mediaId = searchParams.get('mediaId')
    const mediaType = searchParams.get('mediaType') || 'IMAGE'

    if (!businessLocationId || !mediaId) {
      return NextResponse.json(
        { ok: false, error: 'Missing businessLocationId or mediaId', requestId },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized', requestId },
        { status: 401 }
      )
    }

    // Get Instagram access token
    let accessToken: string

    try {
      const tokenData = await getInstagramAccessTokenForLocation(businessLocationId)
      accessToken = tokenData.access_token
      
      // Token sanity check - ensure we have a valid token
      let token = (accessToken || '').trim()
      if (token.startsWith('Bearer ')) {
        token = token.slice(7).trim()
      }
      
      if (!token || token.includes('***') || token.length < 20) {
        console.error(`[IG Insights] Invalid token detected:`, {
          requestId,
          mediaId,
          tokenLength: token.length,
          hasToken: !!accessToken,
          tokenLooksRedacted: token.includes('***'),
        })
        return NextResponse.json({
          ok: true,
          details: null,
          metrics: [],
          insightsAvailable: false,
          reason: 'Missing/invalid stored Instagram token (looks redacted or malformed). Please reconnect your account.',
          requestId,
        })
      }
      
      // Update accessToken with cleaned token
      accessToken = token
      
      console.log(`[IG Insights] resolve_token - Token loaded:`, {
        requestId,
        mediaId,
        hasToken: !!accessToken,
        tokenLength: accessToken.length,
        tokenPrefix: accessToken.slice(0, 6) + '...',
      })
    } catch (error: any) {
      if (error instanceof InstagramAuthError) {
        if (error.code === 'EXPIRED') {
          return NextResponse.json(
            {
              ok: false,
              error: 'Instagram access token has expired. Please reconnect your account.',
              needs_reauth: true,
              requestId,
            },
            { status: 401 }
          )
        }
        return NextResponse.json({
          ok: true,
          details: null,
          metrics: [],
          insightsAvailable: false,
          reason: 'Instagram not connected',
          requestId,
        })
      }
      
      return NextResponse.json(
        {
          ok: false,
          error: 'Failed to get Instagram token',
          requestId,
        },
        { status: 500 }
      )
    }

    // Fetch media details and insights in parallel
    const mediaDetailsUrl = new URL(`${API_BASE}/${API_VERSION}/${mediaId}`)
    mediaDetailsUrl.searchParams.set('fields', 'id,media_type,media_product_type,media_url,thumbnail_url,permalink,caption,timestamp,like_count,comments_count')
    mediaDetailsUrl.searchParams.set('access_token', accessToken)

    // Determine metrics based on media type (no impressions initially)
    let metrics: string[]
    if (mediaType === 'VIDEO' || mediaType === 'REELS') {
      // Video/Reels metrics
      metrics = ['reach', 'total_interactions', 'saved', 'shares', 'likes', 'comments', 'plays', 'views']
    } else {
      // IMAGE, CAROUSEL_ALBUM
      metrics = ['reach', 'total_interactions', 'saved', 'shares', 'likes', 'comments']
    }

    const insightsUrl = new URL(`${API_BASE}/${API_VERSION}/${mediaId}/insights`)
    insightsUrl.searchParams.set('metric', metrics.join(','))
    insightsUrl.searchParams.set('period', 'lifetime')
    insightsUrl.searchParams.set('access_token', accessToken)

    // Fetch both in parallel
    const [mediaDetailsResult, insightsResult1] = await Promise.all([
      fetchWithTimeout(mediaDetailsUrl.toString(), requestId, 'fetch_media_details'),
      fetchInsights(insightsUrl.toString(), requestId, metrics),
    ])

    // Parse media details
    let details: any = null
    if (mediaDetailsResult.ok && mediaDetailsResult.data) {
      const data = mediaDetailsResult.data
      details = {
        id: data.id,
        mediaType: data.media_type,
        mediaProductType: data.media_product_type || null,
        mediaUrl: data.media_url || null,
        thumbnailUrl: data.thumbnail_url || null,
        permalink: data.permalink || null,
        caption: data.caption || null,
        timestamp: data.timestamp || null,
        likeCount: data.like_count || 0,
        commentsCount: data.comments_count || 0,
      }
    }

    // Process insights with fallback logic
    let normalizedMetrics: Array<{ name: string; value: number; title: string }> = []
    let insightsAvailable = false

    // Check if we got a 400 error about invalid/unsupported metrics
    const errorMessage = insightsResult1.error?.error?.message?.toLowerCase() || ''
    const isMetricError = insightsResult1.status === 400 && (
      errorMessage.includes('metric') && errorMessage.includes('must be one of') ||
      errorMessage.includes('does not support') && errorMessage.includes('metric')
    )

    if (isMetricError) {
      // Extract which metric failed from error message
      let failedMetrics: string[] = []
      if (errorMessage.includes('impressions')) failedMetrics.push('impressions')
      if (errorMessage.includes('plays')) failedMetrics.push('plays')
      if (errorMessage.includes('views')) failedMetrics.push('views')
      if (errorMessage.includes('shares')) failedMetrics.push('shares')

      // Remove failed metrics and retry
      const retryMetrics = metrics.filter(m => !failedMetrics.includes(m))
      
      if (retryMetrics.length > 0) {
        console.log(`[IG Insights] Invalid/unsupported metrics detected, retrying without: ${failedMetrics.join(', ')}`, {
          requestId,
          mediaId,
          originalMetrics: metrics.join(','),
          retryMetrics: retryMetrics.join(','),
          error: insightsResult1.error?.error?.message,
        })
        
        const retryUrl = new URL(`${API_BASE}/${API_VERSION}/${mediaId}/insights`)
        retryUrl.searchParams.set('metric', retryMetrics.join(','))
        retryUrl.searchParams.set('period', 'lifetime')
        retryUrl.searchParams.set('access_token', accessToken)
        
        const insightsResult2 = await fetchInsights(retryUrl.toString(), requestId, retryMetrics)
        
        if (insightsResult2.ok && insightsResult2.data?.data && Array.isArray(insightsResult2.data.data) && insightsResult2.data.data.length > 0) {
          normalizedMetrics = insightsResult2.data.data.map((metric: any) => ({
            name: metric.name,
            value: metric.values?.[0]?.value || 0,
            title: metric.title || metric.name,
          }))
          insightsAvailable = true
        } else {
          // Try minimal metrics as last resort
          const minimalMetrics = ['reach', 'total_interactions']
          const minimalUrl = new URL(`${API_BASE}/${API_VERSION}/${mediaId}/insights`)
          minimalUrl.searchParams.set('metric', minimalMetrics.join(','))
          minimalUrl.searchParams.set('period', 'lifetime')
          minimalUrl.searchParams.set('access_token', accessToken)
          
          const insightsResult3 = await fetchInsights(minimalUrl.toString(), requestId, minimalMetrics)
          
          if (insightsResult3.ok && insightsResult3.data?.data && Array.isArray(insightsResult3.data.data) && insightsResult3.data.data.length > 0) {
            normalizedMetrics = insightsResult3.data.data.map((metric: any) => ({
              name: metric.name,
              value: metric.values?.[0]?.value || 0,
              title: metric.title || metric.name,
            }))
            insightsAvailable = true
          }
        }
      }
    } else if (insightsResult1.ok && insightsResult1.data?.data && Array.isArray(insightsResult1.data.data) && insightsResult1.data.data.length > 0) {
      // Success on first attempt
      normalizedMetrics = insightsResult1.data.data.map((metric: any) => ({
        name: metric.name,
        value: metric.values?.[0]?.value || 0,
        title: metric.title || metric.name,
      }))
      insightsAvailable = true
    }

    // Check for token parsing errors
    if (insightsResult1.status === 400 && insightsResult1.error?.error?.message?.toLowerCase().includes('cannot parse access token')) {
      console.error(`[IG Insights] Token parsing error:`, {
        requestId,
        mediaId,
        tokenLength: accessToken.length,
      })
      return NextResponse.json({
        ok: true,
        details,
        metrics: [],
        insightsAvailable: false,
        reason: 'Invalid Instagram access token. Please reconnect your account.',
        requestId,
      })
    }

    // Calculate derived metrics
    const reach = normalizedMetrics.find(m => m.name === 'reach')?.value || 0
    const totalInteractions = normalizedMetrics.find(m => m.name === 'total_interactions')?.value || 0
    const saved = normalizedMetrics.find(m => m.name === 'saved')?.value || 0

    const derived = {
      engagementRate: reach > 0 ? (totalInteractions / reach) * 100 : 0,
      saveRate: reach > 0 ? (saved / reach) * 100 : 0,
    }

    // Always return details (even if insights failed)
    return NextResponse.json({
      ok: true,
      details,
      metrics: normalizedMetrics,
      derived,
      insightsAvailable,
      requestId,
    })
  } catch (error: any) {
    console.error(`[IG Insights] Unexpected error:`, {
      requestId,
      error: error.message,
      stack: error.stack,
    })
    
    return NextResponse.json({
      ok: false,
      error: 'Internal server error',
      requestId,
    }, { status: 500 })
  }
}
