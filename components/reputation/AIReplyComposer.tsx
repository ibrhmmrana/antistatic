'use client'

import { useState, useEffect } from 'react'

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
  reviewName?: string | null // Full review name for API calls (e.g., "accounts/.../locations/.../reviews/...")
}

interface AIReplyComposerProps {
  review: Review
  businessLocationId: string
  businessName: string
  onReplyPosted: (reviewId: string) => void | Promise<void>
  onError?: (error: string) => void
}

export function AIReplyComposer({ review, businessLocationId, businessName, onReplyPosted, onError }: AIReplyComposerProps) {
  const [tone, setTone] = useState<'warm' | 'professional' | 'apologetic' | 'friendly'>('warm')
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium')
  const [generating, setGenerating] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null)
  const [customReply, setCustomReply] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load saved suggestions for this review when review changes
  useEffect(() => {
    const storageKey = `reply_suggestions_${review.id}`
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as string[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSuggestions(parsed)
        } else {
          setSuggestions([])
        }
      } catch (error) {
        console.error('[AIReplyComposer] Failed to load saved suggestions:', error)
        setSuggestions([])
      }
    } else {
      setSuggestions([])
    }
    setSelectedSuggestion(null)
    setCustomReply('')
  }, [review.id])

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    try {
      const response = await fetch('/api/reputation/generate-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: businessLocationId,
          review: {
            reviewId: review.id,
            authorName: review.authorName,
            rating: review.rating,
            text: review.text,
            createdAt: review.createTime,
            platform: 'google' as const,
          },
          tone:
            tone === 'warm'
              ? 'Warm'
              : tone === 'professional'
                ? 'Professional'
                : tone === 'apologetic'
                  ? 'Apologetic'
                  : tone === 'friendly'
                    ? 'Friendly'
                    : 'Warm',
          length: length === 'short' ? 'Short' : length === 'medium' ? 'Medium' : 'Long',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to generate reply' }))
        throw new Error(errorData.error || 'Failed to generate reply')
      }

      const data = await response.json()
      if (data.success && data.replies && Array.isArray(data.replies) && data.replies.length > 0) {
        setSuggestions(data.replies)
        setSelectedSuggestion(null) // Reset selection
        // Save to localStorage for this review
        const storageKey = `reply_suggestions_${review.id}`
        localStorage.setItem(storageKey, JSON.stringify(data.replies))
        // Don't auto-insert, let user choose
      } else {
        throw new Error(data.error || 'No replies in response')
      }
    } catch (error: any) {
      console.error('[AIReplyComposer] Failed to generate reply:', error)
      setError(error.message || 'Failed to generate reply. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const handlePostReply = async () => {
    const replyText = customReply.trim()
    if (!replyText) {
      setError('Please enter a reply before posting')
      return
    }

    if (!review.reviewName) {
      setError('Review identifier missing. Please refresh the page and try again.')
      return
    }

    setPosting(true)
    setError(null)

    try {
      const response = await fetch('/api/reputation/reviews/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewName: review.reviewName,
          comment: replyText,
          businessLocationId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        // Handle specific error codes
        if (data.code === 'TOKEN_EXPIRED' || data.code === 'AUTH_FAILED') {
          throw new Error('Google Business Profile connection expired. Please reconnect your account in Settings.')
        }
        if (data.code === 'PERMISSION_DENIED') {
          throw new Error('Permission denied. Please ensure your location is verified and you have permission to reply.')
        }
        if (data.code === 'REVIEW_NOT_FOUND') {
          throw new Error('Review not found. It may have been deleted.')
        }
        throw new Error(data.error || 'Failed to post reply')
      }

      // Success - notify parent and clear state
      await onReplyPosted(review.id)
      
      // Clear saved suggestions for this review since it's been replied to
      const storageKey = `reply_suggestions_${review.id}`
      localStorage.removeItem(storageKey)
      setSelectedSuggestion(null)
      setSuggestions([])
      setCustomReply('')
    } catch (error: any) {
      console.error('[AIReplyComposer] Failed to post reply:', error)
      const errorMessage = error.message || 'Failed to post reply. Please try again.'
      setError(errorMessage)
      
      // Notify parent about error for toast
      if (onError) {
        onError(errorMessage)
      }
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
        Compose Reply
      </h3>

      {/* Tone & Length Selectors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-slate-700 mb-2 block" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Tone
          </label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as typeof tone)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
          >
            <option value="warm">Warm</option>
            <option value="professional">Professional</option>
            <option value="apologetic">Apologetic</option>
            <option value="firm">Friendly</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-700 mb-2 block" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Length
          </label>
          <select
            value={length}
            onChange={(e) => setLength(e.target.value as typeof length)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
          >
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="w-full px-4 py-2 bg-[#1a73e8] text-white rounded-md hover:bg-[#1557b0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ fontFamily: 'var(--font-google-sans)' }}
      >
        {generating ? 'Generating...' : 'Generate Reply'}
      </button>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            {error}
          </p>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Choose a reply ({suggestions.length} variations)
          </label>
          {suggestions.map((suggestion, index) => (
            <div
              key={index}
              className={`p-3 border rounded-md cursor-pointer transition-colors ${
                selectedSuggestion === suggestion
                  ? 'border-[#1a73e8] bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
              onClick={() => {
                setSelectedSuggestion(suggestion)
                setCustomReply(suggestion)
              }}
            >
              <p className="text-sm text-slate-700 mb-2" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                {suggestion}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedSuggestion(suggestion)
                    setCustomReply(suggestion)
                  }}
                  className="text-xs text-[#1a73e8] hover:underline font-medium"
                >
                  Use this reply
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom Reply Textarea */}
      <div>
        <label className="text-xs font-medium text-slate-700 mb-2 block" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Your Reply
        </label>
        <textarea
          value={customReply}
          onChange={(e) => setCustomReply(e.target.value)}
          placeholder="Type your reply or select a suggestion above..."
          rows={6}
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8] resize-none"
          style={{ fontFamily: 'var(--font-roboto-stack)' }}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handlePostReply}
          disabled={posting || !customReply.trim()}
          className="flex-1 px-4 py-2 bg-[#1a73e8] text-white rounded-md hover:bg-[#1557b0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: 'var(--font-google-sans)' }}
        >
          {posting ? 'Posting...' : 'Post Reply'}
        </button>
        <button
          onClick={() => onReplyPosted(review.id)}
          className="px-4 py-2 border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50 transition-colors"
          style={{ fontFamily: 'var(--font-google-sans)' }}
        >
          Mark as Resolved
        </button>
      </div>
    </div>
  )
}

