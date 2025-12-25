'use client'

import { useState, useEffect } from 'react'
import { ReviewFilters } from './ReviewFilters'
import { ReviewList } from './ReviewList'
import { ReviewDetail } from './ReviewDetail'

interface Review {
  id: string
  rating: number
  authorName: string
  authorPhotoUrl?: string | null
  text: string
  createTime: string
  source: 'google'
  replied: boolean
  sentiment: 'positive' | 'neutral' | 'negative'
  categories: string[]
  images?: string[]
}

interface RespondTabProps {
  businessLocationId: string
  businessName: string
}

export function RespondTab({ businessLocationId, businessName }: RespondTabProps) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [selectedReview, setSelectedReview] = useState<Review | null>(null)
  const [filters, setFilters] = useState({
    status: 'all' as 'all' | 'needs_reply' | 'replied',
    rating: null as number | null,
    sentiment: null as 'positive' | 'neutral' | 'negative' | null,
    categories: [] as string[],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchReviews = async () => {
      try {
        const response = await fetch(`/api/reputation/reviews?locationId=${businessLocationId}`)
        if (response.ok) {
          const data = await response.json()
          setReviews(data.reviews || [])
        }
      } catch (error) {
        console.error('[RespondTab] Failed to fetch reviews:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchReviews()
  }, [businessLocationId])

  const filteredReviews = reviews.filter((review) => {
    if (filters.status === 'needs_reply' && review.replied) return false
    if (filters.status === 'replied' && !review.replied) return false
    if (filters.rating && review.rating !== filters.rating) return false
    if (filters.sentiment && review.sentiment !== filters.sentiment) return false
    if (filters.categories.length > 0) {
      const hasCategory = filters.categories.some((cat) => review.categories.includes(cat))
      if (!hasCategory) return false
    }
    return true
  })

  const handleReplyPosted = (reviewId: string) => {
    setReviews((prev) =>
      prev.map((r) => (r.id === reviewId ? { ...r, replied: true } : r))
    )
    if (selectedReview?.id === reviewId) {
      setSelectedReview({ ...selectedReview, replied: true })
    }
  }

  return (
    <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Filters - Left Column */}
      <div className="lg:col-span-2 min-h-0 overflow-auto">
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <ReviewFilters filters={filters} onFiltersChange={setFilters} reviews={reviews} />
        </div>
      </div>

      {/* List - Middle Column */}
      <div className="lg:col-span-4 min-h-0 overflow-y-auto border-r border-slate-200 pr-4">
        <ReviewList
          reviews={filteredReviews}
          selectedReview={selectedReview}
          onSelectReview={setSelectedReview}
          loading={loading}
        />
      </div>

      {/* Detail + Composer - Right Column */}
      <div className="lg:col-span-6 min-h-0 overflow-y-auto pl-4">
        {selectedReview ? (
          <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
            <ReviewDetail
              review={selectedReview}
              businessLocationId={businessLocationId}
              businessName={businessName}
              onReplyPosted={handleReplyPosted}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full min-h-[400px] text-slate-400 bg-white rounded-lg border border-slate-200 p-8">
            Select a review to view details and compose a reply
          </div>
        )}
      </div>
    </div>
  )
}

