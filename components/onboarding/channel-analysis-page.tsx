'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material'
import { SocialChannelAnalysis } from './social-channel-analysis'

interface ChannelAnalysisPageProps {
  locationId: string
  isGoogleConnected: boolean
  socialUsernames: {
    facebook: string
    instagram: string
    linkedin: string
    tiktok: string
  }
}

export function ChannelAnalysisPage({
  locationId,
  isGoogleConnected,
  socialUsernames,
}: ChannelAnalysisPageProps) {
  const [goingBack, setGoingBack] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cardHeight, setCardHeight] = useState<number>(0)
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const [viewedCards, setViewedCards] = useState<Set<number>>(new Set([0])) // Start with first card viewed
  const [totalAnalyses, setTotalAnalyses] = useState<number>(0)
  const analysisContainerRef = useRef<HTMLDivElement>(null)
  const carouselContainerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'channel-analysis-page.tsx:28',message:'State initialized',data:{cardHeight,currentCardIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  }, [cardHeight, currentCardIndex]);
  // #endregion

  const handleBack = () => {
    setGoingBack(true)
    router.push('/onboarding/connect?allowBack=true')
  }

  const handleContinue = async () => {
    setLoading(true)
    
    // Collect and store prescribed modules from database before navigating
    try {
      const response = await fetch(`/api/onboarding/prescriptions?locationId=${locationId}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch prescriptions: ${response.status} ${response.statusText}`)
      }
      
      const data = await response.json()
      
      // Accept multiple response shapes for tolerance
      let rawPrescribed: unknown = null
      if (data.success && data.prescribedModules) {
        rawPrescribed = data.prescribedModules
      } else if (data.prescribedModules) {
        rawPrescribed = data.prescribedModules
      } else if (Array.isArray(data)) {
        rawPrescribed = data
      }
      
      if (rawPrescribed) {
        const { storePrescribedModules, normalizePrescribedModules } = await import('@/lib/onboarding/prescriptions')
        // Normalize and validate before storing
        const normalized = normalizePrescribedModules(rawPrescribed)
        
        // Only store if non-empty (don't overwrite existing with empty)
        if (normalized.length > 0) {
          storePrescribedModules(normalized)
        }
      }
      
      // Only navigate if we successfully fetched (even if empty)
      router.push('/onboarding/tools?allowBack=true')
    } catch (error) {
      console.error('[Channel Analysis] Error collecting prescriptions:', error)
      setError(error instanceof Error ? error.message : 'Failed to collect prescriptions. Please try again.')
      setLoading(false)
      // Don't navigate if prescription fetch fails
      return
    }
  }

  // Function to update card height
  const updateCardHeight = useCallback(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'channel-analysis-page.tsx:43',message:'updateCardHeight called',data:{currentCardIndex,hasRef:!!analysisContainerRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    if (analysisContainerRef.current) {
      // Find the section element (mt-8)
      const section = analysisContainerRef.current.querySelector('section') as HTMLElement
      if (!section) {
        return
      }

      // Find the carousel container (overflow-hidden) - this is the viewport
      const carouselContainer = section.querySelector('.overflow-hidden') as HTMLElement
      if (!carouselContainer) {
        return
      }

      // Find the flex container with all cards
      const flexContainer = carouselContainer.querySelector('.flex.transition-transform') as HTMLElement
      if (!flexContainer) {
        return
      }

      // Find all card containers (min-w-full)
      const cards = flexContainer.querySelectorAll('.min-w-full')
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'channel-analysis-page.tsx:60',message:'Cards found',data:{cardCount:cards.length,currentCardIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      if (cards.length > 0 && cards[currentCardIndex]) {
        // Get the specific card at currentCardIndex
        const currentCard = cards[currentCardIndex] as HTMLElement
        
        // Measure the white card content inside - this is the actual card height
        const cardContent = currentCard.querySelector('.bg-white.border') as HTMLElement
        if (cardContent) {
          const cardHeight = cardContent.offsetHeight
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'channel-analysis-page.tsx:84',message:'Card content height measured',data:{cardHeight,currentCardIndex,cardContentExists:true},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          if (cardHeight > 0) {
            setCardHeight(cardHeight)
            // Don't set container height - let it grow naturally to allow scrolling
            // The button will position based on cardHeight state
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'channel-analysis-page.tsx:98',message:'setCardHeight called with card content height',data:{cardHeight},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            return
          }
        }
        
        // Fallback: measure the card container itself
        const cardHeight = currentCard.offsetHeight
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'channel-analysis-page.tsx:97',message:'Fallback card height',data:{cardHeight,currentCardIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        if (cardHeight > 0) {
          setCardHeight(cardHeight)
        }
      }
    }
  }, [currentCardIndex])

  // Update height when card index changes
  useEffect(() => {
    // Small delay to allow DOM to update after card transition
    const timeoutId1 = setTimeout(() => {
      updateCardHeight()
    }, 200)
    
    // Also try after animation completes (300ms transition)
    const timeoutId2 = setTimeout(() => {
      updateCardHeight()
    }, 400)

    return () => {
      clearTimeout(timeoutId1)
      clearTimeout(timeoutId2)
    }
  }, [currentCardIndex, updateCardHeight])

  // Use ResizeObserver to track height changes
  useEffect(() => {
    if (!analysisContainerRef.current) return

    const observer = new ResizeObserver((entries) => {
      // Only update if the current card is being resized
      updateCardHeight()
    })

    // Observe the analysis container
    observer.observe(analysisContainerRef.current)

    // Also observe individual cards if they exist
    const section = analysisContainerRef.current.querySelector('section')
    if (section) {
      const carouselContainer = section.querySelector('.overflow-hidden')
      if (carouselContainer) {
        observer.observe(carouselContainer)
        const flexContainer = carouselContainer.querySelector('.flex.transition-transform')
        if (flexContainer) {
          observer.observe(flexContainer)
          const cards = flexContainer.querySelectorAll('.min-w-full')
          cards.forEach((card) => {
            observer.observe(card)
          })
        }
      }
    }

    return () => {
      observer.disconnect()
    }
  }, [updateCardHeight, currentCardIndex])

  // Initial height measurement
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      updateCardHeight()
    }, 500) // Wait for initial render

    return () => clearTimeout(timeoutId)
  }, [updateCardHeight])

  // Listen for card index changes from SocialChannelAnalysis
  useEffect(() => {
    const handleCardChange = (event: Event) => {
      const customEvent = event as CustomEvent<number>
      const newIndex = customEvent.detail
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'channel-analysis-page.tsx:177',message:'Event received',data:{newIndex,oldIndex:currentCardIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      setCurrentCardIndex(newIndex)
      // Mark this card as viewed
      setViewedCards(prev => new Set([...prev, newIndex]))
      
      // Immediately measure the new card's height after a brief delay to allow DOM update
      setTimeout(() => {
        if (analysisContainerRef.current) {
          const section = analysisContainerRef.current.querySelector('section') as HTMLElement
          if (section) {
            const carouselContainer = section.querySelector('.overflow-hidden') as HTMLElement
            if (carouselContainer) {
              const flexContainer = carouselContainer.querySelector('.flex.transition-transform') as HTMLElement
              if (flexContainer) {
                const cards = flexContainer.querySelectorAll('.min-w-full')
                if (cards.length > 0 && cards[newIndex]) {
                  const currentCard = cards[newIndex] as HTMLElement
                  // Measure the white card content - this is the actual card height
                  const cardContent = currentCard.querySelector('.bg-white.border') as HTMLElement
                  if (cardContent) {
                    const cardHeight = cardContent.offsetHeight
                    if (cardHeight > 0) {
                      // #region agent log
                      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'channel-analysis-page.tsx:198',message:'Immediate height measurement in event handler',data:{cardHeight,newIndex},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
                      // #endregion
                      setCardHeight(cardHeight)
                      // Don't set container height - let it grow naturally
                    }
                  } else {
                    // Fallback to card container height
                    const cardHeight = currentCard.offsetHeight
                     if (cardHeight > 0) {
                       setCardHeight(cardHeight)
                       // Don't set container height - let it grow naturally
                     }
                  }
                }
              }
            }
          }
        }
      }, 150) // Delay to ensure DOM has updated after transition starts
    }

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'channel-analysis-page.tsx:210',message:'Event listener registered',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    window.addEventListener('analysis-card-change', handleCardChange)
    return () => {
      window.removeEventListener('analysis-card-change', handleCardChange)
    }
  }, [currentCardIndex])

  // Listen for total analyses count from SocialChannelAnalysis
  useEffect(() => {
    const handleAnalysesCount = (event: Event) => {
      const customEvent = event as CustomEvent<number>
      const count = customEvent.detail
      setTotalAnalyses(count)
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'channel-analysis-page.tsx:232',message:'Total analyses count received',data:{count},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }

    window.addEventListener('analyses-count', handleAnalysesCount)
    return () => {
      window.removeEventListener('analyses-count', handleAnalysesCount)
    }
  }, [])

  // Check if the last analysis has been viewed
  const lastAnalysisIndex = totalAnalyses > 0 ? totalAnalyses - 1 : -1
  const hasViewedLastAnalysis = lastAnalysisIndex >= 0 && viewedCards.has(lastAnalysisIndex)

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <button
        onClick={handleBack}
        disabled={goingBack}
        className="flex items-center gap-2 text-[var(--google-grey-600)] hover:text-[var(--google-grey-900)] mb-6 transition-all duration-150 active:scale-95 active:opacity-70 disabled:opacity-70 disabled:cursor-not-allowed"
        style={{ fontFamily: 'var(--font-roboto-stack)' }}
      >
        <ArrowBackIcon sx={{ fontSize: 20 }} />
        <span className="text-sm font-medium">{goingBack ? 'Going back...' : 'Back'}</span>
      </button>

      {/* Header */}
      <h1 className="text-2xl lg:text-3xl font-medium mb-3 text-[var(--google-grey-900)] text-left" style={{ fontFamily: 'var(--font-google-sans)' }}>
        Channel Analysis
      </h1>
      <p className="text-base text-[var(--google-grey-600)] mb-8 text-left" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
        Insights from your connected channels and social media accounts.
      </p>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {error}
          </p>
        </div>
      )}

      {/* Social Channel Analysis Carousel */}
      <div ref={analysisContainerRef}>
        <SocialChannelAnalysis 
          locationId={locationId}
          isGoogleConnected={isGoogleConnected}
          socialUsernames={socialUsernames}
        />
      </div>

      {/* Continue Button - only show after viewing the last analysis */}
      {hasViewedLastAnalysis && (
        <div 
          className="transition-all duration-500 ease-in-out"
          style={{ 
            marginTop: (() => {
              // Reduced gap: use 4% of card height with a minimum of 24px
              const calculated = cardHeight > 0 ? `${Math.max(24, Math.min(cardHeight * 0.04, 80))}px` : '24px';
              // #region agent log
              fetch('http://127.0.0.1:7242/ingest/95d0d712-d91b-47c1-a157-c0939709591b',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'channel-analysis-page.tsx:270',message:'Button marginTop calculated',data:{cardHeight,calculated,hasViewedLastAnalysis},timestamp:Date.now(),sessionId:'debug-session',runId:'post-fix',hypothesisId:'D'})}).catch(()=>{});
              // #endregion
              return calculated;
            })(),
          }}
        >
          <Button
            variant="primary"
            size="md"
            onClick={handleContinue}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Continue'}
          </Button>
        </div>
      )}
    </div>
  )
}

