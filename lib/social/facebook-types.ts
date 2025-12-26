/**
 * Facebook Analysis Types
 */

export type FacebookModuleId = 'SOCIAL_STUDIO' | 'INSIGHTS_LAB' | 'PROFILE_MANAGER' | 'REPUTATION_HUB'

export type FacebookCardStatus = 'good' | 'needs_attention' | 'no_data'

export type FacebookCardId = 'cadence' | 'engagement' | 'formats' | 'captions' | 'next_steps'

export type FacebookPrescription = {
  moduleId: FacebookModuleId
  moduleName: string
  tooltipBullets: string[] // 3-6 bullets
}

export type FacebookDiagnosticCard = {
  id: FacebookCardId
  title: string
  status: FacebookCardStatus
  diagnosis: string // plain language, doctor tone
  whyItMatters: string // 1 sentence
  recommendedActions: string[] // 2-5 actions
  prescription?: FacebookPrescription // only when status = needs_attention
}

export type FacebookContentPillar = {
  name: string
  rationale: string
}

export type FacebookAiAnalysis = {
  overallScore: number // 0-100
  summary: string // 1-2 sentences
  keyFindings: string[] // 3-6 bullets
  cards: FacebookDiagnosticCard[]
  contentPillars: FacebookContentPillar[]
  next7DaysPlan: string[] // concrete posting ideas
}

export type FacebookPost = {
  facebookUrl: string
  postId: string
  url: string
  topLevelUrl: string
  time: string // ISO timestamp
  isVideo: boolean
  text: string | null
  likes: number
  comments: number
  shares: number
  viewsCount: number | null
  thumbnailUrl: string | null
  pageName: string | null
  profilePic: string | null
}

export type FacebookMetrics = {
  totalPosts: number
  dateRange: {
    oldest: string // ISO
    newest: string // ISO
  }
  daysCovered: number
  postingCadence: {
    postsPerWeek: number
    medianDaysBetweenPosts: number
    longestGapDays: number
    lastPostDaysAgo: number
  }
  engagement: {
    avgLikes: number
    avgComments: number
    avgShares: number
    avgEngagement: number // likes + comments + shares
    topPostsByEngagement: Array<{
      url: string
      thumbnail: string | null
      likes: number
      comments: number
      shares: number
      views: number | null
      posted_at: string
      text: string | null
    }>
  }
  formatMix: {
    videoCount: number
    photoCount: number
    videoShare: number // percentage
    avgViewsOnVideos: number | null
    avgEngagementVideo: number
    avgEngagementPhoto: number
  }
  captionCoverage: {
    captionedPostsCount: number
    captionCoveragePct: number
  }
  consistencyFlags: {
    cadenceStatus: FacebookCardStatus
    engagementStatus: FacebookCardStatus
    contentMixStatus: FacebookCardStatus
  }
}



