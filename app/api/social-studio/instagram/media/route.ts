import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramAccessTokenForLocation, InstagramAuthError } from '@/lib/instagram/tokens'
import { API_BASE, API_VERSION } from '@/lib/instagram/publish-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Constants
const MAX_RANGE_DAYS = 120
const MAX_PAGES = 10
const MAX_ITEMS = 500
const FETCH_TIMEOUT_MS = 15000
const USERNAME_FETCH_TIMEOUT_MS = 5000

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
 * Fetch with exponential backoff retry for 500 errors
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  requestId: string
): Promise<Response> {
  let lastError: Error | null = null
  let lastResponse: Response | null = null
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[IG Media] Fetch attempt ${attempt + 1}/${maxRetries}`, { requestId, url: url.replace(/access_token=[^&]+/, 'access_token=***') })
      
      const response = await fetch(url, options)
      lastResponse = response
      
      // If 500 error, retry with exponential backoff
      if (response.status === 500 && attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
        console.warn(`[IG Media] Got 500 error on attempt ${attempt + 1}, retrying in ${waitTime}ms...`, {
          requestId,
          status: response.status,
          attempt: attempt + 1,
          maxRetries,
        })
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }
      
      return response
    } catch (error: any) {
      lastError = error
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt) * 1000
        console.warn(`[IG Media] Network error on attempt ${attempt + 1}, retrying in ${waitTime}ms...`, {
          requestId,
          errorName: error?.name,
          errorMessage: error?.message,
          attempt: attempt + 1,
          maxRetries,
        })
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }
    }
  }
  
  // If we have a response, return it (even if it's a 500)
  if (lastResponse) {
    return lastResponse
  }
  
  throw lastError || new Error('Max retries exceeded')
}

/**
 * Safe fetch with timeout, retry logic, and structured error handling
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
  retryable?: boolean
}> {
  const { controller, timeoutId, signal } = withTimeout(timeoutMs)
  
  try {
    // Use retry logic for the fetch call
    const response = await fetchWithRetry(url, { ...init, signal }, 3, requestId)
    clearTimeout(timeoutId)
    
    const responseText = await response.text()
    let data: any = null
    
    try {
      data = JSON.parse(responseText)
    } catch (parseError) {
      console.log(`[IG Media] ${step} - JSON parse failed:`, { requestId, status: response.status, textPreview: responseText.substring(0, 200) })
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
      
      // Detailed error logging for 500 responses
      if (response.status === 500) {
        console.error('[IG Media] API 500 error:', {
          requestId,
          status: response.status,
          statusText: response.statusText,
          error: error,
          errorCode: error.code,
          errorMessage: error.message,
          fbtrace_id: error.fbtrace_id,
          url: url.replace(/access_token=[^&]+/, 'access_token=***'),
          responseBody: responseText.substring(0, 500),
        })
      } else {
        console.log(`[IG Media] ${step} - API error:`, {
          requestId,
          status: response.status,
          code: error.code,
          message: error.message,
          fbtrace_id: error.fbtrace_id,
        })
      }
      
      return {
        ok: false,
        status: response.status,
        error: error.message || `HTTP ${response.status}`,
        step,
        data,
        retryable: response.status === 500, // Mark 500 errors as retryable
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
      console.log(`[IG Media] ${step} - Timeout:`, { requestId, timeoutMs })
      return {
        ok: false,
        status: 504,
        error: `Request timeout after ${timeoutMs}ms`,
        step,
      }
    }
    
    console.log(`[IG Media] ${step} - Fetch error:`, {
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
 * GET /api/social-studio/instagram/media?businessLocationId=...&start=YYYY-MM-DD&end=YYYY-MM-DD&limit=...
 * 
 * Fetch Instagram posts directly from Instagram Graph API (NO DB)
 * Returns posts in calendar event format for Planner
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId()
  const step = 'start'
  
  try {
    console.log(`[IG Media] ${step} - Request received:`, { requestId, url: request.url })
    
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      console.log(`[IG Media] ${step} - Unauthorized:`, { requestId })
      return NextResponse.json(
        { ok: false, error: 'Unauthorized', step: 'authenticate', requestId },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const businessLocationId = searchParams.get('businessLocationId')
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')
    const limitParam = searchParams.get('limit')

    console.log(`[IG Media] ${step} - Parameters:`, {
      requestId,
      businessLocationId,
      startParam,
      endParam,
      limitParam,
    })

    // Validate input
    if (!businessLocationId) {
      return NextResponse.json(
        { ok: false, error: 'Missing required parameter: businessLocationId', step: 'validate_input', requestId },
        { status: 400 }
      )
    }

    if (!startParam || !endParam) {
      return NextResponse.json(
        { ok: false, error: 'Missing required parameters: start and end dates', step: 'validate_input', requestId },
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

    // Parse and validate date range
    let startDate: Date
    let endDate: Date
    let sinceTimestamp: number
    let untilTimestamp: number
    let clamped = false
    let originalRange: { start: string; end: string } | null = null

    try {
      startDate = new Date(startParam)
      if (isNaN(startDate.getTime())) {
        throw new Error(`Invalid start date: ${startParam}`)
      }
      
      endDate = new Date(endParam)
      if (isNaN(endDate.getTime())) {
        throw new Error(`Invalid end date: ${endParam}`)
      }

      if (endDate < startDate) {
        throw new Error('End date must be after start date')
      }

      // Clamp to max range (120 days)
      const rangeDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      if (rangeDays > MAX_RANGE_DAYS) {
        originalRange = {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        }
        // Keep start date, clamp end date to MAX_RANGE_DAYS
        endDate = new Date(startDate)
        endDate.setDate(endDate.getDate() + MAX_RANGE_DAYS)
        clamped = true
        console.log(`[IG Media] validate_input - Range clamped:`, {
          requestId,
          originalDays: rangeDays,
          clampedDays: MAX_RANGE_DAYS,
          originalEnd: originalRange.end,
          clampedEnd: endDate.toISOString(),
        })
      }

      sinceTimestamp = Math.floor(startDate.getTime() / 1000)
      untilTimestamp = Math.floor(endDate.getTime() / 1000)

      // Enhanced date range validation and logging
      const daysDifference = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      
      console.log(`[IG Media] validate_input - Date range details:`, {
        requestId,
        startParam: startParam,
        endParam: endParam,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        daysDifference,
        isStartBeforeEnd: startDate < endDate,
        sinceUnix: sinceTimestamp,
        untilUnix: untilTimestamp,
        clamped,
        originalRange,
      })
      
      // Validate date range
      if (startDate >= endDate) {
        return NextResponse.json({
          ok: false,
          error: 'Invalid date range: start date must be before end date',
          step: 'validate_input',
          requestId,
        }, { status: 400 })
      }
    } catch (dateError: any) {
      console.log(`[IG Media] validate_input - Date parsing error:`, {
        requestId,
        error: dateError.message,
      })
      return NextResponse.json(
        { ok: false, error: `Invalid date range: ${dateError.message}`, step: 'validate_input', requestId },
        { status: 400 }
      )
    }

    // Get Instagram access token and account ID
    let accessToken: string
    let igAccountId: string
    let tokenScopes: string[] = []

    try {
      const tokenData = await getInstagramAccessTokenForLocation(businessLocationId)
      accessToken = tokenData.access_token
      igAccountId = tokenData.ig_account_id
      
      // Fetch scopes from database
      const { data: connection } = await supabase
        .from('instagram_connections')
        .select('scopes, token_expires_at')
        .eq('business_location_id', businessLocationId)
        .maybeSingle()
      
      if (connection && connection.scopes) {
        tokenScopes = Array.isArray(connection.scopes) ? connection.scopes : []
      }
      
      // Add debug endpoint to check scopes
      if (searchParams.get('debug') === 'scopes') {
        return NextResponse.json({
          ok: true,
          debug: {
            tokenScopes: tokenScopes,
            tokenScopesType: typeof tokenScopes,
            tokenScopesIsArray: Array.isArray(tokenScopes),
            tokenScopesLength: tokenScopes.length,
            tokenExpiry: connection?.token_expires_at || null,
            igAccountId: igAccountId,
            hasBasicScope: tokenScopes.includes('instagram_business_basic'),
            hasPublishScope: tokenScopes.includes('instagram_business_content_publish'),
            hasInsightsScope: tokenScopes.includes('instagram_business_manage_insights'),
            allScopes: tokenScopes,
          },
          requestId,
        })
      }
      
      // Account ID validation
      console.log('[IG Media] Account ID validation:', {
        requestId,
        igAccountId,
        type: typeof igAccountId,
        length: igAccountId?.length,
        endsWithO: igAccountId?.endsWith('O'),
        lastChars: igAccountId?.slice(-5),
        isNumeric: /^\d+$/.test(igAccountId),
      })
      
      // Validate account ID format
      if (!igAccountId || !/^\d+$/.test(igAccountId)) {
        console.error('[IG Media] Invalid Instagram account ID format:', {
          requestId,
          igAccountId,
          type: typeof igAccountId,
        })
        return NextResponse.json({
          ok: false,
          error: 'Invalid Instagram account configuration. Please reconnect your account.',
          step: 'resolve_token',
          needs_reauth: true,
          requestId,
          debug: {
            accountId: igAccountId,
            accountIdType: typeof igAccountId,
          },
        }, { status: 400 })
      }
      
      // Check token scopes
      const requiredScopes = ['instagram_business_basic']
      console.log('[IG Media] Detailed scope check:', {
        requestId,
        businessLocationId,
        tokenScopes: tokenScopes,
        scopesType: typeof tokenScopes,
        isArray: Array.isArray(tokenScopes),
        scopesLength: tokenScopes.length,
        individualScopes: tokenScopes,
        required: requiredScopes,
        hasBasic: tokenScopes.includes('instagram_business_basic'),
        hasPublish: tokenScopes.includes('instagram_business_content_publish'),
        hasInsights: tokenScopes.includes('instagram_business_manage_insights'),
      })
      
      const missingScopes = requiredScopes.filter(scope => !tokenScopes.includes(scope))
      if (missingScopes.length > 0) {
        console.error('[IG Media] Missing required scopes:', {
          requestId,
          missing: missingScopes,
          available: tokenScopes,
        })
        return NextResponse.json({
          ok: false,
          error: `Missing Instagram permissions: ${missingScopes.join(', ')}. Please reconnect your account.`,
          step: 'resolve_token',
          needs_reauth: true,
          requestId,
          debug: {
            missingScopes,
            availableScopes: tokenScopes,
          },
        }, { status: 403 })
      }
      
      console.log(`[IG Media] resolve_token - Token loaded:`, {
        requestId,
        igAccountId,
        hasToken: !!accessToken,
        tokenLength: accessToken?.length,
        scopesCount: tokenScopes.length,
      })
    } catch (error: any) {
      console.log(`[IG Media] resolve_token - Token error:`, {
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
        // Not connected - return empty array (non-blocking)
        return NextResponse.json({
          ok: true,
          range: { start: startDate.toISOString(), end: endDate.toISOString() },
          items: [],
          clamped,
          originalRange,
          requestId,
        })
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

    const limit = limitParam ? Math.min(parseInt(limitParam), 25) : 25

    // Test token with /me endpoint first
    console.log('[IG Media] Testing token with /me endpoint...', { requestId })
    const testUrl = `${API_BASE}/${API_VERSION}/${igAccountId}?fields=id,username&access_token=${accessToken}`
    
    try {
      const testResponse = await fetch(testUrl)
      const testData = await testResponse.json()
      
      console.log('[IG Media] Token test result:', {
        requestId,
        status: testResponse.status,
        ok: testResponse.ok,
        data: testData,
        error: testData.error,
        errorCode: testData.error?.code,
        errorMessage: testData.error?.message,
      })
      
      if (!testResponse.ok) {
        console.error('[IG Media] Token test failed - token may be invalid:', {
          requestId,
          status: testResponse.status,
          error: testData.error,
        })
        return NextResponse.json({
          ok: false,
          error: 'Instagram authentication failed. Please reconnect your account.',
          step: 'token_test',
          needs_reauth: true,
          requestId,
          debug: testData,
        }, { status: 401 })
      }
      
      console.log('[IG Media] Token test successful:', {
        requestId,
        userId: testData.id,
        username: testData.username,
      })
    } catch (error: any) {
      console.error('[IG Media] Token test error:', {
        requestId,
        errorName: error?.name,
        errorMessage: error?.message,
      })
      return NextResponse.json({
        ok: false,
        error: 'Failed to verify Instagram token. Please reconnect your account.',
        step: 'token_test',
        needs_reauth: true,
        requestId,
      }, { status: 500 })
    }

    console.log(`[IG Media] calling_api - Starting fetch:`, {
      requestId,
      igAccountId,
      range: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        since: sinceTimestamp,
        until: untilTimestamp,
      },
      limit,
      maxPages: MAX_PAGES,
      maxItems: MAX_ITEMS,
    })

    // Fetch media with pagination
    const allMedia: any[] = []
    let nextPageToken: string | undefined = undefined
    let pageCount = 0
    let oldestTimestamp: number | null = null
    let partial = false

    // Request fields needed for Planner + Inspector
    const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count'

    do {
      pageCount++

      if (pageCount > MAX_PAGES) {
        console.log(`[IG Media] calling_api - Max pages reached:`, { requestId, pageCount, maxPages: MAX_PAGES })
        partial = true
        break
      }

      if (allMedia.length >= MAX_ITEMS) {
        console.log(`[IG Media] calling_api - Max items reached:`, { requestId, itemCount: allMedia.length, maxItems: MAX_ITEMS })
        partial = true
        break
      }

      // Build API URL - Instagram uses /{igAccountId}/media endpoint
      const apiUrl = new URL(`${API_BASE}/${API_VERSION}/${igAccountId}/media`)
      apiUrl.searchParams.set('fields', fields)
      apiUrl.searchParams.set('limit', limit.toString())
      
      // Add date filters (can be tested without them by adding ?skipDateFilters=true to URL)
      const skipDateFilters = searchParams.get('skipDateFilters') === 'true'
      
      if (!skipDateFilters) {
        apiUrl.searchParams.set('since', sinceTimestamp.toString())
        apiUrl.searchParams.set('until', untilTimestamp.toString())
      } else {
        console.log(`[IG Media] calling_api - Testing without date filters (diagnostic mode):`, {
          requestId,
          pageCount,
        })
      }

      if (nextPageToken && nextPageToken !== 'has_next') {
        apiUrl.searchParams.set('after', nextPageToken)
      }

      // Add access token as query parameter (Instagram API style)
      apiUrl.searchParams.set('access_token', accessToken)

      const apiUrlWithoutToken = apiUrl.toString().replace(/access_token=[^&]+/, 'access_token=***')
      console.log(`[IG Media] calling_api - Fetching page ${pageCount}:`, {
        requestId,
        url: apiUrlWithoutToken,
        hasNextToken: !!nextPageToken,
        hasDateFilters: !skipDateFilters,
        since: skipDateFilters ? 'SKIPPED' : sinceTimestamp,
        until: skipDateFilters ? 'SKIPPED' : untilTimestamp,
      })

      const fetchResult = await safeFetchJson(
        apiUrl.toString(),
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

        // Special handling for 500 errors (after retries exhausted)
        if (fetchResult.status === 500) {
          return NextResponse.json(
            {
              ok: false,
              error: 'Instagram servers are temporarily unavailable. Please try again in a few moments.',
              errorDetails: fetchResult.data?.error,
              step: 'calling_api',
              requestId,
              meta: fetchResult.data?.error,
              responseBody: fetchResult.responseBody,
              retryable: true,
            },
            { status: 500 }
          )
        }

        return NextResponse.json(
          {
            ok: false,
            error: fetchResult.error || 'Failed to fetch media from Instagram',
            step: 'calling_api',
            requestId,
            meta: fetchResult.data?.error,
            responseBody: fetchResult.responseBody,
          },
          { status: fetchResult.status >= 500 ? 502 : fetchResult.status }
        )
      }

      const responseData = fetchResult.data
      const pageMedia = responseData.data || []

      console.log(`[IG Media] calling_api - Page ${pageCount} response:`, {
        requestId,
        itemsInPage: pageMedia.length,
        totalSoFar: allMedia.length + pageMedia.length,
        hasNext: !!responseData.paging?.next || !!responseData.paging?.cursors?.after,
      })

      allMedia.push(...pageMedia)

      // Track oldest timestamp in this page
      if (pageMedia.length > 0) {
        const timestamps = pageMedia
          .map((m: any) => {
            const ts = m.timestamp ? new Date(m.timestamp).getTime() / 1000 : null
            return ts
          })
          .filter((ts: any) => ts !== null)

        if (timestamps.length > 0) {
          const pageOldest = Math.min(...timestamps)
          if (oldestTimestamp === null || pageOldest < oldestTimestamp) {
            oldestTimestamp = pageOldest
          }
        }
      }

      // Stop conditions:
      // 1. No more pages
      // 2. Oldest post in current page is before start date (minus 3 day buffer)
      const bufferSeconds = 3 * 24 * 60 * 60 // 3 days
      if (oldestTimestamp && oldestTimestamp < sinceTimestamp - bufferSeconds) {
        console.log(`[IG Media] calling_api - Stopping: oldest post before range:`, {
          requestId,
          oldestTimestamp,
          sinceTimestamp,
        })
        break
      }

      // Extract actual next token from paging.next URL if available
      if (responseData.paging?.next) {
        try {
          const nextUrl = new URL(responseData.paging.next)
          nextPageToken = nextUrl.searchParams.get('after') || undefined
        } catch (e) {
          nextPageToken = undefined
        }
      } else if (responseData.paging?.cursors?.after) {
        nextPageToken = responseData.paging.cursors.after
      } else {
        nextPageToken = undefined
      }
    } while (nextPageToken && allMedia.length < MAX_ITEMS && pageCount < MAX_PAGES)

    console.log(`[IG Media] calling_api - Pagination complete:`, {
      requestId,
      pagesFetched: pageCount,
      totalFetched: allMedia.length,
      partial,
    })

    // Filter server-side to exact date range [start, end] (inclusive)
    const filteredItems = allMedia.filter((item: any) => {
      if (!item.timestamp) return false

      const itemDate = new Date(item.timestamp)
      return itemDate >= startDate && itemDate <= endDate
    })

    console.log(`[IG Media] calling_api - Filtered items:`, {
      requestId,
      beforeFilter: allMedia.length,
      afterFilter: filteredItems.length,
    })

    // Optionally fetch username from /me endpoint (once, not per item)
    let username: string | null = null
    try {
      const meUrl = new URL(`${API_BASE}/${API_VERSION}/me`)
      meUrl.searchParams.set('fields', 'username')
      meUrl.searchParams.set('access_token', accessToken)

      const meResult = await safeFetchJson(
        meUrl.toString(),
        {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        },
        'fetch_username',
        requestId,
        USERNAME_FETCH_TIMEOUT_MS
      )

      if (meResult.ok && meResult.data) {
        username = meResult.data.username || null
        console.log(`[IG Media] fetch_username - Success:`, { requestId, username })
      }
    } catch (e) {
      // Username fetch is optional, continue without it
      console.log(`[IG Media] fetch_username - Failed (non-critical):`, { requestId, error: (e as any)?.message })
    }

    // Normalize data for Planner (matching requested format)
    const normalizedItems = filteredItems.map((item: any) => ({
      id: item.id,
      timestamp: item.timestamp,
      caption: item.caption || '',
      mediaType: item.media_type || 'IMAGE',
      mediaUrl: item.media_url || null,
      thumbUrl: item.thumbnail_url || null,
      permalink: item.permalink || '',
      // Also include original field names for backward compatibility
      media_type: item.media_type || 'IMAGE',
      media_url: item.media_url || null,
      thumbnail_url: item.thumbnail_url || null,
      like_count: item.like_count || 0,
      comments_count: item.comments_count || 0,
      username: username,
    }))

    console.log(`[IG Media] success - Returning response:`, {
      requestId,
      itemsCount: normalizedItems.length,
      partial,
      clamped,
    })

    return NextResponse.json({
      ok: true,
      range: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      items: normalizedItems,
      partial,
      clamped,
      originalRange,
      diagnostics: {
        igAccountId,
        pagesFetched: pageCount,
        totalFetched: allMedia.length,
        totalReturned: normalizedItems.length,
      },
      requestId,
    })
  } catch (error: any) {
    console.error(`[IG Media] unexpected_error - Caught:`, {
      requestId,
      errorName: error?.name,
      errorMessage: error?.message,
      errorStack: error?.stack?.substring(0, 500),
      errorType: typeof error,
      errorConstructor: error?.constructor?.name,
    })

    // Extract fbtrace_id if present in error
    const fbtraceId = error.fbtrace_id || error.meta?.fbtrace_id || null

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Internal server error',
        step: 'unexpected_error',
        fbtrace_id: fbtraceId,
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
