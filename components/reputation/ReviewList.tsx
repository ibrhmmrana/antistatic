'use client'

import { useState } from 'react'
import { ReviewAvatar } from './ReviewAvatar'
import { ImageCarousel } from './ImageCarousel'
import { ImagePopup } from './ImagePopup'

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

interface ReviewListProps {
  reviews: Review[]
  selectedReview: Review | null
  onSelectReview: (review: Review) => void
  loading: boolean
  selectedReviewIds?: Set<string>
  onToggleSelection?: (reviewId: string) => void
  selectionMode?: boolean
}

const sentimentColors = {
  positive: 'bg-green-100 text-green-800',
  neutral: 'bg-gray-100 text-gray-800',
  negative: 'bg-red-100 text-red-800',
}

export function ReviewList({ 
  reviews, 
  selectedReview, 
  onSelectReview, 
  loading,
  selectedReviewIds = new Set(),
  onToggleSelection,
  selectionMode = false
}: ReviewListProps) {
  const [popupImageIndex, setPopupImageIndex] = useState<number | null>(null)
  const [popupImages, setPopupImages] = useState<string[]>([])

  const handleImageClick = (imageUrl: string, index: number, images: string[]) => {
    setPopupImages(images)
    setPopupImageIndex(index)
  }

  const handleClosePopup = () => {
    setPopupImageIndex(null)
    setPopupImages([])
  }

  const handleNavigatePopup = (index: number) => {
    setPopupImageIndex(index)
  }

  const handleCheckboxClick = (e: React.MouseEvent, reviewId: string) => {
    e.stopPropagation()
    if (onToggleSelection) {
      onToggleSelection(reviewId)
    }
  }

  const handleItemClick = (review: Review) => {
    if (selectionMode && onToggleSelection) {
      onToggleSelection(review.id)
    } else {
      onSelectReview(review)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Loading reviews...
      </div>
    )
  }

  if (reviews.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        No reviews found
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {reviews.map((review) => {
          const isSelected = selectedReview?.id === review.id
          const timeAgo = formatTimeAgo(new Date(review.createTime))

          const isChecked = selectedReviewIds.has(review.id)
          const showCheckbox = selectionMode && !review.replied

          return (
            <div
              key={review.id}
              onClick={() => handleItemClick(review)}
              className={`w-full text-left p-3 rounded-lg border transition-colors bg-white cursor-pointer ${
                isSelected && !selectionMode
                  ? 'border-[#1a73e8] bg-blue-50'
                  : isChecked
                  ? 'border-[#1a73e8] bg-blue-50 ring-2 ring-[#1a73e8] ring-opacity-20'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  {showCheckbox && (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      onClick={(e) => handleCheckboxClick(e, review.id)}
                      className="w-4 h-4 text-[#1a73e8] border-gray-300 rounded focus:ring-[#1a73e8] cursor-pointer"
                    />
                  )}
                  <ReviewAvatar authorName={review.authorName} authorPhotoUrl={review.authorPhotoUrl} size={36} />
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span
                          key={i}
                          className={`text-sm ${
                            i < review.rating ? 'text-yellow-400' : 'text-slate-300'
                          }`}
                        >
                          ★
                        </span>
                      ))}
                    </div>
                    <span className="text-sm font-medium text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
                      {review.authorName}
                    </span>
                  </div>
                </div>
                {!review.replied && (
                  <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full">
                    Needs reply
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 line-clamp-2 mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                {review.text}
              </p>
              
              {/* Reply Preview */}
              {review.replied && review.reply && (
                <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-blue-800" style={{ fontFamily: 'var(--font-google-sans)' }}>
                      Your Reply
                    </span>
                    {review.reply.updateTime && (
                      <span className="text-xs text-blue-600">
                        {formatTimeAgo(new Date(review.reply.updateTime))}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700 line-clamp-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                    {review.reply.comment}
                  </p>
                </div>
              )}
              
              {/* Image Carousel in Preview */}
              {review.images && review.images.length > 0 && (
                <div className="mb-2" onClick={(e) => e.stopPropagation()}>
                  <ImageCarousel
                    images={review.images}
                    onImageClick={(imageUrl, index) => handleImageClick(imageUrl, index, review.images!)}
                  />
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full ${sentimentColors[review.sentiment]}`}>
                  {review.sentiment}
                </span>
                {review.categories.slice(0, 2).map((cat) => (
                  <span
                    key={cat}
                    className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full capitalize"
                  >
                    {cat}
                  </span>
                ))}
                <span className="text-xs text-slate-400">{timeAgo}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Image Popup */}
      {popupImageIndex !== null && popupImages.length > 0 && (
        <ImagePopup
          images={popupImages}
          currentIndex={popupImageIndex}
          isOpen={true}
          onClose={handleClosePopup}
          onNavigate={handleNavigatePopup}
        />
      )}
    </>
  )
}

