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

type InstagramConnection = Database['public']['Tables']['instagram_connections']['Row']

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

  // Auto-sync when Instagram tab is visited (every time, no debounce)
  useEffect(() => {
    if (!instagramConnection) return

    // Skip if sync already in progress
    if (syncInProgressRef.current) {
      return
    }

    const performSync = async () => {
      syncInProgressRef.current = true
      setSyncing(true)

      try {
        const response = await fetch('/api/social/instagram/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationId }),
        })

        // Safe JSON parsing
        const contentType = response.headers.get('content-type') || ''
        const rawText = await response.text()
        let result: any = {}
        
        if (contentType.includes('application/json')) {
          try {
            result = JSON.parse(rawText)
          } catch (parseError) {
            console.error('[Instagram Tab Sync] JSON parse error:', parseError)
            result = { success: false, error: 'Invalid response from sync endpoint' }
          }
        } else {
          console.error('[Instagram Tab Sync] Non-JSON response:', rawText.slice(0, 200))
          result = { success: false, error: 'Unexpected response format' }
        }
        
        if (result.success) {
          lastSyncRef.current = Date.now()
          // Refresh the page data after sync completes
          window.location.reload()
        } else if (result.requiresReconnect) {
          // Token expired - don't retry
          lastSyncRef.current = Date.now()
        }
      } catch (error: any) {
        console.error('[Instagram Tab Sync] Error:', error)
      } finally {
        setSyncing(false)
        syncInProgressRef.current = false
      }
    }

    performSync()
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
