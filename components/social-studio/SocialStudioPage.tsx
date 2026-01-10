'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ModuleGate } from '@/components/modules/ModuleGate'
import { HomeTab } from './tabs/HomeTab'
import { PlannerTab } from './tabs/PlannerTab'
import { CreateTab } from './tabs/CreateTab'
import { InsightsTab } from './tabs/InsightsTab'
import { InboxTab } from './tabs/InboxTab'
import { CommentsTab } from './tabs/CommentsTab'
import { useToast, ToastContainer } from '@/components/ui/toast'
import { getCadenceStatus, mockCadenceTargets } from '@/lib/social-studio/mock'

interface SocialStudioPageProps {
  businessLocationId: string
}

type TabId = 'home' | 'planner' | 'create' | 'insights' | 'library' | 'inbox' | 'comments'

export function SocialStudioPage({ businessLocationId }: SocialStudioPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toasts, showToast, removeToast } = useToast()
  const [activeTab, setActiveTab] = useState<TabId>('home')

  // Sync tab with URL query param
  useEffect(() => {
    const tabParam = searchParams.get('tab') as TabId | null
    if (tabParam && ['home', 'insights', 'planner', 'create', 'inbox', 'comments'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
    // If scheduledAt or postId params are present, ensure we're on create tab
    const scheduledAt = searchParams.get('scheduledAt')
    const postId = searchParams.get('postId')
    if ((scheduledAt || postId) && tabParam !== 'create') {
      setActiveTab('create')
    }
  }, [searchParams])

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab)
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', tab)
    router.push(`/social-studio?${params.toString()}`, { scroll: false })
  }

  const handleAutoFill = () => {
    handleTabChange('planner')
    // Trigger auto-fill action
    setTimeout(() => {
      showToast('Auto-filling next 7 days with posts from queue', 'info')
    }, 100)
  }

  const cadenceStatus = getCadenceStatus(mockCadenceTargets)
  const cadenceStatusLabel = cadenceStatus === 'on_track' ? 'On track' : cadenceStatus === 'ahead' ? 'Ahead' : 'Behind'

  const tabs: { id: TabId; label: string; badge?: string }[] = [
    { id: 'home', label: 'Home' },
    { id: 'insights', label: 'Insights' },
    { id: 'planner', label: 'Planner' },
    { id: 'create', label: 'Create' },
    { id: 'inbox', label: 'Inbox' },
    { id: 'comments', label: 'Comments' },
  ]

  return (
    <ModuleGate requiredModule="social_studio">
      <div className="h-screen overflow-hidden flex flex-col bg-white -mt-14 md:-mt-16 pt-14 md:pt-16">
        {/* Header + Tabs - Fixed height, no scroll with decorative background */}
        <div className="shrink-0 relative bg-[#F1F3F4] border-b border-slate-200 overflow-hidden">
          {/* Decorative background pattern */}
          <div className="pointer-events-none absolute inset-0 hidden md:block z-0">
            {/* Second quarter - randomized */}
            <div className="absolute left-[34%] top-4 flex flex-col gap-3">
              <span
                className="h-7 w-9 bg-[#34A853] opacity-80"
                style={{ borderRadius: '60% 40% 55% 45% / 55% 45% 60% 40%' }}
              />
              <span
                className="h-3 w-5 bg-[#EA4335] opacity-85 translate-x-4"
                style={{ borderRadius: '70% 30% 60% 40% / 60% 40% 40% 60%' }}
              />
            </div>

            {/* Second quarter - circle between blobs */}
            <div className="absolute left-[37%] top-16">
              <svg
                viewBox="0 0 100 100"
                className="h-14 w-14 text-[#34A853] opacity-45"
                aria-hidden="true"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                />
              </svg>
            </div>

            {/* Second quarter - randomized */}
            <div className="absolute left-[40%] bottom-2 flex flex-col gap-2">
              <span
                className="h-4 w-6 bg-[#4285F4] opacity-55"
                style={{ borderRadius: '55% 45% 60% 40% / 50% 50% 45% 55%' }}
              />
              <span
                className="h-3 w-5 bg-[#EA4335] opacity-70 translate-x-3"
                style={{ borderRadius: '65% 35% 50% 50% / 60% 40% 55% 45%' }}
              />
            </div>

            {/* Third quarter - triangle with blobs around it */}
            <div className="absolute left-[58%] top-12">
              <svg
                viewBox="0 0 100 100"
                className="h-16 w-16 text-[#EA4335] opacity-50"
                aria-hidden="true"
              >
                <polygon
                  points="50,10 90,80 10,80"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                />
              </svg>
            </div>

            {/* Blobs around triangle */}
            <div className="absolute left-[54%] top-8">
              <span
                className="h-4 w-6 bg-[#FBBC05] opacity-70"
                style={{ borderRadius: '55% 45% 60% 40% / 50% 50% 45% 55%' }}
              />
            </div>
            <div className="absolute left-[62%] top-10">
              <span
                className="h-3 w-5 bg-[#4285F4] opacity-65"
                style={{ borderRadius: '60% 40% 55% 45% / 50% 50% 60% 40%' }}
              />
            </div>
            <div className="absolute left-[56%] top-20">
              <span
                className="h-5 w-7 bg-[#34A853] opacity-60"
                style={{ borderRadius: '50% 50% 45% 55% / 60% 40% 50% 50%' }}
              />
            </div>
            <div className="absolute left-[60%] top-22">
              <span
                className="h-3 w-4 bg-[#EA4335] opacity-75"
                style={{ borderRadius: '65% 35% 50% 50% / 60% 40% 55% 45%' }}
              />
            </div>

            {/* Fourth quarter - randomized */}
            <div className="absolute left-[72%] top-20 flex gap-2">
              <span
                className="h-5 w-7 bg-[#FBBC05] opacity-75"
                style={{ borderRadius: '50% 50% 45% 55% / 60% 40% 50% 50%' }}
              />
              <span
                className="h-4 w-6 bg-[#34A853] opacity-65 -translate-y-1"
                style={{ borderRadius: '60% 40% 55% 45% / 50% 50% 60% 40%' }}
              />
            </div>

            {/* Middle - moved from top right */}
            <div className="absolute left-[52%] top-2 flex flex-col items-center gap-2">
              <span
                className="h-8 w-11 bg-[#4285F4] opacity-60"
                style={{ borderRadius: '55% 45% 65% 35% / 50% 60% 40% 50%' }}
              />
              <span
                className="h-4 w-6 bg-[#FBBC05] opacity-90 -translate-x-4"
                style={{ borderRadius: '65% 35% 45% 55% / 55% 45% 50% 50%' }}
              />
            </div>

            {/* Middle - moved from top right */}
            <div className="absolute left-[54%] top-16 flex flex-col items-center gap-3">
              <span
                className="h-6 w-9 bg-[#FBBC05] opacity-60"
                style={{ borderRadius: '45% 55% 50% 50% / 55% 45% 60% 40%' }}
              />
            </div>

            {/* Fourth quarter - randomized */}
            <div className="absolute left-[76%] top-16 flex flex-col items-end gap-3">
              <svg
                viewBox="0 0 120 80"
                className="h-20 w-20 text-[#4285F4] opacity-70"
                aria-hidden="true"
              >
                <polygon
                  points="60,5 110,40 60,75 10,40"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />
              </svg>
              <span
                className="h-6 w-8 bg-[#34A853] opacity-90 -translate-y-2 translate-x-3"
                style={{ borderRadius: '50% 60% 45% 55% / 60% 40% 55% 45%' }}
              />
            </div>

            {/* Fourth quarter - randomized */}
            <div className="absolute left-[84%] bottom-2 flex gap-3">
              <span
                className="h-3 w-4 bg-[#EA4335] opacity-70 translate-y-2"
                style={{ borderRadius: '65% 35% 60% 40% / 50% 50% 45% 55%' }}
              />
              <span
                className="h-5 w-7 bg-[#4285F4] opacity-40"
                style={{ borderRadius: '55% 45% 50% 50% / 60% 40% 55% 45%' }}
              />
            </div>
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
                  Social Studio
                </h1>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleTabChange('create')}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                >
                  Auto-fill week
                </button>
                <button
                  onClick={() => router.push('/social?tab=connect')}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
                >
                  Connect
                </button>
                <button
                  onClick={() => handleTabChange('create')}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#1a73e8] rounded-md hover:bg-[#1557b0] transition-colors"
                >
                  Create post
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 flex-wrap">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                    activeTab === tab.id
                      ? 'text-[#1a73e8] border-b-2 border-[#1a73e8]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  style={{ fontFamily: 'var(--font-google-sans)' }}
                >
                  {tab.label}
                  {tab.badge && (
                    <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-slate-200 text-slate-700 rounded-full">
                      {tab.badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab Content - Flex-1, fills remaining space, scrolls internally */}
        <div className="flex-1 min-h-0 overflow-hidden bg-white">
          <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 py-6 overflow-y-auto">
            {activeTab === 'home' && <HomeTab businessLocationId={businessLocationId} />}
            {activeTab === 'insights' && <InsightsTab businessLocationId={businessLocationId} />}
            {activeTab === 'planner' && <PlannerTab businessLocationId={businessLocationId} />}
            {activeTab === 'create' && <CreateTab businessLocationId={businessLocationId} />}
            {activeTab === 'inbox' && <InboxTab businessLocationId={businessLocationId} />}
            {activeTab === 'comments' && <CommentsTab businessLocationId={businessLocationId} />}
          </div>
        </div>
        <ToastContainer toasts={toasts} onClose={removeToast} />
      </div>
    </ModuleGate>
  )
}
