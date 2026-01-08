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
function setCache(key: string, items: any[], fbtrace_id?: string): void {
  cache.set(key, {
    items,
    timestamp: Date.now(),
    fbtrace_id,
  })
  
  // Cleanup old entries (keep cache size reasonable)
  if (cache.size > 100) {
    const oldestKey = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)[0]?.[0]
    if (oldestKey) {
      cache.delete(oldestKey)
    }
  }
}

/**
 * Generate a unique request ID for tracking
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Add jitter to retry delay
 */
function getRetryDelay(attempt: number): number {
  const baseDelay = RETRY_DELAYS[attempt] || RETRY_DELAYS[RETRY_DELAYS.length - 1]
  const jitter = Math.random() * 200 // 0-200ms jitter
  return baseDelay + jitter
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
 * Fetch with retry logic for transient errors
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
      
      throw error
    }
  }
  
  // If we exhausted retries, return last response or throw last error
  if (lastResponse) {
    return lastResponse
  }
  throw lastError || new Error('Failed after retries')
}

export async function GET(request: NextRequest) {
  const requestId = generateRequestId()
  
  try {
    const { searchParams } = new URL(request.url)
    const businessLocationId = searchParams.get('businessLocationId')
    const startParam = searchParams.get('start')
    const endParam = searchParams.get('end')

    if (!businessLocationId) {
      return NextResponse.json(
        { ok: false, error: 'Missing businessLocationId', requestId },
        { status: 400 }
      )
    }

    // Parse date range
    let startDate: Date
    let endDate: Date
    
    if (startParam && endParam) {
      startDate = new Date(startParam)
      endDate = new Date(endParam)
      
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
      startDate.setHours(0, 0, 0, 0)
      
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      endDate.setDate(endDate.getDate() + 7)
      endDate.setHours(23, 59, 59, 999)
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
    const cacheKey = getCacheKey(user.id, businessLocationId, startDate.toISOString(), endDate.toISOString())
    const cached = getCached(cacheKey)
    if (cached) {
      console.log(`[IG Posts] Cache hit:`, { requestId, itemsCount: cached.items.length })
      return NextResponse.json({
        ok: true,
        items: cached.items,
        cached: true,
        requestId,
      })
    }

    // Get Instagram access token and account ID
    let accessToken: string
    let igAccountId: string

    try {
      const tokenData = await getInstagramAccessTokenForLocation(businessLocationId)
      accessToken = tokenData.access_token
      igAccountId = tokenData.ig_account_id
      
      console.log(`[IG Posts] resolve_token - Token loaded:`, {
        requestId,
        igAccountId,
        hasToken: !!accessToken,
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
        // Not connected - return empty array (non-blocking)
        return NextResponse.json({
          ok: true,
          items: [],
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

    // Sanity check: verify token and account ID match
    try {
      const meUrl = new URL(`${API_BASE}/${API_VERSION}/me`)
      meUrl.searchParams.set('fields', 'id,username')
      meUrl.searchParams.set('access_token', accessToken)
      
      const meResponse = await fetch(meUrl.toString(), { method: 'GET' })
      if (meResponse.ok) {
        const meData = await meResponse.json()
        const actualIgId = meData.id
        
        if (actualIgId && actualIgId !== igAccountId) {
          console.log(`[IG Posts] Account ID mismatch, using /me/media instead:`, {
            requestId,
            stored: igAccountId,
            actual: actualIgId,
          })
          igAccountId = actualIgId
        }
      }
    } catch (meError: any) {
      console.warn(`[IG Posts] /me check failed (non-fatal):`, {
        requestId,
        error: meError.message,
      })
      // Continue with stored igAccountId
    }

    // Fetch media with pagination (minimal fields first)
    const allMedia: any[] = []
    let nextPageToken: string | undefined = undefined
    let pageCount = 0
    const startTimestamp = Math.floor(startDate.getTime() / 1000)
    const endTimestamp = Math.floor(endDate.getTime() / 1000)

    // Minimal fields for initial fetch
    const fields = 'id,caption,media_type,timestamp'

    do {
      pageCount++

      if (pageCount > MAX_PAGES) {
        console.log(`[IG Posts] Max pages reached:`, { requestId, pageCount, maxPages: MAX_PAGES })
        break
      }

      // Build API URL
      const apiUrl = new URL(`${API_BASE}/${API_VERSION}/${igAccountId}/media`)
      apiUrl.searchParams.set('fields', fields)
      apiUrl.searchParams.set('limit', PAGE_LIMIT.toString())
      apiUrl.searchParams.set('access_token', accessToken)

      if (nextPageToken) {
        apiUrl.searchParams.set('after', nextPageToken)
      }

      console.log(`[IG Posts] Fetching page ${pageCount}:`, {
        requestId,
        url: apiUrl.toString().replace(/access_token=[^&]+/, 'access_token=***'),
        hasNextToken: !!nextPageToken,
      })

      try {
        const response = await fetchWithRetry(
          apiUrl.toString(),
          { method: 'GET' },
          requestId
        )

        if (!response.ok) {
          let errorData: any = {}
          let fbtrace_id: string | undefined
          try {
            const text = await response.text()
            errorData = JSON.parse(text)
            fbtrace_id = errorData.error?.fbtrace_id
          } catch (parseError: any) {
            // Failed to parse
          }
          
          // Check if it's a transient error
          const isTransient = 
            response.status >= 500 || 
            response.status === 502 || 
            response.status === 503 || 
            response.status === 504 ||
            (errorData.error?.code === 2 && errorData.error?.is_transient === true)
          
          if (isTransient) {
            // Log error with fbtrace_id for diagnosis
            console.error(`[IG Posts] Transient error from Instagram:`, {
              requestId,
              status: response.status,
              errorCode: errorData.error?.code,
              errorMessage: errorData.error?.message,
              fbtrace_id,
              responsePreview: JSON.stringify(errorData).substring(0, 200),
            })
            
            // Return cached data if available, otherwise empty array
            // Retrieve cache again in case it was set during this request
            const cachedEntry = getCached(cacheKey)
            const cachedItems = cachedEntry?.items || []
            
            return NextResponse.json({
              ok: true,
              items: cachedItems,
              transient: true,
              error: errorData.error?.message || 'Instagram API temporarily unavailable',
              fbtrace_id,
              requestId,
            })
          }
          
          if (response.status === 401 || errorData.error?.code === 190) {
            return NextResponse.json({
              ok: false,
              error: 'Instagram authentication failed. Please reconnect your account.',
              needs_reauth: true,
              requestId,
            }, { status: 401 })
          }
          
          return NextResponse.json({
            ok: false,
            error: errorData.error?.message || 'Instagram API error',
            fbtrace_id,
            requestId,
          }, { status: response.status })
        }

        const data = await response.json()

        if (data.data && Array.isArray(data.data)) {
          allMedia.push(...data.data)
        }

        // Check for next page
        nextPageToken = data.paging?.cursors?.after

        // Early exit if oldest post is before start date (with 3-day buffer)
        if (data.data && data.data.length > 0) {
          const oldestTimestampRaw = data.data[data.data.length - 1]?.timestamp
          if (oldestTimestampRaw) {
            // Convert to Unix seconds for comparison
            let oldestTimestamp: number
            if (typeof oldestTimestampRaw === 'string') {
              const date = new Date(oldestTimestampRaw)
              oldestTimestamp = Math.floor(date.getTime() / 1000)
            } else {
              oldestTimestamp = parseInt(oldestTimestampRaw)
            }
            
            if (oldestTimestamp < startTimestamp - (3 * 24 * 60 * 60)) {
              console.log(`[IG Posts] Reached posts older than start date, stopping pagination`, {
                requestId,
                oldestTimestamp,
                oldestTimestampRaw,
                startTimestamp,
              })
              break
            }
          }
        }

        if (!nextPageToken) {
          break
        }
      } catch (error: any) {
        console.error(`[IG Posts] Fetch error:`, {
          requestId,
          error: error.message,
          attempt: pageCount,
        })
        // Continue with what we have
        break
      }
    } while (nextPageToken)

    // Filter by date range server-side
    const filteredMedia = allMedia.filter((item: any) => {
      if (!item.timestamp) return false
      
      // Convert timestamp to Unix seconds
      let timestamp: number
      if (typeof item.timestamp === 'string') {
        // Instagram returns ISO 8601 strings like '2025-12-31T16:22:20+0000'
        const date = new Date(item.timestamp)
        timestamp = Math.floor(date.getTime() / 1000)
      } else {
        // Already a number (Unix timestamp)
        timestamp = parseInt(item.timestamp)
      }
      
      return timestamp >= startTimestamp && timestamp <= endTimestamp
    })

    // Normalize for calendar rendering (minimal fields - media URLs fetched on demand)
    const normalizedItems = filteredMedia.map((item: any) => {
      // Convert timestamp to ISO string for calendar
      let timestampStr: string
      if (typeof item.timestamp === 'string') {
        timestampStr = item.timestamp
      } else {
        // Convert Unix timestamp to ISO string
        timestampStr = new Date(parseInt(item.timestamp) * 1000).toISOString()
      }
      
      return {
        id: item.id,
        timestamp: timestampStr,
        caption: item.caption || '',
        mediaType: item.media_type,
        // mediaUrl, thumbUrl, permalink will be fetched on demand when post is selected
      }
    })

    // Cache successful results
    setCache(cacheKey, normalizedItems)

    console.log(`[IG Posts] Success:`, {
      requestId,
      totalFetched: allMedia.length,
      filtered: filteredMedia.length,
      normalized: normalizedItems.length,
      pages: pageCount,
    })

    return NextResponse.json({
      ok: true,
      items: normalizedItems,
      requestId,
    })
  } catch (error: any) {
    console.error(`[IG Posts] Unexpected error:`, {
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
