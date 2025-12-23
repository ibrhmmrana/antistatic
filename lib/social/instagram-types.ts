/**
 * Instagram Analysis Types
 */

export type InstaModuleKey = 'Reputation Hub' | 'Social Studio' | 'Influencer Hub'

export type InstagramAudienceQuote = {
  username?: string
  text: string // max ~120 chars
}

export type InstagramRiskInsight = {
  id: string // slug, e.g. "sugary-fries-complaint"
  title: string // <= 80 chars
  detail: string // <= 280 chars
  severity: 'low' | 'medium' | 'high'
  severityLabel: string // e.g. "High priority", "Medium priority"
  audienceQuotes: InstagramAudienceQuote[] // 0–2 quotes
  prescribedModules: InstaModuleKey[]
}

export type InstagramAiAnalysis = {
  summary: string // 1 sentence, <= 220 chars
  whatWorks: string[] // 2–3 bullet sentences
  risksSummary: string // 1 sentence that summarises main risks, <= 220 chars
  mainRisks: InstagramRiskInsight[] // 2–4 items
}

export type InstagramMetrics = {
  username: string
  fullName?: string
  totalPostsAnalyzed: number
  periodStart?: string // oldest post timestamp
  periodEnd?: string // newest post timestamp

  postsLast30Days: number
  postsPerWeekApprox: number // approximate based on date range

  avgLikesPerPost: number
  maxLikes: number

  totalCommentsAnalyzed: number
  hasAnyComments: boolean

  topPostsByLikes: Array<{
    url: string
    captionSnippet: string
    likesCount: number
    commentsCount: number
    timestamp: string
  }>

  highSignalComments: Array<{
    text: string
    username: string
    timestamp: string
    postUrl: string
  }>
}

