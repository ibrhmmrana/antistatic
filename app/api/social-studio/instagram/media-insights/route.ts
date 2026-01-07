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
 * Create a timeout controller (compatible with all Node.js versions)
 */
function withTimeout(ms: number): { controller: AbortController; timeoutId: NodeJS.Timeout; signal: AbortSignal } {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, ms)
  return { controller, timeoutId, signal: controller.signal }
}

/**
 * Safe fetch with timeout and structured error handling
 */
async function safeFetchJson(
  url: string,
  init: RequestInit,
  step: string,
  requestId: string,
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<{
  ok: boolean
  status: number
  data?: any
  error?: string
  step: string
  responseBody?: string
}> {
  const { controller, timeoutId, signal } = withTimeout(timeoutMs)

  try {
    const response = await fetch(url, { ...init, signal })
    clearTimeout(timeoutId)

    const responseText = await response.text()
    let data: any = null

    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.log(`[IG Insights] ${step} - JSON parse failed:`, { requestId, status: response.status, textPreview: responseText.substring(0, 200) })
      return {
        ok: false,
        status: response.status,
        error: 'Failed to parse JSON response',
        step,
        responseBody: responseText.substring(0, 500),
      }
    }

    if (!response.ok) {
      const error = data.error || {}
      console.log(`[IG Insights] ${step} - API error:`, {
        requestId,
        status: response.status,
        code: error.code,
        message: error.message,
        fbtrace_id: error.fbtrace_id,
      })
      return {
        ok: false,
        status: response.status,
        error: error.message || `HTTP ${response.status}`,
        step,
        data,
      }
    }

    return {
      ok: true,
      status: response.status,
      data,
      step,
    }
  } catch (fetchError: any) {
    clearTimeout(timeoutId)

    if (fetchError?.name === 'AbortError') {
      console.log(`[IG Insights] ${step} - Timeout:`, { requestId, timeoutMs })
      return {
        ok: false,
        status: 504,
        error: `Request timeout after ${timeoutMs}ms`,
        step,
      }
    }

    console.log(`[IG Insights] ${step} - Fetch error:`, {
      requestId,
      errorName: fetchError?.name,
      errorMessage: fetchError?.message,
    })
    return {
      ok: false,
      status: 500,
      error: fetchError?.message || 'Network error',
      step,
    }
  }
}

/**
 * GET /api/social-studio/instagram/media-insights?mediaId=...&businessLocationId=...
 * 
 * Fetch Instagram post insights (on-demand, only when post is selected)
 * Requires instagram_business_manage_insights permission
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId()
  const step = 'start'

  try {
    console.log(`[IG Insights] ${step} - Request received:`, { requestId, url: request.url })

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.log(`[IG Insights] ${step} - Unauthorized:`, { requestId })
      return NextResponse.json(
        { ok: false, error: 'Unauthorized', step: 'authenticate', requestId },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const mediaId = searchParams.get('mediaId')
    const businessLocationId = searchParams.get('businessLocationId')

    console.log(`[IG Insights] ${step} - Parameters:`, {
      requestId,
      mediaId,
      businessLocationId,
    })

    // Validate input
    if (!mediaId) {
      return NextResponse.json(
        { ok: false, error: 'Missing required parameter: mediaId', step: 'validate_input', requestId },
        { status: 400 }
      )
    }

    if (!businessLocationId) {
      return NextResponse.json(
        { ok: false, error: 'Missing required parameter: businessLocationId', step: 'validate_input', requestId },
        { status: 400 }
      )
    }

    // Verify business location belongs to user
    const { data: location } = await supabase
      .from('business_locations')
      .select('id')
      .eq('id', businessLocationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!location) {
      return NextResponse.json(
        { ok: false, error: 'Business location not found', step: 'resolve_location', requestId },
        { status: 404 }
      )
    }

    // Get Instagram access token
    let accessToken: string
    let igAccountId: string

    try {
      const tokenData = await getInstagramAccessTokenForLocation(businessLocationId)
      accessToken = tokenData.access_token
      igAccountId = tokenData.ig_account_id

      console.log(`[IG Insights] resolve_token - Token loaded:`, {
        requestId,
        igAccountId,
        hasToken: !!accessToken,
      })
    } catch (error: any) {
      console.log(`[IG Insights] resolve_token - Token error:`, {
        requestId,
        errorType: error?.constructor?.name,
        errorCode: error?.code,
        errorMessage: error?.message,
      })

      if (error instanceof InstagramAuthError) {
        if (error.code === 'EXPIRED') {
          return NextResponse.json(
            {
              ok: false,
              error: 'Instagram access token has expired. Please reconnect your account.',
              step: 'resolve_token',
              needs_reauth: true,
              requestId,
            },
            { status: 401 }
          )
        }
        return NextResponse.json(
          {
            ok: false,
            error: 'Instagram account not connected',
            step: 'resolve_token',
            requestId,
          },
          { status: 404 }
        )
      }

      return NextResponse.json(
        {
          ok: false,
          error: error?.message || 'Failed to load Instagram token',
          step: 'resolve_token',
          requestId,
        },
        { status: 500 }
      )
    }

    // Build insights API URL
    // Instagram Insights API: GET /{media-id}/insights?metric=impressions,reach,engagement,saved
    const insightsUrl = new URL(`${API_BASE}/${API_VERSION}/${mediaId}/insights`)
    insightsUrl.searchParams.set('metric', 'impressions,reach,engagement,saved')
    insightsUrl.searchParams.set('access_token', accessToken)

    const insightsUrlWithoutToken = insightsUrl.toString().replace(/access_token=[^&]+/, 'access_token=***')
    console.log(`[IG Insights] calling_api - Fetching insights:`, {
      requestId,
      mediaId,
      url: insightsUrlWithoutToken,
    })

    const fetchResult = await safeFetchJson(
      insightsUrl.toString(),
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      },
      'calling_api',
      requestId,
      FETCH_TIMEOUT_MS
    )

    if (!fetchResult.ok) {
      if (fetchResult.status === 401) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Authentication failed. Please reconnect your Instagram account.',
            step: 'calling_api',
            needs_reauth: true,
            requestId,
            meta: fetchResult.data?.error,
          },
          { status: 401 }
        )
      }

      // If insights are not available (e.g., missing permission, post too old, etc.)
      // Return gracefully with null metrics instead of error
      if (fetchResult.status === 403 || fetchResult.status === 400) {
        const error = fetchResult.data?.error || {}
        console.log(`[IG Insights] calling_api - Insights unavailable:`, {
          requestId,
          status: fetchResult.status,
          code: error.code,
          message: error.message,
        })
        return NextResponse.json({
          ok: true,
          metrics: null,
          note: 'Insights unavailable for this media',
          reason: error.message || 'Permission denied or media not eligible',
          requestId,
        })
      }

      return NextResponse.json(
        {
          ok: false,
          error: fetchResult.error || 'Failed to fetch insights from Instagram',
          step: 'calling_api',
          requestId,
          meta: fetchResult.data?.error,
          responseBody: fetchResult.responseBody,
        },
        { status: fetchResult.status >= 500 ? 502 : fetchResult.status }
      )
    }

    const insightsData = fetchResult.data

    // Normalize insights data
    // Instagram returns an array of metric objects: [{ name: 'impressions', values: [{ value: 123 }] }, ...]
    const metrics: Record<string, number> = {}
    if (insightsData.data && Array.isArray(insightsData.data)) {
      for (const metric of insightsData.data) {
        if (metric.name && metric.values && Array.isArray(metric.values) && metric.values.length > 0) {
          // Get the latest value (usually the first one, but check for end_time to be sure)
          const latestValue = metric.values[0]
          if (latestValue && typeof latestValue.value === 'number') {
            metrics[metric.name] = latestValue.value
          }
        }
      }
    }

    console.log(`[IG Insights] success - Returning metrics:`, {
      requestId,
      mediaId,
      metricsCount: Object.keys(metrics).length,
      metrics,
    })

    return NextResponse.json({
      ok: true,
      metrics,
      requestId,
    })
  } catch (error: any) {
    console.error(`[IG Insights] unexpected_error - Caught:`, {
      requestId,
      errorName: error?.name,
      errorMessage: error?.message,
      errorStack: error?.stack?.substring(0, 500),
      errorType: typeof error,
      errorConstructor: error?.constructor?.name,
    })

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Internal server error',
        step: 'unexpected_error',
        requestId,
        errorDetails: {
          name: error?.name,
          message: error?.message,
          stack: error?.stack?.substring(0, 500),
          type: typeof error,
          constructor: error?.constructor?.name,
        },
      },
      { status: 500 }
    )
  }
}

