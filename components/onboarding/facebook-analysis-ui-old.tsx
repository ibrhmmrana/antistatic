'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy'
import { createPortal } from 'react-dom'
import type { FacebookAiAnalysis, FacebookMetrics } from '@/lib/social/facebook-types'
import { rankFacebookOpportunities, calculateFacebookGrade, generateWhyItWorkedTags } from '@/lib/social/facebook-opportunities'
import { getModules, type AntistaticModuleId } from '@/lib/modules/catalog'

// #region agent log
if (typeof window !== 'undefined') {
  fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-analysis-ui.tsx:11',message:'Module-level import check',data:{LocalPharmacyIcon:typeof LocalPharmacyIcon,LocalPharmacyIconUndef:LocalPharmacyIcon===undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
}
// #endregion

// Chart components - dynamically imported to avoid SSR issues
const FunnelChartComponent = dynamic(
  () => import('./facebook-funnel-chart').catch(() => ({ default: () => <div className="h-[200px] flex items-center justify-center text-sm text-slate-500">Chart unavailable</div> })),
  { 
    ssr: false,
    loading: () => <div className="h-[200px] flex items-center justify-center text-sm text-slate-500">Loading chart...</div>
  }
)
const PostTypeChartComponent = dynamic(
  () => import('./facebook-post-type-chart').catch(() => ({ default: () => <div className="h-[200px] flex items-center justify-center text-sm text-slate-500">Chart unavailable</div> })),
  { 
    ssr: false,
    loading: () => <div className="h-[200px] flex items-center justify-center text-sm text-slate-500">Loading chart...</div>
  }
)

interface FacebookAnalysisUIProps {
  analysis: FacebookAiAnalysis
  metrics: FacebookMetrics
  facebookUrl: string
  onRefresh: () => void
  isRefreshing: boolean
}

// Prescription Pill Component with Tooltip
function PrescriptionPill({ 
  moduleId, 
  moduleName, 
  tooltipBullets 
}: { 
  moduleId: AntistaticModuleId
  moduleName: string
  tooltipBullets: string[]
}) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, right: 0 })

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltipPosition({
      top: rect.top - 8,
      right: window.innerWidth - rect.right,
    })
    setShowTooltip(true)
  }

  const handleMouseLeave = () => {
    setShowTooltip(false)
  }

  const modules = getModules([moduleId])
  const module = modules[0]
  if (!module) return null

  // #region agent log
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-analysis-ui.tsx:64',message:'PrescriptionPill render check',data:{LocalPharmacyIcon:typeof LocalPharmacyIcon,LocalPharmacyIconUndef:LocalPharmacyIcon===undefined,createPortal:typeof createPortal},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  }
  // #endregion

  if (!LocalPharmacyIcon) {
    return <div className="text-xs text-purple-700">Rx: {moduleName}</div>
  }

  return (
    <>
      <div
        className="inline-flex items-center gap-1.5 rounded-full border-2 border-purple-500 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 cursor-help relative"
        style={{ fontFamily: 'var(--font-roboto-stack)' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <LocalPharmacyIcon sx={{ fontSize: 14 }} />
        <span>Rx: {moduleName}</span>
      </div>
      {showTooltip && typeof window !== 'undefined' && document?.body &&
        createPortal(
          <div
            className="fixed z-[9999] bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-w-xs"
            style={{
              top: `${tooltipPosition.top}px`,
              right: `${tooltipPosition.right}px`,
              transform: 'translateY(-100%)',
              fontFamily: 'var(--font-roboto-stack)',
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <p className="text-sm font-semibold text-slate-900 mb-2">{moduleName}</p>
            <ul className="space-y-1.5">
              {tooltipBullets.map((bullet, idx) => (
                <li key={idx} className="text-xs text-slate-700 flex items-start gap-2">
                  <span className="text-slate-400 mt-0.5">•</span>
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )}
    </>
  )
}

export function FacebookAnalysisUI({
  analysis,
  metrics,
  facebookUrl,
  onRefresh,
  isRefreshing,
}: FacebookAnalysisUIProps) {
  // #region agent log
  if (typeof window !== 'undefined') {
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-analysis-ui.tsx:106',message:'FacebookAnalysisUI entry',data:{LocalPharmacyIcon:typeof LocalPharmacyIcon,FunnelChartComponent:typeof FunnelChartComponent,PostTypeChartComponent:typeof PostTypeChartComponent,LocalPharmacyIconUndef:LocalPharmacyIcon===undefined,FunnelChartComponentUndef:FunnelChartComponent===undefined,PostTypeChartComponentUndef:PostTypeChartComponent===undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  }
  // #endregion
  
  
  // Defensive checks for old data format
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

  // Check for required fields
  const overallScore = typeof analysis.overallScore === 'number' ? analysis.overallScore : 50
  
  // Safely call functions with error handling
  let opportunities: ReturnType<typeof rankFacebookOpportunities> = []
  let grade: 'A' | 'B' | 'C' = 'C'
  
  try {
    if (analysis && typeof rankFacebookOpportunities === 'function') {
      opportunities = rankFacebookOpportunities(analysis, metrics) || []
    }
    if (typeof calculateFacebookGrade === 'function') {
      grade = calculateFacebookGrade(overallScore)
    }
  } catch (error) {
    console.error('Error processing Facebook analysis:', error)
  }
  const gradeColors = {
    A: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    B: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    C: 'bg-red-100 text-red-700 border-red-300',
  }

  // Calculate timeframe with defensive checks
  const daysCovered = metrics?.daysCovered || 0
  const timeframe = daysCovered >= 30 ? 'Last 30 days' : daysCovered >= 7 ? `Last ${daysCovered} days` : `Last ${daysCovered} days`

  // Prepare KPI data with defensive checks
  const topPosts = metrics?.engagement?.topPostsByEngagement || []
  const avgViews = topPosts.length > 0
    ? topPosts.reduce((sum, p) => sum + (p.views || 0), 0) / topPosts.length
    : 0
  const engagementRate = metrics?.engagement?.avgEngagement || 0
  const clicksActions = 0 // Not available in current metrics
  const postsPerWeek = metrics?.postingCadence?.postsPerWeek || 0
  const consistencyScore = postsPerWeek >= 2 ? 85 : postsPerWeek >= 1 ? 60 : 40

  // Prepare funnel data (estimated from available metrics) with defensive checks
  const totalPosts = metrics?.totalPosts || 0
  const avgComments = metrics?.engagement?.avgComments || 0
  const estimatedTotalViews = Math.round(avgViews * totalPosts)
  const estimatedTotalEngagement = Math.round(engagementRate * totalPosts)
  const estimatedProfileActions = Math.round(avgComments * totalPosts * 0.3)
  const estimatedWebsiteClicks = Math.round(estimatedTotalViews * 0.05)

  const funnelData = [
    { name: 'Views', value: estimatedTotalViews, fill: '#3b82f6' },
    { name: 'Engagement', value: estimatedTotalEngagement, fill: '#8b5cf6' },
    { name: 'Profile Actions', value: estimatedProfileActions, fill: '#ec4899' },
    { name: 'Website Clicks', value: estimatedWebsiteClicks, fill: '#10b981' },
  ]

  // Prepare post type data with defensive checks
  const photoCount = metrics?.formatMix?.photoCount || 0
  const videoCount = metrics?.formatMix?.videoCount || 0
  const postTypeData = [
    { name: 'Photos', value: photoCount, fill: '#3b82f6' },
    { name: 'Videos', value: videoCount, fill: '#8b5cf6' },
  ]

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

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-600 mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>Views/Reach</p>
          <p className="text-lg font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {Math.round(avgViews).toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>avg per post</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-600 mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>Engagement Rate</p>
          <p className="text-lg font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {Math.round(engagementRate)}
          </p>
          <p className="text-xs text-slate-500 mt-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>avg per post</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-600 mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>Clicks/Actions</p>
          <p className="text-lg font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {clicksActions > 0 ? clicksActions.toLocaleString() : '—'}
          </p>
          <p className="text-xs text-slate-500 mt-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>total</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-600 mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>Posting Consistency</p>
          <p className="text-lg font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {consistencyScore}%
          </p>
          <p className="text-xs text-slate-500 mt-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {postsPerWeek.toFixed(1)}/week
          </p>
        </div>
      </div>

      {/* Top Opportunities */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Top Opportunities
        </h3>
        {opportunities.length > 0 ? (
          <div className="space-y-3">
            {opportunities.map((opp) => {
              const impactColors = {
                High: 'bg-red-100 text-red-700 border-red-300',
                Medium: 'bg-orange-100 text-orange-700 border-orange-300',
                Low: 'bg-yellow-100 text-yellow-700 border-yellow-300',
              }

              const progress = opp.metricCurrent && opp.metricTarget
                ? Math.min((opp.metricCurrent / opp.metricTarget) * 100, 100)
                : null

              return (
                <div key={opp.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                          {opp.title}
                        </h4>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${impactColors[opp.impact]}`} style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                          {opp.impact} Impact
                        </span>
                      </div>
                      {progress !== null && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-xs text-slate-600 mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                            <span>Current: {opp.metricCurrent?.toFixed(1)}</span>
                            <span>Target: {opp.metricTarget?.toFixed(1)}</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${opp.impact === 'High' ? 'bg-red-500' : opp.impact === 'Medium' ? 'bg-orange-500' : 'bg-yellow-500'}`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Bullets */}
                  <ul className="space-y-1 mb-3">
                    {opp.bullets.map((bullet, idx) => (
                      <li key={idx} className="text-xs text-slate-700 flex items-start gap-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                        <span className="text-slate-400 mt-0.5">•</span>
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Prescription */}
                  {opp.prescribedModule && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <PrescriptionPill
                        moduleId={opp.prescribedModule.moduleId}
                        moduleName={opp.prescribedModule.moduleName}
                        tooltipBullets={opp.prescribedModule.tooltipBullets}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
            <p className="text-sm text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              No opportunities identified. Your Facebook presence is performing well!
            </p>
          </div>
        )}
      </div>

      {/* More Findings */}
      {analysis.cards.length > opportunities.length && (
        <div className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            More Findings
          </h3>
          <div className="space-y-3">
            {analysis.cards
              .filter((card) => !opportunities.find((opp) => opp.id === card.id))
              .map((card) => (
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
        </div>
      )}

      {/* Visualizations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Funnel Chart */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Engagement Funnel
          </h3>
          {funnelData.some((d) => d.value > 0) ? (
            (() => {
              // #region agent log
              if (typeof window !== 'undefined') {
                fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-analysis-ui.tsx:383',message:'Rendering FunnelChartComponent',data:{FunnelChartComponent:typeof FunnelChartComponent,FunnelChartComponentUndef:FunnelChartComponent===undefined,isFunction:typeof FunnelChartComponent==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              }
              // #endregion
              if (!FunnelChartComponent) {
                return <div className="h-[200px] flex items-center justify-center text-sm text-slate-500">Chart loading...</div>
              }
              return <FunnelChartComponent data={funnelData} />
            })()
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Not enough data yet
            </div>
          )}
        </div>

        {/* Post Type Performance */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-4" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Post Type Performance
          </h3>
          {postTypeData.some((d) => d.value > 0) ? (
            (() => {
              // #region agent log
              if (typeof window !== 'undefined') {
                fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'facebook-analysis-ui.tsx:397',message:'Rendering PostTypeChartComponent',data:{PostTypeChartComponent:typeof PostTypeChartComponent,PostTypeChartComponentUndef:PostTypeChartComponent===undefined,isFunction:typeof PostTypeChartComponent==='function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
              }
              // #endregion
              if (!PostTypeChartComponent) {
                return <div className="h-[200px] flex items-center justify-center text-sm text-slate-500">Chart loading...</div>
              }
              return <PostTypeChartComponent data={postTypeData} />
            })()
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              Not enough data yet
            </div>
          )}
        </div>
      </div>

      {/* Top Performing Posts */}
      {metrics.engagement.topPostsByEngagement.length > 0 && (
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
              Create 5 posts like these →
            </a>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {metrics.engagement.topPostsByEngagement.slice(0, 3).map((post, idx) => {
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
    </div>
  )
}

