'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import StarIcon from '@mui/icons-material/Star'
import RefreshIcon from '@mui/icons-material/Refresh'
import UpdateIcon from '@mui/icons-material/Update'

interface GoogleReviewsSnapshotProps {
  locationId: string
  isGoogleConnected: boolean
}

interface CompetitorData {
  sampleSize: number
  localAverageRating: number | null
  localAverageReviews: number | null
  ratingPercentile: number | null
  reviewVolumePercentile: number | null
  primaryCategoryKeyword?: string | null
  topCompetitors: Array<{
    placeId: string
    name: string
    rating: number | null
    reviewsCount: number | null
    address?: string
    imageUrl?: string | null
    reviews?: Array<{
      reviewId?: string
      reviewerName?: string
      reviewerPhotoUrl?: string
      rating: number
      comment?: string
      date?: string
      relativeTime?: string
    }>
  }>
}

interface ReviewSummary {
  totalReviewCount: number
  averageRating: number
  positiveReviewCount: number
  negativeReviewCount: number
  sentimentSummary: {
    positivePercent: number
    neutralPercent: number
    negativePercent: number
  }
  categories?: string[]
  address?: string
  competitors?: CompetitorData | null
}

interface Review {
  reviewId: string
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE'
  ratingValue: number // 1-5 numeric
  comment?: string
  reviewerName: string
  reviewerPhotoUrl?: string
  createTime: string
  updateTime: string
}

interface ReviewsResponse {
  success: boolean
  summary?: ReviewSummary
  reviews?: Review[]
  category?: {
    primary: string | null
    additional: string[]
  }
  placesCategories?: {
    primary: string | null
    all: string[]
  }
  error?: string
  code?: string
}

function starRatingToNumber(rating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE'): number {
  const map: Record<string, number> = {
    'ONE': 1,
    'TWO': 2,
    'THREE': 3,
    'FOUR': 4,
    'FIVE': 5,
  }
  return map[rating] || 0
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return dateString
  }
}

function renderStars(rating: number): JSX.Element {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          key={star}
          sx={{
            fontSize: 16,
            color: star <= rating ? '#fbbc04' : 'var(--google-grey-300)',
            fill: star <= rating ? '#fbbc04' : 'var(--google-grey-300)',
          }}
        />
      ))}
    </div>
  )
}

export function GoogleReviewsSnapshot({ locationId, isGoogleConnected }: GoogleReviewsSnapshotProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ReviewsResponse | null>(null)
  const [expandedReviews, setExpandedReviews] = useState<Set<string>>(new Set())
  const [expandedCompetitorReviews, setExpandedCompetitorReviews] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)

  const fetchReviews = async (forceRefresh: boolean = false) => {
    if (!isGoogleConnected) {
      setLoading(false)
      return
    }

    if (!locationId || locationId.trim() === '') {
      console.error('[Google Reviews Snapshot] Invalid locationId:', locationId)
      setError('Invalid location ID. Please refresh the page.')
      setLoading(false)
      return
    }

    if (forceRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const url = forceRefresh 
        ? `/api/locations/${locationId}/gbp-reviews?forceRefresh=true`
        : `/api/locations/${locationId}/gbp-reviews`
      
      console.log('[Google Reviews Snapshot] Fetching reviews for location:', locationId, forceRefresh ? '(force refresh)' : '')
      const response = await fetch(url)
      
      if (!response.ok) {
        console.error('[Google Reviews Snapshot] API request failed:', {
          status: response.status,
          statusText: response.statusText,
        })
      }
      
      const result: ReviewsResponse = await response.json()

      console.log('[Google Reviews Snapshot] API response:', result)

      if (!result.success) {
        console.error('[Google Reviews Snapshot] API returned error:', result.error, result.code)
        setError(result.error || 'Failed to fetch reviews')
        setData(null)
      } else {
        setData(result)
        setError(null)
      }
    } catch (err: any) {
      console.error('[Google Reviews Snapshot] Error fetching reviews:', err)
      setError('Failed to fetch Google reviews. Please try again.')
      setData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = async () => {
    await fetchReviews(true)
  }

  useEffect(() => {
    fetchReviews()
  }, [locationId, isGoogleConnected])

  const toggleReviewExpansion = (reviewId: string) => {
    const newExpanded = new Set(expandedReviews)
    if (newExpanded.has(reviewId)) {
      newExpanded.delete(reviewId)
    } else {
      newExpanded.add(reviewId)
    }
    setExpandedReviews(newExpanded)
  }

  if (!isGoogleConnected) {
    return (
      <section className="bg-white border border-[var(--google-grey-200)] rounded-2xl shadow-sm mt-6 p-6">
        <div className="text-center py-8">
          <p className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Connect your Google Business Profile to see reviews and ratings.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-white border border-[var(--google-grey-200)] rounded-2xl shadow-sm mt-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex-1">
          <h2 className="text-lg font-medium text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
            Google Reviews snapshot
          </h2>
          <p className="text-sm text-[var(--google-grey-600)] mt-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            See your latest Google reviews and overall rating.
          </p>
          {/* Categories - show from summary.categories or placesCategories */}
          {data?.success && (
            (data.summary?.categories && data.summary.categories.length > 0) ||
            (data.placesCategories && data.placesCategories.all && data.placesCategories.all.length > 0)
          ) && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-xs text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                Categories:
              </span>
              {(data.summary?.categories || data.placesCategories?.all || []).slice(0, 5).map((category, index) => (
                <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--google-grey-100)] text-[var(--google-grey-700)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                  {category}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              handleRefresh()
            }}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium 
              bg-white border border-[var(--google-grey-300)] 
              text-[var(--google-grey-700)]
              hover:bg-[var(--google-grey-50)] 
              hover:border-[var(--google-grey-400)]
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-200"
            style={{ fontFamily: 'var(--font-roboto-stack)' }}
            title="Refresh Google analysis and fetch live data"
          >
            <UpdateIcon 
              sx={{ 
                fontSize: 16, 
                animation: refreshing ? 'spin 1s linear infinite' : 'none',
                '@keyframes spin': {
                  '0%': { transform: 'rotate(0deg)' },
                  '100%': { transform: 'rotate(360deg)' },
                },
              }} 
            />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-50 text-green-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
            Synced from Google
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <p className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Fetching your Google reviews…
          </p>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-red-50 border border-red-200">
            <p className="text-sm text-red-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
              {error}
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => fetchReviews()}
            className="w-full"
          >
            <RefreshIcon sx={{ fontSize: 18, mr: 1 }} />
            Retry
          </Button>
        </div>
      )}

      {/* Success State */}
      {!loading && !error && data?.success && data.summary && (
        <>
          {data.summary.totalReviewCount === 0 ? (
            /* Empty State */
            <div className="text-center py-8">
              <p className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                We couldn't find any Google reviews for this location yet. Once customers start reviewing you, they'll appear here automatically.
              </p>
            </div>
          ) : (
            <>
              {/* Metrics Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {/* Average Rating */}
                <div className="p-4 bg-[var(--google-grey-50)] rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    {renderStars(Math.round(data.summary.averageRating))}
                  </div>
                  <div className="text-2xl font-semibold text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
                    {data.summary.averageRating.toFixed(1)}
                  </div>
                  <div className="text-xs text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    / 5.0
                  </div>
                </div>

                {/* Total Reviews */}
                <div className="p-4 bg-[var(--google-grey-50)] rounded-lg">
                  <div className="text-sm text-[var(--google-grey-600)] mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    Total reviews
                  </div>
                  <div className="text-2xl font-semibold text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
                    {data.summary.totalReviewCount}
                  </div>
                </div>

                {/* Positive Reviews */}
                <div className="p-4 bg-[var(--google-grey-50)] rounded-lg">
                  <div className="text-sm text-[var(--google-grey-600)] mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    Positive reviews
                  </div>
                  <div className="text-2xl font-semibold text-green-600" style={{ fontFamily: 'var(--font-google-sans)' }}>
                    {data.summary.positiveReviewCount}
                  </div>
                  <div className="text-xs text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    4–5 stars
                  </div>
                </div>

                {/* Negative Reviews */}
                <div className="p-4 bg-[var(--google-grey-50)] rounded-lg">
                  <div className="text-sm text-[var(--google-grey-600)] mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    Negative reviews
                  </div>
                  <div className="text-2xl font-semibold text-red-600" style={{ fontFamily: 'var(--font-google-sans)' }}>
                    {data.summary.negativeReviewCount}
                  </div>
                  <div className="text-xs text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    1–3 stars
                  </div>
                </div>
              </div>

              {/* Competitor Comparison Section */}
              {data.summary?.competitors && (
                <div className="mt-6 pt-6 border-t border-[var(--google-grey-200)]">
                  <h3 className="text-base font-medium text-[var(--google-grey-900)] mb-4" style={{ fontFamily: 'var(--font-google-sans)' }}>
                    {data.summary.competitors.primaryCategoryKeyword
                      ? `Compared to other ${data.summary.competitors.primaryCategoryKeyword} businesses nearby`
                      : 'How you compare locally'}
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {/* Rating Comparison */}
                    <div className="p-4 bg-[var(--google-grey-50)] rounded-lg">
                      <div className="text-sm text-[var(--google-grey-600)] mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                        Your rating vs local average
                      </div>
                      <div className="flex items-baseline gap-3 mb-2">
                        <div>
                          <div className="text-lg font-semibold text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
                            You: {data.summary.averageRating.toFixed(1)}
                          </div>
                        </div>
                        <div className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                          vs
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-[var(--google-grey-700)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
                            Local avg: {data.summary.competitors.localAverageRating?.toFixed(1) || 'N/A'}
                          </div>
                        </div>
                      </div>
                      {data.summary.competitors.ratingPercentile !== null && (
                        <div className="text-xs text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                          {data.summary.competitors.ratingPercentile >= 80
                            ? `You're in the top ${100 - data.summary.competitors.ratingPercentile}% for rating locally.`
                            : data.summary.competitors.ratingPercentile >= 50
                            ? `You're above average for rating locally.`
                            : `You're below average for rating locally.`}
                        </div>
                      )}
                    </div>

                    {/* Review Volume Comparison */}
                    <div className="p-4 bg-[var(--google-grey-50)] rounded-lg">
                      <div className="text-sm text-[var(--google-grey-600)] mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                        Your review volume vs local average
                      </div>
                      <div className="flex items-baseline gap-3 mb-2">
                        <div>
                          <div className="text-lg font-semibold text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
                            You: {data.summary.totalReviewCount} reviews
                          </div>
                        </div>
                        <div className="text-sm text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                          vs
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-[var(--google-grey-700)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
                            Local avg: {data.summary.competitors.localAverageReviews ? Math.round(data.summary.competitors.localAverageReviews) : 'N/A'} reviews
                          </div>
                        </div>
                      </div>
                      {data.summary.competitors.reviewVolumePercentile !== null && (
                        <div className="text-xs text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                          {data.summary.competitors.reviewVolumePercentile >= 50
                            ? `You're above average for review volume.`
                            : `Below average review volume – consider asking more happy customers to leave reviews.`}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Top Competitors List */}
                  {data.summary.competitors.topCompetitors && data.summary.competitors.topCompetitors.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-[var(--google-grey-700)] mb-3" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                        Top competitors nearby
                      </div>
                      <div className="space-y-3">
                        {data.summary.competitors.topCompetitors.map((competitor) => {
                          const isExpanded = expandedCompetitorReviews.has(competitor.placeId)
                          const hasReviews = competitor.reviews && competitor.reviews.length > 0
                          const hasReviewCount = competitor.reviewsCount !== null && competitor.reviewsCount > 0
                          
                          return (
                            <div key={competitor.placeId} className="bg-[var(--google-grey-50)] rounded-lg overflow-hidden">
                              <div className="flex items-start gap-3 p-3">
                                {competitor.imageUrl && (
                                  <img
                                    src={competitor.imageUrl}
                                    alt={competitor.name}
                                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement
                                      target.style.display = 'none'
                                    }}
                                  />
                                )}
                                {!competitor.imageUrl && (
                                  <div className="w-12 h-12 rounded-lg bg-[var(--google-grey-200)] flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-medium text-[var(--google-grey-600)]">
                                      {competitor.name.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm text-[var(--google-grey-900)] mb-1" style={{ fontFamily: 'var(--font-google-sans)' }}>
                                    {competitor.name}
                                  </div>
                                  {competitor.address && (
                                    <div className="text-xs text-[var(--google-grey-600)] mb-1" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                      {competitor.address}
                                    </div>
                                  )}
                                  <div className="flex items-center gap-3">
                                    {competitor.rating !== null && (
                                      <div className="flex items-center gap-1">
                                        {renderStars(Math.round(competitor.rating))}
                                        <span className="text-xs font-medium text-[var(--google-grey-700)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                          {competitor.rating.toFixed(1)}
                                        </span>
                                      </div>
                                    )}
                                    {competitor.reviewsCount !== null && (
                                      <div className="text-xs text-[var(--google-grey-600)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                        {competitor.reviewsCount} reviews
                                      </div>
                                    )}
                                  </div>
                                  {hasReviewCount && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const newExpanded = new Set(expandedCompetitorReviews)
                                        if (isExpanded) {
                                          newExpanded.delete(competitor.placeId)
                                        } else {
                                          newExpanded.add(competitor.placeId)
                                        }
                                        setExpandedCompetitorReviews(newExpanded)
                                      }}
                                      className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors underline"
                                      style={{ fontFamily: 'var(--font-roboto-stack)' }}
                                    >
                                      {isExpanded ? 'Hide reviews' : hasReviews ? `View ${competitor.reviews?.length || 0} reviews` : `View reviews (${competitor.reviewsCount || 0} total)`}
                                    </button>
                                  )}
                                </div>
                              </div>
                              
                              {/* Expanded Reviews Section */}
                              {isExpanded && (
                                <div className="px-3 pb-3 border-t border-[var(--google-grey-200)] mt-3 pt-3">
                                  <div className="text-xs font-medium text-[var(--google-grey-700)] mb-3" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                    Reviews
                                  </div>
                                  {hasReviews && competitor.reviews ? (
                                    <div className="space-y-3 max-h-96 overflow-y-auto">
                                      {competitor.reviews.map((review, reviewIndex) => (
                                      <div key={review.reviewId || reviewIndex} className="p-3 bg-white rounded-lg border border-[var(--google-grey-200)]">
                                        <div className="flex items-start gap-2 mb-2">
                                          {review.reviewerPhotoUrl ? (
                                            <img
                                              src={review.reviewerPhotoUrl}
                                              alt={review.reviewerName || 'Reviewer'}
                                              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                                              onError={(e) => {
                                                const target = e.target as HTMLImageElement
                                                target.style.display = 'none'
                                              }}
                                            />
                                          ) : (
                                            <div className="w-8 h-8 rounded-full bg-[var(--google-grey-200)] flex items-center justify-center flex-shrink-0">
                                              <span className="text-xs font-medium text-[var(--google-grey-600)]">
                                                {(review.reviewerName || 'R').charAt(0).toUpperCase()}
                                              </span>
                                            </div>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                              <div className="font-medium text-xs text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
                                                {review.reviewerName || 'Anonymous'}
                                              </div>
                                              <div className="flex items-center">
                                                {renderStars(review.rating)}
                                              </div>
                                            </div>
                                            {(review.date || review.relativeTime) && (
                                              <div className="text-xs text-[var(--google-grey-600)] mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                {review.relativeTime || review.date}
                                              </div>
                                            )}
                                            {review.comment && (
                                              <div className="text-xs text-[var(--google-grey-700)] leading-relaxed" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                                {review.comment}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-[var(--google-grey-600)] p-4 bg-white rounded-lg border border-[var(--google-grey-200)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                      Review details are not available yet. This competitor has {competitor.reviewsCount || 0} reviews on Google.
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reviews List */}
              {data.reviews && data.reviews.length > 0 && (
                <div className="max-h-96 overflow-y-auto space-y-4">
                  {data.reviews.map((review) => {
                    const rating = review.ratingValue || starRatingToNumber(review.starRating)
                    const isExpanded = expandedReviews.has(review.reviewId)
                    const comment = review.comment || ''
                    const shouldTruncate = comment.length > 200
                    const displayComment = shouldTruncate && !isExpanded
                      ? comment.substring(0, 200) + '...'
                      : comment

                    return (
                      <div key={review.reviewId} className="border-b border-[var(--google-grey-200)] pb-4 last:border-0 last:pb-0">
                        <div className="flex items-start gap-3">
                          {/* Avatar */}
                          {review.reviewerPhotoUrl ? (
                            <img
                              src={review.reviewerPhotoUrl}
                              alt={review.reviewerName}
                              className="w-10 h-10 rounded-full flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-[var(--google-grey-200)] flex items-center justify-center flex-shrink-0">
                              <span className="text-sm font-medium text-[var(--google-grey-600)]">
                                {review.reviewerName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}

                          {/* Review Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm text-[var(--google-grey-900)]" style={{ fontFamily: 'var(--font-google-sans)' }}>
                                {review.reviewerName}
                              </span>
                              {renderStars(rating)}
                            </div>
                            {comment && (
                              <p className="text-sm text-[var(--google-grey-700)] mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                                {displayComment}
                                {shouldTruncate && (
                                  <button
                                    onClick={() => toggleReviewExpansion(review.reviewId)}
                                    className="text-[#1565B4] hover:underline ml-1"
                                  >
                                    {isExpanded ? 'Show less' : 'Show more'}
                                  </button>
                                )}
                              </p>
                            )}
                            <div className="text-xs text-[var(--google-grey-500)]" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                              {formatDate(review.createTime)}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

