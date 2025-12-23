/**
 * Facebook Apify Integration
 * 
 * Fetches Facebook Page posts using Apify actor KoJrdxJCTtpon81KY
 */

import { ApifyClient } from 'apify-client'
import type { FacebookPost } from './facebook-types'

const FACEBOOK_ACTOR_ID = process.env.APIFY_FACEBOOK_ACTOR_ID || 'KoJrdxJCTtpon81KY'

/**
 * Normalize Facebook post from Apify response
 * Strips out large fields like dash_manifest, DRM blobs, etc.
 */
export function normalizeFacebookPost(item: any): FacebookPost {
  return {
    facebookUrl: item.facebookUrl || item.url || '',
    postId: item.postId || item.id || '',
    url: item.url || '',
    topLevelUrl: item.topLevelUrl || item.url || '',
    time: item.time || item.timestamp || new Date().toISOString(),
    isVideo: item.isVideo || false,
    text: item.text || null,
    likes: item.likes || 0,
    comments: item.comments || 0,
    shares: item.shares || 0,
    viewsCount: item.viewsCount || item.views || null,
    thumbnailUrl: item.media?.[0]?.thumbnail || null,
    pageName: item.user?.name || null,
    profilePic: item.user?.profilePic || null,
  }
}

/**
 * Fetch Facebook Page data from Apify
 */
/**
 * Normalize Facebook URL or account name to ensure it's in the correct format for Apify
 * Accepts either:
 * - Full URL: "https://www.facebook.com/arsenal/" or "facebook.com/arsenal"
 * - Account name: "arsenal" or "pantryjhb"
 */
function normalizeFacebookUrl(input: string): string {
  let normalized = input.trim()
  
  // If it's already a full URL (contains facebook.com), normalize it
  if (normalized.includes('facebook.com')) {
    // Remove trailing slash if present
    normalized = normalized.replace(/\/$/, '')
    
    // If it doesn't start with http:// or https://, add https://
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = `https://${normalized}`
    }
    
    // Ensure www. is present (Apify actor might expect it)
    if (!normalized.includes('www.facebook.com')) {
      normalized = normalized.replace('facebook.com', 'www.facebook.com')
    }
    
    return normalized
  }
  
  // Otherwise, it's just an account name - convert to full URL
  // Remove any leading @ or / characters
  normalized = normalized.replace(/^[@\/]+/, '')
  
  // Convert to full Facebook URL format
  return `https://www.facebook.com/${normalized}/`
}

export async function fetchFacebookRaw(
  facebookUrl: string,
  resultsLimit = 30
): Promise<{ posts: FacebookPost[] }> {
  console.log('[Facebook Apify] Starting fetch for input:', facebookUrl)

  const apiToken = process.env.APIFY_API_TOKEN
  if (!apiToken) {
    throw new Error('APIFY_API_TOKEN environment variable is not set')
  }

  // Normalize the URL/account name to ensure it's in the correct format
  // This handles both full URLs and account names (e.g., "pantryjhb")
  const normalizedUrl = normalizeFacebookUrl(facebookUrl)
  console.log('[Facebook Apify] Normalized URL:', normalizedUrl)
  
  // Validate that we have a valid Facebook URL after normalization
  if (!normalizedUrl.includes('facebook.com')) {
    throw new Error('Invalid Facebook URL or account name. Could not convert to a valid Facebook URL.')
  }

  const client = new ApifyClient({ token: apiToken })

  // Verify actor exists first
  try {
    const actor = await client.actor(FACEBOOK_ACTOR_ID).get()
    if (!actor) {
      throw new Error(`Actor ${FACEBOOK_ACTOR_ID} not found`)
    }
    console.log('[Facebook Apify] Actor found:', {
      id: actor.id,
      name: actor.name,
      username: actor.username,
    })
  } catch (error: any) {
    console.error('[Facebook Apify] Actor not found or inaccessible:', {
      actorId: FACEBOOK_ACTOR_ID,
      error: error.message,
      statusCode: error.statusCode,
    })
    throw new Error(`Apify actor ${FACEBOOK_ACTOR_ID} not found or not accessible. Please verify the actor ID and your Apify API token.`)
  }

  const input = {
    startUrls: [{ url: normalizedUrl }],
    resultsLimit,
    captionText: false,
  }

  console.log('[Facebook Apify] Calling actor with input:', {
    ...input,
    startUrls: input.startUrls.map((u) => u.url),
  })

  try {
    console.log('[Facebook Apify] Starting actor run with actor ID:', FACEBOOK_ACTOR_ID)
    console.log('[Facebook Apify] Input being sent:', JSON.stringify(input, null, 2))
    
    let run
    try {
      run = await client.actor(FACEBOOK_ACTOR_ID).call(input, {
        waitSecs: 300, // Wait up to 5 minutes for completion
      })
    } catch (actorError: any) {
      console.error('[Facebook Apify] Actor call failed:', {
        message: actorError.message,
        statusCode: actorError.statusCode,
        code: actorError.code,
        details: actorError.details,
        fullError: actorError,
      })
      
      // Check if it's an actor not found error
      if (actorError.statusCode === 404 || actorError.message?.includes('not found')) {
        throw new Error(`Apify actor ${FACEBOOK_ACTOR_ID} not found. Please verify the actor ID is correct.`)
      }
      
      // Check if it's an input validation error
      if (actorError.statusCode === 400 || actorError.message?.includes('input')) {
        throw new Error(`Invalid input for Apify actor: ${actorError.message}. Check that startUrls format is correct.`)
      }
      
      throw new Error(`Apify actor call failed: ${actorError.message || 'Unknown error'}`)
    }

    console.log('[Facebook Apify] Actor run completed:', {
      runId: run.id,
      status: run.status,
      defaultDatasetId: run.defaultDatasetId,
    })

    if (!run.defaultDatasetId) {
      throw new Error('Actor run completed but no dataset ID returned')
    }

    console.log('[Facebook Apify] Fetching dataset items from:', run.defaultDatasetId)
    const dataset = await client.dataset(run.defaultDatasetId).listItems()
    const items = dataset.items || []

    console.log('[Facebook Apify] Dataset items fetched:', {
      itemCount: items.length,
      firstItemKeys: items.length > 0 ? Object.keys(items[0] || {}) : [],
    })

    // Normalize and filter posts
    const postsMap = new Map<string, FacebookPost>()

    for (const item of items as any[]) {
      try {
        const normalized = normalizeFacebookPost(item)
        if (normalized.postId && normalized.url) {
          // Use postId as key to avoid duplicates
          postsMap.set(normalized.postId, normalized)
        }
      } catch (error: any) {
        console.warn('[Facebook Apify] Error normalizing item:', error.message)
        // Continue processing other items
      }
    }

    // Convert map to array and sort by timestamp (newest first)
    const posts = Array.from(postsMap.values())
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, resultsLimit)

    console.log('[Facebook Apify] Normalized data:', {
      postsCount: posts.length,
      rawItemsCount: items.length,
    })

    if (posts.length === 0 && items.length > 0) {
      throw new Error(`No posts could be extracted from ${items.length} dataset items. Check data structure.`)
    }

    if (posts.length === 0 && items.length === 0) {
      throw new Error('Apify dataset is empty - no items returned from the actor run')
    }

    return {
      posts,
    }
  } catch (error: any) {
    console.error('[Facebook Apify] Error fetching data:', error)
    throw new Error(`Failed to fetch Facebook data: ${error.message}`)
  }
}

