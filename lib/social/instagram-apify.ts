/**
 * Instagram Apify Integration
 * 
 * Fetches Instagram posts and comments using Apify actor dIKFJ95TN8YclK2no
 */

import { ApifyClient } from 'apify-client'

const INSTAGRAM_ACTOR_ID = 'dIKFJ95TN8YclK2no'

export type InstaPost = {
  id: string
  url: string
  caption: string
  likesCount: number
  commentsCount: number
  timestamp: string // ISO
  ownerUsername?: string
  ownerFullName?: string
}

export type InstaComment = {
  text: string
  username: string
  timestamp: string
  postUrl: string
}

/**
 * Fetch Instagram data from Apify
 */
export async function fetchInstagramRaw(
  username: string,
  postsLimit = 30,
  commentsLimit = 20
): Promise<{ posts: InstaPost[]; comments: InstaComment[] }> {
  console.log('[Instagram Apify] Starting fetch for username:', username)

  const apiToken = process.env.APIFY_API_TOKEN
  if (!apiToken) {
    throw new Error('APIFY_API_TOKEN environment variable is not set')
  }

  const client = new ApifyClient({ token: apiToken })

  const input = {
    username: [username],
    resultsLimitPosts: postsLimit,
    resultsLimitComments: commentsLimit,
  }

  console.log('[Instagram Apify] Calling actor with input:', input)

  try {
    console.log('[Instagram Apify] Starting actor run...')
    const run = await client.actor(INSTAGRAM_ACTOR_ID).call(input, {
      waitSecs: 300, // Wait up to 5 minutes for completion
    })
    
    console.log('[Instagram Apify] Actor run completed:', {
      runId: run.id,
      status: run.status,
      defaultDatasetId: run.defaultDatasetId,
    })

    if (!run.defaultDatasetId) {
      throw new Error('Actor run completed but no dataset ID returned')
    }

    console.log('[Instagram Apify] Fetching dataset items from:', run.defaultDatasetId)
    const dataset = await client.dataset(run.defaultDatasetId).listItems()
    const items = dataset.items || []

    console.log('[Instagram Apify] Dataset items fetched:', {
      itemCount: items.length,
      firstItem: items.length > 0 ? Object.keys(items[0] || {}) : [],
    })

    // Normalize data
    const postsMap = new Map<string, InstaPost>()
    const comments: InstaComment[] = []

    console.log('[Instagram Apify] Processing items, total count:', items.length)
    if (items.length > 0) {
      console.log('[Instagram Apify] Sample item keys:', Object.keys(items[0]))
      console.log('[Instagram Apify] Sample item structure:', JSON.stringify(items[0], null, 2).substring(0, 500))
    }

    for (const item of items as any[]) {
      // Handle comment-enriched items (current actor output)
      if (item.commentText && item.postInfo) {
        // Extract post info
        const postId = item.postInfo.id || item.postInfo.shortCode || item.postInfo.url
        if (postId && !postsMap.has(postId)) {
          postsMap.set(postId, {
            id: postId,
            url: item.postInfo.url || '',
            caption: item.postInfo.caption || '',
            likesCount: item.postInfo.likesCount || 0,
            commentsCount: 0, // Will be updated if we have comment count
            timestamp: item.postInfo.timestamp || new Date().toISOString(),
            ownerUsername: item.postInfo.ownerUsername,
            ownerFullName: item.postInfo.ownerFullName,
          })
        }

        // Extract comment
        if (item.commentText && item.commentTimestamp) {
          comments.push({
            text: item.commentText,
            username: item.commentatorUserName || 'unknown',
            timestamp: item.commentTimestamp,
            postUrl: item.postInfo.url || '',
          })
        }
      }
      // Handle post-only items (from earlier runs)
      else if (item.caption || item.url) {
        const postId = item.url || item.id || `post-${Date.now()}`
        if (!postsMap.has(postId)) {
          postsMap.set(postId, {
            id: postId,
            url: item.url || '',
            caption: item.caption || '',
            likesCount: item.likesCount || 0,
            commentsCount: item.commentsCount || 0,
            timestamp: item.timestamp || new Date().toISOString(),
            ownerUsername: item.ownerUsername,
            ownerFullName: item.ownerFullName,
          })
        }

        // Extract first comment if available
        if (item.firstComment) {
          comments.push({
            text: item.firstComment,
            username: 'unknown',
            timestamp: item.timestamp || new Date().toISOString(),
            postUrl: item.url || '',
          })
        }
      }
    }

    // Convert map to array and sort by timestamp (newest first)
    const posts = Array.from(postsMap.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, postsLimit)

    // Filter and prioritize high-signal comments
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

    console.log('[Instagram Apify] Normalized data:', {
      postsCount: posts.length,
      commentsCount: allComments.length,
      highSignalCount: highSignalComments.length,
      rawItemsCount: items.length,
    })

    if (posts.length === 0 && allComments.length === 0 && items.length > 0) {
      console.warn('[Instagram Apify] No posts or comments found in dataset items')
      console.log('[Instagram Apify] First item keys:', Object.keys(items[0]))
      console.log('[Instagram Apify] First item sample:', JSON.stringify(items[0], null, 2).substring(0, 1000))
    }

    if (posts.length === 0 && items.length > 0) {
      throw new Error(`No posts could be extracted from ${items.length} dataset items. Check data structure.`)
    }

    if (posts.length === 0 && items.length === 0) {
      throw new Error('Apify dataset is empty - no items returned from the actor run')
    }

    return {
      posts,
      comments: allComments,
    }
  } catch (error: any) {
    console.error('[Instagram Apify] Error fetching data:', error)
    throw new Error(`Failed to fetch Instagram data: ${error.message}`)
  }
}

