/**
 * Facebook Metrics Calculation
 * 
 * Computes derived metrics from normalized Facebook posts
 */

import type { FacebookPost, FacebookMetrics } from './facebook-types'

// Thresholds for consistency flags
const CADENCE_GOOD_POSTS_PER_WEEK = 2
const CADENCE_GOOD_MAX_GAP_DAYS = 14
const CAPTION_COVERAGE_NEEDS_ATTENTION_PCT = 30
const MIN_POSTS_FOR_CAPTION_ANALYSIS = 10

/**
 * Calculate Facebook metrics from posts
 */
export function calculateFacebookMetrics(posts: FacebookPost[]): FacebookMetrics {
  if (posts.length === 0) {
    return {
      totalPosts: 0,
      dateRange: {
        oldest: new Date().toISOString(),
        newest: new Date().toISOString(),
      },
      daysCovered: 0,
      postingCadence: {
        postsPerWeek: 0,
        medianDaysBetweenPosts: 0,
        longestGapDays: 0,
        lastPostDaysAgo: 0,
      },
      engagement: {
        avgLikes: 0,
        avgComments: 0,
        avgShares: 0,
        avgEngagement: 0,
        topPostsByEngagement: [],
      },
      formatMix: {
        videoCount: 0,
        photoCount: 0,
        videoShare: 0,
        avgViewsOnVideos: null,
        avgEngagementVideo: 0,
        avgEngagementPhoto: 0,
      },
      captionCoverage: {
        captionedPostsCount: 0,
        captionCoveragePct: 0,
      },
      consistencyFlags: {
        cadenceStatus: 'no_data',
        engagementStatus: 'no_data',
        contentMixStatus: 'no_data',
      },
    }
  }

  // Calculate date range
  const timestamps = posts
    .map((p) => new Date(p.time).getTime())
    .filter((t) => !isNaN(t))
    .sort((a, b) => a - b)

  const oldest = timestamps.length > 0 ? new Date(timestamps[0]).toISOString() : new Date().toISOString()
  const newest = timestamps.length > 0 ? new Date(timestamps[timestamps.length - 1]).toISOString() : new Date().toISOString()

  const oldestDate = new Date(oldest)
  const newestDate = new Date(newest)
  const daysCovered = Math.max(1, Math.ceil((newestDate.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24)))

  // Calculate posting cadence
  const postsPerWeek = (posts.length / daysCovered) * 7

  // Calculate gaps between posts
  const gaps: number[] = []
  for (let i = 1; i < timestamps.length; i++) {
    const gapDays = (timestamps[i] - timestamps[i - 1]) / (1000 * 60 * 60 * 24)
    gaps.push(gapDays)
  }

  const medianDaysBetweenPosts = gaps.length > 0 ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 0
  const longestGapDays = gaps.length > 0 ? Math.max(...gaps) : 0

  // Calculate last post days ago
  const now = Date.now()
  const lastPostTime = timestamps.length > 0 ? timestamps[timestamps.length - 1] : now
  const lastPostDaysAgo = Math.floor((now - lastPostTime) / (1000 * 60 * 60 * 24))

  // Calculate engagement
  const totalLikes = posts.reduce((sum, p) => sum + p.likes, 0)
  const totalComments = posts.reduce((sum, p) => sum + p.comments, 0)
  const totalShares = posts.reduce((sum, p) => sum + p.shares, 0)

  const avgLikes = posts.length > 0 ? totalLikes / posts.length : 0
  const avgComments = posts.length > 0 ? totalComments / posts.length : 0
  const avgShares = posts.length > 0 ? totalShares / posts.length : 0
  const avgEngagement = avgLikes + avgComments + avgShares

  // Top posts by engagement (top 3)
  const topPostsByEngagement = [...posts]
    .map((p) => ({
      post: p,
      engagement: p.likes + p.comments + p.shares,
    }))
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 3)
    .map(({ post }) => ({
      url: post.url,
      thumbnail: post.thumbnailUrl,
      likes: post.likes,
      comments: post.comments,
      shares: post.shares,
      views: post.viewsCount,
      posted_at: post.time,
      text: post.text,
    }))

  // Format mix
  const videoPosts = posts.filter((p) => p.isVideo)
  const photoPosts = posts.filter((p) => !p.isVideo)
  const videoCount = videoPosts.length
  const photoCount = photoPosts.length
  const videoShare = posts.length > 0 ? (videoCount / posts.length) * 100 : 0

  // Average views on videos
  const videoViews = videoPosts.map((p) => p.viewsCount).filter((v): v is number => v !== null)
  const avgViewsOnVideos = videoViews.length > 0 ? videoViews.reduce((sum, v) => sum + v, 0) / videoViews.length : null

  // Average engagement by format
  const avgEngagementVideo =
    videoPosts.length > 0
      ? videoPosts.reduce((sum, p) => sum + p.likes + p.comments + p.shares, 0) / videoPosts.length
      : 0
  const avgEngagementPhoto =
    photoPosts.length > 0
      ? photoPosts.reduce((sum, p) => sum + p.likes + p.comments + p.shares, 0) / photoPosts.length
      : 0

  // Caption coverage
  const captionedPostsCount = posts.filter((p) => p.text && p.text.trim().length > 0).length
  const captionCoveragePct = posts.length > 0 ? (captionedPostsCount / posts.length) * 100 : 0

  // Consistency flags
  let cadenceStatus: 'good' | 'needs_attention' | 'no_data' = 'no_data'
  if (posts.length >= 5) {
    if (postsPerWeek >= CADENCE_GOOD_POSTS_PER_WEEK && longestGapDays <= CADENCE_GOOD_MAX_GAP_DAYS) {
      cadenceStatus = 'good'
    } else {
      cadenceStatus = 'needs_attention'
    }
  }

  let engagementStatus: 'good' | 'needs_attention' | 'no_data' = 'no_data'
  if (posts.length >= 5) {
    // Simple heuristic: if average engagement is very low, flag it
    // This can be refined based on industry benchmarks
    if (avgEngagement < 10) {
      engagementStatus = 'needs_attention'
    } else {
      engagementStatus = 'good'
    }
  }

  let contentMixStatus: 'good' | 'needs_attention' | 'no_data' = 'no_data'
  if (posts.length >= 10) {
    // Flag if format mix is too skewed (e.g., all videos or all photos)
    // Or if videos have much lower engagement than photos
    if (videoShare > 90 || videoShare < 10) {
      contentMixStatus = 'needs_attention'
    } else if (videoCount > 0 && photoCount > 0 && avgEngagementVideo < avgEngagementPhoto * 0.5) {
      contentMixStatus = 'needs_attention'
    } else {
      contentMixStatus = 'good'
    }
  }

  return {
    totalPosts: posts.length,
    dateRange: {
      oldest,
      newest,
    },
    daysCovered,
    postingCadence: {
      postsPerWeek: Math.round(postsPerWeek * 10) / 10,
      medianDaysBetweenPosts: Math.round(medianDaysBetweenPosts * 10) / 10,
      longestGapDays: Math.round(longestGapDays),
      lastPostDaysAgo,
    },
    engagement: {
      avgLikes: Math.round(avgLikes),
      avgComments: Math.round(avgComments),
      avgShares: Math.round(avgShares),
      avgEngagement: Math.round(avgEngagement),
      topPostsByEngagement,
    },
    formatMix: {
      videoCount,
      photoCount,
      videoShare: Math.round(videoShare * 10) / 10,
      avgViewsOnVideos: avgViewsOnVideos ? Math.round(avgViewsOnVideos) : null,
      avgEngagementVideo: Math.round(avgEngagementVideo),
      avgEngagementPhoto: Math.round(avgEngagementPhoto),
    },
    captionCoverage: {
      captionedPostsCount,
      captionCoveragePct: Math.round(captionCoveragePct * 10) / 10,
    },
    consistencyFlags: {
      cadenceStatus,
      engagementStatus,
      contentMixStatus,
    },
  }
}




