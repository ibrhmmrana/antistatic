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

  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:19',message:'fetchInstagramFromGraphAPI entry',data:{userId:instagramUserId?.substring(0,20),tokenLength:accessToken?.length,postsLimit,commentsLimit},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion

  const posts: InstaPost[] = []
  const comments: InstaComment[] = []

  try {
    // Step 1: Get user's media (posts)
    // For "Instagram API with Instagram Login" (Business Login), we use graph.instagram.com
    // The token from api.instagram.com/oauth/access_token is an Instagram token, not Facebook token
    // Use graph.instagram.com with the Instagram Business Account ID
    let mediaUrl = `https://graph.instagram.com/${instagramUserId}/media?fields=id,caption,like_count,comments_count,timestamp,media_type,media_url,permalink&limit=25&access_token=${accessToken}`
    let hasNextPage = true
    let pageCount = 0
    const maxPages = Math.ceil(postsLimit / 25) // Instagram returns 25 per page

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:35',message:'Before media fetch',data:{mediaUrl:mediaUrl.substring(0,120),userId:instagramUserId?.substring(0,20),usingInstagramGraph:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion

    // Try to get username from user info endpoint
    let username: string | undefined
    try {
      // Use graph.instagram.com for Instagram tokens
      const userInfoUrl = `https://graph.instagram.com/${instagramUserId}?fields=username&access_token=${accessToken}`
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:42',message:'Fetching username',data:{userInfoUrl:userInfoUrl.substring(0,120),usingInstagramGraph:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      const userInfoResponse = await fetch(userInfoUrl)
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:45',message:'Username fetch response',data:{status:userInfoResponse.status,ok:userInfoResponse.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      
      if (userInfoResponse.ok) {
        const userInfo = await userInfoResponse.json()
        username = userInfo.username
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:50',message:'Username fetched',data:{username,hasError:!!userInfo.error,errorCode:userInfo.error?.code,errorMessage:userInfo.error?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      } else {
        const errorData = await userInfoResponse.json().catch(() => ({}))
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:55',message:'Username fetch failed',data:{status:userInfoResponse.status,error:errorData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      }
    } catch (e) {
      console.warn('[Instagram Graph API] Could not fetch username:', e)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:60',message:'Username fetch exception',data:{errorMessage:(e as any)?.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
    }

    while (hasNextPage && posts.length < postsLimit && pageCount < maxPages) {
      console.log(`[Instagram Graph API] Fetching media page ${pageCount + 1}...`)
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:66',message:'Before media fetch request',data:{pageCount:pageCount+1,mediaUrl:mediaUrl.substring(0,150),currentPostsCount:posts.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      const mediaResponse = await fetch(mediaUrl)
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:70',message:'Media fetch response received',data:{status:mediaResponse.status,ok:mediaResponse.ok,statusText:mediaResponse.statusText},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      if (!mediaResponse.ok) {
        const errorData = await mediaResponse.json().catch(() => ({}))
        console.error('[Instagram Graph API] Error fetching media:', {
          status: mediaResponse.status,
          statusText: mediaResponse.statusText,
          error: errorData,
        })
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:78',message:'Media fetch error details',data:{status:mediaResponse.status,errorCode:errorData.error?.code,errorType:errorData.error?.type,errorMessage:errorData.error?.message,errorSubcode:errorData.error?.error_subcode,fullError:JSON.stringify(errorData).substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        
        // Check for common errors
        if (errorData.error) {
          if (errorData.error.code === 190) {
            throw new Error('Invalid or expired access token. Please reconnect your Instagram account.')
          } else if (errorData.error.code === 10) {
            throw new Error('Permission denied. Please ensure all required permissions are granted.')
          }
        }
        
        throw new Error(`Failed to fetch Instagram media: ${errorData.error?.message || mediaResponse.statusText}`)
      }

      const mediaData = await mediaResponse.json()
      const mediaItems = mediaData.data || []

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:95',message:'Media data parsed',data:{mediaItemsCount:mediaItems.length,hasPaging:!!mediaData.paging,hasNext:!!mediaData.paging?.next},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

      console.log(`[Instagram Graph API] Received ${mediaItems.length} media items`)

      // Process each media item
      for (const item of mediaItems) {
        if (posts.length >= postsLimit) break

        // Only process posts (not stories or reels - we can add those later if needed)
        // For now, we'll include all media types
        // Graph API field names: like_count, comments_count, timestamp
        const post: InstaPost = {
          id: item.id,
          url: item.permalink || `https://www.instagram.com/p/${item.id}/`,
          caption: item.caption || '',
          likesCount: item.like_count || item.likes_count || 0, // Handle both field names
          commentsCount: item.comments_count || item.comment_count || 0, // Handle both field names
          timestamp: item.timestamp || item.created_time || new Date().toISOString(), // Handle both field names
          ownerUsername: username,
          ownerFullName: undefined, // Graph API doesn't return full name in media endpoint
        }
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:95',message:'Post processed',data:{postId:item.id,hasCaption:!!item.caption,likesCount:post.likesCount,commentsCount:post.commentsCount,hasTimestamp:!!post.timestamp},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion

        posts.push(post)

        // Step 2: Fetch comments for this post if we haven't reached the limit
        if (item.comments_count > 0 && comments.length < commentsLimit * postsLimit) {
          try {
            // Use graph.instagram.com for Instagram tokens
            const commentsUrl = `https://graph.instagram.com/${item.id}/comments?fields=id,text,timestamp,username&limit=10&access_token=${accessToken}`
            const commentsResponse = await fetch(commentsUrl)

            if (commentsResponse.ok) {
              const commentsData = await commentsResponse.json()
              const postComments = commentsData.data || []

              for (const comment of postComments) {
                if (comments.length >= commentsLimit * postsLimit) break

                comments.push({
                  text: comment.text || '',
                  username: comment.username || 'unknown',
                  timestamp: comment.timestamp || new Date().toISOString(),
                  postUrl: post.url,
                })
              }
            } else {
              console.warn(`[Instagram Graph API] Failed to fetch comments for post ${item.id}:`, commentsResponse.status)
            }
          } catch (commentError: any) {
            console.warn(`[Instagram Graph API] Error fetching comments for post ${item.id}:`, commentError.message)
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
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'instagram-graph.ts:190',message:'Graph API function error',data:{errorMessage:error.message,errorName:error.name,errorStack:error.stack?.substring(0,300)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    throw new Error(`Failed to fetch Instagram data from Graph API: ${error.message}`)
  }
}

