'use client'

import { useState } from 'react'
import { AIReplyComposer } from './AIReplyComposer'
import { ReviewAvatar } from './ReviewAvatar'
import { ImageCarousel } from './ImageCarousel'
import { ImagePopup } from './ImagePopup'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'

function formatTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  return date.toLocaleDateString()
}

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

interface ReviewDetailProps {
  review: Review
  businessLocationId: string
  businessName: string
  onReplyPosted: (reviewId: string) => void | Promise<void>
  onReplyUpdated?: (reviewId: string) => void | Promise<void>
  onReplyDeleted?: (reviewId: string) => void | Promise<void>
  onError?: (error: string) => void
}

const sentimentColors = {
  positive: 'bg-green-100 text-green-800',
  neutral: 'bg-gray-100 text-gray-800',
  negative: 'bg-red-100 text-red-800',
}

interface ReplyDisplayProps {
  review: Review
  businessLocationId: string
  onReplyUpdated: (reviewId: string) => void | Promise<void>
  onReplyDeleted: (reviewId: string) => void | Promise<void>
  onError?: (error: string) => void
}

function ReplyDisplay({ review, businessLocationId, onReplyUpdated, onReplyDeleted, onError }: ReplyDisplayProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(review.reply?.comment || '')
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleEdit = () => {
    setIsEditing(true)
    setEditText(review.reply?.comment || '')
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditText(review.reply?.comment || '')
  }

  const handleSaveEdit = async () => {
    if (!editText.trim()) {
      if (onError) onError('Reply cannot be empty')
      return
    }

    setIsUpdating(true)
    try {
      const response = await fetch('/api/reputation/reviews/reply', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewName: review.reviewName || null, // Send null if missing, API will construct it
          reviewId: review.reviewId || null, // Send reviewId as fallback
          comment: editText.trim(),
          businessLocationId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update reply')
      }

      await onReplyUpdated(review.id)
      setIsEditing(false)
    } catch (error: any) {
      console.error('[ReplyDisplay] Failed to update reply:', error)
      if (onError) {
        onError(error.message || 'Failed to update reply')
      }
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this reply? This action cannot be undone.')) {
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch('/api/reputation/reviews/reply', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewName: review.reviewName || null, // Send null if missing, API will construct it
          reviewId: review.reviewId || null, // Send reviewId as fallback
          businessLocationId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete reply')
      }

      await onReplyDeleted(review.id)
    } catch (error: any) {
      console.error('[ReplyDisplay] Failed to delete reply:', error)
      if (onError) {
        onError(error.message || 'Failed to delete reply')
      }
    } finally {
      setIsDeleting(false)
    }
  }

  if (isEditing) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="mb-3">
          <label className="text-sm font-semibold text-blue-900 mb-2 block" style={{ fontFamily: 'var(--font-google-sans)' }}>
            Edit Reply
          </label>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 text-sm border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            style={{ fontFamily: 'var(--font-roboto-stack)' }}
            disabled={isUpdating}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveEdit}
            disabled={isUpdating || !editText.trim()}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontFamily: 'var(--font-google-sans)' }}
          >
            <CheckIcon sx={{ fontSize: 16 }} />
            {isUpdating ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleCancelEdit}
            disabled={isUpdating}
            className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 text-slate-700 text-sm rounded-md hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontFamily: 'var(--font-google-sans)' }}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
            Your Reply
          </span>
          {review.reply?.updateTime && (
            <span className="text-xs text-slate-600">
              {formatTimeAgo(new Date(review.reply.updateTime))}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
            Posted
          </span>
          <button
            onClick={handleEdit}
            disabled={isDeleting}
            className="p-1.5 text-blue-700 hover:bg-blue-100 rounded-md transition-colors disabled:opacity-50"
            title="Edit reply"
            aria-label="Edit reply"
          >
            <EditIcon sx={{ fontSize: 18 }} />
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-1.5 text-red-700 hover:bg-red-100 rounded-md transition-colors disabled:opacity-50"
            title="Delete reply"
            aria-label="Delete reply"
          >
            <DeleteIcon sx={{ fontSize: 18 }} />
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-800 whitespace-pre-wrap" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
        {review.reply?.comment}
      </p>
      {isDeleting && (
        <div className="mt-2 text-xs text-slate-600">Deleting reply...</div>
      )}
    </div>
  )
}

export function ReviewDetail({ review, businessLocationId, businessName, onReplyPosted, onReplyUpdated, onReplyDeleted, onError }: ReviewDetailProps) {
  const [popupImageIndex, setPopupImageIndex] = useState<number | null>(null)
  const timeAgo = formatTimeAgo(new Date(review.createTime))

  const handleImageClick = (imageUrl: string, index: number) => {
    setPopupImageIndex(index)
  }

  const handleClosePopup = () => {
    setPopupImageIndex(null)
  }

  const handleNavigatePopup = (index: number) => {
    setPopupImageIndex(index)
  }

  return (
    <>
      <div className="space-y-6">
        {/* Review Header */}
        <div className="border-b border-slate-200 pb-6">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <ReviewAvatar authorName={review.authorName} authorPhotoUrl={review.authorPhotoUrl} size={44} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex items-center">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={`text-xl ${
                          i < review.rating ? 'text-yellow-400' : 'text-slate-300'
                        }`}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
                    {review.authorName}
                  </h3>
                </div>
                <p className="text-sm text-slate-500">{timeAgo}</p>
              </div>
            </div>
            {review.replied && (
              <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
                Replied
              </span>
            )}
          </div>

          {/* Review Text */}
          <p className="text-slate-700 mb-4" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {review.text && review.text.trim() ? review.text : <span className="italic text-slate-400">No comment provided</span>}
          </p>

          {/* Review Images Carousel */}
          {review.images && review.images.length > 0 && (
            <div className="mb-4">
              <ImageCarousel
                images={review.images}
                onImageClick={handleImageClick}
              />
            </div>
          )}

          {/* Metadata Chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-1 rounded-full ${sentimentColors[review.sentiment]}`}>
              {review.sentiment}
            </span>
            {review.categories.map((cat) => (
              <span
                key={cat}
                className="text-xs px-2 py-1 bg-slate-100 text-slate-700 rounded-full capitalize"
              >
                {cat}
              </span>
            ))}
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
              {review.source}
            </span>
          </div>
        </div>

        {/* Reply Section */}
        {review.replied && review.reply && (
          <div className="pt-1">
            <ReplyDisplay
              review={review}
              businessLocationId={businessLocationId}
              onReplyUpdated={onReplyUpdated || onReplyPosted}
              onReplyDeleted={onReplyDeleted || onReplyPosted}
              onError={onError}
            />
          </div>
        )}

      {/* AI Reply Composer - Only show if not replied */}
      {!review.replied && (
        <AIReplyComposer
          review={review}
          businessLocationId={businessLocationId}
          businessName={businessName}
          onReplyPosted={onReplyPosted}
          onError={onError}
        />
      )}
      </div>

      {/* Image Popup */}
      {popupImageIndex !== null && review.images && review.images.length > 0 && (
        <ImagePopup
          images={review.images}
          currentIndex={popupImageIndex}
          isOpen={true}
          onClose={handleClosePopup}
          onNavigate={handleNavigatePopup}
        />
      )}
    </>
  )
}

