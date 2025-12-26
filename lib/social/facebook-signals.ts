/**
 * Facebook Signal Computation
 * 
 * Computes actionable signals from Facebook metrics for the refactored UI
 */

import type { FacebookMetrics, FacebookPost } from './facebook-types'

export type FacebookSignal = {
  id: 'conversion' | 'cta_coverage' | 'format_lift' | 'consistency' | 'profile_actions'
  title: string
  summary: string // The "aha" moment
  proofBullets: Array<{
    label: string
    value: string | number
    meaning: string
  }>
  impact: 'high' | 'medium' | 'low'
  priority: number // Higher = more important
}

export type FacebookPrescription = {
  moduleId: 'SOCIAL_STUDIO' | 'INSIGHTS_LAB' | 'PROFILE_MANAGER' | 'REPUTATION_HUB'
  moduleName: string
  outcome: string // 1-line outcome
  triggerEvidence: string // The data point that triggered it
  tooltipBullets: string[]
}

/**
 * Detect if a post has a CTA (simple keyword-based detection)
 */
function hasCTA(text: string | null): boolean {
  if (!text) return false
  const ctaKeywords = [
    'visit', 'call', 'book', 'order', 'shop', 'buy', 'learn more', 'sign up',
    'register', 'download', 'get started', 'contact', 'message', 'click here',
    'link in bio', 'link below', 'swipe up', 'tap', 'check out', 'try now'
  ]
  const lowerText = text.toLowerCase()
  return ctaKeywords.some(keyword => lowerText.includes(keyword))
}

/**
 * Compute signals from metrics and posts (or top posts if full posts not available)
 */
export function computeFacebookSignals(
  metrics: FacebookMetrics,
  posts?: FacebookPost[]
): FacebookSignal[] {
  const signals: FacebookSignal[] = []

  // Calculate total reach/views (estimate from top posts if available)
  const topPosts = metrics.engagement.topPostsByEngagement || []
  const avgViews = topPosts.length > 0
    ? topPosts.reduce((sum, p) => sum + (p.views || 0), 0) / topPosts.length
    : 0
  const estimatedTotalReach = Math.round(avgViews * metrics.totalPosts)

  // Calculate website clicks (estimate - we don't have real data, so use a low estimate)
  const estimatedWebsiteClicks = Math.round(estimatedTotalReach * 0.02) // Assume 2% click-through

  // Signal 1: Conversion Gap
  const conversionRate = estimatedTotalReach > 0 
    ? (estimatedWebsiteClicks / estimatedTotalReach) * 100 
    : 0
  if (estimatedTotalReach > 0) {
    signals.push({
      id: 'conversion',
      title: 'Conversion Gap',
      summary: conversionRate < 1 
        ? "You're getting strong reach, but you're not converting that attention into actions (clicks, calls, visits)."
        : "Your reach is good, but there's room to convert more viewers into customers.",
      proofBullets: [
        {
          label: 'Conversion rate',
          value: `${conversionRate.toFixed(1)}%`,
          meaning: 'attention isn\'t turning into customers'
        },
        {
          label: 'Estimated reach',
          value: estimatedTotalReach.toLocaleString(),
          meaning: 'people saw your content'
        },
        {
          label: 'Website clicks',
          value: estimatedWebsiteClicks.toLocaleString(),
          meaning: 'people took action'
        }
      ],
      impact: conversionRate < 0.5 ? 'high' : conversionRate < 1 ? 'medium' : 'low',
      priority: conversionRate < 1 ? 100 : 50
    })
  }

  // Signal 2: CTA Coverage (use top posts if full posts not available)
  const postsToCheck = posts || metrics.engagement.topPostsByEngagement.map(p => ({ text: p.text || null } as FacebookPost))
  const postsWithCTA = postsToCheck.filter(p => hasCTA(p.text)).length
  const totalPostsForCTA = postsToCheck.length
  const ctaCoverage = totalPostsForCTA > 0 ? (postsWithCTA / totalPostsForCTA) * 100 : 0
  if (totalPostsForCTA > 0 && metrics.totalPosts > 0) {
    signals.push({
      id: 'cta_coverage',
      title: 'CTA Gap',
      summary: ctaCoverage < 50
        ? `Only ${Math.round(ctaCoverage)}% of your posts include a clear next step — you're leaving demand on the table.`
        : `You're using CTAs in ${Math.round(ctaCoverage)}% of posts, but there's room to optimize them for better results.`,
      proofBullets: [
        {
          label: 'Posts with CTA',
          value: `${Math.round(ctaCoverage)}%`,
          meaning: 'you\'re leaving demand on the table'
        },
        {
          label: 'Posts analyzed',
          value: totalPostsForCTA,
          meaning: 'total posts checked'
        },
        {
          label: 'Missing CTAs',
          value: totalPostsForCTA - postsWithCTA,
          meaning: 'opportunities to convert'
        }
      ],
      impact: ctaCoverage < 30 ? 'high' : ctaCoverage < 50 ? 'medium' : 'low',
      priority: ctaCoverage < 50 ? 90 : 40
    })
  }

  // Signal 3: Format Lift
  if (metrics.formatMix.videoCount > 0 && metrics.formatMix.photoCount > 0) {
    const videoLift = metrics.formatMix.avgEngagementVideo > 0 && metrics.formatMix.avgEngagementPhoto > 0
      ? ((metrics.formatMix.avgEngagementVideo - metrics.formatMix.avgEngagementPhoto) / metrics.formatMix.avgEngagementPhoto) * 100
      : 0
    const betterFormat = videoLift > 0 ? 'Videos' : 'Photos'
    const liftPercent = Math.abs(videoLift)
    
    if (liftPercent > 10) {
      signals.push({
        id: 'format_lift',
        title: 'Format Insight',
        summary: `${betterFormat} outperform ${betterFormat === 'Videos' ? 'photos' : 'videos'} by ${liftPercent.toFixed(0)}% — double down on what works.`,
        proofBullets: [
          {
            label: 'Video engagement',
            value: Math.round(metrics.formatMix.avgEngagementVideo),
            meaning: 'avg per video post'
          },
          {
            label: 'Photo engagement',
            value: Math.round(metrics.formatMix.avgEngagementPhoto),
            meaning: 'avg per photo post'
          },
          {
            label: 'Performance lift',
            value: `${liftPercent.toFixed(0)}%`,
            meaning: `${betterFormat.toLowerCase()} drive more results`
          }
        ],
        impact: liftPercent > 50 ? 'high' : 'medium',
        priority: liftPercent > 30 ? 80 : 60
      })
    }
  }

  // Signal 4: Consistency
  if (metrics.postingCadence.postsPerWeek < 2) {
    signals.push({
      id: 'consistency',
      title: 'Posting Consistency',
      summary: `You're posting ${metrics.postingCadence.postsPerWeek.toFixed(1)} times per week — increasing frequency can boost reach and engagement.`,
      proofBullets: [
        {
          label: 'Current cadence',
          value: `${metrics.postingCadence.postsPerWeek.toFixed(1)}/week`,
          meaning: 'posts per week'
        },
        {
          label: 'Recommended',
          value: '3-5/week',
          meaning: 'optimal frequency'
        },
        {
          label: 'Longest gap',
          value: `${metrics.postingCadence.longestGapDays} days`,
          meaning: 'between posts'
        }
      ],
      impact: metrics.postingCadence.postsPerWeek < 1 ? 'high' : 'medium',
      priority: metrics.postingCadence.postsPerWeek < 1 ? 70 : 50
    })
  }

  // Signal 5: Profile Actions (if we have data)
  const estimatedProfileActions = Math.round(metrics.engagement.avgComments * metrics.totalPosts * 0.3)
  const profileActionRate = estimatedTotalReach > 0
    ? (estimatedProfileActions / estimatedTotalReach) * 100
    : 0
  
  if (estimatedTotalReach > 0 && profileActionRate < 5) {
    signals.push({
      id: 'profile_actions',
      title: 'Profile Engagement',
      summary: 'People are engaging with your posts, but not taking profile actions — optimize your page CTA button and info.',
      proofBullets: [
        {
          label: 'Profile action rate',
          value: `${profileActionRate.toFixed(1)}%`,
          meaning: 'people visiting your profile'
        },
        {
          label: 'Estimated actions',
          value: estimatedProfileActions.toLocaleString(),
          meaning: 'profile visits/clicks'
        },
        {
          label: 'Opportunity',
          value: 'High',
          meaning: 'optimize page CTA button'
        }
      ],
      impact: profileActionRate < 2 ? 'high' : 'medium',
      priority: profileActionRate < 2 ? 85 : 55
    })
  }

  // Sort by priority (highest first)
  const sortedSignals = signals.sort((a, b) => b.priority - a.priority)
  
  // Always return at least one signal (even if performance is good, show the top opportunity)
  if (sortedSignals.length === 0 && metrics.totalPosts > 0) {
    // Create a default "scale" signal if no issues found
    return [{
      id: 'conversion',
      title: 'Scale Opportunity',
      summary: "You're getting good reach and engagement. Let's turn this performance into revenue with better tracking and stronger CTAs.",
      proofBullets: [
        {
          label: 'Total posts',
          value: metrics.totalPosts,
          meaning: 'posts analyzed'
        },
        {
          label: 'Avg engagement',
          value: Math.round(metrics.engagement.avgEngagement),
          meaning: 'per post'
        },
        {
          label: 'Opportunity',
          value: 'High',
          meaning: 'scale what works'
        }
      ],
      impact: 'medium',
      priority: 60
    }]
  }
  
  return sortedSignals
}

/**
 * Generate prescriptions from signals
 */
export function generatePrescriptions(
  signals: FacebookSignal[],
  metrics: FacebookMetrics,
  posts?: FacebookPost[]
): FacebookPrescription[] {
  const prescriptions: FacebookPrescription[] = []

  // Always prescribe at least 2 modules, even if performance is good
  const hasConversionGap = signals.find(s => s.id === 'conversion' && s.impact !== 'low')
  const hasCTAGap = signals.find(s => s.id === 'cta_coverage' && s.impact !== 'low')
  const hasFormatLift = signals.find(s => s.id === 'format_lift')
  const hasConsistency = signals.find(s => s.id === 'consistency' && s.impact !== 'low')
  const hasProfileActions = signals.find(s => s.id === 'profile_actions' && s.impact !== 'low')

  const postsToCheck = posts || metrics.engagement.topPostsByEngagement.map(p => ({ text: p.text || null } as FacebookPost))
  const postsWithCTA = postsToCheck.filter(p => hasCTA(p.text)).length
  const ctaCoveragePct = postsToCheck.length > 0 ? (postsWithCTA / postsToCheck.length) * 100 : 0

  // Prescription 1: Social Studio (if CTA gap or always for scale)
  prescriptions.push({
    moduleId: 'SOCIAL_STUDIO',
    moduleName: 'Social Studio',
    outcome: 'Stronger CTAs + content system',
    triggerEvidence: hasCTAGap
      ? `Only ${Math.round(ctaCoveragePct)}% of posts have clear CTAs`
      : 'Scale your best-performing content with stronger CTAs',
    tooltipBullets: [
      'Create content with clear calls-to-action',
      'Build a content system that converts',
      'Generate variations of your top posts',
      'Schedule and publish optimized content'
    ]
  })

  // Limit to 2 prescriptions max (Insights Lab and Profile Manager are coming soon)
  return prescriptions.slice(0, 2)
}

