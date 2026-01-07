/**
 * Instagram Publishing Helpers
 * 
 * Centralized utilities for Instagram Graph API publishing with retry logic,
 * media preflight, JPEG conversion, and capability checks.
 */

import sharp from 'sharp'
import { createStorageClient } from '@/lib/supabase/storage'
import { randomUUID } from 'crypto'

const API_BASE = 'https://graph.instagram.com'
const API_BASE_FALLBACK = 'https://graph.facebook.com'
const API_VERSION = 'v24.0'

export interface PreflightResult {
  ok: boolean
  status: number
  contentType: string | null
  contentLength: string | null
  finalUrl: string
  error?: string
}

export interface MetaError {
  message: string
  type: string
  code: number
  error_subcode?: number
  fbtrace_id?: string
  is_transient?: boolean
}

export interface StructuredError {
  ok: false
  step: 'create_container' | 'publish' | 'check_status' | 'preflight' | 'capability_check'
  message: string
  meta?: MetaError
  hint?: string
  request?: {
    method: string
    url: string
  }
  diagnostics?: CapabilityDiagnostics
}

export interface CapabilityDiagnostics {
  tokenValid: boolean
  tokenExpiresAt?: number
  tokenType?: string
  tokenScopes?: string[]
  tokenUserId?: string
  meId?: string
  meUsername?: string
  meAccountType?: string
  igIdUsed: string
  hasPublishPermission: boolean
  hasBasicPermission: boolean
  publishingLimitCheck?: {
    quota_duration?: number
    quota_total?: number
  }
  hostUsed: 'graph.instagram.com' | 'graph.facebook.com'
}

/**
 * Preflight a media URL to ensure Meta can fetch it
 */
export async function preflightMediaUrl(url: string): Promise<PreflightResult> {
  try {
    // Try HEAD first (follow redirects)
    let response: Response
    try {
      response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(10000), // 10s timeout
      })
    } catch (headError: any) {
      // If HEAD fails, try GET with Range header (only fetch first 4KB)
      console.log('[IG Publish] HEAD failed, trying GET with Range:', { url, error: headError.message })
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'Range': 'bytes=0-4095',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(10000),
        })
      } catch (getError: any) {
        return {
          ok: false,
          status: 0,
          contentType: null,
          contentLength: null,
          finalUrl: url,
          error: getError.message || 'Failed to fetch media URL',
        }
      }
    }

    const finalUrl = response.url
    const status = response.status
    const contentType = response.headers.get('content-type')
    const contentLength = response.headers.get('content-length')

    console.log('[IG Publish] preflight', {
      url,
      finalUrl,
      status,
      contentType,
      contentLength,
    })

    return {
      ok: status === 200,
      status,
      contentType,
      contentLength,
      finalUrl,
    }
  } catch (error: any) {
    console.error('[IG Publish] Preflight error:', { url, error: error.message })
    return {
      ok: false,
      status: 0,
      contentType: null,
      contentLength: null,
      finalUrl: url,
      error: error.message || 'Unknown preflight error',
    }
  }
}

/**
 * Convert an image to JPEG and upload to Supabase Storage
 */
export async function convertToJpegAndUpload(
  imageUrl: string,
  businessLocationId: string
): Promise<{ publicUrl: string; filePath: string }> {
  console.log('[IG Publish] Converting to JPEG:', { imageUrl })

  // Fetch the original image
  const imageResponse = await fetch(imageUrl, {
    signal: AbortSignal.timeout(30000), // 30s timeout for image fetch
  })

  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`)
  }

  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer())

  // Convert to JPEG using sharp
  const jpegBuffer = await sharp(imageBuffer)
    .jpeg({ quality: 90 })
    .toBuffer()

  // Upload to Supabase Storage
  const storageClient = createStorageClient()
  const bucketName = 'Storage'
  const fileExtension = 'jpg'
  const timestamp = Date.now()
  const fileName = `social-studio/ig-publish/${businessLocationId}/${timestamp}-${randomUUID()}.${fileExtension}`
  const filePath = fileName

  const { data: uploadData, error: uploadError } = await storageClient.storage
    .from(bucketName)
    .upload(filePath, jpegBuffer, {
      contentType: 'image/jpeg',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(`Failed to upload JPEG: ${uploadError.message}`)
  }

  // Get public URL
  const { data: urlData } = storageClient.storage
    .from(bucketName)
    .getPublicUrl(filePath)

  if (!urlData?.publicUrl) {
    throw new Error('Failed to generate public URL for converted JPEG')
  }

  console.log('[IG Publish] converted_to_jpeg', {
    originalUrl: imageUrl,
    newUrl: urlData.publicUrl,
    bytes: jpegBuffer.length,
  })

  return {
    publicUrl: urlData.publicUrl,
    filePath,
  }
}

/**
 * Assert Instagram publishing is ready (capability checks)
 * For Instagram Login tokens, we validate via /me endpoint and get scopes from DB
 */
export async function assertIgPublishingReady(
  token: string,
  igAccountId: string,
  apiVersion: string = API_VERSION,
  scopesFromDb?: string[] | null
): Promise<CapabilityDiagnostics> {
  const diagnostics: CapabilityDiagnostics = {
    tokenValid: false,
    igIdUsed: igAccountId,
    hasPublishPermission: false,
    hasBasicPermission: false,
    hostUsed: 'graph.instagram.com',
  }

  try {
    // A1) Validate token via /me endpoint (primary method for Instagram Login)
    // This is more reliable than debug_token for Instagram Login tokens
    const meUrl = `https://graph.instagram.com/${apiVersion}/me?fields=id,username,account_type&access_token=${token}`
    
    const meResponse = await fetch(meUrl)
    const meData = await meResponse.json()

    if (!meResponse.ok) {
      throw new Error(`Token cannot access Instagram /me: ${meData.error?.message || 'Unknown error'}`)
    }

    // Token is valid if /me succeeds
    diagnostics.tokenValid = true
    diagnostics.meId = meData.id
    diagnostics.meUsername = meData.username
    diagnostics.meAccountType = meData.account_type

    // If me.id != igAccountId, log mismatch (but use me.id for publishing)
    if (meData.id !== igAccountId) {
      console.warn('[IG Publish] IG account ID mismatch:', {
        stored: igAccountId,
        actual: meData.id,
        using: meData.id,
      })
      diagnostics.igIdUsed = meData.id // Use actual ID
    }

    // A2) Try debug_token as fallback (optional, may fail for Instagram Login tokens)
    let scopes: string[] = []
    if (scopesFromDb && Array.isArray(scopesFromDb)) {
      // Use scopes from database (most reliable for Instagram Login)
      scopes = scopesFromDb
      diagnostics.tokenScopes = scopes
    } else {
      // Try debug_token as fallback (may not work for Instagram Login tokens)
      const appId = process.env.INSTAGRAM_APP_ID
      const appSecret = process.env.INSTAGRAM_APP_SECRET

      if (appId && appSecret) {
        try {
          const debugTokenUrl = `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${appId}|${appSecret}`
          
          const debugResponse = await fetch(debugTokenUrl)
          const debugData = await debugResponse.json()

          if (debugResponse.ok && debugData.data?.is_valid) {
            const tokenData = debugData.data
            scopes = tokenData.scopes || []
            diagnostics.tokenScopes = scopes
            diagnostics.tokenExpiresAt = tokenData.expires_at
            diagnostics.tokenType = tokenData.type
            diagnostics.tokenUserId = tokenData.user_id
          } else {
            // debug_token failed (expected for Instagram Login tokens) - use /me validation only
            console.log('[IG Publish] debug_token failed (non-fatal for Instagram Login tokens):', {
              error: debugData.error?.message,
            })
          }
        } catch (debugError: any) {
          // debug_token error is non-fatal - we already validated via /me
          console.log('[IG Publish] debug_token error (non-fatal):', debugError.message)
        }
      }
    }

    // A3) Check permissions
    diagnostics.hasBasicPermission = scopes.includes('instagram_business_basic')
    diagnostics.hasPublishPermission = scopes.includes('instagram_business_content_publish')

    if (!diagnostics.hasPublishPermission) {
      throw new Error('Missing permission instagram_business_content_publish. Reconnect and approve publish access (Advanced Access may be required in Meta App Review).')
    }

    if (!diagnostics.hasBasicPermission) {
      throw new Error('Missing permission instagram_business_basic')
    }

    // A4) Check account type
    if (meData.account_type === 'PERSONAL') {
      throw new Error('Instagram account must be Professional (Business/Creator) to publish. Switch account type in Instagram settings.')
    }

    // A5) Optional: Publishing limit check
    try {
      const limitUrl = `https://graph.instagram.com/${apiVersion}/${diagnostics.igIdUsed}/content_publishing_limit?access_token=${token}`
      const limitResponse = await fetch(limitUrl)
      if (limitResponse.ok) {
        const limitData = await limitResponse.json()
        diagnostics.publishingLimitCheck = limitData
      }
    } catch (limitError) {
      // Non-fatal, just log
      console.log('[IG Publish] Publishing limit check failed (non-fatal):', limitError)
    }

    // Log diagnostics
    console.log('[IG Publish diagnostics]', JSON.stringify({
      tokenValid: diagnostics.tokenValid,
      tokenType: diagnostics.tokenType,
      tokenScopes: diagnostics.tokenScopes,
      meId: diagnostics.meId,
      meUsername: diagnostics.meUsername,
      meAccountType: diagnostics.meAccountType,
      igIdUsed: diagnostics.igIdUsed,
      hasPublishPermission: diagnostics.hasPublishPermission,
      hasBasicPermission: diagnostics.hasBasicPermission,
    }))

    return diagnostics
  } catch (error: any) {
    // Log diagnostics even on failure
    console.error('[IG Publish diagnostics]', JSON.stringify(diagnostics))
    throw error
  }
}

/**
 * Centralized Instagram Graph API request with retry logic and host fallback
 */
export async function igRequest<T>(
  stepName: 'create_container' | 'publish' | 'check_status',
  method: 'GET' | 'POST',
  path: string,
  accessToken: string,
  body?: any,
  retries = 4,
  useFallbackHost = false
): Promise<T> {
  const baseUrl = useFallbackHost ? API_BASE_FALLBACK : API_BASE
  const apiVersion = API_VERSION
  const url = new URL(`${baseUrl}/${apiVersion}/${path}`)

  // For POST requests with body, use form-urlencoded
  // For GET or POST without body, use query param
  const isFormUrlEncoded = method === 'POST' && body && Object.keys(body).length > 0

  let requestConfig: RequestInit
  let requestUrl: string

  if (isFormUrlEncoded) {
    // Use form-urlencoded for POST with body
    const formBody = new URLSearchParams()
    formBody.set('access_token', accessToken)
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && value !== null) {
        formBody.set(key, String(value))
      }
    }

    requestConfig = {
      method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody.toString(),
    }
    requestUrl = url.toString()
  } else {
    // GET or POST without body - use query param
    url.searchParams.set('access_token', accessToken)
    requestConfig = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    }
    requestUrl = url.toString()
  }

  const backoffDelays = [500, 1500, 3000, 6000] // ms

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(requestUrl, requestConfig)
      const data = await response.json()

      if (!response.ok) {
        const error = data.error || {}
        const httpStatus = response.status

        // Extract Meta error fields
        const metaError: MetaError = {
          message: error.message || 'Unknown error',
          type: error.type || 'APIError',
          code: error.code || httpStatus,
          error_subcode: error.error_subcode,
          fbtrace_id: error.fbtrace_id,
          is_transient:
            error.code === 2 || // OAuthException
            error.code === 1 || // API Unknown Error
            (error.code === 190 && error.error_subcode !== 463) || // Token errors (except invalid token)
            httpStatus >= 500, // Server errors
        }

        // If OAuthException code 2 and we haven't tried fallback host yet, try it
        if (error.code === 2 && !useFallbackHost && attempt === 0) {
          console.log('[IG Publish] OAuthException code 2, trying fallback host:', {
            step: stepName,
            originalHost: baseUrl,
            fallbackHost: API_BASE_FALLBACK,
          })
          // Retry with fallback host
          return igRequest<T>(stepName, method, path, accessToken, body, retries, true)
        }

        // Determine if we should retry
        const shouldRetry =
          attempt < retries &&
          (metaError.is_transient === true || error.code === 2 || httpStatus >= 500)

        if (shouldRetry) {
          const delay = backoffDelays[attempt] || 6000
          console.log('[IG Publish] error (retrying)', {
            step: stepName,
            attempt: attempt + 1,
            retries,
            delay,
            meta: metaError,
            request: { method, url: requestUrl.replace(accessToken, 'REDACTED'), host: useFallbackHost ? 'graph.facebook.com' : 'graph.instagram.com' },
          })

          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }

        // No more retries - throw structured error
        // Add helpful hints for common errors
        let hint: string | undefined
        if (error.code === 100 && stepName === 'create_container') {
          // Code 100 "Invalid parameter" for container creation
          if (body?.video_url) {
            const mediaType = body.media_type || 'REELS'
            hint = `Video may not meet Instagram requirements for ${mediaType}: MP4 (H.264 codec), AAC audio, max 25 Mbps bitrate, 1080p max resolution, 3-60 seconds duration, aspect ratio 4:5 to 16:9. Ensure video URL is publicly accessible and not HDR. For Reels, ensure video is vertical (9:16) or square (1:1).`
          } else if (body?.image_url) {
            hint = 'Image must be JPEG format and publicly accessible.'
          }
        }

        const structuredError: StructuredError = {
          ok: false,
          step: stepName,
          message: metaError.message,
          meta: metaError,
          hint,
          request: {
            method,
            url: requestUrl.replace(accessToken, 'REDACTED'),
          },
        }

        console.error('[IG Publish] error', structuredError)
        throw structuredError
      }

      // Success - log which host was used
      if (useFallbackHost) {
        console.log('[IG Publish] Success using fallback host:', {
          step: stepName,
          host: 'graph.facebook.com',
        })
      }

      return data as T
    } catch (error: any) {
      // If it's our structured error, re-throw it
      if (error.ok === false && error.step) {
        throw error
      }

      // Network/timeout errors - retry if we have attempts left
      if (attempt < retries) {
        const delay = backoffDelays[attempt] || 6000
        console.log('[IG Publish] network error (retrying)', {
          step: stepName,
          attempt: attempt + 1,
          retries,
          delay,
          error: error.message,
        })

        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      // No more retries - throw
      throw error
    }
  }

  throw new Error('Max retries exceeded')
}

/**
 * Check container status
 */
export async function checkContainerStatus(
  containerId: string,
  accessToken: string
): Promise<{ status_code: string }> {
  // Build URL with fields param
  const url = new URL(`${API_BASE}/${API_VERSION}/${containerId}`)
  url.searchParams.set('fields', 'status_code')
  url.searchParams.set('access_token', accessToken)
  
  // Use direct fetch for GET requests (simpler than igRequest for this case)
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  const data = await response.json()

  if (!response.ok) {
    const error = data.error || {}
    const metaError: MetaError = {
      message: error.message || 'Unknown error',
      type: error.type || 'APIError',
      code: error.code || response.status,
      error_subcode: error.error_subcode,
      fbtrace_id: error.fbtrace_id,
      is_transient: error.code === 2 || error.code === 1 || response.status >= 500,
    }

    const structuredError: StructuredError = {
      ok: false,
      step: 'check_status',
      message: metaError.message,
      meta: metaError,
      request: {
        method: 'GET',
        url: url.toString().replace(accessToken, 'REDACTED'),
      },
    }

    throw structuredError
  }

  return data as { status_code: string }
}

/**
 * Poll container status until ready or timeout
 */
export async function pollContainerStatus(
  containerId: string,
  accessToken: string,
  maxWaitSeconds = 10
): Promise<{ status_code: string }> {
  const startTime = Date.now()
  const maxWaitMs = maxWaitSeconds * 1000

  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkContainerStatus(containerId, accessToken)

    if (status.status_code === 'FINISHED') {
      return status
    }

    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new Error(`Container status: ${status.status_code}`)
    }

    // Wait 2 seconds before next check (increased from 1 second for better spacing)
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  // Timeout - check one more time and return current status
  return await checkContainerStatus(containerId, accessToken)
}

export { API_BASE, API_BASE_FALLBACK, API_VERSION }
