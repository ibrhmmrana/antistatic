/**
 * Instagram Graph API Client
 * 
 * Provides a typed interface to Instagram Graph API endpoints.
 * Uses graph.instagram.com (not graph.facebook.com) with Instagram Business Login tokens.
 */

import { createClient } from '@/lib/supabase/server'

const API_BASE = 'https://graph.instagram.com'
const API_VERSION = 'v18.0'

export type InstagramConnection = {
  access_token: string
  instagram_user_id: string
  scopes: string[] | null
}

export type InstagramError = 
  | { type: 'NotConnected'; message: string }
  | { type: 'APIError'; status: number; message: string; code?: number }
  | { type: 'NetworkError'; message: string }

export class InstagramAPI {
  private accessToken: string
  private userId: string
  private scopes: string[]

  private constructor(connection: InstagramConnection) {
    this.accessToken = connection.access_token
    this.userId = connection.instagram_user_id
    this.scopes = connection.scopes || []
  }

  /**
   * Load Instagram connection for a business location
   */
  static async loadConnection(businessLocationId: string): Promise<InstagramConnection | InstagramError> {
    const supabase = await createClient()
    
    const { data: connection, error } = await (supabase
      .from('instagram_connections') as any)
      .select('access_token, instagram_user_id, scopes, token_expires_at')
      .eq('business_location_id', businessLocationId)
      .maybeSingle()

    if (error) {
      console.error('[Instagram API] Error loading connection:', error)
      return { type: 'NotConnected', message: 'Failed to load Instagram connection' }
    }

    if (!connection || !connection.access_token) {
      return { type: 'NotConnected', message: 'Instagram account not connected' }
    }

    // Check if token is expired
    if (connection.token_expires_at) {
      const expiresAt = new Date(connection.token_expires_at)
      const now = new Date()
      
      if (expiresAt <= now) {
        console.warn('[Instagram API] Token expired:', {
          expiresAt: expiresAt.toISOString(),
          now: now.toISOString(),
        })
        return { 
          type: 'APIError', 
          status: 401,
          code: 190,
          message: 'Access token has expired. Please reconnect your Instagram account.' 
        }
      }
    }

    return {
      access_token: connection.access_token,
      instagram_user_id: connection.instagram_user_id,
      scopes: connection.scopes || [],
    }
  }

  /**
   * Create API client instance
   */
  static async create(businessLocationId: string): Promise<InstagramAPI | InstagramError> {
    const connection = await this.loadConnection(businessLocationId)
    
    if ('type' in connection) {
      return connection
    }

    return new InstagramAPI(connection)
  }

  /**
   * Low-level fetch helper for Instagram Graph API
   */
  private async igFetch(
    path: string,
    params: Record<string, string | number | undefined> = {}
  ): Promise<any> {
    const url = new URL(`${API_BASE}/${API_VERSION}/${path}`)
    
    // Add access token
    url.searchParams.set('access_token', this.accessToken)
    
    // Add other params
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    }

    // Add timeout to prevent hanging requests
    const FETCH_TIMEOUT_MS = 10000 // 10 seconds
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)

      const data = await response.json()

      if (!response.ok) {
        const error = data.error || {}
        console.error('[Instagram API] Error response:', {
          path,
          status: response.status,
          code: error.code,
          message: error.message,
          type: error.type,
        })

        // Check for token expiry (code 190)
        if (error.code === 190 || (response.status === 401 && error.message?.includes('expired'))) {
          return {
            error: {
              type: 'APIError',
              status: response.status,
              code: 190,
              message: 'Access token has expired. Please reconnect your Instagram account.',
            },
          }
        }

        return {
          error: {
            type: 'APIError',
            status: response.status,
            code: error.code,
            message: error.message || `Instagram API error: ${response.statusText}`,
          },
        }
      }
      
      // Check for error in successful response (some Graph API endpoints return 200 with error object)
      if (data.error) {
        const error = data.error
        console.error('[Instagram API] Error in response:', {
          path,
          code: error.code,
          message: error.message,
          type: error.type,
        })

        // Check for token expiry (code 190)
        if (error.code === 190 || error.message?.includes('expired')) {
          return {
            error: {
              type: 'APIError',
              status: 401,
              code: 190,
              message: 'Access token has expired. Please reconnect your Instagram account.',
            },
          }
        }

        return {
          error: {
            type: 'APIError',
            status: 400,
            code: error.code,
            message: error.message || 'Instagram API error',
          },
        }
      }

      return data
    } catch (error: any) {
      clearTimeout(timeoutId)
      
      // Handle timeout errors
      if (error?.name === 'AbortError' || error?.code === 'UND_ERR_CONNECT_TIMEOUT') {
        console.error('[Instagram API] Request timeout:', {
          path,
          timeout: FETCH_TIMEOUT_MS,
        })
        return {
          error: {
            type: 'APIError',
            status: 504,
            code: 'TIMEOUT',
            message: 'Request timeout. Instagram API is taking too long to respond.',
          },
        }
      }
      
      console.error('[Instagram API] Network error:', {
        path,
        message: error.message,
        code: error.code,
        name: error.name,
      })

      return {
        error: {
          type: 'NetworkError',
          status: 0,
          code: error.code || 'FETCH_ERROR',
          message: error.message || 'Network error connecting to Instagram API',
        },
      }
    }
  }

  /**
   * Get Instagram profile
   */
  async getProfile(): Promise<{ id: string; username: string } | InstagramError> {
    const result = await this.igFetch('me', { fields: 'id,username' })
    
    if (result.error) {
      return result.error
    }

    return {
      id: result.id,
      username: result.username,
    }
  }

  /**
   * List media (posts)
   */
  async listMedia(options: {
    since?: string // ISO timestamp
    until?: string // ISO timestamp
    limit?: number
    after?: string // Cursor for pagination
  } = {}): Promise<{
    data: Array<{
      id: string
      caption?: string
      like_count: number
      comments_count: number
      timestamp: string
      media_type: string
      media_url?: string
      thumbnail_url?: string
      permalink: string
    }>
    paging?: {
      cursors?: {
        after?: string
        before?: string
      }
      next?: string
      previous?: string
    }
  } | InstagramError> {
    const fields = 'id,caption,like_count,comments_count,timestamp,media_type,media_url,thumbnail_url,permalink'
    const params: Record<string, string | number> = {
      fields,
      limit: options.limit || 25,
    }

    if (options.since) {
      params.since = options.since
    }
    if (options.until) {
      params.until = options.until
    }
    if (options.after) {
      params.after = options.after
    }

    const result = await this.igFetch('me/media', params)
    
    if (result.error) {
      return result.error
    }

    return {
      data: result.data || [],
      paging: result.paging,
    }
  }

  /**
   * List comments for a media item
   */
  async listComments(
    mediaId: string,
    options: {
      limit?: number
      after?: string
    } = {}
  ): Promise<{
    data: Array<{
      id: string
      text: string
      timestamp: string
      from: {
        id: string
        username: string
      }
    }>
    paging?: {
      cursors?: {
        after?: string
        before?: string
      }
      next?: string
      previous?: string
    }
  } | InstagramError> {
    const params: Record<string, string | number> = {
      fields: 'id,text,timestamp,from',
      limit: options.limit || 25,
    }

    if (options.after) {
      params.after = options.after
    }

    const result = await this.igFetch(`${mediaId}/comments`, params)
    
    if (result.error) {
      return result.error
    }

    return {
      data: result.data || [],
      paging: result.paging,
    }
  }

  /**
   * List replies to a comment
   */
  async listReplies(
    commentId: string,
    options: {
      limit?: number
      after?: string
    } = {}
  ): Promise<{
    data: Array<{
      id: string
      text: string
      timestamp: string
      from: {
        id: string
        username: string
      }
    }>
    paging?: {
      cursors?: {
        after?: string
        before?: string
      }
      next?: string
      previous?: string
    }
  } | InstagramError> {
    const params: Record<string, string | number> = {
      fields: 'id,text,timestamp,from',
      limit: options.limit || 25,
    }

    if (options.after) {
      params.after = options.after
    }

    const result = await this.igFetch(`${commentId}/replies`, params)
    
    if (result.error) {
      return result.error
    }

    return {
      data: result.data || [],
      paging: result.paging,
    }
  }

  /**
   * List media with nested comments and replies in a single request
   * Uses field expansion to fetch comments and replies in one API call
   */
  async listMediaWithCommentsPage(params: {
    limitMedia: number
    limitComments: number
    limitReplies: number
    after?: string
  }): Promise<{
    media: Array<{
      id: string
      caption?: string
      media_type: string
      media_url?: string
      thumbnail_url?: string
      permalink: string
      timestamp: string
      comments_count: number
      comments?: {
        data?: Array<{
          id: string
          text: string
          timestamp: string
          from?: {
            id?: string
            username?: string
          } | null
          replies?: {
            data?: Array<{
              id: string
              text: string
              timestamp: string
              from?: {
                id?: string
                username?: string
              } | null
            }>
          }
        }>
        paging?: {
          cursors?: {
            after?: string
          }
        }
      }
    }>
    paging?: {
      cursors?: {
        after?: string
        before?: string
      }
      next?: string
      previous?: string
    }
  } | InstagramError> {
    // Build field expansion for nested comments and replies
    const commentsFields = `id,text,timestamp,from{id,username},replies.limit(${params.limitReplies}){id,text,timestamp,from{id,username}}`
    const fields = `id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,comments_count,comments.limit(${params.limitComments}){${commentsFields}}`
    
    const requestParams: Record<string, string | number> = {
      fields,
      limit: params.limitMedia,
    }

    if (params.after) {
      requestParams.after = params.after
    }

    // Use 'me/media' which uses the authenticated user's ID
    const result = await this.igFetch('me/media', requestParams)
    
    if (result.error) {
      return result.error
    }

    return {
      media: result.data || [],
      paging: result.paging,
    }
  }

  /**
   * Reply to a comment
   */
  async replyToComment(commentId: string, message: string): Promise<{ success: boolean; id?: string; requiredPermission?: string } | InstagramError> {
    const url = new URL(`${API_BASE}/${API_VERSION}/${commentId}/replies`)
    
    // Use form-urlencoded body as per Instagram API docs
    const body = new URLSearchParams({
      message: message,
      access_token: this.accessToken,
    })

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })

      // Safe JSON parsing - handle HTML/error pages
      const rawText = await response.text()
      let data: any = {}
      
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(rawText)
        } catch (parseError) {
          // JSON parse failed - log and return error
          console.error('[Instagram API] Reply JSON parse error:', {
            commentId,
            status: response.status,
            contentType,
            rawText: rawText.slice(0, 500),
          })
          
          return {
            type: 'APIError',
            status: response.status,
            message: `Invalid JSON response from Instagram API: ${rawText.slice(0, 200)}`,
            details: rawText.slice(0, 500),
          } as InstagramError & { details: string }
        }
      } else {
        // Not JSON - likely HTML error page
        console.error('[Instagram API] Reply non-JSON response:', {
          commentId,
          status: response.status,
          contentType,
          rawText: rawText.slice(0, 500),
        })
        
        return {
          type: 'APIError',
          status: response.status,
          message: `Unexpected response format (${contentType}): ${rawText.slice(0, 200)}`,
          details: rawText.slice(0, 500),
        } as InstagramError & { details: string }
      }

      if (!response.ok) {
        const error = data.error || {}
        console.error('[Instagram API] Reply error:', {
          commentId,
          status: response.status,
          code: error.code,
          message: error.message,
          type: error.type,
          rawResponse: process.env.NODE_ENV === 'development' ? rawText.slice(0, 500) : undefined,
        })

        // Check for permission errors
        if (error.code === 10 || error.type === 'OAuthException' || response.status === 403) {
          const requiredPermission = error.message?.includes('comment') 
            ? 'instagram_manage_comments' 
            : 'instagram_business_manage_comments'
          
          return {
            type: 'APIError',
            status: response.status,
            code: error.code,
            message: error.message || `Permission denied: ${requiredPermission} required`,
            requiredPermission,
          } as InstagramError & { requiredPermission: string }
        }

        return {
          type: 'APIError',
          status: response.status,
          code: error.code,
          message: error.message || `Failed to reply: ${response.statusText}`,
          details: process.env.NODE_ENV === 'development' ? rawText.slice(0, 500) : undefined,
        } as InstagramError & { details?: string }
      }

      return {
        success: true,
        id: data.id,
      }
    } catch (error: any) {
      console.error('[Instagram API] Reply network error:', error)
      return {
        type: 'NetworkError',
        message: error.message || 'Network error',
      }
    }
  }

  /**
   * Get insights (requires instagram_business_manage_insights permission)
   */
  async getInsights(options: {
    since?: string
    until?: string
    metrics?: string[]
  } = {}): Promise<{
    data: Array<{
      name: string
      period: string
      values: Array<{
        value: number
        end_time: string
      }>
    }>
  } | InstagramError> {
    // Check if insights permission is available
    if (!this.scopes.some(s => s.includes('instagram_business_manage_insights'))) {
      return {
        type: 'APIError',
        status: 403,
        message: 'insights permission not granted',
      }
    }

    const metrics = options.metrics || [
      'impressions',
      'reach',
      'profile_views',
      'website_clicks',
      'email_contacts',
      'phone_call_clicks',
    ]

    const params: Record<string, string> = {
      metric: metrics.join(','),
      period: 'day',
    }

    if (options.since) {
      params.since = options.since
    }
    if (options.until) {
      params.until = options.until
    }

    const result = await this.igFetch('me/insights', params)
    
    if (result.error) {
      return result.error
    }

    return {
      data: result.data || [],
    }
  }

  /**
   * Send a Direct Message via Instagram Messaging API
   * 
   * @param recipientId Instagram user ID of the recipient
   * @param messageText Text content of the message
   */
  async sendMessage(recipientId: string, messageText: string): Promise<{ id: string } | InstagramError> {
    try {
      const url = new URL(`${API_BASE}/${API_VERSION}/${this.userId}/messages`)
      url.searchParams.set('access_token', this.accessToken)
      
      const body = new URLSearchParams()
      body.append('recipient', JSON.stringify({ id: recipientId }))
      body.append('message', JSON.stringify({ text: messageText }))
      
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      })
      
      if (!response.ok) {
        const error = (await response.json().catch(() => ({}))).error || {}
        console.error('[Instagram API] Send message error:', {
          status: response.status,
          code: error.code,
          message: error.message,
        })
        
        return {
          type: 'APIError',
          status: response.status,
          code: error.code,
          message: error.message || `Failed to send message: ${response.statusText}`,
        }
      }

      const data = await response.json()
      return { id: data.id || data.message_id || 'unknown' }
    } catch (error: any) {
      console.error('[Instagram API] Error sending message:', error)
      return {
        type: 'APIError',
        status: error.status || 500,
        message: error.message || 'Failed to send message',
      }
    }
  }

  /**
   * Check if a specific permission is granted
   */
  hasPermission(permission: string): boolean {
    return this.scopes.some(s => s.includes(permission))
  }
}

