'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import WarningIcon from '@mui/icons-material/Warning'
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy'
import { getModules, type AntistaticModuleId } from '@/lib/modules/catalog'
import type { SocialChannelAnalysis, SocialModuleKey } from '@/lib/social/shared-types'

interface SocialChannelAnalysisReportProps {
  analysis: SocialChannelAnalysis
  onRefresh?: () => void
  isRefreshing?: boolean
}

function ModulePrescriptionPill({ moduleKey }: { moduleKey: SocialModuleKey }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, right: 0 })
  const pillRef = useRef<HTMLDivElement>(null)

  const moduleMap: Record<SocialModuleKey, AntistaticModuleId> = {
    reputationHub: 'reputationHub',
    socialStudio: 'socialStudio',
    insightsLab: 'insightsLab',
  }

  const antistaticModuleId = moduleMap[moduleKey]
  const modules = antistaticModuleId ? getModules([antistaticModuleId]) : []
  const module = modules[0]

  if (!module) return null

  const handleMouseEnter = () => {
    if (pillRef.current) {
      const rect = pillRef.current.getBoundingClientRect()
      setTooltipPosition({
        top: rect.top - 8,
        right: window.innerWidth - rect.right,
      })
      setShowTooltip(true)
    }
  }

  const handleMouseLeave = () => {
    setShowTooltip(false)
  }

  return (
    <>
      <div
        ref={pillRef}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${module.colorClass} ${module.textColorClass} cursor-help relative`}
        style={{ fontFamily: 'var(--font-roboto-stack)' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <LocalPharmacyIcon sx={{ fontSize: 14 }} />
        <span>
          Fix it with{' '}
          <span className="module-name-product-sans">
            {module.label}
          </span>
        </span>
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
            <p className="text-sm font-semibold text-slate-900 mb-2">{module.tooltipTitle}</p>
            <ul className="space-y-1.5">
              {module.tooltipBullets.map((bullet, idx) => (
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

export function SocialChannelAnalysisReport({
  analysis,
  onRefresh,
  isRefreshing = false,
}: SocialChannelAnalysisReportProps) {
  const [visibleCards, setVisibleCards] = useState<Set<number>>(new Set())
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  const priorityColors = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-orange-100 text-orange-700 border-orange-200',
    low: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  }

  // Intersection Observer for scroll-triggered animations
  useEffect(() => {
    if (!analysis.opportunities || analysis.opportunities.length === 0) {
      setVisibleCards(new Set())
      return
    }

    setVisibleCards(new Set())

    const observers: IntersectionObserver[] = []

    const observeCards = () => {
      cardRefs.current.forEach((card, idx) => {
        if (!card) return

        const rect = card.getBoundingClientRect()
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0

        if (isInViewport) {
          setVisibleCards((prev) => new Set([...prev, idx]))
        } else {
          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  setVisibleCards((prev) => new Set([...prev, idx]))
                  observer.unobserve(card)
                }
              })
            },
            { threshold: 0.1, rootMargin: '50px' }
          )

          observer.observe(card)
          observers.push(observer)
        }
      })
    }

    observeCards()
    const timeoutId = setTimeout(observeCards, 100)

    const fallbackTimeoutId = setTimeout(() => {
      if (analysis.opportunities) {
        const allIndices = new Set(analysis.opportunities.map((_, idx) => idx))
        setVisibleCards(allIndices)
      }
    }, 1000)

    return () => {
      clearTimeout(timeoutId)
      clearTimeout(fallbackTimeoutId)
      observers.forEach((obs) => obs.disconnect())
    }
  }, [analysis.opportunities])

  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-5 md:p-6 space-y-4 md:space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-base md:text-lg font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              {analysis.handleLabel}
            </p>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium 
                  bg-white border border-slate-300 
                  text-slate-700
                  hover:bg-slate-50 
                  hover:border-slate-400
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-200 flex-shrink-0"
                style={{ fontFamily: 'var(--font-roboto-stack)' }}
                title="Refresh analysis"
              >
                {isRefreshing ? 'Refreshing...' : 'Refresh Analysis'}
              </button>
            )}
          </div>

          {/* Stats Badges */}
          <div className="flex flex-wrap items-center gap-2">
            {analysis.statsBadges.map((badge, idx) => (
              <span
                key={idx}
                className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                  idx === analysis.statsBadges.length - 1
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
                style={{ fontFamily: 'var(--font-roboto-stack)' }}
              >
                {badge.label}: {badge.value}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Summary Line */}
      <div className="rounded-lg bg-slate-100 border border-slate-200 p-4">
        <p className="text-sm text-slate-900 whitespace-pre-line" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          {analysis.summaryLine}
        </p>
      </div>

      {/* What Works / Risks Row */}
      <div className="flex flex-col gap-3 md:flex-row">
        {/* What Works Panel */}
        {analysis.whatsWorkingBullets.length > 0 && (
          <div className="flex-1 rounded-lg bg-emerald-50 border border-emerald-100 p-4">
            <div className="flex items-start gap-2">
              <ThumbUpIcon sx={{ fontSize: 18, color: '#10b981', marginTop: '2px', flexShrink: 0 }} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-emerald-900 mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                  What's working on {analysis.platform === 'facebook' ? 'Facebook' : 'Instagram'}
                </p>
                <ul className="space-y-1.5">
                  {analysis.whatsWorkingBullets.map((item, idx) => (
                    <li key={idx} className="text-sm text-emerald-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Risks Panel */}
        {analysis.risksBullets.length > 0 && (
          <div className="flex-1 rounded-lg bg-red-50 border border-red-100 p-4">
            <div className="flex items-start gap-2">
              <WarningIcon sx={{ fontSize: 18, color: '#dc2626', marginTop: '2px', flexShrink: 0 }} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-red-900 mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                  Risks & blind spots
                </p>
                <ul className="space-y-1.5">
                  {analysis.risksBullets.map((item, idx) => (
                    <li key={idx} className="text-sm text-red-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                      • {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Opportunities / Findings */}
      {analysis.opportunities.length > 0 && (
        <div className="space-y-3">
          {analysis.opportunities.map((opp, idx) => (
            <div
              key={opp.id}
              ref={(el) => {
                if (el) cardRefs.current[idx] = el
              }}
              className={`rounded-xl border border-slate-200 bg-white px-4 py-3 md:px-5 md:py-4 shadow-sm space-y-3 ${
                visibleCards.has(idx) ? 'visible' : ''
              }`}
              style={{ position: 'relative', zIndex: 1 }}
            >
              {/* Header row */}
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                  {opp.title}
                </p>
                <span
                  className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${priorityColors[opp.priority]}`}
                  style={{ fontFamily: 'var(--font-roboto-stack)' }}
                >
                  {opp.priority === 'high' ? 'High priority' : opp.priority === 'medium' ? 'Medium priority' : 'Low priority'}
                </span>
              </div>

              {/* Description */}
              <p className="text-xs md:text-sm leading-relaxed text-slate-900 whitespace-pre-line" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                {opp.description}
              </p>

              {/* Evidence / Audience Quotes */}
              {(opp.audienceQuotes && opp.audienceQuotes.length > 0) || opp.evidenceBullets.length > 0 ? (
                <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 border border-amber-100">
                  <div className="font-medium mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    {opp.evidenceTitle}:
                  </div>
                  {opp.audienceQuotes && opp.audienceQuotes.length > 0 ? (
                    <ul className="space-y-1">
                      {opp.audienceQuotes.map((quote, qIdx) => (
                        <li key={qIdx} style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                          {quote.handle && <span className="font-semibold">@{quote.handle}</span>}
                          {quote.handle && ': '}
                          <span>"{quote.text}"</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="space-y-1">
                      {opp.evidenceBullets.map((bullet, bIdx) => (
                        <li key={bIdx} style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                          • {bullet}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}

              {/* Example Posts */}
              {opp.examplePosts && opp.examplePosts.length > 0 && (
                <div className="flex gap-2 mt-2">
                  {opp.examplePosts.map((post, pIdx) => (
                    <a
                      key={pIdx}
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 w-20 h-20 rounded border border-slate-200 overflow-hidden bg-slate-100 hover:opacity-80 transition-opacity"
                    >
                      {post.thumbnail ? (
                        <img
                          src={post.thumbnail}
                          alt="Post thumbnail"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                          No image
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              )}

              {/* Solution pills */}
              {opp.solutions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 justify-end">
                  {opp.solutions.map((solution, sIdx) => (
                    <ModulePrescriptionPill key={sIdx} moduleKey={solution} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

