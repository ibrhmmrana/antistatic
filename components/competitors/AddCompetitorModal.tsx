'use client'

import { useState, useEffect, useRef } from 'react'
import { useToast, ToastContainer } from '@/components/ui/toast'
import Image from 'next/image'

interface AddCompetitorModalProps {
  businessLocationId: string
  onClose: () => void
}

interface Suggestion {
  place_id: string
  primaryText: string
  secondaryText: string
}

interface BusinessPreview {
  name: string
  formatted_address: string | null
  phone_number: string | null
  website: string | null
  rating: number | null
  review_count: number | null
  category: string | null
  categories: string[]
  open_now: boolean | null
  photo_url: string | null
  photo_urls: string[]
  lat: number | null
  lng: number | null
  place_id: string
}

export function AddCompetitorModal({ businessLocationId, onClose }: AddCompetitorModalProps) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState<Suggestion | null>(null)
  const [businessPreview, setBusinessPreview] = useState<BusinessPreview | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)
  const [adding, setAdding] = useState(false)
  const { toasts, showToast, removeToast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Debounce autocomplete
  useEffect(() => {
    // Don't show suggestions if a business is already selected
    if (selectedSuggestion) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    if (!query.trim()) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/places/autocomplete?query=${encodeURIComponent(query)}`)
        const data = await response.json()

        if (data.error) {
          return
        }

        setSuggestions(data.suggestions || [])
        setShowSuggestions(true)
      } catch (err: any) {
        console.error('Failed to fetch suggestions:', err)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query, selectedSuggestion])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSuggestionClick = async (suggestion: Suggestion) => {
    setSelectedSuggestion(suggestion)
    setQuery(suggestion.primaryText)
    setShowSuggestions(false)
    setBusinessPreview(null)
    setCurrentPhotoIndex(0)
    setLoadingPreview(true)

    try {
      // Fetch place details for preview
      const detailsResponse = await fetch(
        `/api/places/details?place_id=${suggestion.place_id}`
      )
      const detailsData = await detailsResponse.json()

      if (detailsData.error) {
        throw new Error(detailsData.error)
      }

      const details = detailsData.details
      
      // Use photo URLs from API if available, otherwise fallback to static map
      let photoUrls: string[] = details.photoUrls || []
      let photoUrl = details.photoUrl || null
      
      if (photoUrls.length === 0 && details.lat && details.lng) {
        // Fallback to static map if no photos
        photoUrl = `/api/places/staticmap?lat=${details.lat}&lng=${details.lng}`
        photoUrls = [photoUrl]
      }

      setBusinessPreview({
        name: details.name,
        formatted_address: details.formatted_address,
        phone_number: details.phone_number,
        website: details.website,
        rating: details.rating,
        review_count: details.review_count,
        category: details.category,
        categories: details.categories || [],
        open_now: details.open_now,
        photo_url: photoUrl,
        photo_urls: photoUrls,
        lat: details.lat,
        lng: details.lng,
        place_id: suggestion.place_id,
      })
    } catch (err: any) {
      console.error('Failed to load preview:', err)
      showToast('Failed to load business details', 'error')
    } finally {
      setLoadingPreview(false)
    }
  }

  const handleAddToWatchlist = async () => {
    if (!businessPreview || !selectedSuggestion) return

    setAdding(true)
    try {
      const response = await fetch('/api/competitors/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeId: selectedSuggestion.place_id,
          source: 'manual',
          businessLocationId,
          competitorData: {
            title: businessPreview.name,
            address: businessPreview.formatted_address,
            phone: businessPreview.phone_number,
            website: businessPreview.website,
            totalScore: businessPreview.rating,
            reviewsCount: businessPreview.review_count,
            categoryName: businessPreview.category,
            imageUrl: businessPreview.photo_url,
            imageUrls: businessPreview.photo_urls,
            lat: businessPreview.lat,
            lng: businessPreview.lng,
          },
        }),
      })
      if (response.ok) {
        showToast('Added to watchlist!', 'success')
        // Reset form
        setQuery('')
        setSelectedSuggestion(null)
        setBusinessPreview(null)
        setCurrentPhotoIndex(0)
        // Close modal after a short delay
        setTimeout(() => {
          onClose()
        }, 500)
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-semibold text-slate-900">Add Competitor</h2>
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

        {/* Search Input with Autocomplete */}
        <div className="px-6 py-4 border-b border-slate-200 shrink-0 relative" ref={suggestionsRef}>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setSelectedSuggestion(null)
                setBusinessPreview(null)
              }}
              onFocus={() => {
                if (suggestions.length > 0 && !selectedSuggestion) {
                  setShowSuggestions(true)
                }
              }}
              placeholder="Search Google Maps competitors..."
              className="w-full px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
            />
            
            {/* Autocomplete Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && !selectedSuggestion && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.place_id}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
                  >
                    <div className="font-medium text-slate-900">{suggestion.primaryText}</div>
                    {suggestion.secondaryText && (
                      <div className="text-sm text-slate-500 mt-0.5">{suggestion.secondaryText}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Business Preview */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loadingPreview ? (
            <div className="text-center text-slate-500 py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a73e8]"></div>
              <p className="mt-4">Loading business details...</p>
            </div>
          ) : businessPreview ? (
            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                {/* Image Carousel */}
                {businessPreview.photo_urls && businessPreview.photo_urls.length > 0 && (
                  <div className="relative w-full h-64 bg-slate-100">
                    <Image
                      src={businessPreview.photo_urls[currentPhotoIndex]}
                      alt={businessPreview.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 672px"
                      unoptimized={businessPreview.photo_urls[currentPhotoIndex]?.includes('maps.googleapis.com')}
                    />
                    {businessPreview.photo_urls.length > 1 && (
                      <>
                        <button
                          onClick={() => setCurrentPhotoIndex((prev) => (prev > 0 ? prev - 1 : businessPreview.photo_urls.length - 1))}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-opacity"
                          aria-label="Previous image"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setCurrentPhotoIndex((prev) => (prev < businessPreview.photo_urls.length - 1 ? prev + 1 : 0))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-70 transition-opacity"
                          aria-label="Next image"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                          {businessPreview.photo_urls.map((_, idx) => (
                            <div
                              key={idx}
                              className={`w-2 h-2 rounded-full ${idx === currentPhotoIndex ? 'bg-white' : 'bg-white bg-opacity-50'}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Business Details */}
                <div className="p-6">
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">{businessPreview.name}</h3>
                  
                  {businessPreview.category && (
                    <span className="inline-block text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded-full mb-3">
                      {businessPreview.category}
                    </span>
                  )}

                  <div className="space-y-2 mt-4">
                    {businessPreview.rating !== null && (
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-400">★</span>
                        <span className="font-medium">{businessPreview.rating.toFixed(1)}</span>
                        {businessPreview.review_count !== null && (
                          <span className="text-sm text-slate-600">({businessPreview.review_count} reviews)</span>
                        )}
                      </div>
                    )}

                    {businessPreview.formatted_address && (
                      <div className="flex items-start gap-2 text-sm text-slate-600">
                        <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>{businessPreview.formatted_address}</span>
                      </div>
                    )}

                    {businessPreview.phone_number && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <a href={`tel:${businessPreview.phone_number}`} className="hover:text-[#1a73e8]">
                          {businessPreview.phone_number}
                        </a>
                      </div>
                    )}

                    {businessPreview.website && (
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                        </svg>
                        <a href={businessPreview.website} target="_blank" rel="noopener noreferrer" className="hover:text-[#1a73e8] truncate">
                          {businessPreview.website}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Add to Watchlist Button */}
                  <button
                    onClick={handleAddToWatchlist}
                    disabled={adding}
                    className="w-full mt-6 px-4 py-3 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors disabled:opacity-50"
                  >
                    {adding ? 'Adding...' : 'Add to Watchlist'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 py-12">
              <p>Search for a competitor using Google Maps autocomplete.</p>
              <p className="text-sm mt-2">Start typing to see suggestions...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

