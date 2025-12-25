/**
 * Facebook Opportunity Ranking
 * 
 * Deterministic function that ranks Facebook analysis insights by impact
 * and formats them for the concise UI
 */

import type { FacebookAiAnalysis, FacebookMetrics, FacebookCardStatus } from './facebook-types'
import type { AntistaticModuleId } from '@/lib/modules/catalog'

export type OpportunityImpact = 'High' | 'Medium' | 'Low'

export type FacebookOpportunity = {
  id: string
  title: string
  status: FacebookCardStatus
  impact: OpportunityImpact
  metricCurrent?: number
  metricTarget?: number
  bullets: string[] // Max 2-3 action bullets
  prescribedModule?: {
    moduleId: AntistaticModuleId
    moduleName: string
    tooltipBullets: string[]
  }
}

/**
 * Calculate overall grade (A/B/C) from analysis score
 */
export function calculateFacebookGrade(overallScore: number): 'A' | 'B' | 'C' {
  if (overallScore >= 80) return 'A'
  if (overallScore >= 60) return 'B'
  return 'C'
}

/**
 * Map Facebook module IDs to Antistatic module IDs
 */
const moduleIdMap: Record<string, AntistaticModuleId> = {
  SOCIAL_STUDIO: 'socialStudio',
  INSIGHTS_LAB: 'insightsLab',
  PROFILE_MANAGER: 'profileManager',
  REPUTATION_HUB: 'reputationHub',
}

/**
 * Determine impact level based on card status and context
 */
function determineImpact(
  card: { id: string; status: FacebookCardStatus; prescription?: any },
  metrics?: FacebookMetrics
): OpportunityImpact {
  // High impact: needs_attention cards with prescriptions
  if (card.status === 'needs_attention' && card.prescription) {
    // Cadence and engagement issues are high impact
    if (card.id === 'cadence' || card.id === 'engagement') {
      return 'High'
    }
    // Format and caption issues are medium impact
    if (card.id === 'formats' || card.id === 'captions') {
      return 'Medium'
    }
    return 'Medium'
  }

  // Medium impact: needs_attention without prescription
  if (card.status === 'needs_attention') {
    return 'Medium'
  }

  // Low impact: good status (shouldn't appear in opportunities, but handle gracefully)
  return 'Low'
}

/**
 * Extract metric values for visualization
 */
function extractMetrics(
  card: { id: string },
  metrics?: FacebookMetrics
): { current?: number; target?: number } {
  if (!metrics) return {}

  switch (card.id) {
    case 'cadence':
      return {
        current: metrics.postingCadence.postsPerWeek,
        target: 3, // Target: 3 posts per week
      }
    case 'engagement':
      return {
        current: metrics.engagement.avgEngagement,
        target: 50, // Target: 50 avg engagement
      }
    case 'formats':
      return {
        current: metrics.formatMix.videoShare,
        target: 30, // Target: 30% video mix
      }
    case 'captions':
      return {
        current: metrics.captionCoverage.captionCoveragePct,
        target: 80, // Target: 80% caption coverage
      }
    default:
      return {}
  }
}

/**
 * Rank and format opportunities from Facebook analysis
 * Returns top 3 opportunities sorted by impact
 */
export function rankFacebookOpportunities(
  analysis: FacebookAiAnalysis,
  metrics?: FacebookMetrics
): FacebookOpportunity[] {
  const opportunities: FacebookOpportunity[] = []

  // Process each card from the analysis
  for (const card of analysis.cards) {
    // Skip "next_steps" card (it's informational, not an opportunity)
    if (card.id === 'next_steps') continue

    // Only include "needs_attention" cards as opportunities
    if (card.status !== 'needs_attention') continue

    const impact = determineImpact(card, metrics)
    const metricValues = extractMetrics(card, metrics)

    // Extract bullets (limit to 2-3)
    const bullets = card.recommendedActions.slice(0, 3)

    // Map prescription if present
    let prescribedModule: FacebookOpportunity['prescribedModule'] | undefined
    if (card.prescription) {
      const antistaticModuleId = moduleIdMap[card.prescription.moduleId]
      if (antistaticModuleId) {
        prescribedModule = {
          moduleId: antistaticModuleId,
          moduleName: card.prescription.moduleName,
          tooltipBullets: card.prescription.tooltipBullets,
        }
      }
    }

    opportunities.push({
      id: card.id,
      title: card.title,
      status: card.status,
      impact,
      metricCurrent: metricValues.current,
      metricTarget: metricValues.target,
      bullets,
      prescribedModule,
    })
  }

  // Sort by impact (High > Medium > Low), then by card ID for consistency
  const impactOrder: Record<OpportunityImpact, number> = {
    High: 3,
    Medium: 2,
    Low: 1,
  }

  opportunities.sort((a, b) => {
    const impactDiff = impactOrder[b.impact] - impactOrder[a.impact]
    if (impactDiff !== 0) return impactDiff
    return a.id.localeCompare(b.id)
  })

  // Return top 3
  return opportunities.slice(0, 3)
}

/**
 * Generate "Why it worked" tags for a post based on its metrics
 */
export function generateWhyItWorkedTags(post: {
  likes: number
  comments: number
  shares: number
  views?: number | null
  text?: string | null
}): string[] {
  const tags: string[] = []

  // High engagement rate
  const totalEngagement = post.likes + post.comments + post.shares
  if (totalEngagement > 100) {
    tags.push('High engagement')
  }

  // Strong shares (viral potential)
  if (post.shares > 10) {
    tags.push('Shareable content')
  }

  // Good comments (conversation starter)
  if (post.comments > 20) {
    tags.push('Conversation starter')
  }

  // Video with views
  if (post.views && post.views > 1000) {
    tags.push('Video performance')
  }

  // Has caption
  if (post.text && post.text.length > 50) {
    tags.push('Engaging caption')
  }

  // Default if no specific tags
  if (tags.length === 0) {
    tags.push('Strong performance')
  }

  return tags.slice(0, 3) // Max 3 tags
}


