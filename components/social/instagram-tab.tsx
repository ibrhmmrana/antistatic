'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Database } from '@/lib/supabase/database.types'
import { InstagramOverview } from './instagram/overview'
import { InstagramInbox } from './instagram/inbox'
import { InstagramComments } from './instagram/comments'
import { InstagramContent } from './instagram/content'
import { InstagramInsights } from './instagram/insights'
import { InstagramSettings } from './instagram/settings'

// Instagram connection type (table may not be in generated types yet)
type InstagramConnection = {
  id: string
  business_location_id: string
  access_token: string
  instagram_user_id: string
  instagram_username: string | null
  scopes: string[] | null
  token_expires_at: string | null
  created_at: string
  updated_at: string
} | null

interface InstagramTabProps {
  locationId: string
  instagramConnection: InstagramConnection | null
}

type InstagramSubTab = 'overview' | 'inbox' | 'comments' | 'content' | 'insights' | 'settings'

export function InstagramTab({ locationId, instagramConnection }: InstagramTabProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [activeSubTab, setActiveSubTab] = useState<InstagramSubTab>('overview')
  const [syncing, setSyncing] = useState(false)
  const lastSyncRef = useRef<number>(0)
  const syncInProgressRef = useRef<boolean>(false)
  
  // Use sessionStorage to track if sync has happened in this page load
  const SYNC_KEY = `instagram_sync_${locationId}`

  // Auto-sync when Instagram tab is visited (once per page load)
  // Note: Sync is handled by SocialStudioPage, so we don't need to sync here
  // This prevents double syncing
  useEffect(() => {
    // Sync is handled by parent component (SocialStudioPage)
    // We just need to ensure we're not causing refreshes
  }, [locationId, instagramConnection])

  // Sync sub-tab with URL query param
  useEffect(() => {
    const tabParam = searchParams.get('igTab') as InstagramSubTab | null
    if (tabParam && ['overview', 'inbox', 'comments', 'content', 'insights', 'settings'].includes(tabParam)) {
      setActiveSubTab(tabParam)
    }
  }, [searchParams])

  const handleSubTabChange = (tab: InstagramSubTab) => {
    setActiveSubTab(tab)
    // Update URL without page reload, preserving other params
    const params = new URLSearchParams(searchParams.toString())
    params.set('igTab', tab) // Use 'igTab' to avoid conflict with main tab param
    router.push(`/social?${params.toString()}`, { scroll: false })
  }

  const subTabs: { id: InstagramSubTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'inbox', label: 'Inbox' },
    { id: 'comments', label: 'Comments' },
    { id: 'content', label: 'Content' },
    { id: 'insights', label: 'Insights' },
    { id: 'settings', label: 'Settings' },
  ]

  return (
    <div className="space-y-6">
      {/* Sync indicator */}
      {syncing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
          <span className="text-sm text-blue-800">Syncing Instagram data...</span>
        </div>
      )}

      {/* Sub-tab Navigation */}
      <div className="bg-white rounded-lg border border-slate-200 p-1 sticky top-0 z-10">
        <div className="flex gap-1 overflow-x-auto">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleSubTabChange(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap rounded-md ${
                activeSubTab === tab.id
                  ? 'bg-[#1a73e8] text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              style={{ fontFamily: 'var(--font-google-sans)' }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-tab Content */}
      <div>
        {activeSubTab === 'overview' && (
          <InstagramOverview locationId={locationId} instagramConnection={instagramConnection} />
        )}
        {activeSubTab === 'inbox' && (
          <InstagramInbox locationId={locationId} instagramConnection={instagramConnection} />
        )}
        {activeSubTab === 'comments' && (
          <InstagramComments locationId={locationId} instagramConnection={instagramConnection} />
        )}
        {activeSubTab === 'content' && (
          <InstagramContent locationId={locationId} instagramConnection={instagramConnection} />
        )}
        {activeSubTab === 'insights' && (
          <InstagramInsights locationId={locationId} instagramConnection={instagramConnection} />
        )}
        {activeSubTab === 'settings' && (
          <InstagramSettings locationId={locationId} instagramConnection={instagramConnection} />
        )}
      </div>
    </div>
  )
}
