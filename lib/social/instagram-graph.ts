/**
 * Instagram Graph API Integration
 * 
 * Fetches Instagram posts and comments using Instagram Graph API with OAuth token.
 * This replaces Apify when an OAuth connection is available.
 */

import type { InstaPost, InstaComment } from './instagram-apify'

/**
 * Fetch Instagram data from Graph API using OAuth access token
 * 
 * @param accessToken - Instagram OAuth access token
 * @param instagramUserId - Instagram Business Account ID
 * @param postsLimit - Maximum number of posts to fetch
 * @param commentsLimit - Maximum number of comments per post to fetch
 * @returns Normalized posts and comments matching Apify format
 */
export async function fetchInstagramFromGraphAPI(
  accessToken: string,
  instagramUserId: string,
  postsLimit = 30,
  commentsLimit = 20
): Promise<{ posts: InstaPost[]; comments: InstaComment[] }> {
  console.log('[Instagram Graph API] Starting fetch for user:', instagramUserId)

  const posts: InstaPost[] = []
  const comments: InstaComment[] = []

  try {
    // Step 1: Get user's media (posts)
    // For "Instagram API with Instagram Login" (Business Login), we use graph.instagram.com
    // Try using /me endpoint first, then fallback to user ID if needed
    // The token from api.instagram.com/oauth/access_token is an Instagram token
    let mediaUrl = `https://graph.instagram.com/me/media?fields=id,caption,like_count,comments_count,timestamp,media_type,media_url,permalink&limit=25&access_token=${accessToken}`
    let hasNextPage = true
    let pageCount = 0
    const maxPages = Math.ceil(postsLimit / 25) // Instagram returns 25 per page

    // Try to get username from user info endpoint
    let username: string | undefined
    try {
      // Use /me endpoint for Instagram tokens
      const userInfoUrl = `https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`
      const userInfoResponse = await fetch(userInfoUrl)
      
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json()
        username = userInfo.username
      } else {
        const errorData = await userInfoResponse.json().catch(() => ({}))
        console.warn('[Instagram Graph API] Username fetch failed:', errorData)
      }
    } catch (e) {
      console.warn('[Instagram Graph API] Could not fetch username:', e)
    }

    while (hasNextPage && posts.length < postsLimit && pageCount < maxPages) {
      console.log(`[Instagram Graph API] Fetching media page ${pageCount + 1}...`)
      
      const mediaResponse = await fetch(mediaUrl)
      
      if (!mediaResponse.ok) {
        const errorData = await mediaResponse.json().catch(() => ({}))
        console.error('[Instagram Graph API] Error fetching media:', {
          status: mediaResponse.status,
          statusText: mediaResponse.statusText,
          error: errorData,
        })
        
        // Check for common errors
        if (errorData.error) {
          if (errorData.error.code === 190) {
            throw new Error('Invalid or expired access token. Please reconnect your Instagram account.')
          } else if (errorData.error.code === 10) {
            throw new Error('Permission denied. Please ensure all required permissions are granted.')
          } else if (errorData.error.code === 2 && errorData.error.is_transient) {
            // Transient error - might be Instagram API issue, but also might be account/permissions issue
            throw new Error('Instagram API returned a transient error. This may indicate your account needs to be linked to a Facebook Page, or there may be a temporary Instagram API issue. Please verify your Instagram account is a Business/Creator account connected to a Facebook Page.')
          }
        }
        
        throw new Error(`Failed to fetch Instagram media: ${errorData.error?.message || mediaResponse.statusText}`)
      }

      const mediaData = await mediaResponse.json()
      const mediaItems = mediaData.data || []

      console.log(`[Instagram Graph API] Received ${mediaItems.length} media items`)

      // Process each media item
      for (const item of mediaItems) {
        if (posts.length >= postsLimit) break

        // Only process posts (not stories or reels - we can add those later if needed)
        // For now, we'll include all media types
        // Graph API field names: like_count, comments_count, timestamp
        // item.id is the correct ig_media_id from listMedia() - use this for comments endpoint
        const post: InstaPost & { 
          commentsDiagnostic?: { mediaId: string; mediaPermalink: string; commentsCountFromAPI: number; commentsReturned: number; pagingPresent: boolean }
          media_url?: string
          media_type?: string
        } = {
          id: item.id, // This is the ig_media_id from the API - correct ID to use for comments
          url: item.permalink || `https://www.instagram.com/p/${item.id}/`,
          caption: item.caption || '',
          likesCount: item.like_count || item.likes_count || 0, // Handle both field names
          commentsCount: item.comments_count || item.comment_count || 0, // Handle both field names
          timestamp: item.timestamp || item.created_time || new Date().toISOString(), // Handle both field names
          ownerUsername: username,
          ownerFullName: undefined, // Graph API doesn't return full name in media endpoint
          media_url: item.media_url || (item as any).thumbnail_url, // Use thumbnail_url for videos if media_url not available
          media_type: item.media_type, // Include media_type for filtering
        }

        posts.push(post)

        // Step 2: Fetch comments for this post using Instagram Graph API
        // Use ONLY graph.instagram.com - Instagram tokens don't work with Facebook API
        // Use the ig_media_id from listMedia() response (item.id) - this is the correct ID
        if (comments.length < commentsLimit * postsLimit) {
          try {
            // Use graph.instagram.com with fields: from,text (per Meta's official Postman collection)
            const API_VERSION = 'v18.0'
            const commentsUrl = `https://graph.instagram.com/${API_VERSION}/${item.id}/comments?fields=from,text,timestamp&limit=25&access_token=${accessToken}`
            
            // Structured logging (non-sensitive)
            console.log('[Instagram Graph API] Fetching comments:', {
              endpoint_host: 'graph.instagram.com',
              api_version: API_VERSION,
              media_id: item.id,
              media_permalink: post.url,
              comments_count_from_media: item.comments_count || 0,
            })
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:116',message:'Before comments fetch',data:{postId:item.id,commentsCount:item.comments_count,mediaPermalink:post.url,endpointHost:'graph.instagram.com',apiVersion:API_VERSION},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            
            const commentsResponse = await fetch(commentsUrl)
            
            // Structured logging for response
            const responseStatus = commentsResponse.status
            const responseOk = commentsResponse.ok
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:120',message:'Comments response received',data:{postId:item.id,status:responseStatus,ok:responseOk,statusText:commentsResponse.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion

            if (commentsResponse.ok) {
              const commentsData = await commentsResponse.json()
              let postComments = commentsData.data || []
              
              // Structured logging for parsed data
              const dataLength = postComments.length
              const pagingPresent = !!commentsData.paging
              const hasPagingCursors = !!(commentsData.paging?.cursors)
              
              console.log('[Instagram Graph API] Comments response parsed:', {
                endpoint_host: 'graph.instagram.com',
                api_version: API_VERSION,
                media_id: item.id,
                response_status: responseStatus,
                data_length: dataLength,
                paging_present: pagingPresent,
                has_paging_cursors: hasPagingCursors,
              })
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:125',message:'Comments data parsed',data:{postId:item.id,commentsCount:dataLength,hasData:!!commentsData.data,dataIsArray:Array.isArray(commentsData.data),hasError:!!commentsData.error,errorCode:commentsData.error?.code,errorMessage:commentsData.error?.message,errorType:commentsData.error?.type,pagingPresent,hasPagingCursors},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              // #endregion
              
              console.log(`[Instagram Graph API] Received ${postComments.length} comments for post ${item.id}`)

              // Try pagination if we got empty results but pagination exists
              if (postComments.length === 0 && commentsData.paging && commentsData.paging.next) {
                console.log(`[Instagram Graph API] Empty results but pagination exists, trying next page...`)
                try {
                  const nextPageResponse = await fetch(commentsData.paging.next)
                  if (nextPageResponse.ok) {
                    const nextPageData = await nextPageResponse.json()
                    postComments = nextPageData.data || []
                    console.log(`[Instagram Graph API] Next page returned ${postComments.length} comments`)
                  }
                } catch (paginationError: any) {
                  console.warn(`[Instagram Graph API] Pagination fetch failed:`, paginationError.message)
                }
              }

              // Process comments from Instagram API
              // Note: Facebook API fallback removed - Instagram tokens don't work with Facebook API
              for (const comment of postComments) {
                if (comments.length >= commentsLimit * postsLimit) break

                // Handle both 'text' and 'message' field names, and 'from' object structure
                const commentText = comment.text || comment.message || ''
                const commentUsername = comment.from?.username || comment.username || comment.from?.name || 'unknown'
                const commentTimestamp = comment.timestamp || comment.created_time || new Date().toISOString()

                comments.push({
                  id: comment.id || `${item.id}_${comments.length}`,
                  text: commentText,
                  username: commentUsername,
                  timestamp: commentTimestamp,
                  postUrl: post.url,
                  mediaId: item.id, // Add mediaId for linking comments to posts
                  from: {
                    username: commentUsername,
                    id: comment.from?.id || comment.id || '',
                  },
                } as InstaComment & { id: string; mediaId: string; from: { username: string; id: string } })
              }
              
              // Store diagnostic info for UI fallback message
              if (postComments.length === 0 && item.comments_count > 0) {
                // This will be used by the UI to show diagnostic message
                ;(post as any).commentsDiagnostic = {
                  mediaId: item.id,
                  mediaPermalink: post.url,
                  commentsCountFromAPI: item.comments_count,
                  commentsReturned: postComments.length,
                  pagingPresent: pagingPresent,
                }
              }
            } else {
              const errorData = await commentsResponse.json().catch(() => ({}))
              
              // Structured logging for error
              console.warn('[Instagram Graph API] Comments fetch failed:', {
                endpoint_host: 'graph.instagram.com',
                api_version: API_VERSION,
                media_id: item.id,
                response_status: responseStatus,
                error_code: errorData.error?.code,
                error_message: errorData.error?.message,
                error_type: errorData.error?.type,
              })
              
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:140',message:'Comments fetch failed',data:{postId:item.id,status:responseStatus,statusText:commentsResponse.statusText,errorCode:errorData.error?.code,errorMessage:errorData.error?.message,errorType:errorData.error?.type,errorSubcode:errorData.error?.error_subcode,fullError:JSON.stringify(errorData).substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
              // #endregion
              
              console.warn(`[Instagram Graph API] Failed to fetch comments for post ${item.id}:`, {
                status: responseStatus,
                statusText: commentsResponse.statusText,
                error: errorData,
              })
            }
          } catch (commentError: any) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:150',message:'Comments fetch exception',data:{postId:item.id,errorMessage:commentError.message,errorName:commentError.name,errorStack:commentError.stack?.substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            
            console.warn(`[Instagram Graph API] Error fetching comments for post ${item.id}:`, {
              message: commentError.message,
              stack: commentError.stack,
            })
            // Continue with other posts even if comments fail
          }
        }
      }

      // Check for next page
      if (mediaData.paging && mediaData.paging.next) {
        mediaUrl = mediaData.paging.next
        pageCount++
      } else {
        hasNextPage = false
      }
    }

    // Sort posts by timestamp (newest first)
    posts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Filter and prioritize high-signal comments (same logic as Apify)
    const highSignalKeywords = [
      '?',
      'complain',
      'problem',
      'issue',
      'not happy',
      'mid',
      'stale',
      'too sweet',
      'too sugary',
      'when is',
      'opening',
      'closed',
      'why',
      'how',
      'disappointed',
      'bad',
      'terrible',
      'worst',
    ]

    const highSignalComments = comments.filter((comment) => {
      const text = comment.text.toLowerCase()
      return highSignalKeywords.some((keyword) => text.includes(keyword))
    })

    // Combine high-signal comments with recent comments, then sort by timestamp
    const allComments = [...highSignalComments, ...comments]
      .filter((comment, index, self) => {
        // Remove duplicates based on text
        return index === self.findIndex((c) => c.text === comment.text)
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 40)

    console.log('[Instagram Graph API] Normalized data:', {
      postsCount: posts.length,
      commentsCount: allComments.length,
      highSignalCount: highSignalComments.length,
    })

    return {
      posts,
      comments: allComments,
    }
  } catch (error: any) {
    console.error('[Instagram Graph API] Error fetching data:', error)
    throw new Error(`Failed to fetch Instagram data from Graph API: ${error.message}`)
  }
}

