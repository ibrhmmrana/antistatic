'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { FacebookAiAnalysis, FacebookMetrics, FacebookPost } from '@/lib/social/facebook-types'
import { calculateFacebookGrade, generateWhyItWorkedTags } from '@/lib/social/facebook-opportunities'
import { computeFacebookSignals, generatePrescriptions } from '@/lib/social/facebook-signals'
import { BigUnlockCard } from './facebook-big-unlock-card'
import { PrescriptionCard } from './facebook-prescription-card'

// Chart components - dynamically imported to avoid SSR issues
const FunnelChartEnhanced = dynamic(
  () => import('./facebook-funnel-chart-enhanced').catch(() => ({ default: () => <div className="h-[250px] flex items-center justify-center text-sm text-slate-500">Chart unavailable</div> })),
  { 
    ssr: false,
    loading: () => <div className="h-[250px] flex items-center justify-center text-sm text-slate-500">Loading chart...</div>
  }
)
const CTAImpactChart = dynamic(
  () => import('./facebook-cta-impact-chart').catch(() => ({ default: () => <div className="h-[250px] flex items-center justify-center text-sm text-slate-500">Chart unavailable</div> })),
  { 
    ssr: false,
    loading: () => <div className="h-[250px] flex items-center justify-center text-sm text-slate-500">Loading chart...</div>
  }
)

interface FacebookAnalysisUIProps {
  analysis: FacebookAiAnalysis
  metrics: FacebookMetrics
  facebookUrl: string
  onRefresh: () => void
  isRefreshing: boolean
}

export function FacebookAnalysisUI({
  analysis,
  metrics,
  facebookUrl,
  onRefresh,
  isRefreshing,
}: FacebookAnalysisUIProps) {
  const [showMoreFindings, setShowMoreFindings] = useState(false)
  
  // Defensive checks
  if (!analysis || typeof analysis !== 'object') {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Analysis data is missing or in an old format. Please refresh the analysis.
        </p>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          style={{ fontFamily: 'var(--font-roboto-stack)' }}
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh Analysis'}
        </button>
      </div>
    )
  }

  // Compute signals and prescriptions
  const signals = computeFacebookSignals(metrics)
  const prescriptions = generatePrescriptions(signals, metrics)
  const topSignal = signals[0] // Biggest missed opportunity
  
  // Calculate grade
  const overallScore = typeof analysis.overallScore === 'number' ? analysis.overallScore : 50
  const grade = calculateFacebookGrade(overallScore)
  const gradeColors = {
    A: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    B: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    C: 'bg-red-100 text-red-700 border-red-300',
  }

  // Calculate timeframe
  const daysCovered = metrics?.daysCovered || 0
  const timeframe = daysCovered >= 30 ? 'Last 30 days' : daysCovered >= 7 ? `Last ${daysCovered} days` : `Last ${daysCovered} days`
  const totalPosts = metrics?.totalPosts || 0

  // Prepare funnel data with conversion rates
  const topPosts = metrics?.engagement?.topPostsByEngagement || []
  const avgViews = topPosts.length > 0
    ? topPosts.reduce((sum, p) => sum + (p.views || 0), 0) / topPosts.length
    : 0
  
  const estimatedReach = Math.round(avgViews * totalPosts)
  const estimatedEngagement = Math.round(metrics.engagement.avgEngagement * totalPosts)
  const estimatedProfileActions = Math.round(metrics.engagement.avgComments * totalPosts * 0.3)
  const estimatedWebsiteClicks = Math.round(estimatedReach * 0.02) // Assume 2% click-through

  const engagementToReachRate = estimatedReach > 0 ? ((estimatedEngagement / estimatedReach) * 100).toFixed(1) : '0'
  const profileActionsToEngagementRate = estimatedEngagement > 0 ? ((estimatedProfileActions / estimatedEngagement) * 100).toFixed(1) : '0'
  const clicksToReachRate = estimatedReach > 0 ? ((estimatedWebsiteClicks / estimatedReach) * 100).toFixed(1) : '0'

  const funnelData = [
    { 
      name: 'Reach', 
      value: estimatedReach, 
      fill: '#3b82f6',
      conversionRate: undefined
    },
    { 
      name: 'Engagement', 
      value: estimatedEngagement, 
      fill: '#8b5cf6',
      conversionRate: `${engagementToReachRate}% of reach`
    },
    { 
      name: 'Profile Actions', 
      value: estimatedProfileActions, 
      fill: '#ec4899',
      conversionRate: `${profileActionsToEngagementRate}% of engagement`
    },
    { 
      name: 'Website Clicks', 
      value: estimatedWebsiteClicks, 
      fill: '#10b981',
      conversionRate: `${clicksToReachRate}% of reach`
    },
  ]

  // Prepare CTA impact data (use top posts for CTA detection)
  const postsWithCTA = topPosts.filter(p => {
    if (!p.text) return false
    const ctaKeywords = ['visit', 'call', 'book', 'order', 'shop', 'buy', 'learn more', 'sign up', 'register', 'download', 'get started', 'contact', 'message', 'click here', 'link in bio', 'link below', 'swipe up', 'tap', 'check out', 'try now']
    const lowerText = p.text.toLowerCase()
    return ctaKeywords.some(keyword => lowerText.includes(keyword))
  })
  
  const postsWithoutCTA = topPosts.filter(p => {
    if (!p.text) return true
    const ctaKeywords = ['visit', 'call', 'book', 'order', 'shop', 'buy', 'learn more', 'sign up', 'register', 'download', 'get started', 'contact', 'message', 'click here', 'link in bio', 'link below', 'swipe up', 'tap', 'check out', 'try now']
    const lowerText = p.text.toLowerCase()
    return !ctaKeywords.some(keyword => lowerText.includes(keyword))
  })

  const avgActionsWithCTA = postsWithCTA.length > 0
    ? postsWithCTA.reduce((sum, p) => sum + p.likes + p.comments + p.shares, 0) / postsWithCTA.length
    : 0
  const avgActionsWithoutCTA = postsWithoutCTA.length > 0
    ? postsWithoutCTA.reduce((sum, p) => sum + p.likes + p.comments + p.shares, 0) / postsWithoutCTA.length
    : 0

  const ctaImpactData = [
    { name: 'With CTA', value: Math.round(avgActionsWithCTA), fill: '#10b981' },
    { name: 'No CTA', value: Math.round(avgActionsWithoutCTA), fill: '#ef4444' },
  ]

  // Format performance data (fallback if CTA data is insufficient)
  const formatPerformanceData = [
    { 
      name: 'Videos', 
      value: Math.round(metrics.formatMix.avgEngagementVideo), 
      fill: '#8b5cf6' 
    },
    { 
      name: 'Photos', 
      value: Math.round(metrics.formatMix.avgEngagementPhoto), 
      fill: '#3b82f6' 
    },
  ]

  // Determine which chart to show (CTA impact if we have enough data, otherwise format performance)
  const showCTAChart = postsWithCTA.length > 0 && postsWithoutCTA.length > 0 && (avgActionsWithCTA > 0 || avgActionsWithoutCTA > 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-xl font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Facebook diagnosis
            </h2>
            <span className={`px-3 py-1 rounded-full text-sm font-bold border-2 ${gradeColors[grade]}`} style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Grade {grade}
            </span>
          </div>
          <p className="text-sm text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {timeframe} • {totalPosts} posts analyzed
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          style={{ fontFamily: 'var(--font-roboto-stack)' }}
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* Big Unlock Card - Always show the top signal */}
      {topSignal && (
        <BigUnlockCard signal={topSignal} />
      )}

      {/* Prescriptions - Always show 2-3 modules */}
      {prescriptions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Prescriptions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {prescriptions.map((prescription, idx) => (
              <PrescriptionCard key={idx} prescription={prescription} />
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Funnel Chart with Conversion Rates */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Attention → Action Funnel
          </h3>
          {funnelData.some((d) => d.value > 0) ? (
            <FunnelChartEnhanced data={funnelData} />
          ) : (
            <div className="h-[250px] flex items-center justify-center text-sm text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Not enough data yet
            </div>
          )}
        </div>

        {/* CTA Impact or Format Performance */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {showCTAChart ? 'CTA Impact' : 'Format Performance'}
          </h3>
          {showCTAChart ? (
            ctaImpactData.some((d) => d.value > 0) ? (
              <CTAImpactChart data={ctaImpactData} />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-sm text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                Not enough data yet
              </div>
            )
          ) : (
            formatPerformanceData.some((d) => d.value > 0) ? (
              <CTAImpactChart data={formatPerformanceData} />
            ) : (
              <div className="h-[250px] flex items-center justify-center text-sm text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                Not enough data yet
              </div>
            )
          )}
        </div>
      </div>

      {/* Top Performing Posts */}
      {topPosts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Top Performing Posts
            </h3>
            <a
              href="/social/studio"
              className="text-xs font-medium text-purple-700 hover:text-purple-900 underline"
              style={{ fontFamily: 'var(--font-roboto-stack)' }}
            >
              Generate 5 variations →
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topPosts.slice(0, 3).map((post, idx) => {
              const tags = generateWhyItWorkedTags(post)
              return (
                <a
                  key={idx}
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-slate-200 bg-white p-3 hover:shadow-md transition-shadow"
                >
                  {post.thumbnail && (
                    <img
                      src={post.thumbnail}
                      alt="Post thumbnail"
                      className="w-full h-32 object-cover rounded mb-2"
                    />
                  )}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span>👍 {post.likes}</span>
                      <span>💬 {post.comments}</span>
                      <span>📤 {post.shares}</span>
                      {post.views && <span>👁️ {post.views}</span>}
                    </div>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map((tag, tagIdx) => (
                          <span
                            key={tagIdx}
                            className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-purple-50 text-purple-700 border border-purple-200"
                            style={{ fontFamily: 'var(--font-roboto-stack)' }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* More Findings Accordion (collapsed by default) */}
      {analysis.cards.length > 0 && (
        <div className="border border-slate-200 rounded-lg">
          <button
            onClick={() => setShowMoreFindings(!showMoreFindings)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-50 transition-colors"
          >
            <span className="text-sm font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              More findings ({analysis.cards.length})
            </span>
            <span className="text-slate-400">{showMoreFindings ? '▲' : '▼'}</span>
          </button>
          {showMoreFindings && (
            <div className="p-4 pt-0 space-y-3 border-t border-slate-200">
              {analysis.cards.map((card) => (
                <div key={card.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                      {card.title}
                    </h4>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      card.status === 'good' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                      card.status === 'needs_attention' ? 'bg-red-100 text-red-700 border-red-300' :
                      'bg-yellow-100 text-yellow-700 border-yellow-300'
                    }`} style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                      {card.status === 'good' ? 'Good' : card.status === 'needs_attention' ? 'Needs Attention' : 'No Data'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    {card.diagnosis}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}




