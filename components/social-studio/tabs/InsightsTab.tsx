'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { mockPosts, mockObjectiveMetrics, getPostsByDateRange, getTopPosts } from '@/lib/social-studio/mock'
import { useToast, ToastContainer } from '@/components/ui/toast'
import Image from 'next/image'
import type { Objective, Platform } from '@/lib/social-studio/mock'

interface InsightsTabProps {
  businessLocationId: string
}

export function InsightsTab({ businessLocationId }: InsightsTabProps) {
  const router = useRouter()
  const { toasts, showToast, removeToast } = useToast()
  const [timeRange, setTimeRange] = useState<number>(14)
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | 'all'>('all')
  const [selectedObjective, setSelectedObjective] = useState<Objective | 'all'>('all')

  const posts = getPostsByDateRange(mockPosts, timeRange)
  const topPosts = getTopPosts(posts, 10)

  // Filter posts by platform and objective
  const filteredPosts = posts.filter(p => {
    if (selectedPlatform !== 'all' && !p.variants.some(v => v.platform === selectedPlatform)) {
      return false
    }
    if (selectedObjective !== 'all' && p.objective !== selectedObjective) {
      return false
    }
    return true
  })

  // Calculate outcomes
  const totalClicks = filteredPosts.reduce((sum, p) => sum + (p.metrics?.clicks || 0), 0)
  const totalCalls = filteredPosts.reduce((sum, p) => sum + (p.metrics?.calls || 0), 0)
  const totalVisits = filteredPosts.reduce((sum, p) => sum + (p.metrics?.visits || 0), 0)
  const totalImpressions = filteredPosts.reduce((sum, p) => sum + (p.metrics?.impressions || 0), 0)

  const handleRepurpose = (postId: string) => {
    router.push(`/social-studio?tab=create&repurpose=${postId}`)
    showToast('Opening Create tab with post template', 'info')
  }

  const handleCreateVariation = (postId: string) => {
    router.push(`/social-studio?tab=create&repurpose=${postId}&variation=true`)
    showToast('Creating variation', 'info')
  }

  const handleExperiment = (suggestion: string, pillar?: string) => {
    const params = new URLSearchParams()
    params.set('tab', 'create')
    if (pillar) params.set('pillar', pillar)
    router.push(`/social-studio?${params.toString()}`)
    showToast(`Creating post: ${suggestion}`, 'info')
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {/* Filters */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2">
            {[7, 14, 30, 90].map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  timeRange === days
                    ? 'bg-[#1a73e8] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(['all', 'instagram', 'facebook', 'linkedin', 'google_business'] as const).map((platform) => (
              <button
                key={platform}
                onClick={() => setSelectedPlatform(platform)}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors capitalize ${
                  selectedPlatform === platform
                    ? 'bg-[#1a73e8] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {platform.replace('_', ' ')}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(['all', 'clicks', 'calls', 'visits', 'awareness'] as const).map((objective) => (
              <button
                key={objective}
                onClick={() => setSelectedObjective(objective)}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors capitalize ${
                  selectedObjective === objective
                    ? 'bg-[#1a73e8] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {objective}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Business Outcomes Strip */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Business Outcomes</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-900">{totalClicks}</div>
            <div className="text-sm text-blue-700">Clicks</div>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-900">{totalCalls}</div>
            <div className="text-sm text-green-700">Calls</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-900">{totalVisits}</div>
            <div className="text-sm text-purple-700">Directions</div>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-900">{totalImpressions.toLocaleString()}</div>
            <div className="text-sm text-orange-700">Impressions</div>
          </div>
        </div>
      </div>

      {/* Top Content */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Top Content</h3>
        <div className="space-y-4">
          {topPosts.slice(0, 5).map((post) => (
            <div key={post.id} className="flex items-start gap-4 p-4 border border-slate-200 rounded-lg">
              <div className="relative w-24 h-24 rounded-lg overflow-hidden flex-shrink-0">
                <Image
                  src={post.mediaUrl}
                  alt={post.title}
                  fill
                  className="object-cover"
                  sizes="96px"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-slate-900 mb-1">{post.title}</h4>
                <p className="text-sm text-slate-600 mb-2 line-clamp-2">
                  {post.variants[0]?.caption || post.title}
                </p>
                <div className="flex items-center gap-4 mb-2 text-sm">
                  <span className="text-slate-600">
                    <span className="font-medium">{post.metrics?.clicks || 0}</span> clicks
                  </span>
                  <span className="text-slate-600">
                    <span className="font-medium">{post.metrics?.calls || 0}</span> calls
                  </span>
                  <span className="text-slate-600">
                    <span className="font-medium">{post.metrics?.engagementRate?.toFixed(1) || 0}%</span> engagement
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRepurpose(post.id)}
                    className="px-3 py-1.5 text-sm font-medium text-[#1a73e8] hover:bg-blue-50 rounded transition-colors"
                  >
                    Repurpose
                  </button>
                  <button
                    onClick={() => handleCreateVariation(post.id)}
                    className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                  >
                    Create Variation
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What's Working AI Insight */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">What's Working</h3>
        <div className="space-y-3">
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-green-600 font-bold">Do more:</span>
              <div className="flex-1">
                <p className="text-sm text-slate-700 mb-2">Product launch posts drive 3x more clicks</p>
                <button
                  onClick={() => handleExperiment('Product launch post', 'offer')}
                  className="text-sm font-medium text-[#1a73e8] hover:underline"
                >
                  Create product launch post →
                </button>
              </div>
            </div>
          </div>
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-yellow-600 font-bold">Do less:</span>
              <div className="flex-1">
                <p className="text-sm text-slate-700 mb-2">Generic lifestyle posts have low engagement</p>
                <button
                  onClick={() => handleExperiment('Educational content', 'education')}
                  className="text-sm font-medium text-[#1a73e8] hover:underline"
                >
                  Try educational content instead →
                </button>
              </div>
            </div>
          </div>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-blue-600 font-bold">Next experiment:</span>
              <div className="flex-1">
                <p className="text-sm text-slate-700 mb-2">Test video content for higher engagement</p>
                <button
                  onClick={() => handleExperiment('Video content test', 'culture')}
                  className="text-sm font-medium text-[#1a73e8] hover:underline"
                >
                  Create video post →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

