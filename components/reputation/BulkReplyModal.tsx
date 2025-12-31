'use client'

import { useState, useEffect } from 'react'

interface Review {
  id: string
  authorName: string
  rating: number
  text: string
}

interface BulkReplyModalProps {
  isOpen: boolean
  onClose: () => void
  generatedReplies: Array<{ reviewId: string; reply: string }>
  reviews: Review[]
  onApprove: (replies: Array<{ reviewId: string; reply: string }>) => void
  onPostSingle?: (reviewId: string, reply: string) => void
  onCancel: () => void
}

export function BulkReplyModal({
  isOpen,
  onClose,
  generatedReplies,
  reviews,
  onApprove,
  onPostSingle,
  onCancel,
}: BulkReplyModalProps) {
  const [editedReplies, setEditedReplies] = useState<Array<{ reviewId: string; reply: string }>>([])
  const [activeTab, setActiveTab] = useState(0)
  const [posting, setPosting] = useState(false)
  const [postingSingle, setPostingSingle] = useState<Set<string>>(new Set())

  // Update editedReplies when generatedReplies changes
  useEffect(() => {
    if (generatedReplies && generatedReplies.length > 0) {
      setEditedReplies(generatedReplies)
      setActiveTab(0)
    } else {
      setEditedReplies([])
    }
  }, [generatedReplies])

  if (!isOpen) return null

  const handleReplyChange = (reviewId: string, reply: string) => {
    setEditedReplies((prev) =>
      prev.map((r) => (r.reviewId === reviewId ? { ...r, reply } : r))
    )
  }

  const handleApprove = async () => {
    // Validate all replies have content
    const validReplies = editedReplies.filter((r) => r.reply.trim().length > 0)
    if (validReplies.length === 0) {
      return
    }
    setPosting(true)
    try {
      await onApprove(validReplies)
    } finally {
      setPosting(false)
    }
  }

  const handleCancel = () => {
    setEditedReplies(generatedReplies)
    onCancel()
    onClose()
  }

  const handlePostSingle = async (reviewId: string) => {
    const reply = editedReplies.find((r) => r.reviewId === reviewId)
    if (!reply || !reply.reply.trim() || !onPostSingle) {
      return
    }

    setPostingSingle((prev) => new Set(prev).add(reviewId))
    try {
      await onPostSingle(reviewId, reply.reply.trim())
      // Remove the posted reply from the list
      const remainingReplies = editedReplies.filter((r) => r.reviewId !== reviewId)
      setEditedReplies(remainingReplies)
      
      // If no more replies, close the modal
      if (remainingReplies.length === 0) {
        onClose()
        return
      }
      
      // Adjust active tab if needed
      if (activeTab >= editedReplies.length - 1 && activeTab > 0) {
        setActiveTab(activeTab - 1)
      } else if (activeTab >= remainingReplies.length) {
        setActiveTab(remainingReplies.length - 1)
      }
    } finally {
      setPostingSingle((prev) => {
        const next = new Set(prev)
        next.delete(reviewId)
        return next
      })
    }
  }

  const currentReply = editedReplies[activeTab]
  const currentReview = reviews.find((r) => r.id === editedReplies[activeTab]?.reviewId)

  if (editedReplies.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-center h-48 text-slate-400">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a73e8] mx-auto mb-2"></div>
              <p className="text-sm">Generating replies...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
            Review & Edit Replies
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            {editedReplies.length} personalized reply{editedReplies.length > 1 ? 'ies' : ''} generated. Review and edit each one, then approve.
          </p>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 border-b border-slate-200">
          <div className="flex gap-2 overflow-x-auto">
            {editedReplies.map((reply, index) => {
              const review = reviews.find((r) => r.id === reply.reviewId)
              const isActive = activeTab === index
              return (
                <button
                  key={reply.reviewId}
                  onClick={() => setActiveTab(index)}
                  className={`px-3 py-2 text-sm font-medium rounded-t-md transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#1a73e8] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  style={{ fontFamily: 'var(--font-google-sans)' }}
                >
                  {review?.authorName || `Review ${index + 1}`}
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className={`ml-1 text-xs ${
                        i < (review?.rating || 0) ? 'text-yellow-400' : 'text-slate-300'
                      }`}
                    >
                      ★
                    </span>
                  ))}
                </button>
              )
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {currentReply && currentReview && (
            <div className="space-y-4">
              {/* Review Preview */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
                    {currentReview.authorName}
                  </span>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={`text-sm ${
                          i < currentReview.rating ? 'text-yellow-400' : 'text-slate-300'
                        }`}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-slate-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                  {currentReview.text && currentReview.text.trim() ? currentReview.text : <span className="italic text-slate-400">No comment provided</span>}
                </p>
              </div>

              {/* Reply Editor */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2" style={{ fontFamily: 'var(--font-google-sans)' }}>
                  Your Reply
                </label>
                <textarea
                  value={currentReply.reply}
                  onChange={(e) => handleReplyChange(currentReply.reviewId, e.target.value)}
                  className="w-full h-48 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] focus:border-transparent resize-none"
                  style={{ fontFamily: 'var(--font-roboto-stack)' }}
                  placeholder="Edit the generated reply..."
                />
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-slate-500">
                    {currentReply.reply.length} characters
                  </p>
                  {onPostSingle && (
                    <button
                      onClick={() => handlePostSingle(currentReply.reviewId)}
                      disabled={posting || postingSingle.has(currentReply.reviewId) || !currentReply.reply.trim()}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      style={{ fontFamily: 'var(--font-google-sans)' }}
                    >
                      {postingSingle.has(currentReply.reviewId) ? 'Posting...' : 'Post Reply'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            {activeTab + 1} of {editedReplies.length}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCancel}
              disabled={posting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: 'var(--font-google-sans)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleApprove}
              disabled={posting || editedReplies.filter((r) => r.reply.trim().length > 0).length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              style={{ fontFamily: 'var(--font-google-sans)' }}
            >
              {posting ? 'Posting...' : `Post All Replies (${editedReplies.filter((r) => r.reply.trim().length > 0).length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

