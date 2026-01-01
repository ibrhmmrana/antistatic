'use client'

import { useState, useEffect, useRef } from 'react'
import { ModuleGate } from '@/components/modules/ModuleGate'
import { ConnectChannelsTab } from './connect-channels-tab'
import { InstagramTab } from './instagram-tab'
import { Database } from '@/lib/supabase/database.types'

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
type ConnectedAccount = Database['public']['Tables']['connected_accounts']['Row']
type ConnectedAccountSelect = Pick<ConnectedAccount, 'provider' | 'status' | 'display_name'>

interface SocialStudioPageProps {
  locationId: string
  connectedAccounts: ConnectedAccountSelect[]
  instagramConnection: InstagramConnection | null
}

export function SocialStudioPage({ locationId, connectedAccounts, instagramConnection }: SocialStudioPageProps) {
  const [activeTab, setActiveTab] = useState<string>('connect')
  const [syncing, setSyncing] = useState(false)
  const lastSyncRef = useRef<number>(0)
  const syncInProgressRef = useRef<boolean>(false)
  const hasSyncedRef = useRef<boolean>(false)

  // Determine which channels are connected
  const isInstagramConnected = !!instagramConnection || connectedAccounts.some(acc => acc.provider === 'instagram')
  const isFacebookConnected = connectedAccounts.some(acc => acc.provider === 'facebook')
  const isLinkedInConnected = connectedAccounts.some(acc => acc.provider === 'linkedin')
  const isTikTokConnected = connectedAccounts.some(acc => acc.provider === 'tiktok')
  const isGoogleConnected = connectedAccounts.some(acc => acc.provider === 'google_gbp')

  // Auto-sync Instagram when page loads (every time page refreshes)
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
            console.error('[Instagram Auto-Sync] JSON parse error:', parseError)
            result = { success: false, error: 'Invalid response from sync endpoint' }
          }
        } else {
          console.error('[Instagram Auto-Sync] Non-JSON response:', rawText.slice(0, 200))
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
        console.error('[Instagram Auto-Sync] Error:', error)
      } finally {
        setSyncing(false)
        syncInProgressRef.current = false
      }
    }

    // Small delay to let page render first
    const timeoutId = setTimeout(performSync, 500)
    return () => clearTimeout(timeoutId)
  }, [locationId, instagramConnection])

  // Build tabs list - always show Connect Channels, then show connected channels
  const tabs = [
    { id: 'connect', label: 'Connect Channels' },
    ...(isInstagramConnected ? [{ id: 'instagram', label: 'Instagram' }] : []),
    ...(isFacebookConnected ? [{ id: 'facebook', label: 'Facebook' }] : []),
    ...(isLinkedInConnected ? [{ id: 'linkedin', label: 'LinkedIn' }] : []),
    ...(isTikTokConnected ? [{ id: 'tiktok', label: 'TikTok' }] : []),
    ...(isGoogleConnected ? [{ id: 'google', label: 'Google Business' }] : []),
  ]

  return (
    <ModuleGate requiredModule="social_studio">
      <div className="h-screen overflow-hidden flex flex-col bg-white -mt-14 md:-mt-16 pt-14 md:pt-16">
        {/* Header + Tabs - Fixed height, no scroll with decorative background */}
        <div className="shrink-0 relative bg-[#F1F3F4] border-b border-slate-200 overflow-hidden">
          {/* Decorative background pattern */}
          <div className="pointer-events-none absolute inset-0 hidden md:block z-0">
            {/* Second quarter - randomized */}
            <div className="absolute left-[32%] top-4 flex flex-col gap-3">
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
            <div className="absolute left-[35%] top-16">
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
            <div className="absolute left-[38%] bottom-2 flex flex-col gap-2">
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
              <h1 className="text-2xl font-semibold text-slate-900" style={{ fontFamily: 'var(--font-google-sans)' }}>
                Social Studio
              </h1>
            </div>
            
            {/* Tabs */}
            <div className="flex gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'text-[#1a73e8] border-b-2 border-[#1a73e8]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  style={{ fontFamily: 'var(--font-google-sans)' }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab Content - Flex-1, fills remaining space, scrolls internally */}
        <div className="flex-1 min-h-0 overflow-hidden bg-white">
          <div className="h-full max-w-7xl mx-auto px-4 sm:px-6 py-6 overflow-y-auto">
            {/* Sync indicator */}
            {syncing && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-sm text-blue-800">Syncing Instagram data...</span>
              </div>
            )}

            {activeTab === 'connect' && <ConnectChannelsTab locationId={locationId} />}
            
            {isInstagramConnected && activeTab === 'instagram' && (
              <InstagramTab
                locationId={locationId}
                instagramConnection={instagramConnection}
              />
            )}

            {isFacebookConnected && activeTab === 'facebook' && (
              <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                <p className="text-slate-500">Facebook management coming soon</p>
              </div>
            )}

            {isLinkedInConnected && activeTab === 'linkedin' && (
              <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                <p className="text-slate-500">LinkedIn management coming soon</p>
              </div>
            )}

            {isTikTokConnected && activeTab === 'tiktok' && (
              <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                <p className="text-slate-500">TikTok management coming soon</p>
              </div>
            )}

            {isGoogleConnected && activeTab === 'google' && (
              <div className="bg-white rounded-lg border border-slate-200 p-8 text-center">
                <p className="text-slate-500">Google Business Profile management coming soon</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModuleGate>
  )
}

