'use client'

import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'

interface Review {
  id: string
  rating: number
  authorName: string
  text: string
  createTime: string
  source: 'google'
  replied: boolean
  sentiment: 'positive' | 'neutral' | 'negative'
  categories: string[]
}

interface LearnTabProps {
  businessLocationId: string
}

export function LearnTab({ businessLocationId }: LearnTabProps) {
  const [reviews, setReviews] = useState<Review[]>([])
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
        console.error('[LearnTab] Failed to fetch reviews:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchReviews()
  }, [businessLocationId])

  // Calculate sentiment breakdown
  const sentimentCounts = {
    positive: reviews.filter((r) => r.sentiment === 'positive').length,
    neutral: reviews.filter((r) => r.sentiment === 'neutral').length,
    negative: reviews.filter((r) => r.sentiment === 'negative').length,
  }
  const totalReviews = reviews.length
  const sentimentData = [
    { name: 'Positive', value: sentimentCounts.positive, color: '#10b981' },
    { name: 'Neutral', value: sentimentCounts.neutral, color: '#6b7280' },
    { name: 'Negative', value: sentimentCounts.negative, color: '#ef4444' },
  ]

  // Calculate top issues (categories from negative reviews)
  const negativeReviews = reviews.filter((r) => r.sentiment === 'negative')
  const categoryCounts: Record<string, number> = {}
  negativeReviews.forEach((review) => {
    review.categories.forEach((cat) => {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
    })
  })
  const topIssues = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }))

  // Calculate trend (negative share over time - last 7 days)
  const now = new Date()
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  
  const trendData: Array<{ date: string; negative: number; total: number; negativeShare: number }> = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    
    const dayReviews = reviews.filter((r) => {
      const reviewDate = new Date(r.createTime).toISOString().split('T')[0]
      return reviewDate === dateStr
    })
    
    const negative = dayReviews.filter((r) => r.sentiment === 'negative').length
    const total = dayReviews.length
    const negativeShare = total > 0 ? (negative / total) * 100 : 0
    
    trendData.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      negative,
      total,
      negativeShare,
    })
  }

  // What's hurting trust (top negative categories)
  const hurtingTrust = topIssues.map((item) => item.category)

  // What's driving praise (top positive categories)
  const positiveReviews = reviews.filter((r) => r.sentiment === 'positive')
  const positiveCategoryCounts: Record<string, number> = {}
  positiveReviews.forEach((review) => {
    review.categories.forEach((cat) => {
      positiveCategoryCounts[cat] = (positiveCategoryCounts[cat] || 0) + 1
    })
  })
  const drivingPraise = Object.entries(positiveCategoryCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([category]) => category)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-500">Loading insights...</div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sentiment Breakdown */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4" style={{ fontFamily: 'var(--font-google-sans)' }}>
          Sentiment Breakdown
        </h3>
        <div className="space-y-3">
          {sentimentData.map((item) => (
            <div key={item.name}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-slate-600" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                  {item.name}
                </span>
                <span className="text-sm font-medium text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
                  {item.value} ({totalReviews > 0 ? Math.round((item.value / totalReviews) * 100) : 0}%)
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${totalReviews > 0 ? (item.value / totalReviews) * 100 : 0}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Issues */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4" style={{ fontFamily: 'var(--font-google-sans)' }}>
          Top Issues
        </h3>
        {topIssues.length > 0 ? (
          <div className="space-y-3">
            {topIssues.map((item, index) => (
              <div key={item.category} className="flex items-center justify-between">
                <span className="text-sm text-slate-700 capitalize" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                  {index + 1}. {item.category}
                </span>
                <span className="text-sm font-medium text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            No issues identified
          </p>
        )}
      </div>

      {/* Trend Chart */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm md:col-span-2">
        <h3 className="text-sm font-semibold text-slate-900 mb-4" style={{ fontFamily: 'var(--font-google-sans)' }}>
          Negative Review Share Trend (Last 7 Days)
        </h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={trendData}>
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6b7280' }} />
            <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
            <Tooltip
              formatter={(value: number) => [`${value.toFixed(1)}%`, 'Negative Share']}
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px' }}
            />
            <Bar dataKey="negativeShare" radius={[4, 4, 0, 0]}>
              {trendData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill="#ef4444" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* What's Hurting Trust */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4" style={{ fontFamily: 'var(--font-google-sans)' }}>
          What's Hurting Trust
        </h3>
        {hurtingTrust.length > 0 ? (
          <ul className="space-y-2">
            {hurtingTrust.map((category) => (
              <li key={category} className="flex items-center gap-2 text-sm text-slate-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                <span className="text-red-500">•</span>
                <span className="capitalize">{category}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            No major issues identified
          </p>
        )}
      </div>

      {/* What's Driving Praise */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900 mb-4" style={{ fontFamily: 'var(--font-google-sans)' }}>
          What's Driving Praise
        </h3>
        {drivingPraise.length > 0 ? (
          <ul className="space-y-2">
            {drivingPraise.map((category) => (
              <li key={category} className="flex items-center gap-2 text-sm text-slate-700" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
                <span className="text-green-500">•</span>
                <span className="capitalize">{category}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500" style={{ fontFamily: 'var(--font-roboto-stack)' }}>
            No positive patterns identified
          </p>
        )}
      </div>
      </div>
    </div>
  )
}

