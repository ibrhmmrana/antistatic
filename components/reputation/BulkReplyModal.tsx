'use client'

import { useState } from 'react'

interface BulkReplyModalProps {
  isOpen: boolean
  onClose: () => void
  generatedReply: string
  reviewCount: number
  onApprove: (replyText: string) => void
  onCancel: () => void
}

export function BulkReplyModal({
  isOpen,
  onClose,
  generatedReply,
  reviewCount,
  onApprove,
  onCancel,
}: BulkReplyModalProps) {
  const [editedReply, setEditedReply] = useState(generatedReply)
  const [posting, setPosting] = useState(false)

  if (!isOpen) return null

  const handleApprove = async () => {
    if (!editedReply.trim()) {
      return
    }
    setPosting(true)
    try {
      await onApprove(editedReply.trim())
    } finally {
      setPosting(false)
    }
  }

  const handleCancel = () => {
    setEditedReply(generatedReply)
    onCancel()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
            Review & Edit Bulk Reply
          </h2>
          <p className="text-sm text-slate-600 mt-1">
            This reply will be posted to {reviewCount} review{reviewCount > 1 ? 's' : ''}. Edit if needed, then approve.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2" style={{ fontFamily: 'var(--font-google-sans)' }}>
              Reply Text
            </label>
            <textarea
              value={editedReply}
              onChange={(e) => setEditedReply(e.target.value)}
              className="w-full h-48 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] focus:border-transparent resize-none"
              style={{ fontFamily: 'var(--font-roboto-stack)' }}
              placeholder="Edit the generated reply..."
            />
            <p className="text-xs text-slate-500 mt-1">
              {editedReply.length} characters
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
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
            disabled={posting || !editedReply.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            style={{ fontFamily: 'var(--font-google-sans)' }}
          >
            {posting ? 'Posting...' : `Post to ${reviewCount} Review${reviewCount > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

