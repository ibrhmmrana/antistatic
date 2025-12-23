/**
 * Instagram Metrics Calculation
 * 
 * Computes metrics from normalized Instagram posts and comments
 */

import type { InstaPost, InstaComment } from './instagram-apify'
import type { InstagramMetrics } from './instagram-types'

/**
 * Calculate Instagram metrics from posts and comments
 */
export function calculateInstagramMetrics(
  username: string,
  posts: InstaPost[],
  comments: InstaComment[]
): InstagramMetrics {
  if (posts.length === 0) {
    return {
      username,
      totalPostsAnalyzed: 0,
      postsLast30Days: 0,
      postsPerWeekApprox: 0,
      avgLikesPerPost: 0,
      maxLikes: 0,
      totalCommentsAnalyzed: 0,
      hasAnyComments: false,
      topPostsByLikes: [],
      highSignalComments: [],
    }
  }

  // Extract full name from first post if available
  const fullName = posts[0]?.ownerFullName

  // Calculate date range
  const timestamps = posts.map((p) => new Date(p.timestamp).getTime()).filter((t) => !isNaN(t))
  const periodStart = timestamps.length > 0 ? new Date(Math.min(...timestamps)).toISOString() : undefined
  const periodEnd = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : undefined

  // Calculate likes statistics
  const likes = posts.map((p) => p.likesCount).filter((l) => l > 0)
  const avgLikesPerPost = likes.length > 0 ? likes.reduce((a, b) => a + b, 0) / likes.length : 0
  const maxLikes = likes.length > 0 ? Math.max(...likes) : 0

  // Calculate posts per week
  let postsPerWeekApprox = 0
  if (periodStart && periodEnd) {
    const daysDiff = (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / (1000 * 60 * 60 * 24)
    if (daysDiff > 0) {
      postsPerWeekApprox = (posts.length / daysDiff) * 7
    }
  }

  // Calculate posts in last 30 days
  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const postsLast30Days = posts.filter((p) => {
    const postDate = new Date(p.timestamp)
    return postDate >= thirtyDaysAgo
  }).length

  // Calculate comments
  const totalCommentsAnalyzed = comments.length
  const hasAnyComments = totalCommentsAnalyzed > 0

  // Helper to truncate caption to whole words (120-140 chars)
  const truncateCaption = (caption: string, maxLength = 130): string => {
    if (!caption) return ''
    const cleaned = caption.replace(/\n/g, ' ').trim()
    if (cleaned.length <= maxLength) return cleaned
    
    // Find the last space before maxLength to avoid cutting words
    const truncated = cleaned.substring(0, maxLength)
    const lastSpace = truncated.lastIndexOf(' ')
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...'
    }
    return truncated + '...'
  }

  // Top posts by likes (top 5)
  const topPostsByLikes = [...posts]
    .sort((a, b) => b.likesCount - a.likesCount)
    .slice(0, 5)
    .map((p) => ({
      url: p.url,
      captionSnippet: truncateCaption(p.caption),
      likesCount: p.likesCount,
      commentsCount: p.commentsCount,
      timestamp: p.timestamp,
    }))

  // High-signal comments (already filtered in apify helper, but ensure we have them)
  const highSignalComments = comments.slice(0, 40).map((c) => ({
    text: c.text,
    username: c.username,
    timestamp: c.timestamp,
    postUrl: c.postUrl,
  }))

  return {
    username,
    fullName,
    totalPostsAnalyzed: posts.length,
    periodStart,
    periodEnd,
    postsLast30Days,
    postsPerWeekApprox: Math.round(postsPerWeekApprox * 10) / 10, // Round to 1 decimal
    avgLikesPerPost: Math.round(avgLikesPerPost),
    maxLikes,
    totalCommentsAnalyzed,
    hasAnyComments,
    topPostsByLikes,
    highSignalComments,
  }
}

