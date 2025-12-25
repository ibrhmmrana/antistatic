'use client'

import { useState } from 'react'
import { AIReplyComposer } from './AIReplyComposer'
import { ReviewAvatar } from './ReviewAvatar'

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
  sentiment: 'positive' | 'neutral' | 'negative'
  categories: string[]
  images?: string[]
}

interface ReviewDetailProps {
  review: Review
  businessLocationId: string
  businessName: string
  onReplyPosted: (reviewId: string) => void
}

const sentimentColors = {
  positive: 'bg-green-100 text-green-800',
  neutral: 'bg-gray-100 text-gray-800',
  negative: 'bg-red-100 text-red-800',
}

export function ReviewDetail({ review, businessLocationId, businessName, onReplyPosted }: ReviewDetailProps) {
  const timeAgo = formatTimeAgo(new Date(review.createTime))

  return (
    <div className="space-y-6">
      {/* Review Header */}
      <div className="border-b border-slate-200 pb-4">
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
          {review.text}
        </p>

        {/* Review Images */}
        {review.images && review.images.length > 0 && (
          <div className="mb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {review.images.map((imageUrl, index) => (
                <a
                  key={index}
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-slate-300 transition-colors group"
                >
                  <img
                    src={imageUrl}
                    alt={`Review image ${index + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </a>
              ))}
            </div>
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

      {/* AI Reply Composer */}
      <AIReplyComposer
        review={review}
        businessLocationId={businessLocationId}
        businessName={businessName}
        onReplyPosted={onReplyPosted}
      />
    </div>
  )
}

