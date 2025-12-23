'use client'

import { SocialChannelAnalysisReport } from './social-channel-analysis-report'
import { buildFacebookAnalysis } from '@/lib/social/facebook-transformer'
import type { FacebookPost, FacebookMetrics } from '@/lib/social/facebook-types'

interface FacebookAnalysisUIProps {
  analysis: any // Old AI analysis format (we'll ignore it)
  metrics: FacebookMetrics
  posts?: FacebookPost[] // Raw posts if available
  pageName?: string | null
  facebookUrl: string
  onRefresh: () => void
  isRefreshing: boolean
}

export function FacebookAnalysisUI({
  analysis,
  metrics,
  posts,
  pageName,
  facebookUrl,
  onRefresh,
  isRefreshing,
}: FacebookAnalysisUIProps) {
  // If we have raw posts, use them. Otherwise, reconstruct from metrics
  let postsToUse: FacebookPost[] = posts || []

  // If no raw posts provided, reconstruct from metrics.topPostsByEngagement
  if (postsToUse.length === 0 && metrics?.engagement?.topPostsByEngagement) {
    postsToUse = metrics.engagement.topPostsByEngagement.map((p) => ({
      facebookUrl: facebookUrl,
      postId: p.url.split('/').pop() || '',
      url: p.url,
      topLevelUrl: p.url,
      time: p.posted_at,
      isVideo: false, // We don't know from this data
      text: p.text,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      viewsCount: p.views,
      thumbnailUrl: p.thumbnail,
      pageName: pageName || null,
      profilePic: null,
    }))
  }

  // Build the analysis using the transformer
  const socialAnalysis = buildFacebookAnalysis(
    postsToUse,
    pageName || metrics?.engagement?.topPostsByEngagement?.[0]?.url?.split('/').pop() || 'Facebook Page',
    new Date(),
    30
  )

  return (
    <SocialChannelAnalysisReport
      analysis={socialAnalysis}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
    />
  )
}
