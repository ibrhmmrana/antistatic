'use client'

import { useState, useEffect } from 'react'
import { ReviewFilters } from './ReviewFilters'
import { ReviewList } from './ReviewList'
import { ReviewDetail } from './ReviewDetail'
import { BulkReplyModal } from './BulkReplyModal'
import { useToast, ToastContainer } from '@/components/ui/toast'

interface Review {
  id: string
  rating: number
  authorName: string
  authorPhotoUrl?: string | null
  text: string
  createTime: string
  source: 'google'
  replied: boolean
  reply?: { comment: string; updateTime?: string } | null
  sentiment: 'positive' | 'neutral' | 'negative'
  categories: string[]
  images?: string[]
  reviewName?: string | null
  reviewId?: string | null
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
  const { toasts, showToast, removeToast } = useToast()
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set())
  const [bulkReplyModalOpen, setBulkReplyModalOpen] = useState(false)
  const [generatedBulkReplies, setGeneratedBulkReplies] = useState<Array<{ reviewId: string; reply: string }>>([])
  const [generatingBulkReply, setGeneratingBulkReply] = useState(false)

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

  const handleReplyPosted = async (reviewId: string) => {
    try {
      // Fetch the updated reviews to get the latest reply data
      const response = await fetch(`/api/reputation/reviews?locationId=${businessLocationId}`)
      if (response.ok) {
        const data = await response.json()
        const updatedReview = data.reviews?.find((r: Review) => r.id === reviewId)
        if (updatedReview) {
          setReviews((prev) =>
            prev.map((r) => (r.id === reviewId ? updatedReview : r))
          )
          if (selectedReview?.id === reviewId) {
            setSelectedReview(updatedReview)
          }
        } else {
          // Fallback: just mark as replied
          setReviews((prev) =>
            prev.map((r) => (r.id === reviewId ? { ...r, replied: true } : r))
          )
          if (selectedReview?.id === reviewId) {
            setSelectedReview({ ...selectedReview, replied: true })
          }
        }
      } else {
        // Fallback: just mark as replied
        setReviews((prev) =>
          prev.map((r) => (r.id === reviewId ? { ...r, replied: true } : r))
        )
        if (selectedReview?.id === reviewId) {
          setSelectedReview({ ...selectedReview, replied: true })
        }
      }
      showToast('Reply posted successfully', 'success')
    } catch (error: any) {
      showToast(error.message || 'Failed to post reply', 'error')
    }
  }

  const handleReplyUpdated = async (reviewId: string) => {
    try {
      // Fetch the updated reviews to get the latest reply data
      const response = await fetch(`/api/reputation/reviews?locationId=${businessLocationId}`)
      if (response.ok) {
        const data = await response.json()
        const updatedReview = data.reviews?.find((r: Review) => r.id === reviewId)
        if (updatedReview) {
          setReviews((prev) =>
            prev.map((r) => (r.id === reviewId ? updatedReview : r))
          )
          if (selectedReview?.id === reviewId) {
            setSelectedReview(updatedReview)
          }
        }
      }
      showToast('Reply updated successfully', 'success')
    } catch (error: any) {
      showToast(error.message || 'Failed to update reply', 'error')
    }
  }

  const handleReplyDeleted = async (reviewId: string) => {
    try {
      // Fetch the updated reviews to reflect the deleted reply
      const response = await fetch(`/api/reputation/reviews?locationId=${businessLocationId}`)
      if (response.ok) {
        const data = await response.json()
        const updatedReview = data.reviews?.find((r: Review) => r.id === reviewId)
        if (updatedReview) {
          setReviews((prev) =>
            prev.map((r) => (r.id === reviewId ? updatedReview : r))
          )
          if (selectedReview?.id === reviewId) {
            setSelectedReview(updatedReview)
          }
        } else {
          // Fallback: mark as not replied
          setReviews((prev) =>
            prev.map((r) => (r.id === reviewId ? { ...r, replied: false, reply: null } : r))
          )
          if (selectedReview?.id === reviewId) {
            setSelectedReview({ ...selectedReview, replied: false, reply: null })
          }
        }
      } else {
        // Fallback: mark as not replied
        setReviews((prev) =>
          prev.map((r) => (r.id === reviewId ? { ...r, replied: false, reply: null } : r))
        )
        if (selectedReview?.id === reviewId) {
          setSelectedReview({ ...selectedReview, replied: false, reply: null })
        }
      }
      showToast('Reply deleted successfully', 'success')
    } catch (error: any) {
      showToast(error.message || 'Failed to delete reply', 'error')
    }
  }

  const handleToggleSelection = (reviewId: string) => {
    setSelectedReviewIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(reviewId)) {
        newSet.delete(reviewId)
      } else {
        newSet.add(reviewId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    const needsReplyReviews = filteredReviews.filter((r) => !r.replied)
    if (selectedReviewIds.size === needsReplyReviews.length) {
      setSelectedReviewIds(new Set())
    } else {
      setSelectedReviewIds(new Set(needsReplyReviews.map((r) => r.id)))
    }
  }

  const handleGenerateBulkReply = async () => {
    if (selectedReviewIds.size === 0) {
      showToast('Please select at least one review', 'error')
      return
    }

    setGeneratingBulkReply(true)
    try {
      const selectedReviews = filteredReviews.filter((r) => selectedReviewIds.has(r.id))
      const response = await fetch('/api/reputation/generate-bulk-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: businessLocationId,
          reviews: selectedReviews.map((r) => ({
            reviewId: r.id,
            authorName: r.authorName,
            rating: r.rating,
            text: r.text,
            createdAt: r.createTime,
            platform: 'google' as const,
          })),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to generate reply' }))
        throw new Error(errorData.error || 'Failed to generate reply')
      }

      const data = await response.json()
      if (data.success && data.replies && Array.isArray(data.replies)) {
        setGeneratedBulkReplies(data.replies)
        setBulkReplyModalOpen(true)
      } else {
        throw new Error(data.error || 'No replies generated')
      }
    } catch (error: any) {
      console.error('[RespondTab] Failed to generate bulk reply:', error)
      showToast(error.message || 'Failed to generate bulk reply', 'error')
    } finally {
      setGeneratingBulkReply(false)
    }
  }

  const handlePostSingleReply = async (reviewId: string, replyText: string) => {
    try {
      const review = filteredReviews.find((r) => r.id === reviewId)
      if (!review) {
        throw new Error('Review not found')
      }

      const response = await fetch('/api/reputation/bulk-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessLocationId,
          reviews: [
            {
              reviewId: review.id,
              reviewName: review.reviewName,
              comment: replyText,
            },
          ],
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to post reply' }))
        throw new Error(errorData.error || 'Failed to post reply')
      }

      const data = await response.json()
      const successCount = data.successCount || 0

      // Refresh reviews
      const refreshResponse = await fetch(`/api/reputation/reviews?locationId=${businessLocationId}`)
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json()
        setReviews(refreshData.reviews || [])
      }

      // Remove from selected reviews if it was selected
      setSelectedReviewIds((prev) => {
        const next = new Set(prev)
        next.delete(reviewId)
        return next
      })

      // Remove from generated replies
      setGeneratedBulkReplies((prev) => prev.filter((r) => r.reviewId !== reviewId))

      if (successCount > 0) {
        showToast('Reply posted successfully', 'success')
      }
    } catch (error: any) {
      console.error('[RespondTab] Failed to post single reply:', error)
      showToast(error.message || 'Failed to post reply', 'error')
      throw error // Re-throw so modal can handle it
    }
  }

  const handlePostBulkReply = async (replies: Array<{ reviewId: string; reply: string }>) => {
    if (selectedReviewIds.size === 0) {
      showToast('No reviews selected', 'error')
      return
    }

    try {
      const selectedReviews = filteredReviews.filter((r) => selectedReviewIds.has(r.id))
      // Map replies to reviews
      const reviewReplies = selectedReviews.map((r) => {
        const replyData = replies.find((rep) => rep.reviewId === r.id)
        return {
          reviewId: r.id,
          reviewName: r.reviewName,
          comment: replyData?.reply || '',
        }
      }).filter((r) => r.comment.trim().length > 0) // Only include reviews with replies

      if (reviewReplies.length === 0) {
        showToast('No valid replies to post', 'error')
        return
      }

      const response = await fetch('/api/reputation/bulk-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessLocationId,
          reviews: reviewReplies,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to post replies' }))
        throw new Error(errorData.error || 'Failed to post replies')
      }

      const data = await response.json()
      const successCount = data.successCount || 0
      const errorCount = data.errorCount || 0

      // Refresh reviews
      const refreshResponse = await fetch(`/api/reputation/reviews?locationId=${businessLocationId}`)
      if (refreshResponse.ok) {
        const refreshData = await refreshResponse.json()
        setReviews(refreshData.reviews || [])
      }

      // Clear selection
      setSelectedReviewIds(new Set())
      setSelectionMode(false)
      setBulkReplyModalOpen(false)
      setGeneratedBulkReplies([])

      if (errorCount === 0) {
        showToast(`Successfully posted ${successCount} reply${successCount > 1 ? 'ies' : ''}`, 'success')
      } else {
        showToast(`Posted ${successCount} reply${successCount > 1 ? 'ies' : ''}, ${errorCount} failed`, 'info')
      }
    } catch (error: any) {
      console.error('[RespondTab] Failed to post bulk reply:', error)
      showToast(error.message || 'Failed to post bulk reply', 'error')
    }
  }

  return (
    <>
      <ToastContainer toasts={toasts} onClose={removeToast} />
      <BulkReplyModal
        isOpen={bulkReplyModalOpen}
        onClose={() => {
          setBulkReplyModalOpen(false)
          setGeneratedBulkReplies([])
        }}
        generatedReplies={generatedBulkReplies}
        reviews={filteredReviews.filter((r) => selectedReviewIds.has(r.id))}
        onApprove={handlePostBulkReply}
        onPostSingle={handlePostSingleReply}
        onCancel={() => {
          setGeneratedBulkReplies([])
        }}
      />
      <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Filters - Left Column */}
        <div className="lg:col-span-2 min-h-0 overflow-auto">
          <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <ReviewFilters filters={filters} onFiltersChange={setFilters} reviews={reviews} />
          </div>
        </div>

        {/* List - Middle Column */}
        <div className={`min-h-0 overflow-y-auto flex flex-col ${selectionMode ? 'lg:col-span-10' : 'lg:col-span-4 border-r border-slate-200 pr-4'}`}>
          {/* Bulk Reply Controls */}
          <div className="mb-4 bg-white rounded-lg border border-slate-200 p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (selectionMode) {
                      // Exiting selection mode
                      setSelectedReviewIds(new Set())
                      setSelectionMode(false)
                    } else {
                      // Entering selection mode
                      setSelectedReview(null)
                      setSelectionMode(true)
                    }
                  }}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    selectionMode
                      ? 'bg-[#1a73e8] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  style={{ fontFamily: 'var(--font-google-sans)' }}
                >
                  {selectionMode ? 'Cancel Selection' : 'Bulk Reply'}
                </button>
                {selectionMode && (
                  <>
                    <button
                      onClick={handleSelectAll}
                      className="px-3 py-1.5 text-sm rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                      style={{ fontFamily: 'var(--font-google-sans)' }}
                    >
                      {selectedReviewIds.size === filteredReviews.filter((r) => !r.replied).length
                        ? 'Deselect All'
                        : 'Select All'}
                    </button>
                    {selectedReviewIds.size > 0 && (
                      <span className="text-sm font-medium text-slate-700 px-2 py-1 bg-blue-50 rounded-md">
                        {selectedReviewIds.size} selected
                      </span>
                    )}
                  </>
                )}
              </div>
              {selectionMode && selectedReviewIds.size > 0 && (
                <button
                  onClick={handleGenerateBulkReply}
                  disabled={generatingBulkReply}
                  className="px-4 py-1.5 text-sm font-medium rounded-md bg-[#1a73e8] text-white hover:bg-[#1557b0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  style={{ fontFamily: 'var(--font-google-sans)' }}
                >
                  {generatingBulkReply ? 'Generating...' : 'Generate Bulk Reply'}
                </button>
              )}
            </div>
            {selectionMode && (
              <p className="text-xs text-slate-500">
                Select multiple reviews that need replies. Click checkboxes or click on review cards to toggle selection.
              </p>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ReviewList
              reviews={filteredReviews}
              selectedReview={selectedReview}
              onSelectReview={setSelectedReview}
              loading={loading}
              selectedReviewIds={selectedReviewIds}
              onToggleSelection={handleToggleSelection}
              selectionMode={selectionMode}
            />
          </div>
        </div>

        {/* Detail + Composer - Right Column - Hidden in selection mode */}
        {!selectionMode && (
          <div className="lg:col-span-6 min-h-0 overflow-y-auto pl-4">
            {selectedReview ? (
              <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
              <ReviewDetail
                review={selectedReview}
                businessLocationId={businessLocationId}
                businessName={businessName}
                onReplyPosted={handleReplyPosted}
                onReplyUpdated={handleReplyUpdated}
                onReplyDeleted={handleReplyDeleted}
                onError={(error: string) => showToast(error, 'error')}
              />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[400px] text-slate-400 bg-white rounded-lg border border-slate-200 p-8">
                Select a review to view details and compose a reply
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}

