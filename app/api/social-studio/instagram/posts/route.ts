import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getInstagramAccessTokenForLocation, InstagramAuthError } from '@/lib/instagram/tokens'
import { API_BASE, API_VERSION } from '@/lib/instagram/publish-helpers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Constants
const MAX_PAGES = 10
const PAGE_LIMIT = 50
const FETCH_TIMEOUT_MS = 15000
const MAX_RETRIES = 3
const RETRY_DELAYS = [400, 1200, 2500] // ms with jitter
const CACHE_TTL_MS = 60000 // 60 seconds

// In-memory cache
interface CacheEntry {
  items: any[]
  timestamp: number
  fbtrace_id?: string
}

const cache = new Map<string, CacheEntry>()

/**
 * Generate cache key
 */
function getCacheKey(userId: string, businessLocationId: string, start: string, end: string): string {
  return `${userId}|${businessLocationId}|${start}|${end}`
}

/**
 * Get cached data if available and not expired
 */
function getCached(key: string): CacheEntry | null {
  const entry = cache.get(key)
  if (!entry) return null
  
  const age = Date.now() - entry.timestamp
  if (age > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  
  return entry
}

/**
 * Set cache entry
 */
function setCached(key: string, items: any[], fbtrace_id?: string): void {
  cache.set(key, {
    items,
    timestamp: Date.now(),
    fbtrace_id,
  })
}

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
 * Get retry delay with jitter
 */
function getRetryDelay(attempt: number): number {
  const baseDelay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1]
  const jitter = Math.random() * 0.3 * baseDelay // ±30% jitter
  return baseDelay + jitter
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  requestId: string
): Promise<Response> {
  let lastError: Error | null = null
  let lastResponse: Response | null = null
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { controller, timeoutId, signal } = withTimeout(FETCH_TIMEOUT_MS)
      const fetchOptions = { ...options, signal }
      
      const response = await fetch(url, fetchOptions)
      clearTimeout(timeoutId)
      
      // Check response body for OAuthException code 2 (even for 500 errors)
      let responseData: any = null
      let isTransientError = false
      try {
        responseData = await response.clone().json()
        // Check for OAuthException code 2 with is_transient
        if (responseData?.error?.code === 2 && responseData?.error?.is_transient === true) {
          isTransientError = true
        }
      } catch (e) {
        // Not JSON or parse failed, continue with status check
      }
      
      // Check if it's a retryable error (5xx status OR transient OAuthException)
      if ((response.status >= 500 || response.status === 502 || response.status === 503 || response.status === 504) || isTransientError) {
        lastResponse = response
        if (attempt < MAX_RETRIES - 1) {
          const delay = getRetryDelay(attempt)
          const errorType = isTransientError ? 'Transient OAuthException' : `Retryable ${response.status} error`
          console.log(`[IG Posts] ${errorType}, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`, { requestId })
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
      }
      
      return response
    } catch (error: any) {
      clearTimeout((error as any).timeoutId)
      lastError = error
      
      // Network errors are retryable
      if (error.name === 'AbortError' || error.name === 'TypeError') {
        if (attempt < MAX_RETRIES - 1) {
          const delay = getRetryDelay(attempt)
          console.log(`[IG Posts] Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`, { requestId, error: error.message })
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
      }
      
      // Non-retryable error or max retries reached
      throw error
    }
  }
  
  // If we exhausted retries, return the last response or throw the last error
  if (lastResponse) {
    return lastResponse
  }
  
  throw lastError || new Error('Max retries exceeded')
}

/**
 * Safe JSON fetch helper
 */
async function safeFetchJson(url: string, options: RequestInit, requestId: string): Promise<any> {
  const response = await fetchWithRetry(url, options, requestId)
  return response.json()
}

export async function GET(request: NextRequest) {
  const requestId = generateRequestId()
  
  try {
    console.log(`[IG Posts] start`, { requestId })
    
    const { searchParams } = new URL(request.url)
    const businessLocationId = searchParams.get('businessLocationId')
    const start = searchParams.get('start')
    const end = searchParams.get('end')
    const limit = searchParams.get('limit')

    if (!businessLocationId) {
      return NextResponse.json(
        { ok: false, error: 'Missing businessLocationId', requestId },
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

    // Check cache first
    const cacheKey = getCacheKey(user.id, businessLocationId, start || '', end || '')
    const cached = getCached(cacheKey)
    if (cached) {
      console.log(`[IG Posts] cache_hit`, { requestId, itemCount: cached.items.length })
      return NextResponse.json({
        ok: true,
        range: { start, end },
        items: cached.items,
        diagnostics: {
          cached: true,
          fbtrace_id: cached.fbtrace_id,
        },
        requestId,
      })
    }

    console.log(`[IG Posts] validate_input`, { requestId, businessLocationId, start, end, limit })

    // Parse and validate date range
    let startDate: Date
    let endDate: Date

    if (start && end) {
      startDate = new Date(start)
      endDate = new Date(end)
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json(
          { ok: false, error: 'Invalid date range', requestId },
          { status: 400 }
        )
      }
    } else {
      // Default: current month ± 7 days
      const now = new Date()
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      startDate.setDate(startDate.getDate() - 7)
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      endDate.setDate(endDate.getDate() + 7)
    }

    // Clamp date range to max 120 days
    const maxRangeDays = 120
    const requestedRangeDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    if (requestedRangeDays > maxRangeDays) {
      const midpoint = new Date((startDate.getTime() + endDate.getTime()) / 2)
      startDate = new Date(midpoint)
      startDate.setDate(startDate.getDate() - maxRangeDays / 2)
      endDate = new Date(midpoint)
      endDate.setDate(endDate.getDate() + maxRangeDays / 2)
      console.log(`[IG Posts] clamped_date_range`, { requestId, requestedRangeDays, clampedTo: maxRangeDays })
    }

    // Get Instagram access token
    let accessToken: string
    let igAccountId: string

    try {
      console.log(`[IG Posts] resolve_token`, { requestId, businessLocationId })
      const tokenData = await getInstagramAccessTokenForLocation(businessLocationId)
      accessToken = tokenData.access_token
      igAccountId = tokenData.ig_account_id
      
      console.log(`[IG Posts] token_resolved`, { requestId, igAccountId, hasToken: !!accessToken })
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
        return NextResponse.json(
          {
            ok: false,
            error: 'Instagram not connected',
            requestId,
          },
          { status: 404 }
        )
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

    // Validate igAccountId format
    if (!igAccountId || !/^\d+$/.test(igAccountId)) {
      console.error(`[IG Posts] invalid_ig_account_id`, { requestId, igAccountId })
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid Instagram account ID',
          requestId,
        },
        { status: 400 }
      )
    }

    // Sanity check: verify token and account match
    const meUrl = new URL(`${API_BASE}/${API_VERSION}/me`)
    meUrl.searchParams.set('fields', 'id,username')
    meUrl.searchParams.set('access_token', accessToken)

    let meData: any = null
    try {
      const meResponse = await safeFetchJson(meUrl.toString(), { method: 'GET' }, requestId)
      if (meResponse.id) {
        meData = meResponse
        console.log(`[IG Posts] me_check`, { requestId, meId: meData.id, storedIgAccountId: igAccountId, match: meData.id === igAccountId })
        
        // If IDs don't match, use /me/media instead
        if (meData.id !== igAccountId) {
          console.log(`[IG Posts] account_id_mismatch, using /me/media`, { requestId, meId: meData.id, storedId: igAccountId })
        }
      }
    } catch (error: any) {
      console.warn(`[IG Posts] me_check_failed`, { requestId, error: error.message })
      // Continue anyway - might still work with stored ID
    }

    // Build media endpoint URL
    const mediaEndpoint = meData && meData.id !== igAccountId 
      ? `${API_BASE}/${API_VERSION}/me/media`
      : `${API_BASE}/${API_VERSION}/${igAccountId}/media`

    console.log(`[IG Posts] calling_api`, { requestId, endpoint: mediaEndpoint, startDate: startDate.toISOString(), endDate: endDate.toISOString() })

    // Convert dates to Unix timestamps for filtering
    const sinceTimestamp = Math.floor(startDate.getTime() / 1000)
    const untilTimestamp = Math.floor(endDate.getTime() / 1000)

    // Build initial request URL
    const initialUrl = new URL(mediaEndpoint)
    initialUrl.searchParams.set('fields', 'id,caption,media_type,timestamp')
    initialUrl.searchParams.set('access_token', accessToken)
    // Note: Instagram API doesn't support since/until on /media endpoint, so we'll filter client-side

    const allItems: any[] = []
    let nextPageUrl: string | null = null
    let pageCount = 0
    let fbtrace_id: string | undefined

    // Paginate through results
    do {
      const url = nextPageUrl || initialUrl.toString()
      const response = await safeFetchJson(url, { method: 'GET' }, requestId)
      
      if (response.error) {
        fbtrace_id = response.error.fbtrace_id
        const errorCode = response.error.code
        const errorMessage = response.error.message || 'Unknown error'
        const errorType = response.error.type || 'Unknown'
        const isTransient = response.error.is_transient === true || response.error.code === 2

        console.error(`[IG Posts] api_error`, {
          requestId,
          errorCode,
          errorMessage,
          errorType,
          isTransient,
          fbtrace_id,
        })

        // Check cache for fallback
        const cached = getCached(cacheKey)
        if (cached && cached.items.length > 0) {
          console.log(`[IG Posts] returning_cached_on_error`, { requestId, itemCount: cached.items.length, fbtrace_id })
          return NextResponse.json({
            ok: true,
            range: { start, end },
            items: cached.items,
            transient: true,
            error: errorMessage,
            fbtrace_id,
            requestId,
          })
        }

        // Return error response
        return NextResponse.json(
          {
            ok: false,
            error: errorMessage,
            step: 'calling_api',
            requestId,
            errorDetails: {
              code: errorCode,
              type: errorType,
              fbtrace_id,
              is_transient: isTransient,
            },
          },
          { status: 502 }
        )
      }

      if (response.data && Array.isArray(response.data)) {
        allItems.push(...response.data)
      }

      // Check if we should continue paginating
      if (response.paging && response.paging.cursors && response.paging.cursors.after) {
        // Check if oldest item is before start date (with 3-day buffer)
        if (allItems.length > 0) {
          const oldestItem = allItems[allItems.length - 1]
          if (oldestItem.timestamp) {
            // Parse timestamp (ISO string or Unix seconds)
            let itemTimestamp: number
            if (typeof oldestItem.timestamp === 'string') {
              itemTimestamp = Math.floor(new Date(oldestItem.timestamp).getTime() / 1000)
            } else {
              itemTimestamp = oldestItem.timestamp
            }
            
            // If oldest item is more than 3 days before start, stop paginating
            if (itemTimestamp < sinceTimestamp - (3 * 24 * 60 * 60)) {
              console.log(`[IG Posts] early_exit`, { requestId, itemTimestamp, sinceTimestamp, itemCount: allItems.length })
              break
            }
          }
        }
        
        nextPageUrl = `${mediaEndpoint}?fields=id,caption,media_type,timestamp&access_token=${accessToken}&after=${response.paging.cursors.after}`
        pageCount++
      } else {
        nextPageUrl = null
      }

      // Hard caps
      if (pageCount >= MAX_PAGES) {
        console.log(`[IG Posts] max_pages_reached`, { requestId, pageCount: MAX_PAGES })
        break
      }
      if (allItems.length >= (limit ? parseInt(limit, 10) : PAGE_LIMIT * MAX_PAGES)) {
        console.log(`[IG Posts] max_items_reached`, { requestId, itemCount: allItems.length })
        break
      }
    } while (nextPageUrl)

    console.log(`[IG Posts] fetch_username`, { requestId, igAccountId })
    
    // Fetch username once
    let username: string | null = null
    try {
      const usernameUrl = new URL(`${API_BASE}/${API_VERSION}/${igAccountId}`)
      usernameUrl.searchParams.set('fields', 'username')
      usernameUrl.searchParams.set('access_token', accessToken)
      const usernameResponse = await safeFetchJson(usernameUrl.toString(), { method: 'GET' }, requestId)
      if (usernameResponse.username) {
        username = usernameResponse.username
      }
    } catch (error: any) {
      console.warn(`[IG Posts] username_fetch_failed`, { requestId, error: error.message })
    }

    // Filter items by date range and normalize
    const normalized: any[] = []
    for (const item of allItems) {
      if (!item.id || !item.timestamp) continue

      // Parse timestamp (ISO string or Unix seconds)
      let itemTimestamp: number
      if (typeof item.timestamp === 'string') {
        itemTimestamp = Math.floor(new Date(item.timestamp).getTime() / 1000)
      } else {
        itemTimestamp = item.timestamp
      }

      // Filter to date range
      if (itemTimestamp < sinceTimestamp || itemTimestamp > untilTimestamp) {
        continue
      }

      // Normalize to EventInput format
      const eventDate = new Date(itemTimestamp * 1000)
      normalized.push({
        id: `ig_${item.id}`,
        title: item.caption ? (item.caption.length > 50 ? item.caption.substring(0, 50) + '...' : item.caption) : 'Instagram Post',
        start: eventDate.toISOString(),
        allDay: false,
        extendedProps: {
          platform: 'instagram',
          status: 'published',
          media_type: item.media_type || 'IMAGE',
          permalink: `https://www.instagram.com/p/${item.id}/`,
          like_count: 0, // Will be fetched on-demand
          comments_count: 0, // Will be fetched on-demand
          mediaUrl: null, // Will be fetched on-demand
          thumbnail_url: null, // Will be fetched on-demand
          isLiveInstagram: true,
        },
      })
    }

    console.log(`[IG Posts] success`, { requestId, totalFetched: allItems.length, normalized: normalized.length, pageCount })

    // Cache the results
    setCached(cacheKey, normalized, fbtrace_id)

    return NextResponse.json({
      ok: true,
      range: { start: startDate.toISOString(), end: endDate.toISOString() },
      items: normalized,
      diagnostics: {
        totalFetched: allItems.length,
        normalized: normalized.length,
        pageCount,
        username,
        fbtrace_id,
      },
      requestId,
    })
  } catch (error: any) {
    console.error(`[IG Posts] unexpected_error`, {
      requestId,
      error: error.message,
      stack: error.stack,
    })
    
    return NextResponse.json(
      {
        ok: false,
        error: 'Internal server error',
        step: 'unexpected_error',
        requestId,
      },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  const requestId = generateRequestId()
  
  try {
    console.log(`[IG Delete] start`, { requestId })
    
    const { searchParams } = new URL(request.url)
    const businessLocationId = searchParams.get('businessLocationId')
    const mediaId = searchParams.get('mediaId')

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
    let igAccountId: string

    try {
      console.log(`[IG Delete] resolve_token`, { requestId, businessLocationId })
      const tokenData = await getInstagramAccessTokenForLocation(businessLocationId)
      accessToken = tokenData.access_token
      igAccountId = tokenData.ig_account_id
      
      console.log(`[IG Delete] token_resolved`, { requestId, igAccountId, hasToken: !!accessToken })
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
        return NextResponse.json(
          {
            ok: false,
            error: 'Instagram not connected',
            requestId,
          },
          { status: 404 }
        )
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

    // Attempt to delete the media
    const deleteUrl = new URL(`${API_BASE}/${API_VERSION}/${mediaId}`)
    deleteUrl.searchParams.set('access_token', accessToken)

    console.log(`[IG Delete] calling_api`, { requestId, mediaId, igAccountId, url: deleteUrl.toString().replace(accessToken, '***') })

    try {
      const { controller, timeoutId, signal } = withTimeout(FETCH_TIMEOUT_MS)
      const response = await fetch(deleteUrl.toString(), {
        method: 'DELETE',
        signal,
      })
      clearTimeout(timeoutId)

      const data = await response.json().catch(() => ({}))

      if (response.ok) {
        console.log(`[IG Delete] success`, { requestId, mediaId, igAccountId, status: response.status })
        return NextResponse.json({
          ok: true,
          requestId,
        })
      }

      // Check if deletion is not supported
      const errorMessage = data.error?.message?.toLowerCase() || ''
      const errorCode = data.error?.code
      const errorType = data.error?.type || ''
      const fbtrace_id = data.error?.fbtrace_id

      if (
        response.status === 400 &&
        (errorMessage.includes('unsupported') ||
         errorMessage.includes('not supported') ||
         errorMessage.includes('cannot delete') ||
         errorType === 'UnsupportedDeleteRequestException')
      ) {
        console.log(`[IG Delete] not_supported`, { requestId, mediaId, igAccountId, errorMessage, errorCode, fbtrace_id })
        return NextResponse.json(
          {
            ok: false,
            reason: 'INSTAGRAM_DELETE_NOT_SUPPORTED',
            requestId,
          },
          { status: 501 }
        )
      }

      // Other errors
      console.error(`[IG Delete] api_error`, {
        requestId,
        mediaId,
        igAccountId,
        status: response.status,
        errorCode,
        errorMessage,
        errorType,
        fbtrace_id,
      })

      return NextResponse.json(
        {
          ok: false,
          error: errorMessage || 'Failed to delete post',
          requestId,
          errorDetails: {
            code: errorCode,
            type: errorType,
            fbtrace_id,
          },
        },
        { status: response.status >= 400 && response.status < 500 ? response.status : 500 }
      )
    } catch (error: any) {
      console.error(`[IG Delete] unexpected_error`, {
        requestId,
        mediaId,
        igAccountId,
        error: error.message,
        stack: error.stack,
      })
      
      return NextResponse.json(
        {
          ok: false,
          error: 'Internal server error',
          requestId,
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error(`[IG Delete] unexpected_error`, {
      requestId,
      error: error.message,
      stack: error.stack,
    })
    
    return NextResponse.json(
      {
        ok: false,
        error: 'Internal server error',
        requestId,
      },
      { status: 500 }
    )
  }
}
