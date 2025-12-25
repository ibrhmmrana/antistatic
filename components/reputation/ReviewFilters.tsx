'use client'

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
}

interface ReviewFiltersProps {
  filters: {
    status: 'all' | 'needs_reply' | 'replied'
    rating: number | null
    sentiment: 'positive' | 'neutral' | 'negative' | null
    categories: string[]
  }
  onFiltersChange: (filters: {
    status: 'all' | 'needs_reply' | 'replied'
    rating: number | null
    sentiment: 'positive' | 'neutral' | 'negative' | null
    categories: string[]
  }) => void
  reviews: Review[]
}

export function ReviewFilters({ filters, onFiltersChange, reviews }: ReviewFiltersProps) {
  // Extract unique categories from reviews
  const allCategories = Array.from(
    new Set(reviews.flatMap((r) => r.categories))
  ).sort()

  const needsReplyCount = reviews.filter((r) => !r.replied).length
  const repliedCount = reviews.filter((r) => r.replied).length

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
        Filters
      </h3>

      {/* Status */}
      <div>
        <label className="text-xs font-medium text-slate-700 mb-2 block" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Status
        </label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="status"
              value="all"
              checked={filters.status === 'all'}
              onChange={() => onFiltersChange({ ...filters, status: 'all' })}
              className="w-4 h-4 text-[#1a73e8]"
            />
            <span className="text-sm text-slate-600">All ({reviews.length})</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="status"
              value="needs_reply"
              checked={filters.status === 'needs_reply'}
              onChange={() => onFiltersChange({ ...filters, status: 'needs_reply' })}
              className="w-4 h-4 text-[#1a73e8]"
            />
            <span className="text-sm text-slate-600">Needs reply ({needsReplyCount})</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="status"
              value="replied"
              checked={filters.status === 'replied'}
              onChange={() => onFiltersChange({ ...filters, status: 'replied' })}
              className="w-4 h-4 text-[#1a73e8]"
            />
            <span className="text-sm text-slate-600">Replied ({repliedCount})</span>
          </label>
        </div>
      </div>

      {/* Rating */}
      <div>
        <label className="text-xs font-medium text-slate-700 mb-2 block" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Rating
        </label>
        <select
          value={filters.rating || ''}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              rating: e.target.value ? parseInt(e.target.value, 10) : null,
            })
          }
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#1a73e8]"
        >
          <option value="">All ratings</option>
          <option value="5">5 stars</option>
          <option value="4">4 stars</option>
          <option value="3">3 stars</option>
          <option value="2">2 stars</option>
          <option value="1">1 star</option>
        </select>
      </div>

      {/* Sentiment */}
      <div>
        <label className="text-xs font-medium text-slate-700 mb-2 block" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
          Sentiment
        </label>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="sentiment"
              value=""
              checked={filters.sentiment === null}
              onChange={() => onFiltersChange({ ...filters, sentiment: null })}
              className="w-4 h-4 text-[#1a73e8]"
            />
            <span className="text-sm text-slate-600">All</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="sentiment"
              value="positive"
              checked={filters.sentiment === 'positive'}
              onChange={() => onFiltersChange({ ...filters, sentiment: 'positive' })}
              className="w-4 h-4 text-[#1a73e8]"
            />
            <span className="text-sm text-slate-600">Positive</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="sentiment"
              value="neutral"
              checked={filters.sentiment === 'neutral'}
              onChange={() => onFiltersChange({ ...filters, sentiment: 'neutral' })}
              className="w-4 h-4 text-[#1a73e8]"
            />
            <span className="text-sm text-slate-600">Neutral</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="sentiment"
              value="negative"
              checked={filters.sentiment === 'negative'}
              onChange={() => onFiltersChange({ ...filters, sentiment: 'negative' })}
              className="w-4 h-4 text-[#1a73e8]"
            />
            <span className="text-sm text-slate-600">Negative</span>
          </label>
        </div>
      </div>

      {/* Categories */}
      {allCategories.length > 0 && (
        <div>
          <label className="text-xs font-medium text-slate-700 mb-2 block" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            Categories
          </label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {allCategories.map((category) => (
              <label key={category} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.categories.includes(category)}
                  onChange={(e) => {
                    const newCategories = e.target.checked
                      ? [...filters.categories, category]
                      : filters.categories.filter((c) => c !== category)
                    onFiltersChange({ ...filters, categories: newCategories })
                  }}
                  className="w-4 h-4 text-[#1a73e8] rounded"
                />
                <span className="text-sm text-slate-600 capitalize">{category}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

