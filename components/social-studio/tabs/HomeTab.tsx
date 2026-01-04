'use client'

import { useRouter } from 'next/navigation'
import { 
  mockCadenceTargets, 
  mockPosts, 
  mockPrescriptionActions, 
  mockServiceCoverage,
  mockObjectiveMetrics,
  getTopPosts,
  getTotalOutcomes
} from '@/lib/social-studio/mock'
import { useToast, ToastContainer } from '@/components/ui/toast'
import Image from 'next/image'

interface HomeTabProps {
  businessLocationId: string
}

export function HomeTab({ businessLocationId }: HomeTabProps) {
  const router = useRouter()
  const { toasts, showToast, removeToast } = useToast()
  const topPosts = getTopPosts(mockPosts, 3)
  const outcomes = getTotalOutcomes(mockObjectiveMetrics)
  const totalScheduled = mockCadenceTargets.reduce((sum, t) => sum + t.scheduledCount, 0)
  const totalTarget = mockCadenceTargets.reduce((sum, t) => sum + t.targetPerWeek, 0)
  const servicesMentioned = mockServiceCoverage.filter(s => s.mentioned).length
  const totalServices = mockServiceCoverage.length

  const handlePrescriptionAction = (action: typeof mockPrescriptionActions[0]) => {
    if (action.deepLink) {
      router.push(action.deepLink)
    }
    showToast(`Action: ${action.title}`, 'info')
  }

  const handleRepurpose = (postId: string) => {
    router.push(`/social-studio?tab=create&repurpose=${postId}`)
    showToast('Opening Create tab with post template', 'info')
  }

  const handleCreateVariation = (postId: string) => {
    router.push(`/social-studio?tab=create&repurpose=${postId}&variation=true`)
    showToast('Creating variation', 'info')
  }

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onClose={removeToast} />
      
      {/* Top Row: 3 Compact Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Cadence Tile */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <div className="text-sm text-slate-600 mb-1">Cadence</div>
          <div className="text-2xl font-bold text-slate-900 mb-1">
            {totalScheduled} / {totalTarget}
          </div>
          <div className="text-xs text-slate-500">posts scheduled</div>
        </div>

        {/* Outcomes Tile */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <div className="text-sm text-slate-600 mb-1">Outcomes</div>
          <div className="text-2xl font-bold text-slate-900 mb-1">
            {outcomes.clicks + outcomes.calls + outcomes.visits}
          </div>
          <div className="text-xs text-slate-500">Clicks + Calls this week</div>
        </div>

        {/* Coverage Tile */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
          <div className="text-sm text-slate-600 mb-1">Coverage</div>
          <div className="text-2xl font-bold text-slate-900 mb-1">
            {servicesMentioned} / {totalServices}
          </div>
          <div className="text-xs text-slate-500">Services mentioned</div>
        </div>
      </div>

      {/* Prescription Card (Big, Prominent) */}
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Recommended Actions</h3>
        <div className="space-y-3">
          {mockPrescriptionActions.map((action) => (
            <div key={action.id} className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-slate-900 mb-1">{action.title}</h4>
                  <p className="text-sm text-slate-600 mb-3">{action.description}</p>
                  <button
                    onClick={() => handlePrescriptionAction(action)}
                    className="px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors"
                  >
                    {action.cta}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Content */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Top Drivers</h3>
        <div className="space-y-4">
          {topPosts.map((post) => (
            <div key={post.id} className="flex items-start gap-4 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
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
                <div className="flex flex-wrap gap-2 mb-2">
                  {post.metrics?.topFormat && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded">
                      Format: {post.metrics.topFormat}
                    </span>
                  )}
                  {post.metrics?.topTopic && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-50 text-green-700 rounded">
                      Topic: {post.metrics.topTopic}
                    </span>
                  )}
                  {post.metrics?.topCTA && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 rounded">
                      CTA: {post.metrics.topCTA}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mb-2 text-sm">
                  <span className="text-slate-600">
                    <span className="font-medium">{post.metrics?.clicks || 0}</span> clicks
                  </span>
                  <span className="text-slate-600">
                    <span className="font-medium">{post.metrics?.calls || 0}</span> calls
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
                    Create variation
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

