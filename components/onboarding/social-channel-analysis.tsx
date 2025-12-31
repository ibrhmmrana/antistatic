'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight } from '@mui/icons-material'
import { Database } from '@/lib/supabase/database.types'

type BusinessLocation = Database['public']['Tables']['business_locations']['Row']
type BusinessLocationSelect = Pick<BusinessLocation, 'name' | 'formatted_address'>
import StarIcon from '@mui/icons-material/Star'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import WarningIcon from '@mui/icons-material/Warning'
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy'
import RefreshIcon from '@mui/icons-material/Refresh'
import { ANTISTATIC_MODULES, getModules, type AntistaticModuleId } from '@/lib/modules/catalog'
import type { InstagramAiAnalysis } from '@/lib/social/instagram-types'
import type { FacebookAiAnalysis } from '@/lib/social/facebook-types'
import type { GBPWeaknessAnalysisResult } from '@/lib/ai/types'
import { FacebookAnalysisUI } from './facebook-analysis-ui'
import { AnalysisLoadingSkeleton } from './analysis-loading-skeleton'
import { CircularProgress } from '@mui/material'

interface SocialChannelAnalysisProps {
  locationId: string
  isGoogleConnected: boolean
  socialUsernames: {
    facebook: string
    instagram: string
    linkedin: string
    tiktok: string
  }
}

interface ChannelAnalysis {
  id: string
  name: string
  icon: string
  iconBg: string
  hasData: boolean
  data?: any
}

interface AIAnalysis {
  headerSummary: {
    line1: string
    line2: string
  }
  positiveSummary: string
  negativeSummary: string
  themes: Array<{
    theme: string
    you: string
    competitorName: string
    competitor: string
    prescribedModules?: AntistaticModuleId[]
  }>
}

interface InstagramMetrics {
  totalPosts: number
  postsLast30Days: number
  postsPerWeekApprox: number
  avgLikes: number
  maxLikes: number
  totalComments: number
  hasAnyComments: boolean
  periodStart?: string
  periodEnd?: string
}

// Module Prescription Pill Component with Portal-based Tooltip
function ModulePrescriptionPill({ module }: { module: ReturnType<typeof getModules>[0] }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, right: 0 })
  const pillRef = useRef<HTMLDivElement>(null)

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
      {showTooltip &&
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

export function SocialChannelAnalysis({
  locationId,
  isGoogleConnected,
  socialUsernames,
}: SocialChannelAnalysisProps) {
  const [analyses, setAnalyses] = useState<ChannelAnalysis[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const sectionRef = useRef<HTMLElement>(null)

  // Function to scroll to top of analysis section
  const scrollToTop = () => {
    if (sectionRef.current) {
      sectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      // Fallback: scroll to top of page
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const [loading, setLoading] = useState(true)
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [businessInfo, setBusinessInfo] = useState<{ name: string; address: string } | null>(null)
  const [visibleCards, setVisibleCards] = useState<Set<number>>(new Set())
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  // Instagram-specific state
  const [instagramAnalysis, setInstagramAnalysis] = useState<InstagramAiAnalysis | null>(null)
  const [instagramMetrics, setInstagramMetrics] = useState<InstagramMetrics | null>(null)
  const [instagramLoading, setInstagramLoading] = useState(false)
  const [instagramError, setInstagramError] = useState<string | null>(null)
  const [instagramRefreshing, setInstagramRefreshing] = useState(false)
  const [visibleInstagramCards, setVisibleInstagramCards] = useState<Set<number>>(new Set())
  const instagramCardRefs = useRef<(HTMLDivElement | null)[]>([])

  // Facebook-specific state
  const [facebookAnalysis, setFacebookAnalysis] = useState<FacebookAiAnalysis | null>(null)
  const [facebookMetrics, setFacebookMetrics] = useState<any>(null)
  const [facebookPosts, setFacebookPosts] = useState<any[] | null>(null)
  const [facebookPageName, setFacebookPageName] = useState<string | null>(null)
  const [facebookLoading, setFacebookLoading] = useState(false)
  const [facebookError, setFacebookError] = useState<string | null>(null)
  const [facebookRefreshing, setFacebookRefreshing] = useState(false)

  // Loading message rotation state
  const [gbpLoadingMessageIndex, setGbpLoadingMessageIndex] = useState(0)
  const [instagramLoadingMessageIndex, setInstagramLoadingMessageIndex] = useState(0)
  const [facebookLoadingMessageIndex, setFacebookLoadingMessageIndex] = useState(0)

  // GBP loading messages
  const gbpLoadingMessages = [
    'Analyzing your Google Business Profile...',
    'Analyzing your reviews...',
    'Processing review themes...',
    'Comparing with competitors...',
    'Generating insights...',
  ]

  // Instagram loading messages
  const instagramLoadingMessages = [
    'Analyzing your Instagram profile...',
    'Reviewing your posts...',
    'Analyzing engagement patterns...',
    'Identifying opportunities...',
    'Generating insights...',
  ]

  // Facebook loading messages
  const facebookLoadingMessages = [
    'Analyzing your Facebook page...',
    'Reviewing your posts...',
    'Analyzing engagement patterns...',
    'Identifying opportunities...',
    'Generating insights...',
  ]

  // Rotate GBP loading messages
  useEffect(() => {
    if (!aiLoading && !refreshing) return

    const interval = setInterval(() => {
      setGbpLoadingMessageIndex((prev) => (prev + 1) % gbpLoadingMessages.length)
    }, 3000) // Change message every 3 seconds

    return () => clearInterval(interval)
  }, [aiLoading, refreshing, gbpLoadingMessages.length])

  // Rotate Instagram loading messages
  useEffect(() => {
    if (!instagramLoading && !instagramRefreshing) return

    const interval = setInterval(() => {
      setInstagramLoadingMessageIndex((prev) => (prev + 1) % instagramLoadingMessages.length)
    }, 3000)

    return () => clearInterval(interval)
  }, [instagramLoading, instagramRefreshing, instagramLoadingMessages.length])

  // Rotate Facebook loading messages
  useEffect(() => {
    if (!facebookLoading && !facebookRefreshing) return

    const interval = setInterval(() => {
      setFacebookLoadingMessageIndex((prev) => (prev + 1) % facebookLoadingMessages.length)
    }, 3000)

    return () => clearInterval(interval)
  }, [facebookLoading, facebookRefreshing, facebookLoadingMessages.length])

  const supabase = createClient()

  // Fetch channel analyses
  useEffect(() => {
    const fetchAnalyses = async () => {
      if (!locationId) return

      setLoading(true)
      try {
        const channels: ChannelAnalysis[] = []

        // GBP Analysis - always show if Google is connected
        if (isGoogleConnected) {
          const { data: insights } = await supabase
            .from('business_insights')
            .select('gbp_avg_rating, gbp_review_count')
            .eq('location_id', locationId)
            .eq('source', 'google')
            .single()

          // Always add GBP channel if Google is connected, even if no insights yet
          channels.push({
            id: 'google_gbp',
            name: 'Google Business Profile',
            icon: '/Google__G__logo.svg',
            iconBg: '',
            hasData: !!insights, // Set hasData based on whether insights exist
            data: insights || undefined,
          })
        }

        // Instagram Analysis
        if (socialUsernames.instagram?.trim()) {
          channels.push({
            id: 'instagram',
            name: 'Instagram',
            icon: '/Instagram_logo_2022.svg',
            iconBg: '',
            hasData: true,
          })
        }

        // Facebook Analysis
        if (socialUsernames.facebook?.trim()) {
          channels.push({
            id: 'facebook',
            name: 'Facebook',
            icon: '/Facebook_f_logo_(2019).svg',
            iconBg: '',
            hasData: true,
          })
        }

        setAnalyses(channels)
      } catch (error) {
        console.error('[Channel Analysis] Error fetching analyses:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchAnalyses()
  }, [locationId, isGoogleConnected, socialUsernames, supabase])

  // Fetch business info
  useEffect(() => {
    const fetchBusinessInfo = async () => {
      if (!locationId) return

      try {
        const locationResult = await supabase
          .from('business_locations')
          .select('name, formatted_address')
          .eq('id', locationId)
          .maybeSingle()
        
        const location = locationResult.data as BusinessLocationSelect | null

        if (location) {
          setBusinessInfo({
            name: location.name || '',
            address: location.formatted_address || '',
          })
        }
      } catch (error) {
        console.error('[Channel Analysis] Error fetching business info:', error)
      }
    }

    fetchBusinessInfo()
  }, [locationId, supabase])

  // Fetch GBP AI analysis
  const fetchAIAnalysis = async (forceRefresh = false) => {
    if (!isGoogleConnected || !locationId) {
      console.log('[AI Analysis] Missing prerequisites:', { isGoogleConnected, locationId })
      return
    }

    if (!forceRefresh && loading) {
      console.log('[AI Analysis] Waiting for analyses to load:', { loading })
      return
    }

    // If not forcing refresh and we already have analysis, don't fetch again
    if (!forceRefresh && aiAnalysis) {
      console.log('[AI Analysis] Already have analysis, skipping fetch')
      return
    }

    console.log('[AI Analysis] Starting fetch for location:', locationId, 'forceRefresh:', forceRefresh)

    if (forceRefresh) {
      setRefreshing(true)
    } else {
      setAiLoading(true)
    }
    setAiError(null)

    try {
      const url = `/api/locations/${locationId}/analysis/gbp${forceRefresh ? '?forceRefresh=true' : ''}`
      const response = await fetch(url)
      
      if (response.status === 404) {
        // No analysis yet - trigger generation and start polling
        console.log('[GBP Analysis] No analysis found (404), triggering generation...')
        setAiLoading(true)
        setAiError(null)
        // Don't set loading to false - keep it true so polling can check
        // Polling will handle checking for completion
        return
      }

      const result = await response.json()

      console.log('[GBP AI] Analysis response:', result)

      if (result.success && result.analysis) {
        setAiAnalysis(result.analysis)
        setAiError(null) // Clear any previous errors
        setAiLoading(false) // Analysis is ready, stop loading
        console.log('[GBP Analysis] Successfully loaded analysis', forceRefresh ? '(refreshed)' : '(cached)')
      } else if (result.status === 'in_progress' || result.error === 'ANALYSIS_IN_PROGRESS') {
        // Analysis is being generated, keep loading state and let polling handle it
        console.log('[GBP Analysis] Analysis in progress, will poll for completion')
        setAiLoading(true)
        setAiError(null)
        // Don't set loading to false - keep it true so polling can check
      } else {
        let errorMsg = result.error || 'Failed to generate analysis'

        if (result.error === 'NOT_ENOUGH_DATA') {
          const details = result.details || {}
          if (details.needsReviewFetch && forceRefresh) {
            // If refreshing and no reviews found, try fetching reviews first, then retry analysis
            // BUT: Don't trigger if reviews are already being fetched (scrape_status = 'in_progress')
            // This prevents double Apify execution
            console.log('[GBP Analysis] No reviews found during refresh, checking if reviews fetch is already in progress...')
            try {
              // Check if reviews are already being fetched
              const insightsCheck = await fetch(`/api/locations/${locationId}/analysis/gbp`)
              const insightsData = await insightsCheck.json().catch(() => null)
              
              // Only trigger reviews fetch if not already in progress
              // (We can't directly check scrape_status from here, but if analysis returns 404,
              // it means insights row doesn't exist yet, so we should fetch)
              if (insightsCheck.status === 404) {
                console.log('[GBP Analysis] Insights row not found, fetching reviews first...')
                const reviewsResponse = await fetch(`/api/locations/${locationId}/gbp-reviews?forceRefresh=true`)
                if (reviewsResponse.ok) {
                  console.log('[GBP Analysis] Reviews fetched, will retry analysis automatically...')
                  // Wait a moment for reviews to be saved, then retry
                  setTimeout(() => {
                    fetchAIAnalysis(false) // Retry without force refresh
                  }, 2000)
                  errorMsg = 'Fetching reviews... Analysis will start automatically in a moment.'
                  setAiError(errorMsg)
                  return // Exit early, will retry
                }
              } else {
                console.log('[GBP Analysis] Reviews fetch may already be in progress, waiting for completion...')
                errorMsg = 'Reviews are being fetched. Analysis will start automatically once complete.'
                setAiError(errorMsg)
              }
            } catch (reviewError) {
              console.error('[GBP Analysis] Failed to fetch reviews:', reviewError)
            }
            errorMsg = details.message || 'No reviews found. Please ensure your Google Business Profile has reviews and try again.'
          } else if (details.needsReviewFetch) {
            errorMsg = details.message || 'No reviews found. Please refresh your reviews first by clicking "Refresh Analysis".'
          } else if (details.totalReviews > 0 && details.reviewsWithText < 5) {
            errorMsg = `We found ${details.totalReviews} review${details.totalReviews !== 1 ? 's' : ''}, but only ${details.reviewsWithText} have text content. We need at least 5 reviews with text to run a meaningful analysis. Try refreshing your reviews.`
          } else {
            errorMsg = details.message || `We need at least 5 reviews with text content to run a meaningful analysis. Currently found: ${details.reviewsWithText || 0} review${(details.reviewsWithText || 0) !== 1 ? 's' : ''} with text.`
          }
        } else if (result.error === 'OPENAI_UNAUTHORIZED') {
          errorMsg = "We couldn't reach the AI engine. Check your OpenAI API key in the Antistatic backend."
        } else if (result.error === 'Not enough local competitor data yet.') {
          errorMsg = 'AI analysis unavailable: Not enough local competitor data yet.'
        }

        setAiError(errorMsg)
        console.error('[GBP Analysis] Error from API:', { 
          error: result.error,
          details: result.details,
        })
      }
    } catch (error: any) {
      console.error('[GBP AI] Fetch error:', error)
      setAiError(error.message || 'Failed to load analysis')
      // Only set loading to false on actual errors (not when analysis is in progress)
      if (forceRefresh) {
        setRefreshing(false)
      } else {
        // Only stop loading if we got a real error, not if analysis is in progress
        // The polling will handle setting loading to false when analysis is ready
        if (!error.message?.includes('in progress') && !error.message?.includes('ANALYSIS_IN_PROGRESS')) {
          setAiLoading(false)
        }
      }
    } finally {
      // Only update refreshing state in finally, not aiLoading
      // aiLoading should stay true if analysis is in progress (handled by polling)
      if (forceRefresh) {
        setRefreshing(false)
      }
    }
  }

  // Fetch AI analysis when GBP card is available (initial load)
  useEffect(() => {
    if (aiAnalysis || aiLoading) {
      console.log('[AI Analysis] Skipping fetch - already have data or loading:', { aiAnalysis: !!aiAnalysis, aiLoading })
      return
    }

    fetchAIAnalysis(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, isGoogleConnected, analyses.length, loading])

  // Automatic polling for GBP analysis when loading
  useEffect(() => {
    if (!isGoogleConnected || !locationId || aiAnalysis || !aiLoading) {
      return
    }

    const pollInterval = setInterval(async () => {
      console.log('[GBP Analysis] Polling for analysis...')
      try {
        const response = await fetch(`/api/locations/${locationId}/analysis/gbp`)
        
        if (response.status === 404) {
          // Analysis not started yet, keep polling
          console.log('[GBP Analysis] Still waiting for analysis to start...')
          return
        }

        const result = await response.json()

        if (result.success && result.analysis) {
          console.log('[GBP Analysis] Analysis ready!')
          setAiAnalysis(result.analysis)
          setAiError(null)
          setAiLoading(false)
          clearInterval(pollInterval)
        } else if (result.status === 'in_progress' || result.error === 'ANALYSIS_IN_PROGRESS') {
          // Analysis is still in progress, keep polling
          console.log('[GBP Analysis] Analysis still in progress, continuing to poll...')
          setAiError(null) // Clear any previous errors
        } else if (result.error && result.error !== 'NOT_ENOUGH_DATA' && result.error !== 'ANALYSIS_IN_PROGRESS') {
          // Only stop polling if there's a real error (not just "in progress" or "not enough data")
          console.log('[GBP Analysis] Error during polling:', result.error)
          setAiError(result.error || 'Failed to generate analysis')
          setAiLoading(false)
          clearInterval(pollInterval)
        }
      } catch (error) {
        console.error('[GBP Analysis] Polling error:', error)
        // Don't stop polling on network errors, just log them
      }
    }, 3000) // Poll every 3 seconds

    // Stop polling after 60 seconds
    const timeout = setTimeout(() => {
      clearInterval(pollInterval)
      if (aiLoading) {
        setAiLoading(false)
        setAiError('Analysis is taking longer than expected. Please try refreshing.')
      }
    }, 60000)

    return () => {
      clearInterval(pollInterval)
      clearTimeout(timeout)
    }
  }, [locationId, isGoogleConnected, aiLoading, aiAnalysis])

  // Automatic polling for Instagram analysis when loading
  useEffect(() => {
    if (!locationId || instagramAnalysis || !instagramLoading) {
      return
    }

    const pollInterval = setInterval(async () => {
      console.log('[Instagram Analysis] Polling for analysis...')
      try {
        const response = await fetch(`/api/locations/${locationId}/analysis/instagram`)
        if (response.ok) {
          const result = await response.json()
          if (result.analysis && result.metrics) {
            console.log('[Instagram Analysis] Analysis ready!')
            setInstagramAnalysis(result.analysis)
            setInstagramMetrics(result.metrics)
            setInstagramError(null)
            setInstagramLoading(false)
            clearInterval(pollInterval)
          }
        }
      } catch (error) {
        console.error('[Instagram Analysis] Polling error:', error)
      }
    }, 3000) // Poll every 3 seconds

    const timeout = setTimeout(() => {
      clearInterval(pollInterval)
      if (instagramLoading) {
        setInstagramLoading(false)
        setInstagramError('Analysis is taking longer than expected. Please try refreshing.')
      }
    }, 60000)

    return () => {
      clearInterval(pollInterval)
      clearTimeout(timeout)
    }
  }, [locationId, instagramLoading, instagramAnalysis])

  // Automatic polling for Facebook analysis when loading
  useEffect(() => {
    if (!locationId || facebookAnalysis || !facebookLoading) {
      return
    }

    const pollInterval = setInterval(async () => {
      console.log('[Facebook Analysis] Polling for analysis...')
      try {
        const response = await fetch(`/api/locations/${locationId}/analysis/facebook`)
        if (response.ok) {
          const result = await response.json()
          if (result.analysis && result.metrics) {
            console.log('[Facebook Analysis] Analysis ready!')
            setFacebookAnalysis(result.analysis)
            setFacebookMetrics(result.metrics)
            setFacebookPosts(result.posts || [])
            setFacebookPageName(result.pageName || null)
            setFacebookError(null)
            setFacebookLoading(false)
            clearInterval(pollInterval)
          }
        }
      } catch (error) {
        console.error('[Facebook Analysis] Polling error:', error)
      }
    }, 3000) // Poll every 3 seconds

    const timeout = setTimeout(() => {
      clearInterval(pollInterval)
      if (facebookLoading) {
        setFacebookLoading(false)
        setFacebookError('Analysis is taking longer than expected. Please try refreshing.')
      }
    }, 60000)

    return () => {
      clearInterval(pollInterval)
      clearTimeout(timeout)
    }
  }, [locationId, facebookLoading, facebookAnalysis])

  // Notify parent component when card index changes (for dynamic Continue button positioning)
  useEffect(() => {
    const event = new CustomEvent('analysis-card-change', { detail: currentIndex })
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'social-channel-analysis.tsx:358',message:'Dispatching card change event',data:{currentIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    window.dispatchEvent(event)
  }, [currentIndex])
  
  // Dispatch total analyses count to parent
  useEffect(() => {
    if (analyses.length > 0) {
      const event = new CustomEvent('analyses-count', { detail: analyses.length })
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'social-channel-analysis.tsx:368',message:'Dispatching analyses count',data:{count:analyses.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      window.dispatchEvent(event)
    }
  }, [analyses.length])
  
  // Also dispatch on initial mount
  useEffect(() => {
    const event = new CustomEvent('analysis-card-change', { detail: currentIndex })
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'social-channel-analysis.tsx:375',message:'Initial card change event',data:{currentIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    window.dispatchEvent(event)
  }, [])

  // Fetch cached Instagram analysis (GET - read-only, no Apify/OpenAI cost)
  // Called on mount to load existing analysis from database
  const fetchInstagramAnalysis = async () => {
    const instagramUsername = socialUsernames.instagram?.trim()
    if (!instagramUsername || !locationId) {
      console.log('[Instagram Analysis] Skipping GET - no username or locationId')
      return
    }

    console.log('[Instagram Analysis] GET: Fetching cached analysis for:', instagramUsername)
    setInstagramLoading(true)
    setInstagramError(null)

    try {
      const params = new URLSearchParams({
        locationId: locationId,
        username: instagramUsername,
      })
      const response = await fetch(`/api/social/instagram/analysis?${params.toString()}`, {
        method: 'GET',
      })

      if (response.status === 404) {
        // No cached analysis - this is expected on first load
        console.log('[Instagram Analysis] GET: No cached analysis found (404) - user can generate one')
        setInstagramAnalysis(null)
        setInstagramMetrics(null)
        setInstagramError(null) // Don't show error, just no analysis yet
        return
      }

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Instagram Analysis] GET error:', response.status, errorText)
        setInstagramError(`Failed to load analysis: ${response.status}`)
        return
      }

      const result = await response.json()

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'social-channel-analysis.tsx:340',message:'Frontend GET response',data:{success:result.success,hasAnalysis:!!result.analysis,hasMetrics:!!result.metrics,status:result.status,error:result.error,analysisKeys:result.analysis?Object.keys(result.analysis):[]},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion

      console.log('[Instagram Analysis] GET response:', {
        success: result.success,
        hasAnalysis: !!result.analysis,
        hasMetrics: !!result.metrics,
        cached: result.cached,
      })

      if (result.success && result.analysis) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'social-channel-analysis.tsx:349',message:'Frontend setting state',data:{hasAnalysis:!!result.analysis,hasMetrics:!!result.metrics,summaryLength:result.analysis?.summary?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        console.log('[Instagram Analysis] GET: Loaded cached analysis', {
          summary: result.analysis.summary?.substring(0, 50),
          whatWorksCount: result.analysis.whatWorks?.length,
          mainRisksCount: result.analysis.mainRisks?.length,
        })
        setInstagramAnalysis(result.analysis)
        setInstagramMetrics(result.metrics)
        setInstagramError(null)
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'social-channel-analysis.tsx:358',message:'Frontend GET failed',data:{success:result.success,error:result.error,status:result.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        setInstagramError(result.error || 'Failed to load analysis')
        setInstagramAnalysis(null)
        setInstagramMetrics(null)
      }
    } catch (error: any) {
      console.error('[Instagram Analysis] GET fetch error:', error)
      setInstagramError(error.message || 'Failed to load Instagram analysis')
    } finally {
      setInstagramLoading(false)
    }
  }

  // Generate fresh Instagram analysis (POST - triggers Apify + OpenAI)
  // Called only when user explicitly clicks "Generate Analysis" or "Refresh Analysis"
  const runInstagramAnalysis = async () => {
    const instagramUsername = socialUsernames.instagram?.trim()
    if (!instagramUsername || !locationId) {
      console.log('[Instagram Analysis] Skipping POST - no username or locationId')
      return
    }

    console.log('[Instagram Analysis] POST: Generating fresh analysis for:', instagramUsername)
    setInstagramRefreshing(true)
    setInstagramError(null)

    try {
      const response = await fetch('/api/social/instagram/analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: instagramUsername,
          locationId: locationId,
          resultsLimitPosts: 30,
          resultsLimitComments: 20,
          forceRefresh: true,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Instagram Analysis] POST error:', response.status, errorText)
        setInstagramError(`Failed to generate analysis: ${response.status}`)
        return
      }

      const result = await response.json()

      console.log('[Instagram Analysis] POST response:', {
        success: result.success,
        hasAnalysis: !!result.analysis,
        hasMetrics: !!result.metrics,
        cached: result.cached,
      })

      if (result.success && result.analysis) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'social-channel-analysis.tsx:415',message:'Frontend POST success',data:{hasAnalysis:!!result.analysis,hasMetrics:!!result.metrics,summaryLength:result.analysis?.summary?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        console.log('[Instagram Analysis] POST: Generated fresh analysis', {
          summary: result.analysis.summary?.substring(0, 50),
          whatWorksCount: result.analysis.whatWorks?.length,
          mainRisksCount: result.analysis.mainRisks?.length,
        })
        setInstagramAnalysis(result.analysis)
        setInstagramMetrics(result.metrics)
        setInstagramError(null)
      } else {
        let errorMsg = result.error || 'Failed to generate analysis'

        if (result.error === 'NOT_ENOUGH_DATA') {
          errorMsg = `We need more posts to give solid Instagram insights. Found ${result.postsCount || 0} posts.`
        }

        setInstagramError(errorMsg)
        setInstagramAnalysis(null)
        setInstagramMetrics(null)
      }
    } catch (error: any) {
      console.error('[Instagram Analysis] POST fetch error:', error)
      setInstagramError(error.message || 'Failed to generate Instagram analysis')
    } finally {
      setInstagramRefreshing(false)
    }
  }

  // Fetch Instagram analysis on mount (GET - read-only, returns cached data if available)
  // Pattern matches GBP: GET on mount, POST only on explicit refresh
  useEffect(() => {
    const instagramUsername = socialUsernames.instagram?.trim()
    if (!instagramUsername || !locationId) {
      return
    }

    // Don't fetch if already have data or currently loading
    if (instagramAnalysis || instagramLoading) {
      console.log('[Instagram Analysis] Skipping GET - already have data or loading:', {
        hasAnalysis: !!instagramAnalysis,
        isLoading: instagramLoading,
      })
      return
    }

    // Call GET endpoint to load cached analysis (same pattern as GBP analysis)
    console.log('[Instagram Analysis] Mount: Calling GET to load cached analysis')
    fetchInstagramAnalysis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, socialUsernames.instagram])

  // Fetch cached Facebook analysis (GET - read-only, no Apify/OpenAI cost)
  const fetchFacebookAnalysis = async () => {
    const facebookUrl = socialUsernames.facebook?.trim()
    if (!facebookUrl || !locationId) {
      console.log('[Facebook Analysis] Skipping GET - no URL or locationId')
      return
    }

    console.log('[Facebook Analysis] GET: Fetching cached analysis for:', facebookUrl)
    setFacebookLoading(true)
    setFacebookError(null)

    try {
      const params = new URLSearchParams({
        locationId: locationId,
        facebookUrl: facebookUrl,
      })
      const response = await fetch(`/api/social/facebook/analyze?${params.toString()}`, {
        method: 'GET',
      })

      if (response.status === 404) {
        console.log('[Facebook Analysis] GET: No cached analysis found (404) - user can generate one')
        setFacebookAnalysis(null)
        setFacebookMetrics(null)
        setFacebookError(null)
        return
      }

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Facebook Analysis] GET error:', response.status, errorText)
        setFacebookError(`Failed to load analysis: ${response.status}`)
        return
      }

      const result = await response.json()

      console.log('[Facebook Analysis] GET response:', {
        success: result.success,
        hasAnalysis: !!result.analysis,
        hasMetrics: !!result.metrics,
        cached: result.cached,
      })

      if (result.success && result.analysis) {
        console.log('[Facebook Analysis] GET: Loaded cached analysis', {
          overallScore: result.analysis.overallScore,
          cardsCount: result.analysis.cards?.length,
        })
        setFacebookAnalysis(result.analysis)
        setFacebookMetrics(result.metrics)
        setFacebookPosts(result.posts || null)
        // Extract page name from first post if available
        if (result.posts && result.posts.length > 0 && result.posts[0].pageName) {
          setFacebookPageName(result.posts[0].pageName)
        }
        setFacebookError(null)
      } else {
        setFacebookError(result.error || 'Failed to load analysis')
        setFacebookAnalysis(null)
        setFacebookMetrics(null)
        setFacebookPosts(null)
        setFacebookPageName(null)
      }
    } catch (error: any) {
      console.error('[Facebook Analysis] GET fetch error:', error)
      setFacebookError(error.message || 'Failed to load Facebook analysis')
    } finally {
      setFacebookLoading(false)
    }
  }

  // Generate fresh Facebook analysis (POST - triggers Apify + OpenAI)
  const runFacebookAnalysis = async () => {
    const facebookUrl = socialUsernames.facebook?.trim()
    if (!facebookUrl || !locationId) {
      console.log('[Facebook Analysis] Skipping POST - no URL or locationId')
      return
    }

    console.log('[Facebook Analysis] POST: Generating fresh analysis for:', facebookUrl)
    setFacebookRefreshing(true)
    setFacebookError(null)

    try {
      const response = await fetch('/api/social/facebook/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          facebookUrl: facebookUrl,
          locationId: locationId,
          resultsLimit: 30,
          force: true,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Facebook Analysis] POST error:', response.status, errorText)
        setFacebookError(`Failed to generate analysis: ${response.status}`)
        return
      }

      const result = await response.json()

      console.log('[Facebook Analysis] POST response:', {
        success: result.success,
        hasAnalysis: !!result.analysis,
        hasMetrics: !!result.metrics,
        cached: result.cached,
      })

      if (result.success) {
        // If POST response includes analysis data, use it immediately
        if (result.analysis) {
          console.log('[Facebook Analysis] POST succeeded with analysis data, updating state immediately')
          setFacebookAnalysis(result.analysis)
          setFacebookMetrics(result.metrics)
          setFacebookPosts(result.posts || null)
          if (result.posts && result.posts.length > 0 && result.posts[0].pageName) {
            setFacebookPageName(result.posts[0].pageName)
          }
          setFacebookError(null)
        }
        
        // Also refetch using GET to ensure we have the latest data from database
        // Wait a moment for database to be updated, then fetch
        console.log('[Facebook Analysis] POST succeeded, will refetch with GET after short delay')
        setTimeout(async () => {
          try {
            await fetchFacebookAnalysis()
            console.log('[Facebook Analysis] Successfully refetched after POST')
          } catch (refetchError: any) {
            console.error('[Facebook Analysis] Error refetching after POST:', refetchError)
            // If refetch fails but we already set the data from POST response, that's OK
            if (!result.analysis) {
              setFacebookError('Analysis generated but failed to load. Please refresh the page.')
            }
          }
        }, 2000) // Wait 2 seconds for database to be updated
      } else {
        let errorMsg = result.error || 'Failed to generate analysis'

        if (result.error === 'NOT_ENOUGH_DATA') {
          errorMsg = `We need more posts to give solid Facebook insights. Found ${result.postsCount || 0} posts.`
        }

        setFacebookError(errorMsg)
        setFacebookAnalysis(null)
        setFacebookMetrics(null)
        setFacebookPosts(null)
        setFacebookPageName(null)
      }
    } catch (error: any) {
      console.error('[Facebook Analysis] POST fetch error:', error)
      setFacebookError(error.message || 'Failed to generate Facebook analysis')
    } finally {
      setFacebookRefreshing(false)
    }
  }

  // Fetch Facebook analysis on mount (GET - read-only, returns cached data if available)
  useEffect(() => {
    const facebookUrl = socialUsernames.facebook?.trim()
    if (!facebookUrl || !locationId) {
      return
    }

    // Don't fetch if already have data or currently loading
    if (facebookAnalysis || facebookLoading) {
      console.log('[Facebook Analysis] Skipping GET - already have data or loading:', {
        hasAnalysis: !!facebookAnalysis,
        isLoading: facebookLoading,
      })
      return
    }

    // Call GET endpoint to load cached analysis
    console.log('[Facebook Analysis] Mount: Calling GET to load cached analysis')
    fetchFacebookAnalysis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, socialUsernames.facebook])

  // Intersection Observer for scroll-triggered animations (GBP themes)
  useEffect(() => {
    if (!aiAnalysis || aiAnalysis.themes.length === 0) return

    const observers: IntersectionObserver[] = []

    cardRefs.current.forEach((card, idx) => {
      if (!card) return

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setVisibleCards((prev) => new Set([...prev, idx]))
            }
          })
        },
        { threshold: 0.1 }
      )

      observer.observe(card)
      observers.push(observer)
    })

    return () => {
      observers.forEach((obs) => obs.disconnect())
    }
  }, [aiAnalysis])

  // Intersection Observer for scroll-triggered animations (Instagram risks)
  useEffect(() => {
    if (!instagramAnalysis || !instagramAnalysis.mainRisks || instagramAnalysis.mainRisks.length === 0) {
      // Reset visible cards when analysis is cleared
      setVisibleInstagramCards(new Set())
      return
    }

    // Reset visible cards when analysis changes
    setVisibleInstagramCards(new Set())

    const observers: IntersectionObserver[] = []

    // Function to check if cards are already in viewport and observe them
    const observeCards = () => {
      instagramCardRefs.current.forEach((card, idx) => {
        if (!card) return

        // Check if card is already in viewport
        const rect = card.getBoundingClientRect()
        const isInViewport = rect.top < window.innerHeight && rect.bottom > 0
        
        if (isInViewport) {
          // Card is already visible, mark it as visible immediately
          setVisibleInstagramCards((prev) => new Set([...prev, idx]))
        } else {
          // Card is not in viewport, observe it
          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  setVisibleInstagramCards((prev) => new Set([...prev, idx]))
                  // Unobserve after it becomes visible to improve performance
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

    // Try to observe immediately, then retry after a short delay to catch any cards that weren't ready
    observeCards()
    const timeoutId = setTimeout(observeCards, 100)
    
    // Fallback: make all cards visible after 1 second if observer didn't work
    const fallbackTimeoutId = setTimeout(() => {
      if (instagramAnalysis?.mainRisks) {
        const allIndices = new Set(instagramAnalysis.mainRisks.map((_, idx) => idx))
        setVisibleInstagramCards(allIndices)
      }
    }, 1000)

    return () => {
      clearTimeout(timeoutId)
      clearTimeout(fallbackTimeoutId)
      observers.forEach((obs) => obs.disconnect())
    }
  }, [instagramAnalysis])

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Loading channel analyses...
        </p>
      </div>
    )
  }

  if (analyses.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          No channel analyses available. Please connect your channels first.
        </p>
      </div>
    )
  }

  return (
    <section ref={sectionRef} className="mt-8">
      <div className="relative">
        <div className="overflow-x-hidden overflow-y-visible rounded-2xl">
          <div className="flex transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
            {analyses.map((analysis) => (
              <div key={analysis.id} className="min-w-full flex-shrink-0 w-full">
                <div className="bg-white border border-[var(--google-grey-200)] rounded-2xl shadow-sm p-6 w-full max-w-full overflow-hidden">
                        <div className="space-y-4">
                          {/* Header */}
                          <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                              {analysis.id === 'google_gbp' ? (
                                <img src="/Google__G__logo.svg" alt="Google" className="w-12 h-12" />
                              ) : analysis.id === 'instagram' ? (
                                <img src="/Instagram_logo_2022.svg" alt="Instagram" className="w-12 h-12" />
                              ) : analysis.id === 'facebook' ? (
                                <img src="/Facebook_f_logo_(2019).svg" alt="Facebook" className="w-12 h-12" />
                              ) : (
                                <div className={`w-12 h-12 rounded-lg ${analysis.iconBg} flex items-center justify-center text-white font-bold text-lg`}>
                                  {analysis.icon}
                                </div>
                              )}
                              <div>
                                <p className="text-base md:text-lg font-semibold text-slate-900 gbp-theme-heading">
                                  {analysis.name}
                                </p>
                                <p className="text-xs text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                  {analysis.id === 'instagram'
                                    ? instagramAnalysis
                                      ? 'Analysis available'
                                      : instagramLoading
                                        ? 'Generating analysis...'
                                        : 'Data gathering...'
                                    : analysis.id === 'facebook'
                                      ? facebookAnalysis
                                        ? 'Analysis available'
                                        : facebookLoading
                                          ? 'Generating analysis...'
                                          : 'Data gathering...'
                                    : analysis.id === 'google_gbp'
                                      ? aiAnalysis
                                        ? 'Analysis available'
                                        : aiLoading
                                          ? 'Generating analysis...'
                                          : 'Data gathering...'
                                      : analysis.hasData
                                        ? 'Analysis available'
                                        : 'Data gathering...'}
                                </p>
                              </div>
                            </div>
                            {/* Refresh button for GBP - show when analysis exists, error exists, or loading */}
                            {analysis.id === 'google_gbp' && (aiAnalysis || aiError || aiLoading) && (
                              <button
                                type="button"
                                onClick={() => fetchAIAnalysis(true)}
                                disabled={refreshing || aiLoading}
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
                                <RefreshIcon
                                  sx={{
                                    fontSize: 16,
                                    animation: (refreshing || aiLoading) ? 'spin 1s linear infinite' : 'none',
                                    '@keyframes spin': {
                                      '0%': { transform: 'rotate(0deg)' },
                                      '100%': { transform: 'rotate(360deg)' },
                                    },
                                  }}
                                />
                                {refreshing ? 'Refreshing...' : 'Refresh Analysis'}
                              </button>
                            )}
                          </div>

                          {/* Generate Analysis button for Instagram (when no analysis yet) */}
                          {analysis.id === 'instagram' && !instagramAnalysis && !instagramLoading && (
                            <button
                              type="button"
                              onClick={() => runInstagramAnalysis()}
                              disabled={instagramRefreshing}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium 
                                bg-white border border-slate-300 
                                text-slate-700
                                hover:bg-slate-50 
                                hover:border-slate-400
                                disabled:opacity-50 disabled:cursor-not-allowed
                                transition-all duration-200"
                              style={{ fontFamily: 'var(--font-roboto-stack)' }}
                            >
                              <RefreshIcon sx={{ fontSize: 16 }} />
                              Generate Analysis
                            </button>
                          )}

                          {/* Generate Analysis button for Facebook (when no analysis yet) */}
                          {analysis.id === 'facebook' && !facebookAnalysis && !facebookLoading && (
                            <button
                              type="button"
                              onClick={() => runFacebookAnalysis()}
                              disabled={facebookRefreshing}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium 
                                bg-white border border-slate-300 
                                text-slate-700
                                hover:bg-slate-50 
                                hover:border-slate-400
                                disabled:opacity-50 disabled:cursor-not-allowed
                                transition-all duration-200"
                              style={{ fontFamily: 'var(--font-roboto-stack)' }}
                            >
                              <RefreshIcon sx={{ fontSize: 16 }} />
                              Generate Analysis
                            </button>
                          )}

                          {/* Content */}
                          {(analysis.hasData && analysis.data) || (analysis.id === 'instagram' && (instagramAnalysis || instagramLoading)) || (analysis.id === 'facebook' && (facebookAnalysis || facebookLoading)) || (analysis.id === 'google_gbp' && (aiAnalysis || aiLoading || aiError || refreshing)) ? (
                            <div className="space-y-4">
                              {/* GBP AI Analysis */}
                              {analysis.id === 'google_gbp' && (
                                <div className="space-y-4">
                                  <div className="space-y-6">
                                    {aiLoading || refreshing ? (
                                      <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                        <CircularProgress size={40} className="text-[#1a73e8]" />
                                        <div className="text-center space-y-2">
                                          <p className="text-base font-medium text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                            {gbpLoadingMessages[gbpLoadingMessageIndex]}
                                          </p>
                                          <p className="text-sm text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                            This could take up to 30 seconds
                                          </p>
                                        </div>
                                      </div>
                                    ) : aiError ? (
                                      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                                        <p className="text-sm text-red-700 mb-3" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                          {aiError}
                                        </p>
                                        <button
                                          onClick={() => fetchAIAnalysis(true)}
                                          className="text-sm text-red-700 underline hover:text-red-900"
                                          style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                        >
                                          Retry
                                        </button>
                                      </div>
                                    ) : aiAnalysis ? (
                                      <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-5 md:p-6 space-y-4 md:space-y-6">

                                      {/* Header */}
                                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                        <div className="flex-1 space-y-3">
                                          <div className="flex items-center justify-between gap-4">
                                            <p className="text-base md:text-lg font-semibold text-slate-900 gbp-theme-heading">
                                              {businessInfo?.name || aiAnalysis.headerSummary.line1}
                                            </p>
                                            <button
                                              type="button"
                                              onClick={() => fetchAIAnalysis(true)}
                                              disabled={refreshing || aiLoading}
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
                                              <RefreshIcon
                                                sx={{
                                                  fontSize: 16,
                                                  animation: (refreshing || aiLoading) ? 'spin 1s linear infinite' : 'none',
                                                  '@keyframes spin': {
                                                    '0%': { transform: 'rotate(0deg)' },
                                                    '100%': { transform: 'rotate(360deg)' },
                                                  },
                                                }}
                                              />
                                              {refreshing ? 'Refreshing...' : 'Refresh Analysis'}
                                            </button>
                                          </div>
                                          {businessInfo?.address && (
                                            <p className="text-sm text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                              {businessInfo.address}
                                            </p>
                                          )}
                                          <div className="flex flex-wrap items-center gap-2">
                                            <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-200 text-slate-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                              {aiAnalysis.headerSummary.line2}
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Positive / Negative Summary */}
                                      <div className="flex flex-col gap-3 md:flex-row">
                                        <div className="flex-1 rounded-lg bg-emerald-50 border border-emerald-100 p-4">
                                          <div className="flex items-start gap-2">
                                            <ThumbUpIcon sx={{ fontSize: 18, color: '#10b981', marginTop: '2px', flexShrink: 0 }} />
                                            <div className="min-w-0">
                                              <p className="text-sm font-semibold text-emerald-900 mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                Positive reviews say
                                              </p>
                                              <p className="text-sm text-emerald-900 whitespace-pre-line" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                {aiAnalysis.positiveSummary}
                                              </p>
                                            </div>
                                          </div>
                                        </div>

                                        <div className="flex-1 rounded-lg bg-red-50 border border-red-100 p-4">
                                          <div className="flex items-start gap-2">
                                            <WarningIcon sx={{ fontSize: 18, color: '#dc2626', marginTop: '2px', flexShrink: 0 }} />
                                            <div className="min-w-0">
                                              <p className="text-sm font-semibold text-red-900 mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                Negative reviews say
                                              </p>
                                              <p className="text-sm text-red-900 whitespace-pre-line" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                {aiAnalysis.negativeSummary}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Theme Comparisons */}
                                      {aiAnalysis.themes.length > 0 && (
                                        <div className="space-y-3">
                                          {aiAnalysis.themes.map((theme, idx) => {
                                            const moduleIds = (theme.prescribedModules || [])
                                              .filter((id) => id !== 'insightsLab' && id !== 'profileManager')
                                            const modules = getModules(moduleIds)

                                            return (
                                              <div
                                                key={idx}
                                                ref={(el) => {
                                                  if (el) cardRefs.current[idx] = el
                                                }}
                                                className={`rounded-xl border border-slate-200 bg-white px-4 py-3 md:px-5 md:py-4 shadow-sm space-y-3 gbp-theme-card ${visibleCards.has(idx) ? 'visible' : ''}`}
                                                style={{ position: 'relative', zIndex: 1 }}
                                              >
                                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                                  <p className="text-sm font-semibold text-slate-900 gbp-theme-heading">
                                                    {theme.theme}
                                                  </p>
                                                  {modules.length > 0 && (
                                                    <div className="flex flex-wrap items-center gap-2">
                                                      {modules.map((module) => (
                                                        <ModulePrescriptionPill key={module.id} module={module} />
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>

                                                <div className="grid gap-3 md:grid-cols-2">
                                                  <div className="h-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 md:px-4 md:py-4">
                                                    <div className="mb-2">
                                                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                        YOU
                                                      </span>
                                                      <span className="ml-2 px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-100 text-red-700 border border-red-200" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                        Weaker here
                                                      </span>
                                                    </div>
                                                    <p className="text-xs md:text-sm leading-relaxed text-slate-900 whitespace-pre-line max-h-40 md:max-h-48 overflow-y-auto" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                      {theme.you}
                                                    </p>
                                                  </div>

                                                  <div className="h-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 md:px-4 md:py-4">
                                                    <div className="mb-2">
                                                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                        {theme.competitorName.toUpperCase()}
                                                      </span>
                                                      <span className="ml-2 px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                        Doing better
                                                      </span>
                                                    </div>
                                                    <p className="text-xs md:text-sm leading-relaxed text-slate-900 whitespace-pre-line max-h-40 md:max-h-48 overflow-y-auto" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                      {theme.competitor}
                                                    </p>
                                                  </div>
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
                                  </div>
                                </div>
                              )}

                              {/* Instagram AI Analysis */}
                              {analysis.id === 'instagram' && (
                                <div className="space-y-4">
                                  <div className="space-y-6">
                                    {instagramLoading ? (
                                      <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                        <CircularProgress size={40} className="text-[#1a73e8]" />
                                        <div className="text-center space-y-2">
                                          <p className="text-base font-medium text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                            {instagramLoadingMessages[instagramLoadingMessageIndex]}
                                          </p>
                                          <p className="text-sm text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                            This could take up to 30 seconds
                                          </p>
                                        </div>
                                      </div>
                                    ) : instagramError ? (
                                      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                                        <p className="text-sm text-red-700 mb-3" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                          {instagramError}
                                        </p>
                                        <button
                                          onClick={() => runInstagramAnalysis()}
                                          className="text-sm text-red-700 underline hover:text-red-900"
                                          style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                        >
                                          Retry
                                        </button>
                                      </div>
                                    ) : instagramAnalysis ? (
                                      <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-5 md:p-6 space-y-4 md:space-y-6">

                                      {/* Header Section */}
                                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                        <div className="flex-1 space-y-3">
                                          <div className="flex items-center justify-between gap-4">
                                            <p className="text-base md:text-lg font-semibold text-slate-900 gbp-theme-heading">
                                              @{socialUsernames.instagram}
                                            </p>
                                            {instagramAnalysis && (
                                              <button
                                                type="button"
                                                onClick={() => runInstagramAnalysis()}
                                                disabled={instagramRefreshing || instagramLoading}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium 
                                                  bg-white border border-slate-300 
                                                  text-slate-700
                                                  hover:bg-slate-50 
                                                  hover:border-slate-400
                                                  disabled:opacity-50 disabled:cursor-not-allowed
                                                  transition-all duration-200 flex-shrink-0"
                                                style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                                title="Regenerate AI analysis"
                                              >
                                                <RefreshIcon
                                                  sx={{
                                                    fontSize: 16,
                                                    animation: instagramRefreshing ? 'spin 1s linear infinite' : 'none',
                                                    '@keyframes spin': {
                                                      '0%': { transform: 'rotate(0deg)' },
                                                      '100%': { transform: 'rotate(360deg)' },
                                                    },
                                                  }}
                                                />
                                                {instagramRefreshing ? 'Generating...' : 'Refresh Analysis'}
                                              </button>
                                            )}
                                          </div>

                                          {instagramMetrics && (
                                            <div className="flex flex-wrap items-center gap-2">
                                              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-200 text-slate-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                {instagramMetrics.totalPosts} posts analyzed
                                              </span>
                                              {instagramMetrics.postsLast30Days !== undefined && (
                                                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-200 text-slate-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                  {instagramMetrics.postsLast30Days} posts in last 30 days
                                                </span>
                                              )}
                                              {instagramMetrics.avgLikes > 0 && (
                                                <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                  Avg ~{Math.round(instagramMetrics.avgLikes)} likes/post
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Summary */}
                                      <div className="rounded-lg bg-slate-100 border border-slate-200 p-4">
                                        <p className="text-sm text-slate-900 whitespace-pre-line" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                          {instagramAnalysis.summary}
                                        </p>
                                        {instagramMetrics && !instagramMetrics.hasAnyComments && (
                                          <p className="mt-2 text-xs text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                            We found almost no comments on your recent posts, so this analysis focuses on posting habits and likes.
                                          </p>
                                        )}
                                      </div>

                                      {/* What Works / Risks Row */}
                                      <div className="flex flex-col gap-3 md:flex-row">
                                        {/* What Works Panel */}
                                        <div className="flex-1 rounded-lg bg-emerald-50 border border-emerald-100 p-4">
                                          <div className="flex items-start gap-2">
                                            <ThumbUpIcon sx={{ fontSize: 18, color: '#10b981', marginTop: '2px', flexShrink: 0 }} />
                                            <div className="min-w-0">
                                              <p className="text-sm font-semibold text-emerald-900 mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                What's working on Instagram
                                              </p>
                                              <ul className="space-y-1.5">
                                                {instagramAnalysis.whatWorks.map((item, idx) => (
                                                  <li key={idx} className="text-sm text-emerald-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                    • {item}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          </div>
                                        </div>

                                        {/* Risks Panel */}
                                        <div className="flex-1 rounded-lg bg-red-50 border border-red-100 p-4">
                                          <div className="flex items-start gap-2">
                                            <WarningIcon sx={{ fontSize: 18, color: '#dc2626', marginTop: '2px', flexShrink: 0 }} />
                                            <div className="min-w-0">
                                              <p className="text-sm font-semibold text-red-900 mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                Risks & blind spots
                                              </p>
                                              <p className="text-sm text-red-900 whitespace-pre-line" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                {instagramAnalysis.risksSummary}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Risk Rows */}
                                      <div className="space-y-3">
                                        {instagramAnalysis.mainRisks.map((risk, idx) => {
                                          // Map Instagram module names to AntistaticModuleId
                                          const moduleMap: Record<string, AntistaticModuleId> = {
                                            'Reputation Hub': 'reputationHub',
                                            'Social Studio': 'socialStudio',
                                            'Influencer Hub': 'influencerHub', // Keep for backward compatibility
                                            'Creator Hub': 'influencerHub',
                                          }
                                          const moduleIds = risk.prescribedModules
                                            .map((name) => moduleMap[name])
                                            .filter((id): id is AntistaticModuleId => id !== undefined)
                                            .filter((id) => id !== 'insightsLab' && id !== 'profileManager')

                                          const severityColors = {
                                            low: 'bg-yellow-100 text-yellow-700 border-yellow-200',
                                            medium: 'bg-orange-100 text-orange-700 border-orange-200',
                                            high: 'bg-red-100 text-red-700 border-red-200',
                                          }

                                          return (
                                            <div
                                              key={risk.id}
                                              ref={(el) => {
                                                if (el) instagramCardRefs.current[idx] = el
                                              }}
                                              className={`rounded-xl border border-slate-200 bg-white px-4 py-3 md:px-5 md:py-4 shadow-sm space-y-3 gbp-theme-card ${visibleInstagramCards.has(idx) ? 'visible' : ''}`}
                                              style={{ position: 'relative', zIndex: 1 }}
                                            >
                                              {/* Header row */}
                                              <div className="flex items-center gap-2">
                                                <p className="text-sm font-semibold text-slate-900 gbp-theme-heading">
                                                  {risk.title}
                                                </p>
                                                <span
                                                  className={`px-2 py-0.5 text-[10px] font-medium rounded-full border ${severityColors[risk.severity]}`}
                                                  style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                                >
                                                  {risk.severityLabel || (risk.severity === 'high' ? 'High priority' : risk.severity === 'medium' ? 'Medium priority' : 'Low priority')}
                                                </span>
                                              </div>

                                              {/* Body text */}
                                              <p className="text-xs md:text-sm leading-relaxed text-slate-900 whitespace-pre-line" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                {risk.detail}
                                              </p>

                                              {/* Audience quotes section */}
                                              {risk.audienceQuotes && risk.audienceQuotes.length > 0 && (
                                                <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 border border-amber-100">
                                                  <div className="font-medium mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                    Audience said:
                                                  </div>
                                                  <ul className="space-y-1">
                                                    {risk.audienceQuotes.map((quote, qIdx) => (
                                                      <li key={qIdx} style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                        {quote.username && <span className="font-semibold">@{quote.username}</span>}
                                                        {quote.username && ': '}
                                                        <span>"{quote.text}"</span>
                                                      </li>
                                                    ))}
                                                  </ul>
                                                </div>
                                              )}

                                              {/* Module pills row */}
                                              {moduleIds.length > 0 && (
                                                <div className="mt-3 flex flex-wrap gap-2 justify-end">
                                                  {getModules(moduleIds).map((module) => (
                                                    <ModulePrescriptionPill key={module.id} module={module} />
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="text-center py-8 space-y-4">
                                      <p className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                        No Instagram analysis yet. Click "Generate Analysis" to run your first report.
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => runInstagramAnalysis()}
                                        disabled={instagramLoading || instagramRefreshing}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium 
                                          bg-white border border-slate-300 
                                          text-slate-700
                                          hover:bg-slate-50 
                                          hover:border-slate-400
                                          disabled:opacity-50 disabled:cursor-not-allowed
                                          transition-all duration-200 mx-auto"
                                        style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                        title="Generate Instagram analysis"
                                      >
                                        <RefreshIcon sx={{ fontSize: 18 }} />
                                        Generate Analysis
                                      </button>
                                    </div>
                                  )}
                                  </div>
                                </div>
                              )}

                              {/* Facebook AI Analysis */}
                              {analysis.id === 'facebook' && (
                                <div className="space-y-4">
                                  <div className="space-y-6">
                                    {facebookLoading || facebookRefreshing ? (
                                      <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                        <CircularProgress size={40} className="text-[#1a73e8]" />
                                        <div className="text-center space-y-2">
                                          <p className="text-base font-medium text-slate-900" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                            {facebookLoadingMessages[facebookLoadingMessageIndex]}
                                          </p>
                                          <p className="text-sm text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                            This could take up to 30 seconds
                                          </p>
                                        </div>
                                      </div>
                                    ) : facebookError ? (
                                      <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                                        <p className="text-sm text-red-700 mb-3" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                          {facebookError}
                                        </p>
                                        <button
                                          onClick={() => runFacebookAnalysis()}
                                          className="text-sm text-red-700 underline hover:text-red-900"
                                          style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                        >
                                          Retry
                                        </button>
                                      </div>
                                    ) : facebookAnalysis && facebookMetrics ? (
                                      <FacebookAnalysisUI
                                        analysis={facebookAnalysis}
                                        metrics={facebookMetrics}
                                        posts={facebookPosts || undefined}
                                        pageName={facebookPageName}
                                        facebookUrl={socialUsernames.facebook || ''}
                                        onRefresh={runFacebookAnalysis}
                                        isRefreshing={facebookRefreshing}
                                      />
                                    ) : (
                                      <div className="text-center py-8 space-y-4">
                                        <p className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                          No Facebook analysis yet. Click "Generate Analysis" to run your first report.
                                        </p>
                                        <button
                                          type="button"
                                          onClick={() => runFacebookAnalysis()}
                                          disabled={facebookLoading || facebookRefreshing}
                                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium 
                                            bg-white border border-slate-300 
                                            text-slate-700
                                            hover:bg-slate-50 
                                            hover:border-slate-400
                                            disabled:opacity-50 disabled:cursor-not-allowed
                                            transition-all duration-200 mx-auto"
                                          style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                          title="Generate Facebook analysis"
                                        >
                                          <RefreshIcon sx={{ fontSize: 18 }} />
                                          Generate Analysis
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-center py-8 space-y-4">
                              <p className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                {analysis.id === 'instagram'
                                  ? 'No Instagram analysis yet. Click "Generate Analysis" to run your first report.'
                                  : analysis.id === 'facebook'
                                    ? 'No Facebook analysis yet. Click "Generate Analysis" to run your first report.'
                                    : `Analysis for ${analysis.name} will appear here once data is available.`}
                              </p>
                            </div>
                          )}

                          {/* Navigation Buttons - Only show if there are multiple analyses */}
                          {analyses.length > 1 && (
                            <div className="flex justify-between items-center pt-4 border-t border-slate-200">
                              {(() => {
                                const currentIdx = analyses.findIndex(a => a.id === analysis.id)
                                const isFirst = currentIdx === 0
                                const isLast = currentIdx === analyses.length - 1
                                const isOnlyTwo = analyses.length === 2
                                
                                // If only 2 analyses
                                if (isOnlyTwo) {
                                  if (isFirst) {
                                    // First card: "View [second] analysis" on right
                                    const nextAnalysis = analyses[1]
                                    return (
                                      <>
                                        <div></div> {/* Spacer for left side */}
                                        <button
                                          onClick={() => {
                                            // #region agent log
                                            fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'social-channel-analysis.tsx:1461',message:'Navigation button clicked',data:{targetIndex:1,currentIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                                            // #endregion
                                            setCurrentIndex(1)
                                            scrollToTop()
                                          }}
                                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium 
                                            bg-slate-100 border border-slate-300 
                                            text-slate-700
                                            hover:bg-slate-200 
                                            hover:border-slate-400
                                            transition-all duration-200"
                                          style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                          aria-label={`View ${nextAnalysis.name} analysis`}
                                        >
                                          View {nextAnalysis.name} analysis
                                          <ChevronRight sx={{ fontSize: 18, color: '#64748b' }} />
                                        </button>
                                      </>
                                    )
                                  } else {
                                    // Second card: "Back to [first] analysis" on left
                                    const prevAnalysis = analyses[0]
                                    return (
                                      <>
                                        <button
                                          onClick={() => setCurrentIndex(0)}
                                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium 
                                            bg-slate-100 border border-slate-300 
                                            text-slate-700
                                            hover:bg-slate-200 
                                            hover:border-slate-400
                                            transition-all duration-200"
                                          style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                          aria-label={`Back to ${prevAnalysis.name} analysis`}
                                        >
                                          <ChevronLeft sx={{ fontSize: 18, color: '#64748b' }} />
                                          Back to {prevAnalysis.name} analysis
                                        </button>
                                        <div></div> {/* Spacer for right side */}
                                      </>
                                    )
                                  }
                                }
                                
                                // If 3+ analyses
                                if (isFirst) {
                                  // First card: "View [second] analysis" on right
                                  const nextAnalysis = analyses[1]
                                  return (
                                    <>
                                      <div></div> {/* Spacer for left side */}
                                      <button
                                        onClick={() => {
                                          setCurrentIndex(1)
                                          scrollToTop()
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium 
                                          bg-slate-100 border border-slate-300 
                                          text-slate-700
                                          hover:bg-slate-200 
                                          hover:border-slate-400
                                          transition-all duration-200"
                                        style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                        aria-label={`View ${nextAnalysis.name} analysis`}
                                      >
                                        View {nextAnalysis.name} analysis
                                        <ChevronRight sx={{ fontSize: 18, color: '#64748b' }} />
                                      </button>
                                    </>
                                  )
                                } else if (isLast) {
                                  // Last card: "Back to [previous] analysis" on left
                                  const prevAnalysis = analyses[currentIdx - 1]
                                  return (
                                    <>
                                      <button
                                        onClick={() => setCurrentIndex(currentIdx - 1)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium 
                                          bg-slate-100 border border-slate-300 
                                          text-slate-700
                                          hover:bg-slate-200 
                                          hover:border-slate-400
                                          transition-all duration-200"
                                        style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                        aria-label={`Back to ${prevAnalysis.name} analysis`}
                                      >
                                        <ChevronLeft sx={{ fontSize: 18, color: '#64748b' }} />
                                        Back to {prevAnalysis.name} analysis
                                      </button>
                                      <div></div> {/* Spacer for right side */}
                                    </>
                                  )
                                } else {
                                  // Middle cards: Two buttons - "Back" on left, "View" on right
                                  const prevAnalysis = analyses[currentIdx - 1]
                                  const nextAnalysis = analyses[currentIdx + 1]
                                  return (
                                    <>
                                      <button
                                        onClick={() => setCurrentIndex(currentIdx - 1)}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium 
                                          bg-slate-100 border border-slate-300 
                                          text-slate-700
                                          hover:bg-slate-200 
                                          hover:border-slate-400
                                          transition-all duration-200"
                                        style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                        aria-label={`Back to ${prevAnalysis.name} analysis`}
                                      >
                                        <ChevronLeft sx={{ fontSize: 18, color: '#64748b' }} />
                                        Back to {prevAnalysis.name} analysis
                                      </button>
                                      <button
                                        onClick={() => {
                                          setCurrentIndex(currentIdx + 1)
                                          scrollToTop()
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium 
                                          bg-slate-100 border border-slate-300 
                                          text-slate-700
                                          hover:bg-slate-200 
                                          hover:border-slate-400
                                          transition-all duration-200"
                                        style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                        aria-label={`View ${nextAnalysis.name} analysis`}
                                      >
                                        View {nextAnalysis.name} analysis
                                        <ChevronRight sx={{ fontSize: 18, color: '#64748b' }} />
                                      </button>
                                    </>
                                  )
                                }
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
      </section>
  )
}
