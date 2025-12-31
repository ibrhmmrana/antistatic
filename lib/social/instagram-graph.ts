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

        posts.push(post)

        // Step 2: Fetch comments for this post
        // Always try to fetch comments, even if comments_count is 0 or missing
        // The API might not return accurate comment counts, or comments might exist despite count being 0
        if (comments.length < commentsLimit * postsLimit) {
          try {
            // Use graph.instagram.com for Instagram tokens
            const commentsUrl = `https://graph.instagram.com/${item.id}/comments?fields=id,text,timestamp,username&limit=25&access_token=${accessToken}`
            console.log(`[Instagram Graph API] Fetching comments for post ${item.id} (comments_count: ${item.comments_count || 'unknown'})`)
            
            const commentsResponse = await fetch(commentsUrl)

            if (commentsResponse.ok) {
              const commentsData = await commentsResponse.json()
              const postComments = commentsData.data || []
              
              console.log(`[Instagram Graph API] Received ${postComments.length} comments for post ${item.id}`)

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
              const errorData = await commentsResponse.json().catch(() => ({}))
              console.warn(`[Instagram Graph API] Failed to fetch comments for post ${item.id}:`, {
                status: commentsResponse.status,
                statusText: commentsResponse.statusText,
                error: errorData,
              })
            }
          } catch (commentError: any) {
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

