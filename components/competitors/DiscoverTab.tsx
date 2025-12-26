'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useToast, ToastContainer } from '@/components/ui/toast'

interface DiscoverTabProps {
  businessLocationId: string
  businessName: string
}

export function DiscoverTab({ businessLocationId, businessName }: DiscoverTabProps) {
  const [nearestCompetitors, setNearestCompetitors] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const { toasts, showToast, removeToast } = useToast()

  // Preload images for the first few competitors
  useEffect(() => {
    if (nearestCompetitors.length > 0) {
      const firstFewCompetitors = nearestCompetitors.slice(0, 6) // Preload first 6 cards
      firstFewCompetitors.forEach((competitor) => {
        if (competitor.imageUrls && competitor.imageUrls.length > 0) {
          // Preload the first image of each competitor
          const link = document.createElement('link')
          link.rel = 'preload'
          link.as = 'image'
          link.href = competitor.imageUrls[0]
          document.head.appendChild(link)
        }
      })
    }
  }, [nearestCompetitors])

  useEffect(() => {
    loadNearestCompetitors()
  }, [businessLocationId])

  const loadNearestCompetitors = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/competitors/nearest?locationId=${businessLocationId}`)
      if (response.ok) {
        const data = await response.json()
        setNearestCompetitors(data.competitors || [])
      }
    } catch (error) {
      console.error('Failed to load nearest competitors:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <div>
        {loading ? (
          <div className="text-slate-500">Loading competitors...</div>
        ) : nearestCompetitors.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {nearestCompetitors.map((competitor, index) => (
              <CompetitorCard 
                key={competitor.placeId} 
                competitor={competitor} 
                businessLocationId={businessLocationId} 
                showToast={showToast}
                priority={index < 6} // Priority loading for first 6 cards
              />
            ))}
          </div>
        ) : (
          <div className="text-slate-500">No nearby competitors found.</div>
        )}
      </div>
    </div>
  )
}

function CompetitorCard({ competitor, businessLocationId, showToast, priority = false }: { competitor: any; businessLocationId: string; showToast: (message: string, type: 'success' | 'error' | 'info') => void; priority?: boolean }) {
  const [adding, setAdding] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)

  const imageUrls = competitor.imageUrls || (competitor.imageUrl ? [competitor.imageUrl] : [])
  const hasMultipleImages = imageUrls.length > 1

  // Reset image index when competitor changes
  useEffect(() => {
    setCurrentImageIndex(0)
  }, [competitor.placeId])

  // Preload adjacent images for smooth navigation
  useEffect(() => {
    if (imageUrls.length > 1) {
      // Preload next image
      const nextIndex = (currentImageIndex + 1) % imageUrls.length
      const nextLink = document.createElement('link')
      nextLink.rel = 'prefetch'
      nextLink.as = 'image'
      nextLink.href = imageUrls[nextIndex]
      document.head.appendChild(nextLink)

      // Preload previous image
      const prevIndex = currentImageIndex === 0 ? imageUrls.length - 1 : currentImageIndex - 1
      const prevLink = document.createElement('link')
      prevLink.rel = 'prefetch'
      prevLink.as = 'image'
      prevLink.href = imageUrls[prevIndex]
      document.head.appendChild(prevLink)
    }
  }, [currentImageIndex, imageUrls])

  const handleAddToWatchlist = async () => {
    setAdding(true)
    try {
      const response = await fetch('/api/competitors/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: competitor.placeId,
          source: 'nearest',
          businessLocationId,
          competitorData: competitor,
        }),
      })
      if (response.ok) {
        showToast('Added to watchlist!', 'success')
      } else {
        const error = await response.json()
        showToast(`Failed to add: ${error.error || 'Unknown error'}`, 'error')
      }
    } catch (error) {
      console.error('Failed to add to watchlist:', error)
      showToast('Failed to add to watchlist', 'error')
    } finally {
      setAdding(false)
    }
  }

  const handleImageScroll = (direction: 'prev' | 'next') => {
    if (imageUrls.length === 0) return
    if (direction === 'prev') {
      setCurrentImageIndex((prev) => (prev === 0 ? imageUrls.length - 1 : prev - 1))
    } else {
      setCurrentImageIndex((prev) => (prev === imageUrls.length - 1 ? 0 : prev + 1))
    }
  }

  // Keyboard navigation for images (when card is focused)
  useEffect(() => {
    const card = cardRef.current
    if (!card || imageUrls.length <= 1) return

    const handleKeyPress = (e: KeyboardEvent) => {
      // Only handle if card is focused or hovered
      if (!card.contains(document.activeElement) && !card.matches(':hover')) return
      
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setCurrentImageIndex((prev) => (prev === 0 ? imageUrls.length - 1 : prev - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setCurrentImageIndex((prev) => (prev === imageUrls.length - 1 ? 0 : prev + 1))
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [imageUrls.length])

  return (
    <div 
      ref={cardRef}
      className="bg-white rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col"
      tabIndex={0}
    >
      {/* Image Section - Smaller with scrollable images */}
      <div className="relative w-full aspect-[4/3] bg-slate-100 group">
        {imageUrls.length > 0 ? (
          <>
            <Image
              src={imageUrls[currentImageIndex]}
              alt={`${competitor.title} - Image ${currentImageIndex + 1} of ${imageUrls.length}`}
              fill
              className="object-cover"
              priority={priority}
              loading={priority ? 'eager' : 'lazy'}
              sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
              unoptimized={imageUrls[currentImageIndex]?.includes('maps.googleapis.com')}
            />
            {/* Always show navigation if there are multiple images */}
            {hasMultipleImages && (
              <>
                {/* Navigation Arrows - Always visible when multiple images */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleImageScroll('prev')
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white bg-opacity-90 hover:bg-opacity-100 text-slate-900 rounded-full p-2 shadow-lg transition-all z-10"
                  aria-label={`Previous image (${currentImageIndex === 0 ? imageUrls.length : currentImageIndex} of ${imageUrls.length})`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleImageScroll('next')
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white bg-opacity-90 hover:bg-opacity-100 text-slate-900 rounded-full p-2 shadow-lg transition-all z-10"
                  aria-label={`Next image (${currentImageIndex === imageUrls.length - 1 ? 1 : currentImageIndex + 2} of ${imageUrls.length})`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {/* Image Counter and Indicators */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-10">
                  <div className="bg-black bg-opacity-60 text-white text-xs px-2 py-1 rounded-full">
                    {currentImageIndex + 1} / {imageUrls.length}
                  </div>
                  <div className="flex gap-1.5">
                    {imageUrls.map((_: any, index: number) => (
                      <button
                        key={index}
                        onClick={(e) => {
                          e.stopPropagation()
                          setCurrentImageIndex(index)
                        }}
                        className={`w-2 h-2 rounded-full transition-all ${
                          index === currentImageIndex 
                            ? 'bg-white w-6' 
                            : 'bg-white bg-opacity-50 hover:bg-opacity-75'
                        }`}
                        aria-label={`Go to image ${index + 1} of ${imageUrls.length}`}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
      </div>

      {/* Business Info Section */}
      <div className="p-3 flex flex-col flex-1">
        <h3 className="font-semibold text-slate-900 text-sm mb-1.5 line-clamp-2">{competitor.title}</h3>
        
        {competitor.categoryName && (
          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full inline-block mb-1.5 w-fit">
            {competitor.categoryName}
          </span>
        )}

        <div className="flex items-center gap-2 mb-1.5">
          {competitor.totalScore && (
            <div className="flex items-center gap-1">
              <span className="text-yellow-400">★</span>
              <span className="text-sm font-medium text-slate-900">{competitor.totalScore.toFixed(1)}</span>
            </div>
          )}
          {competitor.reviewsCount && (
            <span className="text-sm text-slate-600">({competitor.reviewsCount.toLocaleString()} reviews)</span>
          )}
        </div>

        {competitor.address && (
          <div className="mb-1.5">
            <p className="text-xs text-slate-500 line-clamp-1 flex items-start gap-1">
              <svg className="w-3 h-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{competitor.address}</span>
            </p>
          </div>
        )}

        {competitor.phone && (
          <div className="mb-1.5">
            <a
              href={`tel:${competitor.phone}`}
              className="text-xs text-[#1a73e8] hover:underline flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span>{competitor.phone}</span>
            </a>
          </div>
        )}


        {competitor.website && (
          <div className="mb-1.5">
            <a
              href={competitor.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[#1a73e8] hover:underline flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span className="truncate">Visit website</span>
            </a>
          </div>
        )}

        {competitor.priceLevel !== null && competitor.priceLevel !== undefined && (
          <div className="mb-1.5">
            <div className="text-xs text-slate-600 flex items-center gap-1">
              <span className="font-medium">Price:</span>
              <span>{'$'.repeat(competitor.priceLevel)}</span>
              {competitor.priceLevel === 0 && <span className="text-slate-400">(Free)</span>}
            </div>
          </div>
        )}

        {competitor.businessStatus && competitor.businessStatus !== 'OPERATIONAL' && (
          <div className="mb-1.5">
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              competitor.businessStatus === 'CLOSED_PERMANENTLY' 
                ? 'bg-red-100 text-red-800' 
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {competitor.businessStatus === 'CLOSED_PERMANENTLY' ? 'Permanently Closed' : competitor.businessStatus}
            </span>
          </div>
        )}

        {competitor.isAdvertisement && (
          <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full inline-block mb-2 w-fit">
            Promoted
          </span>
        )}

        <button
          onClick={handleAddToWatchlist}
          disabled={adding}
          className="mt-auto w-full px-3 py-1.5 text-xs font-medium text-[#1a73e8] bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors disabled:opacity-50"
        >
          {adding ? 'Adding...' : 'Add to Watchlist'}
        </button>
      </div>
    </div>
  )
}
