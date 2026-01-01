/**
 * Shared Types for Social Channel Analysis
 * Used by both Instagram and Facebook analysis
 */

export type SocialModuleKey = 'reputationHub' | 'socialStudio' | 'insightsLab'
export type Priority = 'high' | 'medium' | 'low'

export type SocialAudienceQuote = {
  handle?: string
  text: string
}

export type SocialOpportunity = {
  id: string
  title: string
  priority: Priority
  description: string
  evidenceTitle: string // "Audience said" or "Evidence"
  evidenceBullets: string[] // short, punchy bullets with numbers
  audienceQuotes?: SocialAudienceQuote[] // optional if comment text exists
  examplePosts?: Array<{
    postId: string
    url: string
    thumbnail?: string | null
    likes?: number
    comments?: number
    shares?: number
  }>
  solutions: SocialModuleKey[]
}

export type SocialChannelAnalysis = {
  platform: 'facebook' | 'instagram'
  handleLabel: string // "Arsenal" or "@arsenal" depending on platform
  statsBadges: Array<{ label: string; value: string }> // 3 badges
  summaryLine: string
  whatsWorkingBullets: string[]
  risksBullets: string[]
  opportunities: SocialOpportunity[]
}




