'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useToast, ToastContainer } from '@/components/ui/toast'

interface RankingsTabProps {
  businessLocationId: string
}

function RankingCard({ result, index, rankings, showToast, businessLocationId }: { result: any; index: number; rankings: any; showToast: (message: string, type: 'success' | 'error' | 'info') => void; businessLocationId: string }) {
  const [adding, setAdding] = useState(false)
  const [isInWatchlist, setIsInWatchlist] = useState(false)
  const [showSocialModal, setShowSocialModal] = useState(false)
  const isYourBusiness = result.placeId === rankings.yourPlaceId
  const rank = result.rank || index + 1
  const imageUrls = result.imageUrls || (result.imageUrl ? [result.imageUrl] : [])
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [imageError, setImageError] = useState(false)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())

  // Check if competitor is already in watchlist
  useEffect(() => {
    if (isYourBusiness || !result.placeId) return
    
    const checkWatchlist = async () => {
      try {
        const response = await fetch(`/api/competitors/watchlist?locationId=${businessLocationId}`)
        if (response.ok) {
          const data = await response.json()
          const inWatchlist = data.competitors?.some((comp: any) => comp.place_id === result.placeId)
          setIsInWatchlist(inWatchlist || false)
        }
      } catch (error) {
        console.error('Failed to check watchlist:', error)
      }
    }
    
    checkWatchlist()
  }, [result.placeId, businessLocationId, isYourBusiness])

  // Try to load image and fallback to next if it fails
  const handleImageError = () => {
    if (currentImageIndex < imageUrls.length - 1) {
      // Try next image
      const nextIndex = currentImageIndex + 1
      setCurrentImageIndex(nextIndex)
      setImageError(false) // Reset error to try next image
    } else {
      // All images failed
      setImageError(true)
    }
  }

  // Preload next image in background
  useEffect(() => {
    if (imageUrls.length > 0 && currentImageIndex < imageUrls.length - 1 && !imageError) {
      const nextIndex = currentImageIndex + 1
      const img = new window.Image()
      img.src = imageUrls[nextIndex]
      img.onload = () => {
        setLoadedImages(prev => new Set([...prev, nextIndex]))
      }
    }
  }, [currentImageIndex, imageUrls, imageError])

  const handleAddToWatchlist = () => {
    if (isYourBusiness) return // Don't allow adding your own business
    setShowSocialModal(true)
  }

  const handleSubmitWithSocialHandles = async (socialHandles: Array<{ platform: string; handle: string }>) => {
    setAdding(true)
    setShowSocialModal(false)
    try {
      const response = await fetch('/api/competitors/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: result.placeId,
          source: 'rankings',
          businessLocationId,
          competitorData: {
            title: result.title,
            address: result.address,
            totalScore: result.score,
            reviewsCount: result.reviewsCount,
            imageUrl: result.imageUrl,
            imageUrls: result.imageUrls,
          },
          socialHandles: socialHandles.filter(h => h.handle.trim() !== ''),
        }),
      })
      
      if (response.ok) {
        setIsInWatchlist(true)
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

  const handleRemoveFromWatchlist = async () => {
    setAdding(true)
    try {
      const response = await fetch(`/api/competitors/watchlist?placeId=${result.placeId}&businessLocationId=${businessLocationId}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        setIsInWatchlist(false)
        showToast('Removed from watchlist', 'success')
      } else {
        const error = await response.json()
        showToast(`Failed to remove: ${error.error || 'Unknown error'}`, 'error')
      }
    } catch (error) {
      console.error('Failed to remove from watchlist:', error)
      showToast('Failed to remove from watchlist', 'error')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div
      className={`relative rounded-lg border overflow-hidden transition-all ${
        isYourBusiness
          ? 'bg-white border-blue-400 shadow-lg ring-2 ring-blue-200'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      {/* Image Section */}
      <div className="relative w-full h-48 bg-slate-100">
        {imageUrls.length > 0 && !imageError ? (
          <Image
            src={imageUrls[currentImageIndex]}
            alt={result.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            unoptimized={imageUrls[currentImageIndex]?.includes('maps.googleapis.com')}
            onError={handleImageError}
            onLoad={() => {
              setLoadedImages(prev => new Set([...prev, currentImageIndex]))
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        
        {/* Rank Display - Prominent ranking badge */}
        <div className={`absolute top-3 left-3 ${
          isYourBusiness
            ? 'bg-gradient-to-br from-[#1a73e8] to-[#1557b0] text-white'
            : rank === 1
            ? 'bg-gradient-to-br from-yellow-400 via-yellow-500 to-yellow-600 text-white'
            : rank === 2
            ? 'bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500 text-white'
            : rank === 3
            ? 'bg-gradient-to-br from-amber-600 via-amber-700 to-amber-800 text-white'
            : 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 text-white'
        } px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold text-sm shadow-2xl border-2 border-white/90 backdrop-blur-sm`}>
          {rank === 1 && (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          )}
          {rank === 2 && (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          )}
          {rank === 3 && (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          )}
          <span className="tracking-tight">#{rank}</span>
        </div>

        {/* Your Business Badge */}
        {isYourBusiness && (
          <div className="absolute top-3 right-3">
            <span className="px-2.5 py-1 bg-[#1a73e8] text-white text-xs font-semibold rounded-full shadow-lg">
              You
            </span>
          </div>
        )}
      </div>

      {/* Business Info */}
      <div className="p-4">
        <h5 className="font-semibold text-slate-900 text-sm mb-2 line-clamp-2 min-h-[2.5rem]">
          {result.title}
        </h5>
        
        {result.score && (
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1">
              <span className="text-yellow-400 text-sm">★</span>
              <span className="text-sm font-medium text-slate-900">{result.score.toFixed(1)}</span>
            </div>
            {result.reviewsCount && (
              <span className="text-xs text-slate-600">
                {result.reviewsCount.toLocaleString()} reviews
              </span>
            )}
            {result.distanceKm !== undefined && (
              <span className="text-xs text-slate-500 ml-auto">
                {result.distanceKm.toFixed(1)}km away
              </span>
            )}
          </div>
        )}

        {result.address && (
          <p className="text-xs text-slate-500 line-clamp-2 mb-3">
            {result.address}
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2">
          {/* Add/Remove from Watchlist Button */}
          {!isYourBusiness && (
            <button
              onClick={isInWatchlist ? handleRemoveFromWatchlist : handleAddToWatchlist}
              disabled={adding}
              className={`w-full px-3 py-2 text-xs font-medium rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                isInWatchlist
                  ? 'text-red-700 bg-red-50 border border-red-200 hover:bg-red-100'
                  : adding
                  ? 'text-white bg-[#1a73e8] opacity-50'
                  : 'text-white bg-[#1a73e8] hover:bg-[#1557b0]'
              }`}
            >
              {adding ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>{isInWatchlist ? 'Removing...' : 'Adding...'}</span>
                </>
              ) : isInWatchlist ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <span>Remove from Watchlist</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Add to Watchlist</span>
                </>
              )}
            </button>
          )}

          {/* Why They Rank Higher Button - Only for competitors above you */}
          {!isYourBusiness && rank < (rankings.yourRank || rankings.results.length) && (
            <button
              onClick={() => {
                // TODO: Implement why they rank higher functionality
                showToast('Ranking analysis feature coming soon', 'info')
              }}
              className="w-full px-3 py-1.5 text-xs font-medium text-[#1a73e8] bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors flex items-center justify-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span>Why They Rank Higher</span>
            </button>
          )}
        </div>
      </div>

      {/* Social Media Handles Modal */}
      {showSocialModal && (
        <SocialHandlesModal
          competitorName={result.title}
          onClose={() => setShowSocialModal(false)}
          onSubmit={handleSubmitWithSocialHandles}
        />
      )}
    </div>
  )
}

interface SocialHandlesModalProps {
  competitorName: string
  onClose: () => void
  onSubmit: (handles: Array<{ platform: string; handle: string }>) => void
}

function SocialHandlesModal({ competitorName, onClose, onSubmit }: SocialHandlesModalProps) {
  const [handles, setHandles] = useState<Array<{ platform: string; handle: string }>>([
    { platform: 'instagram', handle: '' },
    { platform: 'facebook', handle: '' },
    { platform: 'tiktok', handle: '' },
    { platform: 'x', handle: '' },
  ])

  const platformLabels: Record<string, string> = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    x: 'X (Twitter)',
  }

  const platformIcons: Record<string, JSX.Element> = {
    instagram: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    ),
    facebook: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
    tiktok: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
      </svg>
    ),
    x: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  }

  const handleSubmit = () => {
    onSubmit(handles)
  }

  const updateHandle = (index: number, value: string) => {
    const newHandles = [...handles]
    newHandles[index].handle = value
    setHandles(newHandles)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Add Social Handles</h2>
            <p className="text-sm text-slate-600 mt-1">Add {competitorName}'s social media handles (optional)</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Social Handles Form */}
        <div className="px-6 py-4 space-y-4">
          {handles.map((handle, index) => (
            <div key={handle.platform}>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">{platformIcons[handle.platform]}</span>
                  {platformLabels[handle.platform]}
                </div>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">@</span>
                <input
                  type="text"
                  value={handle.handle}
                  onChange={(e) => updateHandle(index, e.target.value)}
                  placeholder={`Enter ${platformLabels[handle.platform]} handle`}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] text-sm"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors"
          >
            Add to Watchlist
          </button>
        </div>
      </div>
    </div>
  )
}

export function RankingsTab({ businessLocationId }: RankingsTabProps) {
  const [searchTerms, setSearchTerms] = useState<any[]>([])
  const [selectedTerm, setSelectedTerm] = useState<any | null>(null)
  const [rankings, setRankings] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const { toasts, showToast, removeToast } = useToast()

  useEffect(() => {
    // Auto-sync from GBP on page load/refresh
    const autoSyncAndLoad = async () => {
      setSyncing(true)
      try {
        const syncResponse = await fetch('/api/competitors/search-terms/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessLocationId }),
        })
        if (syncResponse.ok) {
          // After sync, load the terms
          await loadSearchTerms()
        } else {
          // If sync fails, still try to load existing terms
          await loadSearchTerms()
        }
      } catch (error) {
        console.error('Auto-sync failed:', error)
        // Still try to load existing terms even if sync fails
        await loadSearchTerms()
      } finally {
        setSyncing(false)
      }
    }

    autoSyncAndLoad()
  }, [businessLocationId])

  useEffect(() => {
    if (selectedTerm) {
      loadRankings(selectedTerm.id).then((snapshot) => {
        // If no snapshot exists, auto-refresh rankings
        if (!snapshot && !refreshing && selectedTerm) {
          handleRefreshRankings()
        }
      })
    }
  }, [selectedTerm, businessLocationId])

  const loadSearchTerms = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/competitors/search-terms?locationId=${businessLocationId}&autoSync=false`)
      if (response.ok) {
        const data = await response.json()
        const terms = data.terms || []
        
        // Additional deduplication on frontend as safety measure
        const seen = new Set<string>()
        const uniqueTerms = terms.filter((term: any) => {
          const normalized = term.term?.trim().toLowerCase()
          if (!normalized || seen.has(normalized)) {
            return false
          }
          seen.add(normalized)
          return true
        })
        
        setSearchTerms(uniqueTerms)
        if (uniqueTerms.length > 0) {
          setSelectedTerm(uniqueTerms[0])
        }
      }
    } catch (error) {
      console.error('Failed to load search terms:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadRankings = async (searchTermId: string) => {
    try {
      // Get rankings snapshot (API will calculate rank using place_id)
      const response = await fetch(`/api/competitors/rankings?locationId=${businessLocationId}&searchTermId=${searchTermId}`)
      if (response.ok) {
        const data = await response.json()
        const snapshot = data.snapshot
        
        console.log('[Rankings] Loaded snapshot:', {
          hasSnapshot: !!snapshot,
          yourRank: snapshot?.yourRank,
          yourPlaceId: snapshot?.yourPlaceId,
          resultsCount: snapshot?.results?.length || 0,
        })
        
        setRankings(snapshot)
        return snapshot
      }
    } catch (error) {
      console.error('Failed to load rankings:', error)
    }
    return null
  }

  const handleRefreshRankings = async () => {
    if (!selectedTerm) return
    setRefreshing(true)
    let refreshError: string | null = null
    
    try {
      const response = await fetch('/api/competitors/rankings/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          searchTermId: selectedTerm.id,
          businessLocationId,
        }),
      })
      if (response.ok) {
        const snapshot = await loadRankings(selectedTerm.id)
        if (snapshot) {
          showToast('Rankings refreshed!', 'success')
        }
      } else {
        const error = await response.json()
        refreshError = error.error || 'Unknown error'
        // Still try to load existing rankings even if refresh failed
        console.warn('[Rankings] Refresh API failed, loading existing rankings:', refreshError)
      }
    } catch (error) {
      console.error('Failed to refresh rankings:', error)
      refreshError = 'Network error'
    } finally {
      // Always try to load rankings, even if refresh API failed
      // This handles cases where rankings are still loading or cached
      const snapshot = await loadRankings(selectedTerm.id)
      
      setRefreshing(false)
      
      // Only show error if refresh failed AND no rankings are available
      // If rankings loaded successfully, the refresh might have worked despite the error
      if (refreshError && !snapshot) {
        // Wait a bit to see if rankings are still loading in the background
        setTimeout(async () => {
          // Check again if rankings loaded in the meantime
          const latestSnapshot = await loadRankings(selectedTerm.id)
          if (!latestSnapshot) {
            showToast(`Failed to refresh: ${refreshError}`, 'error')
          }
        }, 1000)
      }
    }
  }

  // Load rankings for all terms to show which keywords they rank for
  const [allRankings, setAllRankings] = useState<Map<string, any>>(new Map())

  useEffect(() => {
    if (searchTerms.length > 0) {
      // Load rankings for all terms
      Promise.all(
        searchTerms.map(async (term) => {
          try {
            const response = await fetch(`/api/competitors/rankings?locationId=${businessLocationId}&searchTermId=${term.id}`)
            if (response.ok) {
              const data = await response.json()
              if (data.snapshot) {
                return { termId: term.id, snapshot: data.snapshot }
              }
            }
          } catch (error) {
            console.error(`Failed to load rankings for term ${term.id}:`, error)
          }
          return null
        })
      ).then((results) => {
        const rankingsMap = new Map()
        results.forEach((result) => {
          if (result) {
            rankingsMap.set(result.termId, result.snapshot)
          }
        })
        setAllRankings(rankingsMap)
      })
    }
  }, [searchTerms, businessLocationId])

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      {loading || syncing ? (
        <div className="text-slate-500">Loading search terms...</div>
      ) : (
        <div className="space-y-6">
          {/* Search Keywords Section */}
          {searchTerms.length > 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                  Search Keywords That Drive Traffic to Your Business
                </h3>
                <p className="text-sm text-slate-600">
                  These are the search terms customers use to find businesses like yours. Your ranking for each keyword determines how visible you are in search results.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {searchTerms.map((term) => {
                  const snapshot = allRankings.get(term.id)
                  const yourRank = snapshot?.yourRank
                  const hasRanking = yourRank !== null && yourRank !== undefined
                  const isSelected = selectedTerm?.id === term.id

                  return (
                    <button
                      key={term.id}
                      onClick={() => setSelectedTerm(term)}
                      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                        isSelected
                          ? 'bg-[#1a73e8] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                      title={hasRanking ? `Rank: #${yourRank}` : 'No ranking data'}
                    >
                      {term.term}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Detailed Rankings for Selected Term */}
          {searchTerms.length > 0 && selectedTerm && (
            <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Ranking Details for "{selectedTerm.term}"
                  </h3>
                  <p className="text-sm text-slate-600">
                    See where you rank and who's ranking above you for this keyword
                  </p>
                </div>
                <button
                  onClick={handleRefreshRankings}
                  disabled={refreshing}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors disabled:opacity-50"
                >
                  {refreshing ? 'Refreshing...' : 'Refresh Rankings'}
                </button>
              </div>

              {rankings && (
                <div className="space-y-6">
                  {/* Current Rank Card */}
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border-2 border-blue-300 shadow-md">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium text-blue-700 mb-2">Your Current Rank</div>
                        <div className="flex items-baseline gap-2 mb-3">
                          <div className="text-5xl font-bold text-[#1a73e8]">
                            {(() => {
                              // Use yourRank if available
                              if (rankings.yourRank !== null && rankings.yourRank !== undefined) {
                                return `#${rankings.yourRank}`
                              }
                              // Try to calculate from results if yourPlaceId exists
                              if (rankings.yourPlaceId && rankings.results && Array.isArray(rankings.results)) {
                                const yourResult = rankings.results.find((r: any) => r.placeId === rankings.yourPlaceId)
                                if (yourResult && yourResult.rank) {
                                  return `#${yourResult.rank}`
                                }
                              }
                              return 'N/A'
                            })()}
                          </div>
                          {(() => {
                            const displayRank = rankings.yourRank !== null && rankings.yourRank !== undefined 
                              ? rankings.yourRank
                              : (rankings.yourPlaceId && rankings.results?.find((r: any) => r.placeId === rankings.yourPlaceId)?.rank)
                            
                            return displayRank && (
                              <div className="text-base text-blue-600">
                                of {rankings.results?.length || 0} results
                              </div>
                            )
                          })()}
                        </div>
                        {(() => {
                          const displayRank = rankings.yourRank !== null && rankings.yourRank !== undefined 
                            ? rankings.yourRank
                            : (rankings.yourPlaceId && rankings.results?.find((r: any) => r.placeId === rankings.yourPlaceId)?.rank)
                          
                          if (displayRank) {
                            const percentage = Math.round((displayRank / (rankings.results?.length || 1)) * 100)
                            return (
                              <div className="text-sm text-blue-600">
                                You're in the top {percentage}% of results
                              </div>
                            )
                          }
                          return null
                        })()}
                      </div>
                      <div className="ml-4">
                        <div className="w-16 h-16 rounded-full bg-[#1a73e8] flex items-center justify-center shadow-lg">
                          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rankings Cards */}
                  {rankings.results && rankings.results.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-4">Top Results</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {rankings.results.slice(0, 10).map((result: any, index: number) => (
                          <RankingCard
                            key={index}
                            result={result}
                            index={index}
                            rankings={rankings}
                            showToast={showToast}
                            businessLocationId={businessLocationId}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 py-8 text-center">
                      <p>No rankings data available for this search term.</p>
                      <p className="text-sm mt-2">Click "Refresh Rankings" to fetch current rankings from Google Maps.</p>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {searchTerms.length > 0 && !selectedTerm && (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
              <p className="text-slate-500">Select a keyword above to view detailed rankings.</p>
            </div>
          )}

          {searchTerms.length === 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
              <p className="text-slate-500">No search terms available. Please ensure your Google Business Profile is connected and has search keyword data.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
